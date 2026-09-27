import { createServer } from "http";
import app from "./app";
import { initSocketServer } from "./lib/socket";
import { logger } from "./lib/logger";
import { db } from "@workspace/db";
import { usersTable, adminProfilesTable } from "@workspace/db/schema";
import { sql, eq } from "drizzle-orm";
import bcrypt from "bcrypt";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

async function initDb() {
  await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS wechat_open_id TEXT UNIQUE`);
  await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS google_sub TEXT UNIQUE`);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TIMESTAMP NOT NULL,
      used_at TIMESTAMP NULL,
      created_at TIMESTAMP NOT NULL DEFAULT now()
    )
  `);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS password_reset_tokens_user_idx ON password_reset_tokens(user_id)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS password_reset_tokens_expires_idx ON password_reset_tokens(expires_at)`);
  logger.info("DB init: password reset tokens table ensured");
  // 1. Add order_number column if it doesn't already exist
  await db.execute(sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS order_number TEXT`);

  // 2. Add UNIQUE constraint on order_number if it doesn't already exist
  await db.execute(sql`
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'orders_order_number_unique' AND conrelid = 'orders'::regclass
      ) THEN
        ALTER TABLE orders ADD CONSTRAINT orders_order_number_unique UNIQUE (order_number);
      END IF;
    END $$
  `);

  // 3. Extend order_status enum with new values (idempotent — IF NOT EXISTS prevents duplicates)
  for (const val of [
    'payment_received', 'seller_payment', 'documents_preparation',
    'booking_shipping', 'arrived',
  ] as const) {
    try {
      await db.execute(sql.raw(`ALTER TYPE order_status ADD VALUE IF NOT EXISTS '${val}'`));
    } catch {
      // Value already exists in enum — safe to ignore
    }
  }
  logger.info("DB init: order_status enum extended");

  // 4. Ensure the order number sequence exists
  await db.execute(sql`
    CREATE SEQUENCE IF NOT EXISTS order_number_seq
      START WITH 1 MINVALUE 1 INCREMENT BY 1 NO MAXVALUE
  `);
  logger.info("DB init: order_number_seq ensured");

  // 5. Backfill any orders that are missing an order_number
  await db.execute(sql`
    UPDATE orders
    SET order_number = 'ORD-' || EXTRACT(YEAR FROM created_at)::TEXT
      || '-' || LPAD(nextval('order_number_seq')::TEXT, 6, '0')
    WHERE order_number IS NULL
  `);
  logger.info("DB init: order_number backfill complete");

  // 6. Add commission columns to vehicle_listings
  await db.execute(sql`ALTER TABLE vehicle_listings ADD COLUMN IF NOT EXISTS commission_rule_id UUID`);
  await db.execute(sql`ALTER TABLE vehicle_listings ADD COLUMN IF NOT EXISTS commission_type TEXT`);
  await db.execute(sql`ALTER TABLE vehicle_listings ADD COLUMN IF NOT EXISTS commission_value NUMERIC(14,4)`);
  await db.execute(sql`ALTER TABLE vehicle_listings ADD COLUMN IF NOT EXISTS commission_snapshot JSONB`);
  logger.info("DB init: vehicle commission columns ensured");

  // 7. Add commission columns to quotations
  await db.execute(sql`ALTER TABLE quotations ADD COLUMN IF NOT EXISTS commission_rule_id UUID`);
  await db.execute(sql`ALTER TABLE quotations ADD COLUMN IF NOT EXISTS commission_type TEXT`);
  await db.execute(sql`ALTER TABLE quotations ADD COLUMN IF NOT EXISTS commission_value NUMERIC(14,4)`);
  await db.execute(sql`ALTER TABLE quotations ADD COLUMN IF NOT EXISTS commission_amount_usd NUMERIC(14,2)`);
  logger.info("DB init: quotation commission columns ensured");

  // 8. Add commission columns to orders
  await db.execute(sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS commission_rule_id UUID`);
  await db.execute(sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS commission_type TEXT`);
  await db.execute(sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS commission_value NUMERIC(14,4)`);
  await db.execute(sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS commission_amount_usd NUMERIC(14,2)`);
  logger.info("DB init: order commission columns ensured");

  // 9. Order documents metadata — files are stored in private object storage.
  // Keep this idempotent so fresh environments and upgrades both initialize it.
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS order_documents (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      file_name TEXT NOT NULL,
      object_path TEXT NOT NULL,
      document_type TEXT NOT NULL DEFAULT 'other',
      content_type TEXT,
      size_bytes INTEGER,
      uploaded_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS order_documents_order_idx ON order_documents(order_id)`);
  logger.info("DB init: order documents table ensured");

  // 9. Quotation number sequence + column (QT-YYYY-XXXXXX)
  await db.execute(sql`
    CREATE SEQUENCE IF NOT EXISTS quotation_number_seq
      START WITH 1 MINVALUE 1 INCREMENT BY 1 NO MAXVALUE
  `);
  logger.info("DB init: quotation_number_seq ensured");
  await db.execute(sql`ALTER TABLE quotations ADD COLUMN IF NOT EXISTS quotation_number TEXT`);
  await db.execute(sql`
    UPDATE quotations
    SET quotation_number = 'QT-' || EXTRACT(YEAR FROM created_at)::TEXT
      || '-' || LPAD(nextval('quotation_number_seq')::TEXT, 6, '0')
    WHERE quotation_number IS NULL
  `);
  logger.info("DB init: quotation_number backfill complete");

  // 10. Admin internal messaging tables
  await db.execute(sql`
    DO $$ BEGIN
      CREATE TYPE admin_conv_reference_type AS ENUM ('vehicle','quotation','order','shipment','payment','general');
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$
  `);
  await db.execute(sql`
    DO $$ BEGIN
      CREATE TYPE admin_conv_status AS ENUM ('open','resolved','archived');
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$
  `);
  // Drop old reads helper table if it exists from a prior migration
  await db.execute(sql`DROP TABLE IF EXISTS admin_message_reads`);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS admin_conversations (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      subject TEXT NOT NULL,
      reference_type admin_conv_reference_type NOT NULL DEFAULT 'general',
      reference_id UUID,
      reference_number TEXT,
      initiator_id UUID NOT NULL REFERENCES users(id),
      recipient_id UUID NOT NULL REFERENCES users(id),
      status admin_conv_status NOT NULL DEFAULT 'open',
      is_archived_by_initiator BOOLEAN NOT NULL DEFAULT false,
      is_archived_by_recipient BOOLEAN NOT NULL DEFAULT false,
      last_message_at TIMESTAMPTZ,
      resolved_by_id UUID REFERENCES users(id),
      resolved_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  // Idempotent column additions for fresh upgrades from prior schema
  await db.execute(sql`ALTER TABLE admin_conversations ADD COLUMN IF NOT EXISTS initiator_id UUID REFERENCES users(id)`);
  await db.execute(sql`ALTER TABLE admin_conversations ADD COLUMN IF NOT EXISTS recipient_id UUID REFERENCES users(id)`);
  await db.execute(sql`ALTER TABLE admin_conversations ADD COLUMN IF NOT EXISTS is_archived_by_initiator BOOLEAN NOT NULL DEFAULT false`);
  await db.execute(sql`ALTER TABLE admin_conversations ADD COLUMN IF NOT EXISTS is_archived_by_recipient BOOLEAN NOT NULL DEFAULT false`);
  await db.execute(sql`ALTER TABLE admin_conversations ADD COLUMN IF NOT EXISTS last_message_at TIMESTAMPTZ`);
  // Backfill initiator_id from created_by_id only if that legacy column still exists
  await db.execute(sql`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'admin_conversations' AND column_name = 'created_by_id'
      ) THEN
        UPDATE admin_conversations
          SET initiator_id = created_by_id
          WHERE initiator_id IS NULL AND created_by_id IS NOT NULL;
        EXECUTE 'ALTER TABLE admin_conversations ALTER COLUMN created_by_id DROP NOT NULL';
        EXECUTE 'ALTER TABLE admin_conversations ALTER COLUMN created_by_id SET DEFAULT NULL';
      END IF;
    END
    $$
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS admin_messages (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      conversation_id UUID NOT NULL REFERENCES admin_conversations(id) ON DELETE CASCADE,
      sender_id UUID NOT NULL REFERENCES users(id),
      body TEXT NOT NULL,
      is_read BOOLEAN NOT NULL DEFAULT false,
      read_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await db.execute(sql`ALTER TABLE admin_messages ADD COLUMN IF NOT EXISTS is_read BOOLEAN NOT NULL DEFAULT false`);
  await db.execute(sql`ALTER TABLE admin_messages ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS admin_messages_conv_idx ON admin_messages(conversation_id)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS admin_messages_sender_idx ON admin_messages(sender_id)`);
  logger.info("DB init: admin messaging tables ensured");

  // 10. Seed messages_management permission (idempotent)
  await db.execute(sql`
    INSERT INTO permissions (name, module, action, description)
    VALUES ('messages_management', 'messaging', 'access', 'Access and participate in admin internal messaging system')
    ON CONFLICT (name) DO NOTHING
  `);
  logger.info("DB init: messages_management permission ensured");

  // Auto-seed super_admin if none exists (runs on every startup; idempotent)
  const existing = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.role, "super_admin"))
    .limit(1);

  if (existing.length === 0) {
    const passwordHash = await bcrypt.hash("SuperAdmin123!", 12);
    const [superAdmin] = await db.insert(usersTable).values({
      email: "admin@nextcarmarket.com",
      passwordHash,
      role: "super_admin",
      firstName: "Super",
      lastName: "Admin",
      isActive: true,
      isEmailVerified: true,
    }).returning();
    await db.insert(adminProfilesTable).values({
      userId: superAdmin.id,
      department: "Management",
    });
    logger.info("DB init: super_admin seeded (admin@nextcarmarket.com)");
  } else {
    logger.info("DB init: super_admin already exists, skipping seed");
  }
}

const httpServer = createServer(app);
initSocketServer(httpServer);

initDb()
  .then(() => {
    httpServer.listen(port, () => {
      logger.info({ port }, "Server listening with Socket.io");
    });
  })
  .catch((err) => {
    logger.error({ err }, "DB init failed — aborting startup");
    process.exit(1);
  });
