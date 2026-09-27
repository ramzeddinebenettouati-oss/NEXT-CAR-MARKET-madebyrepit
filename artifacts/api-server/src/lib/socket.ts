import { Server as HttpServer } from "http";
import { Server as SocketServer, Socket } from "socket.io";
import { verifyAccessToken, type JwtPayload } from "./jwt";
import { logger } from "./logger";
import { db, conversationsTable } from "@workspace/db";
import { eq, or } from "drizzle-orm";

let io: SocketServer | null = null;

export function initSocketServer(httpServer: HttpServer): SocketServer {
  io = new SocketServer(httpServer, {
    cors: { origin: true, credentials: true },
    path: "/api/socket.io",
  });

  io.use((socket, next) => {
    const token =
      (socket.handshake.auth?.token as string | undefined) ||
      (socket.handshake.headers.authorization?.startsWith("Bearer ")
        ? socket.handshake.headers.authorization.slice(7)
        : undefined);

    if (!token) {
      return next(new Error("Authentication required"));
    }

    const payload = verifyAccessToken(token);
    if (!payload) {
      return next(new Error("Invalid or expired token"));
    }

    (socket as AuthenticatedSocket).user = payload;
    next();
  });

  io.on("connection", (socket: Socket) => {
    const user = (socket as AuthenticatedSocket).user;
    logger.debug({ userId: user.userId, role: user.role }, "Socket connected");

    // Each user automatically joins their personal notification room
    socket.join(`user:${user.userId}`);

    socket.on("join_conversation", async (conversationId: string) => {
      try {
        // Enforce: only participants (or admins) may join a conversation room
        const isAdmin = ["super_admin", "admin"].includes(user.role);

        if (!isAdmin) {
          const [conv] = await db
            .select({ buyerId: conversationsTable.buyerId, sellerId: conversationsTable.sellerId })
            .from(conversationsTable)
            .where(eq(conversationsTable.id, conversationId))
            .limit(1);

          if (!conv) {
            socket.emit("error", { message: "Conversation not found" });
            return;
          }

          const isParticipant =
            conv.buyerId === user.userId || conv.sellerId === user.userId;

          if (!isParticipant) {
            socket.emit("error", { message: "Access denied to conversation" });
            logger.warn(
              { userId: user.userId, conversationId },
              "Unauthorized socket room join attempt"
            );
            return;
          }
        }

        socket.join(`conversation:${conversationId}`);
        logger.debug({ userId: user.userId, conversationId }, "Joined conversation room");
      } catch (err) {
        logger.error({ err, conversationId }, "Error verifying conversation membership");
        socket.emit("error", { message: "Internal error" });
      }
    });

    socket.on("leave_conversation", (conversationId: string) => {
      socket.leave(`conversation:${conversationId}`);
    });

    socket.on("disconnect", () => {
      logger.debug({ userId: user.userId }, "Socket disconnected");
    });
  });

  return io;
}

export function getSocketServer(): SocketServer | null {
  return io;
}

export function emitToUser(userId: string, event: string, data: unknown): void {
  if (!io) return;
  io.to(`user:${userId}`).emit(event, data);
}

export function emitToConversation(conversationId: string, event: string, data: unknown): void {
  if (!io) return;
  io.to(`conversation:${conversationId}`).emit(event, data);
}

export interface AuthenticatedSocket extends Socket {
  user: JwtPayload;
}
