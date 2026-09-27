import { useState, useRef, useEffect } from "react";
import { Link, useLocation, useParams } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AdminLayout } from "@/components/admin-layout";
import { useAdminPermissions } from "@/hooks/use-admin-permissions";
import { useAuth } from "@/hooks/use-auth";
import { customFetch } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { getAdminMessageSocket, subscribeAdminMessageSocket } from "@/lib/admin-message-socket";
import {
  ArrowLeft, Send, CheckCircle2, Archive, RotateCcw,
  Car, FileText, ShoppingBag, Package, CreditCard, MessageSquare,
  ExternalLink,
} from "lucide-react";

type AdminMessage = {
  id: string;
  conversationId: string;
  senderId: string;
  senderName: string | null;
  senderEmail: string | null;
  body: string;
  isRead: boolean;
  readAt: string | null;
  createdAt: string;
};

type AdminConversationDetail = {
  id: string;
  subject: string;
  referenceType: string;
  referenceId: string | null;
  referenceNumber: string | null;
  initiatorId: string;
  initiatorName: string | null;
  initiatorEmail: string | null;
  recipientId: string;
  recipientName: string | null;
  recipientEmail: string | null;
  status: string;
  isArchivedByMe: boolean;
  resolvedByName: string | null;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
  messages: AdminMessage[];
};

const REFERENCE_LINKS: Record<string, (id: string) => string> = {
  order: id => `/admin/orders/${id}`,
  quotation: id => `/admin/quotations/${id}`,
  vehicle: _id => `/admin/moderation`,
  shipment: id => `/forwarder/shipments/${id}`,
  payment: id => `/admin/payments/${id}`,
};

const REFERENCE_TYPE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  vehicle: Car, quotation: FileText, order: ShoppingBag,
  shipment: Package, payment: CreditCard, general: MessageSquare,
};

const STATUS_STYLES: Record<string, string> = {
  open: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30",
  resolved: "bg-blue-500/15 text-blue-600 border-blue-500/30",
  archived: "bg-slate-500/15 text-slate-500 border-slate-500/30",
};

function formatTs(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

function initials(name: string | null) {
  if (!name) return "A";
  return name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase();
}

export default function AdminMessageDetail() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { can } = useAdminPermissions();
  const [, navigate] = useLocation();
  const qc = useQueryClient();
  const [body, setBody] = useState("");
  const [isSocketDisconnected, setIsSocketDisconnected] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const isSuperAdmin = user?.role === "super_admin";
  const hasAccess = isSuperAdmin || can("messages_management");

  const { data: conv, isLoading } = useQuery({
    queryKey: ["admin-messages", id],
    queryFn: () => customFetch<AdminConversationDetail>(`/api/admin-messages/${id}`),
    enabled: !!id && hasAccess,
    refetchInterval: 15000,
  });

  // Refresh the open thread immediately when the other participant replies.
  useEffect(() => {
    if (!id || !hasAccess) return;

    const token = user ? localStorage.getItem("ac_access_token") : null;
    const unsubscribeLifecycle = subscribeAdminMessageSocket(token, {
      onDisconnect: () => {
        setIsSocketDisconnected(true);
      },
      onReconnect: () => {
        setIsSocketDisconnected(false);
      },
    });
    const handleNewMessage = (event: { conversationId?: string }) => {
      if (event.conversationId !== id) return;
      qc.invalidateQueries({ queryKey: ["admin-messages", id] });
      qc.invalidateQueries({ queryKey: ["admin-messages-unread"] });
    };

    const sharedSocket = getAdminMessageSocket(token);
    sharedSocket?.on("admin_message:new", handleNewMessage);
    return () => {
      sharedSocket?.off("admin_message:new", handleNewMessage);
      unsubscribeLifecycle();
    };
  }, [id, hasAccess, qc]);

  // Mark as read on load
  useEffect(() => {
    if (conv && hasAccess) {
      customFetch(`/api/admin-messages/${id}/read`, { method: "POST" }).then(() => {
        qc.invalidateQueries({ queryKey: ["admin-messages-unread"] });
      }).catch(() => {});
    }
  }, [conv?.id]);

  // Scroll to bottom when messages load/update
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [conv?.messages?.length]);

  const sendMut = useMutation({
    mutationFn: (b: string) =>
      customFetch<AdminMessage>(`/api/admin-messages/${id}/messages`, {
        method: "POST",
        body: JSON.stringify({ body: b }),
      }),
    onSuccess: () => {
      setBody("");
      qc.invalidateQueries({ queryKey: ["admin-messages", id] });
      qc.invalidateQueries({ queryKey: ["admin-messages-unread"] });
    },
    onError: () => toast.error("Failed to send message"),
  });

  const statusMut = useMutation({
    mutationFn: (status: string) =>
      customFetch(`/api/admin-messages/${id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      }),
    onSuccess: (_, status) => {
      toast.success(`Conversation ${status}`);
      qc.invalidateQueries({ queryKey: ["admin-messages", id] });
      qc.invalidateQueries({ queryKey: ["admin-messages"] });
    },
    onError: () => toast.error("Failed to update status"),
  });

  function handleSend() {
    if (!body.trim()) return;
    sendMut.mutate(body.trim());
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleSend();
    }
  }

  if (isLoading) {
    return (
      <AdminLayout>
        <div className="p-6 lg:p-8 max-w-4xl mx-auto space-y-4">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-96 w-full" />
        </div>
      </AdminLayout>
    );
  }

  if (!conv) {
    return (
      <AdminLayout>
        <div className="p-6 lg:p-8 max-w-4xl mx-auto">
          <Button variant="ghost" asChild className="mb-4">
            <Link href="/admin/messages"><ArrowLeft className="h-4 w-4 mr-2" />Back to Messages</Link>
          </Button>
          <p className="text-muted-foreground">Conversation not found or access denied.</p>
        </div>
      </AdminLayout>
    );
  }

  const RefIcon = REFERENCE_TYPE_ICONS[conv.referenceType] ?? MessageSquare;
  const refLink = conv.referenceId ? REFERENCE_LINKS[conv.referenceType]?.(conv.referenceId) : null;
  const isArchived = conv.status === "archived";
  const isMe = (userId: string) => userId === user?.id;
  const otherParty = conv.initiatorId === user?.id
    ? { name: conv.recipientName, email: conv.recipientEmail, role: "recipient" }
    : { name: conv.initiatorName, email: conv.initiatorEmail, role: "initiator" };

  return (
    <AdminLayout>
      <div className="p-6 lg:p-8 max-w-4xl mx-auto space-y-6">
        {isSocketDisconnected && (
          <div
            role="status"
            className="rounded-md border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-300"
          >
            Live message updates are reconnecting. This thread will keep checking for new messages automatically.
          </div>
        )}

        {/* Header */}
        <div className="flex items-start gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/admin/messages"><ArrowLeft className="h-4 w-4" /></Link>
          </Button>
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-bold truncate">{conv.subject}</h1>
              <Badge variant="outline" className={STATUS_STYLES[conv.status] ?? ""}>
                {conv.status}
              </Badge>
            </div>
            {/* Participants */}
            <div className="flex flex-wrap items-center gap-3 mt-1 text-xs text-muted-foreground">
              <span>
                <span className="font-medium text-foreground/80">{conv.initiatorName ?? conv.initiatorEmail ?? "Admin"}</span>
                {" → "}
                <span className="font-medium text-foreground/80">{conv.recipientName ?? conv.recipientEmail ?? "Admin"}</span>
              </span>
              {conv.referenceNumber && (
                <div className="flex items-center gap-1.5">
                  <RefIcon className="h-3.5 w-3.5" />
                  <span className="capitalize">{conv.referenceType}:</span>
                  <span className="font-mono bg-muted px-1.5 py-0.5 rounded">{conv.referenceNumber}</span>
                  {refLink && (
                    <Button variant="link" size="sm" className="h-auto p-0 text-xs" asChild>
                      <Link href={refLink}>
                        <ExternalLink className="h-3 w-3 mr-0.5" />View
                      </Link>
                    </Button>
                  )}
                </div>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Started {formatTs(conv.createdAt)}
              {conv.status === "resolved" && conv.resolvedByName && (
                <> · Resolved by {conv.resolvedByName}{conv.resolvedAt ? ` on ${formatTs(conv.resolvedAt)}` : ""}</>
              )}
            </p>
          </div>
          {/* Status actions */}
          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            {conv.status === "open" && (
              <>
                <Button variant="outline" size="sm" onClick={() => statusMut.mutate("resolved")} disabled={statusMut.isPending}>
                  <CheckCircle2 className="h-4 w-4 mr-1.5" />Resolve
                </Button>
                <Button variant="outline" size="sm" onClick={() => statusMut.mutate("archived")} disabled={statusMut.isPending}>
                  <Archive className="h-4 w-4 mr-1.5" />Archive
                </Button>
              </>
            )}
            {conv.status === "resolved" && (
              <Button variant="outline" size="sm" onClick={() => statusMut.mutate("open")} disabled={statusMut.isPending}>
                <RotateCcw className="h-4 w-4 mr-1.5" />Reopen
              </Button>
            )}
            {conv.status === "archived" && (
              <Button variant="outline" size="sm" onClick={() => statusMut.mutate("open")} disabled={statusMut.isPending}>
                <RotateCcw className="h-4 w-4 mr-1.5" />Unarchive
              </Button>
            )}
          </div>
        </div>

        {/* Message thread */}
        <Card className="border-border">
          <CardHeader className="pb-2 border-b border-border">
            <CardTitle className="text-sm text-muted-foreground font-normal">
              {conv.messages.length} {conv.messages.length === 1 ? "message" : "messages"} · with {otherParty.name ?? otherParty.email ?? "Admin"}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-border max-h-[500px] overflow-y-auto">
              {conv.messages.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground text-sm">No messages yet</div>
              ) : (
                conv.messages.map(msg => {
                  const mine = isMe(msg.senderId);
                  return (
                    <div key={msg.id} className={`p-4 flex gap-3 ${mine ? "bg-primary/5" : ""}`}>
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                        mine ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                      }`}>
                        {initials(msg.senderName)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline gap-2 flex-wrap">
                          <span className="text-sm font-semibold">{msg.senderName ?? msg.senderEmail ?? "Admin"}</span>
                          {mine && <span className="text-xs text-muted-foreground">(you)</span>}
                          {!mine && msg.isRead && (
                            <span className="text-xs text-muted-foreground ml-1">· read</span>
                          )}
                          <span className="text-xs text-muted-foreground ml-auto">{formatTs(msg.createdAt)}</span>
                        </div>
                        <p className="text-sm mt-1 whitespace-pre-wrap break-words">{msg.body}</p>
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={bottomRef} />
            </div>

            {/* Reply area */}
            {!isArchived ? (
              <div className="p-4 border-t border-border space-y-3">
                <Textarea
                  value={body}
                  onChange={e => setBody(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={`Reply to ${otherParty.name ?? "this conversation"}… (Ctrl+Enter to send)`}
                  className="resize-none min-h-[80px]"
                  disabled={sendMut.isPending}
                />
                <div className="flex justify-end">
                  <Button onClick={handleSend} disabled={!body.trim() || sendMut.isPending}>
                    <Send className="h-4 w-4 mr-2" />
                    {sendMut.isPending ? "Sending…" : "Send"}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="p-4 border-t border-border">
                <p className="text-sm text-muted-foreground text-center">
                  This conversation is archived. Unarchive it to send messages.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
