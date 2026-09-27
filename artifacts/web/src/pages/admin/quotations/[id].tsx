import { useParams, Link } from "wouter";
import { useFormatters } from "@/hooks/use-formatters";
import { useGetQuotation } from "@workspace/api-client-react";
import { AdminLayout } from "@/components/admin-layout";
import { useAdminPermissions } from "@/hooks/use-admin-permissions";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  ArrowLeft,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  ExternalLink,
  MessageSquare,
  ShoppingBag,
  User,
  Car,
  DollarSign,
  CalendarDays,
  Hash,
  Lock,
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
    <Badge variant="outline" className={`gap-1.5 capitalize px-3 py-1 text-sm ${colorClass}`}>
      <Icon className="h-3.5 w-3.5" />
      {status}
    </Badge>
  );
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2">
      <span className="text-sm text-muted-foreground shrink-0 min-w-[140px]">{label}</span>
      <span className="text-sm font-medium text-right">{value ?? <span className="text-muted-foreground">—</span>}</span>
    </div>
  );
}

export default function AdminQuotationDetail() {
  const { id } = useParams<{ id: string }>();
  const { formatCurrency, formatDate } = useFormatters();
  const { user } = useAuth();
  const { can, isLoading: permLoading } = useAdminPermissions();
  const isSuperAdmin = user?.role === "super_admin";
  const hasPermission = isSuperAdmin || can("manage_quotations");
  const canViewCommission = isSuperAdmin || can("commission_management");

  const { data: q, isLoading } = useGetQuotation(id!, {
    query: { enabled: !!id && hasPermission && !permLoading },
  });

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
      <div className="p-6 space-y-6 max-w-4xl mx-auto">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/admin/quotations">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div className="flex-1">
            <h1 className="text-xl font-bold tracking-tight">Quotation Detail</h1>
            {!isLoading && q && (
              <p className="text-xs text-muted-foreground font-mono mt-0.5">{(q as any).quotationNumber ?? q.id}</p>
            )}
          </div>
          {!isLoading && q && <StatusBadge status={q.status} />}
        </div>

        {isLoading ? (
          <div className="space-y-4">
            {[1, 2, 3].map(i => (
              <Card key={i}>
                <CardContent className="pt-6 space-y-3">
                  {[1, 2, 3].map(j => <Skeleton key={j} className="h-4 w-full" />)}
                </CardContent>
              </Card>
            ))}
          </div>
        ) : !q ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              Quotation not found.
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <Hash className="h-4 w-4 text-muted-foreground" />
                    Quotation Info
                  </CardTitle>
                </CardHeader>
                <CardContent className="divide-y divide-border">
                  <DetailRow label="Quotation #" value={<span className="font-mono text-xs">{(q as any).quotationNumber ?? q.id}</span>} />
                  <DetailRow label="Status" value={<StatusBadge status={q.status} />} />
                  <DetailRow label="Quantity" value={q.quantity} />
                  <DetailRow label="Created" value={formatDate(q.createdAt)} />
                  <DetailRow label="Expires" value={formatDate(q.expiresAt)} />
                  {q.updatedAt && <DetailRow label="Last Updated" value={formatDate(q.updatedAt)} />}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <Car className="h-4 w-4 text-muted-foreground" />
                    Vehicle
                  </CardTitle>
                </CardHeader>
                <CardContent className="divide-y divide-border">
                  <DetailRow
                    label="Vehicle"
                    value={
                      <Button variant="link" size="sm" className="h-auto p-0 text-right" asChild>
                        <Link href={`/vehicles/${q.vehicleId}`}>
                          {q.vehicleTitle ?? q.vehicleId}
                          <ExternalLink className="ml-1 h-3 w-3 inline" />
                        </Link>
                      </Button>
                    }
                  />
                  <DetailRow label="Vehicle ID" value={<span className="font-mono text-xs">{q.vehicleId}</span>} />
                </CardContent>
              </Card>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <User className="h-4 w-4 text-muted-foreground" />
                    Participants
                  </CardTitle>
                </CardHeader>
                <CardContent className="divide-y divide-border">
                  <DetailRow label="Seller" value={q.sellerName ?? q.sellerId} />
                  <DetailRow label="Seller ID" value={<span className="font-mono text-xs">{q.sellerId}</span>} />
                  <Separator className="my-1" />
                  <DetailRow label="Buyer" value={q.buyerName ?? q.buyerId} />
                  <DetailRow label="Buyer ID" value={<span className="font-mono text-xs">{q.buyerId}</span>} />
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <DollarSign className="h-4 w-4 text-muted-foreground" />
                    Financials
                  </CardTitle>
                </CardHeader>
                <CardContent className="divide-y divide-border">
                  <DetailRow
                    label="Unit Price"
                    value={<span className="font-mono">{formatCurrency(q.unitPriceUsd)}</span>}
                  />
                  {q.shippingFeeUsd != null && (
                    <DetailRow
                      label="Shipping Fee"
                      value={<span className="font-mono">{formatCurrency(q.shippingFeeUsd)}</span>}
                    />
                  )}
                  {q.inspectionFeeUsd != null && (
                    <DetailRow
                      label="Inspection Fee"
                      value={<span className="font-mono">{formatCurrency(q.inspectionFeeUsd)}</span>}
                    />
                  )}
                  {q.otherFeesUsd != null && (
                    <DetailRow
                      label="Other Fees"
                      value={<span className="font-mono">{formatCurrency(q.otherFeesUsd)}</span>}
                    />
                  )}
                  <div className="flex items-start justify-between gap-4 py-2 border-t border-border mt-1">
                    <span className="text-sm font-semibold shrink-0">Total Amount</span>
                    <span className="text-base font-bold font-mono text-primary">
                      {q.totalAmountUsd != null ? formatCurrency(q.totalAmountUsd) : "—"}
                    </span>
                  </div>
                </CardContent>
              </Card>
            </div>

            {canViewCommission && (
              <Card className="border-emerald-500/20 bg-emerald-500/5">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2 text-emerald-700 dark:text-emerald-400">
                    <DollarSign className="h-4 w-4" />
                    Financial Summary
                  </CardTitle>
                </CardHeader>
                <CardContent className="divide-y divide-emerald-500/20">
                  <DetailRow
                    label="FOB Vehicle Price"
                    value={
                      <span className="font-mono">
                        {(q as any).fobTotalUsd != null ? formatCurrency((q as any).fobTotalUsd) : formatCurrency(q.totalAmountUsd)}
                      </span>
                    }
                  />
                  <DetailRow
                    label="Platform Commission"
                    value={
                      (q as any).commissionAmountUsd != null ? (
                        <span className="font-mono text-emerald-600">
                          {(q as any).commissionType === "percentage" && (q as any).commissionValue != null
                            ? `${Number((q as any).commissionValue).toFixed(2)}% (${formatCurrency((q as any).commissionAmountUsd)})`
                            : formatCurrency((q as any).commissionAmountUsd)}
                        </span>
                      ) : <span className="text-muted-foreground text-sm">No commission</span>
                    }
                  />
                  <div className="flex items-start justify-between gap-4 py-2">
                    <span className="text-sm font-bold shrink-0 min-w-[140px]">Final Marketplace Price</span>
                    <span className="text-base font-bold font-mono text-primary">
                      {q.totalAmountUsd != null ? formatCurrency(q.totalAmountUsd) : "—"}
                    </span>
                  </div>
                </CardContent>
              </Card>
            )}

            {q.notes && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold">Notes</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap">{q.notes}</p>
                </CardContent>
              </Card>
            )}

            <div className="flex flex-wrap gap-3">
              {q.conversationId && (
                <Button variant="outline" asChild>
                  <Link href={`/buyer/conversations/${q.conversationId}`}>
                    <MessageSquare className="h-4 w-4 mr-2" />
                    View Conversation
                  </Link>
                </Button>
              )}
              {q.status === "accepted" && q.orderId && (
                <Button variant="outline" asChild>
                  <Link href={`/orders/${q.orderId}`}>
                    <ShoppingBag className="h-4 w-4 mr-2" />
                    View Related Order
                  </Link>
                </Button>
              )}
              <Button variant="outline" asChild>
                <Link href={`/vehicles/${q.vehicleId}`}>
                  <Car className="h-4 w-4 mr-2" />
                  View Vehicle Listing
                </Link>
              </Button>
              {(isSuperAdmin || can("messages_management")) && (
                <Button variant="outline" asChild>
                  <Link href={`/admin/messages?referenceType=quotation&referenceId=${q.id}`}>
                    <MessageSquare className="h-4 w-4 mr-2" />
                    View Related Messages
                  </Link>
                </Button>
              )}
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
