import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useFormatters } from "@/hooks/use-formatters";
import { Link } from "wouter";
import { useListConversations, getListConversationsQueryKey } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { MessageCircle, ChevronRight } from "lucide-react";

export default function ConversationsList() {
  const { t } = useTranslation();
  const { formatRelative } = useFormatters();
  const [page, setPage] = useState(1);
  const limit = 20;

  const { data, isLoading } = useListConversations(
    { page, limit },
    { query: { queryKey: getListConversationsQueryKey({ page, limit }) } }
  );

  const totalPages = data ? Math.ceil(data.total / limit) : 1;

  return (
    <div className="p-6 lg:p-8 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <MessageCircle className="h-7 w-7 text-blue-500" />
          {t("conversations.title")}
        </h1>
        <p className="text-muted-foreground">{t("conversations.subtitle")}</p>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
      ) : !data?.data?.length ? (
        <Card className="bg-card border-border border-dashed">
          <CardContent className="py-16 text-center text-muted-foreground">
            <MessageCircle className="h-12 w-12 mx-auto mb-4 opacity-20" />
            <p className="text-lg font-medium mb-2">{t("conversations.noConversations")}</p>
            <p className="text-sm mb-4">{t("conversations.noConversationsHint")}</p>
            <Button asChild>
              <Link href="/vehicles">{t("conversations.browseVehicles")}</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card className="bg-card border-border divide-y divide-border overflow-hidden">
            {data.data.map((conv) => {
              const initials = conv.sellerName
                ? conv.sellerName.split(" ").map((n: string) => n[0]).join("").slice(0, 2).toUpperCase()
                : "S";
              return (
                <Link key={conv.id} href={`/buyer/conversations/${conv.id}`}>
                  <div className="flex items-center gap-4 p-4 hover:bg-muted/40 transition-colors cursor-pointer">
                    <Avatar className="h-10 w-10 shrink-0">
                      <AvatarFallback className="bg-primary/10 text-primary text-xs font-bold">
                        {initials}
                      </AvatarFallback>
                    </Avatar>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <p className="font-semibold text-sm truncate">
                          {conv.vehicleTitle ?? t("conversations.vehicleInquiry")}
                        </p>
                        {(conv.unreadCount ?? 0) > 0 && (
                          <Badge className="shrink-0 bg-primary text-xs px-1.5 py-0">
                            {conv.unreadCount}
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground truncate">
                        {conv.lastMessagePreview ?? t("conversations.noMessages")}
                      </p>
                      <p className="text-xs text-muted-foreground/60 mt-0.5">
                        {conv.sellerName && `${t("conversations.sellerLabel")} ${conv.sellerName} · `}
                        {formatRelative(conv.lastMessageAt)}
                      </p>
                    </div>

                    <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                  </div>
                </Link>
              );
            })}
          </Card>

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2">
              <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>
                {t("conversations.previous")}
              </Button>
              <span className="text-sm text-muted-foreground">{t("conversations.pageOf", { page, total: totalPages })}</span>
              <Button variant="outline" size="sm" disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>
                {t("conversations.next")}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
