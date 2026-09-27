import { Link } from "wouter";
import { useFormatters } from "@/hooks/use-formatters";
import { useGetBuyerDashboard, getGetBuyerDashboardQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Heart, MessageCircle, Bell, Car, ChevronRight, Container } from "lucide-react";

function StatCard({
  icon: Icon,
  label,
  value,
  href,
  color = "text-primary",
}: {
  icon: React.ElementType;
  label: string;
  value: number;
  href: string;
  color?: string;
}) {
  return (
    <Link href={href}>
      <Card className="bg-card border-border hover:border-primary/50 transition-colors cursor-pointer">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground flex items-center justify-between">
            {label}
            <Icon className={`h-4 w-4 ${color}`} />
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className={`text-3xl font-display font-bold ${color}`}>{value}</div>
        </CardContent>
      </Card>
    </Link>
  );
}

export default function BuyerDashboard() {
  const { formatCurrency } = useFormatters();
  const { data, isLoading } = useGetBuyerDashboard({
    query: { queryKey: getGetBuyerDashboardQueryKey() },
  });

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Buyer Dashboard</h1>
          <p className="text-muted-foreground">Track your saved vehicles, inquiries, and messages.</p>
        </div>
        <Button asChild>
          <Link href="/vehicles">Browse Vehicles</Link>
        </Button>
      </div>

      {/* Stat Cards */}
      {isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-28" />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard icon={Heart} label="Saved Vehicles" value={data?.favoritesCount ?? 0} href="/buyer/favorites" color="text-rose-500" />
          <StatCard icon={MessageCircle} label="Conversations" value={data?.activeConversations ?? 0} href="/buyer/conversations" color="text-blue-500" />
          <StatCard icon={MessageCircle} label="Unread Messages" value={data?.unreadMessages ?? 0} href="/buyer/conversations" color="text-amber-500" />
          <StatCard icon={Bell} label="Notifications" value={data?.unreadNotifications ?? 0} href="/buyer/notifications" color="text-purple-500" />
        </div>
      )}

      {/* Recent Favorites */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-display font-semibold">Recently Saved</h2>
          <Button variant="ghost" size="sm" asChild>
            <Link href="/buyer/favorites">View all <ChevronRight className="h-4 w-4 ml-1" /></Link>
          </Button>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-40" />)}
          </div>
        ) : data?.recentFavorites && data.recentFavorites.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {data.recentFavorites.map((v: any) => (
              <Link key={v.id} href={`/vehicles/${v.id}`}>
                <Card className="bg-card border-border hover:border-primary/50 transition-colors cursor-pointer overflow-hidden">
                  <div className="aspect-[16/9] bg-muted relative overflow-hidden">
                    {v.primaryImageUrl ? (
                      <img src={v.primaryImageUrl} alt={`${v.brandName} ${v.modelName}`} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Car className="h-10 w-10 text-muted-foreground/40" />
                      </div>
                    )}
                  </div>
                  <CardContent className="p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-semibold text-sm leading-tight">{v.brandName} {v.modelName}</p>
                        <p className="text-xs text-muted-foreground">{v.year} · {v.fuelType}</p>
                      </div>
                      <p className="text-sm font-bold text-primary whitespace-nowrap">{formatCurrency(v.fobPriceUsd)}</p>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        ) : (
          <Card className="bg-card border-border border-dashed">
            <CardContent className="py-10 text-center text-muted-foreground">
              <Heart className="h-8 w-8 mx-auto mb-3 opacity-30" />
              <p>No saved vehicles yet.</p>
              <Button variant="link" asChild className="mt-2">
                <Link href="/vehicles">Browse vehicles →</Link>
              </Button>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Recent Conversations */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-display font-semibold">Recent Conversations</h2>
          <Button variant="ghost" size="sm" asChild>
            <Link href="/buyer/conversations">View all <ChevronRight className="h-4 w-4 ml-1" /></Link>
          </Button>
        </div>

        {isLoading ? (
          <div className="space-y-2">
            {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-16" />)}
          </div>
        ) : data?.recentConversations && data.recentConversations.length > 0 ? (
          <Card className="bg-card border-border divide-y divide-border">
            {data.recentConversations.map((c: any) => (
              <Link key={c.id} href={`/buyer/conversations/${c.id}`}>
                <div className="flex items-center gap-4 p-4 hover:bg-muted/40 transition-colors cursor-pointer">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{c.vehicleTitle ?? "Vehicle inquiry"}</p>
                    <p className="text-xs text-muted-foreground truncate">{c.lastMessagePreview ?? "No messages yet"}</p>
                  </div>
                  {c.unreadCount > 0 && (
                    <Badge variant="default" className="shrink-0 bg-primary">{c.unreadCount}</Badge>
                  )}
                  <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                </div>
              </Link>
            ))}
          </Card>
        ) : (
          <Card className="bg-card border-border border-dashed">
            <CardContent className="py-10 text-center text-muted-foreground">
              <MessageCircle className="h-8 w-8 mx-auto mb-3 opacity-30" />
              <p>No conversations yet.</p>
              <Button variant="link" asChild className="mt-2">
                <Link href="/vehicles">Find a vehicle to inquire about →</Link>
              </Button>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Recent Orders */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-display font-semibold">Recent Orders</h2>
        </div>
        <Card className="bg-card border-border border-dashed">
          <CardContent className="py-10 text-center text-muted-foreground">
            <Container className="h-8 w-8 mx-auto mb-3 opacity-30" />
            <p className="font-medium mb-1">No orders yet</p>
            <p className="text-sm">Once you confirm a vehicle purchase, your orders will appear here.</p>
            <Button variant="link" asChild className="mt-2">
              <Link href="/vehicles">Start browsing →</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
