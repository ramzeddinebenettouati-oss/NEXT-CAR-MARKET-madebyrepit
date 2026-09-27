import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useFormatters } from "@/hooks/use-formatters";
import { AdminLayout } from "@/components/admin-layout";
import {
  useListUsers,
  getListUsersQueryKey,
  useSuspendUser,
} from "@workspace/api-client-react";
import { useAuth } from "@/hooks/use-auth";
import { useAdminPermissions } from "@/hooks/use-admin-permissions";
import { useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Search, Users, UserX, UserCheck, Trash2, Plus, Loader2, Phone, Mail, MessageCircle } from "lucide-react";
import { Link } from "wouter";
import { customFetch } from "@workspace/api-client-react";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

const ROLE_COLORS: Record<string, string> = {
  super_admin: "bg-violet-500/15 text-violet-400 border-violet-500/30",
  admin: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  seller: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  buyer: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  freight_forwarder: "bg-cyan-500/15 text-cyan-400 border-cyan-500/30",
};

const METHOD_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  email: {
    label: "Email",
    color: "bg-primary/10 text-primary border-primary/30",
    icon: <Mail className="h-3 w-3" />,
  },
  phone: {
    label: "Phone",
    color: "bg-green-500/15 text-green-400 border-green-500/30",
    icon: <Phone className="h-3 w-3" />,
  },
  google: {
    label: "Gmail",
    color: "bg-red-500/15 text-red-400 border-red-500/30",
    icon: (
      <svg className="h-3 w-3" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
      </svg>
    ),
  },
  wechat: {
    label: "WeChat",
    color: "bg-[#07C160]/15 text-[#07C160] border-[#07C160]/30",
    icon: <MessageCircle className="h-3 w-3" />,
  },
};

function SignupMethodBadge({ method }: { method?: string | null }) {
  const cfg = METHOD_CONFIG[method ?? "email"] ?? METHOD_CONFIG.email;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border ${cfg.color}`}>
      {cfg.icon}
      {cfg.label}
    </span>
  );
}

type ConfirmAction = { type: "suspend" | "activate" | "delete"; userId: string; userName: string };

export default function AdminUsers() {
  const { t } = useTranslation();
  const { formatDate } = useFormatters();
  const { user } = useAuth();
  const { can } = useAdminPermissions();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [methodFilter, setMethodFilter] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);

  type RoleFilterType = "all" | "super_admin" | "admin" | "seller" | "buyer" | "freight_forwarder";
  const typedRole = roleFilter as RoleFilterType;

  const params = {
    page,
    limit: 20,
    ...(search ? { search } : {}),
    ...(typedRole !== "all" ? { role: typedRole as import("@workspace/api-client-react").ListUsersRole } : {}),
  };

  const { data, isLoading } = useListUsers(params, {
    query: { queryKey: getListUsersQueryKey(params) },
  });

  const suspendMutation = useSuspendUser({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListUsersQueryKey(params) });
        toast({ title: confirmAction?.type === "activate" ? t("adminUsers.toastActivated") : t("adminUsers.toastSuspended") });
        setConfirmAction(null);
      },
      onError: () => {
        toast({ title: t("adminUsers.toastActionFailed"), variant: "destructive" });
        setConfirmAction(null);
      },
    },
  });

  const [deletingId, setDeletingId] = useState<string | null>(null);

  const isSuperAdmin = user?.role === "super_admin";
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState({ email: "", firstName: "", lastName: "", password: "", role: "freight_forwarder" });
  const [creating, setCreating] = useState(false);

  async function handleCreateUser() {
    if (!createForm.email || !createForm.firstName || !createForm.lastName || !createForm.password) {
      toast({ title: "All fields are required.", variant: "destructive" });
      return;
    }
    if (createForm.password.length < 8) {
      toast({ title: "Password must be at least 8 characters.", variant: "destructive" });
      return;
    }
    setCreating(true);
    try {
      await customFetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(createForm),
      });
      toast({ title: `${createForm.role.replace(/_/g, " ")} account created successfully.` });
      queryClient.invalidateQueries({ queryKey: getListUsersQueryKey(params) });
      setCreateOpen(false);
      setCreateForm({ email: "", firstName: "", lastName: "", password: "", role: "freight_forwarder" });
    } catch (e: any) {
      toast({ title: e?.message ?? "Failed to create user.", variant: "destructive" });
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(userId: string) {
    setDeletingId(userId);
    try {
      await customFetch(`/api/admin/users/${userId}`, { method: "DELETE" });
      queryClient.invalidateQueries({ queryKey: getListUsersQueryKey(params) });
      toast({ title: t("adminUsers.toastDeleted") });
    } catch {
      toast({ title: t("adminUsers.toastDeleteFailed"), variant: "destructive" });
    } finally {
      setDeletingId(null);
      setConfirmAction(null);
    }
  }

  function confirmAndExecute() {
    if (!confirmAction) return;
    if (confirmAction.type === "delete") {
      handleDelete(confirmAction.userId);
    } else {
      suspendMutation.mutate({
        userId: confirmAction.userId,
        data: { isActive: confirmAction.type === "activate" },
      });
    }
  }

  const canManage = can("manage_users");
  const isAdmin = user?.role === "admin" || user?.role === "super_admin";
  if (!isAdmin) return <div className="flex items-center justify-center min-h-[60vh] text-muted-foreground">{t("adminUsers.accessDenied")}</div>;

  // Client-side filter by signup method (API doesn't support it as a param)
  const allUsers = data?.data ?? [];
  const users = methodFilter === "all"
    ? allUsers
    : allUsers.filter((u) => (u as any).signupMethod === methodFilter);

  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / 20);

  // Summary counts per method
  const methodCounts = allUsers.reduce<Record<string, number>>((acc, u) => {
    const m = (u as any).signupMethod ?? "email";
    acc[m] = (acc[m] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <AdminLayout>
      <div className="p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
        <div className="flex items-center gap-4 flex-wrap">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/admin/dashboard"><ArrowLeft className="h-4 w-4 mr-2" /> {t("dashboard.overview")}</Link>
          </Button>
          <div className="flex-1">
            <h1 className="text-2xl font-bold flex items-center gap-2"><Users className="h-6 w-6" /> {t("adminUsers.title")}</h1>
            <p className="text-sm text-muted-foreground mt-0.5">{t("adminUsers.subtitle")}</p>
          </div>
          {isSuperAdmin && (
            <Button size="sm" className="gap-2" onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" /> Create User
            </Button>
          )}
        </div>

        {/* Signup method summary cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {(["email", "phone", "google", "wechat"] as const).map((m) => {
            const cfg = METHOD_CONFIG[m];
            const cnt = methodCounts[m] ?? 0;
            return (
              <button
                key={m}
                onClick={() => { setMethodFilter(methodFilter === m ? "all" : m); setPage(1); }}
                className={`flex items-center gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-muted ${
                  methodFilter === m ? "ring-2 ring-primary bg-primary/5" : "bg-card"
                }`}
              >
                <span className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-sm ${cfg.color}`}>
                  {cfg.icon}
                </span>
                <div>
                  <p className="text-xs text-muted-foreground">{cfg.label}</p>
                  <p className="text-lg font-bold leading-none">{isLoading ? "—" : cnt}</p>
                </div>
              </button>
            );
          })}
        </div>

        <div className="flex gap-3 flex-wrap">
          <div className="relative flex-1 min-w-48">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={t("adminUsers.searchPlaceholder")}
              className="pl-9"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            />
          </div>
          <Select value={roleFilter} onValueChange={(v) => { setRoleFilter(v); setPage(1); }}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder={t("adminUsers.allRoles")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("adminUsers.allRoles")}</SelectItem>
              <SelectItem value="super_admin">{t("adminUsers.superAdmin")}</SelectItem>
              <SelectItem value="admin">{t("adminUsers.admin")}</SelectItem>
              <SelectItem value="seller">{t("adminUsers.seller")}</SelectItem>
              <SelectItem value="buyer">{t("adminUsers.buyer")}</SelectItem>
              <SelectItem value="freight_forwarder">{t("adminUsers.freightForwarder")}</SelectItem>
            </SelectContent>
          </Select>
          <Select value={methodFilter} onValueChange={(v) => { setMethodFilter(v); setPage(1); }}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="All methods" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All methods</SelectItem>
              <SelectItem value="email">Email</SelectItem>
              <SelectItem value="phone">Phone</SelectItem>
              <SelectItem value="google">Gmail</SelectItem>
              <SelectItem value="wechat">WeChat</SelectItem>
            </SelectContent>
          </Select>
          {data && (
            <span className="self-center text-sm text-muted-foreground">
              {t("adminUsers.usersCount", { count: total })}
              {methodFilter !== "all" && ` · ${users.length} shown`}
            </span>
          )}
        </div>

        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("adminUsers.colName")}</TableHead>
                <TableHead>{t("adminUsers.colEmail")}</TableHead>
                <TableHead>{t("adminUsers.colRole")}</TableHead>
                <TableHead>Signed up via</TableHead>
                <TableHead>{t("adminUsers.colCountry")}</TableHead>
                <TableHead>{t("adminUsers.colStatus")}</TableHead>
                <TableHead>{t("adminUsers.colJoined")}</TableHead>
                {canManage && <TableHead className="text-right">{t("adminUsers.colActions")}</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: canManage ? 8 : 7 }).map((__, j) => (
                      <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                    ))}
                  </TableRow>
                ))
              ) : users.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={canManage ? 8 : 7} className="text-center py-10 text-muted-foreground">
                    {t("adminUsers.noUsersFound")}
                  </TableCell>
                </TableRow>
              ) : (
                users.map((u) => (
                  <TableRow key={u.id} className={!u.isActive ? "opacity-50" : ""}>
                    <TableCell className="font-medium">
                      {u.firstName} {u.lastName}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{u.email}</TableCell>
                    <TableCell>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${ROLE_COLORS[u.role] ?? ""}`}>
                        {u.role.replace(/_/g, " ")}
                      </span>
                    </TableCell>
                    <TableCell>
                      <SignupMethodBadge method={(u as any).signupMethod} />
                    </TableCell>
                    <TableCell className="text-sm">{u.country ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant={u.isActive ? "default" : "secondary"} className="text-xs">
                        {u.isActive ? t("adminUsers.statusActive") : t("adminUsers.statusSuspended")}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {u.createdAt ? formatDate(u.createdAt) : "—"}
                    </TableCell>
                    {canManage && (
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          {u.role !== "super_admin" && (
                            <>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                title={u.isActive ? t("adminUsers.titleSuspend") : t("adminUsers.titleActivate")}
                                onClick={() => setConfirmAction({
                                  type: u.isActive ? "suspend" : "activate",
                                  userId: u.id,
                                  userName: `${u.firstName} ${u.lastName}`,
                                })}
                              >
                                {u.isActive
                                  ? <UserX className="h-3.5 w-3.5 text-amber-400" />
                                  : <UserCheck className="h-3.5 w-3.5 text-emerald-400" />}
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                title={t("adminUsers.titleDelete")}
                                disabled={deletingId === u.id}
                                onClick={() => setConfirmAction({ type: "delete", userId: u.id, userName: `${u.firstName} ${u.lastName}` })}
                              >
                                <Trash2 className="h-3.5 w-3.5 text-destructive" />
                              </Button>
                            </>
                          )}
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </Card>

        {totalPages > 1 && (
          <div className="flex items-center justify-between">
            <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
              {t("adminUsers.previous")}
            </Button>
            <span className="text-sm text-muted-foreground">{t("adminUsers.pageOf", { page, total: totalPages })}</span>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
              {t("adminUsers.next")}
            </Button>
          </div>
        )}
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create User Account</DialogTitle>
            <DialogDescription>Create a new Forwarder, Buyer, or Seller account. The user can log in immediately.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>First Name</Label>
                <Input value={createForm.firstName} onChange={e => setCreateForm(f => ({ ...f, firstName: e.target.value }))} placeholder="First" />
              </div>
              <div className="space-y-1.5">
                <Label>Last Name</Label>
                <Input value={createForm.lastName} onChange={e => setCreateForm(f => ({ ...f, lastName: e.target.value }))} placeholder="Last" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input type="email" value={createForm.email} onChange={e => setCreateForm(f => ({ ...f, email: e.target.value }))} placeholder="user@example.com" />
            </div>
            <div className="space-y-1.5">
              <Label>Password</Label>
              <Input type="password" value={createForm.password} onChange={e => setCreateForm(f => ({ ...f, password: e.target.value }))} placeholder="Min. 8 characters" />
            </div>
            <div className="space-y-1.5">
              <Label>Role</Label>
              <Select value={createForm.role} onValueChange={v => setCreateForm(f => ({ ...f, role: v }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="freight_forwarder">Freight Forwarder</SelectItem>
                  <SelectItem value="seller">Seller</SelectItem>
                  <SelectItem value="buyer">Buyer</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={creating}>Cancel</Button>
            <Button onClick={handleCreateUser} disabled={creating} className="gap-2">
              {creating && <Loader2 className="h-4 w-4 animate-spin" />}
              Create Account
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!confirmAction} onOpenChange={(open) => { if (!open) setConfirmAction(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmAction?.type === "delete" && t("adminUsers.confirmDeleteTitle")}
              {confirmAction?.type === "suspend" && t("adminUsers.confirmSuspendTitle")}
              {confirmAction?.type === "activate" && t("adminUsers.confirmActivateTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmAction?.type === "delete" && t("adminUsers.confirmDeleteDesc", { name: confirmAction.userName })}
              {confirmAction?.type === "suspend" && t("adminUsers.confirmSuspendDesc", { name: confirmAction?.userName })}
              {confirmAction?.type === "activate" && t("adminUsers.confirmActivateDesc", { name: confirmAction?.userName })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmAndExecute}
              className={confirmAction?.type === "delete" ? "bg-destructive hover:bg-destructive/90" : ""}
            >
              {confirmAction?.type === "delete" ? t("adminUsers.actionDelete") : confirmAction?.type === "suspend" ? t("adminUsers.actionSuspend") : t("adminUsers.actionActivate")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AdminLayout>
  );
}
