import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useFormatters } from "@/hooks/use-formatters";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListQuotations,
  useCreateQuotation,
  useGetVehicle,
  getGetVehicleQueryKey,
  getListQuotationsQueryKey,
  useListOrders,
  getListOrdersQueryKey,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { FileText, Plus, Clock, CheckCircle2, XCircle, AlertCircle } from "lucide-react";

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

function CreateQuotationDialog({ onCreated }: { onCreated: () => void }) {
  const { t } = useTranslation();
  const { formatCurrency } = useFormatters();
  const { toast } = useToast();
  const create = useCreateQuotation();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    vehicleId: "",
    buyerId: "",
    quantity: "1",
    unitPriceUsd: "",
    shippingFeeUsd: "",
    inspectionFeeUsd: "",
    otherFeesUsd: "",
    notes: "",
    expiresAt: "",
  });
  const { data: vehicle } = useGetVehicle(form.vehicleId.trim(), {
    query: {
      queryKey: getGetVehicleQueryKey(form.vehicleId.trim()),
      enabled: form.vehicleId.trim().length > 0,
      retry: false,
    },
  });

  const commissionType = (vehicle as any)?.commissionType as string | null;
  const commissionRate = Number((vehicle as any)?.commissionValue ?? 0);
  const fixedCommission = Number(
    (vehicle as any)?.commissionFixedAmountUsd ??
    (vehicle as any)?.commissionAmountUsd ??
    0,
  );
  const quoteSubtotal =
    (Number(form.quantity) || 0) * (Number(form.unitPriceUsd) || 0) +
    (Number(form.shippingFeeUsd) || 0) +
    (Number(form.inspectionFeeUsd) || 0) +
    (Number(form.otherFeesUsd) || 0);
  const estimatedCommission = commissionType === "percentage"
    ? quoteSubtotal * commissionRate / 100
    : commissionType === "fixed"
      ? fixedCommission
      : commissionType === "hybrid"
        ? fixedCommission + quoteSubtotal * commissionRate / 100
        : null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.vehicleId || !form.buyerId || !form.unitPriceUsd || !form.expiresAt) {
      toast({ title: t("sellerQuotations.missingFields"), description: t("sellerQuotations.missingFieldsDesc"), variant: "destructive" });
      return;
    }
    create.mutate(
      {
        data: {
          vehicleId: form.vehicleId.trim(),
          buyerId: form.buyerId.trim(),
          quantity: parseInt(form.quantity, 10) || 1,
          unitPriceUsd: parseFloat(form.unitPriceUsd),
          shippingFeeUsd: form.shippingFeeUsd ? parseFloat(form.shippingFeeUsd) : undefined,
          inspectionFeeUsd: form.inspectionFeeUsd ? parseFloat(form.inspectionFeeUsd) : undefined,
          otherFeesUsd: form.otherFeesUsd ? parseFloat(form.otherFeesUsd) : undefined,
          notes: form.notes || undefined,
          expiresAt: new Date(form.expiresAt).toISOString(),
        },
      },
      {
        onSuccess: () => {
          toast({ title: t("sellerQuotations.toastSent"), description: t("sellerQuotations.toastSentDesc") });
          setOpen(false);
          setForm({ vehicleId: "", buyerId: "", quantity: "1", unitPriceUsd: "", shippingFeeUsd: "", inspectionFeeUsd: "", otherFeesUsd: "", notes: "", expiresAt: "" });
          onCreated();
        },
        onError: (err: any) => {
          toast({ title: t("sellerQuotations.toastFailed"), description: err?.message ?? "Could not create quotation.", variant: "destructive" });
        },
      }
    );
  };

  const field = (id: keyof typeof form, label: string, type = "text", placeholder = "") => (
    <div className="space-y-1">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type={type}
        placeholder={placeholder}
        value={form[id]}
        onChange={e => setForm(prev => ({ ...prev, [id]: e.target.value }))}
      />
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button><Plus className="h-4 w-4 mr-2" /> {t("sellerQuotations.newQuotation")}</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg flex flex-col max-h-[90dvh]">
        <DialogHeader className="shrink-0">
          <DialogTitle>{t("sellerQuotations.sendQuotationTitle")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          <div className="overflow-y-auto flex-1 space-y-4 py-2 pr-1">
            {field("vehicleId", t("sellerQuotations.fieldVehicleId"), "text", "UUID of the vehicle")}
            {field("buyerId", t("sellerQuotations.fieldBuyerId"), "text", "UUID of the buyer")}
            {commissionType && (
              <div className="rounded-md border border-amber-500/25 bg-amber-500/5 px-3 py-2 text-sm space-y-1">
                <p className="font-semibold text-amber-600">Platform commission</p>
                <p className="text-muted-foreground">
                  {commissionType === "percentage"
                    ? `${commissionRate.toFixed(2)}% of the quotation total`
                    : commissionType === "fixed"
                      ? `${formatCurrency(fixedCommission)} fixed per quotation`
                      : `${commissionRate.toFixed(2)}% plus ${formatCurrency(fixedCommission)} fixed`}
                </p>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              {field("quantity", t("sellerQuotations.fieldQuantity"), "number", "1")}
              {field("unitPriceUsd", t("sellerQuotations.fieldUnitPrice"), "number", "0.00")}
            </div>
            <div className="grid grid-cols-2 gap-3">
              {field("shippingFeeUsd", t("sellerQuotations.fieldShipping"), "number", "0.00")}
              {field("inspectionFeeUsd", t("sellerQuotations.fieldInspection"), "number", "0.00")}
            </div>
            {field("otherFeesUsd", t("sellerQuotations.fieldOther"), "number", "0.00")}
            {estimatedCommission != null && quoteSubtotal > 0 && (
              <div className="rounded-md border border-emerald-500/25 bg-emerald-500/5 px-3 py-2 text-sm flex justify-between">
                <span className="text-muted-foreground">Estimated platform commission</span>
                <span className="font-mono font-semibold text-emerald-600">{formatCurrency(estimatedCommission)}</span>
              </div>
            )}
            {field("expiresAt", t("sellerQuotations.fieldExpires"), "datetime-local")}
            <div className="space-y-1">
              <Label htmlFor="notes">{t("sellerQuotations.fieldNotes")}</Label>
              <textarea
                id="notes"
                className="w-full min-h-[80px] rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                placeholder={t("sellerQuotations.notesPlaceholder")}
                value={form.notes}
                onChange={e => setForm(prev => ({ ...prev, notes: e.target.value }))}
              />
            </div>
          </div>
          <div className="flex gap-3 pt-4 shrink-0 border-t border-border mt-2">
            <Button type="submit" disabled={create.isPending} className="flex-1">
              {create.isPending ? t("sellerQuotations.sending") : t("sellerQuotations.sendQuotation")}
            </Button>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>{t("sellerQuotations.cancel")}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function SellerQuotations() {
  const { t } = useTranslation();
  const { formatCurrency, formatDate } = useFormatters();
  const queryClient = useQueryClient();
  const { data, isLoading } = useListQuotations();

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: [getListQuotationsQueryKey()[0]] });
    queryClient.invalidateQueries({ queryKey: [getListOrdersQueryKey()[0]] });
  };

  const quotations = data?.data ?? [];

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto space-y-8">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t("sellerQuotations.title")}</h1>
          <p className="text-muted-foreground">{t("sellerQuotations.subtitle")}</p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" asChild>
            <Link href="/seller/orders">{t("sellerQuotations.viewOrders")}</Link>
          </Button>
          <CreateQuotationDialog onCreated={invalidate} />
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {(["pending", "accepted", "rejected", "expired"] as const).map(s => {
          const count = quotations.filter(q => q.status === s).length;
          const Icon = STATUS_ICONS[s];
          return (
            <Card key={s} className="bg-card border-border">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center justify-between capitalize">
                  {s}
                  <Icon className="h-4 w-4 text-muted-foreground" />
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{isLoading ? "–" : count}</div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card className="border-border">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-3">
              {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-12" />)}
            </div>
          ) : quotations.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <FileText className="h-10 w-10 text-muted-foreground mb-3 opacity-20" />
              <p className="text-muted-foreground font-medium">{t("sellerQuotations.noQuotations")}</p>
              <p className="text-sm text-muted-foreground mt-1">{t("sellerQuotations.noQuotationsDesc")}</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("sellerQuotations.colVehicle")}</TableHead>
                  <TableHead>{t("sellerQuotations.colBuyer")}</TableHead>
                  <TableHead>{t("sellerQuotations.colQty")}</TableHead>
                  <TableHead>{t("sellerQuotations.colTotal")}</TableHead>
                  <TableHead>Commission</TableHead>
                  <TableHead>{t("sellerQuotations.colStatus")}</TableHead>
                  <TableHead>{t("sellerQuotations.colExpires")}</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {quotations.map(q => (
                  <TableRow key={q.id}>
                    <TableCell className="font-medium max-w-[180px] truncate">{q.vehicleTitle ?? q.vehicleId.slice(0, 8)}</TableCell>
                    <TableCell className="text-muted-foreground">{q.buyerName ?? q.buyerId.slice(0, 8)}</TableCell>
                    <TableCell>{q.quantity}</TableCell>
                    <TableCell className="font-medium">{formatCurrency(q.totalAmountUsd ?? 0)}</TableCell>
                    <TableCell>
                      {(q as any).commissionAmountUsd != null ? (
                        <div className="flex flex-col gap-0.5">
                          <span className="text-amber-600 font-medium text-sm">
                            {(q as any).commissionType === "percentage" && (q as any).commissionValue != null
                              ? `${Number((q as any).commissionValue).toFixed(2)}%`
                              : formatCurrency(Number((q as any).commissionAmountUsd))}
                          </span>
                          <span className="text-xs text-muted-foreground">per agreement</span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground text-sm">—</span>
                      )}
                    </TableCell>
                    <TableCell><QuotationStatusBadge status={q.status} /></TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {formatDate(q.expiresAt)}
                    </TableCell>
                    <TableCell>
                      {q.status === "accepted" && (
                        <Button variant="ghost" size="sm" asChild>
                          <Link href="/seller/orders">{t("sellerQuotations.viewOrder")}</Link>
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
