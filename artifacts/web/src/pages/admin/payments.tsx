import { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useFormatters } from "@/hooks/use-formatters";
import { useLocation, useParams } from "wouter";
import {
  useListPayments,
  useVerifyPayment,
  useRejectPayment,
  getListPaymentsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { useAdminPermissions } from "@/hooks/use-admin-permissions";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft,
  CheckCircle2,
  XCircle,
  Clock,
  CreditCard,
  ExternalLink,
  FileText,
  Building2,
  Calendar,
  DollarSign,
  Hash,
} from "lucide-react";
import type { PaymentRecord } from "@workspace/api-client-react";

type PaymentStatus = "pending_review" | "verified" | "rejected";

const STATUS_COLORS: Record<PaymentStatus, string> = {
  pending_review: "bg-amber-500/15 text-amber-500 border-amber-500/30",
  verified: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30",
  rejected: "bg-red-500/15 text-red-500 border-red-500/30",
};

const STATUS_ICONS: Record<PaymentStatus, React.ComponentType<{ className?: string }>> = {
  pending_review: Clock,
  verified: CheckCircle2,
  rejected: XCircle,
};

function PaymentStatusBadge({ status }: { status: PaymentStatus }) {
  const Icon = STATUS_ICONS[status] ?? Clock;
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${STATUS_COLORS[status] ?? ""}`}
    >
      <Icon className="h-3 w-3" />
      {status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
    </span>
  );
}

function ProofLink({ path, label }: { path: string | null | undefined; label: string }) {
  const { t } = useTranslation();
  if (!path) return <span className="text-muted-foreground text-xs italic">{t("adminPayments.notProvided")}</span>;
  const url = `/api/storage/objects/${encodeURIComponent(path.replace(/^\/objects\//, ""))}`;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-xs text-primary underline underline-offset-2 hover:opacity-80"
    >
      <ExternalLink className="h-3 w-3" />
      {label}
    </a>
  );
}

function PaymentCard({
  payment,
  onVerify,
  onReject,
  isActing,
  highlighted = false,
}: {
  payment: PaymentRecord;
  onVerify: (p: PaymentRecord) => void;
  onReject: (p: PaymentRecord) => void;
  isActing: boolean;
  highlighted?: boolean;
}) {
  const { t } = useTranslation();
  const { formatCurrency, formatDateTime } = useFormatters();
  const isPending = payment.status === "pending_review";
  return (
    <Card className={`border-border transition-all ${highlighted ? "ring-2 ring-primary ring-offset-2" : ""}`}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <CardTitle className="text-base font-semibold truncate">
                {t("adminPayments.orderHash", { id: payment.orderId.slice(0, 8) })}…
              </CardTitle>
              <PaymentStatusBadge status={payment.status as PaymentStatus} />
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {t("adminPayments.submittedBy")} {payment.submittedByName ?? payment.submittedById.slice(0, 10)} ·{" "}
              {formatDateTime(payment.createdAt)}
            </p>
          </div>
          {isPending && (
            <div className="flex gap-2 shrink-0">
              <Button
                size="sm"
                variant="outline"
                className="text-emerald-500 border-emerald-500/40 hover:bg-emerald-500/10"
                onClick={() => onVerify(payment)}
                disabled={isActing}
              >
                <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                {t("adminPayments.verify")}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="text-red-500 border-red-500/40 hover:bg-red-500/10"
                onClick={() => onReject(payment)}
                disabled={isActing}
              >
                <XCircle className="h-3.5 w-3.5 mr-1" />
                {t("adminPayments.rejectBtn")}
              </Button>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <div className="space-y-1">
            <div className="flex items-center gap-1 text-muted-foreground text-xs">
              <Hash className="h-3 w-3" /> {t("adminPayments.reference")}
            </div>
            <p className="font-mono font-medium text-xs truncate">{payment.referenceNumber}</p>
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-1 text-muted-foreground text-xs">
              <Building2 className="h-3 w-3" /> {t("adminPayments.bank")}
            </div>
            <p className="font-medium text-xs">{payment.bankName}</p>
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-1 text-muted-foreground text-xs">
              <Calendar className="h-3 w-3" /> {t("adminPayments.paymentDate")}
            </div>
            <p className="font-medium text-xs">{payment.paymentDate}</p>
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-1 text-muted-foreground text-xs">
              <DollarSign className="h-3 w-3" /> {t("adminPayments.amount")}
            </div>
            <p className="font-bold text-sm">
              {formatCurrency(payment.amount, payment.currency)}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-6 flex-wrap text-xs">
          <div className="space-y-0.5">
            <p className="text-muted-foreground">{t("adminPayments.receipt")}</p>
            <ProofLink path={payment.receiptObjectPath} label={t("adminPayments.viewReceipt")} />
          </div>
          <div className="space-y-0.5">
            <p className="text-muted-foreground">{t("adminPayments.proofOfTransfer")}</p>
            <ProofLink path={payment.proofObjectPath} label={t("adminPayments.viewProof")} />
          </div>
        </div>

        {payment.status === "rejected" && payment.rejectionNote && (
          <div className="p-3 rounded-md bg-red-500/10 border border-red-500/20 text-xs text-red-400">
            <strong>{t("adminPayments.rejectionNote")}</strong> {payment.rejectionNote}
          </div>
        )}

        {payment.status === "verified" && payment.verifiedByName && (
          <p className="text-xs text-muted-foreground">
            {t("adminPayments.verifiedBy")} {payment.verifiedByName}{" "}
            {payment.verifiedAt ? `at ${formatDateTime(payment.verifiedAt)}` : ""}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export default function AdminPayments() {
  const { t } = useTranslation();
  const { formatCurrency } = useFormatters();
  const { user } = useAuth();
  const { can, isLoading: permLoading } = useAdminPermissions();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { paymentId: highlightedId } = useParams<{ paymentId?: string }>();
  const highlightRef = useRef<HTMLDivElement>(null);

  const [statusFilter, setStatusFilter] = useState<string>(highlightedId ? "all" : "pending_review");
  const [actionPayment, setActionPayment] = useState<PaymentRecord | null>(null);
  const [actionType, setActionType] = useState<"verify" | "reject" | null>(null);
  const [rejectNote, setRejectNote] = useState("");

  const verify = useVerifyPayment();
  const reject = useRejectPayment();

  const { data, isLoading } = useListPayments(
    statusFilter !== "all" ? { status: statusFilter as PaymentStatus } : {},
    { query: { queryKey: getListPaymentsQueryKey({ status: statusFilter as any }) } },
  );

  const isActing = verify.isPending || reject.isPending;

  // Scroll highlighted payment into view once data loads
  useEffect(() => {
    if (highlightedId && highlightRef.current) {
      setTimeout(() => highlightRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 200);
    }
  }, [highlightedId, data]);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/payments"] });
  };

  const handleVerify = (payment: PaymentRecord) => {
    setActionPayment(payment);
    setActionType("verify");
  };

  const handleReject = (payment: PaymentRecord) => {
    setActionPayment(payment);
    setActionType("reject");
    setRejectNote("");
  };

  const handleClose = () => {
    setActionPayment(null);
    setActionType(null);
    setRejectNote("");
  };

  const handleConfirmVerify = () => {
    if (!actionPayment) return;
    verify.mutate(
      { paymentId: actionPayment.id },
      {
        onSuccess: () => {
          toast({ title: t("adminPayments.toastVerified"), description: t("adminPayments.toastVerifiedDesc") });
          invalidate();
          handleClose();
        },
        onError: (err: any) => {
          toast({
            title: t("adminPayments.toastFailed"),
            description: err?.message ?? "Could not verify payment.",
            variant: "destructive",
          });
        },
      },
    );
  };

  const handleConfirmReject = () => {
    if (!actionPayment) return;
    reject.mutate(
      { paymentId: actionPayment.id, data: { note: rejectNote || undefined } },
      {
        onSuccess: () => {
          toast({ title: t("adminPayments.toastRejected"), description: t("adminPayments.toastRejectedDesc") });
          invalidate();
          handleClose();
        },
        onError: (err: any) => {
          toast({
            title: t("adminPayments.toastFailed"),
            description: err?.message ?? "Could not reject payment.",
            variant: "destructive",
          });
        },
      },
    );
  };

  const isSuperAdmin = user?.role === "super_admin";
  const hasAccess = isSuperAdmin || (!permLoading && can("manage_payments"));

  if (!hasAccess && !permLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] text-muted-foreground">
        {t("adminPayments.accessDenied")}
      </div>
    );
  }

  const payments = data?.data ?? [];

  return (
    <div className="p-6 lg:p-8 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-4 flex-wrap">
        <Button variant="ghost" size="sm" onClick={() => setLocation("/dashboard")}>
          <ArrowLeft className="h-4 w-4 mr-2" /> {t("dashboard.overview")}
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <CreditCard className="h-6 w-6" /> {t("adminPayments.title")}
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {t("adminPayments.subtitle")}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="pending_review">{t("adminPayments.pendingReview")}</SelectItem>
            <SelectItem value="verified">{t("adminPayments.verified")}</SelectItem>
            <SelectItem value="rejected">{t("adminPayments.rejected")}</SelectItem>
            <SelectItem value="all">{t("adminPayments.all")}</SelectItem>
          </SelectContent>
        </Select>
        {data && (
          <span className="text-sm text-muted-foreground">
            {t("adminPayments.resultsCount", { count: data.total })}
          </span>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-40" />
          ))}
        </div>
      ) : payments.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <FileText className="h-10 w-10 text-muted-foreground opacity-20 mb-3" />
          <p className="text-muted-foreground font-medium">{t("adminPayments.noPayments")}</p>
          <p className="text-sm text-muted-foreground mt-1">
            {statusFilter === "pending_review"
              ? t("adminPayments.noPaymentsPending")
              : t("adminPayments.tryDifferentFilter")}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {payments.map((payment) => (
            <div key={payment.id} ref={payment.id === highlightedId ? highlightRef : undefined}>
              <PaymentCard
                payment={payment}
                onVerify={handleVerify}
                onReject={handleReject}
                isActing={isActing}
                highlighted={payment.id === highlightedId}
              />
            </div>
          ))}
        </div>
      )}

      <Dialog open={actionType === "verify" && !!actionPayment} onOpenChange={handleClose}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-emerald-500" /> {t("adminPayments.verifyTitle")}
            </DialogTitle>
            <DialogDescription>
              {t("adminPayments.verifyDesc")}
            </DialogDescription>
          </DialogHeader>
          {actionPayment && (
            <div className="space-y-2 text-sm border border-border rounded-md p-4 bg-muted/30">
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t("adminPayments.reference")}</span>
                <span className="font-mono">{actionPayment.referenceNumber}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t("adminPayments.bank")}</span>
                <span>{actionPayment.bankName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t("adminPayments.amount")}</span>
                <span className="font-bold">
                  {formatCurrency(actionPayment.amount, actionPayment.currency)}
                </span>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={handleClose}>
              {t("adminPayments.cancel")}
            </Button>
            <Button
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={handleConfirmVerify}
              disabled={verify.isPending}
            >
              {verify.isPending ? t("adminPayments.verifying") : t("adminPayments.confirmVerification")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={actionType === "reject" && !!actionPayment} onOpenChange={handleClose}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <XCircle className="h-5 w-5 text-red-500" /> {t("adminPayments.rejectTitle")}
            </DialogTitle>
            <DialogDescription>
              {t("adminPayments.rejectDesc")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <label className="text-sm font-medium">
              {t("adminPayments.rejectionReason")} <span className="text-muted-foreground">{t("adminPayments.optional")}</span>
            </label>
            <textarea
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none min-h-[80px]"
              placeholder={t("adminPayments.rejectionPlaceholder")}
              value={rejectNote}
              onChange={(e) => setRejectNote(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={handleClose}>
              {t("adminPayments.cancel")}
            </Button>
            <Button
              variant="destructive"
              onClick={handleConfirmReject}
              disabled={reject.isPending}
            >
              {reject.isPending ? t("adminPayments.rejecting") : t("adminPayments.confirmRejection")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
