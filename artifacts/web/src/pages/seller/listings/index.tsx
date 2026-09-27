import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useFormatters } from "@/hooks/use-formatters";
import { Link } from "wouter";
import { useListSellerListings, getListSellerListingsQueryKey } from "@workspace/api-client-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus } from "lucide-react";

export default function SellerListings() {
  const { t } = useTranslation();
  const { formatCurrency } = useFormatters();
  const [status, setStatus] = useState<string>("all");

  const { data, isLoading } = useListSellerListings(
    { status: status !== "all" ? status as any : undefined },
    { query: { queryKey: getListSellerListingsQueryKey({ status: status !== "all" ? status as any : undefined }) } }
  );

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto space-y-8">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t("sellerListings.title")}</h1>
          <p className="text-muted-foreground">{t("sellerListings.subtitle")}</p>
        </div>
        <Button asChild><Link href="/seller/listings/new"><Plus className="h-4 w-4 mr-2" /> {t("sellerListings.newListing")}</Link></Button>
      </div>

      <div className="flex items-center gap-4 mb-4">
        <div className="w-64">
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger>
              <SelectValue placeholder={t("sellerListings.filterPlaceholder")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("sellerListings.allStatuses")}</SelectItem>
              <SelectItem value="draft">{t("sellerListings.draft")}</SelectItem>
              <SelectItem value="pending_review">{t("sellerListings.pendingReview")}</SelectItem>
              <SelectItem value="published">{t("sellerListings.published")}</SelectItem>
              <SelectItem value="rejected">{t("sellerListings.rejected")}</SelectItem>
              <SelectItem value="archived">{t("sellerListings.archived")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="border border-border rounded-md bg-card shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("sellerListings.colVehicle")}</TableHead>
              <TableHead>{t("sellerListings.colStatus")}</TableHead>
              <TableHead>{t("sellerListings.colPrice")}</TableHead>
              <TableHead>Platform Commission</TableHead>
              <TableHead>{t("sellerListings.colQty")}</TableHead>
              <TableHead>{t("sellerListings.colViews")}</TableHead>
              <TableHead className="text-right">{t("sellerListings.colActions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8">{t("sellerListings.loading")}</TableCell>
              </TableRow>
            ) : data?.data && data.data.length > 0 ? (
              data.data.map((listing) => {
                const ct = (listing as any).commissionType as string | null;
                const cv = (listing as any).commissionValue as number | null;
                const ca = (listing as any).commissionAmountUsd as number | null;
                return (
                <TableRow key={listing.id}>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-3">
                      {listing.primaryImageUrl ? (
                        <img src={listing.primaryImageUrl} alt="" className="w-10 h-10 rounded object-cover" />
                      ) : (
                        <div className="w-10 h-10 rounded bg-muted flex items-center justify-center text-xs">{t("sellerListings.noImg")}</div>
                      )}
                      <div>
                        {listing.brandName} {listing.modelName} <span className="text-muted-foreground font-normal">({listing.year})</span>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={
                      listing.status === 'published' ? 'border-green-500 text-green-500' : 
                      listing.status === 'pending_review' ? 'border-amber-500 text-amber-500' : 
                      listing.status === 'rejected' ? 'border-red-500 text-red-500' : 'text-muted-foreground'
                    }>
                      {listing.status.replace('_', ' ')}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-mono">{formatCurrency(listing.fobPriceUsd)}</TableCell>
                  <TableCell>
                    {ct === 'percentage' && cv != null ? (
                      <span className="font-medium text-amber-600">{cv.toFixed(2)}%</span>
                    ) : ct && ca != null ? (
                      <span className="font-medium text-amber-600">{formatCurrency(ca)}</span>
                    ) : (
                      <span className="text-muted-foreground text-sm">—</span>
                    )}
                  </TableCell>
                  <TableCell>{listing.quantity || 1}</TableCell>
                  <TableCell>{listing.viewCount || 0}</TableCell>
                  <TableCell className="text-right">
                    <Button asChild size="sm" variant="secondary">
                      <Link href={`/seller/listings/${listing.id}/edit`}>{t("sellerListings.manage")}</Link>
                    </Button>
                  </TableCell>
                </TableRow>
                );
              })
            ) : (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                  {t("sellerListings.noListings")}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
