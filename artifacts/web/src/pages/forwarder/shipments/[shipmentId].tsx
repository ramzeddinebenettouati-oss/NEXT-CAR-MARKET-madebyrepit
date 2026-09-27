import { useTranslation } from "react-i18next";
import { useFormatters } from "@/hooks/use-formatters";
import { useParams, useLocation, Link } from "wouter";
import { useAdminPermissions } from "@/hooks/use-admin-permissions";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetShipment,
  getGetShipmentQueryKey,
  useUpdateShipmentStatus,
  useListShipmentDocuments,
  getListShipmentDocumentsQueryKey,
  useUploadShipmentDocument,
  useDeleteShipmentDocument,
  useRequestUploadUrl,
  type ShipmentTrackingEvent,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import {
  ArrowLeft,
  Truck,
  CheckCircle2,
  Circle,
  Clock,
  FileText,
  Upload,
  Trash2,
  ExternalLink,
  Package,
  MessageSquare,
} from "lucide-react";
import { useState } from "react";
import { ObjectUploader } from "@workspace/object-storage-web";

const SHIPMENT_STAGES = [
  { key: "awaiting_quote",            labelKey: "stageAwaitingQuote" },
  { key: "quote_submitted",           labelKey: "stageQuoteSubmitted" },
  { key: "quote_accepted",            labelKey: "stageQuoteAccepted" },
  { key: "container_booked",          labelKey: "stageContainerBooked" },
  { key: "vehicle_collected",         labelKey: "stageVehicleCollected" },
  { key: "at_origin_port",            labelKey: "stageAtOriginPort" },
  { key: "loaded_on_vessel",          labelKey: "stageLoadedOnVessel" },
  { key: "in_transit",                labelKey: "stageInTransit" },
  { key: "arrived_destination_port",  labelKey: "stageArrivedPort" },
  { key: "customs_clearance",         labelKey: "stageCustomsClearance" },
  { key: "delivered",                 labelKey: "stageDelivered" },
] as const;

type ShipmentStatusKey = (typeof SHIPMENT_STAGES)[number]["key"];

const STAGE_INDEX = Object.fromEntries(SHIPMENT_STAGES.map((s, i) => [s.key, i])) as Record<ShipmentStatusKey, number>;

const DOCUMENT_TYPES = [
  { key: "bill_of_lading",        labelKey: "docBillOfLading" },
  { key: "commercial_invoice",    labelKey: "docCommercialInvoice" },
  { key: "packing_list",          labelKey: "docPackingList" },
  { key: "insurance_certificate", labelKey: "docInsuranceCert" },
  { key: "export_declaration",    labelKey: "docExportDeclaration" },
  { key: "arrival_notice",        labelKey: "docArrivalNotice" },
] as const;

function ShipmentTimeline({ currentStatus, tracking }: {
  currentStatus: string;
  tracking: ShipmentTrackingEvent[];
}) {
  const { t } = useTranslation();
  const { formatDateTime } = useFormatters();
  const trackingMap = new Map(tracking.map(te => [te.status, te]));
  const currentIndex = STAGE_INDEX[currentStatus as ShipmentStatusKey] ?? -1;

  return (
    <div className="space-y-0">
      {SHIPMENT_STAGES.map((stage, i) => {
        const isCompleted = i < currentIndex;
        const isCurrent = i === currentIndex;
        const isPending = i > currentIndex;
        const event = trackingMap.get(stage.key);

        return (
          <div key={stage.key} className="flex gap-4">
            <div className="flex flex-col items-center">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 border-2 transition-all ${
                isCompleted
                  ? "bg-emerald-500 border-emerald-500 text-white"
                  : isCurrent
                  ? "bg-primary border-primary text-primary-foreground animate-pulse"
                  : "bg-transparent border-muted-foreground/30 text-muted-foreground/30"
              }`}>
                {isCompleted ? (
                  <CheckCircle2 className="h-4 w-4" />
                ) : isCurrent ? (
                  <Truck className="h-4 w-4" />
                ) : (
                  <Circle className="h-4 w-4" />
                )}
              </div>
              {i < SHIPMENT_STAGES.length - 1 && (
                <div className={`w-0.5 flex-1 my-1 min-h-[24px] ${isCompleted ? "bg-emerald-500/50" : "bg-muted"}`} />
              )}
            </div>

            <div className={`pb-6 flex-1 min-w-0 ${i === SHIPMENT_STAGES.length - 1 ? "pb-0" : ""}`}>
              <p className={`font-medium text-sm ${isPending ? "text-muted-foreground/50" : isCurrent ? "text-primary" : "text-foreground"}`}>
                {t(`forwarderShipments.${stage.labelKey}` as any)}
                {isCurrent && <span className="ml-2 text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">{t("forwarderShipments.current")}</span>}
              </p>
              {event && (
                <div className="mt-1">
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {formatDateTime(event.createdAt)}
                    {event.actorName && <span>— by {event.actorName}</span>}
                  </p>
                  {event.note && (
                    <p className="text-xs text-muted-foreground italic mt-0.5">"{event.note}"</p>
                  )}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function DocumentUploadPanel({ shipmentId }: { shipmentId: string }) {
  const { t } = useTranslation();
  const { formatDate } = useFormatters();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const requestUploadUrl = useRequestUploadUrl();
  const uploadDocument = useUploadShipmentDocument();
  const deleteDocument = useDeleteShipmentDocument();

  const [docType, setDocType] = useState<string>("");
  const [pendingObjectPath, setPendingObjectPath] = useState<string | null>(null);
  const [pendingFileName, setPendingFileName] = useState<string | null>(null);
  const [uploadedPath, setUploadedPath] = useState<string | null>(null);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);

  const { data: docs = [], isLoading } = useListShipmentDocuments(shipmentId, {
    query: { queryKey: getListShipmentDocumentsQueryKey(shipmentId) },
  });

  const makeUploadParams = async (file: any) => {
    const result = await requestUploadUrl.mutateAsync({
      data: { name: file.name, size: file.size, contentType: file.type || "application/octet-stream" },
    });
    setPendingObjectPath(result.objectPath);
    setPendingFileName(file.name);
    return {
      method: "PUT" as const,
      url: result.uploadURL,
      headers: { "Content-Type": file.type || "application/octet-stream" },
    };
  };

  const handleUpload = () => {
    if (!docType || !uploadedPath || !uploadedFileName) {
      toast({ title: t("forwarderShipments.missingFields"), description: t("forwarderShipments.selectDocType"), variant: "destructive" });
      return;
    }
    const docLabel = DOCUMENT_TYPES.find(d => d.key === docType);
    uploadDocument.mutate(
      { shipmentId, data: { documentType: docType as any, objectPath: uploadedPath, fileName: uploadedFileName } },
      {
        onSuccess: () => {
          toast({ title: t("forwarderShipments.toastDocUploaded"), description: docLabel ? t(`forwarderShipments.${docLabel.labelKey}` as any) : "" });
          setDocType("");
          setUploadedPath(null);
          setUploadedFileName(null);
          setPendingObjectPath(null);
          setPendingFileName(null);
          queryClient.invalidateQueries({ queryKey: getListShipmentDocumentsQueryKey(shipmentId) });
        },
        onError: (err: any) => toast({ title: t("forwarderShipments.toastUploadFailed"), description: err?.message, variant: "destructive" }),
      },
    );
  };

  const handleDelete = (documentId: string) => {
    deleteDocument.mutate(
      { shipmentId, documentId },
      {
        onSuccess: () => {
          toast({ title: t("forwarderShipments.toastDocDeleted") });
          queryClient.invalidateQueries({ queryKey: getListShipmentDocumentsQueryKey(shipmentId) });
        },
        onError: (err: any) => toast({ title: t("forwarderShipments.toastFailed"), description: err?.message, variant: "destructive" }),
      },
    );
  };

  return (
    <div className="space-y-4">
      <div className="p-4 rounded-lg border border-border bg-muted/10 space-y-3">
        <p className="text-sm font-medium">{t("forwarderShipments.uploadNewDoc")}</p>
        <div className="grid sm:grid-cols-2 gap-3">
          <Select value={docType} onValueChange={setDocType}>
            <SelectTrigger>
              <SelectValue placeholder={t("forwarderShipments.docTypePlaceholder")} />
            </SelectTrigger>
            <SelectContent>
              {DOCUMENT_TYPES.map(d => (
                <SelectItem key={d.key} value={d.key}>{t(`forwarderShipments.${d.labelKey}` as any)}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {uploadedPath ? (
            <div className="flex items-center gap-2 text-sm text-emerald-500 border border-emerald-500/30 rounded-md px-3 py-2">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              <span className="truncate">{uploadedFileName}</span>
              <button
                type="button"
                onClick={() => { setUploadedPath(null); setUploadedFileName(null); }}
                className="ml-auto text-muted-foreground hover:text-foreground"
              >
                ×
              </button>
            </div>
          ) : (
            <ObjectUploader
              maxNumberOfFiles={1}
              maxFileSize={20 * 1024 * 1024}
              onGetUploadParameters={makeUploadParams}
              onComplete={() => {
                if (pendingObjectPath) {
                  setUploadedPath(pendingObjectPath);
                  setUploadedFileName(pendingFileName);
                  setPendingObjectPath(null);
                  setPendingFileName(null);
                }
              }}
              buttonClassName="flex items-center justify-center gap-2 w-full rounded-md border border-dashed border-input bg-background text-sm hover:bg-muted transition-colors px-3 py-2"
            >
              <Upload className="h-4 w-4" /> {t("forwarderShipments.chooseFile")}
            </ObjectUploader>
          )}
        </div>
        <Button size="sm" onClick={handleUpload} disabled={!docType || !uploadedPath || uploadDocument.isPending}>
          {uploadDocument.isPending ? t("forwarderShipments.uploading") : t("forwarderShipments.saveDocument")}
        </Button>
      </div>

      {isLoading ? (
        <Skeleton className="h-24" />
      ) : docs.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-4">{t("forwarderShipments.noDocs")}</p>
      ) : (
        <div className="space-y-2">
          {docs.map(doc => {
            const docMeta = DOCUMENT_TYPES.find(d => d.key === doc.documentType);
            return (
              <div key={doc.id} className="flex items-center gap-3 p-3 rounded-lg border border-border bg-background/50">
                <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{doc.fileName}</p>
                  <p className="text-xs text-muted-foreground">
                    {docMeta ? t(`forwarderShipments.${docMeta.labelKey}` as any) : doc.documentType}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {doc.visibleToBuyer ? t("forwarderShipments.visibleToBuyer") : t("forwarderShipments.forwarderOnly")}
                    {" · "}
                    {formatDate(doc.createdAt)}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <a
                    href={`/api/storage/objects/${encodeURIComponent(doc.objectPath.replace(/^\/objects\//, ""))}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:text-primary/80"
                  >
                    <ExternalLink className="h-4 w-4" />
                  </a>
                  <button
                    type="button"
                    onClick={() => handleDelete(doc.id)}
                    className="text-muted-foreground hover:text-destructive transition-colors"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function ForwarderShipmentDetail() {
  const { t } = useTranslation();
  const { formatDate } = useFormatters();
  const { shipmentId } = useParams<{ shipmentId: string }>();
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const updateStatus = useUpdateShipmentStatus();
  const { can } = useAdminPermissions();
  const isSuperAdmin = user?.role === "super_admin";
  const isAdmin = user?.role === "admin";
  const canViewMessages = isSuperAdmin || isAdmin || can("messages_management");

  const [selectedStatus, setSelectedStatus] = useState<string>("");
  const [statusNote, setStatusNote] = useState("");

  const { data: shipment, isLoading } = useGetShipment(shipmentId, {
    query: { queryKey: getGetShipmentQueryKey(shipmentId) },
  });

  if (isLoading) {
    return (
      <div className="p-6 lg:p-8 max-w-4xl mx-auto space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  if (!shipment) {
    return (
      <div className="p-6 lg:p-8 max-w-4xl mx-auto">
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Package className="h-10 w-10 text-muted-foreground mb-3 opacity-20" />
          <p className="text-muted-foreground font-medium">{t("forwarderShipments.notFound")}</p>
          <Button className="mt-4" variant="outline" onClick={() => setLocation("/forwarder/shipments")}>
            <ArrowLeft className="h-4 w-4 mr-2" /> {t("forwarderShipments.back")}
          </Button>
        </div>
      </div>
    );
  }

  const currentIndex = STAGE_INDEX[shipment.status as ShipmentStatusKey] ?? -1;
  const nextStages = SHIPMENT_STAGES.slice(currentIndex + 1);

  const handleUpdateStatus = () => {
    if (!selectedStatus) return;
    updateStatus.mutate(
      { shipmentId: shipment.id, data: { status: selectedStatus as any, note: statusNote || undefined } },
      {
        onSuccess: () => {
          toast({ title: t("forwarderShipments.toastStatusUpdated"), description: `${selectedStatus.replace(/_/g, " ")}` });
          setSelectedStatus("");
          setStatusNote("");
          queryClient.invalidateQueries({ queryKey: getGetShipmentQueryKey(shipment.id) });
        },
        onError: (err: any) => toast({ title: t("forwarderShipments.toastFailed"), description: err?.message, variant: "destructive" }),
      },
    );
  };

  return (
    <div className="p-6 lg:p-8 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => setLocation("/forwarder/shipments")}>
          <ArrowLeft className="h-4 w-4 mr-2" /> {t("forwarderShipments.back")}
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold tracking-tight">{t("forwarderShipments.shipmentTitle")}</h1>
          <p className="text-sm text-muted-foreground font-mono">{shipment.id.slice(0, 16)}…</p>
        </div>
        <span className="inline-flex items-center px-3 py-1.5 rounded-full text-sm font-semibold border bg-primary/10 text-primary border-primary/30">
          {shipment.status.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}
        </span>
      </div>

      <Card className="border-border">
        <CardContent className="pt-5">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
            <div>
              <p className="text-xs text-muted-foreground">{t("forwarderShipments.order")}</p>
              <p className="font-mono font-medium">{shipment.orderId.slice(0, 12)}…</p>
            </div>
            {shipment.vehicleTitle && (
              <div>
                <p className="text-xs text-muted-foreground">{t("forwarderShipments.vehicle")}</p>
                <p className="font-medium truncate">{shipment.vehicleTitle}</p>
              </div>
            )}
            {shipment.buyerName && (
              <div>
                <p className="text-xs text-muted-foreground">{t("forwarderShipments.buyer")}</p>
                <p className="font-medium">{shipment.buyerName}</p>
              </div>
            )}
            <div>
              <p className="text-xs text-muted-foreground">{t("forwarderShipments.documents")}</p>
              <p className="font-medium">{shipment.documentCount}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{t("forwarderShipments.created")}</p>
              <p>{formatDate(shipment.createdAt)}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {nextStages.length > 0 && (
        <Card className="border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Truck className="h-4 w-4 text-primary" /> {t("forwarderShipments.advanceStatus")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-col sm:flex-row gap-3">
              <Select value={selectedStatus} onValueChange={setSelectedStatus}>
                <SelectTrigger className="sm:w-64">
                  <SelectValue placeholder={t("forwarderShipments.nextStatus")} />
                </SelectTrigger>
                <SelectContent>
                  {nextStages.map(s => (
                    <SelectItem key={s.key} value={s.key}>{t(`forwarderShipments.${s.labelKey}` as any)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <input
                type="text"
                className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
                placeholder={t("forwarderShipments.statusNote")}
                value={statusNote}
                onChange={e => setStatusNote(e.target.value)}
              />
              <Button onClick={handleUpdateStatus} disabled={!selectedStatus || updateStatus.isPending}>
                {updateStatus.isPending ? t("forwarderShipments.updating") : t("forwarderShipments.update")}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="h-4 w-4" /> {t("forwarderShipments.shipmentTimeline")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ShipmentTimeline currentStatus={shipment.status} tracking={shipment.tracking} />
        </CardContent>
      </Card>

      <Card className="border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="h-4 w-4" /> {t("forwarderShipments.shippingDocs")}
          </CardTitle>
          <p className="text-sm text-muted-foreground mt-1">
            {t("forwarderShipments.shippingDocsDesc")}
          </p>
        </CardHeader>
        <CardContent>
          <DocumentUploadPanel shipmentId={shipment.id} />
        </CardContent>
      </Card>

      {canViewMessages && (
        <div className="flex justify-end">
          <Button variant="outline" asChild>
            <Link href={`/admin/messages?referenceType=shipment&referenceId=${shipment.id}`}>
              <MessageSquare className="h-4 w-4 mr-2" />
              View Related Messages
            </Link>
          </Button>
        </div>
      )}
    </div>
  );
}
