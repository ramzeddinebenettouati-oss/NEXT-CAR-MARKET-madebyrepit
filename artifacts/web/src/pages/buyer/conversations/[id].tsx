import { useEffect, useRef, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useFormatters } from "@/hooks/use-formatters";
import { useParams, Link } from "wouter";
import {
  useGetConversation,
  useSendMessage,
  useMarkConversationRead,
  getGetConversationQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ChevronLeft, Send, Paperclip, Car, AlertTriangle } from "lucide-react";
import { io, Socket } from "socket.io-client";
import { cn } from "@/lib/utils";
import { QuotationMessageCard } from "@/components/quotation-message-card";

let socketInstance: Socket | null = null;

function getSocket(): Socket {
  if (!socketInstance) {
    const token = localStorage.getItem("ac_access_token");
    socketInstance = io(window.location.origin, {
      path: "/api/socket.io",
      auth: { token },
      transports: ["websocket", "polling"],
    });
  }
  return socketInstance;
}

function MessageBubble({
  msg,
  isMine,
  conversationId,
  onQuotationUpdated,
  onQuotationSent,
}: {
  msg: any;
  isMine: boolean;
  conversationId: string;
  onQuotationUpdated?: (msgId: string, updatedQ: any) => void;
  onQuotationSent?: (msg: any) => void;
}) {
  const { t } = useTranslation();
  const { formatRelative } = useFormatters();

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
            conversationId={conversationId}
            onQuotationUpdated={(updated) => onQuotationUpdated?.(msg.id, updated)}
            onQuotationSent={onQuotationSent}
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
          <a
            key={att.id}
            href={att.url}
            target="_blank"
            rel="noopener noreferrer"
            className="block"
          >
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

export default function ConversationChat() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [localMessages, setLocalMessages] = useState<any[]>([]);
  const queryKey = getGetConversationQueryKey(id ?? "");

  const { data: conv, isLoading } = useGetConversation(
    id ?? "",
    { page: 1, limit: 50 },
    { query: { queryKey, enabled: !!id } }
  );

  const markRead = useMarkConversationRead();
  const sendMsg = useSendMessage();

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

  const handleQuotationUpdated = useCallback((msgId: string, updatedQ: any) => {
    setLocalMessages(prev =>
      prev.map(m => m.id === msgId ? { ...m, quotation: updatedQ } : m)
    );
  }, []);

  const handleQuotationSent = useCallback((msg: any) => {
    setLocalMessages(prev => prev.find(m => m.id === msg.id) ? prev : [...prev, msg]);
  }, []);

  if (!id) return null;

  return (
    <div className="flex flex-col h-full max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 p-4 border-b border-border bg-card shrink-0">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/buyer/conversations"><ChevronLeft className="h-5 w-5" /></Link>
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
              {conv?.sellerName ? `${t("conversations.sellerLabel")} ${conv.sellerName}` : ""}
            </p>
          </div>
        )}
        {conv?.vehicleId && (
          <Button variant="outline" size="sm" asChild>
            <Link href={`/vehicles/${conv.vehicleId}`}>{t("conversations.viewListing")}</Link>
          </Button>
        )}
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
            <MessageBubble
              key={msg.id}
              msg={msg}
              isMine={msg.senderId === user?.id}
              conversationId={id}
              onQuotationUpdated={handleQuotationUpdated}
              onQuotationSent={handleQuotationSent}
            />
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
    </div>
  );
}
