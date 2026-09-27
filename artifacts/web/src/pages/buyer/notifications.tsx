import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useFormatters } from "@/hooks/use-formatters";
import { Link } from "wouter";
import {
  useListNotifications,
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  getListNotificationsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Bell, BellOff, MessageCircle, CarFront, CheckCircle2, Container } from "lucide-react";
import { cn } from "@/lib/utils";

const notifIcon: Record<string, React.ElementType> = {
  new_message: MessageCircle,
  new_inquiry: MessageCircle,
  listing_approved: CheckCircle2,
  listing_rejected: CarFront,
  order_update: Container,
};

const notifColor: Record<string, string> = {
  new_message: "text-blue-500",
  new_inquiry: "text-amber-500",
  listing_approved: "text-green-500",
  listing_rejected: "text-red-500",
  order_update: "text-purple-500",
};

export default function BuyerNotifications() {
  const { t } = useTranslation();
  const { formatRelative } = useFormatters();
  const [page, setPage] = useState(1);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const limit = 20;
  const qc = useQueryClient();

  const queryKey = getListNotificationsQueryKey({ page, limit, unreadOnly });
  const { data, isLoading } = useListNotifications(
    { page, limit, unreadOnly },
    { query: { queryKey } }
  );

  const markAll = useMarkAllNotificationsRead({
    mutation: {
      onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/notifications"] }),
    },
  });

  const markOne = useMarkNotificationRead({
    mutation: {
      onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/notifications"] }),
    },
  });

  const totalPages = data ? Math.ceil(data.total / limit) : 1;

  return (
    <div className="p-6 lg:p-8 max-w-3xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Bell className="h-7 w-7 text-purple-500" />
            {t("buyerNotifications.title")}
            {(data?.unreadCount ?? 0) > 0 && (
              <Badge className="bg-primary">{data?.unreadCount}</Badge>
            )}
          </h1>
          <p className="text-muted-foreground">{t("buyerNotifications.subtitle")}</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant={unreadOnly ? "secondary" : "outline"}
            size="sm"
            onClick={() => { setUnreadOnly(v => !v); setPage(1); }}
          >
            {unreadOnly ? t("buyerNotifications.showAll") : t("buyerNotifications.unreadOnly")}
          </Button>
          {(data?.unreadCount ?? 0) > 0 && (
            <Button size="sm" onClick={() => markAll.mutate()} disabled={markAll.isPending}>
              {t("buyerNotifications.markAllRead")}
            </Button>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-16" />)}
        </div>
      ) : !data?.data?.length ? (
        <Card className="bg-card border-border border-dashed">
          <CardContent className="py-16 text-center text-muted-foreground">
            <BellOff className="h-12 w-12 mx-auto mb-4 opacity-20" />
            <p className="text-lg font-medium mb-2">
              {unreadOnly ? t("buyerNotifications.noUnread") : t("buyerNotifications.noNotifications")}
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card className="bg-card border-border divide-y divide-border overflow-hidden">
            {data.data.map((notif) => {
              const Icon = notifIcon[notif.type] ?? Bell;
              const color = notifColor[notif.type] ?? "text-muted-foreground";
              const href = notif.conversationId
                ? `/buyer/conversations/${notif.conversationId}`
                : notif.vehicleId
                ? `/vehicles/${notif.vehicleId}`
                : undefined;

              return (
                <div
                  key={notif.id}
                  className={cn(
                    "flex items-start gap-3 p-4 transition-colors",
                    !notif.isRead && "bg-primary/5 border-l-2 border-l-primary",
                    href && "cursor-pointer hover:bg-muted/40"
                  )}
                  onClick={() => {
                    if (!notif.isRead) markOne.mutate({ notificationId: notif.id });
                    if (href) window.location.href = href;
                  }}
                >
                  <Icon className={cn("h-5 w-5 mt-0.5 shrink-0", color)} />
                  <div className="flex-1 min-w-0">
                    <p className={cn("text-sm font-medium", !notif.isRead && "font-semibold")}>{notif.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{notif.body}</p>
                    <p className="text-[10px] text-muted-foreground/60 mt-1">
                      {formatRelative(notif.createdAt)}
                    </p>
                  </div>
                  {!notif.isRead && (
                    <div className="h-2 w-2 rounded-full bg-primary shrink-0 mt-2" />
                  )}
                </div>
              );
            })}
          </Card>

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2">
              <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>{t("buyerNotifications.previous")}</Button>
              <span className="text-sm text-muted-foreground">{t("buyerNotifications.pageOf", { page, total: totalPages })}</span>
              <Button variant="outline" size="sm" disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>{t("buyerNotifications.next")}</Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
