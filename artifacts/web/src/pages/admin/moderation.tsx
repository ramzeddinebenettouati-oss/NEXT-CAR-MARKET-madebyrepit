import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useFormatters } from "@/hooks/use-formatters";
import { AdminLayout } from "@/components/admin-layout";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetModerationQueue,
  getGetModerationQueueQueryKey,
  useApproveVehicle,
  useRejectVehicle,
  useListCommissionRules,
} from "@workspace/api-client-react";
import { useAuth } from "@/hooks/use-auth";
import { useAdminPermissions } from "@/hooks/use-admin-permissions";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { ArrowLeft, CheckCircle2, XCircle, CarFront, PercentCircle, DollarSign, AlertCircle, ChevronDown, ChevronUp, MessageSquare } from "lucide-react";
import { Link } from "wouter";
type VehicleWithCommission = {
  id: string;
  brandName: string;
  modelName: string;
  year: number;
  condition?: string | null;
  fuelType?: string | null;
  mileageKm?: number | null;
  fobPriceUsd?: number | string | null;
  commissionRuleId?: string | null;
  commissionType?: string | null;
  commissionValue?: number | null;
  commissionSnapshot?: any | null;
};

function CommissionPanel({
  vehicle,
  canAssign,
  onSaved,
}: {
  vehicle: VehicleWithCommission;
  canAssign: boolean;
  onSaved: (result: { commissionRuleId: string | null; commissionType: string | null; commissionValue: number | null; commissionSnapshot: unknown }) => void;
}) {
  const { formatCurrency } = useFormatters();
  const [selectedRuleId, setSelectedRuleId] = useState<string>(vehicle.commissionRuleId ?? "");
  const [saving, setSaving] = useState(false);

  const { data: rulesData } = useListCommissionRules({ isActive: "true" } as any, {
    query: { enabled: canAssign },
  });
  const rules = (rulesData?.data ?? []) as Array<Record<string, any>>;

  const selectedRule = rules.find(r => r.id === selectedRuleId);
  const fobPrice = Number(vehicle.fobPriceUsd ?? 0);

  function computeEstimated(rule: Record<string, any>): number {
    const fixed = Number(rule.fixedAmountUsd ?? 0);
    const pct = Number(rule.percentageRate ?? 0);
    if (rule.type === "fixed") return fixed;
    if (rule.type === "percentage") return fobPrice * (pct / 100);
    if (rule.type === "hybrid") return fixed + fobPrice * (pct / 100);
    return 0;
  }

  async function handleSave() {
    if (!selectedRuleId) return;
    setSaving(true);
    try {
      const token = localStorage.getItem("ac_access_token") ?? "";
      const resp = await fetch(`/api/admin/vehicles/${vehicle.id}/commission`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ruleId: selectedRuleId }),
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        toast.error(err.message ?? "Failed to save commission");
        return;
      }
      const result = await resp.json();
      toast.success("Commission rule assigned successfully");
      onSaved(result);
    } catch {
      toast.error("Network error saving commission");
    } finally {
      setSaving(false);
    }
  }

  const hasCommission = !!vehicle.commissionSnapshot;
  const currentSnap = vehicle.commissionSnapshot as any;

  return (
    <div className="mt-3 pt-3 border-t border-border">
      <div className="flex items-center gap-2 mb-3">
        <PercentCircle className="h-4 w-4 text-primary" />
        <span className="text-sm font-semibold">Commission Assignment</span>
        {hasCommission && (
          <Badge variant="secondary" className="text-xs bg-emerald-500/15 text-emerald-600 border-emerald-500/30">
            Assigned
          </Badge>
        )}
      </div>

      {hasCommission && !canAssign && (
        <div className="text-xs text-muted-foreground bg-muted/40 rounded-md p-2">
          <span className="font-medium text-foreground">{currentSnap?.name}</span> — {currentSnap?.type}
          {currentSnap?.type === "fixed" && ` · $${Number(currentSnap?.fixedAmountUsd ?? 0).toFixed(2)}`}
          {currentSnap?.type === "percentage" && ` · ${Number(currentSnap?.percentageRate ?? 0)}%`}
          {currentSnap?.type === "hybrid" && ` · $${Number(currentSnap?.fixedAmountUsd ?? 0).toFixed(2)} + ${Number(currentSnap?.percentageRate ?? 0)}%`}
        </div>
      )}

      {canAssign && (
        <div className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Commission Rule</label>
              <Select value={selectedRuleId} onValueChange={setSelectedRuleId}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="Select a rule…" />
                </SelectTrigger>
                <SelectContent>
                  {rules.map(r => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.name} — {r.type}
                      {r.type === "fixed" && ` ($${Number(r.fixedAmountUsd ?? 0).toFixed(0)})`}
                      {r.type === "percentage" && ` (${Number(r.percentageRate ?? 0)}%)`}
                      {r.type === "hybrid" && ` ($${Number(r.fixedAmountUsd ?? 0).toFixed(0)} + ${Number(r.percentageRate ?? 0)}%)`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {selectedRule && (
              <div className="flex items-end gap-2 text-xs">
                <div className="bg-muted/50 rounded-md px-3 py-2 flex-1">
                  <p className="text-muted-foreground mb-0.5">Est. platform revenue</p>
                  <p className="font-bold text-base text-emerald-600">
                    {formatCurrency(computeEstimated(selectedRule))}
                  </p>
                  <p className="text-muted-foreground">on {formatCurrency(fobPrice)} FOB price</p>
                </div>
              </div>
            )}
          </div>
          <Button
            size="sm"
            variant="outline"
            disabled={!selectedRuleId || saving}
            onClick={handleSave}
          >
            <DollarSign className="h-3.5 w-3.5 mr-1" />
            {saving ? "Saving…" : "Save Commission"}
          </Button>
        </div>
      )}
    </div>
  );
}

export default function AdminModeration() {
  const { t } = useTranslation();
  const { formatCurrency, formatNumber } = useFormatters();
  const { user } = useAuth();
  const { can } = useAdminPermissions();
  const qc = useQueryClient();
  const [rejectTarget, setRejectTarget] = useState<VehicleWithCommission | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [approveTarget, setApproveTarget] = useState<VehicleWithCommission | null>(null);
  const [expandedCommission, setExpandedCommission] = useState<Set<string>>(new Set());

  const { data, isLoading } = useGetModerationQueue(
    { limit: 50 },
    { query: { queryKey: getGetModerationQueueQueryKey({ limit: 50 }) } },
  );
  const approve = useApproveVehicle();
  const reject = useRejectVehicle();

  const isAdmin = user?.role === "admin" || user?.role === "super_admin";
  const isSuperAdmin = user?.role === "super_admin";
  const canAssignCommission = isSuperAdmin || can("commission_assignment");

  if (!isAdmin) return <div className="flex items-center justify-center min-h-[60vh] text-muted-foreground">{t("adminModeration.accessDenied")}</div>;

  const invalidate = () => qc.invalidateQueries({ queryKey: getGetModerationQueueQueryKey({ limit: 50 }) });

  const handleCommissionSaved = (vehicleId: string, result: { commissionRuleId: string | null; commissionType: string | null; commissionValue: number | null; commissionSnapshot: unknown }) => {
    qc.setQueryData(getGetModerationQueueQueryKey({ limit: 50 }), (old: any) => {
      if (!old) return old;
      return {
        ...old,
        data: (old.data as VehicleWithCommission[]).map((v) =>
          v.id === vehicleId
            ? { ...v, commissionRuleId: result.commissionRuleId, commissionType: result.commissionType, commissionValue: result.commissionValue, commissionSnapshot: result.commissionSnapshot }
            : v
        ),
      };
    });
    invalidate();
  };

  const handleApprove = () => {
    if (!approveTarget) return;
    approve.mutate(
      { vehicleId: approveTarget.id, data: {} },
      {
        onSuccess: () => { invalidate(); setApproveTarget(null); },
        onError: (err: any) => {
          const msg = err?.response?.data?.message ?? err?.message ?? "Approval failed";
          toast.error(msg);
          setApproveTarget(null);
        },
      },
    );
  };

  const handleReject = () => {
    if (!rejectTarget) return;
    reject.mutate(
      { vehicleId: rejectTarget.id, data: { rejectionReason: rejectReason || "" } },
      {
        onSuccess: () => { invalidate(); setRejectTarget(null); setRejectReason(""); },
      },
    );
  };

  const toggleCommission = (id: string) => {
    setExpandedCommission(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const vehicles = (data?.data ?? []) as VehicleWithCommission[];

  return (
    <AdminLayout>
    <div className="p-6 lg:p-8 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-4 flex-wrap">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/admin/dashboard"><ArrowLeft className="h-4 w-4 mr-2" /> {t("dashboard.overview")}</Link>
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <CarFront className="h-6 w-6 text-primary" /> New Listed Vehicles
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">Review and approve new vehicle listings. Assign a commission rule before publishing.</p>
        </div>
        <Badge variant="secondary" className="text-sm px-3 py-1">
          {data?.total ?? 0} pending
        </Badge>
      </div>

      {isLoading ? (
        <div className="space-y-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-36" />)}</div>
      ) : vehicles.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <CheckCircle2 className="h-12 w-12 text-emerald-500 opacity-30 mb-3" />
          <p className="text-lg font-medium text-muted-foreground">All caught up!</p>
          <p className="text-sm text-muted-foreground mt-1">No vehicle listings are pending review.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {vehicles.map((v) => {
            const hasCommission = !!v.commissionSnapshot;
            const commExpanded = expandedCommission.has(v.id);
            return (
              <Card key={v.id} className="border-border">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-3">
                      <CarFront className="h-5 w-5 text-muted-foreground shrink-0" />
                      <div>
                        <p className="font-semibold">{v.brandName} {v.modelName} {v.year}</p>
                        <p className="text-xs text-muted-foreground">
                          {v.condition} · {formatCurrency(v.fobPriceUsd)} FOB
                        </p>
                      </div>
                      {!hasCommission && (
                        <Badge variant="outline" className="text-xs bg-amber-500/15 text-amber-600 border-amber-500/30 gap-1">
                          <AlertCircle className="h-3 w-3" />
                          Commission required
                        </Badge>
                      )}
                    </div>
                    <div className="flex gap-2 flex-wrap">
                      {(can("messages_management") || isSuperAdmin) && (
                        <Button size="sm" variant="outline" className="gap-1 text-xs" asChild>
                          <Link href={`/admin/messages?referenceType=vehicle&referenceId=${v.id}&referenceNumber=${encodeURIComponent(`${v.year} ${v.brandName} ${v.modelName}`)}`}>
                            <MessageSquare className="h-3.5 w-3.5" />
                            Messages
                          </Link>
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1 text-xs"
                        onClick={() => toggleCommission(v.id)}
                      >
                        <PercentCircle className="h-3.5 w-3.5" />
                        Commission
                        {commExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-emerald-500 border-emerald-500/40 hover:bg-emerald-500/10"
                        onClick={() => setApproveTarget(v)}
                        disabled={approve.isPending || reject.isPending || !hasCommission || !canAssignCommission}
                        title={!canAssignCommission ? "Requires commission_assignment permission" : !hasCommission ? "Assign a commission rule first" : "Approve and publish"}
                      >
                        <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> {t("adminModeration.approve")}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-red-500 border-red-500/40 hover:bg-red-500/10"
                        onClick={() => { setRejectTarget(v); setRejectReason(""); }}
                        disabled={approve.isPending || reject.isPending}
                      >
                        <XCircle className="h-3.5 w-3.5 mr-1" /> {t("adminModeration.reject")}
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs text-muted-foreground">
                    <div><span className="font-medium text-foreground">{t("adminModeration.colMileage")}</span> {v.mileageKm != null ? formatNumber(v.mileageKm) : "—"} km</div>
                    <div><span className="font-medium text-foreground">{t("adminModeration.colFuel")}</span> {v.fuelType ?? "—"}</div>
                    <div><span className="font-medium text-foreground">{t("adminModeration.colCondition")}</span> {v.condition ?? "—"}</div>
                    <div><span className="font-medium text-foreground">{t("adminModeration.colPrice")}</span> {formatCurrency(v.fobPriceUsd)} FOB</div>
                  </div>
                  {commExpanded && (
                    <CommissionPanel
                      vehicle={v}
                      canAssign={canAssignCommission}
                      onSaved={(result) => handleCommissionSaved(v.id, result)}
                    />
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={!!approveTarget} onOpenChange={() => setApproveTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-emerald-500" /> {t("adminModeration.approveTitle")}
            </DialogTitle>
            <DialogDescription>
              {t("adminModeration.approveDesc")}
            </DialogDescription>
          </DialogHeader>
          {approveTarget && (
            <div className="space-y-2">
              <p className="text-sm font-medium border border-border rounded-md p-3 bg-muted/30">
                {approveTarget.brandName} {approveTarget.modelName} {approveTarget.year}
              </p>
              {approveTarget.commissionSnapshot && (
                <p className="text-xs text-muted-foreground bg-emerald-500/10 border border-emerald-500/20 rounded-md p-2">
                  <span className="font-medium text-emerald-600">Commission assigned:</span>{" "}
                  {(approveTarget.commissionSnapshot as any)?.name} — {approveTarget.commissionType}
                </p>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setApproveTarget(null)}>{t("adminModeration.cancel")}</Button>
            <Button
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={handleApprove}
              disabled={approve.isPending}
            >
              {approve.isPending ? t("adminModeration.approving") : t("adminModeration.confirmApproval")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!rejectTarget} onOpenChange={() => { setRejectTarget(null); setRejectReason(""); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <XCircle className="h-5 w-5 text-red-500" /> {t("adminModeration.rejectTitle")}
            </DialogTitle>
            <DialogDescription>
              {t("adminModeration.rejectDesc")}
            </DialogDescription>
          </DialogHeader>
          {rejectTarget && (
            <p className="text-sm font-medium border border-border rounded-md p-3 bg-muted/30">
              {rejectTarget.brandName} {rejectTarget.modelName} {rejectTarget.year}
            </p>
          )}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">{t("adminModeration.rejectionReason")} <span className="text-muted-foreground">{t("adminModeration.optional")}</span></label>
            <textarea
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none min-h-[80px]"
              placeholder={t("adminModeration.rejectionPlaceholder")}
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setRejectTarget(null); setRejectReason(""); }}>{t("adminModeration.cancel")}</Button>
            <Button variant="destructive" onClick={handleReject} disabled={reject.isPending}>
              {reject.isPending ? t("adminModeration.rejecting") : t("adminModeration.confirmRejection")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
    </AdminLayout>
  );
}
