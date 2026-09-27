import { useState, useEffect } from "react";
import { Link } from "wouter";
import { useListVehicles, useToggleFavorite, useListFavorites, getListFavoritesQueryKey } from "@workspace/api-client-react";
import { useQueryClient, useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { CarFront, Fuel, Gauge, Search, SlidersHorizontal, Zap, CheckCircle2, Heart, X, Bookmark, BookmarkCheck, Trash2, Bell, BellOff } from "lucide-react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";
import { useFormatters } from "@/hooks/use-formatters";

interface SavedSearchFilters {
  search: string; condition: string; fuelType: string; sortBy: string;
  priceMin: string; priceMax: string; yearMin: string; yearMax: string;
  color: string; evOnly: boolean; inStock: boolean;
}
interface SavedSearchItem {
  id: string; name: string; filters: SavedSearchFilters; notify: boolean; createdAt: string;
}

interface FilterPanelProps {
  search: string; setSearch: (v: string) => void;
  condition: string; setCondition: (v: string) => void;
  evOnly: boolean; setEvOnly: (v: boolean) => void;
  fuelType: string; setFuelType: (v: string) => void;
  inStock: boolean; setInStock: (v: boolean) => void;
  color: string; setColor: (v: string) => void;
  priceMin: string; setPriceMin: (v: string) => void;
  priceMax: string; setPriceMax: (v: string) => void;
  yearMin: string; setYearMin: (v: string) => void;
  yearMax: string; setYearMax: (v: string) => void;
  t: (key: string) => string;
}

function FilterPanel({
  search, setSearch, condition, setCondition,
  evOnly, setEvOnly, fuelType, setFuelType,
  inStock, setInStock, color, setColor,
  priceMin, setPriceMin, priceMax, setPriceMax,
  yearMin, setYearMin, yearMax, setYearMax,
  t,
}: FilterPanelProps) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <label className="text-sm font-medium">{t("vehicles.search")}</label>
        <div className="relative">
          <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={t("vehicles.searchPlaceholder")}
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            data-testid="input-search"
          />
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">{t("vehicles.condition")}</label>
        <Select value={condition} onValueChange={setCondition}>
          <SelectTrigger data-testid="select-condition">
            <SelectValue placeholder={t("vehicles.allConditions")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("vehicles.allConditions")}</SelectItem>
            <SelectItem value="new">{t("vehicles.new")}</SelectItem>
            <SelectItem value="used">{t("vehicles.used")}</SelectItem>
            <SelectItem value="certified_used">{t("vehicles.certifiedUsed")}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-3">
        <label className="text-sm font-medium">{t("vehicles.fuelType")}</label>
        <div className="flex items-center gap-3 p-3 rounded-lg border border-border bg-card">
          <Zap className="h-4 w-4 text-amber-500 shrink-0" />
          <Label htmlFor="ev-toggle" className="text-sm flex-1 cursor-pointer">{t("vehicles.evHybridOnly")}</Label>
          <Switch
            id="ev-toggle"
            checked={evOnly}
            onCheckedChange={(v) => { setEvOnly(v); if (v) setFuelType("all"); }}
            data-testid="toggle-ev-only"
          />
        </div>
        {!evOnly && (
          <Select value={fuelType} onValueChange={setFuelType}>
            <SelectTrigger data-testid="select-fuel">
              <SelectValue placeholder={t("vehicles.allFuelTypes")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("vehicles.allFuelTypes")}</SelectItem>
              <SelectItem value="petrol">{t("vehicles.petrol")}</SelectItem>
              <SelectItem value="diesel">{t("vehicles.diesel")}</SelectItem>
              <SelectItem value="electric">{t("vehicles.electric")}</SelectItem>
              <SelectItem value="hybrid">{t("vehicles.hybrid")}</SelectItem>
              <SelectItem value="phev">{t("vehicles.phev")}</SelectItem>
            </SelectContent>
          </Select>
        )}
      </div>

      <div className="flex items-center gap-3 p-3 rounded-lg border border-border bg-card">
        <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
        <Label htmlFor="instock-toggle" className="text-sm flex-1 cursor-pointer">{t("vehicles.inStockOnly")}</Label>
        <Switch
          id="instock-toggle"
          checked={inStock}
          onCheckedChange={setInStock}
          data-testid="toggle-in-stock"
        />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">{t("vehicles.exteriorColor")}</label>
        <Input
          placeholder={t("vehicles.colorPlaceholder")}
          value={color}
          onChange={(e) => setColor(e.target.value)}
          data-testid="input-color"
        />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">{t("vehicles.fobPrice")}</label>
        <div className="flex gap-2">
          <Input
            type="number"
            placeholder={t("vehicles.min")}
            value={priceMin}
            onChange={(e) => setPriceMin(e.target.value)}
            data-testid="input-price-min"
            className="w-full"
          />
          <Input
            type="number"
            placeholder={t("vehicles.max")}
            value={priceMax}
            onChange={(e) => setPriceMax(e.target.value)}
            data-testid="input-price-max"
            className="w-full"
          />
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">{t("vehicles.year")}</label>
        <div className="flex gap-2">
          <Input
            type="number"
            placeholder={t("vehicles.from")}
            value={yearMin}
            onChange={(e) => setYearMin(e.target.value)}
            data-testid="input-year-min"
            className="w-full"
          />
          <Input
            type="number"
            placeholder={t("vehicles.to")}
            value={yearMax}
            onChange={(e) => setYearMax(e.target.value)}
            data-testid="input-year-max"
            className="w-full"
          />
        </div>
      </div>
    </div>
  );
}

export default function Vehicles() {
  const { t } = useTranslation();
  const { formatCurrency, formatNumber } = useFormatters();
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [condition, setCondition] = useState<string>("all");
  const [fuelType, setFuelType] = useState<string>("all");
  const [sortBy, setSortBy] = useState<string>("newest");
  const [priceMin, setPriceMin] = useState("");
  const [priceMax, setPriceMax] = useState("");
  const [yearMin, setYearMin] = useState("");
  const [yearMax, setYearMax] = useState("");
  const [color, setColor] = useState("");
  const [evOnly, setEvOnly] = useState(false);
  const [inStock, setInStock] = useState(false);

  // Per-card optimistic favorite state: vehicleId → boolean
  const [favMap, setFavMap] = useState<Record<string, boolean>>({});

  const { user } = useAuth();
  const qc = useQueryClient();
  const isBuyer = user?.role === "buyer";

  // Hydrate favorite state from server for the current page of listings
  const { data: favData } = useListFavorites({ limit: 100 }, {
    query: { enabled: isBuyer, queryKey: getListFavoritesQueryKey({ limit: 100 }) },
  });
  useEffect(() => {
    if (!favData?.data) return;
    const serverMap: Record<string, boolean> = {};
    for (const v of favData.data) {
      serverMap[(v as any).vehicleId] = true;
    }
    setFavMap(prev => ({ ...serverMap, ...prev }));
  }, [favData]);

  const { data, isLoading } = useListVehicles({
    search: search || undefined,
    condition: condition !== "all" ? condition as any : undefined,
    fuelType: !evOnly && fuelType !== "all" ? fuelType as any : undefined,
    sortBy: sortBy as any,
    priceMin: priceMin ? Number(priceMin) : undefined,
    priceMax: priceMax ? Number(priceMax) : undefined,
    yearMin: yearMin ? Number(yearMin) : undefined,
    yearMax: yearMax ? Number(yearMax) : undefined,
    exteriorColor: color || undefined,
    evOnly: evOnly || undefined,
    inStock: inStock || undefined,
    status: "published",
    limit: 24,
  });

  const toggleFav = useToggleFavorite({
    mutation: {
      onSuccess: (result) => {
        setFavMap(m => ({ ...m, [result.vehicleId]: result.isFavorited }));
        qc.invalidateQueries({ queryKey: ["/api/favorites"] });
      },
    },
  });

  const clearFilters = () => {
    setSearch("");
    setCondition("all");
    setFuelType("all");
    setSortBy("newest");
    setPriceMin("");
    setPriceMax("");
    setYearMin("");
    setYearMax("");
    setColor("");
    setEvOnly(false);
    setInStock(false);
  };

  // ── Saved searches ────────────────────────────────────────────────────────
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [savedOpen, setSavedOpen] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [saveNotify, setSaveNotify] = useState(false);

  const getAuthHeaders = (): Record<string, string> => {
    const token = localStorage.getItem("ac_access_token");
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  const { data: savedData, refetch: refetchSaved } = useQuery<{ data: SavedSearchItem[] }>({
    queryKey: ["/api/saved-searches"],
    queryFn: async () => {
      const res = await fetch("/api/saved-searches", { headers: getAuthHeaders() });
      if (res.status === 401) return { data: [] };
      if (!res.ok) throw new Error("Failed to fetch saved searches");
      return res.json();
    },
    enabled: !!user,
    staleTime: 30_000,
  });
  const savedList = savedData?.data ?? [];

  const currentFilters: SavedSearchFilters = {
    search, condition, fuelType, sortBy,
    priceMin, priceMax, yearMin, yearMax, color, evOnly, inStock,
  };

  const saveSearchMutation = useMutation({
    mutationFn: async ({ name, notify }: { name: string; notify: boolean }) => {
      const res = await fetch("/api/saved-searches", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({ name, notify, filters: currentFilters }),
      });
      if (!res.ok) throw new Error("Failed to save");
      return res.json();
    },
    onSuccess: () => {
      refetchSaved();
      setSaveDialogOpen(false);
      setSaveName("");
      setSaveNotify(false);
    },
  });

  const deleteSearchMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/saved-searches/${id}`, { method: "DELETE", headers: getAuthHeaders() });
      if (!res.ok && res.status !== 204) throw new Error("Failed to delete");
    },
    onSuccess: () => refetchSaved(),
  });

  const toggleNotifyMutation = useMutation({
    mutationFn: async ({ id, notify }: { id: string; notify: boolean }) => {
      const res = await fetch(`/api/saved-searches/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({ notify }),
      });
      if (!res.ok) throw new Error("Failed to update");
      return res.json();
    },
    onSuccess: () => refetchSaved(),
  });

  const applySavedSearch = (f: SavedSearchFilters) => {
    setSearch(f.search || "");
    setCondition(f.condition || "all");
    setFuelType(f.fuelType || "all");
    setSortBy(f.sortBy || "newest");
    setPriceMin(f.priceMin || "");
    setPriceMax(f.priceMax || "");
    setYearMin(f.yearMin || "");
    setYearMax(f.yearMax || "");
    setColor(f.color || "");
    setEvOnly(!!f.evOnly);
    setInStock(!!f.inStock);
    setSavedOpen(false);
  };

  return (
    <div className="container mx-auto py-12 px-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
        <div>
          <h1 className="text-4xl font-bold tracking-tight">{t("vehicles.title")}</h1>
          <p className="text-muted-foreground mt-2">{t("vehicles.subtitle")}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm text-muted-foreground">{t("vehicles.vehiclesCount", { count: data?.total ?? 0 })}</span>
          <Select value={sortBy} onValueChange={setSortBy}>
            <SelectTrigger className="w-44" data-testid="select-sort">
              <SelectValue placeholder={t("vehicles.sortBy")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="newest">{t("vehicles.newest")}</SelectItem>
              <SelectItem value="oldest">{t("vehicles.oldest")}</SelectItem>
              <SelectItem value="price_asc">{t("vehicles.priceAsc")}</SelectItem>
              <SelectItem value="price_desc">{t("vehicles.priceDesc")}</SelectItem>
              <SelectItem value="popular">{t("vehicles.popular")}</SelectItem>
            </SelectContent>
          </Select>
          {user && (
            <>
              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setSaveDialogOpen(true)}>
                <Bookmark className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{t("savedSearches.save")}</span>
              </Button>
              {savedList.length > 0 && (
                <Popover open={savedOpen} onOpenChange={setSavedOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="secondary" size="sm" className="gap-1.5">
                      <BookmarkCheck className="h-3.5 w-3.5" />
                      {t("savedSearches.button")} ({savedList.length})
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="end" className="w-80 p-0">
                    <div className="px-4 py-3 border-b border-border">
                      <p className="text-sm font-semibold">{t("savedSearches.button")}</p>
                    </div>
                    <div className="max-h-72 overflow-y-auto">
                      {savedList.map((s, i) => (
                        <div key={s.id}>
                          {i > 0 && <Separator />}
                          <div className="flex items-center gap-2 px-4 py-3">
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">{s.name}</p>
                            </div>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 shrink-0"
                              title={s.notify ? "Disable alerts" : "Enable alerts"}
                              onClick={() => toggleNotifyMutation.mutate({ id: s.id, notify: !s.notify })}
                            >
                              {s.notify ? <Bell className="h-3.5 w-3.5 text-primary" /> : <BellOff className="h-3.5 w-3.5 text-muted-foreground" />}
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 text-xs"
                              onClick={() => applySavedSearch(s.filters)}
                            >
                              {t("savedSearches.apply")}
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 shrink-0 text-destructive hover:text-destructive"
                              onClick={() => deleteSearchMutation.mutate(s.id)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </PopoverContent>
                </Popover>
              )}
            </>
          )}
        </div>
      </div>
      
      {/* Mobile filter trigger row */}
      <div className="flex md:hidden items-center gap-2 mb-4">
        <Sheet open={filterSheetOpen} onOpenChange={setFilterSheetOpen}>
          <SheetTrigger asChild>
            <Button variant="outline" size="sm" className="gap-2">
              <SlidersHorizontal className="h-4 w-4" />
              {t("vehicles.filters")}
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-80 p-0 flex flex-col overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <h3 className="font-semibold flex items-center gap-2">
                <SlidersHorizontal className="h-4 w-4" /> {t("vehicles.filters")}
              </h3>
              <Button variant="ghost" size="sm" onClick={() => { clearFilters(); setFilterSheetOpen(false); }} className="text-xs text-muted-foreground">
                {t("vehicles.clearAll")}
              </Button>
            </div>
            <div className="p-4 space-y-4 flex-1">
              <FilterPanel
                search={search} setSearch={setSearch}
                condition={condition} setCondition={setCondition}
                evOnly={evOnly} setEvOnly={setEvOnly}
                fuelType={fuelType} setFuelType={setFuelType}
                inStock={inStock} setInStock={setInStock}
                color={color} setColor={setColor}
                priceMin={priceMin} setPriceMin={setPriceMin}
                priceMax={priceMax} setPriceMax={setPriceMax}
                yearMin={yearMin} setYearMin={setYearMin}
                yearMax={yearMax} setYearMax={setYearMax}
                t={t}
              />
            </div>
            <div className="p-4 border-t border-border">
              <Button className="w-full" onClick={() => setFilterSheetOpen(false)}>
                {t("vehicles.viewDetails")}
              </Button>
            </div>
          </SheetContent>
        </Sheet>
        <span className="text-sm text-muted-foreground">{t("vehicles.vehiclesCount", { count: data?.total ?? 0 })}</span>
      </div>

      <div className="flex gap-8">
        {/* Desktop sidebar */}
        <aside className="hidden md:block w-64 space-y-6 flex-shrink-0">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <SlidersHorizontal className="h-4 w-4" /> {t("vehicles.filters")}
            </h3>
            <Button variant="ghost" size="sm" onClick={clearFilters} className="text-xs text-muted-foreground">
              {t("vehicles.clearAll")}
            </Button>
          </div>
          <FilterPanel
            search={search} setSearch={setSearch}
            condition={condition} setCondition={setCondition}
            evOnly={evOnly} setEvOnly={setEvOnly}
            fuelType={fuelType} setFuelType={setFuelType}
            inStock={inStock} setInStock={setInStock}
            color={color} setColor={setColor}
            priceMin={priceMin} setPriceMin={setPriceMin}
            priceMax={priceMax} setPriceMax={setPriceMax}
            yearMin={yearMin} setYearMin={setYearMin}
            yearMax={yearMax} setYearMax={setYearMax}
            t={t}
          />
        </aside>

        <main className="flex-1 min-w-0">
          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <Card key={i} className="overflow-hidden">
                  <Skeleton className="h-48 w-full" />
                  <CardHeader><Skeleton className="h-6 w-3/4" /></CardHeader>
                  <CardContent><Skeleton className="h-4 w-1/2" /></CardContent>
                </Card>
              ))}
            </div>
          ) : data?.data.length === 0 ? (
            <div className="text-center py-24 bg-card rounded-lg border border-dashed border-border">
              <CarFront className="mx-auto h-12 w-12 text-muted-foreground opacity-50 mb-4" />
              <h3 className="text-lg font-semibold mb-2">{t("vehicles.noVehiclesFound")}</h3>
              <p className="text-muted-foreground mb-6">{t("vehicles.noVehiclesHint")}</p>
              <Button onClick={clearFilters}>{t("vehicles.clearFilters")}</Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
              {data?.data.map((vehicle) => {
                const isOwnListing = user?.id === vehicle.sellerId;
                const favorited = favMap[vehicle.id] ?? false;

                return (
                  <Card
                    key={vehicle.id}
                    className="overflow-hidden flex flex-col hover:border-primary/50 transition-colors"
                    data-testid={`card-vehicle-${vehicle.id}`}
                  >
                    <div className="relative aspect-[4/3] bg-muted">
                      {vehicle.primaryImageUrl ? (
                        <img
                          src={vehicle.primaryImageUrl}
                          alt={`${vehicle.brandName} ${vehicle.modelName}`}
                          className="object-cover w-full h-full"
                        />
                      ) : (
                        <div className="absolute inset-0 flex items-center justify-center bg-secondary/50">
                          <CarFront className="h-12 w-12 text-muted-foreground opacity-50" />
                        </div>
                      )}
                      <div className="absolute top-3 right-3 flex items-center gap-2">
                        {/* Heart/favorite button — visible to buyers only */}
                        {isBuyer && !isOwnListing && (
                          <button
                            aria-label={favorited ? t("vehicles.removeFromFavorites") : t("vehicles.saveToFavorites")}
                            data-testid={`btn-favorite-${vehicle.id}`}
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              toggleFav.mutate({ vehicleId: vehicle.id });
                            }}
                            className={cn(
                              "flex items-center justify-center h-7 w-7 rounded-full transition-colors",
                              favorited
                                ? "bg-rose-500 text-white shadow"
                                : "bg-background/80 backdrop-blur text-muted-foreground hover:text-rose-500 shadow"
                            )}
                          >
                            <Heart className={cn("h-3.5 w-3.5", favorited && "fill-current")} />
                          </button>
                        )}
                        <Badge className="bg-background/80 backdrop-blur text-foreground border-border capitalize shadow-sm">
                          {vehicle.condition.replace("_", " ")}
                        </Badge>
                      </div>
                    </div>
                    
                    <CardHeader className="p-4 pb-0">
                      <div className="text-xs text-muted-foreground mb-1">{vehicle.year}</div>
                      <CardTitle className="text-lg font-bold leading-tight">
                        {vehicle.brandName} {vehicle.modelName} {vehicle.trim || ""}
                      </CardTitle>
                    </CardHeader>
                    
                    <CardContent className="p-4 flex-1">
                      <div className="grid grid-cols-2 gap-y-2 text-sm mt-4">
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Fuel className="h-4 w-4" />
                          <span className="capitalize">{vehicle.fuelType}</span>
                        </div>
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Gauge className="h-4 w-4" />
                          <span>{vehicle.mileageKm ? `${formatNumber(vehicle.mileageKm)} ${t("vehicles.km")}` : `0 ${t("vehicles.km")}`}</span>
                        </div>
                      </div>
                    </CardContent>
                    
                    <CardFooter className="p-4 pt-0 border-t border-border mt-4 flex items-center justify-between">
                      <div>
                        <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">{t("vehicles.priceLabel")}</p>
                        <p className="text-xl font-bold font-mono">{formatCurrency(vehicle.displayPriceUsd ?? vehicle.fobPriceUsd)}</p>
                      </div>
                      <Button asChild>
                        <Link href={`/vehicles/${vehicle.id}`} data-testid={`link-vehicle-${vehicle.id}`}>
                          {t("vehicles.viewDetails")}
                        </Link>
                      </Button>
                    </CardFooter>
                  </Card>
                );
              })}
            </div>
          )}
        </main>
      </div>

      {/* Save Search Dialog */}
      <Dialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("savedSearches.saveTitle")}</DialogTitle>
            <DialogDescription>{t("savedSearches.saveDesc")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="save-name">{t("savedSearches.name")}</Label>
              <Input
                id="save-name"
                placeholder={t("savedSearches.namePlaceholder")}
                value={saveName}
                onChange={(e) => setSaveName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && saveName.trim()) {
                    saveSearchMutation.mutate({ name: saveName.trim(), notify: saveNotify });
                  }
                }}
                data-testid="input-save-name"
                autoFocus
              />
            </div>
            <div className="flex items-start gap-3 p-3 rounded-lg border border-border bg-muted/40">
              <Bell className="h-4 w-4 text-primary mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium leading-none mb-1">{t("savedSearches.notify")}</p>
                <p className="text-xs text-muted-foreground">{t("savedSearches.notifyDesc")}</p>
              </div>
              <Switch
                checked={saveNotify}
                onCheckedChange={setSaveNotify}
                data-testid="toggle-save-notify"
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setSaveDialogOpen(false)}>{t("vehicles.cancel")}</Button>
            <Button
              onClick={() => saveSearchMutation.mutate({ name: saveName.trim(), notify: saveNotify })}
              disabled={!saveName.trim() || saveSearchMutation.isPending}
              data-testid="button-save-search"
            >
              {saveSearchMutation.isPending ? t("savedSearches.saving") : t("savedSearches.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
