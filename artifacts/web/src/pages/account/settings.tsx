import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useTranslation } from "react-i18next";
import { customFetch } from "@workspace/api-client-react";
import { toast } from "sonner";
import { DashboardLayout } from "@/components/dashboard-layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Globe, User } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { getGetCurrentUserQueryKey } from "@workspace/api-client-react";

const LANGUAGES = [
  { code: "en", label: "English",   flag: "🇬🇧" },
  { code: "zh", label: "中文",       flag: "🇨🇳" },
  { code: "es", label: "Español",   flag: "🇪🇸" },
  { code: "fr", label: "Français",  flag: "🇫🇷" },
  { code: "ar", label: "العربية",   flag: "🇦🇪" },
  { code: "ru", label: "Русский",   flag: "🇷🇺" },
  { code: "pt", label: "Português", flag: "🇧🇷" },
  { code: "de", label: "Deutsch",   flag: "🇩🇪" },
  { code: "ja", label: "日本語",     flag: "🇯🇵" },
  { code: "ko", label: "한국어",     flag: "🇰🇷" },
];

export default function AccountSettings() {
  const { user, setSession } = useAuth();
  const { i18n } = useTranslation();
  const queryClient = useQueryClient();

  const [firstName, setFirstName] = useState(user?.firstName ?? "");
  const [lastName, setLastName]   = useState(user?.lastName  ?? "");
  const [country, setCountry]     = useState(user?.country   ?? "");
  const [saving, setSaving]       = useState(false);

  if (!user) return null;

  async function saveProfile() {
    setSaving(true);
    try {
      const updated = await customFetch<any>("/api/auth/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: firstName.trim() || undefined,
          lastName:  lastName.trim()  || undefined,
          country:   country.trim()   || null,
        }),
      });
      queryClient.setQueryData(getGetCurrentUserQueryKey(), updated);
      toast.success("Profile updated.");
    } catch {
      toast.error("Failed to save profile.");
    } finally {
      setSaving(false);
    }
  }

  async function saveLanguage(code: string) {
    i18n.changeLanguage(code);          // immediate UI feedback
    try {
      await customFetch<any>("/api/auth/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preferredLanguage: code }),
      });
      // Refresh cached user so preferredLanguage is up to date
      queryClient.invalidateQueries({ queryKey: getGetCurrentUserQueryKey() });
    } catch {
      // Non-critical — localStorage already saved it via i18n hook
    }
  }

  return (
    <DashboardLayout>
      <div className="p-4 sm:p-6 max-w-2xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-display font-bold">Account Settings</h1>
          <p className="text-muted-foreground text-sm mt-1">Manage your profile and preferences.</p>
        </div>

        {/* ── Language preference ─────────────────────────────────────────── */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Globe className="h-4 w-4" /> Language
            </CardTitle>
            <CardDescription>
              Your preferred language is saved to your account and applied on every device you sign in from.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Select
              value={i18n.language ?? "en"}
              onValueChange={saveLanguage}
            >
              <SelectTrigger className="w-56 h-10">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LANGUAGES.map((l) => (
                  <SelectItem key={l.code} value={l.code}>
                    <span className="mr-2">{l.flag}</span>
                    {l.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        {/* ── Profile info ────────────────────────────────────────────────── */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <User className="h-4 w-4" /> Profile
            </CardTitle>
            <CardDescription>Your name and location shown to counterparties.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>First name</Label>
                <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} className="h-10" />
              </div>
              <div className="space-y-1.5">
                <Label>Last name</Label>
                <Input value={lastName} onChange={(e) => setLastName(e.target.value)} className="h-10" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Country</Label>
              <Input
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                placeholder="e.g. Nigeria"
                className="h-10"
              />
            </div>
            <div className="flex items-center gap-3 pt-1">
              <Button onClick={saveProfile} disabled={saving} className="gap-2">
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                Save changes
              </Button>
              <span className="text-xs text-muted-foreground">{user.email}</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
