import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useFormatters } from "@/hooks/use-formatters";
import { Link } from "wouter";
import {
  useListFavorites,
  useToggleFavorite,
  getListFavoritesQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Heart, Car, ExternalLink, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function BuyerFavorites() {
  const { t } = useTranslation();
  const { formatCurrency } = useFormatters();
  const [page, setPage] = useState(1);
  const limit = 12;
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data, isLoading } = useListFavorites(
    { page, limit },
    { query: { queryKey: getListFavoritesQueryKey({ page, limit }) } }
  );

  const toggleFav = useToggleFavorite({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: ["/api/favorites"] });
        toast({ title: t("buyerFavorites.toastRemoved") });
      },
    },
  });

  const totalPages = data ? Math.ceil(data.total / limit) : 1;

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto space-y-8">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Heart className="h-7 w-7 text-rose-500" />
            {t("buyerFavorites.title")}
          </h1>
          <p className="text-muted-foreground">{t("buyerFavorites.subtitle")}</p>
        </div>
        <Button variant="outline" asChild>
          <Link href="/vehicles">{t("buyerFavorites.browseMore")}</Link>
        </Button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {[...Array(8)].map((_, i) => <Skeleton key={i} className="h-64" />)}
        </div>
      ) : !data?.data?.length ? (
        <Card className="bg-card border-border border-dashed">
          <CardContent className="py-16 text-center text-muted-foreground">
            <Heart className="h-12 w-12 mx-auto mb-4 opacity-20" />
            <p className="text-lg font-medium mb-2">{t("buyerFavorites.noFavorites")}</p>
            <p className="text-sm mb-4">{t("buyerFavorites.noFavoritesHint")}</p>
            <Button asChild>
              <Link href="/vehicles">{t("buyerFavorites.startBrowsing")}</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">{t("buyerFavorites.savedCount", { count: data.total })}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {data.data.map((fav) => {
              const v = fav.vehicle as any;
              if (!v) return null;
              return (
                <Card key={fav.id} className="bg-card border-border overflow-hidden flex flex-col group">
                  <Link href={`/vehicles/${v.id}`} className="block">
                    <div className="aspect-[16/9] bg-muted relative overflow-hidden">
                      {v.primaryImageUrl ? (
                        <img
                          src={v.primaryImageUrl}
                          alt={`${v.brandName} ${v.modelName}`}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Car className="h-12 w-12 text-muted-foreground/30" />
                        </div>
                      )}
                      {v.fuelType === "electric" && (
                        <Badge className="absolute top-2 left-2 bg-green-600 text-white text-xs">EV</Badge>
                      )}
                    </div>
                  </Link>

                  <CardContent className="p-3 flex-1 flex flex-col gap-2">
                    <div className="flex-1">
                      <Link href={`/vehicles/${v.id}`}>
                        <p className="font-semibold text-sm leading-tight hover:text-primary transition-colors">
                          {v.brandName} {v.modelName}
                        </p>
                      </Link>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {v.year} · {v.fuelType} · {v.condition}
                      </p>
                      <p className="text-base font-bold text-primary mt-1">
                        {formatCurrency(v.fobPriceUsd)}
                      </p>
                    </div>

                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" className="flex-1" asChild>
                        <Link href={`/vehicles/${v.id}`}>
                          <ExternalLink className="h-3 w-3 mr-1" /> {t("buyerFavorites.view")}
                        </Link>
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-rose-500 hover:text-rose-600 hover:bg-rose-50/10"
                        onClick={() => toggleFav.mutate({ vehicleId: v.id })}
                        disabled={toggleFav.isPending}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2">
              <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>
                {t("buyerFavorites.previous")}
              </Button>
              <span className="text-sm text-muted-foreground">{t("buyerFavorites.pageOf", { page, total: totalPages })}</span>
              <Button variant="outline" size="sm" disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>
                {t("buyerFavorites.next")}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
