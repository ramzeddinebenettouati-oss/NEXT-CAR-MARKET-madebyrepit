import { useTranslation } from "react-i18next";
import { useFormatters } from "@/hooks/use-formatters";
import { AdminLayout } from "@/components/admin-layout";
import { useGetAdminStats, getGetAdminStatsQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useAdminPermissions } from "@/hooks/use-admin-permissions";
import { ContainerOpen } from "@/components/icons/container-open";
import {
  Users, CarFront, ShoppingCart, DollarSign, Clock, CreditCard, Container, TrendingUp,
  AlertTriangle, Anchor, PercentCircle, Banknote, Settings2, MapPin, CheckCircle2,
} from "lucide-react";
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";

const PIE_COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#14b8a6"];

function StatCard({
  label, value, icon: Icon, color = "text-foreground", sub,
}: {
  label: string; value: string | number; icon: React.ComponentType<{ className?: string }>;
  color?: string; sub?: React.ReactNode;
}) {
  return (
    <Card className="border-border">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground flex items-center justify-between">
          {label}
          <Icon className={`h-4 w-4 ${color}`} />
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className={`text-3xl font-display font-bold ${color}`}>{value}</div>
        {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
      </CardContent>
    </Card>
  );
}

export default function AdminDashboard() {
  const { t } = useTranslation();
  const { formatCurrency } = useFormatters();
  const { user } = useAuth();
  const { can } = useAdminPermissions();
  const { data: stats, isLoading } = useGetAdminStats({
    query: { queryKey: getGetAdminStatsQueryKey() },
  });

  const isAdmin = user?.role === "admin" || user?.role === "super_admin";
  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] text-muted-foreground">
        {t("adminDashboard.accessDenied")}
      </div>
    );
  }

  return (
    <AdminLayout>
    <div className="p-6 lg:p-8 max-w-7xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{t("adminDashboard.platformOverview")}</h1>
        <p className="text-muted-foreground mt-1">{t("adminDashboard.realTimeAnalytics")}</p>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 10 }).map((_, i) => <Skeleton key={i} className="h-28" />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <StatCard label={t("adminDashboard.totalUsers")} value={stats?.totalUsers ?? 0} icon={Users} />
          <StatCard label={t("adminDashboard.totalListings")} value={stats?.totalVehicles ?? 0} icon={CarFront} />
          <StatCard label={t("adminDashboard.totalOrders")} value={stats?.totalOrders ?? 0} icon={ShoppingCart} />
          <StatCard
            label={t("adminDashboard.platformRevenue")}
            value={formatCurrency(stats?.totalRevenue ?? 0)}
            icon={DollarSign}
            color="text-emerald-500"
          />
          <StatCard
            label={t("adminDashboard.pendingModeration")}
            value={stats?.pendingModeration ?? 0}
            icon={Clock}
            color={stats?.pendingModeration ? "text-amber-500" : "text-muted-foreground"}
            sub={
              stats?.pendingModeration
                ? <span><Link href="/admin/moderation" className="underline text-amber-500">{t("adminDashboard.reviewNow")}</Link></span> as any
                : undefined
            }
          />
          <StatCard
            label={t("adminDashboard.pendingPayments")}
            value={stats?.pendingPayments ?? 0}
            icon={CreditCard}
            color={stats?.pendingPayments ? "text-amber-500" : "text-muted-foreground"}
          />
          <StatCard label={t("adminDashboard.activeShipments")} value={stats?.activeShipments ?? 0} icon={Container} color="text-blue-500" />
          <StatCard
            label={t("adminDashboard.commissionRevenue")}
            value={formatCurrency(stats?.commissionRevenue ?? 0)}
            icon={TrendingUp}
            color="text-violet-500"
          />
          <StatCard
            label="Total Commission Earned"
            value={formatCurrency(stats?.commissionTotal ?? 0)}
            icon={Banknote}
            color="text-emerald-500"
            sub="From order commission snapshots"
          />
          <StatCard
            label={t("adminDashboard.shippingRevenue")}
            value={formatCurrency(stats?.shippingRevenue ?? 0)}
            icon={Anchor}
            color="text-cyan-500"
            sub={t("adminDashboard.shippingRevenueNote")}
          />
          <StatCard
            label={t("adminDashboard.buyerConversion")}
            value={`${Number(stats?.conversionRate ?? 0).toFixed(1)}%`}
            icon={PercentCircle}
            color="text-pink-500"
            sub={t("adminDashboard.buyerConversionNote")}
          />
        </div>
      )}

      {/* Order Pipeline Stats */}
      {(isLoading || (stats?.ordersByStatus && stats.ordersByStatus.length > 0)) && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Container className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-display font-semibold text-muted-foreground uppercase tracking-wide">Order Pipeline</h2>
          </div>
          {isLoading ? (
            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-3">
              {Array.from({ length: 7 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
            </div>
          ) : (() => {
            const getCount = (status: string) =>
              stats?.ordersByStatus?.find((s) => s.status === status)?.count ?? 0;
            return (
              <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-3">
                <StatCard label="Awaiting Payment" value={getCount("awaiting_payment")} icon={CreditCard} color="text-amber-500" />
                <StatCard label="Payment Received" value={getCount("payment_received")} icon={Banknote} color="text-emerald-500" />
                <StatCard label="In Preparation" value={getCount("documents_preparation")} icon={Settings2} color="text-blue-500" />
                <StatCard label="Ready to Ship" value={getCount("ready_to_ship")} icon={ContainerOpen} color="text-violet-500" />
                <StatCard label="Shipped" value={getCount("shipped")} icon={Container} color="text-indigo-500" />
                <StatCard label="Arrived" value={getCount("arrived")} icon={MapPin} color="text-cyan-500" />
                <StatCard label="Delivered" value={getCount("delivered")} icon={CheckCircle2} color="text-green-600" />
              </div>
            );
          })()}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 border-border">
          <CardHeader>
            <CardTitle className="text-base">{t("adminDashboard.revenueByMonth")}</CardTitle>
            <CardDescription>{t("adminDashboard.revenueByMonthDesc")}</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-56" /> : (
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={stats?.revenueByMonth ?? []} margin={{ top: 4, right: 20, bottom: 4, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis yAxisId="left" tick={{ fontSize: 11 }} />
                  <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} />
                  <Tooltip
                    contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }}
                    labelStyle={{ color: "hsl(var(--foreground))" }}
                  />
                  <Legend />
                  <Line yAxisId="left" type="monotone" dataKey="revenue" stroke="#10b981" strokeWidth={2} name="Revenue ($)" dot={false} />
                  <Line yAxisId="right" type="monotone" dataKey="orders" stroke="#3b82f6" strokeWidth={2} name="Orders" dot={false} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card className="border-border">
          <CardHeader>
            <CardTitle className="text-base">{t("adminDashboard.ordersByStatus")}</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-56" /> : (
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={stats?.ordersByStatus ?? []}
                    dataKey="count"
                    nameKey="status"
                    cx="50%" cy="50%"
                    outerRadius={80}
                    label={({ status, count }) => `${status?.replace(/_/g, " ")}: ${count}`}
                    labelLine={false}
                  >
                    {(stats?.ordersByStatus ?? []).map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="border-border">
          <CardHeader>
            <CardTitle className="text-base">{t("adminDashboard.topBrands")}</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-48" /> : (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={stats?.topBrands ?? []} layout="vertical" margin={{ left: 60, right: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis type="number" tick={{ fontSize: 11 }} />
                  <YAxis dataKey="brand" type="category" tick={{ fontSize: 11 }} width={60} />
                  <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                  <Bar dataKey="count" fill="#3b82f6" radius={[0, 4, 4, 0]} name="Listings" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card className="border-border">
          <CardHeader>
            <CardTitle className="text-base">{t("adminDashboard.topCountries")}</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-48" /> : (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={stats?.topCountries ?? []} layout="vertical" margin={{ left: 80, right: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis type="number" tick={{ fontSize: 11 }} />
                  <YAxis dataKey="country" type="category" tick={{ fontSize: 11 }} width={80} />
                  <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                  <Bar dataKey="count" fill="#8b5cf6" radius={[0, 4, 4, 0]} name="Orders" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {!isLoading && stats?.usersByRole && stats.usersByRole.length > 0 && (
        <Card className="border-border">
          <CardHeader>
            <CardTitle className="text-base">{t("adminDashboard.usersByRole")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-4">
              {stats.usersByRole.map((item, i) => (
                <div key={item.role} className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                  <span className="text-sm capitalize">{item.role.replace(/_/g, " ")}</span>
                  <span className="font-bold text-sm">{item.count}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { href: "/admin/moderation", label: t("adminDashboard.moderationQueue"), icon: Clock,  count: stats?.pendingModeration, permission: "manage_listings" },
          { href: "/admin/payments",   label: t("adminDashboard.manageUsers"),     icon: CreditCard, count: stats?.pendingPayments, permission: "manage_payments" },
          { href: "/admin/orders",     label: "Manage Orders",                     icon: Container, count: stats?.totalOrders, permission: "order_management" },
          { href: "/admin/users",      label: t("adminDashboard.manageUsers"),     icon: Users,  permission: "manage_users" },
          { href: "/admin/audit-logs", label: t("adminDashboard.auditLogs"),       icon: AlertTriangle, permission: "view_audit_logs" },
        ].filter(({ permission }) => can(permission)).map(({ href, label, icon: Icon, count }) => (
          <Link key={href} href={href}>
            <Card className="border-border hover:bg-muted/40 transition-colors cursor-pointer">
              <CardContent className="p-4 flex items-center gap-3">
                <Icon className="h-5 w-5 text-muted-foreground shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{label}</p>
                  {count !== undefined && (
                    <p className="text-xs text-muted-foreground">{t("adminDashboard.pendingCount", { count })}</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
    </AdminLayout>
  );
}
