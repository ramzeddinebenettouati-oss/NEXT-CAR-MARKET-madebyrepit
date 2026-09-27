import { useState } from "react";
import { useTranslation } from "react-i18next";
import { AdminLayout } from "@/components/admin-layout";
import { useAuth } from "@/hooks/use-auth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Globe, Anchor, BadgeDollarSign, Plus, Pencil, Trash2 } from "lucide-react";
import { Link } from "wouter";
import { customFetch } from "@workspace/api-client-react";

async function apiFetch(path: string, opts?: RequestInit) {
  return customFetch(`/api${path}`, {
    ...opts,
    headers: { "Content-Type": "application/json", ...(opts?.headers ?? {}) },
  });
}

type Country  = { id: string; name: string; code: string; region: string | null; isActive: boolean };
type Port     = { id: string; name: string; code: string; countryId: string | null; city: string | null; portType: string; isActive: boolean };
type Currency = { id: string; name: string; code: string; symbol: string; isActive: boolean };

function useRefData<T>(key: string, path: string) {
  return useQuery<T[]>({ queryKey: [key], queryFn: () => apiFetch(path) as Promise<T[]> });
}

function ActiveBadge({ value }: { value: boolean }) {
  const { t } = useTranslation();
  return <Badge variant={value ? "default" : "secondary"} className="text-xs">{value ? t("adminReference.statusActive") : t("adminReference.statusInactive")}</Badge>;
}

function CountriesTab() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data, isLoading } = useRefData<Country>("ref_countries", "/admin/reference/countries");
  const [form, setForm] = useState<Partial<Country> | null>(null);
  const [isNew, setIsNew] = useState(false);

  const save = useMutation({
    mutationFn: (v: Partial<Country>) =>
      isNew
        ? apiFetch("/admin/reference/countries", { method: "POST", body: JSON.stringify(v) })
        : apiFetch(`/admin/reference/countries/${v.id}`, { method: "PATCH", body: JSON.stringify(v) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["ref_countries"] }); setForm(null); toast({ title: isNew ? t("adminReference.addCountryTitle") : t("adminReference.editCountryTitle") }); },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const del = useMutation({
    mutationFn: (id: string) => apiFetch(`/admin/reference/countries/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["ref_countries"] }); toast({ title: "Country deleted" }); },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  return (
    <>
      <div className="flex justify-end mb-3">
        <Button size="sm" onClick={() => { setIsNew(true); setForm({ isActive: true }); }}>
          <Plus className="h-4 w-4 mr-1" /> {t("adminReference.addCountry")}
        </Button>
      </div>
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("adminReference.colName")}</TableHead>
              <TableHead>{t("adminReference.colCode")}</TableHead>
              <TableHead>{t("adminReference.colRegion")}</TableHead>
              <TableHead>{t("adminReference.colStatus")}</TableHead>
              <TableHead className="text-right">{t("adminReference.colStatus")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? Array.from({ length: 5 }).map((_, i) => (
              <TableRow key={i}>{Array.from({ length: 5 }).map((__, j) => <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>)}</TableRow>
            )) : (data ?? []).map(c => (
              <TableRow key={c.id}>
                <TableCell className="font-medium">{c.name}</TableCell>
                <TableCell className="font-mono text-xs">{c.code}</TableCell>
                <TableCell className="text-sm">{c.region ?? "—"}</TableCell>
                <TableCell><ActiveBadge value={c.isActive} /></TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setIsNew(false); setForm(c); }}><Pencil className="h-3.5 w-3.5" /></Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => del.mutate(c.id)}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <Dialog open={!!form} onOpenChange={(o) => { if (!o) setForm(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{isNew ? t("adminReference.addCountryTitle") : t("adminReference.editCountryTitle")}</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div><Label>{t("adminReference.fieldName")}</Label><Input value={form?.name ?? ""} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div>
            <div><Label>{t("adminReference.fieldCode")}</Label><Input value={form?.code ?? ""} maxLength={4} onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))} /></div>
            <div><Label>{t("adminReference.fieldRegion")}</Label><Input value={form?.region ?? ""} onChange={e => setForm(f => ({ ...f, region: e.target.value }))} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setForm(null)}>{t("adminReference.cancel")}</Button>
            <Button disabled={save.isPending} onClick={() => form && save.mutate(form)}>{t("adminReference.save")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function PortsTab() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data, isLoading } = useRefData<Port>("ref_ports", "/admin/reference/ports");
  const [form, setForm] = useState<Partial<Port> | null>(null);
  const [isNew, setIsNew] = useState(false);

  const save = useMutation({
    mutationFn: (v: Partial<Port>) =>
      isNew
        ? apiFetch("/admin/reference/ports", { method: "POST", body: JSON.stringify(v) })
        : apiFetch(`/admin/reference/ports/${v.id}`, { method: "PATCH", body: JSON.stringify(v) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["ref_ports"] }); setForm(null); toast({ title: isNew ? t("adminReference.addPortTitle") : t("adminReference.editPortTitle") }); },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const del = useMutation({
    mutationFn: (id: string) => apiFetch(`/admin/reference/ports/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["ref_ports"] }); toast({ title: "Port deleted" }); },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  return (
    <>
      <div className="flex justify-end mb-3">
        <Button size="sm" onClick={() => { setIsNew(true); setForm({ portType: "sea", isActive: true }); }}>
          <Plus className="h-4 w-4 mr-1" /> {t("adminReference.addPort")}
        </Button>
      </div>
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("adminReference.colName")}</TableHead>
              <TableHead>{t("adminReference.colCode")}</TableHead>
              <TableHead>{t("adminReference.colCity")}</TableHead>
              <TableHead>{t("adminReference.colType")}</TableHead>
              <TableHead>{t("adminReference.colStatus")}</TableHead>
              <TableHead className="text-right">{t("adminReference.colStatus")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? Array.from({ length: 5 }).map((_, i) => (
              <TableRow key={i}>{Array.from({ length: 6 }).map((__, j) => <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>)}</TableRow>
            )) : (data ?? []).map(p => (
              <TableRow key={p.id}>
                <TableCell className="font-medium">{p.name}</TableCell>
                <TableCell className="font-mono text-xs">{p.code}</TableCell>
                <TableCell className="text-sm">{p.city ?? "—"}</TableCell>
                <TableCell className="text-sm capitalize">{p.portType}</TableCell>
                <TableCell><ActiveBadge value={p.isActive} /></TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setIsNew(false); setForm(p); }}><Pencil className="h-3.5 w-3.5" /></Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => del.mutate(p.id)}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <Dialog open={!!form} onOpenChange={(o) => { if (!o) setForm(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{isNew ? t("adminReference.addPortTitle") : t("adminReference.editPortTitle")}</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div><Label>{t("adminReference.fieldName")}</Label><Input value={form?.name ?? ""} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div>
            <div><Label>{t("adminReference.fieldLocode")}</Label><Input value={form?.code ?? ""} maxLength={10} onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))} /></div>
            <div><Label>{t("adminReference.fieldCity")}</Label><Input value={form?.city ?? ""} onChange={e => setForm(f => ({ ...f, city: e.target.value }))} /></div>
            <div>
              <Label>{t("adminReference.fieldPortType")}</Label>
              <Select value={form?.portType ?? "sea"} onValueChange={v => setForm(f => ({ ...f, portType: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["sea", "air", "land", "rail"].map(t2 => <SelectItem key={t2} value={t2}>{t2.charAt(0).toUpperCase() + t2.slice(1)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setForm(null)}>{t("adminReference.cancel")}</Button>
            <Button disabled={save.isPending} onClick={() => form && save.mutate(form)}>{t("adminReference.save")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function CurrenciesTab() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data, isLoading } = useRefData<Currency>("ref_currencies", "/admin/reference/currencies");
  const [form, setForm] = useState<Partial<Currency> | null>(null);
  const [isNew, setIsNew] = useState(false);

  const save = useMutation({
    mutationFn: (v: Partial<Currency>) =>
      isNew
        ? apiFetch("/admin/reference/currencies", { method: "POST", body: JSON.stringify(v) })
        : apiFetch(`/admin/reference/currencies/${v.id}`, { method: "PATCH", body: JSON.stringify(v) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["ref_currencies"] }); setForm(null); toast({ title: isNew ? t("adminReference.addCurrencyTitle") : t("adminReference.editCurrencyTitle") }); },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const del = useMutation({
    mutationFn: (id: string) => apiFetch(`/admin/reference/currencies/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["ref_currencies"] }); toast({ title: "Currency deleted" }); },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  return (
    <>
      <div className="flex justify-end mb-3">
        <Button size="sm" onClick={() => { setIsNew(true); setForm({ isActive: true }); }}>
          <Plus className="h-4 w-4 mr-1" /> {t("adminReference.addCurrency")}
        </Button>
      </div>
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("adminReference.colName")}</TableHead>
              <TableHead>{t("adminReference.colCode")}</TableHead>
              <TableHead>{t("adminReference.colSymbol")}</TableHead>
              <TableHead>{t("adminReference.colStatus")}</TableHead>
              <TableHead className="text-right">{t("adminReference.colStatus")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? Array.from({ length: 5 }).map((_, i) => (
              <TableRow key={i}>{Array.from({ length: 5 }).map((__, j) => <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>)}</TableRow>
            )) : (data ?? []).map(c => (
              <TableRow key={c.id}>
                <TableCell className="font-medium">{c.name}</TableCell>
                <TableCell className="font-mono text-xs">{c.code}</TableCell>
                <TableCell className="text-sm">{c.symbol}</TableCell>
                <TableCell><ActiveBadge value={c.isActive} /></TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setIsNew(false); setForm(c); }}><Pencil className="h-3.5 w-3.5" /></Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => del.mutate(c.id)}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <Dialog open={!!form} onOpenChange={(o) => { if (!o) setForm(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{isNew ? t("adminReference.addCurrencyTitle") : t("adminReference.editCurrencyTitle")}</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div><Label>{t("adminReference.fieldName")}</Label><Input value={form?.name ?? ""} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div>
            <div><Label>{t("adminReference.fieldIsoCode")}</Label><Input value={form?.code ?? ""} maxLength={3} onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))} /></div>
            <div><Label>{t("adminReference.fieldSymbol")}</Label><Input value={form?.symbol ?? ""} maxLength={5} onChange={e => setForm(f => ({ ...f, symbol: e.target.value }))} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setForm(null)}>{t("adminReference.cancel")}</Button>
            <Button disabled={save.isPending} onClick={() => form && save.mutate(form)}>{t("adminReference.save")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default function AdminReference() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin" || user?.role === "super_admin";
  if (!isAdmin) return <div className="flex items-center justify-center min-h-[60vh] text-muted-foreground">{t("adminReference.accessDenied")}</div>;

  return (
    <AdminLayout>
      <div className="p-6 lg:p-8 max-w-5xl mx-auto space-y-6">
        <div className="flex items-center gap-4 flex-wrap">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/admin/dashboard"><ArrowLeft className="h-4 w-4 mr-2" /> {t("dashboard.overview")}</Link>
          </Button>
          <div className="flex-1">
            <h1 className="text-2xl font-bold flex items-center gap-2"><Globe className="h-6 w-6" /> {t("adminReference.title")}</h1>
            <p className="text-sm text-muted-foreground mt-0.5">{t("adminReference.subtitle")}</p>
          </div>
        </div>

        <Tabs defaultValue="countries">
          <TabsList>
            <TabsTrigger value="countries" className="gap-1.5"><Globe className="h-3.5 w-3.5" /> {t("adminReference.tabCountries")}</TabsTrigger>
            <TabsTrigger value="ports" className="gap-1.5"><Anchor className="h-3.5 w-3.5" /> {t("adminReference.tabPorts")}</TabsTrigger>
            <TabsTrigger value="currencies" className="gap-1.5"><BadgeDollarSign className="h-3.5 w-3.5" /> {t("adminReference.tabCurrencies")}</TabsTrigger>
          </TabsList>
          <TabsContent value="countries" className="mt-4"><CountriesTab /></TabsContent>
          <TabsContent value="ports" className="mt-4"><PortsTab /></TabsContent>
          <TabsContent value="currencies" className="mt-4"><CurrenciesTab /></TabsContent>
        </Tabs>
      </div>
    </AdminLayout>
  );
}
