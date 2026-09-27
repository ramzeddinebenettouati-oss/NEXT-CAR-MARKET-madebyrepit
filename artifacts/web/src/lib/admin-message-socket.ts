import { io, Socket } from "socket.io-client";

let socket: Socket | null = null;
let socketToken: string | null = null;

export type AdminMessageSocketLifecycle = {
  onDisconnect?: (reason: string) => void;
  onReconnect?: (attempt: number) => void;
};

/**
 * Return the admin-message socket for the current auth session.
 * A token change always tears down the old connection before creating a new
 * one, preventing a logout/login in the same tab from retaining old rooms.
 */
export function getAdminMessageSocket(token: string | null): Socket | null {
  if (!token) {
    socket?.disconnect();
    socket = null;
    socketToken = null;
    return null;
  }

  if (socket && socketToken !== token) {
    socket.disconnect();
    socket = null;
  }

  if (!socket) {
    socketToken = token;
    socket = io(window.location.origin, {
      path: "/api/socket.io",
      auth: { token },
      transports: ["websocket", "polling"],
    });
  }

  return socket;
}

/**
 * Subscribe to connection lifecycle events on the shared socket.
 * The manager's reconnect event is used instead of the socket's connect event
 * so the initial connection does not look like a recovery after navigation.
 */
export function subscribeAdminMessageSocket(
  token: string | null,
  lifecycle: AdminMessageSocketLifecycle,
): (() => void) {
  const currentSocket = getAdminMessageSocket(token);
  if (!currentSocket) return () => {};

  const handleDisconnect = (reason: string) => {
    lifecycle.onDisconnect?.(reason);
  };
  const handleReconnect = (attempt: number) => {
    lifecycle.onReconnect?.(attempt);
  };

  currentSocket.on("disconnect", handleDisconnect);
  currentSocket.io.on("reconnect", handleReconnect);

  return () => {
    currentSocket.off("disconnect", handleDisconnect);
    currentSocket.io.off("reconnect", handleReconnect);
  };
}

export function disconnectAdminMessageSocket(): void {
  socket?.disconnect();
  socket = null;
  socketToken = null;
}