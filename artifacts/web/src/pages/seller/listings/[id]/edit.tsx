import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useParams, Link } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useGetVehicle, useUpdateVehicle, useSubmitVehicleForReview, requestVehicleImageUpload, attachVehicleImage, getGetVehicleQueryKey, useDeleteVehicleImage, useAddVehicleVideo, useDeleteVehicleVideo } from "@workspace/api-client-react";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { ChevronLeft, Upload, Trash2, Send, AlertTriangle, Video, Link2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

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

export default function SellerListingEdit() {
  const { t } = useTranslation();
  const params = useParams();
  const vehicleId = params.vehicleId as string;
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoFileInputRef = useRef<HTMLInputElement>(null);
  const [videoUrl, setVideoUrl] = useState("");
  const [videoTitle, setVideoTitle] = useState("");

  const { data: vehicle, isLoading } = useGetVehicle(vehicleId, {
    query: { enabled: !!vehicleId, queryKey: getGetVehicleQueryKey(vehicleId) }
  });

  const updateVehicle = useUpdateVehicle();
  const submitReview = useSubmitVehicleForReview();
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const deleteImage = useDeleteVehicleImage();
  const addVideo = useAddVehicleVideo();
  const deleteVideo = useDeleteVehicleVideo();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      brandName: "",
      modelName: "",
      trim: "",
      year: new Date().getFullYear(),
      fuelType: "petrol",
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

  useEffect(() => {
    if (vehicle) {
      form.reset({
        brandName: vehicle.brandName,
        modelName: vehicle.modelName,
        trim: (vehicle as any).trim || "",
        year: vehicle.year,
        fuelType: vehicle.fuelType as any,
        transmission: (vehicle as any).transmission || undefined,
        driveType: (vehicle as any).driveType || undefined,
        condition: vehicle.condition as any,
        engineSizeL: (vehicle as any).engineSizeL || "",
        batteryCapacityKwh: (vehicle as any).batteryCapacityKwh || "",
        rangeKm: (vehicle as any).rangeKm || 0,
        exteriorColor: (vehicle as any).exteriorColor || "",
        interiorColor: (vehicle as any).interiorColor || "",
        mileageKm: vehicle.mileageKm || 0,
        vin: vehicle.vin || "",
        originPortId: vehicle.originPortId || "",
        fobPriceUsd: vehicle.fobPriceUsd ?? undefined,
        quantity: vehicle.quantity || 1,
        description: vehicle.description || "",
        notes: vehicle.notes || "",
      });
    }
  }, [vehicle, form]);

  const onSubmit = (values: FormValues) => {
    updateVehicle.mutate({ vehicleId, data: values as any }, {
      onSuccess: () => {
        toast.success(t("sellerListingEdit.toastUpdated"));
        queryClient.invalidateQueries({ queryKey: getGetVehicleQueryKey(vehicleId) });
      },
      onError: (err: any) => {
        toast.error(t("sellerListingEdit.toastUpdateFailed"), { description: err.message });
      }
    });
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingImage(true);
    try {
      const upload = await requestVehicleImageUpload({
        name: file.name,
        size: file.size,
        contentType: file.type || "application/octet-stream",
      });
      const response = await fetch(upload.uploadURL, {
        method: "PUT",
        headers: { "Content-Type": file.type || "application/octet-stream" },
        body: file,
      });
      if (!response.ok) throw new Error("Failed to upload image");

      await attachVehicleImage(vehicleId, {
        objectPath: upload.objectPath,
        isPrimary: vehicle?.images?.length === 0,
      });
      toast.success(t("sellerListingEdit.toastImageUploaded"));
      await queryClient.invalidateQueries({ queryKey: getGetVehicleQueryKey(vehicleId) });
    } catch (error) {
      toast.error(t("sellerListingEdit.toastImageFailed"), {
        description: error instanceof Error ? error.message : "Upload failed",
      });
    } finally {
      setIsUploadingImage(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleVideoFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    addVideo.mutate({ vehicleId, data: { file, title: videoTitle || undefined } }, {
      onSuccess: () => {
        toast.success(t("sellerListingEdit.toastVideoUploaded"));
        queryClient.invalidateQueries({ queryKey: getGetVehicleQueryKey(vehicleId) });
        if (videoFileInputRef.current) videoFileInputRef.current.value = '';
        setVideoTitle("");
      },
      onError: (err: any) => {
        toast.error(t("sellerListingEdit.toastVideoFailed"), { description: err.message });
      }
    });
  };

  const handleAddVideoUrl = () => {
    if (!videoUrl.trim()) return;

    addVideo.mutate({ vehicleId, data: { url: videoUrl.trim(), title: videoTitle || undefined } }, {
      onSuccess: () => {
        toast.success(t("sellerListingEdit.toastVideoLinkAdded"));
        queryClient.invalidateQueries({ queryKey: getGetVehicleQueryKey(vehicleId) });
        setVideoUrl("");
        setVideoTitle("");
      },
      onError: (err: any) => {
        toast.error(t("sellerListingEdit.toastVideoLinkFailed"), { description: err.message });
      }
    });
  };

  const handleSubmitForReview = () => {
    submitReview.mutate({ vehicleId }, {
      onSuccess: () => {
        toast.success(t("sellerListingEdit.toastSubmitted"));
        queryClient.invalidateQueries({ queryKey: getGetVehicleQueryKey(vehicleId) });
      },
      onError: (err: any) => {
        toast.error(t("sellerListingEdit.toastSubmitFailed"), { description: err.message });
      }
    });
  };

  if (isLoading) return <div className="p-8">{t("sellerListingEdit.loadingVehicle")}</div>;
  if (!vehicle) return <div className="p-8">{t("sellerListingEdit.vehicleNotFound")}</div>;

  return (
    <div className="p-6 lg:p-8 max-w-4xl mx-auto space-y-6">
      <Button variant="ghost" asChild className="-ml-4 text-muted-foreground mb-4">
        <Link href="/seller/listings"><ChevronLeft className="h-4 w-4 mr-2" /> {t("sellerListingEdit.backToListings")}</Link>
      </Button>

      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t("sellerListingEdit.title")}</h1>
          <p className="text-muted-foreground mt-1">{t("sellerListingEdit.listingId", { id: vehicleId.substring(0,8).toUpperCase() })}</p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" asChild>
            <Link href={`/vehicles/${vehicleId}`}>{t("sellerListingEdit.previewPublic")}</Link>
          </Button>
          {(vehicle.status === 'draft' || vehicle.status === 'rejected') && (
            <Button onClick={handleSubmitForReview} disabled={submitReview.isPending} className="bg-amber-500 hover:bg-amber-600 text-black">
              <Send className="h-4 w-4 mr-2" /> {submitReview.isPending ? t("sellerListingEdit.submitting") : t("sellerListingEdit.submitForReview")}
            </Button>
          )}
        </div>
      </div>

      {vehicle.status === 'rejected' && (vehicle as any).rejectionReason && (
        <div className="bg-destructive/10 border border-destructive/20 text-destructive p-4 rounded-lg flex gap-3 items-start">
          <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
          <div>
            <h4 className="font-bold mb-1">{t("sellerListingEdit.rejectedTitle")}</h4>
            <p>{(vehicle as any).rejectionReason}</p>
            <p className="text-sm mt-2">{t("sellerListingEdit.rejectedFix")}</p>
          </div>
        </div>
      )}

      <Card>
        <CardHeader><CardTitle>{t("sellerListingEdit.sectionImages")}</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            {vehicle.images?.map((img) => (
              <div key={img.id} className="relative group aspect-square rounded-lg border border-border overflow-hidden bg-muted">
                <img src={img.url} className="w-full h-full object-cover" alt="Vehicle" />
                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <Button
                    variant="destructive" size="icon"
                    onClick={() => deleteImage.mutate({ vehicleId, imageId: img.id }, {
                      onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetVehicleQueryKey(vehicleId) })
                    })}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                {img.isPrimary && <div className="absolute top-2 left-2 bg-primary text-black text-xs font-bold px-2 py-1 rounded">{t("sellerListingEdit.primary")}</div>}
              </div>
            ))}
            <div
              className="aspect-square rounded-lg border-2 border-dashed border-border hover:border-primary/50 flex flex-col items-center justify-center cursor-pointer text-muted-foreground hover:text-foreground transition-colors"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="h-6 w-6 mb-2" />
              <span className="text-sm font-medium">
                {isUploadingImage ? t("sellerListingEdit.uploading") : t("sellerListingEdit.uploadImage")}
              </span>
            </div>
          </div>
          <input type="file" className="hidden" ref={fileInputRef} onChange={handleImageUpload} accept="image/*" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>{t("sellerListingEdit.sectionVideos")}</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {(vehicle as any).videos?.length > 0 && (
            <div className="space-y-2">
              {(vehicle as any).videos.map((v: any) => (
                <div key={v.id} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg border border-border">
                  <div className="flex items-center gap-3 min-w-0">
                    <Video className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div className="min-w-0">
                      {v.title && <p className="text-sm font-medium truncate">{v.title}</p>}
                      <p className="text-xs text-muted-foreground truncate">{v.url}</p>
                    </div>
                  </div>
                  <Button
                    variant="ghost" size="icon" className="text-destructive shrink-0"
                    onClick={() => deleteVideo.mutate({ vehicleId, videoId: v.id }, {
                      onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetVehicleQueryKey(vehicleId) })
                    })}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
          <div className="border border-border rounded-lg p-4 space-y-3">
            <p className="text-sm font-medium">{t("sellerListingEdit.addVideo")}</p>
            <Input
              placeholder={t("sellerListingEdit.videoTitle")}
              value={videoTitle}
              onChange={(e) => setVideoTitle(e.target.value)}
            />
            <div className="flex gap-2">
              <Input
                placeholder={t("sellerListingEdit.pasteVideoUrl")}
                value={videoUrl}
                onChange={(e) => setVideoUrl(e.target.value)}
              />
              <Button variant="outline" onClick={handleAddVideoUrl} disabled={!videoUrl.trim() || addVideo.isPending}>
                <Link2 className="h-4 w-4 mr-2" /> {t("sellerListingEdit.addUrl")}
              </Button>
            </div>
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <span className="h-px flex-1 bg-border" />
              <span>{t("sellerListingEdit.or")}</span>
              <span className="h-px flex-1 bg-border" />
            </div>
            <Button
              variant="outline" className="w-full"
              onClick={() => videoFileInputRef.current?.click()}
              disabled={addVideo.isPending}
            >
              <Upload className="h-4 w-4 mr-2" /> {t("sellerListingEdit.uploadVideoFile")}
            </Button>
            <input type="file" className="hidden" ref={videoFileInputRef} onChange={handleVideoFileUpload} accept="video/*" />
          </div>
        </CardContent>
      </Card>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <Card>
            <CardHeader><CardTitle>{t("sellerListingEdit.fieldBrand")}</CardTitle></CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <FormField control={form.control} name="brandName" render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("sellerListingEdit.fieldBrand")} <span className="text-destructive">*</span></FormLabel>
                    <FormControl><Input {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="modelName" render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("sellerListingEdit.fieldModel")} <span className="text-destructive">*</span></FormLabel>
                    <FormControl><Input {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="trim" render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("sellerListingEdit.fieldTrim")}</FormLabel>
                    <FormControl><Input placeholder="e.g. Performance AWD" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <FormField control={form.control} name="year" render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("sellerListingEdit.fieldYear")}</FormLabel>
                    <FormControl><Input type="number" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="condition" render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("sellerListingEdit.fieldCondition")}</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                      <SelectContent>
                        <SelectItem value="new">{t("sellerListingEdit.conditionNew")}</SelectItem>
                        <SelectItem value="used">{t("sellerListingEdit.conditionUsed")}</SelectItem>
                        <SelectItem value="certified_used">{t("sellerListingEdit.conditionCertified")}</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Powertrain</CardTitle></CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <FormField control={form.control} name="fuelType" render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("sellerListingEdit.fieldFuelType")}</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                      <SelectContent>
                        <SelectItem value="petrol">{t("sellerListingEdit.fuelPetrol")}</SelectItem>
                        <SelectItem value="diesel">{t("sellerListingEdit.fuelDiesel")}</SelectItem>
                        <SelectItem value="electric">{t("sellerListingEdit.fuelElectric")}</SelectItem>
                        <SelectItem value="hybrid">{t("sellerListingEdit.fuelHybrid")}</SelectItem>
                        <SelectItem value="phev">{t("sellerListingEdit.fuelPhev")}</SelectItem>
                        <SelectItem value="hydrogen">{t("sellerListingEdit.fuelHydrogen")}</SelectItem>
                        <SelectItem value="lpg">{t("sellerListingEdit.fuelLpg")}</SelectItem>
                        <SelectItem value="other">{t("sellerListingEdit.fuelOther")}</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="transmission" render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("sellerListingEdit.fieldTransmission")}</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value ?? ""}>
                      <FormControl><SelectTrigger><SelectValue placeholder={t("sellerListingEdit.selectPlaceholder")} /></SelectTrigger></FormControl>
                      <SelectContent>
                        <SelectItem value="automatic">{t("sellerListingEdit.transAutomatic")}</SelectItem>
                        <SelectItem value="manual">{t("sellerListingEdit.transManual")}</SelectItem>
                        <SelectItem value="cvt">{t("sellerListingEdit.transCvt")}</SelectItem>
                        <SelectItem value="dct">{t("sellerListingEdit.transDct")}</SelectItem>
                        <SelectItem value="other">{t("sellerListingEdit.transOther")}</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="driveType" render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("sellerListingEdit.fieldDriveType")}</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value ?? ""}>
                      <FormControl><SelectTrigger><SelectValue placeholder={t("sellerListingEdit.selectPlaceholder")} /></SelectTrigger></FormControl>
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
                    <FormLabel>{t("sellerListingEdit.fieldEngineSize")}</FormLabel>
                    <FormControl><Input type="number" step="0.1" placeholder="e.g. 2.0" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              )}
              {isEv && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <FormField control={form.control} name="batteryCapacityKwh" render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("sellerListingEdit.fieldBattery")}</FormLabel>
                      <FormControl><Input type="number" step="0.1" placeholder="e.g. 82.56" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="rangeKm" render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("sellerListingEdit.fieldRange")}</FormLabel>
                      <FormControl><Input type="number" placeholder="e.g. 570" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Appearance &amp; Mileage</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <FormField control={form.control} name="exteriorColor" render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("sellerListingEdit.fieldExteriorColor")}</FormLabel>
                    <FormControl><Input placeholder="e.g. Aurora Blue" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="interiorColor" render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("sellerListingEdit.fieldInteriorColor")}</FormLabel>
                    <FormControl><Input placeholder="e.g. Black" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="mileageKm" render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("sellerListingEdit.fieldMileage")}</FormLabel>
                    <FormControl><Input type="number" min="0" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
              <div className="mt-6">
                <FormField control={form.control} name="vin" render={({ field }) => (
                  <FormItem className="max-w-sm">
                    <FormLabel>{t("sellerListingEdit.fieldVin")} <span className="text-xs text-muted-foreground">{t("sellerListingEdit.optional")}</span></FormLabel>
                    <FormControl><Input placeholder="17-character vehicle identification number" maxLength={17} {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Trade Details</CardTitle></CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <FormField control={form.control} name="fobPriceUsd" render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("sellerListingEdit.fieldFobPrice")} <span className="text-destructive">*</span></FormLabel>
                    <FormControl><Input type="number" step="0.01" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="quantity" render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("sellerListingEdit.fieldQuantity")}</FormLabel>
                    <FormControl><Input type="number" min="1" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
              <FormField control={form.control} name="description" render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("sellerListingEdit.fieldDescription")}</FormLabel>
                  <FormControl><Textarea rows={4} {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="notes" render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("sellerListingEdit.fieldNotes")} <span className="text-xs text-muted-foreground">{t("sellerListingEdit.fieldNotesHint")}</span></FormLabel>
                  <FormControl><Textarea rows={3} {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <Button type="submit" disabled={updateVehicle.isPending}>
                {updateVehicle.isPending ? t("sellerListingEdit.saving") : t("sellerListingEdit.saveChanges")}
              </Button>
            </CardContent>
          </Card>
        </form>
      </Form>
    </div>
  );
}
