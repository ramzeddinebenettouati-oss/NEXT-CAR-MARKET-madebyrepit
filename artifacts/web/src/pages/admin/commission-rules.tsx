import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useFormatters } from "@/hooks/use-formatters";
import { AdminLayout } from "@/components/admin-layout";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListCommissionRules, getListCommissionRulesQueryKey,
  useCreateCommissionRule, useUpdateCommissionRule, useDeleteCommissionRule,
} from "@workspace/api-client-react";
import type { CommissionRule, CreateCommissionRuleInput } from "@workspace/api-client-react";
import { useAuth } from "@/hooks/use-auth";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Plus, Pencil, Trash2, PercentCircle } from "lucide-react";
import { Link } from "wouter";

type RuleForm = {
  name: string;
  type: "fixed" | "percentage" | "hybrid";
  scope: "default" | "seller" | "country" | "category";
  scopeValue: string;
  fixedAmountUsd: string;
  percentageRate: string;
  priority: string;
  isActive: boolean;
};

const EMPTY_FORM: RuleForm = {
  name: "", type: "percentage", scope: "default", scopeValue: "",
  fixedAmountUsd: "", percentageRate: "", priority: "10", isActive: true,
};

export default function CommissionRules() {
  const { t } = useTranslation();
  const { formatCurrency } = useFormatters();
  const { user } = useAuth();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<CommissionRule | null>(null);
  const [form, setForm] = useState<RuleForm>(EMPTY_FORM);
  const [deleteTarget, setDeleteTarget] = useState<CommissionRule | null>(null);

  const { data, isLoading } = useListCommissionRules(
    {},
    { query: { queryKey: getListCommissionRulesQueryKey() } },
  );
  const createMut = useCreateCommissionRule();
  const updateMut = useUpdateCommissionRule();
  const deleteMut = useDeleteCommissionRule();

  const isAdmin = user?.role === "admin" || user?.role === "super_admin";
  if (!isAdmin) return <div className="flex items-center justify-center min-h-[60vh] text-muted-foreground">{t("adminCommission.accessDenied")}</div>;

  const invalidate = () => qc.invalidateQueries({ queryKey: getListCommissionRulesQueryKey() });

  const openCreate = () => {
    setEditingRule(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  };

  const openEdit = (rule: CommissionRule) => {
    setEditingRule(rule);
    setForm({
      name: rule.name,
      type: rule.type as RuleForm["type"],
      scope: rule.scope as RuleForm["scope"],
      scopeValue: rule.scopeValue ?? "",
      fixedAmountUsd: rule.fixedAmountUsd != null ? String(rule.fixedAmountUsd) : "",
      percentageRate: rule.percentageRate != null ? String(rule.percentageRate) : "",
      priority: String(rule.priority),
      isActive: rule.isActive,
    });
    setDialogOpen(true);
  };

  const handleSave = () => {
    const payload: CreateCommissionRuleInput = {
      name: form.name,
      type: form.type,
      scope: form.scope,
      scopeValue: form.scopeValue || null,
      fixedAmountUsd: form.fixedAmountUsd ? Number(form.fixedAmountUsd) : null,
      percentageRate: form.percentageRate ? Number(form.percentageRate) : null,
      priority: Number(form.priority) || 10,
      isActive: form.isActive,
    };

    if (editingRule) {
      updateMut.mutate(
        { ruleId: editingRule.id, data: payload },
        {
          onSuccess: () => { toast({ title: t("adminCommission.toastUpdated") }); invalidate(); setDialogOpen(false); },
          onError: () => toast({ title: t("adminCommission.toastUpdateFailed"), variant: "destructive" }),
        },
      );
    } else {
      createMut.mutate(
        { data: payload },
        {
          onSuccess: () => { toast({ title: t("adminCommission.toastCreated") }); invalidate(); setDialogOpen(false); },
          onError: () => toast({ title: t("adminCommission.toastCreateFailed"), variant: "destructive" }),
        },
      );
    }
  };

  const handleDelete = () => {
    if (!deleteTarget) return;
    deleteMut.mutate(
      { ruleId: deleteTarget.id },
      {
        onSuccess: () => { toast({ title: t("adminCommission.toastDeleted") }); invalidate(); setDeleteTarget(null); },
        onError: () => toast({ title: t("adminCommission.toastDeleteFailed"), variant: "destructive" }),
      },
    );
  };

  const rules = data?.data ?? [];
  const isSaving = createMut.isPending || updateMut.isPending;

  return (
    <AdminLayout>
    <div className="p-6 lg:p-8 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-4 flex-wrap">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/admin/dashboard"><ArrowLeft className="h-4 w-4 mr-2" /> {t("dashboard.overview")}</Link>
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold flex items-center gap-2"><PercentCircle className="h-6 w-6" /> {t("adminCommission.title")}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{t("adminCommission.subtitle")}</p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4 mr-2" /> {t("adminCommission.newRule")}
        </Button>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("adminCommission.colName")}</TableHead>
              <TableHead>{t("adminCommission.colType")}</TableHead>
              <TableHead>{t("adminCommission.colScope")}</TableHead>
              <TableHead>{t("adminCommission.colRate")}</TableHead>
              <TableHead>{t("adminCommission.colPriority")}</TableHead>
              <TableHead>{t("adminCommission.colStatus")}</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 7 }).map((__, j) => <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>)}
                </TableRow>
              ))
            ) : rules.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-10 text-muted-foreground">
                  {t("adminCommission.noRules")}
                </TableCell>
              </TableRow>
            ) : (
              rules.map((rule) => (
                <TableRow key={rule.id}>
                  <TableCell className="font-medium">{rule.name}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="capitalize">{rule.type}</Badge>
                  </TableCell>
                  <TableCell className="capitalize text-sm">
                    {rule.scope}{rule.scopeValue ? `: ${rule.scopeValue}` : ""}
                  </TableCell>
                  <TableCell className="text-sm font-mono">
                    {rule.type === "fixed" && formatCurrency(rule.fixedAmountUsd)}
                    {rule.type === "percentage" && `${rule.percentageRate}%`}
                    {rule.type === "hybrid" && `${formatCurrency(rule.fixedAmountUsd)} + ${rule.percentageRate}%`}
                  </TableCell>
                  <TableCell className="text-sm">{rule.priority}</TableCell>
                  <TableCell>
                    <Badge variant={rule.isActive ? "default" : "secondary"}
                      className={rule.isActive ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" : ""}>
                      {rule.isActive ? t("adminCommission.statusActive") : t("adminCommission.statusInactive")}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1 justify-end">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(rule)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500 hover:text-red-500" onClick={() => setDeleteTarget(rule)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingRule ? t("adminCommission.editTitle") : t("adminCommission.createTitle")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">{t("adminCommission.fieldName")}</label>
              <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Default 5%" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">{t("adminCommission.fieldType")}</label>
                <Select value={form.type} onValueChange={(v) => setForm((f) => ({ ...f, type: v as RuleForm["type"] }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fixed">{t("adminCommission.typeFixed")}</SelectItem>
                    <SelectItem value="percentage">{t("adminCommission.typePercentage")}</SelectItem>
                    <SelectItem value="hybrid">{t("adminCommission.typeHybrid")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">{t("adminCommission.fieldScope")}</label>
                <Select value={form.scope} onValueChange={(v) => setForm((f) => ({ ...f, scope: v as RuleForm["scope"] }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="default">{t("adminCommission.scopeDefault")}</SelectItem>
                    <SelectItem value="seller">{t("adminCommission.scopeSeller")}</SelectItem>
                    <SelectItem value="country">{t("adminCommission.scopeCountry")}</SelectItem>
                    <SelectItem value="category">{t("adminCommission.scopeCategory")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {form.scope !== "default" && (
              <div className="space-y-1.5">
                <label className="text-sm font-medium">{t("adminCommission.fieldScopeValue")}</label>
                <Input
                  value={form.scopeValue}
                  onChange={(e) => setForm((f) => ({ ...f, scopeValue: e.target.value }))}
                  placeholder={form.scope === "seller" ? "Seller user ID" : form.scope === "country" ? "e.g. CN, US" : "Category name"}
                />
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              {(form.type === "fixed" || form.type === "hybrid") && (
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">{t("adminCommission.fieldFixedAmount")}</label>
                  <Input type="number" min="0" step="0.01" value={form.fixedAmountUsd}
                    onChange={(e) => setForm((f) => ({ ...f, fixedAmountUsd: e.target.value }))} placeholder="0.00" />
                </div>
              )}
              {(form.type === "percentage" || form.type === "hybrid") && (
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">{t("adminCommission.fieldPercentage")}</label>
                  <Input type="number" min="0" max="100" step="0.01" value={form.percentageRate}
                    onChange={(e) => setForm((f) => ({ ...f, percentageRate: e.target.value }))} placeholder="5.00" />
                </div>
              )}
              <div className="space-y-1.5">
                <label className="text-sm font-medium">{t("adminCommission.fieldPriority")}</label>
                <Input type="number" min="1" value={form.priority}
                  onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))} placeholder="10" />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" id="isActive" checked={form.isActive}
                onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))} className="rounded" />
              <label htmlFor="isActive" className="text-sm font-medium cursor-pointer">{t("adminCommission.fieldActive")}</label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>{t("adminCommission.cancel")}</Button>
            <Button onClick={handleSave} disabled={!form.name || isSaving}>
              {isSaving ? t("adminCommission.saving") : editingRule ? t("adminCommission.saveChanges") : t("adminCommission.createRule")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("adminCommission.deleteTitle")}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {t("adminCommission.deleteDesc", { name: deleteTarget?.name ?? "" })}
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>{t("adminCommission.cancel")}</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleteMut.isPending}>
              {deleteMut.isPending ? t("adminCommission.deleting") : t("adminCommission.deleteRule")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
    </AdminLayout>
  );
}
