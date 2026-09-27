import { useState, useMemo } from "react";
import { useFormatters } from "@/hooks/use-formatters";
import { Link } from "wouter";
import { useListQuotations, useListCommissionRules } from "@workspace/api-client-react";
import { AdminLayout } from "@/components/admin-layout";
import { useAdminPermissions } from "@/hooks/use-admin-permissions";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ClipboardList,
  Search,
  ExternalLink,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Lock,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

type QuotationStatus = "pending" | "accepted" | "rejected" | "expired";

const STATUS_COLORS: Record<QuotationStatus, string> = {
  pending: "bg-amber-500/15 text-amber-600 border-amber-500/30",
  accepted: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30",
  rejected: "bg-red-500/15 text-red-600 border-red-500/30",
  expired: "bg-slate-500/15 text-slate-500 border-slate-500/30",
};

const STATUS_ICONS: Record<QuotationStatus, React.ComponentType<{ className?: string }>> = {
  pending: Clock,
  accepted: CheckCircle2,
  rejected: XCircle,
  expired: AlertCircle,
};

function StatusBadge({ status }: { status: string }) {
  const s = status as QuotationStatus;
  const colorClass = STATUS_COLORS[s] ?? "bg-slate-500/15 text-slate-500 border-slate-500/30";
  const Icon = STATUS_ICONS[s] ?? AlertCircle;
  return (
    <Badge variant="outline" className={`gap-1 capitalize ${colorClass}`}>
      <Icon className="h-3 w-3" />
      {status}
    </Badge>
  );
}

type SortKey = "newest" | "oldest" | "highest" | "lowest";

const PAGE_SIZE = 25;

export default function AdminQuotations() {
  const { formatCurrency, formatDate } = useFormatters();
  const { user } = useAuth();
  const { can, isLoading: permLoading } = useAdminPermissions();
  const isSuperAdmin = user?.role === "super_admin";
  const hasPermission = isSuperAdmin || can("manage_quotations");
  const canViewCommission = isSuperAdmin || can("commission_management");

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sellerFilter, setSellerFilter] = useState("");
  const [buyerFilter, setBuyerFilter] = useState("");
  const [brandFilter, setBrandFilter] = useState("all");
  const [commissionTypeFilter, setCommissionTypeFilter] = useState<string>("all");
  const [commissionRuleId, setCommissionRuleId] = useState<string>("all");
  const [minCommission, setMinCommission] = useState("");
  const [maxCommission, setMaxCommission] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("newest");
  const [displayPage, setDisplayPage] = useState(1);

  const { data, isLoading } = useListQuotations(
    { limit: 1000 } as any,
    { query: { enabled: hasPermission && !permLoading } }
  );
  const rows = (data?.data ?? []) as Array<Record<string, any>>;

  const { data: rulesData } = useListCommissionRules({ isActive: true } as any);
  const commissionRules = (rulesData as any)?.data ?? [];

  const uniqueBrands = useMemo(() => {
    const brands = new Set<string>();
    for (const q of rows) {
      if (q.vehicleBrand) brands.add(q.vehicleBrand);
    }
    return Array.from(brands).sort();
  }, [rows]);

  const filtered = useMemo(() => {
    let list = rows;

    if (statusFilter !== "all") {
      list = list.filter(q => q.status === statusFilter);
    }

    if (brandFilter !== "all") {
      list = list.filter(q => q.vehicleBrand === brandFilter);
    }

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(r =>
        r.id?.toLowerCase().includes(q) ||
        r.vehicleTitle?.toLowerCase().includes(q) ||
        r.buyerName?.toLowerCase().includes(q) ||
        r.sellerName?.toLowerCase().includes(q)
      );
    }

    if (sellerFilter.trim()) {
      const s = sellerFilter.trim().toLowerCase();
      list = list.filter(r => r.sellerName?.toLowerCase().includes(s));
    }

    if (buyerFilter.trim()) {
      const b = buyerFilter.trim().toLowerCase();
      list = list.filter(r => r.buyerName?.toLowerCase().includes(b));
    }

    if (commissionTypeFilter !== "all") {
      if (commissionTypeFilter === "none") {
        list = list.filter(r => !r.commissionType);
      } else {
        list = list.filter(r => r.commissionType === commissionTypeFilter);
      }
    }

    if (commissionRuleId !== "all") {
      list = list.filter(r => r.commissionRuleId === commissionRuleId);
    }

    if (minCommission) {
      const min = Number(minCommission);
      list = list.filter(r => r.commissionAmountUsd != null && Number(r.commissionAmountUsd) >= min);
    }

    if (maxCommission) {
      const max = Number(maxCommission);
      list = list.filter(r => r.commissionAmountUsd != null && Number(r.commissionAmountUsd) <= max);
    }

    if (dateFrom) {
      const from = new Date(dateFrom).getTime();
      list = list.filter(r => new Date(r.createdAt).getTime() >= from);
    }

    if (dateTo) {
      const to = new Date(dateTo).getTime() + 86_400_000;
      list = list.filter(r => new Date(r.createdAt).getTime() <= to);
    }

    list = [...list].sort((a, b) => {
      if (sortKey === "newest") return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      if (sortKey === "oldest") return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      if (sortKey === "highest") return (b.totalAmountUsd ?? 0) - (a.totalAmountUsd ?? 0);
      if (sortKey === "lowest") return (a.totalAmountUsd ?? 0) - (b.totalAmountUsd ?? 0);
      return 0;
    });

    return list;
  }, [rows, statusFilter, brandFilter, search, sellerFilter, buyerFilter, commissionTypeFilter, commissionRuleId, minCommission, maxCommission, dateFrom, dateTo, sortKey]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(displayPage, totalPages);
  const paginatedRows = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const resetPage = () => setDisplayPage(1);

  const counts = useMemo(() => {
    const result: Record<string, number> = { all: rows.length };
    for (const q of rows) {
      result[q.status] = (result[q.status] ?? 0) + 1;
    }
    return result;
  }, [rows]);

  if (!permLoading && !hasPermission) {
    return (
      <AdminLayout>
        <div className="flex flex-col items-center justify-center h-full py-32 gap-4 text-center">
          <Lock className="h-12 w-12 text-muted-foreground" />
          <div>
            <p className="text-lg font-semibold">Access Restricted</p>
            <p className="text-sm text-muted-foreground mt-1">
              You need the <code className="bg-muted px-1 rounded text-xs">manage_quotations</code> permission to view this page.
            </p>
          </div>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="p-6 space-y-5">
        <div className="flex items-center gap-3">
          <ClipboardList className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Quotations</h1>
            <p className="text-sm text-muted-foreground">Monitor all buyer-seller quotations across the platform</p>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {(["all", "pending", "accepted", "rejected", "expired"] as const).map(s => (
            <Card
              key={s}
              className={`cursor-pointer transition-colors ${statusFilter === s ? "ring-2 ring-primary" : "hover:bg-muted/50"}`}
              onClick={() => { setStatusFilter(s); resetPage(); }}
            >
              <CardHeader className="pb-1 pt-3 px-4">
                <CardTitle className="text-xs font-medium text-muted-foreground capitalize">{s === "all" ? "All" : s}</CardTitle>
              </CardHeader>
              <CardContent className="pb-3 px-4">
                <span className="text-2xl font-bold">{isLoading ? "—" : (counts[s] ?? 0)}</span>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search ID, vehicle…"
              className="pl-9"
              value={search}
              onChange={e => { setSearch(e.target.value); resetPage(); }}
            />
          </div>
          <Input
            placeholder="Filter by seller name…"
            value={sellerFilter}
            onChange={e => { setSellerFilter(e.target.value); resetPage(); }}
          />
          <Input
            placeholder="Filter by buyer name…"
            value={buyerFilter}
            onChange={e => { setBuyerFilter(e.target.value); resetPage(); }}
          />
          <Select value={brandFilter} onValueChange={v => { setBrandFilter(v); resetPage(); }}>
            <SelectTrigger>
              <SelectValue placeholder="All Brands" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Brands</SelectItem>
              {uniqueBrands.map(b => (
                <SelectItem key={b} value={b}>{b}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={commissionTypeFilter} onValueChange={v => { setCommissionTypeFilter(v); resetPage(); }}>
            <SelectTrigger className="w-[180px]">
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
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Commission rule" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Rules</SelectItem>
              {commissionRules.map((r: any) => (
                <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            type="number"
            placeholder="Min commission $"
            value={minCommission}
            onChange={e => { setMinCommission(e.target.value); resetPage(); }}
            className="w-[160px]"
          />
          <Input
            type="number"
            placeholder="Max commission $"
            value={maxCommission}
            onChange={e => { setMaxCommission(e.target.value); resetPage(); }}
            className="w-[160px]"
          />
        </div>

        <div className="flex flex-wrap gap-3 items-center">
          <div className="flex items-center gap-2">
            <label className="text-sm text-muted-foreground whitespace-nowrap">From</label>
            <Input
              type="date"
              className="w-36"
              value={dateFrom}
              onChange={e => { setDateFrom(e.target.value); resetPage(); }}
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm text-muted-foreground whitespace-nowrap">To</label>
            <Input
              type="date"
              className="w-36"
              value={dateTo}
              onChange={e => { setDateTo(e.target.value); resetPage(); }}
            />
          </div>
          <Select value={sortKey} onValueChange={v => { setSortKey(v as SortKey); resetPage(); }}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Sort" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="newest">Newest First</SelectItem>
              <SelectItem value="oldest">Oldest First</SelectItem>
              <SelectItem value="highest">Highest Value</SelectItem>
              <SelectItem value="lowest">Lowest Value</SelectItem>
            </SelectContent>
          </Select>
          {(search || sellerFilter || buyerFilter || brandFilter !== "all" || dateFrom || dateTo || statusFilter !== "all" || commissionTypeFilter !== "all" || commissionRuleId !== "all" || minCommission || maxCommission) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSearch(""); setSellerFilter(""); setBuyerFilter("");
                setBrandFilter("all"); setDateFrom(""); setDateTo("");
                setStatusFilter("all"); setCommissionTypeFilter("all");
                setCommissionRuleId("all"); setMinCommission(""); setMaxCommission(""); resetPage();
              }}
            >
              Clear filters
            </Button>
          )}
        </div>

        <Card className="border-border">
          <CardContent className="p-0">
          <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[100px]">ID</TableHead>
                <TableHead>Vehicle</TableHead>
                <TableHead>Seller</TableHead>
                <TableHead>Buyer</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead className="text-right">Vehicle Price</TableHead>
                <TableHead className="text-right">Shipping Cost</TableHead>
                <TableHead className="text-right">Additional Fees</TableHead>
                <TableHead className="text-right">FOB Total</TableHead>
                <TableHead className="text-right">Final Buyer Price</TableHead>
                {canViewCommission && <TableHead>Commission Type</TableHead>}
                {canViewCommission && <TableHead className="text-right">Comm. Value</TableHead>}
                {canViewCommission && <TableHead className="text-right">Platform Commission</TableHead>}
                <TableHead>Status</TableHead>
                <TableHead>Expires</TableHead>
                <TableHead>Created</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: canViewCommission ? 17 : 14 }).map((__, j) => (
                      <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                    ))}
                  </TableRow>
                ))
              ) : paginatedRows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={canViewCommission ? 17 : 14} className="text-center py-12 text-muted-foreground">
                    No quotations match the current filters
                  </TableCell>
                </TableRow>
              ) : (
                paginatedRows.map(q => (
                  <TableRow key={q.id} className="hover:bg-muted/30">
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {(q as any).quotationNumber ?? q.id.slice(0, 8) + "…"}
                    </TableCell>
                    <TableCell>
                      <span className="text-sm line-clamp-1 max-w-[180px]" title={q.vehicleTitle ?? ""}>
                        {q.vehicleTitle ?? <span className="text-muted-foreground">—</span>}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm">{q.sellerName ?? "—"}</TableCell>
                    <TableCell className="text-sm">{q.buyerName ?? "—"}</TableCell>
                    <TableCell className="text-right text-sm">{q.quantity}</TableCell>
                    <TableCell className="text-right text-sm font-mono">
                      {formatCurrency(q.unitPriceUsd)}
                    </TableCell>
                    <TableCell className="text-right text-sm font-mono text-muted-foreground">
                      {q.shippingFeeUsd != null ? formatCurrency(q.shippingFeeUsd) : "—"}
                    </TableCell>
                    <TableCell className="text-right text-sm font-mono text-muted-foreground">
                      {q.otherFeesUsd != null ? formatCurrency(q.otherFeesUsd) : "—"}
                    </TableCell>
                    <TableCell className="text-right text-sm font-mono text-muted-foreground">
                      {(q as any).fobTotalUsd != null ? formatCurrency((q as any).fobTotalUsd) : "—"}
                    </TableCell>
                    <TableCell className="text-right text-sm font-semibold font-mono">
                      {q.totalAmountUsd != null ? formatCurrency(q.totalAmountUsd) : "—"}
                    </TableCell>
                    {canViewCommission && (
                      <TableCell className="text-xs">
                        {(q as any).commissionType ? (
                          <span className="capitalize text-muted-foreground">{(q as any).commissionType}</span>
                        ) : <span className="text-muted-foreground">—</span>}
                      </TableCell>
                    )}
                    {canViewCommission && (
                      <TableCell className="text-right text-xs font-mono">
                        {(q as any).commissionValue != null ? (
                          <span className="text-muted-foreground">
                            {(q as any).commissionType === "percentage"
                              ? `${Number((q as any).commissionValue).toFixed(2)}%`
                              : formatCurrency((q as any).commissionValue)}
                          </span>
                        ) : <span className="text-muted-foreground">—</span>}
                      </TableCell>
                    )}
                    {canViewCommission && (
                      <TableCell className="text-right text-xs font-mono">
                        {(q as any).commissionAmountUsd != null ? (
                          <span className="text-emerald-600 font-medium">{formatCurrency((q as any).commissionAmountUsd)}</span>
                        ) : <span className="text-muted-foreground">—</span>}
                      </TableCell>
                    )}
                    <TableCell><StatusBadge status={q.status} /></TableCell>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {formatDate(q.expiresAt)}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {formatDate(q.createdAt)}
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" asChild>
                        <Link href={`/admin/quotations/${q.id}`}>
                          <ExternalLink className="h-4 w-4" />
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          </div>
          {!isLoading && filtered.length > 0 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-border">
              <p className="text-sm text-muted-foreground">
                Showing {((safePage - 1) * PAGE_SIZE) + 1}–{Math.min(safePage * PAGE_SIZE, filtered.length)} of {filtered.length} quotation{filtered.length !== 1 ? "s" : ""}
                {filtered.length !== rows.length && ` (${rows.length} total)`}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setDisplayPage(p => Math.max(1, p - 1))}
                  disabled={safePage <= 1}
                >
                  <ChevronLeft className="h-4 w-4" />
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setDisplayPage(p => Math.min(totalPages, p + 1))}
                  disabled={safePage >= totalPages}
                >
                  Next
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
