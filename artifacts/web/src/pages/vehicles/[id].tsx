import { useState, useEffect } from "react";
import { useParams, Link, useLocation } from "wouter";
import {
  useGetVehicle,
  useToggleFavorite,
  useCreateConversation,
  useListFavorites,
  getGetVehicleQueryKey,
  getListFavoritesQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { CarFront, ChevronLeft, Calendar, Fuel, Settings2, ShieldCheck, Mail, Heart } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";
import { useFormatters } from "@/hooks/use-formatters";

export default function VehicleDetail() {
  const params = useParams();
  const vehicleId = params.vehicleId;
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [, setLocation] = useLocation();
  const { t } = useTranslation();
  const { formatCurrency } = useFormatters();

  const [isFavorited, setIsFavorited] = useState(false);
  const [inquiryOpen, setInquiryOpen] = useState(false);
  const [inquiryText, setInquiryText] = useState("");

  const { data: vehicle, isLoading } = useGetVehicle(vehicleId as string, {
    query: { enabled: !!vehicleId, queryKey: getGetVehicleQueryKey(vehicleId as string) },
  });

  const isBuyer = user?.role === "buyer";

  // Hydrate favorite state from server
  const { data: favData } = useListFavorites({ limit: 100 }, {
    query: { enabled: isBuyer && !!vehicleId, queryKey: getListFavoritesQueryKey({ limit: 100 }) },
  });
  useEffect(() => {
    if (!favData?.data || !vehicleId) return;
    const found = favData.data.some((v: any) => v.vehicleId === vehicleId);
    setIsFavorited(found);
  }, [favData, vehicleId]);

  const toggleFav = useToggleFavorite({
    mutation: {
      onSuccess: (data) => {
        setIsFavorited(data.isFavorited);
        toast({ title: data.isFavorited ? t("vehicles.savedToFavorites") : t("vehicles.removeFromFavorites") });
        qc.invalidateQueries({ queryKey: ["/api/favorites"] });
      },
    },
  });

  const createConv = useCreateConversation({
    mutation: {
      onSuccess: (conv) => {
        setInquiryOpen(false);
        setInquiryText("");
        toast({ title: t("vehicles.messageSent") });
        setLocation(`/buyer/conversations/${conv.id}`);
      },
    },
  });

  if (isLoading) {
    return <div className="container mx-auto py-12 px-6">{t("vehicles.loadingDetails")}</div>;
  }

  if (!vehicle) {
    return <div className="container mx-auto py-12 px-6">{t("vehicles.notFound")}</div>;
  }

  const isOwner = user?.id === vehicle.sellerId;

  const handleSendInquiry = () => {
    if (!inquiryText.trim() || !vehicleId) return;
    createConv.mutate({ data: { vehicleId, message: inquiryText.trim() } });
  };

  return (
    <div className="container mx-auto py-12 px-6">
      <Button variant="ghost" asChild className="mb-6 -ml-4 text-muted-foreground">
        <Link href="/vehicles"><ChevronLeft className="h-4 w-4 mr-2" /> {t("vehicles.backToInventory")}</Link>
      </Button>

      {isOwner && vehicle.status === "rejected" && vehicle.rejectionReason && (
        <div className="bg-destructive/10 border border-destructive/20 text-destructive p-4 rounded-lg mb-8">
          <h4 className="font-bold mb-1">{t("vehicles.listingRejected")}</h4>
          <p>{vehicle.rejectionReason}</p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
        {/* Gallery */}
        <div className="space-y-4">
          <div className="aspect-[4/3] bg-muted rounded-xl overflow-hidden relative border border-border shadow-sm">
            {vehicle.primaryImageUrl ? (
              <img src={vehicle.primaryImageUrl} alt={`${vehicle.brandName} ${vehicle.modelName}`} className="object-cover w-full h-full" />
            ) : vehicle.images && vehicle.images.length > 0 ? (
              <img src={vehicle.images[0].url} alt={`${vehicle.brandName} ${vehicle.modelName}`} className="object-cover w-full h-full" />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center bg-secondary/50">
                <CarFront className="h-20 w-20 text-muted-foreground opacity-50" />
              </div>
            )}
          </div>

          {vehicle.images && vehicle.images.length > 1 && (
            <div className="grid grid-cols-4 gap-4">
              {vehicle.images.slice(0, 4).map((img) => (
                <div key={img.id} className="aspect-[4/3] bg-muted rounded-lg overflow-hidden border border-border">
                  <img src={img.url} alt="Vehicle thumbnail" className="object-cover w-full h-full" />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Details */}
        <div className="space-y-8">
          <div>
            <div className="flex items-center gap-3 mb-3">
              <Badge className="capitalize">{vehicle.condition.replace("_", " ")}</Badge>
              {vehicle.quantity && vehicle.quantity > 1 && (
                <Badge variant="outline">{t("vehicles.batchUnits", { count: vehicle.quantity })}</Badge>
              )}
            </div>
            <h1 className="text-4xl font-bold tracking-tight mb-2">
              {vehicle.brandName} {vehicle.modelName} {vehicle.trim || ""}
            </h1>
            <p className="text-muted-foreground">{t("vehicles.listingId", { id: vehicle.id.substring(0, 8).toUpperCase() })}</p>
          </div>

          <div className="p-6 bg-card border border-border rounded-xl shadow-sm">
            <p className="text-sm text-muted-foreground uppercase tracking-wider font-semibold mb-1">{t("vehicles.priceLabel")}</p>
            <div className="text-4xl font-bold font-mono text-primary">
              {formatCurrency(vehicle.displayPriceUsd ?? vehicle.fobPriceUsd)}
            </div>

            <Separator className="my-6" />

            {user ? (
              <div className="space-y-3">
                {isBuyer && !isOwner && (
                  <>
                    <Button
                      size="lg"
                      className="w-full text-lg h-14"
                      onClick={() => setInquiryOpen(true)}
                      data-testid="button-enquire"
                    >
                      <Mail className="mr-2 h-5 w-5" /> {t("vehicles.contactSeller")}
                    </Button>
                    <Button
                      size="lg"
                      variant="outline"
                      className={cn("w-full h-12", isFavorited && "border-rose-500 text-rose-500 hover:bg-rose-500/10")}
                      onClick={() => vehicleId && toggleFav.mutate({ vehicleId })}
                      disabled={toggleFav.isPending}
                    >
                      <Heart className={cn("mr-2 h-5 w-5 transition-colors", isFavorited && "fill-current")} />
                      {isFavorited ? t("vehicles.savedToFavorites") : t("vehicles.saveToFavorites")}
                    </Button>
                  </>
                )}
                {!isBuyer && !isOwner && (
                  <Button size="lg" className="w-full text-lg h-14" data-testid="button-enquire">
                    <Mail className="mr-2 h-5 w-5" /> {t("vehicles.contactSeller")}
                  </Button>
                )}
                {isOwner && (
                  <Button size="lg" variant="outline" className="w-full h-12" asChild>
                    <Link href={`/seller/listings/${vehicle.id}/edit`}>{t("vehicles.editListing")}</Link>
                  </Button>
                )}
              </div>
            ) : (
              <Button size="lg" className="w-full text-lg h-14" asChild data-testid="button-login-enquire">
                <Link href="/login">{t("vehicles.signInToEnquire")}</Link>
              </Button>
            )}
          </div>

          {isOwner && (vehicle as any).commissionType && (
            <div className="p-5 bg-amber-500/5 border border-amber-500/20 rounded-xl space-y-3">
              <h4 className="font-semibold text-sm text-amber-600 uppercase tracking-wider">Marketplace Information</h4>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">FOB Price</span>
                  <span className="font-mono font-medium">{formatCurrency(vehicle.fobPriceUsd)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Commission Type</span>
                  <span className="capitalize">{(vehicle as any).commissionType}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Platform Commission</span>
                  <span className="font-mono font-medium text-amber-600">
                    {(vehicle as any).commissionType === 'percentage'
                      ? `${Number((vehicle as any).commissionValue).toFixed(2)}%`
                      : formatCurrency((vehicle as any).commissionAmountUsd)}
                  </span>
                </div>
                <div className="flex justify-between border-t border-amber-500/20 pt-2 mt-1">
                  <span className="font-semibold">Buyer Display Price</span>
                  <span className="font-mono font-bold text-primary">{formatCurrency(vehicle.displayPriceUsd)}</span>
                </div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-6">
            <div className="flex items-start gap-3">
              <Calendar className="h-5 w-5 text-muted-foreground mt-0.5" />
              <div>
                <p className="text-sm font-medium text-muted-foreground">{t("vehicles.year")}</p>
                <p className="font-semibold">{vehicle.year}</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Fuel className="h-5 w-5 text-muted-foreground mt-0.5" />
              <div>
                <p className="text-sm font-medium text-muted-foreground">{t("vehicles.fuelType")}</p>
                <p className="font-semibold capitalize">{vehicle.fuelType}</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Settings2 className="h-5 w-5 text-muted-foreground mt-0.5" />
              <div>
                <p className="text-sm font-medium text-muted-foreground">{t("vehicles.transmission")}</p>
                <p className="font-semibold capitalize">{vehicle.transmission || "N/A"}</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <CarFront className="h-5 w-5 text-muted-foreground mt-0.5" />
              <div>
                <p className="text-sm font-medium text-muted-foreground">{t("vehicles.driveType")}</p>
                <p className="font-semibold uppercase">{vehicle.driveType || "N/A"}</p>
              </div>
            </div>
          </div>

          {vehicle.description && (
            <div>
              <h3 className="text-xl font-bold mb-4">{t("vehicles.description")}</h3>
              <div className="prose prose-sm dark:prose-invert max-w-none text-muted-foreground">
                {vehicle.description.split("\n").map((line, i) => (
                  <p key={i}>{line}</p>
                ))}
              </div>
            </div>
          )}

          <div className="bg-secondary/50 p-6 rounded-xl flex items-start gap-4">
            <ShieldCheck className="h-8 w-8 text-primary shrink-0" />
            <div>
              <h4 className="font-bold mb-1">{t("vehicles.tradeProtected")}</h4>
              <p className="text-sm text-muted-foreground">
                {t("vehicles.tradeProtectedDesc")}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Inquiry Dialog */}
      <Dialog open={inquiryOpen} onOpenChange={setInquiryOpen}>
        <DialogContent className="sm:max-w-lg bg-card border-border">
          <DialogHeader>
            <DialogTitle>{t("vehicles.contactSeller")}</DialogTitle>
            <DialogDescription>
              {t("vehicles.inquiryDesc", { brand: vehicle.brandName, model: vehicle.modelName })}
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={inquiryText}
            onChange={(e) => setInquiryText(e.target.value)}
            placeholder={t("vehicles.inquiryPlaceholder")}
            className="min-h-[120px] resize-none"
            autoFocus
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setInquiryOpen(false)}>{t("vehicles.cancel")}</Button>
            <Button
              onClick={handleSendInquiry}
              disabled={!inquiryText.trim() || createConv.isPending}
            >
              <Mail className="mr-2 h-4 w-4" />
              {createConv.isPending ? t("vehicles.sending") : t("vehicles.sendMessage")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
