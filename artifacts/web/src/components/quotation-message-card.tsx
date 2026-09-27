import { useState } from "react";
import { useAcceptQuotation, useRejectQuotation, useSendConversationQuotation, getGetConversationQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { CheckCircle2, XCircle, ClipboardList, Car, Clock, MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface QuotationSummary {
  id: string;
  vehicleTitle?: string | null;
  vehiclePrimaryImage?: string | null;
  quantity: number;
  unitPriceUsd: number;
  shippingFeeUsd?: number | null;
  inspectionFeeUsd?: number | null;
  otherFeesUsd?: number | null;
  totalAmountUsd: number;
  notes?: string | null;
  status: string;
  expiresAt: string;
}

interface QuotationMessageCardProps {
  quotation: QuotationSummary;
  isMine: boolean;
  canAct: boolean;
  canReject?: boolean;
  canCounter?: boolean;
  conversationId: string;
  onQuotationUpdated?: (updatedQuotation: QuotationSummary) => void;
  onQuotationSent?: (message: any) => void;
}

const STATUS_CONFIG: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  pending:   { label: "Pending Review", variant: "default" },
  accepted:  { label: "Accepted",       variant: "secondary" },
  rejected:  { label: "Rejected",       variant: "destructive" },
  expired:   { label: "Expired",        variant: "outline" },
  cancelled: { label: "Cancelled",      variant: "outline" },
};

function fmt(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function QuotationMessageCard({
  quotation: initial,
  isMine,
  canAct,
  canReject = true,
  canCounter = true,
  conversationId,
  onQuotationUpdated,
  onQuotationSent,
}: QuotationMessageCardProps) {
  const [q, setQ] = useState(initial);
  const qc = useQueryClient();
  const accept = useAcceptQuotation();
  const reject = useRejectQuotation();
  const sendQuotation = useSendConversationQuotation();
  const [counterOpen, setCounterOpen] = useState(false);
  const [counterForm, setCounterForm] = useState({
    quantity: String(initial.quantity),
    unitPriceUsd: String(initial.unitPriceUsd),
    notes: initial.notes ?? "",
    expiresAt: initial.expiresAt.slice(0, 10),
  });

  const isPending = q.status === "pending";
  const cfg = STATUS_CONFIG[q.status] ?? { label: q.status, variant: "outline" as const };

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: getGetConversationQueryKey(conversationId) });
  };

  const handleAccept = async () => {
    try {
      await accept.mutateAsync({ quotationId: q.id });
      const updated = { ...q, status: "accepted" };
      setQ(updated);
      onQuotationUpdated?.(updated);
      invalidate();
      toast.success("Quotation accepted — an order has been created.");
    } catch {
      toast.error("Failed to accept quotation. Please try again.");
    }
  };

  const handleReject = async () => {
    try {
      await reject.mutateAsync({ quotationId: q.id });
      const updated = { ...q, status: "rejected" };
      setQ(updated);
      onQuotationUpdated?.(updated);
      invalidate();
      toast.info("Quotation rejected.");
    } catch {
      toast.error("Failed to reject quotation. Please try again.");
    }
  };

  const handleCounterOffer = async () => {
    if (!counterForm.quantity || Number(counterForm.quantity) < 1 ||
        !counterForm.unitPriceUsd || Number(counterForm.unitPriceUsd) <= 0 ||
        !counterForm.expiresAt) return;
    try {
      const message = await sendQuotation.mutateAsync({
        conversationId,
        data: {
          quantity: Number(counterForm.quantity),
          unitPriceUsd: Number(counterForm.unitPriceUsd),
          notes: counterForm.notes.trim() || undefined,
          expiresAt: new Date(counterForm.expiresAt).toISOString(),
        },
      });
      onQuotationSent?.(message);
      invalidate();
      setCounterOpen(false);
      toast.success("Counter-offer sent to the seller.");
    } catch {
      toast.error("Failed to send counter-offer. Please try again.");
    }
  };

  const setCounterField = (field: keyof typeof counterForm) =>
    (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setCounterForm((current) => ({ ...current, [field]: event.target.value }));

  return (
    <div
      className={cn(
        "rounded-xl border shadow-sm overflow-hidden w-full max-w-sm",
        isMine
          ? "border-primary/30 bg-primary/5"
          : "border-border bg-card"
      )}
    >
      {/* Header */}
      <div className={cn(
        "flex items-center gap-2 px-4 py-2.5",
        isMine ? "bg-primary/10" : "bg-muted/40"
      )}>
        <ClipboardList className="h-4 w-4 text-primary shrink-0" />
        <span className="font-semibold text-sm flex-1">Quotation</span>
        <Badge variant={cfg.variant} className="text-[10px] px-2 py-0.5">{cfg.label}</Badge>
      </div>

      {/* Vehicle */}
      {q.vehicleTitle && (
        <div className="flex items-center gap-2 px-4 pt-3 pb-1">
          {q.vehiclePrimaryImage ? (
            <img
              src={q.vehiclePrimaryImage}
              alt={q.vehicleTitle}
              className="h-10 w-14 object-cover rounded-md border border-border shrink-0"
            />
          ) : (
            <div className="h-10 w-14 rounded-md bg-muted border border-border flex items-center justify-center shrink-0">
              <Car className="h-4 w-4 text-muted-foreground" />
            </div>
          )}
          <p className="text-sm font-medium leading-tight">{q.vehicleTitle}</p>
        </div>
      )}

      {/* Price breakdown */}
      <div className="px-4 py-3 space-y-1.5 text-sm">
        <div className="flex justify-between text-muted-foreground">
          <span>Unit price × {q.quantity}</span>
          <span className="font-medium text-foreground">{fmt(q.unitPriceUsd)} × {q.quantity}</span>
        </div>
        {q.shippingFeeUsd != null && q.shippingFeeUsd > 0 && (
          <div className="flex justify-between text-muted-foreground">
            <span>Shipping</span>
            <span>{fmt(q.shippingFeeUsd)}</span>
          </div>
        )}
        {q.inspectionFeeUsd != null && q.inspectionFeeUsd > 0 && (
          <div className="flex justify-between text-muted-foreground">
            <span>Inspection</span>
            <span>{fmt(q.inspectionFeeUsd)}</span>
          </div>
        )}
        {q.otherFeesUsd != null && q.otherFeesUsd > 0 && (
          <div className="flex justify-between text-muted-foreground">
            <span>Other fees</span>
            <span>{fmt(q.otherFeesUsd)}</span>
          </div>
        )}
        <Separator className="my-1" />
        <div className="flex justify-between font-bold text-base">
          <span>Total</span>
          <span className="text-primary">{fmt(q.totalAmountUsd)}</span>
        </div>
      </div>

      {/* Notes */}
      {q.notes && (
        <div className="px-4 pb-2">
          <p className="text-xs text-muted-foreground italic bg-muted/30 rounded px-2 py-1.5 border border-border/50">
            {q.notes}
          </p>
        </div>
      )}

      {/* Expiry */}
      <div className="px-4 pb-3 flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <Clock className="h-3 w-3 shrink-0" />
        Expires {fmtDate(q.expiresAt)}
      </div>

      {/* Actions — buyer only, pending only */}
      {canAct && isPending && (
        <div className="flex border-t border-border">
          {canReject && <Button
            variant="ghost"
            className="flex-1 rounded-none text-destructive hover:bg-destructive/10 hover:text-destructive gap-1.5 h-10 text-sm"
            onClick={handleReject}
            disabled={reject.isPending || accept.isPending}
          >
            <XCircle className="h-4 w-4" />
            Reject
          </Button>}
          {canReject && <div className="w-px bg-border" />}
          {canCounter && <Button
            variant="ghost"
            className="flex-1 rounded-none text-primary hover:bg-primary/10 gap-1.5 h-10 text-sm"
            onClick={() => setCounterOpen(true)}
            disabled={sendQuotation.isPending || reject.isPending || accept.isPending}
          >
            <MessageSquare className="h-4 w-4" />
            Counter
          </Button>}
          {(canReject || canCounter) && <div className="w-px bg-border" />}
          <Button
            variant="ghost"
            className="flex-1 rounded-none rounded-br-xl text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700 dark:hover:bg-emerald-950/40 gap-1.5 h-10 text-sm"
            onClick={handleAccept}
            disabled={accept.isPending || reject.isPending}
          >
            <CheckCircle2 className="h-4 w-4" />
            Accept
          </Button>
        </div>
      )}

      <Dialog open={counterOpen} onOpenChange={setCounterOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Make a counter-offer</DialogTitle>
            <DialogDescription>
              Adjust the seller's price and quantity, then send your proposal in this conversation.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor={`counter-quantity-${q.id}`}>Quantity</Label>
                <Input id={`counter-quantity-${q.id}`} type="number" min="1" value={counterForm.quantity} onChange={setCounterField("quantity")} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`counter-price-${q.id}`}>Unit price (USD)</Label>
                <Input id={`counter-price-${q.id}`} type="number" min="0.01" step="0.01" value={counterForm.unitPriceUsd} onChange={setCounterField("unitPriceUsd")} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`counter-notes-${q.id}`}>Notes (optional)</Label>
              <Textarea id={`counter-notes-${q.id}`} value={counterForm.notes} onChange={setCounterField("notes")} placeholder="Add a note for the seller" rows={3} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`counter-expires-${q.id}`}>Offer expires</Label>
              <Input id={`counter-expires-${q.id}`} type="date" value={counterForm.expiresAt} onChange={setCounterField("expiresAt")} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCounterOpen(false)}>Cancel</Button>
            <Button onClick={handleCounterOffer} disabled={sendQuotation.isPending}>
              {sendQuotation.isPending ? "Sending…" : "Send counter-offer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Status confirmation */}
      {!isPending && (
        <div className={cn(
          "flex items-center justify-center gap-1.5 py-2 border-t border-border text-xs font-medium",
          q.status === "accepted"
            ? "text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30"
            : "text-muted-foreground bg-muted/30"
        )}>
          {q.status === "accepted"
            ? <><CheckCircle2 className="h-3.5 w-3.5" /> Quotation accepted</>
            : q.status === "rejected"
              ? <><XCircle className="h-3.5 w-3.5 text-destructive" /><span className="text-destructive">Quotation rejected</span></>
              : null}
        </div>
      )}
    </div>
  );
}
