import { useState, useRef, useEffect } from "react";
import { useRoute, Link, Redirect } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetOrder, useUpdateOrderStatus, getGetOrderQueryKey,
  useGetOrderPayment, getGetOrderPaymentQueryKey, useVerifyPayment,
} from "@workspace/api-client-react";
import { AdminLayout } from "@/components/admin-layout";
import { useAdminPermissions } from "@/hooks/use-admin-permissions";
import { useFormatters } from "@/hooks/use-formatters";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  ArrowLeft, PackageCheck, User, Car, DollarSign, Clock,
  CheckCircle2, XCircle, Circle, MessageSquare, FileText, Upload, Download, Trash2,
} from "lucide-react";
import { ObjectUploader } from "@workspace/object-storage-web";
import { useRequestUploadUrl } from "@workspace/api-client-react";

const ALL_STATUSES = [
  "quotation_accepted", "awaiting_payment", "payment_received",
  "payment_verified", "seller_payment", "documents_preparation",
  "booking_shipping", "in_production", "ready_to_ship", "shipped",
  "arrived", "delivered", "closed", "cancelled",
];

const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  inquiry: ["quotation_sent", "cancelled"],
  quotation_sent: ["quotation_accepted", "cancelled"],
  quotation_accepted: ["awaiting_payment", "cancelled"],
  awaiting_payment: ["payment_received", "payment_verified", "cancelled"],
  payment_received: ["seller_payment", "payment_verified"],
  payment_verified: ["seller_payment", "in_production"],
  seller_payment: ["documents_preparation"],
  documents_preparation: ["booking_shipping"],
  booking_shipping: ["ready_to_ship"],
  in_production: ["ready_to_ship", "cancelled"],
  ready_to_ship: ["shipped", "cancelled"],
  shipped: ["arrived", "delivered"],
  arrived: ["delivered"],
  delivered: ["closed"],
  closed: [],
  cancelled: [],
};

const STATUS_COLORS: Record<string, string> = {
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

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center px-3 py-1.5 rounded-full text-sm font-medium border ${STATUS_COLORS[status] ?? ""}`}>
      {status.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}
    </span>
  );
}

function TimelineEntry({
  fromStatus, toStatus, changedByName, note, createdAt, formatDate,
}: {
  fromStatus?: string | null; toStatus: string; changedByName?: string | null;
  note?: string | null; createdAt: string; formatDate: (d: string) => string;
}) {
  const isCancelled = toStatus === "cancelled";
  const isDelivered = toStatus === "delivered" || toStatus === "closed";
  return (
    <div className="flex gap-3 pb-6 last:pb-0">
      <div className="flex flex-col items-center">
        <div className={`w-8 h-8 rounded-full border-2 flex items-center justify-center shrink-0 ${
          isCancelled ? "border-red-500 bg-red-500/10" :
          isDelivered ? "border-green-500 bg-green-500/10" :
          "border-primary bg-primary/10"
        }`}>
          {isCancelled ? <XCircle className="h-4 w-4 text-red-500" /> :
           isDelivered ? <CheckCircle2 className="h-4 w-4 text-green-500" /> :
           <Circle className="h-4 w-4 text-primary fill-primary" />}
        </div>
        <div className="w-0.5 flex-1 bg-border mt-1" />
      </div>
      <div className="pb-2 min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={toStatus} />
          {fromStatus && (
            <span className="text-xs text-muted-foreground">
              from {fromStatus.replace(/_/g, " ")}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
          <Clock className="h-3 w-3 shrink-0" />
          <span>{formatDate(createdAt)}</span>
          {changedByName && <><span>·</span><span>{changedByName}</span></>}
        </div>
        {note && <p className="text-xs text-muted-foreground italic mt-1">{note}</p>}
      </div>
    </div>
  );
}

function OrderDocuments({ orderId }: { orderId: string }) {
  const [documents, setDocuments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const requestUploadUrl = useRequestUploadUrl();
  const pendingRef = useRef<{ fileName: string; contentType: string; sizeBytes: number; objectPath: string } | null>(null);

  const load = async () => {
    const token = localStorage.getItem("ac_access_token");
    const response = await fetch(`/api/orders/${orderId}/documents`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (response.ok) setDocuments((await response.json()).data ?? []);
    setLoading(false);
  };
  useEffect(() => { void load(); }, [orderId]);

  const getUploadParameters = async (file: any) => {
    const result = await requestUploadUrl.mutateAsync({
      data: { name: file.name, size: file.size, contentType: file.type || "application/octet-stream" },
    });
    pendingRef.current = { fileName: file.name, contentType: file.type || "application/octet-stream", sizeBytes: file.size, objectPath: result.objectPath };
    return { method: "PUT" as const, url: result.uploadURL, headers: { "Content-Type": file.type || "application/octet-stream" } };
  };

  const saveDocument = async () => {
    const metadata = pendingRef.current;
    if (!metadata) return;
    setUploading(true);
    const token = localStorage.getItem("ac_access_token");
    await fetch(`/api/orders/${orderId}/documents`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(metadata),
    });
    pendingRef.current = null;
    pendingRef.current = null;
    await load();
    setUploading(false);
  };

  const deleteDocument = async (documentId: string) => {
    const token = localStorage.getItem("ac_access_token");
    await fetch(`/api/orders/${orderId}/documents/${documentId}`, {
      method: "DELETE", headers: { Authorization: `Bearer ${token}` },
    });
    await load();
  };

  return (
    <Card className="border-border">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2"><FileText className="h-4 w-4 text-primary" /> Documents</CardTitle>
        <p className="text-sm text-muted-foreground mt-1">Upload Bills of Lading, invoices, packing lists, and other order files.</p>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? <Skeleton className="h-12" /> : documents.map(doc => (
          <div key={doc.id} className="flex items-center gap-3 rounded-lg border p-3">
            <FileText className="h-4 w-4 text-muted-foreground" />
            <div className="min-w-0 flex-1"><p className="text-sm font-medium truncate">{doc.fileName}</p><p className="text-xs text-muted-foreground">{doc.documentType}</p></div>
            <a className="text-primary" href={`/api/storage/objects/${encodeURIComponent(doc.objectPath.replace(/^\/objects\//, ""))}`} target="_blank" rel="noreferrer"><Download className="h-4 w-4" /></a>
            <Button variant="ghost" size="icon" onClick={() => void deleteDocument(doc.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
          </div>
        ))}
        <div className="flex items-center gap-2">
          <ObjectUploader maxNumberOfFiles={1} maxFileSize={25 * 1024 * 1024} onGetUploadParameters={getUploadParameters} onComplete={() => void saveDocument()} buttonClassName="flex items-center gap-2 px-3 py-2 rounded-md border text-sm hover:bg-muted">
            <Upload className="h-4 w-4" /> Upload document
          </ObjectUploader>
          {uploading && <span className="text-xs text-muted-foreground">Saving…</span>}
        </div>
      </CardContent>
    </Card>
  );
}

function PaymentReviewCard({ orderId }: { orderId: string }) {
  const { formatCurrency } = useFormatters();
  const qc = useQueryClient();
  const { data: payment, isLoading } = useGetOrderPayment(orderId, {
    query: { queryKey: getGetOrderPaymentQueryKey(orderId), retry: false },
  });
  const verify = useVerifyPayment({
    mutation: {
      onSuccess: () => {
        toast.success("Payment approved");
        qc.invalidateQueries({ queryKey: getGetOrderPaymentQueryKey(orderId) });
        qc.invalidateQueries({ queryKey: getGetOrderQueryKey(orderId) });
      },
      onError: (err: any) => toast.error(err?.response?.data?.error ?? "Failed to approve payment"),
    },
  });

  if (isLoading) return <Skeleton className="h-40" />;
  if (!payment) return null;
  const objectLink = (path: string) =>
    `/api/storage/objects/${encodeURIComponent(path.replace(/^\/objects\//, ""))}`;
  const pending = payment.status === "pending_review";

  return (
    <Card className="border-amber-500/30 bg-amber-500/5">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-base flex items-center gap-2">
            <DollarSign className="h-4 w-4 text-amber-500" /> Payment Proof
          </CardTitle>
          <span className={`text-xs font-medium px-2 py-1 rounded border ${
            pending ? "text-amber-600 border-amber-500/30 bg-amber-500/10" :
            payment.status === "verified" ? "text-emerald-600 border-emerald-500/30 bg-emerald-500/10" :
            "text-red-600 border-red-500/30 bg-red-500/10"
          }`}>
            {payment.status.replace(/_/g, " ")}
          </span>
        </div>
        <p className="text-sm text-muted-foreground mt-1">
          Review the buyer’s transfer details and uploaded proof before approving this payment.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <div><p className="text-xs text-muted-foreground">Reference</p><p className="font-mono mt-1 truncate">{payment.referenceNumber}</p></div>
          <div><p className="text-xs text-muted-foreground">Bank</p><p className="mt-1">{payment.bankName}</p></div>
          <div><p className="text-xs text-muted-foreground">Payment date</p><p className="mt-1">{payment.paymentDate}</p></div>
          <div><p className="text-xs text-muted-foreground">Amount</p><p className="font-semibold mt-1">{formatCurrency(payment.amount, payment.currency)}</p></div>
        </div>
        <div className="flex flex-wrap gap-4 text-sm">
          {payment.receiptObjectPath && <a href={objectLink(payment.receiptObjectPath)} target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-2">View bank receipt</a>}
          {payment.proofObjectPath && <a href={objectLink(payment.proofObjectPath)} target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-2">View transfer proof</a>}
        </div>
        {payment.rejectionNote && <p className="text-xs text-red-500">Previous rejection: {payment.rejectionNote}</p>}
        {pending && (
          <Button
            className="w-full sm:w-auto bg-emerald-600 hover:bg-emerald-700"
            disabled={verify.isPending}
            onClick={() => verify.mutate({ paymentId: payment.id })}
          >
            <CheckCircle2 className="h-4 w-4 mr-2" />
            {verify.isPending ? "Approving…" : "Approve Payment"}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

export default function AdminOrderDetail() {
  const [, params] = useRoute("/admin/orders/:id");
  const orderId = params?.id ?? "";
  const { user } = useAuth();
  const { can, isLoading: permLoading } = useAdminPermissions();
  const { formatCurrency, formatDate } = useFormatters();
  const qc = useQueryClient();
  const isSuperAdmin = user?.role === "super_admin";
  const canViewCommission = isSuperAdmin || can("commission_management");

  if (!permLoading && !can("order_management")) {
    return <Redirect to="/admin/dashboard" />;
  }

  const [newStatus, setNewStatus] = useState("");
  const [note, setNote] = useState("");

  const { data: order, isLoading, error } = useGetOrder(orderId, {
    query: { queryKey: getGetOrderQueryKey(orderId), enabled: !!orderId },
  });

  const updateMut = useUpdateOrderStatus({
    mutation: {
      onSuccess: () => {
        toast.success("Order status updated");
        setNewStatus("");
        setNote("");
        qc.invalidateQueries({ queryKey: getGetOrderQueryKey(orderId) });
      },
      onError: (err: any) => {
        toast.error(err?.response?.data?.error ?? "Failed to update status");
      },
    },
  });

  const allowedNext = order
    ? isSuperAdmin
      ? ALL_STATUSES.filter(s => s !== order.status)
      : (ALLOWED_TRANSITIONS[order.status] ?? [])
    : [];

  function handleStatusUpdate() {
    if (!newStatus) return;
    updateMut.mutate({ orderId, data: { status: newStatus as any, note: note || undefined } });
  }

  if (isLoading) {
    return (
      <AdminLayout>
        <div className="p-6 lg:p-8 max-w-5xl mx-auto space-y-6">
          <Skeleton className="h-8 w-48" />
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Skeleton className="h-64 lg:col-span-2" />
            <Skeleton className="h-64" />
          </div>
        </div>
      </AdminLayout>
    );
  }

  if (error || !order) {
    return (
      <AdminLayout>
        <div className="p-6 lg:p-8 max-w-5xl mx-auto">
          <Button variant="ghost" asChild className="mb-4">
            <Link href="/admin/orders"><ArrowLeft className="h-4 w-4 mr-2" />Back to Orders</Link>
          </Button>
          <p className="text-muted-foreground">Order not found.</p>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="p-6 lg:p-8 max-w-5xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/admin/orders"><ArrowLeft className="h-4 w-4" /></Link>
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <PackageCheck className="h-6 w-6 text-primary" />
              <h1 className="text-2xl font-bold tracking-tight">
                {order.orderNumber ?? `Order ${orderId.slice(0, 8)}`}
              </h1>
              <StatusBadge status={order.status} />
            </div>
            <p className="text-sm text-muted-foreground ml-9">
              Created {formatDate(order.createdAt)}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main details */}
          <div className="lg:col-span-2 space-y-6">
            {/* Order info */}
            <Card className="border-border">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Car className="h-4 w-4 text-muted-foreground" /> Vehicle & Pricing
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Vehicle</span>
                  <span className="font-medium">{order.vehicleTitle ?? order.vehicleId.slice(0, 8)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Quantity</span>
                  <span>{order.quantity} unit{order.quantity !== 1 ? "s" : ""}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Unit Price</span>
                  <span>{formatCurrency(order.unitPriceUsd)}</span>
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
                <div className="flex justify-between pt-2 border-t border-border">
                  <span className="font-semibold flex items-center gap-1">
                    <DollarSign className="h-3.5 w-3.5 text-muted-foreground" /> Total
                  </span>
                  <span className="font-bold text-base">{formatCurrency(order.totalAmountUsd)}</span>
                </div>
              </CardContent>
            </Card>

            {/* Parties */}
            <div className="grid grid-cols-2 gap-4">
              <Card className="border-border">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <User className="h-4 w-4 text-muted-foreground" /> Buyer
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-sm">
                  <p className="font-medium">{order.buyerName ?? "—"}</p>
                  <p className="text-xs text-muted-foreground font-mono mt-1">{order.buyerId.slice(0, 12)}…</p>
                </CardContent>
              </Card>
              <Card className="border-border">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <User className="h-4 w-4 text-muted-foreground" /> Seller
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-sm">
                  <p className="font-medium">{order.sellerName ?? "—"}</p>
                  <p className="text-xs text-muted-foreground font-mono mt-1">{order.sellerId.slice(0, 12)}…</p>
                </CardContent>
              </Card>
            </div>

            {/* Financial Summary — visible to super_admin or commission_management */}
            {canViewCommission && (
              <Card className="border-emerald-500/20 bg-emerald-500/5">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2 text-emerald-700 dark:text-emerald-400">
                    <DollarSign className="h-4 w-4" /> Financial Summary
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">FOB Vehicle Price</span>
                    <span className="font-mono">
                      {(order as any).fobTotalUsd != null ? formatCurrency((order as any).fobTotalUsd) : "—"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Platform Commission</span>
                    <span className="font-mono text-emerald-600 font-medium">
                      {(order as any).commissionAmountUsd != null ? (
                        (order as any).commissionType === "percentage" && (order as any).commissionValue != null
                          ? `${Number((order as any).commissionValue).toFixed(2)}% (${formatCurrency((order as any).commissionAmountUsd)})`
                          : formatCurrency((order as any).commissionAmountUsd)
                      ) : "No commission"}
                    </span>
                  </div>
                  <div className="flex justify-between pt-2 border-t border-emerald-500/20">
                    <span className="font-bold">Final Marketplace Price</span>
                    <span className="font-bold font-mono text-primary">{formatCurrency(order.totalAmountUsd)}</span>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Notes */}
            {order.notes && (
              <Card className="border-border">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Notes</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">{order.notes}</p>
                </CardContent>
              </Card>
            )}

            {/* Status Timeline */}
            <Card className="border-border">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Status Timeline</CardTitle>
              </CardHeader>
              <CardContent>
                {(order.statusHistory ?? []).length === 0 ? (
                  <p className="text-sm text-muted-foreground">No history yet.</p>
                ) : (
                  <div className="mt-1">
                    {[...(order.statusHistory ?? [])].reverse().map(h => (
                      <TimelineEntry
                        key={h.id}
                        fromStatus={h.fromStatus}
                        toStatus={h.toStatus}
                        changedByName={h.changedByName}
                        note={h.note}
                        createdAt={h.createdAt}
                        formatDate={formatDate}
                      />
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
            <OrderDocuments orderId={orderId} />
            <PaymentReviewCard orderId={orderId} />
          </div>

          {/* Right column: Status update */}
          <div className="space-y-6">
            <Card className="border-border">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Update Status</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {allowedNext.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No further transitions available.
                  </p>
                ) : (
                  <>
                    <Select value={newStatus} onValueChange={setNewStatus}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select new status…" />
                      </SelectTrigger>
                      <SelectContent>
                        {allowedNext.map(s => (
                          <SelectItem key={s} value={s}>
                            {s.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Textarea
                      placeholder="Optional note…"
                      value={note}
                      onChange={e => setNote(e.target.value)}
                      rows={2}
                      className="resize-none"
                    />
                    <Button
                      className="w-full"
                      disabled={!newStatus || updateMut.isPending}
                      onClick={handleStatusUpdate}
                    >
                      {updateMut.isPending ? "Updating…" : "Update Status"}
                    </Button>
                    {isSuperAdmin && (
                      <p className="text-xs text-muted-foreground text-center">
                        Super admin — all transitions available
                      </p>
                    )}
                  </>
                )}
              </CardContent>
            </Card>

            <Card className="border-border">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Order Details</CardTitle>
              </CardHeader>
              <CardContent className="text-xs space-y-2 text-muted-foreground">
                <div className="flex justify-between">
                  <span>Order ID</span>
                  <span className="font-mono">{orderId.slice(0, 12)}…</span>
                </div>
                {order.quotationId && (
                  <div className="flex justify-between items-center">
                    <span>Quotation</span>
                    <Link href={`/admin/quotations/${order.quotationId}`} className="font-mono text-primary hover:underline">
                      {order.quotationId.slice(0, 12)}…
                    </Link>
                  </div>
                )}
                <div className="flex justify-between">
                  <span>Created</span>
                  <span>{formatDate(order.createdAt)}</span>
                </div>
                {order.updatedAt && (
                  <div className="flex justify-between">
                    <span>Updated</span>
                    <span>{formatDate(order.updatedAt)}</span>
                  </div>
                )}
              </CardContent>
            </Card>

            {(isSuperAdmin || can("messages_management")) && (
              <Card className="border-border">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Internal Messages</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <Button variant="outline" size="sm" className="w-full justify-start" asChild>
                    <Link href={`/admin/messages?referenceType=order&referenceId=${orderId}&referenceNumber=${encodeURIComponent(order.orderNumber ?? orderId)}`}>
                      <MessageSquare className="h-4 w-4 mr-2" />
                      View Related Messages
                    </Link>
                  </Button>
                  <Button variant="outline" size="sm" className="w-full justify-start" asChild>
                    <Link href={`/admin/messages/new?referenceType=order&referenceId=${orderId}&referenceNumber=${encodeURIComponent(order.orderNumber ?? orderId)}&subject=${encodeURIComponent(`Discussion re: ${order.orderNumber ?? orderId}`)}`}>
                      <MessageSquare className="h-4 w-4 mr-2" />
                      New Message about this Order
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
