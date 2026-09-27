import { useEffect, useRef, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useFormatters } from "@/hooks/use-formatters";
import { useParams, useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { io, Socket } from "socket.io-client";
import {
  useGetFreightConversation,
  getGetFreightConversationQueryKey,
  useListFreightMessages,
  getListFreightMessagesQueryKey,
  useSendFreightMessage,
} from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { ArrowLeft, MessageCircle, Send } from "lucide-react";

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

export default function FreightConversationChat() {
  const { t } = useTranslation();
  const { formatTime } = useFormatters();
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const bottomRef = useRef<HTMLDivElement>(null);

  const { data: conv, isLoading: convLoading } = useGetFreightConversation(id, {
    query: { queryKey: getGetFreightConversationQueryKey(id) },
  });

  const { data: messagesData, isLoading: messagesLoading } = useListFreightMessages(id, undefined, {
    query: { queryKey: getListFreightMessagesQueryKey(id) },
  });

  const [localMessages, setLocalMessages] = useState<any[]>([]);

  useEffect(() => {
    if (messagesData?.data) {
      setLocalMessages(messagesData.data);
    }
  }, [messagesData?.data]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [localMessages.length]);

  useEffect(() => {
    if (!id) return;
    const sock = getSocket();

    const handleNewFreightMessage = (msg: any) => {
      if (msg.conversationId !== id) return;
      setLocalMessages(prev => {
        if (prev.find(m => m.id === msg.id)) return prev;
        return [...prev, msg];
      });
    };

    sock.on("freight_message:new", handleNewFreightMessage);

    return () => {
      sock.off("freight_message:new", handleNewFreightMessage);
    };
  }, [id]);

  const sendMessage = useSendFreightMessage();
  const [body, setBody] = useState("");

  const handleSend = useCallback(
    async (e?: React.FormEvent) => {
      e?.preventDefault();
      const text = body.trim();
      if (!text) return;
      setBody("");

      try {
        const msg = await sendMessage.mutateAsync(
          { conversationId: id, data: { body: text } },
        );
        setLocalMessages(prev => prev.find(m => m.id === msg.id) ? prev : [...prev, msg]);
      } catch (err: any) {
        toast({ title: t("freightChat.sendFailed"), description: err?.message ?? "Could not send message.", variant: "destructive" });
        setBody(text);
      }
    },
    [body, id, sendMessage, toast, t],
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const backHref = user?.role === "seller" ? "/seller/orders" : "/forwarder/freight-requests";

  if (convLoading) return <div className="p-6"><Skeleton className="h-64" /></div>;

  const otherName = user?.role === "seller" ? conv?.forwarderName : conv?.sellerName;

  return (
    <div className="flex flex-col h-full p-6 lg:p-8 max-w-3xl mx-auto gap-4">
      <div className="flex items-center gap-3 flex-shrink-0">
        <Button variant="ghost" size="sm" onClick={() => setLocation(backHref)}>
          <ArrowLeft className="h-4 w-4 mr-2" /> {t("freightChat.back")}
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="font-semibold flex items-center gap-2 truncate">
            <MessageCircle className="h-4 w-4 shrink-0" />
            {otherName ?? t("freightChat.freightChat")}
          </h1>
          {conv?.orderId && (
            <p className="text-xs text-muted-foreground font-mono">
              {t("freightChat.order")} {conv.orderId.slice(0, 12)}…
            </p>
          )}
        </div>
      </div>

      <Card className="flex-1 border-border flex flex-col min-h-0 overflow-hidden">
        <CardContent className="flex-1 overflow-y-auto p-4 space-y-3 flex flex-col">
          {messagesLoading ? (
            <Skeleton className="h-24" />
          ) : localMessages.length === 0 ? (
            <p className="text-center text-muted-foreground text-sm py-8 my-auto">
              {t("freightChat.noMessages")}
            </p>
          ) : (
            localMessages.map(msg => {
              const isMe = msg.senderId === user?.id;
              return (
                <div key={msg.id} className={`flex ${isMe ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[75%] rounded-2xl px-4 py-2.5 text-sm ${
                      isMe
                        ? "bg-primary text-primary-foreground rounded-tr-sm"
                        : "bg-muted text-foreground rounded-tl-sm"
                    }`}
                  >
                    {!isMe && (
                      <p className="text-xs font-medium mb-1 opacity-70">{msg.senderName}</p>
                    )}
                    <p className="leading-relaxed">{msg.body}</p>
                    {msg.wasScrubbedAt && (
                      <p className="text-[10px] mt-1 opacity-60 italic">✂ {t("conversations.contactInfoRemoved")}</p>
                    )}
                    <p className={`text-[10px] mt-1 ${isMe ? "opacity-70 text-right" : "text-muted-foreground"}`}>
                      {formatTime(msg.createdAt)}
                    </p>
                  </div>
                </div>
              );
            })
          )}
          <div ref={bottomRef} />
        </CardContent>

        <div className="border-t border-border p-3 flex-shrink-0">
          <form onSubmit={handleSend} className="flex gap-2">
            <input
              type="text"
              className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
              placeholder={t("freightChat.typeMessage")}
              value={body}
              onChange={e => setBody(e.target.value)}
              onKeyDown={handleKeyDown}
            />
            <Button type="submit" size="sm" disabled={sendMessage.isPending || !body.trim()}>
              <Send className="h-4 w-4" />
            </Button>
          </form>
        </div>
      </Card>
    </div>
  );
}
