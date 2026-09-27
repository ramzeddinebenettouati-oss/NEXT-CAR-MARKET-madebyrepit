import { useTranslation } from "react-i18next";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Link, useLocation } from "wouter";
import { useCreateVehicle } from "@workspace/api-client-react";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { ChevronLeft } from "lucide-react";

const formSchema = z.object({
  brandName: z.string().min(1, "Brand is required"),
  modelName: z.string().min(1, "Model is required"),
  trim: z.string().optional(),
  year: z.coerce.number().min(1990).max(2030),
  fuelType: z.enum(["petrol", "diesel", "electric", "hybrid", "phev", "hydrogen", "lpg", "other"]),
  transmission: z.enum(["manual", "automatic", "cvt", "dct", "other"]).optional(),
  driveType: z.enum(["fwd", "rwd", "awd", "4wd"]).optional(),
  condition: z.enum(["new", "used", "certified_used"]),
  engineSizeL: z.string().optional(),
  batteryCapacityKwh: z.string().optional(),
  rangeKm: z.coerce.number().min(0).optional(),
  exteriorColor: z.string().optional(),
  interiorColor: z.string().optional(),
  mileageKm: z.coerce.number().min(0).optional(),
  vin: z.string().optional(),
  originPortId: z.string().optional(),
  fobPriceUsd: z.string().min(1, "Price is required"),
  quantity: z.coerce.number().min(1).optional(),
  description: z.string().optional(),
  notes: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

export default function SellerListingNew() {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();
  const createVehicle = useCreateVehicle();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      brandName: "",
      modelName: "",
      trim: "",
      year: new Date().getFullYear(),
      fuelType: "electric",
      condition: "new",
      engineSizeL: "",
      batteryCapacityKwh: "",
      rangeKm: 0,
      exteriorColor: "",
      interiorColor: "",
      vin: "",
      originPortId: "",
      fobPriceUsd: "",
      quantity: 1,
      mileageKm: 0,
      description: "",
      notes: "",
    },
  });

  const fuelType = form.watch("fuelType");
  const isEv = fuelType === "electric" || fuelType === "phev" || fuelType === "hybrid";

  const onSubmit = (values: FormValues) => {
    createVehicle.mutate({ data: values as any }, {
      onSuccess: (data) => {
        toast.success(t("sellerListingNew.toastCreated"));
        setLocation(`/seller/listings/${data.id}/edit`);
      },
      onError: (err: any) => {
        toast.error(t("sellerListingNew.toastCreateFailed"), { description: err.message });
      }
    });
  };

  return (
    <div className="p-6 lg:p-8 max-w-4xl mx-auto space-y-6">
      <Button variant="ghost" asChild className="-ml-4 text-muted-foreground mb-4">
        <Link href="/seller/listings"><ChevronLeft className="h-4 w-4 mr-2" /> {t("sellerListingNew.backToListings")}</Link>
      </Button>

      <div>
        <h1 className="text-3xl font-bold tracking-tight">{t("sellerListingNew.title")}</h1>
        <p className="text-muted-foreground mt-1">{t("sellerListingNew.subtitle")}</p>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <Card>
            <CardHeader><CardTitle>{t("sellerListingNew.sectionIdentity")}</CardTitle></CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <FormField control={form.control} name="brandName" render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("sellerListingNew.fieldBrand")} <span className="text-destructive">*</span></FormLabel>
                    <FormControl><Input placeholder="e.g. BYD" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="modelName" render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("sellerListingNew.fieldModel")} <span className="text-destructive">*</span></FormLabel>
                    <FormControl><Input placeholder="e.g. Seal" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="trim" render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("sellerListingNew.fieldTrim")}</FormLabel>
                    <FormControl><Input placeholder="e.g. Performance AWD" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <FormField control={form.control} name="year" render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("sellerListingNew.fieldYear")} <span className="text-destructive">*</span></FormLabel>
                    <FormControl><Input type="number" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="condition" render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("sellerListingNew.fieldCondition")} <span className="text-destructive">*</span></FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                      <SelectContent>
                        <SelectItem value="new">{t("sellerListingNew.conditionNew")}</SelectItem>
                        <SelectItem value="used">{t("sellerListingNew.conditionUsed")}</SelectItem>
                        <SelectItem value="certified_used">{t("sellerListingNew.conditionCertified")}</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>{t("sellerListingNew.sectionPowertrain")}</CardTitle></CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <FormField control={form.control} name="fuelType" render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("sellerListingNew.fieldFuelType")} <span className="text-destructive">*</span></FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                      <SelectContent>
                        <SelectItem value="petrol">{t("sellerListingNew.fuelPetrol")}</SelectItem>
                        <SelectItem value="diesel">{t("sellerListingNew.fuelDiesel")}</SelectItem>
                        <SelectItem value="electric">{t("sellerListingNew.fuelElectric")}</SelectItem>
                        <SelectItem value="hybrid">{t("sellerListingNew.fuelHybrid")}</SelectItem>
                        <SelectItem value="phev">{t("sellerListingNew.fuelPhev")}</SelectItem>
                        <SelectItem value="hydrogen">{t("sellerListingNew.fuelHydrogen")}</SelectItem>
                        <SelectItem value="lpg">{t("sellerListingNew.fuelLpg")}</SelectItem>
                        <SelectItem value="other">{t("sellerListingNew.fuelOther")}</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="transmission" render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("sellerListingNew.fieldTransmission")}</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value ?? ""}>
                      <FormControl><SelectTrigger><SelectValue placeholder={t("sellerListingNew.selectPlaceholder")} /></SelectTrigger></FormControl>
                      <SelectContent>
                        <SelectItem value="automatic">{t("sellerListingNew.transAutomatic")}</SelectItem>
                        <SelectItem value="manual">{t("sellerListingNew.transManual")}</SelectItem>
                        <SelectItem value="cvt">{t("sellerListingNew.transCvt")}</SelectItem>
                        <SelectItem value="dct">{t("sellerListingNew.transDct")}</SelectItem>
                        <SelectItem value="other">{t("sellerListingNew.transOther")}</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="driveType" render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("sellerListingNew.fieldDriveType")}</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value ?? ""}>
                      <FormControl><SelectTrigger><SelectValue placeholder={t("sellerListingNew.selectPlaceholder")} /></SelectTrigger></FormControl>
                      <SelectContent>
                        <SelectItem value="fwd">FWD</SelectItem>
                        <SelectItem value="rwd">RWD</SelectItem>
                        <SelectItem value="awd">AWD</SelectItem>
                        <SelectItem value="4wd">4WD</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
              {!isEv && (
                <FormField control={form.control} name="engineSizeL" render={({ field }) => (
                  <FormItem className="max-w-xs">
                    <FormLabel>{t("sellerListingNew.fieldEngineSize")}</FormLabel>
                    <FormControl><Input type="number" step="0.1" placeholder="e.g. 2.0" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              )}
              {isEv && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <FormField control={form.control} name="batteryCapacityKwh" render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("sellerListingNew.fieldBattery")}</FormLabel>
                      <FormControl><Input type="number" step="0.1" placeholder="e.g. 82.56" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="rangeKm" render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("sellerListingNew.fieldRange")}</FormLabel>
                      <FormControl><Input type="number" placeholder="e.g. 570" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>{t("sellerListingNew.sectionAppearance")}</CardTitle></CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <FormField control={form.control} name="exteriorColor" render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("sellerListingNew.fieldExteriorColor")}</FormLabel>
                    <FormControl><Input placeholder="e.g. Aurora Blue" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="interiorColor" render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("sellerListingNew.fieldInteriorColor")}</FormLabel>
                    <FormControl><Input placeholder="e.g. Black" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="mileageKm" render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("sellerListingNew.fieldMileage")}</FormLabel>
                    <FormControl><Input type="number" min="0" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
              <FormField control={form.control} name="vin" render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("sellerListingNew.fieldVin")} <span className="text-xs text-muted-foreground">{t("sellerListingNew.optional")}</span></FormLabel>
                  <FormControl><Input placeholder="17-character vehicle identification number" maxLength={17} {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>{t("sellerListingNew.sectionTrade")}</CardTitle></CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <FormField control={form.control} name="fobPriceUsd" render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("sellerListingNew.fieldFobPrice")} <span className="text-destructive">*</span></FormLabel>
                    <FormControl><Input type="number" step="0.01" placeholder="e.g. 29800" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="quantity" render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("sellerListingNew.fieldQuantity")}</FormLabel>
                    <FormControl><Input type="number" min="1" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
              <FormField control={form.control} name="description" render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("sellerListingNew.fieldDescription")}</FormLabel>
                  <FormControl><Textarea rows={4} placeholder="Vehicle highlights, options, and condition details visible to buyers..." {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="notes" render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("sellerListingNew.fieldNotes")} <span className="text-xs text-muted-foreground">{t("sellerListingNew.fieldNotesHint")}</span></FormLabel>
                  <FormControl><Textarea rows={3} placeholder="Private notes for your reference..." {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </CardContent>
          </Card>

          <div className="flex justify-end gap-4">
            <Button variant="outline" asChild><Link href="/seller/listings">{t("sellerListingNew.cancel")}</Link></Button>
            <Button type="submit" disabled={createVehicle.isPending}>
              {createVehicle.isPending ? t("sellerListingNew.creating") : t("sellerListingNew.createAndAddImages")}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
