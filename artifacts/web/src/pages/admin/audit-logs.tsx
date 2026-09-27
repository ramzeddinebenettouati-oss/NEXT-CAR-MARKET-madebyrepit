import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useFormatters } from "@/hooks/use-formatters";
import { AdminLayout } from "@/components/admin-layout";
import { useListAuditLogs, getListAuditLogsQueryKey } from "@workspace/api-client-react";
import { useAuth } from "@/hooks/use-auth";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ArrowLeft, Shield, X } from "lucide-react";
import { Link } from "wouter";

const MODULE_COLORS: Record<string, string> = {
  vehicles: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  users: "bg-violet-500/15 text-violet-400 border-violet-500/30",
  orders: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  payments: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  settings: "bg-cyan-500/15 text-cyan-400 border-cyan-500/30",
  commissions: "bg-pink-500/15 text-pink-400 border-pink-500/30",
  reference: "bg-orange-500/15 text-orange-400 border-orange-500/30",
};

export default function AuditLogs() {
  const { t } = useTranslation();
  const { formatDateTime } = useFormatters();
  const { user } = useAuth();
  const [page, setPage] = useState(1);
  const [moduleFilter, setModuleFilter] = useState("all");
  const [actionFilter, setActionFilter] = useState("");
  const [userFilter, setUserFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const params = {
    page,
    limit: 25,
    ...(moduleFilter !== "all" ? { module: moduleFilter } : {}),
    ...(actionFilter ? { action: actionFilter } : {}),
    ...(userFilter ? { userId: userFilter } : {}),
    ...(dateFrom ? { dateFrom } : {}),
    ...(dateTo ? { dateTo } : {}),
  };

  const { data, isLoading } = useListAuditLogs(params, {
    query: { queryKey: getListAuditLogsQueryKey(params) },
  });

  const isAdmin = user?.role === "admin" || user?.role === "super_admin";
  if (!isAdmin) return <div className="flex items-center justify-center min-h-[60vh] text-muted-foreground">{t("adminAuditLogs.accessDenied")}</div>;

  const logs = data?.data ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / 25);

  function clearFilters() {
    setModuleFilter("all");
    setActionFilter("");
    setUserFilter("");
    setDateFrom("");
    setDateTo("");
    setPage(1);
  }

  const hasActiveFilters = moduleFilter !== "all" || actionFilter || userFilter || dateFrom || dateTo;

  return (
    <AdminLayout>
    <div className="p-6 lg:p-8 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center gap-4 flex-wrap">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/admin/dashboard"><ArrowLeft className="h-4 w-4 mr-2" /> {t("dashboard.overview")}</Link>
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold flex items-center gap-2"><Shield className="h-6 w-6" /> {t("adminAuditLogs.title")}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{t("adminAuditLogs.subtitle")}</p>
        </div>
        {data && <span className="text-sm text-muted-foreground">{t("adminAuditLogs.entriesCount", { count: total })}</span>}
      </div>

      <div className="rounded-lg border border-border bg-card/50 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{t("adminAuditLogs.filters")}</p>
          {hasActiveFilters && (
            <Button variant="ghost" size="sm" className="h-6 text-xs gap-1" onClick={clearFilters}>
              <X className="h-3 w-3" /> {t("adminAuditLogs.clearAll")}
            </Button>
          )}
        </div>
        <div className="flex flex-wrap gap-3 items-end">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">{t("adminAuditLogs.module")}</Label>
            <Select value={moduleFilter} onValueChange={(v) => { setModuleFilter(v); setPage(1); }}>
              <SelectTrigger className="w-40 h-8 text-sm">
                <SelectValue placeholder={t("adminAuditLogs.allModules")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("adminAuditLogs.allModules")}</SelectItem>
                <SelectItem value="vehicles">Vehicles</SelectItem>
                <SelectItem value="users">Users</SelectItem>
                <SelectItem value="orders">Orders</SelectItem>
                <SelectItem value="payments">Payments</SelectItem>
                <SelectItem value="settings">Settings</SelectItem>
                <SelectItem value="commissions">Commissions</SelectItem>
                <SelectItem value="reference">Reference</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">{t("adminAuditLogs.actionContains")}</Label>
            <Input
              placeholder="e.g. PAYMENT_VERIFIED"
              className="w-48 h-8 text-sm"
              value={actionFilter}
              onChange={(e) => { setActionFilter(e.target.value); setPage(1); }}
            />
          </div>

          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">{t("adminAuditLogs.userId")}</Label>
            <Input
              placeholder={t("adminAuditLogs.filterByUserId")}
              className="w-48 h-8 text-sm"
              value={userFilter}
              onChange={(e) => { setUserFilter(e.target.value); setPage(1); }}
            />
          </div>

          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">{t("adminAuditLogs.fromDate")}</Label>
            <Input
              type="date"
              className="w-36 h-8 text-sm"
              value={dateFrom}
              onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">{t("adminAuditLogs.toDate")}</Label>
            <Input
              type="date"
              className="w-36 h-8 text-sm"
              value={dateTo}
              onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
            />
          </div>
        </div>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("adminAuditLogs.colTime")}</TableHead>
              <TableHead>{t("adminAuditLogs.colUser")}</TableHead>
              <TableHead>{t("adminAuditLogs.colModule")}</TableHead>
              <TableHead>{t("adminAuditLogs.colAction")}</TableHead>
              <TableHead>{t("adminAuditLogs.colDetails")}</TableHead>
              <TableHead>{t("adminAuditLogs.colIP")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 6 }).map((__, j) => <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>)}
                </TableRow>
              ))
            ) : logs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-10 text-muted-foreground">
                  {t("adminAuditLogs.noEntries")}
                </TableCell>
              </TableRow>
            ) : (
              logs.map((log) => (
                <TableRow key={log.id}>
                  <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                    {formatDateTime(log.createdAt)}
                  </TableCell>
                  <TableCell className="text-xs">
                    {log.userEmail ?? log.userId?.slice(0, 10) ?? "System"}
                  </TableCell>
                  <TableCell>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${MODULE_COLORS[log.module] ?? "bg-muted text-muted-foreground border-border"}`}>
                      {log.module}
                    </span>
                  </TableCell>
                  <TableCell className="text-sm font-mono text-xs">{log.action}</TableCell>
                  <TableCell className="text-xs text-muted-foreground max-w-xs truncate">
                    {log.details ?? "—"}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground font-mono">
                    {log.ipAddress ?? "—"}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>{t("adminAuditLogs.previous")}</Button>
          <span className="text-sm text-muted-foreground">{t("adminAuditLogs.pageOf", { page, total: totalPages })}</span>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>{t("adminAuditLogs.next")}</Button>
        </div>
      )}
    </div>
    </AdminLayout>
  );
}
