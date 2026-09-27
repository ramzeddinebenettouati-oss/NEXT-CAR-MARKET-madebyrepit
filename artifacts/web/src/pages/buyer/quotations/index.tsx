import { useTranslation } from "react-i18next";
import { useFormatters } from "@/hooks/use-formatters";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListQuotations,
  useAcceptQuotation,
  useRejectQuotation,
  getListQuotationsQueryKey,
  getListOrdersQueryKey,
} from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { FileText, CheckCircle2, XCircle, Clock, AlertCircle } from "lucide-react";

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-amber-500/15 text-amber-500 border-amber-500/30",
  accepted: "bg-green-500/15 text-green-500 border-green-500/30",
  rejected: "bg-red-500/15 text-red-500 border-red-500/30",
  expired: "bg-muted text-muted-foreground border-border",
};

const STATUS_ICONS: Record<string, React.ElementType> = {
  pending: Clock,
  accepted: CheckCircle2,
  rejected: XCircle,
  expired: AlertCircle,
};

function QuotationStatusBadge({ status }: { status: string }) {
  const Icon = STATUS_ICONS[status] ?? Clock;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${STATUS_COLORS[status] ?? ""}`}>
      <Icon className="h-3 w-3" />
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

export default function BuyerQuotations() {
  const { t } = useTranslation();
  const { formatCurrency, formatDate } = useFormatters();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data, isLoading } = useListQuotations();
  const accept = useAcceptQuotation();
  const reject = useRejectQuotation();

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: [getListQuotationsQueryKey()[0]] });
    queryClient.invalidateQueries({ queryKey: [getListOrdersQueryKey()[0]] });
  };

  const handleAccept = (quotationId: string) => {
    accept.mutate(
      { quotationId },
      {
        onSuccess: () => {
          toast({ title: t("buyerQuotations.toastAccepted"), description: t("buyerQuotations.toastAcceptedDesc") });
          invalidate();
        },
        onError: (err: any) => {
          toast({ title: t("buyerQuotations.toastFailed"), description: err?.message ?? "Could not accept quotation.", variant: "destructive" });
        },
      }
    );
  };

  const handleReject = (quotationId: string) => {
    reject.mutate(
      { quotationId },
      {
        onSuccess: () => {
          toast({ title: t("buyerQuotations.toastRejected"), description: t("buyerQuotations.toastRejectedDesc") });
          invalidate();
        },
        onError: (err: any) => {
          toast({ title: t("buyerQuotations.toastFailed"), description: err?.message ?? "Could not reject quotation.", variant: "destructive" });
        },
      }
    );
  };

  const quotations = data?.data ?? [];
  const pending = quotations.filter(q => q.status === "pending");
  const others = quotations.filter(q => q.status !== "pending");

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto space-y-8">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t("buyerQuotations.title")}</h1>
          <p className="text-muted-foreground">{t("buyerQuotations.subtitle")}</p>
        </div>
        <Button variant="outline" asChild>
          <Link href="/buyer/orders">{t("buyerQuotations.viewOrders")}</Link>
        </Button>
      </div>

      {!isLoading && pending.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Clock className="h-5 w-5 text-amber-500" />
            {t("buyerQuotations.awaitingResponse", { count: pending.length })}
          </h2>
          <div className="grid gap-4">
            {pending.map(q => (
              <Card key={q.id} className="border-amber-500/30 bg-amber-500/5">
                <CardContent className="p-5">
                  <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
                    <div className="space-y-1 flex-1 min-w-0">
                      <p className="font-semibold text-lg truncate">{q.vehicleTitle ?? "Vehicle"}</p>
                      <p className="text-sm text-muted-foreground">{t("buyerQuotations.from")} {q.sellerName ?? "Seller"}</p>
                      <div className="flex flex-wrap gap-4 text-sm mt-2">
                        <span>{t("buyerQuotations.qty")} <strong>{q.quantity}</strong></span>
                        <span>{t("buyerQuotations.unitPrice")} <strong>{formatCurrency(q.unitPriceUsd)}</strong></span>
                        {q.shippingFeeUsd != null && <span>{t("buyerQuotations.shipping")} <strong>{formatCurrency(q.shippingFeeUsd)}</strong></span>}
                        {q.inspectionFeeUsd != null && <span>{t("buyerQuotations.inspection")} <strong>{formatCurrency(q.inspectionFeeUsd)}</strong></span>}
                        <span className="font-bold text-foreground">{t("buyerQuotations.total")} {formatCurrency(q.totalAmountUsd ?? 0)}</span>
                      </div>
                      {q.notes && <p className="text-sm text-muted-foreground mt-1 italic">"{q.notes}"</p>}
                      <p className="text-xs text-amber-500 mt-1">
                        {t("buyerQuotations.expires")} {formatDate(q.expiresAt)}
                      </p>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <Button
                        size="sm"
                        onClick={() => handleAccept(q.id)}
                        disabled={accept.isPending || reject.isPending}
                        className="bg-green-600 hover:bg-green-700 text-white"
                      >
                        <CheckCircle2 className="h-4 w-4 mr-1" /> {t("buyerQuotations.accept")}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleReject(q.id)}
                        disabled={accept.isPending || reject.isPending}
                        className="border-red-500/50 text-red-500 hover:bg-red-500/10"
                      >
                        <XCircle className="h-4 w-4 mr-1" /> {t("buyerQuotations.reject")}
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-3">
        <h2 className="text-lg font-semibold">{t("buyerQuotations.allQuotations")}</h2>
        <Card className="border-border">
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-6 space-y-3">
                {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-12" />)}
              </div>
            ) : quotations.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <FileText className="h-10 w-10 text-muted-foreground mb-3 opacity-20" />
                <p className="text-muted-foreground font-medium">{t("buyerQuotations.noQuotations")}</p>
                <p className="text-sm text-muted-foreground mt-1">{t("buyerQuotations.noQuotationsDesc")}</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("buyerQuotations.colVehicle")}</TableHead>
                    <TableHead>{t("buyerQuotations.colSeller")}</TableHead>
                    <TableHead>{t("buyerQuotations.colQty")}</TableHead>
                    <TableHead>{t("buyerQuotations.colTotal")}</TableHead>
                    <TableHead>{t("buyerQuotations.colStatus")}</TableHead>
                    <TableHead>{t("buyerQuotations.colExpires")}</TableHead>
                    <TableHead>{t("buyerQuotations.colCreated")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {quotations.map(q => (
                    <TableRow key={q.id}>
                      <TableCell className="font-medium max-w-[180px] truncate">{q.vehicleTitle ?? q.vehicleId.slice(0, 8)}</TableCell>
                      <TableCell className="text-muted-foreground">{q.sellerName ?? q.sellerId.slice(0, 8)}</TableCell>
                      <TableCell>{q.quantity}</TableCell>
                      <TableCell className="font-medium">{formatCurrency(q.totalAmountUsd ?? 0)}</TableCell>
                      <TableCell><QuotationStatusBadge status={q.status} /></TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {formatDate(q.expiresAt)}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {formatDate(q.createdAt)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
