import { useState } from "react";
import { useTranslation } from "react-i18next";
import { AdminLayout } from "@/components/admin-layout";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListAdmins, getListAdminsQueryKey,
  useCreateAdmin, useUpdateAdminPermissions,
} from "@workspace/api-client-react";
import type { UserProfile } from "@workspace/api-client-react";
import { useAuth } from "@/hooks/use-auth";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Plus, UserCog, Shield } from "lucide-react";
import { Link } from "wouter";

const ALL_PERMISSIONS = [
  "manage_users",
  "manage_listings",
  "commission_assignment",
  "manage_orders",
  "order_management",
  "manage_payments",
  "manage_shipments",
  "manage_quotations",
  "view_analytics",
  "manage_settings",
  "manage_commissions",
  "manage_admins",
  "view_audit_logs",
  "messages_management",
];

const PERMISSION_GROUPS: { label: string; permissions: string[] }[] = [
  { label: "User Management", permissions: ["manage_users"] },
  { label: "Listings & Moderation", permissions: ["manage_listings", "commission_assignment"] },
  { label: "Quotation Management", permissions: ["manage_quotations"] },
  { label: "Order Management", permissions: ["order_management", "manage_orders"] },
  { label: "Payments", permissions: ["manage_payments"] },
  { label: "Logistics", permissions: ["manage_shipments"] },
  { label: "Finance", permissions: ["manage_commissions"] },
  { label: "Analytics & Audit", permissions: ["view_analytics", "view_audit_logs"] },
  { label: "Platform Settings", permissions: ["manage_settings", "manage_admins"] },
  { label: "Internal Messaging", permissions: ["messages_management"] },
];

type CreateForm = {
  email: string;
  firstName: string;
  lastName: string;
  password: string;
  department: string;
  permissions: string[];
};

const EMPTY_FORM: CreateForm = {
  email: "", firstName: "", lastName: "", password: "",
  department: "", permissions: [],
};

export default function AdminManagement() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<UserProfile | null>(null);
  const [form, setForm] = useState<CreateForm>(EMPTY_FORM);
  const [editPerms, setEditPerms] = useState<string[]>([]);
  const [editDept, setEditDept] = useState("");

  const { data, isLoading } = useListAdmins({}, {
    query: { queryKey: getListAdminsQueryKey() },
  });
  const createMut = useCreateAdmin();
  const updatePermsMut = useUpdateAdminPermissions();

  if (user?.role !== "super_admin") {
    return (
      <div className="flex items-center justify-center min-h-[60vh] text-muted-foreground">
        {t("adminAdmins.accessDenied")}
      </div>
    );
  }

  const invalidate = () => qc.invalidateQueries({ queryKey: getListAdminsQueryKey() });

  const togglePerm = (perm: string, arr: string[], setter: (a: string[]) => void) => {
    setter(arr.includes(perm) ? arr.filter((p) => p !== perm) : [...arr, perm]);
  };

  const handleCreate = () => {
    createMut.mutate(
      {
        data: {
          email: form.email,
          firstName: form.firstName,
          lastName: form.lastName,
          password: form.password,
          department: form.department || null,
          permissions: form.permissions,
        },
      },
      {
        onSuccess: () => {
          toast({ title: t("adminAdmins.toastCreated") });
          invalidate();
          setCreateOpen(false);
          setForm(EMPTY_FORM);
        },
        onError: (err: any) => toast({
          title: t("adminAdmins.toastCreateFailed"),
          description: err?.message,
          variant: "destructive",
        }),
      },
    );
  };

  const handleUpdatePerms = () => {
    if (!editTarget) return;
    updatePermsMut.mutate(
      {
        adminId: editTarget.id,
        data: { permissions: editPerms, department: editDept || null },
      },
      {
        onSuccess: () => {
          toast({ title: t("adminAdmins.toastUpdated") });
          invalidate();
          setEditTarget(null);
        },
        onError: () => toast({ title: t("adminAdmins.toastUpdateFailed"), variant: "destructive" }),
      },
    );
  };

  const admins = data?.data ?? [];

  return (
    <AdminLayout>
    <div className="p-6 lg:p-8 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-4 flex-wrap">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/admin/dashboard"><ArrowLeft className="h-4 w-4 mr-2" /> {t("dashboard.overview")}</Link>
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold flex items-center gap-2"><UserCog className="h-6 w-6" /> {t("adminAdmins.title")}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{t("adminAdmins.subtitle")}</p>
        </div>
        <Button onClick={() => { setForm(EMPTY_FORM); setCreateOpen(true); }}>
          <Plus className="h-4 w-4 mr-2" /> {t("adminAdmins.newAdmin")}
        </Button>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("adminAdmins.colName")}</TableHead>
              <TableHead>{t("adminAdmins.colEmail")}</TableHead>
              <TableHead>{t("adminAdmins.colRole")}</TableHead>
              <TableHead>{t("adminAdmins.colDepartment")}</TableHead>
              <TableHead>{t("adminAdmins.colPermissions")}</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <TableRow key={i}>{Array.from({ length: 6 }).map((__, j) => <TableCell key={j}><Skeleton className="h-4" /></TableCell>)}</TableRow>
              ))
            ) : admins.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center py-10 text-muted-foreground">{t("adminAdmins.noAdmins")}</TableCell></TableRow>
            ) : (
              admins.map((a) => (
                <TableRow key={a.id}>
                  <TableCell className="font-medium">{a.firstName} {a.lastName}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{a.email}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={
                      a.role === "super_admin"
                        ? "bg-violet-500/15 text-violet-400 border-violet-500/30"
                        : "bg-blue-500/15 text-blue-400 border-blue-500/30"
                    }>
                      {a.role.replace(/_/g, " ")}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm">{(a as any).department ?? "—"}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1 max-w-xs">
                      {((a as any).permissions as string[] ?? []).slice(0, 3).map((p) => (
                        <Badge key={p} variant="secondary" className="text-xs px-1.5">{p.replace(/_/g, " ")}</Badge>
                      ))}
                      {((a as any).permissions as string[] ?? []).length > 3 && (
                        <Badge variant="secondary" className="text-xs px-1.5">
                          {t("adminAdmins.morePermissions", { count: ((a as any).permissions as string[]).length - 3 })}
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    {a.role !== "super_admin" && (
                      <Button variant="ghost" size="sm" onClick={() => {
                        setEditTarget(a);
                        setEditPerms((a as any).permissions ?? []);
                        setEditDept((a as any).department ?? "");
                      }}>
                        <Shield className="h-3.5 w-3.5 mr-1" /> {t("adminAdmins.permissionsBtn")}
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("adminAdmins.createTitle")}</DialogTitle>
            <DialogDescription>
              {t("adminAdmins.createDesc")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">{t("adminAdmins.fieldFirstName")}</label>
                <Input value={form.firstName} onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">{t("adminAdmins.fieldLastName")}</label>
                <Input value={form.lastName} onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">{t("adminAdmins.fieldEmail")}</label>
              <Input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">{t("adminAdmins.fieldPassword")}</label>
              <Input type="password" value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">{t("adminAdmins.fieldDepartment")} <span className="text-muted-foreground">{t("adminAdmins.optional")}</span></label>
              <Input placeholder="e.g. Operations" value={form.department} onChange={(e) => setForm((f) => ({ ...f, department: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">{t("adminAdmins.fieldPermissions")}</label>
              <div className="space-y-3 max-h-52 overflow-y-auto pr-1">
                {PERMISSION_GROUPS.map((group) => (
                  <div key={group.label}>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">{group.label}</p>
                    <div className="grid grid-cols-2 gap-1">
                      {group.permissions.map((perm) => (
                        <label key={perm} className="flex items-center gap-2 cursor-pointer text-sm">
                          <input
                            type="checkbox"
                            checked={form.permissions.includes(perm)}
                            onChange={() => togglePerm(perm, form.permissions, (p) => setForm((f) => ({ ...f, permissions: p })))}
                            className="rounded"
                          />
                          {perm.replace(/_/g, " ")}
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>{t("adminAdmins.cancel")}</Button>
            <Button
              onClick={handleCreate}
              disabled={!form.email || !form.firstName || !form.lastName || !form.password || createMut.isPending}
            >
              {createMut.isPending ? t("adminAdmins.creating") : t("adminAdmins.createAdmin")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editTarget} onOpenChange={() => setEditTarget(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("adminAdmins.editPermissionsTitle", { name: `${editTarget?.firstName} ${editTarget?.lastName}` })}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">{t("adminAdmins.fieldDepartment")}</label>
              <Input value={editDept} onChange={(e) => setEditDept(e.target.value)} placeholder="e.g. Operations" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">{t("adminAdmins.fieldPermissions")}</label>
              <div className="space-y-3 max-h-52 overflow-y-auto pr-1">
                {PERMISSION_GROUPS.map((group) => (
                  <div key={group.label}>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">{group.label}</p>
                    <div className="grid grid-cols-2 gap-1">
                      {group.permissions.map((perm) => (
                        <label key={perm} className="flex items-center gap-2 cursor-pointer text-sm">
                          <input
                            type="checkbox"
                            checked={editPerms.includes(perm)}
                            onChange={() => togglePerm(perm, editPerms, setEditPerms)}
                            className="rounded"
                          />
                          {perm.replace(/_/g, " ")}
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditTarget(null)}>{t("adminAdmins.cancel")}</Button>
            <Button onClick={handleUpdatePerms} disabled={updatePermsMut.isPending}>
              {updatePermsMut.isPending ? t("adminAdmins.saving") : t("adminAdmins.savePermissions")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
    </AdminLayout>
  );
}
