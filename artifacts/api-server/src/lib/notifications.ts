import { db, notificationsTable } from "@workspace/db";
import { emitToUser } from "./socket";
import type { NotificationType } from "../types/notification";

export async function createNotification({
  userId,
  type,
  title,
  body,
  conversationId,
  vehicleId,
}: {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  conversationId?: string;
  vehicleId?: string;
}): Promise<void> {
  const [notification] = await db
    .insert(notificationsTable)
    .values({
      userId,
      type,
      title,
      body,
      conversationId: conversationId ?? null,
      vehicleId: vehicleId ?? null,
    })
    .returning();

  // Emit real-time notification event to the target user
  emitToUser(userId, "notification:new", {
    id: notification.id,
    type: notification.type,
    title: notification.title,
    body: notification.body,
    conversationId: notification.conversationId,
    vehicleId: notification.vehicleId,
    isRead: notification.isRead,
    createdAt: notification.createdAt,
  });
}
