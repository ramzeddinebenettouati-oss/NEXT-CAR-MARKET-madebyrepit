import { useState, useCallback } from "react";
import { Link, Redirect } from "wouter";
import { AdminLayout } from "@/components/admin-layout";
import { useAdminPermissions } from "@/hooks/use-admin-permissions";
import { useAuth } from "@/hooks/use-auth";
import { useListOrders, useListCommissionRules, customFetch, getListOrdersQueryKey } from "@workspace/api-client-react";
import { useFormatters } from "@/hooks/use-formatters";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useGetAdminStats, getGetAdminStatsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Container, Search, ChevronRight, ChevronLeft, X,
  Download, ChevronDown, Loader2, CheckSquare,
} from "lucide-react";
import { toast } from "sonner";

const PAGE_SIZE = 25;

const ALL_STATUSES = [
  "inquiry", "quotation_sent", "quotation_accepted",
  "awaiting_payment", "payment_received", "payment_verified",
  "seller_payment", "documents_preparation", "booking_shipping",
  "in_production", "ready_to_ship", "shipped", "arrived",
  "delivered", "closed", "cancelled",
] as const;

// Statuses that make sense as bulk targets for an admin
const BULK_TARGET_STATUSES = [
  "in_production", "ready_to_ship", "shipped",
  "arrived", "delivered", "closed", "cancelled",
] as const;

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

type SortMode = "newest" | "oldest" | "highest" | "lowest";

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border ${STATUS_COLORS[status] ?? "bg-muted text-muted-foreground border-border"}`}>
      {status.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}
    </span>
  );
}

function humanStatus(s: string) {
  return s.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

export default function AdminOrders() {
  const { can, isLoading: permLoading } = useAdminPermissions();
  const { formatCurrency, formatDate } = useFormatters();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const isSuperAdmin = user?.role === "super_admin";
  const canViewCommission = isSuperAdmin || can("commission_management");

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [buyerName, setBuyerName] = useState("");
  const [sellerName, setSellerName] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>("newest");
  const [commissionTypeFilter, setCommissionTypeFilter] = useState<string>("all");
  const [commissionRuleId, setCommissionRuleId] = useState<string>("all");
  const [minCommission, setMinCommission] = useState("");
  const [maxCommission, setMaxCommission] = useState("");
  const [page, setPage] = useState(1);

  // Selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);

  const { data: rulesData } = useListCommissionRules({ isActive: true } as any);
  const commissionRules = (rulesData as any)?.data ?? [];

  const { data: stats } = useGetAdminStats({
    query: { queryKey: getGetAdminStatsQueryKey() },
  });

  if (!permLoading && !can("order_management")) {
    return <Redirect to="/admin/dashboard" />;
  }

  const queryParams = {
    page,
    limit: PAGE_SIZE,
    sort: sortMode,
    ...(statusFilter !== "all" ? { status: statusFilter as typeof ALL_STATUSES[number] } : {}),
    ...(search.trim() ? { search: search.trim() } : {}),
    ...(buyerName.trim() ? { buyerName: buyerName.trim() } : {}),
    ...(sellerName.trim() ? { sellerName: sellerName.trim() } : {}),
    ...(dateFrom ? { dateFrom } : {}),
    ...(dateTo ? { dateTo } : {}),
    ...(commissionTypeFilter !== "all" && commissionTypeFilter !== "none" ? { commissionType: commissionTypeFilter } : {}),
    ...(commissionRuleId !== "all" ? { commissionRuleId } : {}),
    ...(minCommission ? { minCommission: Number(minCommission) } : {}),
    ...(maxCommission ? { maxCommission: Number(maxCommission) } : {}),
  } as any;

  const { data, isLoading } = useListOrders(queryParams);

  const orders = data?.data ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const pageCommissionTotal = orders.reduce(
    (sum, order) => sum + Number((order as any).commissionAmountUsd ?? 0),
    0,
  );

  const resetPage = () => { setPage(1); setSelectedIds(new Set()); };
  const hasFilters = search || statusFilter !== "all" || buyerName || sellerName || dateFrom || dateTo || commissionTypeFilter !== "all" || commissionRuleId !== "all" || minCommission || maxCommission;

  const handleClear = () => {
    setSearch(""); setStatusFilter("all");
    setBuyerName(""); setSellerName("");
    setDateFrom(""); setDateTo("");
    setCommissionTypeFilter("all"); setCommissionRuleId("all");
    setMinCommission(""); setMaxCommission("");
    setPage(1); setSelectedIds(new Set());
  };

  // ── Selection helpers ────────────────────────────────────────────────────
  const allPageIds = orders.map(o => o.id);
  const allPageSelected = allPageIds.length > 0 && allPageIds.every(id => selectedIds.has(id));
  const somePageSelected = allPageIds.some(id => selectedIds.has(id));

  const toggleSelectAll = () => {
    if (allPageSelected) {
      setSelectedIds(prev => {
        const next = new Set(prev);
        allPageIds.forEach(id => next.delete(id));
        return next;
      });
    } else {
      setSelectedIds(prev => {
        const next = new Set(prev);
        allPageIds.forEach(id => next.add(id));
        return next;
      });
    }
  };

  const toggleRow = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  // ── Bulk status update ───────────────────────────────────────────────────
  const handleBulkUpdate = async (targetStatus: string) => {
    const ids = [...selectedIds];
    if (ids.length === 0) return;
    setBulkLoading(true);
    try {
      const result = await customFetch<{ updated: number; skipped: number; results: any[] }>(
        "/api/orders/bulk-update",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orderIds: ids, status: targetStatus }),
        }
      );
      if (result.updated > 0) {
        toast.success(`${result.updated} order${result.updated !== 1 ? "s" : ""} updated to "${humanStatus(targetStatus)}"`);
      }
      if (result.skipped > 0) {
        toast.warning(`${result.skipped} order${result.skipped !== 1 ? "s" : ""} could not be updated (invalid transition)`);
      }
      setSelectedIds(new Set());
      queryClient.invalidateQueries({ queryKey: getListOrdersQueryKey() });
    } catch (err: any) {
      toast.error(err?.message ?? "Bulk update failed");
    } finally {
      setBulkLoading(false);
    }
  };

  // ── CSV export ───────────────────────────────────────────────────────────
  const handleExport = useCallback(async () => {
    setExportLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (search.trim()) params.set("search", search.trim());
      if (buyerName.trim()) params.set("buyerName", buyerName.trim());
      if (sellerName.trim()) params.set("sellerName", sellerName.trim());
      if (dateFrom) params.set("dateFrom", dateFrom);
      if (dateTo) params.set("dateTo", dateTo);

      const token = localStorage.getItem("ac_access_token");
      const response = await fetch(`/api/orders/export?${params.toString()}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });

      if (!response.ok) {
        throw new Error(`Export failed: ${response.status}`);
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `orders-export-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success("Export downloaded");
    } catch (err: any) {
      toast.error(err?.message ?? "Export failed");
    } finally {
      setExportLoading(false);
    }
  }, [statusFilter, search, buyerName, sellerName, dateFrom, dateTo]);

  const selectedCount = selectedIds.size;

  return (
    <AdminLayout>
      <div className="p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="flex items-center gap-3">
            <Container className="h-7 w-7 text-primary" />
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Orders</h1>
              <p className="text-sm text-muted-foreground">
                {isLoading ? "Loading…" : `${total} total order${total !== 1 ? "s" : ""}`}
              </p>
                {canViewCommission && !isLoading && (
                  <p className="text-sm text-emerald-600 dark:text-emerald-400 mt-1">
                    Page commission: <span className="font-mono font-semibold">{formatCurrency(pageCommissionTotal)}</span>
                    {" · "}All orders: <span className="font-mono font-semibold">{formatCurrency(stats?.commissionTotal ?? 0)}</span>
                  </p>
                )}
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleExport}
            disabled={exportLoading}
            className="gap-2 shrink-0"
          >
            {exportLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            Export CSV
          </Button>
        </div>

        {/* Status Summary Stat Cards */}
        {stats?.ordersByStatus && stats.ordersByStatus.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-3">
            {[
              { key: "awaiting_payment", label: "Awaiting Payment" },
              { key: "payment_received", label: "Payment Received" },
              { key: "seller_payment", label: "Seller Payment" },
              { key: "in_production", label: "In Production" },
              { key: "shipped", label: "Shipped" },
              { key: "arrived", label: "Arrived" },
              { key: "delivered", label: "Delivered" },
            ].map(({ key, label }) => {
              const count = stats.ordersByStatus?.find(s => s.status === key)?.count ?? 0;
              return (
                <Card
                  key={key}
                  className="border-border bg-card cursor-pointer hover:border-primary/40 transition-colors"
                  onClick={() => { setStatusFilter(key); setPage(1); }}
                >
                  <CardContent className="p-3">
                    <p className="text-[11px] text-muted-foreground leading-tight mb-1">{label}</p>
                    <p className="text-2xl font-bold">{count}</p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* Filters */}
        <Card className="border-border">
          <CardContent className="p-4 space-y-3">
            {/* Row 1: search + status + sort */}
            <div className="flex flex-wrap gap-3">
              <div className="relative flex-1 min-w-[200px] max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by order #, buyer, or seller…"
                  value={search}
                  onChange={e => { setSearch(e.target.value); resetPage(); }}
                  className="pl-9"
                />
              </div>
              <Select value={statusFilter} onValueChange={v => { setStatusFilter(v); resetPage(); }}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Filter by status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  {ALL_STATUSES.map(s => (
                    <SelectItem key={s} value={s}>{humanStatus(s)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={sortMode} onValueChange={v => { setSortMode(v as SortMode); resetPage(); }}>
                <SelectTrigger className="w-[170px]">
                  <SelectValue placeholder="Sort" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="newest">Newest first</SelectItem>
                  <SelectItem value="oldest">Oldest first</SelectItem>
                  <SelectItem value="highest">Highest value</SelectItem>
                  <SelectItem value="lowest">Lowest value</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Row 1b: commission filters */}
            <div className="flex flex-wrap gap-3 items-end">
              <Select value={commissionTypeFilter} onValueChange={v => { setCommissionTypeFilter(v); resetPage(); }}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Commission type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Commission Types</SelectItem>
                  <SelectItem value="fixed">Fixed</SelectItem>
                  <SelectItem value="percentage">Percentage</SelectItem>
                  <SelectItem value="hybrid">Hybrid</SelectItem>
                  <SelectItem value="none">No Commission</SelectItem>
                </SelectContent>
              </Select>
              <Select value={commissionRuleId} onValueChange={v => { setCommissionRuleId(v); resetPage(); }}>
                <SelectTrigger className="w-[220px]">
                  <SelectValue placeholder="Commission rule" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Rules</SelectItem>
                  {commissionRules.map((r: any) => (
                    <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="flex flex-col gap-1">
                <Label className="text-xs text-muted-foreground">Min commission (USD)</Label>
                <Input
                  type="number"
                  placeholder="0"
                  value={minCommission}
                  onChange={e => { setMinCommission(e.target.value); resetPage(); }}
                  className="w-[140px]"
                />
              </div>
              <div className="flex flex-col gap-1">
                <Label className="text-xs text-muted-foreground">Max commission (USD)</Label>
                <Input
                  type="number"
                  placeholder="∞"
                  value={maxCommission}
                  onChange={e => { setMaxCommission(e.target.value); resetPage(); }}
                  className="w-[140px]"
                />
              </div>
            </div>

            {/* Row 2: buyer/seller name + date range */}
            <div className="flex flex-wrap gap-3 items-end">
              <div className="flex flex-col gap-1">
                <Label className="text-xs text-muted-foreground">Buyer name</Label>
                <Input
                  placeholder="Filter by buyer…"
                  value={buyerName}
                  onChange={e => { setBuyerName(e.target.value); resetPage(); }}
                  className="w-[180px]"
                />
              </div>
              <div className="flex flex-col gap-1">
                <Label className="text-xs text-muted-foreground">Seller name</Label>
                <Input
                  placeholder="Filter by seller…"
                  value={sellerName}
                  onChange={e => { setSellerName(e.target.value); resetPage(); }}
                  className="w-[180px]"
                />
              </div>
              <div className="flex flex-col gap-1">
                <Label className="text-xs text-muted-foreground">Created from</Label>
                <Input
                  type="date"
                  value={dateFrom}
                  onChange={e => { setDateFrom(e.target.value); resetPage(); }}
                  className="w-[160px]"
                />
              </div>
              <div className="flex flex-col gap-1">
                <Label className="text-xs text-muted-foreground">Created to</Label>
                <Input
                  type="date"
                  value={dateTo}
                  onChange={e => { setDateTo(e.target.value); resetPage(); }}
                  className="w-[160px]"
                />
              </div>
              {hasFilters && (
                <Button variant="ghost" size="sm" onClick={handleClear} className="self-end">
                  <X className="h-3.5 w-3.5 mr-1" /> Clear filters
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Bulk action bar */}
        {selectedCount > 0 && (
          <div className="flex items-center gap-3 px-4 py-3 rounded-lg border border-primary/30 bg-primary/5 text-sm">
            <CheckSquare className="h-4 w-4 text-primary shrink-0" />
            <span className="font-medium text-primary">
              {selectedCount} order{selectedCount !== 1 ? "s" : ""} selected
            </span>
            <div className="flex items-center gap-2 ml-auto">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" variant="default" disabled={bulkLoading} className="gap-1.5">
                    {bulkLoading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                    Set status
                    <ChevronDown className="h-3.5 w-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {BULK_TARGET_STATUSES.map(s => (
                    <DropdownMenuItem key={s} onClick={() => handleBulkUpdate(s)}>
                      {humanStatus(s)}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setSelectedIds(new Set())}
                disabled={bulkLoading}
              >
                Clear selection
              </Button>
            </div>
          </div>
        )}

        <Card className="border-border">
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-6 space-y-3">
                {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-12" />)}
              </div>
            ) : orders.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <Container className="h-10 w-10 text-muted-foreground mb-3 opacity-20" />
                <p className="font-medium text-muted-foreground">
                  {total === 0 && !hasFilters ? "No orders yet" : "No orders match your filters"}
                </p>
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-10 px-3">
                          <Checkbox
                            checked={allPageSelected}
                            onCheckedChange={toggleSelectAll}
                            aria-label="Select all on this page"
                            className={somePageSelected && !allPageSelected ? "data-[state=unchecked]:opacity-50" : ""}
                          />
                        </TableHead>
                        <TableHead className="text-xs">Order #</TableHead>
                        <TableHead>Vehicle</TableHead>
                        <TableHead>Buyer</TableHead>
                        <TableHead>Seller</TableHead>
                        <TableHead>Quotation</TableHead>
                        <TableHead className="text-center">Qty</TableHead>
                        <TableHead>FOB Total</TableHead>
                        <TableHead>Final Buyer Price</TableHead>
                        {canViewCommission && <TableHead>Commission Type</TableHead>}
                        {canViewCommission && <TableHead>Comm. Value</TableHead>}
                        {canViewCommission && <TableHead>Platform Commission</TableHead>}
                        <TableHead>Status</TableHead>
                        <TableHead>Created</TableHead>
                        <TableHead>Updated</TableHead>
                        <TableHead />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {orders.map(o => (
                        <TableRow
                          key={o.id}
                          className={`cursor-pointer hover:bg-muted/40 ${selectedIds.has(o.id) ? "bg-primary/5" : ""}`}
                          onClick={() => toggleRow(o.id)}
                        >
                          <TableCell className="px-3" onClick={e => e.stopPropagation()}>
                            <Checkbox
                              checked={selectedIds.has(o.id)}
                              onCheckedChange={() => toggleRow(o.id)}
                              aria-label={`Select order ${o.orderNumber}`}
                            />
                          </TableCell>
                          <TableCell className="font-mono text-xs font-semibold text-primary whitespace-nowrap">
                            {o.orderNumber}
                          </TableCell>
                          <TableCell className="font-medium max-w-[140px] truncate">
                            {o.vehicleTitle ?? o.vehicleId.slice(0, 8)}
                          </TableCell>
                          <TableCell className="text-muted-foreground text-sm whitespace-nowrap">
                            {o.buyerName ?? o.buyerId.slice(0, 8)}
                          </TableCell>
                          <TableCell className="text-muted-foreground text-sm whitespace-nowrap">
                            {o.sellerName ?? o.sellerId.slice(0, 8)}
                          </TableCell>
                          <TableCell className="text-xs">
                            {o.quotationId ? (
                              <Link
                                href={`/admin/quotations/${o.quotationId}`}
                                className="text-primary underline-offset-2 hover:underline font-mono"
                                onClick={e => e.stopPropagation()}
                              >
                                {o.quotationId.slice(0, 8)}…
                              </Link>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell className="text-center">{o.quantity}</TableCell>
                          <TableCell className="font-mono text-sm text-muted-foreground whitespace-nowrap">
                            {(o as any).fobTotalUsd != null ? formatCurrency((o as any).fobTotalUsd) : "—"}
                          </TableCell>
                          <TableCell className="font-medium whitespace-nowrap">{formatCurrency(o.totalAmountUsd)}</TableCell>
                          {canViewCommission && (
                            <TableCell className="text-xs whitespace-nowrap">
                              {(o as any).commissionType ? (
                                <span className="capitalize text-muted-foreground">{(o as any).commissionType}</span>
                              ) : <span className="text-muted-foreground">—</span>}
                            </TableCell>
                          )}
                          {canViewCommission && (
                            <TableCell className="text-xs whitespace-nowrap">
                              {(o as any).commissionValue != null ? (
                                <span className="text-muted-foreground">
                                  {(o as any).commissionType === "percentage"
                                    ? `${Number((o as any).commissionValue).toFixed(2)}%`
                                    : formatCurrency((o as any).commissionValue)}
                                </span>
                              ) : <span className="text-muted-foreground">—</span>}
                            </TableCell>
                          )}
                          {canViewCommission && (
                            <TableCell className="text-xs whitespace-nowrap">
                              {(o as any).commissionAmountUsd != null ? (
                                <span className="font-mono text-emerald-600 font-medium">{formatCurrency((o as any).commissionAmountUsd)}</span>
                              ) : <span className="text-muted-foreground">—</span>}
                            </TableCell>
                          )}
                          <TableCell><StatusBadge status={o.status} /></TableCell>
                          <TableCell className="text-muted-foreground text-xs whitespace-nowrap">
                            {formatDate(o.createdAt)}
                          </TableCell>
                          <TableCell className="text-muted-foreground text-xs whitespace-nowrap">
                            {o.updatedAt ? formatDate(o.updatedAt) : "—"}
                          </TableCell>
                          <TableCell onClick={e => e.stopPropagation()}>
                            <Button variant="ghost" size="sm" asChild>
                              <Link href={`/admin/orders/${o.id}`}>
                                <ChevronRight className="h-4 w-4" />
                              </Link>
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                {/* Pagination */}
                <div className="flex items-center justify-between px-4 py-3 border-t border-border">
                  <p className="text-sm text-muted-foreground">
                    Page {page} of {totalPages} &mdash; {total} order{total !== 1 ? "s" : ""}
                    {selectedCount > 0 && (
                      <span className="ml-2 text-primary font-medium">· {selectedCount} selected</span>
                    )}
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage(p => Math.max(1, p - 1))}
                      disabled={page === 1}
                    >
                      <ChevronLeft className="h-4 w-4" />
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                      disabled={page === totalPages}
                    >
                      Next
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
