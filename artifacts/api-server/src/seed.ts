import { db } from "@workspace/db";
import {
  usersTable,
  rolesTable,
  permissionsTable,
  rolePermissionsTable,
  adminProfilesTable,
  sellerProfilesTable,
  countriesTable,
  portsTable,
  currenciesTable,
  settingsTable,
  vehicleBrandsTable,
  vehicleModelsTable,
  vehicleListingsTable,
  vehicleImagesTable,
} from "@workspace/db";
import bcrypt from "bcrypt";
import { eq, sql } from "drizzle-orm";

const SALT_ROUNDS = 12;

async function seed() {
  console.log("🌱 Seeding database...");

  // Seed currencies
  const currencies = [
    { name: "US Dollar", code: "USD", symbol: "$" },
    { name: "Chinese Yuan", code: "CNY", symbol: "¥" },
    { name: "Euro", code: "EUR", symbol: "€" },
    { name: "British Pound", code: "GBP", symbol: "£" },
    { name: "Japanese Yen", code: "JPY", symbol: "¥" },
    { name: "Australian Dollar", code: "AUD", symbol: "A$" },
    { name: "Canadian Dollar", code: "CAD", symbol: "C$" },
    { name: "Swiss Franc", code: "CHF", symbol: "Fr" },
    { name: "Hong Kong Dollar", code: "HKD", symbol: "HK$" },
    { name: "Singapore Dollar", code: "SGD", symbol: "S$" },
  ];

  for (const currency of currencies) {
    await db.insert(currenciesTable).values(currency).onConflictDoNothing();
  }
  console.log("✅ Currencies seeded");

  // Seed countries
  const countriesData = [
    { name: "China", code: "CN", region: "Asia" },
    { name: "United States", code: "US", region: "North America" },
    { name: "United Kingdom", code: "GB", region: "Europe" },
    { name: "Germany", code: "DE", region: "Europe" },
    { name: "France", code: "FR", region: "Europe" },
    { name: "Japan", code: "JP", region: "Asia" },
    { name: "South Korea", code: "KR", region: "Asia" },
    { name: "Australia", code: "AU", region: "Oceania" },
    { name: "Canada", code: "CA", region: "North America" },
    { name: "Brazil", code: "BR", region: "South America" },
    { name: "Mexico", code: "MX", region: "North America" },
    { name: "India", code: "IN", region: "Asia" },
    { name: "Russia", code: "RU", region: "Europe/Asia" },
    { name: "South Africa", code: "ZA", region: "Africa" },
    { name: "Nigeria", code: "NG", region: "Africa" },
    { name: "Kenya", code: "KE", region: "Africa" },
    { name: "Egypt", code: "EG", region: "Africa" },
    { name: "UAE", code: "AE", region: "Middle East" },
    { name: "Saudi Arabia", code: "SA", region: "Middle East" },
    { name: "Qatar", code: "QA", region: "Middle East" },
    { name: "Singapore", code: "SG", region: "Asia" },
    { name: "Malaysia", code: "MY", region: "Asia" },
    { name: "Thailand", code: "TH", region: "Asia" },
    { name: "Vietnam", code: "VN", region: "Asia" },
    { name: "Indonesia", code: "ID", region: "Asia" },
    { name: "Philippines", code: "PH", region: "Asia" },
    { name: "Pakistan", code: "PK", region: "Asia" },
    { name: "Bangladesh", code: "BD", region: "Asia" },
    { name: "Sri Lanka", code: "LK", region: "Asia" },
    { name: "New Zealand", code: "NZ", region: "Oceania" },
    { name: "Chile", code: "CL", region: "South America" },
    { name: "Argentina", code: "AR", region: "South America" },
    { name: "Colombia", code: "CO", region: "South America" },
    { name: "Peru", code: "PE", region: "South America" },
    { name: "Ghana", code: "GH", region: "Africa" },
    { name: "Tanzania", code: "TZ", region: "Africa" },
    { name: "Ethiopia", code: "ET", region: "Africa" },
    { name: "Morocco", code: "MA", region: "Africa" },
    { name: "Angola", code: "AO", region: "Africa" },
    { name: "Mozambique", code: "MZ", region: "Africa" },
    { name: "Zambia", code: "ZM", region: "Africa" },
    { name: "Zimbabwe", code: "ZW", region: "Africa" },
    { name: "Uganda", code: "UG", region: "Africa" },
    { name: "Senegal", code: "SN", region: "Africa" },
    { name: "Ivory Coast", code: "CI", region: "Africa" },
    { name: "Cameroon", code: "CM", region: "Africa" },
    { name: "Jordan", code: "JO", region: "Middle East" },
    { name: "Iraq", code: "IQ", region: "Middle East" },
    { name: "Kazakhstan", code: "KZ", region: "Central Asia" },
    { name: "Uzbekistan", code: "UZ", region: "Central Asia" },
  ];

  for (const country of countriesData) {
    await db.insert(countriesTable).values(country).onConflictDoNothing();
  }
  console.log("✅ Countries seeded");

  // Get China's ID for ports
  const [china] = await db.select().from(countriesTable).where(eq(countriesTable.code, "CN")).limit(1);

  // Seed major Chinese ports
  const portsData = [
    { name: "Port of Shanghai", code: "CNSHA", countryId: china?.id, city: "Shanghai", portType: "sea" },
    { name: "Port of Guangzhou (Nansha)", code: "CNGGZ", countryId: china?.id, city: "Guangzhou", portType: "sea" },
    { name: "Port of Tianjin", code: "CNTSN", countryId: china?.id, city: "Tianjin", portType: "sea" },
    { name: "Port of Shenzhen (Yantian)", code: "CNSZX", countryId: china?.id, city: "Shenzhen", portType: "sea" },
    { name: "Port of Ningbo-Zhoushan", code: "CNNBO", countryId: china?.id, city: "Ningbo", portType: "sea" },
    { name: "Port of Qingdao", code: "CNTAO", countryId: china?.id, city: "Qingdao", portType: "sea" },
    { name: "Port of Xiamen", code: "CNXMN", countryId: china?.id, city: "Xiamen", portType: "sea" },
    { name: "Port of Dalian", code: "CNDLC", countryId: china?.id, city: "Dalian", portType: "sea" },
    { name: "Port of Wuhan", code: "CNWUH", countryId: china?.id, city: "Wuhan", portType: "river" },
    { name: "Port of Chongqing", code: "CNCKM", countryId: china?.id, city: "Chongqing", portType: "river" },
  ];

  for (const port of portsData) {
    if (port.countryId) {
      await db.insert(portsTable).values(port).onConflictDoNothing();
    }
  }
  console.log("✅ Ports seeded");

  // Seed roles
  const rolesData = [
    { name: "super_admin", description: "Super Administrator with full system access" },
    { name: "admin", description: "Administrator with permission-based access" },
    { name: "seller", description: "Chinese vehicle dealer" },
    { name: "buyer", description: "International vehicle buyer" },
    { name: "freight_forwarder", description: "Logistics and freight forwarding company" },
  ];

  const roleMap: Record<string, string> = {};
  for (const role of rolesData) {
    const existing = await db.select().from(rolesTable).where(eq(rolesTable.name, role.name)).limit(1);
    if (existing.length > 0) {
      roleMap[role.name] = existing[0].id;
    } else {
      const [created] = await db.insert(rolesTable).values(role).returning();
      roleMap[role.name] = created.id;
    }
  }
  console.log("✅ Roles seeded");

  // Seed permissions
  const permissionsData = [
    // Legacy permission names (kept for backwards-compatibility)
    { name: "seller:manage", module: "sellers", action: "manage", description: "Manage seller accounts" },
    { name: "buyer:manage", module: "buyers", action: "manage", description: "Manage buyer accounts" },
    { name: "freight:manage", module: "freight", action: "manage", description: "Manage freight forwarder accounts" },
    { name: "vehicle:moderate", module: "vehicles", action: "moderate", description: "Moderate vehicle listings" },
    { name: "order:moderate", module: "orders", action: "moderate", description: "Moderate orders" },
    { name: "payment:verify", module: "payments", action: "verify", description: "Verify payment submissions" },
    { name: "content:manage", module: "content", action: "manage", description: "Manage content" },
    { name: "support:manage", module: "support", action: "manage", description: "Handle customer support" },
    { name: "analytics:view", module: "analytics", action: "view", description: "View analytics and reports" },
    { name: "audit:view", module: "audit", action: "view", description: "View audit logs" },
    { name: "settings:manage", module: "settings", action: "manage", description: "Manage platform settings" },
    { name: "commission:manage", module: "commission", action: "manage", description: "Manage commission rules" },
    // New admin-portal permission namespace
    { name: "manage_users", module: "users", action: "manage", description: "Manage all platform users" },
    { name: "manage_listings", module: "listings", action: "manage", description: "Manage and moderate vehicle listings" },
    { name: "manage_orders", module: "orders", action: "manage", description: "Manage orders" },
    { name: "manage_payments", module: "payments", action: "manage", description: "Manage and verify payments" },
    { name: "manage_shipments", module: "shipments", action: "manage", description: "Manage shipments" },
    { name: "view_analytics", module: "analytics", action: "view", description: "View analytics dashboard and stats" },
    { name: "manage_settings", module: "settings", action: "manage", description: "Manage platform settings and reference data" },
    { name: "manage_commissions", module: "commission", action: "manage", description: "Manage commission rules" },
    { name: "manage_admins", module: "admins", action: "manage", description: "Manage admin accounts" },
    { name: "view_audit_logs", module: "audit", action: "view", description: "View audit logs" },
    { name: "manage_quotations", module: "quotations", action: "manage", description: "View and monitor quotations across the platform" },
    { name: "order_management", module: "orders", action: "manage", description: "Full access to view, search, filter and update orders" },
    { name: "commission_management", module: "commission", action: "view", description: "View platform commission information on quotations and orders" },
    { name: "commission_assignment", module: "commission", action: "assign", description: "Assign commission rules to vehicle listings and approve them for publishing" },
    { name: "messages_management", module: "messaging", action: "access", description: "Access and participate in admin internal messaging system" },
    { name: "manage_mailboxes", module: "mailboxes", action: "manage", description: "Create, edit, and delete AgentMail email inboxes" },
  ];

  const permissionIds: string[] = [];
  for (const perm of permissionsData) {
    const existing = await db.select().from(permissionsTable).where(eq(permissionsTable.name, perm.name)).limit(1);
    if (existing.length > 0) {
      permissionIds.push(existing[0].id);
    } else {
      const [created] = await db.insert(permissionsTable).values(perm).returning();
      permissionIds.push(created.id);
    }
  }
  console.log("✅ Permissions seeded");

  // Seed role_permissions: map admin role to READ-ONLY permissions only.
  // super_admin bypasses permission checks entirely (no DB entries needed).
  // manage_* permissions are intentionally NOT granted to the admin role by default
  // — they must be explicitly granted per-user by super_admin so that granular
  // role-based access control remains meaningful.
  // seller/buyer/freight_forwarder have no admin permissions.
  const adminPermissionNames = [
    // Legacy read/view permissions
    "analytics:view",
    "audit:view",
    // New admin-portal view permissions
    "view_analytics",
    "view_audit_logs",
  ];

  const adminRoleId = roleMap["admin"];
  if (adminRoleId) {
    for (const permName of adminPermissionNames) {
      const perm = await db.select().from(permissionsTable).where(eq(permissionsTable.name, permName)).limit(1);
      if (perm.length > 0) {
        await db
          .insert(rolePermissionsTable)
          .values({ roleId: adminRoleId, permissionId: perm[0].id })
          .onConflictDoNothing();
      }
    }
  }
  console.log("✅ Role permissions seeded");

  // Seed platform settings
  const settingsData = [
    { key: "platform_name", value: "AutoCango", description: "Platform display name" },
    { key: "platform_commission_default", value: "3.5", description: "Default commission percentage" },
    { key: "platform_currency_default", value: "USD", description: "Default display currency" },
    { key: "contact_protection_enabled", value: "true", description: "Enable contact info filtering" },
    { key: "max_vehicle_photos", value: "20", description: "Maximum photos per vehicle listing" },
    { key: "max_vehicle_videos", value: "3", description: "Maximum videos per vehicle listing" },
  ];

  for (const setting of settingsData) {
    await db.insert(settingsTable).values(setting).onConflictDoNothing();
  }
  console.log("✅ Settings seeded");

  // Seed Super Admin user
  const superAdminEmail = "admin@autocango.com";
  const existing = await db.select().from(usersTable).where(eq(usersTable.email, superAdminEmail)).limit(1);

  if (existing.length === 0) {
    const passwordHash = await bcrypt.hash("SuperAdmin123!", SALT_ROUNDS);
    const [superAdmin] = await db.insert(usersTable).values({
      email: superAdminEmail,
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

    console.log("✅ Super Admin seeded (email: admin@autocango.com, password: SuperAdmin123!)");
  } else {
    console.log("ℹ️  Super Admin already exists, skipping");
  }

  // Seed sample seller
  const sellerEmail = "seller@example.com";
  const existingSeller = await db.select().from(usersTable).where(eq(usersTable.email, sellerEmail)).limit(1);
  if (existingSeller.length === 0) {
    const passwordHash = await bcrypt.hash("Seller123!", SALT_ROUNDS);
    await db.insert(usersTable).values({
      email: sellerEmail,
      passwordHash,
      role: "seller",
      firstName: "Zhang",
      lastName: "Wei",
      isActive: true,
      isEmailVerified: true,
    });
    console.log("✅ Sample Seller seeded (email: seller@example.com, password: Seller123!)");
  }

  // Seed sample buyer
  const buyerEmail = "buyer@example.com";
  const existingBuyer = await db.select().from(usersTable).where(eq(usersTable.email, buyerEmail)).limit(1);
  if (existingBuyer.length === 0) {
    const passwordHash = await bcrypt.hash("Buyer123!", SALT_ROUNDS);
    await db.insert(usersTable).values({
      email: buyerEmail,
      passwordHash,
      role: "buyer",
      firstName: "John",
      lastName: "Smith",
      country: "US",
      isActive: true,
      isEmailVerified: true,
    });
    console.log("✅ Sample Buyer seeded (email: buyer@example.com, password: Buyer123!)");
  }

  // Seed vehicle brands
  const brandsData = [
    { name: "BYD", countryOfOrigin: "China" },
    { name: "Geely", countryOfOrigin: "China" },
    { name: "SAIC Motor", countryOfOrigin: "China" },
    { name: "Chery", countryOfOrigin: "China" },
    { name: "Great Wall Motors", countryOfOrigin: "China" },
    { name: "NIO", countryOfOrigin: "China" },
    { name: "Xpeng", countryOfOrigin: "China" },
    { name: "Li Auto", countryOfOrigin: "China" },
    { name: "BAIC", countryOfOrigin: "China" },
    { name: "FAW", countryOfOrigin: "China" },
    { name: "Dongfeng", countryOfOrigin: "China" },
    { name: "SAIC Roewe", countryOfOrigin: "China" },
    { name: "MG Motor", countryOfOrigin: "China" },
    { name: "Haval", countryOfOrigin: "China" },
    { name: "Wuling", countryOfOrigin: "China" },
    { name: "Zeekr", countryOfOrigin: "China" },
    { name: "Voyah", countryOfOrigin: "China" },
    { name: "Deepal", countryOfOrigin: "China" },
    { name: "AITO", countryOfOrigin: "China" },
    { name: "Avatr", countryOfOrigin: "China" },
    { name: "Toyota", countryOfOrigin: "Japan" },
    { name: "Honda", countryOfOrigin: "Japan" },
    { name: "Nissan", countryOfOrigin: "Japan" },
    { name: "Volkswagen", countryOfOrigin: "Germany" },
    { name: "BMW", countryOfOrigin: "Germany" },
    { name: "Mercedes-Benz", countryOfOrigin: "Germany" },
    { name: "Hyundai", countryOfOrigin: "South Korea" },
    { name: "Kia", countryOfOrigin: "South Korea" },
    { name: "Tesla", countryOfOrigin: "United States" },
    { name: "Ford", countryOfOrigin: "United States" },
  ];

  const brandIdMap: Record<string, string> = {};
  for (const brand of brandsData) {
    const [b] = await db
      .insert(vehicleBrandsTable)
      .values(brand)
      .onConflictDoNothing()
      .returning();
    if (b) brandIdMap[brand.name] = b.id;
    else {
      const [existing] = await db.select().from(vehicleBrandsTable).where(eq(vehicleBrandsTable.name, brand.name)).limit(1);
      if (existing) brandIdMap[brand.name] = existing.id;
    }
  }
  console.log("✅ Vehicle brands seeded");

  // Seed vehicle models
  const modelsData: Array<{ brand: string; models: string[] }> = [
    { brand: "BYD", models: ["Han", "Tang", "Song Plus", "Song Pro", "Atto 3", "Seal", "Dolphin", "Seagull", "Yuan Plus", "Destroyer 05"] },
    { brand: "Geely", models: ["Emgrand", "Coolray", "Azkarra", "Monjaro", "Preface", "Xingyue L", "Star L", "Panda Mini"] },
    { brand: "NIO", models: ["ET5", "ET7", "ES6", "ES7", "ES8", "EC6", "ET5T", "EL6"] },
    { brand: "Xpeng", models: ["P5", "P7", "G3", "G6", "G9", "X9"] },
    { brand: "Li Auto", models: ["L6", "L7", "L8", "L9", "MEGA"] },
    { brand: "Great Wall Motors", models: ["Poer", "Cannon", "Pao", "Haval H6", "Tank 300", "Tank 400", "Tank 500"] },
    { brand: "Haval", models: ["H1", "H2", "H4", "H6", "H9", "Jolion", "Dargo"] },
    { brand: "Chery", models: ["Tiggo 4", "Tiggo 7 Pro", "Tiggo 8 Pro", "Arrizo 5", "Arrizo 6", "Omoda 5"] },
    { brand: "MG Motor", models: ["MG3", "MG5", "MG6", "ZS", "HS", "Marvel R", "Cyberster"] },
    { brand: "Zeekr", models: ["001", "007", "009", "X"] },
    { brand: "Wuling", models: ["Mini EV", "Almaz", "Cortez", "Air EV"] },
    { brand: "Toyota", models: ["Camry", "Corolla", "RAV4", "Land Cruiser", "Hilux", "bZ4X"] },
    { brand: "Volkswagen", models: ["Passat", "Tiguan", "Golf", "ID.4", "ID.6", "T-Roc"] },
  ];

  for (const { brand, models } of modelsData) {
    const brandId = brandIdMap[brand];
    if (!brandId) continue;
    for (const modelName of models) {
      await db
        .insert(vehicleModelsTable)
        .values({ brandId, name: modelName })
        .onConflictDoNothing();
    }
  }
  console.log("✅ Vehicle models seeded");

  // Seed sample vehicle listings for the test seller
  const [testSeller] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.email, "seller@example.com")).limit(1);
  const [shanghaPort] = await db.select({ id: portsTable.id }).from(portsTable).where(eq(portsTable.code, "CNSHA")).limit(1);

  if (testSeller) {
    const sampleListings = [
      {
        sellerId: testSeller.id,
        brandName: "BYD",
        modelName: "Han",
        year: 2024,
        fuelType: "electric" as const,
        transmission: "automatic" as const,
        driveType: "rwd" as const,
        batteryCapacityKwh: "85.4",
        rangeKm: 605,
        exteriorColor: "Titanium Silver",
        interiorColor: "Black",
        mileageKm: 0,
        condition: "new" as const,
        quantity: 5,
        fobPriceUsd: "32500.00",
        description: "2024 BYD Han EV - The flagship sedan from BYD featuring a 605km range (CLTC). Comes with blade battery technology, advanced OTA updates, and luxurious interior appointments.",
        status: "published" as const,
        originPortId: shanghaPort?.id,
      },
      {
        sellerId: testSeller.id,
        brandName: "NIO",
        modelName: "ET5",
        year: 2024,
        fuelType: "electric" as const,
        transmission: "automatic" as const,
        driveType: "awd" as const,
        batteryCapacityKwh: "75.0",
        rangeKm: 550,
        exteriorColor: "Black Pearl",
        interiorColor: "White",
        mileageKm: 0,
        condition: "new" as const,
        quantity: 3,
        fobPriceUsd: "38900.00",
        description: "2024 NIO ET5 - Premium electric sedan with battery swap capability. Features NIO Pilot driver assistance system and 550km WLTP range.",
        status: "published" as const,
        originPortId: shanghaPort?.id,
      },
      {
        sellerId: testSeller.id,
        brandName: "BYD",
        modelName: "Seal",
        year: 2024,
        fuelType: "electric" as const,
        transmission: "automatic" as const,
        driveType: "awd" as const,
        batteryCapacityKwh: "82.56",
        rangeKm: 570,
        exteriorColor: "Aurora Blue",
        interiorColor: "Brown",
        mileageKm: 0,
        condition: "new" as const,
        quantity: 8,
        fobPriceUsd: "29800.00",
        description: "2024 BYD Seal AWD Performance - BYD's sports sedan with 570hp equivalent performance and stunning design. Ready for export.",
        status: "published" as const,
        originPortId: shanghaPort?.id,
      },
      {
        sellerId: testSeller.id,
        brandName: "Xpeng",
        modelName: "G6",
        year: 2024,
        fuelType: "electric" as const,
        transmission: "automatic" as const,
        driveType: "rwd" as const,
        batteryCapacityKwh: "87.5",
        rangeKm: 755,
        exteriorColor: "White",
        interiorColor: "Grey",
        mileageKm: 0,
        condition: "new" as const,
        quantity: 4,
        fobPriceUsd: "31200.00",
        description: "2024 Xpeng G6 - Smart SUV with 800V ultra-fast charging and 755km CLTC range. Equipped with XNGP intelligent driving system.",
        status: "pending_review" as const,
        originPortId: shanghaPort?.id,
      },
      {
        sellerId: testSeller.id,
        brandName: "Haval",
        modelName: "H6",
        year: 2023,
        fuelType: "hybrid" as const,
        transmission: "dct" as const,
        driveType: "fwd" as const,
        engineSizeL: "1.5",
        exteriorColor: "Red",
        interiorColor: "Black",
        mileageKm: 12000,
        condition: "used" as const,
        quantity: 2,
        fobPriceUsd: "18500.00",
        description: "2023 Haval H6 Hybrid - China's best-selling SUV. Well maintained with full service history. Excellent fuel economy.",
        status: "draft" as const,
        originPortId: shanghaPort?.id,
      },
    ];

    const existingCount = await db
      .select({ count: sql<number>`count(*)` })
      .from(vehicleListingsTable)
      .where(eq(vehicleListingsTable.sellerId, testSeller.id));
    if (Number(existingCount[0]?.count ?? 0) === 0) {
      await db.insert(vehicleListingsTable).values(sampleListings);
    }
    console.log("✅ Sample vehicle listings seeded");
  }

  console.log("\n🎉 Database seeding complete!");
  process.exit(0);
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
