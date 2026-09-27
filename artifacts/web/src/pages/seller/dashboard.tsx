import { useGetSellerDashboard, getGetSellerDashboardQueryKey } from "@workspace/api-client-react";
import { useFormatters } from "@/hooks/use-formatters";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CarFront, Eye, FileText, CheckCircle2, AlertCircle, Clock, Plus } from "lucide-react";

export default function SellerDashboard() {
  const { formatCurrency } = useFormatters();
  const { data: dashboard, isLoading } = useGetSellerDashboard({
    query: { queryKey: getGetSellerDashboardQueryKey() }
  });

  if (isLoading) return <div className="p-8">Loading dashboard...</div>;

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto space-y-8">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Seller Dashboard</h1>
          <p className="text-muted-foreground">Manage your export inventory and performance.</p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" asChild><Link href="/seller/listings">View All Inventory</Link></Button>
          <Button asChild><Link href="/seller/listings/new"><Plus className="h-4 w-4 mr-2" /> New Listing</Link></Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-card shadow-sm border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center justify-between">
              Total Listings
              <FileText className="h-4 w-4 text-muted-foreground" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-display font-bold">{dashboard?.totalListings || 0}</div>
          </CardContent>
        </Card>
        
        <Card className="bg-card shadow-sm border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center justify-between">
              Active Published
              <CheckCircle2 className="h-4 w-4 text-green-500" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-display font-bold text-green-500">{dashboard?.publishedCount || 0}</div>
          </CardContent>
        </Card>

        <Card className="bg-card shadow-sm border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center justify-between">
              Pending Review
              <Clock className="h-4 w-4 text-amber-500" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-display font-bold text-amber-500">{dashboard?.pendingCount || 0}</div>
          </CardContent>
        </Card>

        <Card className="bg-card shadow-sm border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center justify-between">
              Total Views
              <Eye className="h-4 w-4 text-primary" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-display font-bold">{dashboard?.totalViews || 0}</div>
          </CardContent>
        </Card>
      </div>

      <div>
        <h2 className="text-xl font-display font-bold mb-4">Recent Listings</h2>
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Vehicle</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Price</TableHead>
                <TableHead>Views</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {dashboard?.recentListings && dashboard.recentListings.length > 0 ? (
                dashboard.recentListings.map((listing) => (
                  <TableRow key={listing.id}>
                    <TableCell className="font-medium">
                      {listing.brandName} {listing.modelName} ({listing.year})
                    </TableCell>
                    <TableCell>
                      <Badge variant={
                        listing.status === 'published' ? 'default' : 
                        listing.status === 'pending_review' ? 'secondary' : 
                        listing.status === 'rejected' ? 'destructive' : 'outline'
                      } className={listing.status === 'published' ? 'bg-green-500 hover:bg-green-600' : ''}>
                        {listing.status.replace('_', ' ')}
                      </Badge>
                    </TableCell>
                    <TableCell>{formatCurrency(listing.fobPriceUsd)}</TableCell>
                    <TableCell>{listing.viewCount || 0}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" asChild>
                        <Link href={`/seller/listings/${listing.id}/edit`}>Edit</Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                    No recent listings found. Create your first vehicle listing.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </Card>
      </div>
    </div>
  );
}
