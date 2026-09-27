import { useEffect, useState } from "react";
import { Link } from "wouter";
import { useListNotifications, getListNotificationsQueryKey } from "@workspace/api-client-react";
import { useAuth } from "@/hooks/use-auth";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { Bell, MessageCircle, CarFront, CheckCircle2, Container } from "lucide-react";
import { cn } from "@/lib/utils";
import { useFormatters } from "@/hooks/use-formatters";
import { io, Socket } from "socket.io-client";

let notifSocket: Socket | null = null;

function getNotifSocket(): Socket {
  if (!notifSocket) {
    const token = localStorage.getItem("ac_access_token");
    notifSocket = io(window.location.origin, {
      path: "/api/socket.io",
      auth: { token },
      transports: ["websocket", "polling"],
    });
  }
  return notifSocket;
}

const typeIcon: Record<string, React.ElementType> = {
  new_message: MessageCircle,
  new_inquiry: MessageCircle,
  listing_approved: CheckCircle2,
  listing_rejected: CarFront,
  order_update: Container,
};

export function NotificationBell() {
  const qc = useQueryClient();
  const { formatRelative } = useFormatters();
  const { user } = useAuth();
  const conversationsBase = user?.role === "seller" ? "/seller/conversations" : "/buyer/conversations";
  const notificationsPath = user?.role === "seller" ? "/seller/conversations" : "/buyer/notifications";
  const [open, setOpen] = useState(false);

  const { data } = useListNotifications(
    { limit: 8, unreadOnly: false, page: 1 },
    {
      query: {
        queryKey: getListNotificationsQueryKey({ limit: 8, unreadOnly: false, page: 1 }),
        refetchInterval: 30_000,
      },
    }
  );

  const unreadCount = data?.unreadCount ?? 0;

  // Real-time socket notifications
  useEffect(() => {
    const sock = getNotifSocket();
    const handler = () => {
      qc.invalidateQueries({ queryKey: ["/api/notifications"] });
    };
    const handleReconnect = () => {
      qc.invalidateQueries({ queryKey: ["/api/notifications"] });
    };
    sock.on("notification:new", handler);
    sock.io.on("reconnect", handleReconnect);
    return () => {
      sock.off("notification:new", handler);
      sock.io.off("reconnect", handleReconnect);
    };
  }, [qc]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 h-4 w-4 rounded-full bg-primary text-[10px] font-bold text-primary-foreground flex items-center justify-center leading-none">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0 bg-card border-border">
        <div className="p-3 border-b border-border flex items-center justify-between">
          <span className="font-semibold text-sm">Notifications</span>
          <Link href={notificationsPath} onClick={() => setOpen(false)}>
            <span className="text-xs text-primary hover:underline cursor-pointer">View all</span>
          </Link>
        </div>
        <div className="max-h-80 overflow-y-auto divide-y divide-border">
          {!data?.data?.length ? (
            <div className="p-6 text-center text-muted-foreground text-sm">No notifications</div>
          ) : (
            data.data.map((n) => {
              const Icon = typeIcon[n.type] ?? Bell;
              const href = n.conversationId
                ? `${conversationsBase}/${n.conversationId}`
                : n.vehicleId
                ? `/vehicles/${n.vehicleId}`
                : notificationsPath;
              return (
                <Link key={n.id} href={href} onClick={() => setOpen(false)}>
                  <div className={cn("flex gap-3 p-3 hover:bg-muted/40 cursor-pointer transition-colors", !n.isRead && "bg-primary/5")}>
                    <Icon className="h-4 w-4 mt-0.5 text-primary shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className={cn("text-xs leading-snug truncate", !n.isRead && "font-semibold")}>{n.title}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-1">{n.body}</p>
                      <p className="text-[10px] text-muted-foreground/50 mt-0.5">
                        {formatRelative(n.createdAt)}
                      </p>
                    </div>
                    {!n.isRead && <div className="h-2 w-2 rounded-full bg-primary shrink-0 mt-1.5" />}
                  </div>
                </Link>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
