import { useParams, useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetOrder,
  useUpdateOrderStatus,
  getGetOrderQueryKey,
  useSubmitPayment,
  useGetOrderPayment,
  getGetOrderPaymentQueryKey,
  useRequestUploadUrl,
  useListOrderShippingQuotes,
  getListOrderShippingQuotesQueryKey,
  useAcceptShippingQuote,
  useRejectShippingQuote,
  useGetOrderShipment,
  getGetOrderShipmentQueryKey,
  useListShipmentDocuments,
  getListShipmentDocumentsQueryKey,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import {
  Package,
  ArrowLeft,
  CheckCircle2,
  Circle,
  Clock,
  CreditCard,
  Upload,
  Building2,
  Hash,
  Calendar,
  DollarSign,
  AlertCircle,
  ExternalLink,
  Truck,
  XCircle,
  FileText,
  Download,
} from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { ObjectUploader } from "@workspace/object-storage-web";
import { useFormatters } from "@/hooks/use-formatters";

const ORDER_STATUS_COLORS: Record<string, string> = {
  inquiry: "bg-muted text-muted-foreground border-border",
  quotation_sent: "bg-blue-500/15 text-blue-500 border-blue-500/30",
  quotation_accepted: "bg-cyan-500/15 text-cyan-500 border-cyan-500/30",
  awaiting_payment: "bg-amber-500/15 text-amber-500 border-amber-500/30",
  payment_received: "bg-teal-500/15 text-teal-500 border-teal-500/30",
  payment_verified: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30",
  in_production: "bg-purple-500/15 text-purple-500 border-purple-500/30",
  ready_to_ship: "bg-indigo-500/15 text-indigo-500 border-indigo-500/30",
  shipped: "bg-sky-500/15 text-sky-500 border-sky-500/30",
  delivered: "bg-green-500/15 text-green-500 border-green-500/30",
  closed: "bg-muted text-muted-foreground border-border",
  cancelled: "bg-red-500/15 text-red-500 border-red-500/30",
};

const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  inquiry: ["quotation_sent", "cancelled"],
  quotation_sent: ["quotation_accepted", "cancelled"],
  quotation_accepted: ["awaiting_payment", "cancelled"],
  awaiting_payment: ["payment_verified", "cancelled"],
  payment_verified: ["in_production", "cancelled"],
  in_production: ["ready_to_ship", "cancelled"],
  ready_to_ship: ["shipped", "cancelled"],
  shipped: ["delivered"],
  delivered: ["closed"],
  closed: [],
  cancelled: [],
};

function OrderStatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center px-3 py-1.5 rounded-full text-sm font-semibold border ${ORDER_STATUS_COLORS[status] ?? ""}`}>
      {status.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}
    </span>
  );
}

const STATUS_TIMELINE = [
  "quotation_accepted",
  "awaiting_payment",
  "payment_received",
  "payment_verified",
  "in_production",
  "ready_to_ship",
  "shipped",
  "delivered",
  "closed",
];

function StatusTimeline({ current }: { current: string }) {
  const cancelled = current === "cancelled";
  return (
    <div className="relative flex items-center gap-1 overflow-x-auto py-2">
      {STATUS_TIMELINE.map((s, i) => {
        const statusIndex = STATUS_TIMELINE.indexOf(current);
        const isDone = !cancelled && statusIndex > i;
        const isActive = !cancelled && statusIndex === i;
        return (
          <div key={s} className="flex items-center shrink-0">
            <div className={`flex flex-col items-center gap-1 ${isActive ? "opacity-100" : isDone ? "opacity-70" : "opacity-30"}`}>
              <div className={`h-3 w-3 rounded-full border-2 ${isActive ? "bg-primary border-primary" : isDone ? "bg-primary/60 border-primary/60" : "bg-transparent border-muted-foreground"}`} />
              <span className="text-[10px] text-muted-foreground whitespace-nowrap">{s.replace(/_/g, " ")}</span>
            </div>
            {i < STATUS_TIMELINE.length - 1 && (
              <div className={`h-0.5 w-6 mx-1 ${isDone ? "bg-primary/60" : "bg-muted"}`} />
            )}
          </div>
        );
      })}
      {cancelled && (
        <div className="ml-4 px-2 py-1 rounded text-xs text-red-500 bg-red-500/10 border border-red-500/30">
          Cancelled
        </div>
      )}
    </div>
  );
}

// ── Payment Status Card (shows existing payment) ───────────────────────────────

function PaymentStatusCard({ orderId }: { orderId: string }) {
  const { formatCurrency } = useFormatters();
  const { data: payment, isLoading } = useGetOrderPayment(orderId, {
    query: { queryKey: getGetOrderPaymentQueryKey(orderId), retry: false },
  });

  if (isLoading) return <Skeleton className="h-32" />;
  if (!payment) return null;

  const statusColors: Record<string, string> = {
    pending_review: "text-amber-500 bg-amber-500/10 border-amber-500/30",
    verified: "text-emerald-500 bg-emerald-500/10 border-emerald-500/30",
    rejected: "text-red-500 bg-red-500/10 border-red-500/30",
  };

  return (
    <Card className="border-border">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <CreditCard className="h-4 w-4" /> Payment Submitted
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className={`flex items-center gap-2 px-3 py-2 rounded-md border text-sm font-medium ${statusColors[payment.status] ?? ""}`}>
          {payment.status === "pending_review" && <Clock className="h-4 w-4" />}
          {payment.status === "verified" && <CheckCircle2 className="h-4 w-4" />}
          {payment.status === "rejected" && <AlertCircle className="h-4 w-4" />}
          {payment.status.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}
        </div>

        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-muted-foreground text-xs flex items-center gap-1">
              <Hash className="h-3 w-3" /> Reference
            </p>
            <p className="font-mono mt-0.5">{payment.referenceNumber}</p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs flex items-center gap-1">
              <Building2 className="h-3 w-3" /> Bank
            </p>
            <p className="mt-0.5">{payment.bankName}</p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs flex items-center gap-1">
              <Calendar className="h-3 w-3" /> Payment Date
            </p>
            <p className="mt-0.5">{payment.paymentDate}</p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs flex items-center gap-1">
              <DollarSign className="h-3 w-3" /> Amount
            </p>
            <p className="font-bold mt-0.5">
              {formatCurrency(payment.amount, payment.currency)}
            </p>
          </div>
        </div>

        {(payment.receiptObjectPath || payment.proofObjectPath) && (
          <div className="flex gap-4 text-xs">
            {payment.receiptObjectPath && (
              <a
                href={`/api/storage/objects/${encodeURIComponent(payment.receiptObjectPath.replace(/^\/objects\//, ""))}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-primary underline underline-offset-2"
              >
                <ExternalLink className="h-3 w-3" /> Receipt
              </a>
            )}
            {payment.proofObjectPath && (
              <a
                href={`/api/storage/objects/${encodeURIComponent(payment.proofObjectPath.replace(/^\/objects\//, ""))}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-primary underline underline-offset-2"
              >
                <ExternalLink className="h-3 w-3" /> Proof of Transfer
              </a>
            )}
          </div>
        )}

        {payment.status === "rejected" && payment.rejectionNote && (
          <div className="p-3 rounded-md bg-red-500/10 border border-red-500/20 text-xs text-red-400">
            <strong>Rejection note:</strong> {payment.rejectionNote}
          </div>
        )}

        {payment.status === "pending_review" && (
          <p className="text-xs text-muted-foreground italic">
            Your payment is being reviewed by our team. You will be notified once verified.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

// ── Payment Submission Form ───────────────────────────────────────────────────

function PaymentSubmitForm({ orderId, totalAmount }: { orderId: string; totalAmount: number }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const submitPayment = useSubmitPayment();
  const requestUploadUrl = useRequestUploadUrl();

  const [form, setForm] = useState({
    referenceNumber: "",
    bankName: "",
    paymentDate: new Date().toISOString().slice(0, 10),
    amount: String(totalAmount),
    currency: "USD",
  });
  const [receiptObjectPath, setReceiptObjectPath] = useState<string | null>(null);
  const [proofObjectPath, setProofObjectPath] = useState<string | null>(null);
  // Capture objectPath from request-url response during upload parameter generation
  // so onComplete can reliably persist it (GCS signed URL != /objects/ path)
  const pendingReceiptPath = useRef<string | null>(null);
  const pendingProofPath = useRef<string | null>(null);

  const makeUploadParams = (pathRef: React.MutableRefObject<string | null>) =>
    async (file: any) => {
      const result = await requestUploadUrl.mutateAsync({
        data: {
          name: file.name,
          size: file.size,
          contentType: file.type || "application/octet-stream",
        },
      });
      pathRef.current = result.objectPath;
      return {
        method: "PUT" as const,
        url: result.uploadURL,
        headers: { "Content-Type": file.type || "application/octet-stream" },
      };
    };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.referenceNumber || !form.bankName || !form.paymentDate || !form.amount) {
      toast({ title: "Missing fields", description: "Please fill all required fields.", variant: "destructive" });
      return;
    }
    if (!receiptObjectPath || !proofObjectPath) {
      toast({ title: "Documents required", description: "Please upload both your bank receipt and proof of transfer.", variant: "destructive" });
      return;
    }

    submitPayment.mutate(
      {
        orderId,
        data: {
          referenceNumber: form.referenceNumber,
          bankName: form.bankName,
          paymentDate: form.paymentDate,
          amount: Number(form.amount),
          currency: form.currency,
          receiptObjectPath: receiptObjectPath ?? undefined,
          proofObjectPath: proofObjectPath ?? undefined,
        },
      },
      {
        onSuccess: () => {
          toast({ title: "Payment submitted", description: "Your payment is under review." });
          queryClient.invalidateQueries({ queryKey: getGetOrderPaymentQueryKey(orderId) });
        },
        onError: (err: any) => {
          toast({
            title: "Submission failed",
            description: err?.message ?? "Could not submit payment.",
            variant: "destructive",
          });
        },
      },
    );
  };

  return (
    <Card className="border-border">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <CreditCard className="h-4 w-4 text-amber-500" /> Submit SWIFT Payment
        </CardTitle>
        <p className="text-sm text-muted-foreground mt-1">
          Transfer the full amount via SWIFT and submit your payment proof below. Our team will verify within 1–2 business days.
        </p>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Bank details callout */}
          <div className="p-4 rounded-md border border-primary/30 bg-primary/5 text-sm space-y-2">
            <p className="font-semibold text-primary text-xs uppercase tracking-wide">NEXT CAR MARKET SWIFT Banking Details</p>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div><span className="text-muted-foreground">Bank:</span> <span className="font-medium">China Merchants Bank</span></div>
              <div><span className="text-muted-foreground">SWIFT:</span> <span className="font-mono font-medium">CMBCCNBS</span></div>
              <div><span className="text-muted-foreground">Account:</span> <span className="font-mono font-medium">1234 5678 9012 3456</span></div>
              <div><span className="text-muted-foreground">Currency:</span> <span className="font-medium">USD / CNY / EUR</span></div>
            </div>
            <p className="text-xs text-muted-foreground">
              Reference: <strong className="font-mono text-foreground">{orderId.slice(0, 8).toUpperCase()}</strong> — include this in your transfer.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-sm font-medium">
                SWIFT Reference Number <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                placeholder="e.g. TXN20241201ABCD"
                value={form.referenceNumber}
                onChange={e => setForm(f => ({ ...f, referenceNumber: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">
                Your Bank Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                placeholder="e.g. HSBC Hong Kong"
                value={form.bankName}
                onChange={e => setForm(f => ({ ...f, bankName: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">
                Payment Date <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={form.paymentDate}
                onChange={e => setForm(f => ({ ...f, paymentDate: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">
                Amount Transferred <span className="text-red-500">*</span>
              </label>
              <div className="flex gap-2">
                <Select value={form.currency} onValueChange={v => setForm(f => ({ ...f, currency: v }))}>
                  <SelectTrigger className="w-24">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {["USD", "CNY", "EUR", "GBP", "AED"].map(c => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={form.amount}
                  onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                />
              </div>
            </div>
          </div>

          {/* File uploads */}
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Bank Receipt</label>
              {receiptObjectPath ? (
                <div className="flex items-center gap-2 text-xs text-emerald-500">
                  <CheckCircle2 className="h-4 w-4" /> Uploaded
                  <button
                    type="button"
                    onClick={() => setReceiptObjectPath(null)}
                    className="text-muted-foreground underline hover:text-foreground ml-1"
                  >
                    Remove
                  </button>
                </div>
              ) : (
                <ObjectUploader
                  maxNumberOfFiles={1}
                  maxFileSize={10 * 1024 * 1024}
                  onGetUploadParameters={makeUploadParams(pendingReceiptPath)}
                  onComplete={() => {
                    if (pendingReceiptPath.current) {
                      setReceiptObjectPath(pendingReceiptPath.current);
                      pendingReceiptPath.current = null;
                    }
                  }}
                  buttonClassName="flex items-center gap-2 px-4 py-2 rounded-md border border-input bg-background text-sm hover:bg-muted transition-colors w-full justify-center"
                >
                  <Upload className="h-4 w-4" /> Upload Receipt
                </ObjectUploader>
              )}
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Proof of Transfer</label>
              {proofObjectPath ? (
                <div className="flex items-center gap-2 text-xs text-emerald-500">
                  <CheckCircle2 className="h-4 w-4" /> Uploaded
                  <button
                    type="button"
                    onClick={() => setProofObjectPath(null)}
                    className="text-muted-foreground underline hover:text-foreground ml-1"
                  >
                    Remove
                  </button>
                </div>
              ) : (
                <ObjectUploader
                  maxNumberOfFiles={1}
                  maxFileSize={10 * 1024 * 1024}
                  onGetUploadParameters={makeUploadParams(pendingProofPath)}
                  onComplete={() => {
                    if (pendingProofPath.current) {
                      setProofObjectPath(pendingProofPath.current);
                      pendingProofPath.current = null;
                    }
                  }}
                  buttonClassName="flex items-center gap-2 px-4 py-2 rounded-md border border-input bg-background text-sm hover:bg-muted transition-colors w-full justify-center"
                >
                  <Upload className="h-4 w-4" /> Upload Proof
                </ObjectUploader>
              )}
            </div>
          </div>

          <Button
            type="submit"
            className="w-full sm:w-auto"
            disabled={submitPayment.isPending}
          >
            {submitPayment.isPending ? "Submitting…" : "Submit Payment"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

// ── Shipment Stage definitions ─────────────────────────────────────────────────

const SHIPMENT_STAGES = [
  { key: "awaiting_quote", label: "Awaiting Quote" },
  { key: "quote_submitted", label: "Quote Submitted" },
  { key: "quote_accepted", label: "Quote Accepted" },
  { key: "container_booked", label: "Container Booked" },
  { key: "vehicle_collected", label: "Vehicle Collected" },
  { key: "at_origin_port", label: "At Origin Port" },
  { key: "loaded_on_vessel", label: "Loaded on Vessel" },
  { key: "in_transit", label: "In Transit" },
  { key: "arrived_destination_port", label: "Arrived at Port" },
  { key: "customs_clearance", label: "Customs Clearance" },
  { key: "delivered", label: "Delivered" },
] as const;

type ShipmentStatusKey = (typeof SHIPMENT_STAGES)[number]["key"];
const STAGE_INDEX = Object.fromEntries(SHIPMENT_STAGES.map((s, i) => [s.key, i])) as Record<ShipmentStatusKey, number>;

// ── Shipment Timeline Card ─────────────────────────────────────────────────────

function ShipmentTimelineCard({ orderId }: { orderId: string }) {
  const { formatDateTime } = useFormatters();
  const { data: shipment, isLoading, isError } = useGetOrderShipment(orderId, {
    query: { queryKey: getGetOrderShipmentQueryKey(orderId), retry: false },
  });

  if (isLoading) return <Skeleton className="h-48" />;
  if (isError || !shipment) return null;

  const currentIndex = STAGE_INDEX[shipment.status as ShipmentStatusKey] ?? -1;

  return (
    <Card className="border-border">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Truck className="h-4 w-4 text-primary" /> Shipment Tracking
        </CardTitle>
        <div className="flex items-center gap-2 mt-1">
          <span className="text-sm text-muted-foreground">Forwarder: {shipment.forwarderName ?? "Assigned forwarder"}</span>
          <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20 font-medium">
            {shipment.status.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}
          </span>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-0">
          {SHIPMENT_STAGES.map((stage, i) => {
            const isCompleted = i < currentIndex;
            const isCurrent = i === currentIndex;
            const isPending = i > currentIndex;
            const event = shipment.tracking.find(t => t.status === stage.key);

            return (
              <div key={stage.key} className="flex gap-4">
                <div className="flex flex-col items-center">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 border-2 transition-all ${
                    isCompleted ? "bg-emerald-500 border-emerald-500 text-white" :
                    isCurrent ? "bg-primary border-primary text-primary-foreground" :
                    "bg-transparent border-muted-foreground/25 text-muted-foreground/25"
                  }`}>
                    {isCompleted ? <CheckCircle2 className="h-3.5 w-3.5" /> :
                     isCurrent ? <Truck className="h-3.5 w-3.5" /> :
                     <Circle className="h-3.5 w-3.5" />}
                  </div>
                  {i < SHIPMENT_STAGES.length - 1 && (
                    <div className={`w-0.5 flex-1 my-1 min-h-[20px] ${isCompleted ? "bg-emerald-500/40" : "bg-muted"}`} />
                  )}
                </div>
                <div className={`pb-5 flex-1 min-w-0 ${i === SHIPMENT_STAGES.length - 1 ? "pb-0" : ""}`}>
                  <p className={`font-medium text-sm ${isPending ? "text-muted-foreground/40" : isCurrent ? "text-primary" : "text-foreground"}`}>
                    {stage.label}
                    {isCurrent && <span className="ml-2 text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">Current</span>}
                  </p>
                  {event && (
                    <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {formatDateTime(event.createdAt)}
                      {event.actorName && <span>· {event.actorName}</span>}
                      {event.note && <span className="italic">· {event.note}</span>}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

// ── Shipping Documents Card (buyer / seller view) ──────────────────────────────

const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  bill_of_lading: "Bill of Lading",
  commercial_invoice: "Commercial Invoice",
  packing_list: "Packing List",
  insurance_certificate: "Insurance Certificate",
  export_declaration: "Export Declaration",
  arrival_notice: "Arrival Notice",
};

function ShipmentDocumentsCard({ orderId }: { orderId: string }) {
  const { formatDate } = useFormatters();
  const { data: shipment, isLoading: shipLoading, isError } = useGetOrderShipment(orderId, {
    query: { queryKey: getGetOrderShipmentQueryKey(orderId), retry: false },
  });

  const { data: docs = [], isLoading: docsLoading } = useListShipmentDocuments(
    shipment?.id ?? "",
    {
      query: {
        queryKey: getListShipmentDocumentsQueryKey(shipment?.id ?? ""),
        enabled: !!shipment?.id,
      },
    },
  );

  if (shipLoading || docsLoading) return <Skeleton className="h-24" />;
  if (isError || !shipment || docs.length === 0) return null;

  return (
    <Card className="border-border">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <FileText className="h-4 w-4 text-primary" /> Shipping Documents
        </CardTitle>
        <p className="text-sm text-muted-foreground mt-1">
          Official documents provided by your freight forwarder.
        </p>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {docs.map(doc => (
            <div key={doc.id} className="flex items-center gap-3 p-3 rounded-lg border border-border bg-background/50 hover:bg-muted/30 transition-colors">
              <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{doc.fileName}</p>
                <p className="text-xs text-muted-foreground">
                  {DOCUMENT_TYPE_LABELS[doc.documentType] ?? doc.documentType}
                  {" · "}
                  {formatDate(doc.createdAt)}
                </p>
              </div>
              <a
                href={`/api/storage/objects/${encodeURIComponent(doc.objectPath.replace(/^\/objects\//, ""))}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 underline underline-offset-2"
              >
                <Download className="h-3 w-3" /> Download
              </a>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function OrderDocumentsCard({ orderId }: { orderId: string }) {
  const { formatDate } = useFormatters();
  const [documents, setDocuments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("ac_access_token");
    void fetch(`/api/orders/${orderId}/documents`, { headers: { Authorization: `Bearer ${token}` } })
      .then(response => response.ok ? response.json() : { data: [] })
      .then(body => setDocuments(body.data ?? []))
      .finally(() => setLoading(false));
  }, [orderId]);

  if (loading) return <Skeleton className="h-24" />;
  if (documents.length === 0) return null;
  return (
    <Card className="border-border">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2"><FileText className="h-4 w-4 text-primary" /> Order Documents</CardTitle>
        <p className="text-sm text-muted-foreground mt-1">Documents shared by the AutoCango team.</p>
      </CardHeader>
      <CardContent className="space-y-2">
        {documents.map(doc => (
          <div key={doc.id} className="flex items-center gap-3 p-3 rounded-lg border border-border bg-background/50">
            <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{doc.fileName}</p>
              <p className="text-xs text-muted-foreground">{doc.documentType} · {formatDate(doc.uploadedAt)}</p>
            </div>
            <a href={`/api/storage/objects/${encodeURIComponent(doc.objectPath.replace(/^\/objects\//, ""))}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs text-primary hover:underline">
              <Download className="h-3 w-3" /> Download
            </a>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

// ── Shipping Quotes Card (buyer view) ────────────────────────────────────────

function ShippingQuotesCard({ orderId }: { orderId: string }) {
  const { formatCurrency } = useFormatters();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const acceptQuote = useAcceptShippingQuote();
  const rejectQuote = useRejectShippingQuote();
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectNote, setRejectNote] = useState("");

  const { data, isLoading } = useListOrderShippingQuotes(orderId, {
    query: { queryKey: getListOrderShippingQuotesQueryKey(orderId) },
  });
  const quotes = data?.data ?? [];

  if (isLoading) return <Skeleton className="h-32" />;
  if (!quotes.length) return null;

  const handleAccept = (quoteId: string) => {
    acceptQuote.mutate(
      { quoteId },
      {
        onSuccess: () => {
          toast({ title: "Quote accepted", description: "Shipping arrangement confirmed. Order advancing to production." });
          queryClient.invalidateQueries({ queryKey: getListOrderShippingQuotesQueryKey(orderId) });
          queryClient.invalidateQueries({ queryKey: getGetOrderQueryKey(orderId) });
        },
        onError: (err: any) => toast({ title: "Failed", description: err?.message, variant: "destructive" }),
      },
    );
  };

  const handleReject = (quoteId: string) => {
    rejectQuote.mutate(
      { quoteId, data: { note: rejectNote || undefined } },
      {
        onSuccess: () => {
          toast({ title: "Quote rejected" });
          setRejectingId(null);
          setRejectNote("");
          queryClient.invalidateQueries({ queryKey: getListOrderShippingQuotesQueryKey(orderId) });
        },
        onError: (err: any) => toast({ title: "Failed", description: err?.message, variant: "destructive" }),
      },
    );
  };

  const QUOTE_COLORS: Record<string, string> = {
    pending: "border-amber-500/30 bg-amber-500/5",
    accepted: "border-emerald-500/30 bg-emerald-500/5",
    rejected: "border-border bg-muted/30 opacity-60",
  };

  return (
    <Card className="border-border">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Truck className="h-4 w-4 text-primary" /> Shipping Quotes
        </CardTitle>
        <p className="text-sm text-muted-foreground mt-1">
          Freight forwarders have submitted quotes for your shipment. Review and accept one to proceed.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {quotes.map(q => (
          <div key={q.id} className={`rounded-lg border p-4 ${QUOTE_COLORS[q.status] ?? ""}`}>
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-semibold">{q.forwarderName ?? "Freight Forwarder"}</p>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    q.status === "pending" ? "bg-amber-500/20 text-amber-500" :
                    q.status === "accepted" ? "bg-emerald-500/20 text-emerald-500" :
                    "bg-muted text-muted-foreground"
                  }`}>
                    {q.status.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-3 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground">Freight</p>
                    <p className="font-medium">{formatCurrency(q.freightCostUsd, q.currency)}</p>
                  </div>
                  {Number(q.insuranceUsd) > 0 && (
                    <div>
                      <p className="text-xs text-muted-foreground">Insurance</p>
                      <p>{formatCurrency(q.insuranceUsd, q.currency)}</p>
                    </div>
                  )}
                  {Number(q.customsUsd) > 0 && (
                    <div>
                      <p className="text-xs text-muted-foreground">Customs</p>
                      <p>{formatCurrency(q.customsUsd, q.currency)}</p>
                    </div>
                  )}
                  {Number(q.portChargesUsd) > 0 && (
                    <div>
                      <p className="text-xs text-muted-foreground">Port Charges</p>
                      <p>{formatCurrency(q.portChargesUsd, q.currency)}</p>
                    </div>
                  )}
                  {Number(q.documentationUsd) > 0 && (
                    <div>
                      <p className="text-xs text-muted-foreground">Documentation</p>
                      <p>{formatCurrency(q.documentationUsd, q.currency)}</p>
                    </div>
                  )}
                  <div>
                    <p className="text-xs text-muted-foreground">Total</p>
                    <p className="font-bold text-primary">{formatCurrency(q.totalUsd, q.currency)}</p>
                  </div>
                </div>

                {(q.estimatedDaysMin || q.estimatedDaysMax) && (
                  <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    Est. {q.estimatedDaysMin}–{q.estimatedDaysMax} days
                  </p>
                )}
                {q.notes && (
                  <p className="text-sm text-muted-foreground italic mt-2">"{q.notes}"</p>
                )}
              </div>

              {q.status === "pending" && (
                <div className="flex flex-col gap-2 shrink-0">
                  <Button
                    size="sm"
                    onClick={() => handleAccept(q.id)}
                    disabled={acceptQuote.isPending}
                  >
                    <CheckCircle2 className="h-3 w-3 mr-1" /> Accept
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setRejectingId(q.id)}
                    disabled={rejectQuote.isPending}
                  >
                    <XCircle className="h-3 w-3 mr-1" /> Reject
                  </Button>
                </div>
              )}
            </div>

            {/* Reject inline form */}
            {rejectingId === q.id && (
              <div className="mt-3 pt-3 border-t border-border space-y-2">
                <input
                  type="text"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  placeholder="Optional rejection reason…"
                  value={rejectNote}
                  onChange={e => setRejectNote(e.target.value)}
                />
                <div className="flex gap-2">
                  <Button size="sm" variant="destructive" onClick={() => handleReject(q.id)} disabled={rejectQuote.isPending}>
                    Confirm Reject
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => { setRejectingId(null); setRejectNote(""); }}>
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function OrderDetail() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const { formatCurrency, formatDate, formatDateTime } = useFormatters();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const updateStatus = useUpdateOrderStatus();
  const [note, setNote] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("");

  const { data: order, isLoading } = useGetOrder(id, {
    query: { queryKey: getGetOrderQueryKey(id) },
  });

  const isBuyer = user?.role === "buyer";
  const isAdmin = user?.role === "admin" || user?.role === "super_admin";
  const isPaymentRelevantStatus = order
    ? ["awaiting_payment", "payment_verified", "in_production", "ready_to_ship", "shipped", "delivered", "closed"].includes(order.status)
    : false;

  const { data: existingPayment } = useGetOrderPayment(id, {
    query: {
      queryKey: getGetOrderPaymentQueryKey(id),
      enabled: !!order && (isBuyer || isAdmin) && isPaymentRelevantStatus,
      retry: false,
    },
  });

  const canUpdateStatus = user?.role === "seller" || user?.role === "admin" || user?.role === "super_admin";
  const allowedNext = order ? ALLOWED_TRANSITIONS[order.status] ?? [] : [];

  // Sellers/admins should NOT see awaiting_payment → payment_verified here
  // (that's handled by payment verification flow)
  const filteredAllowedNext = canUpdateStatus && user?.role !== "buyer"
    ? allowedNext.filter(s =>
        // Only admins can manually skip payment verification
        s !== "payment_verified" || user?.role === "admin" || user?.role === "super_admin"
      )
    : allowedNext;

  const handleUpdateStatus = () => {
    if (!selectedStatus || !order) return;
    updateStatus.mutate(
      { orderId: order.id, data: { status: selectedStatus as any, note: note || undefined } },
      {
        onSuccess: () => {
          toast({ title: "Status updated", description: `Order is now: ${selectedStatus.replace(/_/g, " ")}` });
          setSelectedStatus("");
          setNote("");
          queryClient.invalidateQueries({ queryKey: getGetOrderQueryKey(order.id) });
        },
        onError: (err: any) => {
          toast({ title: "Failed", description: err?.message ?? "Could not update status.", variant: "destructive" });
        },
      }
    );
  };

  const backHref = user?.role === "buyer" ? "/buyer/orders" : "/seller/orders";

  if (isLoading) {
    return (
      <div className="p-6 lg:p-8 max-w-4xl mx-auto space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-48" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="p-6 lg:p-8 max-w-4xl mx-auto">
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Package className="h-10 w-10 text-muted-foreground mb-3 opacity-20" />
          <p className="text-muted-foreground font-medium">Order not found</p>
          <Button className="mt-4" variant="outline" onClick={() => setLocation(backHref)}>
            <ArrowLeft className="h-4 w-4 mr-2" /> Go back
          </Button>
        </div>
      </div>
    );
  }

  // Show submit form only when no active/pending payment exists (rejected = may resubmit)
  const showPaymentSubmit =
    isBuyer &&
    order.status === "awaiting_payment" &&
    (!existingPayment || existingPayment.status === "rejected");

  // Show status card whenever a payment record exists
  const showPaymentStatus = (isBuyer || isAdmin) && !!existingPayment;

  return (
    <div className="p-6 lg:p-8 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => setLocation(backHref)}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Back
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold tracking-tight">Order Detail</h1>
          <p className="text-sm text-muted-foreground font-mono">{order.id}</p>
        </div>
        <OrderStatusBadge status={order.status} />
      </div>

      {/* Timeline */}
      <Card className="border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium text-muted-foreground">Progress</CardTitle>
        </CardHeader>
        <CardContent>
          <StatusTimeline current={order.status} />
        </CardContent>
      </Card>

      {/* Order summary */}
      <div className="grid md:grid-cols-2 gap-6">
        <Card className="border-border">
          <CardHeader>
            <CardTitle className="text-base">Order Summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Vehicle</span>
              <span className="font-medium text-right max-w-[60%] truncate">{order.vehicleTitle ?? order.vehicleId.slice(0, 12)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Quantity</span>
              <span className="font-medium">{order.quantity}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Unit Price</span>
              <span className="font-medium">{formatCurrency(order.unitPriceUsd)}</span>
            </div>
            {order.shippingFeeUsd != null && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Shipping</span>
                <span>{formatCurrency(order.shippingFeeUsd)}</span>
              </div>
            )}
            {order.inspectionFeeUsd != null && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Inspection</span>
                <span>{formatCurrency(order.inspectionFeeUsd)}</span>
              </div>
            )}
            {order.otherFeesUsd != null && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Other Fees</span>
                <span>{formatCurrency(order.otherFeesUsd)}</span>
              </div>
            )}
            <div className="flex justify-between border-t border-border pt-3">
              <span className="font-semibold">Total</span>
              <span className="font-bold text-lg">{formatCurrency(order.totalAmountUsd)}</span>
            </div>
            {user?.role === "seller" && (order as any).commissionAmountUsd != null && (
              <div className="mt-3 rounded-md border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm space-y-1">
                <p className="font-semibold text-amber-600">Platform Commission</p>
                <p className="text-foreground font-medium">
                  {(order as any).commissionType === "percentage" && (order as any).commissionValue != null
                    ? `${Number((order as any).commissionValue).toFixed(2)}%`
                    : formatCurrency(Number((order as any).commissionAmountUsd))}
                </p>
                <p className="text-xs text-muted-foreground">This amount is applied per the marketplace agreement.</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-border">
          <CardHeader>
            <CardTitle className="text-base">Parties</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Buyer</span>
              <span className="font-medium">{order.buyerName ?? order.buyerId.slice(0, 12)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Seller</span>
              <span className="font-medium">{order.sellerName ?? order.sellerId.slice(0, 12)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Created</span>
              <span>{formatDate(order.createdAt)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Last Updated</span>
              <span>{order.updatedAt ? formatDate(order.updatedAt) : "—"}</span>
            </div>
            {order.notes && (
              <div className="pt-2 border-t border-border">
                <p className="text-muted-foreground mb-1">Notes</p>
                <p className="italic text-foreground">"{order.notes}"</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── BUYER: Payment submission / status ── */}
      {showPaymentSubmit && (
        <PaymentSubmitForm orderId={order.id} totalAmount={order.totalAmountUsd} />
      )}

      {showPaymentStatus && (
        <PaymentStatusCard orderId={order.id} />
      )}

      {/* ── BUYER: Shipping quotes (visible after payment verified) ── */}
      {isBuyer && ["payment_verified", "in_production", "ready_to_ship", "shipped", "delivered", "closed"].includes(order.status) && (
        <ShippingQuotesCard orderId={order.id} />
      )}

      {/* ── Shipment tracking timeline (buyer + seller + admin) ── */}
      {(isBuyer || user?.role === "seller" || isAdmin) && ["in_production", "ready_to_ship", "shipped", "delivered", "closed"].includes(order.status) && (
        <ShipmentTimelineCard orderId={order.id} />
      )}

      {/* ── Order documents (buyer + seller) ── */}
      {(isBuyer || user?.role === "seller") && (
        <>
          <OrderDocumentsCard orderId={order.id} />
        </>
      )}

      {/* ── Shipping documents (buyer + seller) ── */}
      {(isBuyer || user?.role === "seller") && ["in_production", "ready_to_ship", "shipped", "delivered", "closed"].includes(order.status) && (
        <ShipmentDocumentsCard orderId={order.id} />
      )}

      {/* Status update (sellers/admins) */}
      {canUpdateStatus && filteredAllowedNext.length > 0 && (
        <Card className="border-border">
          <CardHeader>
            <CardTitle className="text-base">Update Status</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-3">
              <Select value={selectedStatus} onValueChange={setSelectedStatus}>
                <SelectTrigger className="sm:w-64">
                  <SelectValue placeholder="Choose next status…" />
                </SelectTrigger>
                <SelectContent>
                  {filteredAllowedNext.map(s => (
                    <SelectItem key={s} value={s}>
                      {s.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <input
                type="text"
                className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
                placeholder="Optional note (e.g. tracking number)"
                value={note}
                onChange={e => setNote(e.target.value)}
              />
              <Button
                onClick={handleUpdateStatus}
                disabled={!selectedStatus || updateStatus.isPending}
              >
                {updateStatus.isPending ? "Updating…" : "Update"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Status history */}
      {order.statusHistory && order.statusHistory.length > 0 && (
        <Card className="border-border">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="h-4 w-4" /> Status History
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {[...order.statusHistory].reverse().map((h) => (
                <div key={h.id} className="flex gap-3 items-start">
                  <div className="mt-1">
                    <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-sm">
                        {h.toStatus.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}
                      </span>
                      {h.fromStatus && (
                        <span className="text-xs text-muted-foreground">
                          ← {h.fromStatus.replace(/_/g, " ")}
                        </span>
                      )}
                      <span className="text-xs text-muted-foreground ml-auto">
                        {formatDateTime(h.createdAt)}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">by {h.changedByName ?? "Unknown"}</p>
                    {h.note && <p className="text-sm text-muted-foreground italic mt-1">"{h.note}"</p>}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
