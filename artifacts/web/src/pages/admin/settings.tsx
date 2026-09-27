import { useState } from "react";
import { useTranslation } from "react-i18next";
import { AdminLayout } from "@/components/admin-layout";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetPlatformSettings, getGetPlatformSettingsQueryKey,
  useUpdatePlatformSetting,
} from "@workspace/api-client-react";
import type { SettingEntry } from "@workspace/api-client-react";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Settings, Save, Plus } from "lucide-react";
import { Link } from "wouter";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

function SettingRow({ setting, onSave }: { setting: SettingEntry; onSave: (key: string, value: string) => void }) {
  const { t } = useTranslation();
  const [value, setValue] = useState(setting.value);
  const [dirty, setDirty] = useState(false);

  const handleChange = (v: string) => {
    setValue(v);
    setDirty(v !== setting.value);
  };

  return (
    <div className="flex items-start gap-4 py-4 border-b border-border last:border-0">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold font-mono">{setting.key}</p>
        </div>
        {setting.description && <p className="text-xs text-muted-foreground mt-0.5">{setting.description}</p>}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <Input
          className="w-64 text-sm"
          value={value}
          onChange={(e) => handleChange(e.target.value)}
        />
        {dirty && (
          <Button size="sm" onClick={() => { onSave(setting.key, value); setDirty(false); }}>
            <Save className="h-3.5 w-3.5 mr-1" /> {t("adminSettings.save")}
          </Button>
        )}
      </div>
    </div>
  );
}

export default function PlatformSettings() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [newKeyDialog, setNewKeyDialog] = useState(false);
  const [newKey, setNewKey] = useState("");
  const [newValue, setNewValue] = useState("");
  const [newDesc, setNewDesc] = useState("");

  const { data: settings, isLoading } = useGetPlatformSettings({
    query: { queryKey: getGetPlatformSettingsQueryKey() },
  });
  const updateMut = useUpdatePlatformSetting();

  const isAdmin = user?.role === "admin" || user?.role === "super_admin";
  if (!isAdmin) return <div className="flex items-center justify-center min-h-[60vh] text-muted-foreground">{t("adminSettings.accessDenied")}</div>;

  const invalidate = () => qc.invalidateQueries({ queryKey: getGetPlatformSettingsQueryKey() });

  const handleSave = (key: string, value: string) => {
    updateMut.mutate(
      { key, data: { value } },
      {
        onSuccess: () => { toast({ title: t("adminSettings.toastSaved") }); invalidate(); },
        onError: () => toast({ title: t("adminSettings.toastSaveFailed"), variant: "destructive" }),
      },
    );
  };

  const handleCreate = () => {
    if (!newKey || !newValue) return;
    updateMut.mutate(
      { key: newKey, data: { value: newValue, description: newDesc || undefined } },
      {
        onSuccess: () => {
          toast({ title: t("adminSettings.toastCreated") });
          invalidate();
          setNewKeyDialog(false);
          setNewKey(""); setNewValue(""); setNewDesc("");
        },
        onError: () => toast({ title: t("adminSettings.toastCreateFailed"), variant: "destructive" }),
      },
    );
  };

  return (
    <AdminLayout>
    <div className="p-6 lg:p-8 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-4 flex-wrap">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/admin/dashboard"><ArrowLeft className="h-4 w-4 mr-2" /> {t("dashboard.overview")}</Link>
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold flex items-center gap-2"><Settings className="h-6 w-6" /> {t("adminSettings.title")}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{t("adminSettings.subtitle")}</p>
        </div>
        <Button onClick={() => setNewKeyDialog(true)}>
          <Plus className="h-4 w-4 mr-2" /> {t("adminSettings.newSetting")}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("adminSettings.configTitle")}</CardTitle>
          <CardDescription>{t("adminSettings.configDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="p-0 px-6">
          {isLoading ? (
            <div className="space-y-4 py-4">
              {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12" />)}
            </div>
          ) : !settings || settings.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              {t("adminSettings.noSettings")}
            </p>
          ) : (
            settings.map((s) => (
              <SettingRow key={s.id} setting={s} onSave={handleSave} />
            ))
          )}
        </CardContent>
      </Card>

      <Dialog open={newKeyDialog} onOpenChange={setNewKeyDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("adminSettings.newSettingTitle")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">{t("adminSettings.fieldKey")}</label>
              <Input
                placeholder="e.g. platform.fee_percentage"
                value={newKey}
                onChange={(e) => setNewKey(e.target.value)}
                className="font-mono"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">{t("adminSettings.fieldValue")}</label>
              <Input placeholder="e.g. 5" value={newValue} onChange={(e) => setNewValue(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">{t("adminSettings.fieldDesc")} <span className="text-muted-foreground">{t("adminSettings.optional")}</span></label>
              <Input placeholder="What this setting controls" value={newDesc} onChange={(e) => setNewDesc(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewKeyDialog(false)}>{t("adminSettings.cancel")}</Button>
            <Button onClick={handleCreate} disabled={!newKey || !newValue || updateMut.isPending}>
              {updateMut.isPending ? t("adminSettings.saving") : t("adminSettings.createSetting")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
    </AdminLayout>
  );
}
