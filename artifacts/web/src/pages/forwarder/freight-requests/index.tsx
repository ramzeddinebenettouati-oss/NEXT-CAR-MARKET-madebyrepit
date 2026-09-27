import { useTranslation } from "react-i18next";
import { useFormatters } from "@/hooks/use-formatters";
import { useLocation } from "wouter";
import {
  useListFreightRequests,
  getListFreightRequestsQueryKey,
} from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Truck,
  Package,
  DollarSign,
  ChevronRight,
  ArrowRight,
} from "lucide-react";

const STATUS_COLORS: Record<string, string> = {
  open: "bg-amber-500/15 text-amber-500 border-amber-500/30",
  quote_accepted: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30",
  completed: "bg-muted text-muted-foreground border-border",
  cancelled: "bg-red-500/15 text-red-500 border-red-500/30",
};

const QUOTE_STATUS_COLORS: Record<string, string> = {
  pending: "text-amber-500",
  accepted: "text-emerald-500",
  rejected: "text-red-500",
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${STATUS_COLORS[status] ?? ""}`}>
      {status.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}
    </span>
  );
}

export default function FreightRequestsList() {
  const { t } = useTranslation();
  const { formatCurrency, formatDate } = useFormatters();
  const [, setLocation] = useLocation();

  const { data, isLoading } = useListFreightRequests(
    { limit: 50 },
    { query: { queryKey: getListFreightRequestsQueryKey({ limit: 50 }) } },
  );

  const requests = data?.data ?? [];

  return (
    <div className="p-6 lg:p-8 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Truck className="h-6 w-6 text-primary" /> {t("forwarderFreight.title")}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {t("forwarderFreight.subtitle")}
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-28" />)}
        </div>
      ) : requests.length === 0 ? (
        <Card className="border-border">
          <CardContent className="py-16 flex flex-col items-center text-center gap-3">
            <Package className="h-10 w-10 text-muted-foreground opacity-20" />
            <p className="text-muted-foreground font-medium">{t("forwarderFreight.noRequests")}</p>
            <p className="text-sm text-muted-foreground">
              {t("forwarderFreight.noRequestsHint")}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {requests.map(req => (
            <Card
              key={req.id}
              className="border-border hover:border-primary/40 transition-colors cursor-pointer"
              onClick={() => setLocation(`/forwarder/freight-requests/${req.id}`)}
            >
              <CardContent className="p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <StatusBadge status={req.status} />
                      {req.myQuoteStatus && (
                        <span className={`text-xs font-medium ${QUOTE_STATUS_COLORS[req.myQuoteStatus] ?? ""}`}>
                          {t("forwarderFreight.myQuote")} {req.myQuoteStatus}
                        </span>
                      )}
                    </div>

                    <p className="font-semibold mt-2 truncate">
                      {req.vehicleTitle ?? `Order ${req.orderId.slice(0, 8).toUpperCase()}`}
                    </p>

                    <div className="flex flex-wrap gap-4 mt-2 text-sm text-muted-foreground">
                      {req.buyerName && (
                        <span>{t("forwarderFreight.buyer")} <span className="text-foreground">{req.buyerName}</span></span>
                      )}
                      {req.orderTotalUsd != null && (
                        <span className="flex items-center gap-1">
                          <DollarSign className="h-3 w-3" />
                          {t("forwarderFreight.orderValue")} <span className="text-foreground font-medium">{formatCurrency(req.orderTotalUsd)}</span>
                        </span>
                      )}
                      <span>
                        {t("forwarderFreight.quotesSubmitted")} <span className="text-foreground font-medium">{req.quoteCount}</span>
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {req.status === "open" && !req.myQuoteId && (
                      <Button size="sm" variant="default" onClick={e => { e.stopPropagation(); setLocation(`/forwarder/freight-requests/${req.id}`); }}>
                        {t("forwarderFreight.submitQuote")} <ArrowRight className="h-3 w-3 ml-1" />
                      </Button>
                    )}
                    <ChevronRight className="h-5 w-5 text-muted-foreground" />
                  </div>
                </div>

                <p className="text-xs text-muted-foreground mt-3">
                  {t("forwarderFreight.created")} {formatDate(req.createdAt)}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
