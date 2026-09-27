import { useEffect, useRef, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useFormatters } from "@/hooks/use-formatters";
import { useParams, Link } from "wouter";
import {
  useGetConversation,
  useSendMessage,
  useMarkConversationRead,
  useSendConversationQuotation,
  useGetVehicle,
  getGetConversationQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { ChevronLeft, Send, Paperclip, Car, AlertTriangle, ClipboardList } from "lucide-react";
import { io, Socket } from "socket.io-client";
import { cn } from "@/lib/utils";
import { QuotationMessageCard } from "@/components/quotation-message-card";

let sellerSocketInstance: Socket | null = null;

function getSocket(): Socket {
  if (!sellerSocketInstance) {
    const token = localStorage.getItem("ac_access_token");
    sellerSocketInstance = io(window.location.origin, {
      path: "/api/socket.io",
      auth: { token },
      transports: ["websocket", "polling"],
    });
  }
  return sellerSocketInstance;
}

function MessageBubble({ msg, isMine }: { msg: any; isMine: boolean }) {
  const { t } = useTranslation();
  const { formatRelative, formatCurrency } = useFormatters();

  if (msg.messageType === "system") {
    return (
      <div className="flex justify-center my-1">
        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground bg-muted/60 border border-border/50 rounded-full px-3 py-1 italic">
          {msg.body}
        </span>
      </div>
    );
  }

  if (msg.messageType === "quotation" && msg.quotation) {
    return (
      <div className={cn("flex gap-2 max-w-[90%] sm:max-w-sm", isMine ? "ml-auto flex-row-reverse" : "mr-auto")}>
        <Avatar className="h-7 w-7 shrink-0 mt-1">
          <AvatarFallback className={cn("text-xs font-bold", isMine ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground")}>
            {msg.senderName ? msg.senderName[0].toUpperCase() : "?"}
          </AvatarFallback>
        </Avatar>
        <div className="space-y-1 flex-1">
          <QuotationMessageCard
            quotation={msg.quotation}
            isMine={isMine}
            canAct={!isMine}
            canReject={false}
            canCounter={false}
            conversationId={msg.conversationId}
          />
          <p className={cn("text-[10px] text-muted-foreground/60 px-1", isMine ? "text-right" : "text-left")}>
            {formatRelative(msg.createdAt)}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("flex gap-2 max-w-[80%]", isMine ? "ml-auto flex-row-reverse" : "mr-auto")}>
      <Avatar className="h-7 w-7 shrink-0 mt-1">
        <AvatarFallback className={cn("text-xs font-bold", isMine ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground")}>
          {msg.senderName ? msg.senderName[0].toUpperCase() : "?"}
        </AvatarFallback>
      </Avatar>
      <div className="space-y-1">
        <div
          className={cn(
            "rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed",
            isMine
              ? "bg-primary text-primary-foreground rounded-tr-sm"
              : "bg-card border border-border rounded-tl-sm"
          )}
        >
          {msg.body}
          {msg.wasScrubbedAt && (
            <div className="flex items-center gap-1 mt-1 text-xs opacity-70">
              <AlertTriangle className="h-3 w-3" />
              {t("conversations.contactInfoRemoved")}
            </div>
          )}
        </div>
        {msg.attachments?.map((att: any) => (
          <a key={att.id} href={att.url} target="_blank" rel="noopener noreferrer" className="block">
            {att.type === "image" ? (
              <img src={att.url} alt={att.filename ?? "attachment"} className="rounded-lg max-w-[200px] border border-border" />
            ) : (
              <div className="flex items-center gap-2 text-xs text-primary hover:underline">
                <Paperclip className="h-3 w-3" /> {att.filename ?? "Attachment"}
              </div>
            )}
          </a>
        ))}
        <p className={cn("text-[10px] text-muted-foreground/60 px-1", isMine ? "text-right" : "text-left")}>
          {formatRelative(msg.createdAt)}
          {isMine && msg.readAt && " · Read"}
        </p>
      </div>
    </div>
  );
}

const DEFAULT_FORM = {
  quantity: "1",
  unitPriceUsd: "",
  shippingFeeUsd: "",
  otherFeesUsd: "",
  notes: "",
  expiresAt: (() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return d.toISOString().slice(0, 10);
  })(),
};

export default function SellerConversationChat() {
  const { t } = useTranslation();
  const { formatCurrency } = useFormatters();
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [localMessages, setLocalMessages] = useState<any[]>([]);
  const [quotationOpen, setQuotationOpen] = useState(false);
  const [form, setForm] = useState(DEFAULT_FORM);
  const queryKey = getGetConversationQueryKey(id ?? "");

  const { data: conv, isLoading } = useGetConversation(
    id ?? "",
    { page: 1, limit: 50 },
    { query: { queryKey, enabled: !!id } }
  );

  const { data: vehicleData } = useGetVehicle(
    (conv as any)?.vehicleId ?? "",
    { query: { enabled: !!(conv as any)?.vehicleId } }
  );

  const markRead = useMarkConversationRead();
  const sendMsg = useSendMessage();
  const sendQuotation = useSendConversationQuotation();

  useEffect(() => {
    if (id && conv) markRead.mutate({ conversationId: id });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, conv?.id]);

  useEffect(() => {
    if (conv?.messages) setLocalMessages(conv.messages);
  }, [conv?.messages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [localMessages]);

  useEffect(() => {
    if (!id) return;
    const sock = getSocket();
    sock.emit("join_conversation", id);

    const handleNewMessage = (msg: any) => {
      setLocalMessages(prev => {
        if (prev.find(m => m.id === msg.id)) return prev;
        return [...prev, msg];
      });
      if (msg.senderId !== user?.id) markRead.mutate({ conversationId: id });
    };

    const handleMessageRead = ({ readBy }: { readBy: string }) => {
      if (readBy === user?.id) return;
      const now = new Date().toISOString();
      setLocalMessages(prev =>
        prev.map(m => (m.senderId === user?.id && !m.readAt ? { ...m, readAt: now } : m))
      );
    };

    sock.on("message:new", handleNewMessage);
    sock.on("message:read", handleMessageRead);
    return () => {
      sock.off("message:new", handleNewMessage);
      sock.off("message:read", handleMessageRead);
      sock.emit("leave_conversation", id);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const handleSend = useCallback(async () => {
    if (!text.trim() && !file) return;
    if (!id) return;
    const bodyText = text.trim();
    const attachedFile = file;
    setText("");
    setFile(null);
    if (fileRef.current) fileRef.current.value = "";
    try {
      const msg = await sendMsg.mutateAsync({
        conversationId: id,
        data: { body: bodyText, file: attachedFile ?? undefined },
      });
      setLocalMessages(prev => prev.find(m => m.id === msg.id) ? prev : [...prev, msg]);
    } catch { /* ignore */ }
  }, [text, file, id, sendMsg]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const handleSendQuotation = async () => {
    if (!id) return;
    try {
      const msg = await sendQuotation.mutateAsync({
        conversationId: id,
        data: {
          quantity: Number(form.quantity),
          unitPriceUsd: Number(form.unitPriceUsd),
          shippingFeeUsd: form.shippingFeeUsd ? Number(form.shippingFeeUsd) : undefined,
          otherFeesUsd: form.otherFeesUsd ? Number(form.otherFeesUsd) : undefined,
          notes: form.notes || undefined,
          expiresAt: new Date(form.expiresAt).toISOString(),
        },
      });
      setLocalMessages(prev => prev.find(m => m.id === msg.id) ? prev : [...prev, msg]);
      qc.invalidateQueries({ queryKey: getGetConversationQueryKey(id) });
      setQuotationOpen(false);
      setForm(DEFAULT_FORM);
      toast.success("Quotation sent to buyer.");
    } catch {
      toast.error("Failed to send quotation. Please try again.");
    }
  };

  const setField = (k: keyof typeof DEFAULT_FORM) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  if (!id) return null;

  const buyerName = (conv as any)?.buyerName;
  const canSubmitQuotation = form.quantity && Number(form.quantity) >= 1 && form.unitPriceUsd && Number(form.unitPriceUsd) > 0 && form.expiresAt;

  return (
    <div className="flex flex-col h-full max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 p-4 border-b border-border bg-card shrink-0">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/seller/conversations"><ChevronLeft className="h-5 w-5" /></Link>
        </Button>
        {isLoading ? (
          <Skeleton className="h-6 w-48" />
        ) : (
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm truncate flex items-center gap-1.5">
              <Car className="h-4 w-4 text-muted-foreground shrink-0" />
              {conv?.vehicleTitle ?? t("conversations.vehicleInquiry")}
            </p>
            <p className="text-xs text-muted-foreground">
              {buyerName ? `Buyer: ${buyerName}` : ""}
            </p>
          </div>
        )}
        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 text-xs"
            onClick={() => setQuotationOpen(true)}
          >
            <ClipboardList className="h-3.5 w-3.5" />
            Send Quotation
          </Button>
          {conv?.vehicleId && (
            <Button variant="outline" size="sm" asChild>
              <Link href={`/vehicles/${conv.vehicleId}`}>{t("conversations.viewListing")}</Link>
            </Button>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-background/50">
        {isLoading ? (
          <div className="space-y-4">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className={cn("h-12 max-w-[60%]", i % 2 === 0 ? "" : "ml-auto")} />
            ))}
          </div>
        ) : localMessages.length === 0 ? (
          <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
            {t("conversations.noMessagesHint")}
          </div>
        ) : (
          localMessages.map((msg) => (
            <MessageBubble key={msg.id} msg={msg} isMine={msg.senderId === user?.id} />
          ))
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input bar */}
      <div className="p-3 border-t border-border bg-card shrink-0 space-y-2">
        {file && (
          <div className="flex items-center gap-2 text-xs bg-muted/60 rounded px-2 py-1">
            <Paperclip className="h-3 w-3" />
            <span className="truncate flex-1">{file.name}</span>
            <button onClick={() => { setFile(null); if (fileRef.current) fileRef.current.value = ""; }} className="text-muted-foreground hover:text-foreground">×</button>
          </div>
        )}
        <div className="flex gap-2 items-end">
          <input ref={fileRef} type="file" className="hidden" accept="image/*,.pdf,.doc,.docx"
            onChange={e => setFile(e.target.files?.[0] ?? null)} />
          <Button variant="ghost" size="icon" className="shrink-0" onClick={() => fileRef.current?.click()}>
            <Paperclip className="h-4 w-4" />
          </Button>
          <Textarea
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t("conversations.typeMessage")}
            className="min-h-[2.5rem] max-h-32 resize-none flex-1 text-sm py-2"
            rows={1}
          />
          <Button size="icon" className="shrink-0" onClick={handleSend} disabled={sendMsg.isPending || (!text.trim() && !file)}>
            <Send className="h-4 w-4" />
          </Button>
        </div>
        <p className="text-[10px] text-muted-foreground px-1">{t("conversations.contactInfoNote")}</p>
      </div>

      {/* Send Quotation Dialog */}
      <Dialog open={quotationOpen} onOpenChange={setQuotationOpen}>
        <DialogContent className="max-w-md flex flex-col max-h-[90dvh]">
          <DialogHeader className="shrink-0">
            <DialogTitle className="flex items-center gap-2">
              <ClipboardList className="h-4 w-4 text-primary" />
              Send Quotation
            </DialogTitle>
            <DialogDescription>
              Pricing details will be sent as a quotation card in the conversation.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-1 overflow-y-auto flex-1 min-h-0 pr-1">
            {/* Context — read-only */}
            <div className="rounded-lg bg-muted/40 border border-border px-3 py-2.5 space-y-1.5">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Vehicle</span>
                <span className="font-medium truncate max-w-[60%] text-right">
                  {conv?.vehicleTitle ?? "—"}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Buyer</span>
                <span className="font-medium">{buyerName ?? "—"}</span>
              </div>
            </div>

            {/* Commission info panel — only shown when commission is assigned */}
            {vehicleData && (vehicleData as any).commissionType && (
              <div className="rounded-lg bg-amber-500/5 border border-amber-500/20 px-3 py-2.5 space-y-1.5">
                <p className="text-xs font-semibold text-amber-600 uppercase tracking-wider">Platform Commission</p>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Vehicle FOB Price</span>
                  <span className="font-mono font-medium">{formatCurrency(vehicleData.fobPriceUsd)}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Platform Commission</span>
                  <span className="font-mono font-medium text-amber-600">
                    {(vehicleData as any).commissionType === 'percentage'
                      ? `${Number((vehicleData as any).commissionValue).toFixed(2)}%`
                      : formatCurrency((vehicleData as any).commissionAmountUsd)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm border-t border-amber-500/20 pt-1.5">
                  <span className="font-medium">Buyer Will See</span>
                  <span className="font-mono font-semibold text-primary">{formatCurrency(vehicleData.displayPriceUsd)}</span>
                </div>
              </div>
            )}

            {/* Quantity + Vehicle Price */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="qty">Quantity *</Label>
                <Input id="qty" type="number" min="1" value={form.quantity} onChange={setField("quantity")} placeholder="1" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="unit">Vehicle Price (USD) *</Label>
                <Input id="unit" type="number" min="0" step="0.01" value={form.unitPriceUsd} onChange={setField("unitPriceUsd")} placeholder="0.00" />
              </div>
            </div>

            {/* Optional fees side by side */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="ship">Shipping Cost</Label>
                <Input id="ship" type="number" min="0" step="0.01" value={form.shippingFeeUsd} onChange={setField("shippingFeeUsd")} placeholder="0.00" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="other">Additional Fees</Label>
                <Input id="other" type="number" min="0" step="0.01" value={form.otherFeesUsd} onChange={setField("otherFeesUsd")} placeholder="0.00" />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="notes">Notes</Label>
              <Textarea id="notes" value={form.notes} onChange={setField("notes")} placeholder="Payment terms, delivery conditions…" rows={2} className="resize-none" />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="expires">Expiration Date *</Label>
              <Input id="expires" type="date" value={form.expiresAt} onChange={setField("expiresAt")} />
            </div>

            {/* Live total preview */}
            {form.unitPriceUsd && form.quantity && (
              <div className="rounded-lg bg-muted/40 border border-border px-3 py-2 text-sm space-y-1">
                <div className="flex justify-between text-muted-foreground">
                  <span>{Number(form.quantity)} unit(s) × ${Number(form.unitPriceUsd).toLocaleString()}</span>
                  <span>${(Number(form.quantity) * Number(form.unitPriceUsd)).toLocaleString()}</span>
                </div>
                {Number(form.shippingFeeUsd) > 0 && (
                  <div className="flex justify-between text-muted-foreground">
                    <span>Shipping</span><span>${Number(form.shippingFeeUsd).toLocaleString()}</span>
                  </div>
                )}
                {Number(form.otherFeesUsd) > 0 && (
                  <div className="flex justify-between text-muted-foreground">
                    <span>Additional fees</span><span>${Number(form.otherFeesUsd).toLocaleString()}</span>
                  </div>
                )}
                <div className="flex justify-between font-semibold border-t border-border pt-1 mt-1">
                  <span>Total</span>
                  <span className="text-primary">
                    ${(
                      Number(form.quantity) * Number(form.unitPriceUsd) +
                      Number(form.shippingFeeUsd || 0) +
                      Number(form.otherFeesUsd || 0)
                    ).toLocaleString()}
                  </span>
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setQuotationOpen(false)}>Cancel</Button>
            <Button
              onClick={handleSendQuotation}
              disabled={!canSubmitQuotation || sendQuotation.isPending}
              className="gap-1.5"
            >
              <ClipboardList className="h-4 w-4" />
              {sendQuotation.isPending ? "Sending…" : "Send Quotation"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
