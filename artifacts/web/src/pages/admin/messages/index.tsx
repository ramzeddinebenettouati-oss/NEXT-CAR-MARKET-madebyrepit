import { useState, useEffect } from "react";
import { Link, useLocation, useSearch } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { AdminLayout } from "@/components/admin-layout";
import { useAdminPermissions } from "@/hooks/use-admin-permissions";
import { useAuth } from "@/hooks/use-auth";
import { customFetch } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  MessageSquare, Plus, Search, CheckCircle2, Archive, Clock,
  Car, FileText, ShoppingBag, Package, CreditCard, Inbox,
} from "lucide-react";

type AdminConversation = {
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
  messageCount?: number;
  lastMessage: { body: string; senderName: string | null; createdAt: string } | null;
  unreadCount: number;
  lastMessageAt: string | null;
  createdAt: string;
  updatedAt: string;
};

const REFERENCE_TYPE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  vehicle: Car, quotation: FileText, order: ShoppingBag,
  shipment: Package, payment: CreditCard, general: MessageSquare,
};
const REFERENCE_TYPE_LABELS: Record<string, string> = {
  vehicle: "Vehicle", quotation: "Quotation", order: "Order",
  shipment: "Shipment", payment: "Payment", general: "General",
};
const STATUS_STYLES: Record<string, string> = {
  open: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30",
  resolved: "bg-blue-500/15 text-blue-600 border-blue-500/30",
  archived: "bg-slate-500/15 text-slate-500 border-slate-500/30",
};
const STATUS_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  open: Clock, resolved: CheckCircle2, archived: Archive,
};

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

export default function AdminMessages() {
  const { user } = useAuth();
  const { can, isLoading: permLoading } = useAdminPermissions();
  const [, navigate] = useLocation();
  const searchStr = useSearch();

  const isSuperAdmin = user?.role === "super_admin";
  const hasAccess = isSuperAdmin || can("messages_management");

  // Read URL pre-filter params (e.g. from "View Related Messages" button)
  const urlParams = new URLSearchParams(searchStr);
  const [statusFilter, setStatusFilter] = useState<string>(urlParams.get("status") ?? "all");
  const [typeFilter, setTypeFilter] = useState<string>(urlParams.get("referenceType") ?? "all");
  const [referenceIdFilter] = useState<string>(urlParams.get("referenceId") ?? "");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [search, setSearch] = useState("");

  const params = new URLSearchParams();
  if (statusFilter !== "all") params.set("status", statusFilter);
  if (typeFilter !== "all") params.set("referenceType", typeFilter);
  if (referenceIdFilter) params.set("referenceId", referenceIdFilter);
  if (unreadOnly) params.set("unreadOnly", "true");

  const { data, isLoading } = useQuery({
    queryKey: ["admin-messages", statusFilter, typeFilter, referenceIdFilter, unreadOnly],
    queryFn: () =>
      customFetch<{ data: AdminConversation[]; total: number; page: number; limit: number }>(
        `/api/admin-messages?${params.toString()}&limit=100`
      ),
    enabled: hasAccess,
    refetchInterval: 30000,
  });

  const conversations = (data?.data ?? []).filter(c =>
    !search ||
    c.subject.toLowerCase().includes(search.toLowerCase()) ||
    (c.referenceNumber ?? "").toLowerCase().includes(search.toLowerCase()) ||
    (c.recipientName ?? "").toLowerCase().includes(search.toLowerCase()) ||
    (c.initiatorName ?? "").toLowerCase().includes(search.toLowerCase())
  );

  // Build new-conversation URL preserving reference context
  function buildNewUrl() {
    const np = new URLSearchParams();
    if (typeFilter !== "all") np.set("referenceType", typeFilter);
    if (referenceIdFilter) np.set("referenceId", referenceIdFilter);
    if (urlParams.get("referenceNumber")) np.set("referenceNumber", urlParams.get("referenceNumber")!);
    return `/admin/messages/new${np.toString() ? `?${np.toString()}` : ""}`;
  }

  if (!permLoading && !hasAccess) {
    return (
      <AdminLayout>
        <div className="p-6 lg:p-8 max-w-4xl mx-auto">
          <p className="text-muted-foreground">You don't have permission to access internal messages.</p>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="p-6 lg:p-8 max-w-5xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Internal Messages</h1>
            <p className="text-muted-foreground text-sm mt-1">
              {referenceIdFilter
                ? `Showing messages linked to this ${typeFilter !== "all" ? typeFilter : "record"}`
                : "Admin-to-admin conversations linked to orders, quotations, and other records"}
            </p>
          </div>
          <Button asChild>
            <Link href={buildNewUrl()}>
              <Plus className="h-4 w-4 mr-2" />
              New Conversation
            </Link>
          </Button>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-[200px] max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search conversations…"
              className="pl-9"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-36">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="open">Open</SelectItem>
              <SelectItem value="resolved">Resolved</SelectItem>
              <SelectItem value="archived">Archived</SelectItem>
            </SelectContent>
          </Select>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Reference type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              <SelectItem value="general">General</SelectItem>
              <SelectItem value="order">Order</SelectItem>
              <SelectItem value="quotation">Quotation</SelectItem>
              <SelectItem value="vehicle">Vehicle</SelectItem>
              <SelectItem value="shipment">Shipment</SelectItem>
              <SelectItem value="payment">Payment</SelectItem>
            </SelectContent>
          </Select>
          <Button
            size="sm"
            variant={unreadOnly ? "default" : "outline"}
            onClick={() => setUnreadOnly(v => !v)}
            className="gap-1.5 whitespace-nowrap"
          >
            <MessageSquare className="h-3.5 w-3.5" />
            Unread only
          </Button>
        </div>

        {/* List */}
        {isLoading ? (
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}
          </div>
        ) : conversations.length === 0 ? (
          <Card className="border-border">
            <CardContent className="py-16 flex flex-col items-center gap-3 text-center">
              <Inbox className="h-10 w-10 text-muted-foreground/50" />
              <p className="font-medium">No conversations found</p>
              <p className="text-sm text-muted-foreground">
                {search || statusFilter !== "all" || typeFilter !== "all"
                  ? "Try adjusting your filters"
                  : referenceIdFilter
                    ? "No internal messages for this record yet"
                    : "Start a new conversation to coordinate with the team"}
              </p>
              <Button variant="outline" asChild>
                <Link href={buildNewUrl()}>
                  <Plus className="h-4 w-4 mr-2" />
                  New Conversation
                </Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {conversations.map(conv => {
              const RefIcon = REFERENCE_TYPE_ICONS[conv.referenceType] ?? MessageSquare;
              const StatusIcon = STATUS_ICONS[conv.status] ?? Clock;
              const statusStyle = STATUS_STYLES[conv.status] ?? "";
              const otherParty = conv.initiatorId === user?.id
                ? { name: conv.recipientName, email: conv.recipientEmail, label: "To" }
                : { name: conv.initiatorName, email: conv.initiatorEmail, label: "From" };

              return (
                <Card
                  key={conv.id}
                  className={`border-border hover:border-primary/40 transition-colors cursor-pointer ${
                    conv.unreadCount > 0 ? "border-primary/30 bg-primary/5" : ""
                  }`}
                  onClick={() => navigate(`/admin/messages/${conv.id}`)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start gap-4">
                      <div className="rounded-full p-2 bg-muted shrink-0 mt-0.5">
                        <RefIcon className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-sm truncate max-w-[280px]">
                            {conv.subject}
                          </span>
                          {conv.unreadCount > 0 && (
                            <span className="bg-primary text-primary-foreground text-xs px-1.5 py-0.5 rounded-full font-bold">
                              {conv.unreadCount}
                            </span>
                          )}
                          <Badge variant="outline" className={`text-xs shrink-0 ${statusStyle}`}>
                            <StatusIcon className="h-3 w-3 mr-1" />
                            {conv.status}
                          </Badge>
                          {conv.referenceNumber && (
                            <span className="text-xs font-mono bg-muted px-2 py-0.5 rounded shrink-0">
                              {REFERENCE_TYPE_LABELS[conv.referenceType] ?? conv.referenceType}: {conv.referenceNumber}
                            </span>
                          )}
                        </div>
                        {conv.lastMessage && (
                          <p className="text-xs text-muted-foreground mt-1 truncate">
                            <span className="font-medium text-foreground/70">{conv.lastMessage.senderName ?? "Admin"}: </span>
                            {conv.lastMessage.body}
                          </p>
                        )}
                        <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
                          <span>{otherParty.label}: <span className="text-foreground/70">{otherParty.name ?? otherParty.email ?? "Admin"}</span></span>
                          <span>·</span>
                          <span>{timeAgo(conv.lastMessageAt ?? conv.updatedAt)}</span>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
