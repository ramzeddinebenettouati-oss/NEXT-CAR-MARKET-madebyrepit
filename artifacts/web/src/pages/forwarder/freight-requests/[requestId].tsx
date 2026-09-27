import { useTranslation } from "react-i18next";
import { useFormatters } from "@/hooks/use-formatters";
import { useParams, useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetFreightRequest,
  getGetFreightRequestQueryKey,
  useListFreightRequestQuotes,
  getListFreightRequestQuotesQueryKey,
  useSubmitShippingQuote,
  useCreateFreightConversation,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import {
  Truck,
  ArrowLeft,
  DollarSign,
  Clock,
  CheckCircle2,
  Package,
  MessageCircle,
  Send,
} from "lucide-react";
import { useState } from "react";

const QUOTE_STATUS_COLORS: Record<string, string> = {
  pending: "bg-amber-500/15 text-amber-500 border-amber-500/30",
  accepted: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30",
  rejected: "bg-red-500/15 text-red-500 border-red-500/30",
};

function num(v: string | number | undefined | null): number {
  return Number(v ?? 0);
}

export default function FreightRequestDetail() {
  const { t } = useTranslation();
  const { formatCurrency, formatDate, formatNumber } = useFormatters();
  const { requestId } = useParams<{ requestId: string }>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const { data: request, isLoading: requestLoading } = useGetFreightRequest(requestId, {
    query: { queryKey: getGetFreightRequestQueryKey(requestId) },
  });

  const { data: quotesData } = useListFreightRequestQuotes(requestId, undefined, {
    query: { queryKey: getListFreightRequestQuotesQueryKey(requestId) },
  });
  const myQuote = (quotesData?.data ?? []).find(q => q.forwarderId === user?.id);

  const submitQuote = useSubmitShippingQuote();
  const createConv = useCreateFreightConversation();

  const [form, setForm] = useState({
    freightCostUsd: "",
    insuranceUsd: "0",
    customsUsd: "0",
    portChargesUsd: "0",
    documentationUsd: "0",
    currency: "USD",
    estimatedDaysMin: "",
    estimatedDaysMax: "",
    notes: "",
  });

  const totalUsd = [
    form.freightCostUsd,
    form.insuranceUsd,
    form.customsUsd,
    form.portChargesUsd,
    form.documentationUsd,
  ].reduce((acc, v) => acc + (Number(v) || 0), 0);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.freightCostUsd || !totalUsd) {
      toast({ title: t("forwarderFreight.missingFields"), description: t("forwarderFreight.freightCostRequired"), variant: "destructive" });
      return;
    }
    submitQuote.mutate(
      {
        requestId,
        data: {
          freightCostUsd: Number(form.freightCostUsd),
          insuranceUsd: Number(form.insuranceUsd) || 0,
          customsUsd: Number(form.customsUsd) || 0,
          portChargesUsd: Number(form.portChargesUsd) || 0,
          documentationUsd: Number(form.documentationUsd) || 0,
          totalUsd,
          currency: form.currency,
          estimatedDaysMin: form.estimatedDaysMin ? Number(form.estimatedDaysMin) : undefined,
          estimatedDaysMax: form.estimatedDaysMax ? Number(form.estimatedDaysMax) : undefined,
          notes: form.notes || undefined,
        },
      },
      {
        onSuccess: () => {
          toast({ title: t("forwarderFreight.toastSubmitted"), description: t("forwarderFreight.toastSubmittedDesc") });
          queryClient.invalidateQueries({ queryKey: getListFreightRequestQuotesQueryKey(requestId) });
          queryClient.invalidateQueries({ queryKey: getGetFreightRequestQueryKey(requestId) });
        },
        onError: (err: any) => {
          toast({ title: t("forwarderFreight.toastFailed"), description: err?.message ?? "Could not submit quote.", variant: "destructive" });
        },
      },
    );
  };

  const handleContactSeller = async () => {
    if (!request?.orderId) return;
    try {
      const conv = await createConv.mutateAsync({
        data: { orderId: request.orderId, forwarderId: user?.id ?? "", freightRequestId: requestId },
      });
      setLocation(`/forwarder/conversations/${conv.id}`);
    } catch {
      toast({ title: t("forwarderFreight.toastError"), description: t("forwarderFreight.toastConvFailed"), variant: "destructive" });
    }
  };

  if (requestLoading) {
    return (
      <div className="p-6 max-w-3xl mx-auto space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-48" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (!request) {
    return (
      <div className="p-6 max-w-3xl mx-auto flex flex-col items-center py-16 text-center gap-3">
        <Package className="h-10 w-10 opacity-20" />
        <p className="text-muted-foreground">{t("forwarderFreight.notFound")}</p>
        <Button variant="outline" onClick={() => setLocation("/forwarder/freight-requests")}>
          <ArrowLeft className="h-4 w-4 mr-2" /> {t("forwarderFreight.back")}
        </Button>
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => setLocation("/forwarder/freight-requests")}>
          <ArrowLeft className="h-4 w-4 mr-2" /> {t("forwarderFreight.back")}
        </Button>
        <div className="flex-1">
          <h1 className="text-xl font-bold">{t("forwarderFreight.freightRequestTitle")}</h1>
          <p className="text-sm font-mono text-muted-foreground">{request.id.slice(0, 12)}…</p>
        </div>
        <Button variant="outline" size="sm" onClick={handleContactSeller} disabled={createConv.isPending}>
          <MessageCircle className="h-4 w-4 mr-2" /> {t("forwarderFreight.contactSeller")}
        </Button>
      </div>

      <Card className="border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Truck className="h-4 w-4" /> {t("forwarderFreight.shipmentDetails")}
          </CardTitle>
        </CardHeader>
        <CardContent className="grid sm:grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-muted-foreground text-xs">{t("forwarderFreight.vehicle")}</p>
            <p className="font-medium mt-0.5">{request.vehicleTitle ?? "—"}</p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">{t("forwarderFreight.orderTotal")}</p>
            <p className="font-medium mt-0.5">
              {request.orderTotalUsd != null ? formatCurrency(request.orderTotalUsd) : "—"}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">{t("forwarderFreight.buyer")}</p>
            <p className="font-medium mt-0.5">{request.buyerName ?? "—"}</p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">{t("forwarderFreight.requestStatus")}</p>
            <p className="font-medium mt-0.5 capitalize">{request.status.replace(/_/g, " ")}</p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">{t("forwarderFreight.quotesReceived")}</p>
            <p className="font-medium mt-0.5">{request.quoteCount}</p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">{t("forwarderFreight.created")}</p>
            <p className="font-medium mt-0.5">{formatDate(request.createdAt)}</p>
          </div>
        </CardContent>
      </Card>

      {myQuote && (
        <Card className="border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-500" /> {t("forwarderFreight.yourQuote")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className={`flex items-center gap-2 px-3 py-2 rounded-md border text-sm font-medium ${QUOTE_STATUS_COLORS[myQuote.status] ?? ""}`}>
              {myQuote.status === "pending" && <Clock className="h-4 w-4" />}
              {myQuote.status === "accepted" && <CheckCircle2 className="h-4 w-4" />}
              {myQuote.status.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              {[
                [t("forwarderFreight.freightCost"), myQuote.freightCostUsd],
                [t("forwarderFreight.insurance"), myQuote.insuranceUsd],
                [t("forwarderFreight.customs"), myQuote.customsUsd],
                [t("forwarderFreight.portCharges"), myQuote.portChargesUsd],
                [t("forwarderFreight.documentation"), myQuote.documentationUsd],
              ].map(([label, val]) => (
                <div key={String(label)}>
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className="font-medium">{formatCurrency(Number(val), myQuote.currency)}</p>
                </div>
              ))}
              <div>
                <p className="text-xs text-muted-foreground">{t("forwarderFreight.total")}</p>
                <p className="font-bold text-primary">{formatCurrency(myQuote.totalUsd, myQuote.currency)}</p>
              </div>
            </div>
            {(myQuote.estimatedDaysMin || myQuote.estimatedDaysMax) && (
              <p className="text-sm text-muted-foreground flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {t("forwarderFreight.estimatedDelivery")} {myQuote.estimatedDaysMin}–{myQuote.estimatedDaysMax} {t("forwarderFreight.days")}
              </p>
            )}
            {myQuote.notes && (
              <p className="text-sm italic text-muted-foreground">"{myQuote.notes}"</p>
            )}
          </CardContent>
        </Card>
      )}

      {request.status === "open" && !myQuote && (
        <Card className="border-border">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-primary" /> {t("forwarderFreight.submitQuoteTitle")}
            </CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              {t("forwarderFreight.submitQuoteDesc")}
            </p>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="grid sm:grid-cols-2 gap-4">
                {[
                  { key: "freightCostUsd", label: t("forwarderFreight.freightCost"), required: true },
                  { key: "insuranceUsd", label: t("forwarderFreight.insurance") },
                  { key: "customsUsd", label: t("forwarderFreight.customs") },
                  { key: "portChargesUsd", label: t("forwarderFreight.portCharges") },
                  { key: "documentationUsd", label: t("forwarderFreight.documentation") },
                ].map(({ key, label, required }) => (
                  <div key={key} className="space-y-1">
                    <label className="text-sm font-medium">
                      {label} {required && <span className="text-red-500">*</span>}
                    </label>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground w-8">USD</span>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
                        value={(form as any)[key]}
                        onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                        placeholder="0.00"
                      />
                    </div>
                  </div>
                ))}

                <div className="sm:col-span-2 p-3 rounded-md border border-primary/30 bg-primary/5 text-sm flex justify-between items-center">
                  <span className="font-medium text-muted-foreground">{t("forwarderFreight.calculatedTotal")}</span>
                  <span className="font-bold text-primary text-lg">{formatCurrency(totalUsd)}</span>
                </div>
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-sm font-medium">{t("forwarderFreight.estDaysMin")}</label>
                  <input
                    type="number"
                    min="1"
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={form.estimatedDaysMin}
                    onChange={e => setForm(f => ({ ...f, estimatedDaysMin: e.target.value }))}
                    placeholder="e.g. 14"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium">{t("forwarderFreight.estDaysMax")}</label>
                  <input
                    type="number"
                    min="1"
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={form.estimatedDaysMax}
                    onChange={e => setForm(f => ({ ...f, estimatedDaysMax: e.target.value }))}
                    placeholder="e.g. 21"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-sm font-medium">{t("forwarderFreight.notes")}</label>
                <textarea
                  rows={3}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  placeholder={t("forwarderFreight.notesPlaceholder")}
                  value={form.notes}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                />
              </div>

              <Button type="submit" disabled={submitQuote.isPending} className="w-full sm:w-auto">
                <Send className="h-4 w-4 mr-2" />
                {submitQuote.isPending ? t("forwarderFreight.submitting") : t("forwarderFreight.submitQuoteBtn")}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
