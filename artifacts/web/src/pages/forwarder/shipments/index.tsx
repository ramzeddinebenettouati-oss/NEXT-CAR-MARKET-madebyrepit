import { useTranslation } from "react-i18next";
import { useFormatters } from "@/hooks/use-formatters";
import { useLocation } from "wouter";
import { useListShipments, getListShipmentsQueryKey } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Truck, Package, ChevronRight, Clock } from "lucide-react";

const STATUS_COLORS: Record<string, string> = {
  awaiting_quote: "bg-muted/50 text-muted-foreground border-border",
  quote_submitted: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  quote_accepted: "bg-cyan-500/15 text-cyan-400 border-cyan-500/30",
  container_booked: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  vehicle_collected: "bg-orange-500/15 text-orange-400 border-orange-500/30",
  at_origin_port: "bg-violet-500/15 text-violet-400 border-violet-500/30",
  loaded_on_vessel: "bg-indigo-500/15 text-indigo-400 border-indigo-500/30",
  in_transit: "bg-sky-500/15 text-sky-400 border-sky-500/30",
  arrived_destination_port: "bg-teal-500/15 text-teal-400 border-teal-500/30",
  customs_clearance: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
  delivered: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
};

export default function ForwarderShipmentsList() {
  const { t } = useTranslation();
  const { formatDate } = useFormatters();
  const [, setLocation] = useLocation();

  const { data, isLoading } = useListShipments(undefined, {
    query: { queryKey: getListShipmentsQueryKey() },
  });

  const shipments = data?.data ?? [];

  if (isLoading) {
    return (
      <div className="p-6 lg:p-8 max-w-4xl mx-auto space-y-4">
        <Skeleton className="h-8 w-48" />
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20" />)}
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Truck className="h-6 w-6 text-primary" /> {t("forwarderShipments.title")}
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          {t("forwarderShipments.subtitle")}
        </p>
      </div>

      {shipments.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center border border-dashed border-border rounded-lg">
          <Package className="h-10 w-10 text-muted-foreground mb-3 opacity-30" />
          <p className="text-muted-foreground font-medium">{t("forwarderShipments.noShipments")}</p>
          <p className="text-sm text-muted-foreground mt-1">
            {t("forwarderShipments.noShipmentsHint")}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {shipments.map(s => (
            <Card
              key={s.id}
              className="border-border hover:border-primary/30 transition-colors cursor-pointer"
              onClick={() => setLocation(`/forwarder/shipments/${s.id}`)}
            >
              <CardContent className="p-4">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border ${STATUS_COLORS[s.status] ?? ""}`}>
                        {s.status.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}
                      </span>
                      {(s.documentCount ?? 0) > 0 && (
                        <span className="text-xs text-muted-foreground">
                          {s.documentCount} doc{s.documentCount !== 1 ? "s" : ""}
                        </span>
                      )}
                    </div>
                    <p className="font-medium text-sm mt-1.5 truncate">
                      {s.vehicleTitle ?? t("forwarderFreight.vehicle")}
                    </p>
                    <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                      {s.buyerName && <span>{t("forwarderFreight.buyer")} {s.buyerName}</span>}
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {formatDate(s.updatedAt)}
                      </span>
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
