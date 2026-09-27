import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useFormatters } from "@/hooks/use-formatters";
import { Link } from "wouter";
import { useListOrders } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Container, ChevronRight, ChevronDown, CheckCircle2, Circle } from "lucide-react";

const ORDER_STATUS_COLORS: Record<string, string> = {
  inquiry: "bg-muted text-muted-foreground border-border",
  quotation_sent: "bg-blue-500/15 text-blue-500 border-blue-500/30",
  quotation_accepted: "bg-cyan-500/15 text-cyan-500 border-cyan-500/30",
  awaiting_payment: "bg-amber-500/15 text-amber-500 border-amber-500/30",
  payment_received: "bg-teal-500/15 text-teal-500 border-teal-500/30",
  payment_verified: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30",
  seller_payment: "bg-lime-500/15 text-lime-500 border-lime-500/30",
  documents_preparation: "bg-orange-500/15 text-orange-500 border-orange-500/30",
  booking_shipping: "bg-violet-500/15 text-violet-500 border-violet-500/30",
  in_production: "bg-purple-500/15 text-purple-500 border-purple-500/30",
  ready_to_ship: "bg-indigo-500/15 text-indigo-500 border-indigo-500/30",
  shipped: "bg-sky-500/15 text-sky-500 border-sky-500/30",
  arrived: "bg-blue-500/15 text-blue-500 border-blue-500/30",
  delivered: "bg-green-500/15 text-green-500 border-green-500/30",
  closed: "bg-muted text-muted-foreground border-border",
  cancelled: "bg-red-500/15 text-red-500 border-red-500/30",
};

// Ordered status flow for the inline timeline
const STATUS_FLOW = [
  "inquiry",
  "quotation_sent",
  "quotation_accepted",
  "awaiting_payment",
  "payment_received",
  "payment_verified",
  "seller_payment",
  "documents_preparation",
  "booking_shipping",
  "in_production",
  "ready_to_ship",
  "shipped",
  "arrived",
  "delivered",
  "closed",
] as const;

function OrderStatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border ${ORDER_STATUS_COLORS[status] ?? ""}`}>
      {status.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}
    </span>
  );
}

function StatusTimeline({ currentStatus }: { currentStatus: string }) {
  if (currentStatus === "cancelled") {
    return (
      <div className="px-4 py-3 bg-red-500/5 border-t border-border">
        <p className="text-sm text-red-500 font-medium">This order has been cancelled.</p>
      </div>
    );
  }

  const currentIdx = STATUS_FLOW.indexOf(currentStatus as typeof STATUS_FLOW[number]);

  return (
    <div className="px-4 py-4 bg-muted/30 border-t border-border">
      <p className="text-xs text-muted-foreground mb-3 font-medium uppercase tracking-wide">Order Progress</p>
      <div className="overflow-x-auto pb-2">
        <div className="flex items-start gap-0 min-w-max">
          {STATUS_FLOW.map((step, idx) => {
            const isDone = currentIdx > idx;
            const isCurrent = currentIdx === idx;
            const label = step.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
            return (
              <div key={step} className="flex items-start">
                <div className="flex flex-col items-center gap-1 w-[88px]">
                  <div className={`flex items-center justify-center w-7 h-7 rounded-full border-2 transition-colors ${
                    isDone
                      ? "bg-primary border-primary text-primary-foreground"
                      : isCurrent
                        ? "bg-primary/10 border-primary text-primary"
                        : "bg-background border-border text-muted-foreground"
                  }`}>
                    {isDone
                      ? <CheckCircle2 className="w-4 h-4" />
                      : <Circle className={`w-4 h-4 ${isCurrent ? "fill-primary/20" : ""}`} />
                    }
                  </div>
                  <p className={`text-[10px] text-center leading-tight max-w-[80px] ${
                    isCurrent ? "text-primary font-semibold" : isDone ? "text-foreground" : "text-muted-foreground"
                  }`}>
                    {label}
                  </p>
                </div>
                {idx < STATUS_FLOW.length - 1 && (
                  <div className={`h-0.5 w-5 mt-3.5 flex-shrink-0 ${isDone ? "bg-primary" : "bg-border"}`} />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default function BuyerOrders() {
  const { t } = useTranslation();
  const { formatCurrency, formatDate } = useFormatters();
  const { data, isLoading } = useListOrders();
  const orders = data?.data ?? [];
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const toggleExpand = (id: string) => setExpandedId(prev => (prev === id ? null : id));

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto space-y-8">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t("buyerOrders.title")}</h1>
          <p className="text-muted-foreground">{t("buyerOrders.subtitle")}</p>
        </div>
        <Button variant="outline" asChild>
          <Link href="/buyer/quotations">{t("buyerOrders.myQuotations")}</Link>
        </Button>
      </div>

      {!isLoading && orders.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {["awaiting_payment", "in_production", "shipped", "delivered"].map(s => {
            const count = orders.filter(o => o.status === s).length;
            return (
              <Card key={s} className="border-border bg-card">
                <CardContent className="p-4">
                  <p className="text-xs text-muted-foreground capitalize">{s.replace(/_/g, " ")}</p>
                  <p className="text-2xl font-bold mt-1">{count}</p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Card className="border-border">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-3">
              {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-12" />)}
            </div>
          ) : orders.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Container className="h-10 w-10 text-muted-foreground mb-3 opacity-20" />
              <p className="text-muted-foreground font-medium">{t("buyerOrders.noOrders")}</p>
              <p className="text-sm text-muted-foreground mt-1">{t("buyerOrders.noOrdersDesc")}</p>
              <Button className="mt-4" asChild>
                <Link href="/buyer/quotations">{t("buyerOrders.viewQuotations")}</Link>
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Order #</TableHead>
                  <TableHead>{t("buyerOrders.colVehicle")}</TableHead>
                  <TableHead>{t("buyerOrders.colSeller")}</TableHead>
                  <TableHead>{t("buyerOrders.colQty")}</TableHead>
                  <TableHead>{t("buyerOrders.colTotal")}</TableHead>
                  <TableHead>{t("buyerOrders.colStatus")}</TableHead>
                  <TableHead>{t("buyerOrders.colDate")}</TableHead>
                  <TableHead className="text-xs text-center">Timeline</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.map(o => (
                  <>
                    <TableRow key={o.id}>
                      <TableCell className="font-mono text-xs font-semibold text-primary">{o.orderNumber}</TableCell>
                      <TableCell className="font-medium max-w-[180px] truncate">{o.vehicleTitle ?? o.vehicleId.slice(0, 8)}</TableCell>
                      <TableCell className="text-muted-foreground">{o.sellerName ?? o.sellerId.slice(0, 8)}</TableCell>
                      <TableCell>{o.quantity}</TableCell>
                      <TableCell className="font-medium">{formatCurrency(o.totalAmountUsd)}</TableCell>
                      <TableCell><OrderStatusBadge status={o.status} /></TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {formatDate(o.createdAt)}
                      </TableCell>
                      <TableCell className="text-center">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => toggleExpand(o.id)}
                          aria-label={expandedId === o.id ? "Collapse timeline" : "Expand timeline"}
                        >
                          <ChevronDown className={`h-4 w-4 transition-transform ${expandedId === o.id ? "rotate-180" : ""}`} />
                        </Button>
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="sm" asChild>
                          <Link href={`/orders/${o.id}`}>
                            <ChevronRight className="h-4 w-4" />
                          </Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                    {expandedId === o.id && (
                      <TableRow key={`${o.id}-timeline`}>
                        <TableCell colSpan={9} className="p-0">
                          <StatusTimeline currentStatus={o.status} />
                        </TableCell>
                      </TableRow>
                    )}
                  </>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
