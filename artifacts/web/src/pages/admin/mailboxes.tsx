import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { AdminLayout } from "@/components/admin-layout";
import { useAuth } from "@/hooks/use-auth";
import { useAdminPermissions } from "@/hooks/use-admin-permissions";
import { customFetch } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Mail, Send, CheckCircle2, AlertTriangle, Clock, RefreshCw,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";

type ResendConfig = {
  resendConfigured: boolean;
  customDomain: boolean;
  fromAddress: string;
};

type SentEmail = {
  id: string;
  to: string[];
  subject: string;
  from: string;
  sentAt: string;
};

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return new Date(iso).toLocaleDateString();
}

export default function AdminMailboxes() {
  const { user } = useAuth();
  const { can } = useAdminPermissions();

  const isSuperAdmin = user?.role === "super_admin";
  const hasAccess = isSuperAdmin || can("manage_mailboxes");

  const [showCompose, setShowCompose] = useState(false);
  const [form, setForm] = useState({ to: "", subject: "", text: "", replyTo: "" });
  const [sentHistory, setSentHistory] = useState<SentEmail[]>([]);

  const { data: config, isLoading: configLoading } = useQuery<ResendConfig>({
    queryKey: ["mailboxes-config"],
    queryFn: () => customFetch("/api/mailboxes-config"),
    enabled: hasAccess,
  });

  const sendMutation = useMutation({
    mutationFn: (body: object) =>
      customFetch<{ id: string; sent: boolean; from: string; to: string[]; subject: string }>(
        "/api/mailboxes/send",
        { method: "POST", body: JSON.stringify(body) }
      ),
    onSuccess: (data) => {
      setSentHistory(h => [{
        id: data.id || crypto.randomUUID(),
        to: data.to,
        subject: data.subject,
        from: data.from,
        sentAt: new Date().toISOString(),
      }, ...h]);
      setShowCompose(false);
      setForm({ to: "", subject: "", text: "", replyTo: "" });
      toast({ title: "Email sent successfully" });
    },
    onError: (e: any) => toast({ title: "Failed to send email", description: e.message, variant: "destructive" }),
  });

  if (!hasAccess) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center h-64 text-muted-foreground">
          You don't have permission to access this section.
        </div>
      </AdminLayout>
    );
  }

  const canSend = config?.resendConfigured;

  return (
    <AdminLayout>
      <div className="max-w-3xl mx-auto px-6 py-8 space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <Mail className="h-6 w-6 text-primary" />
              Email
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Send emails to users via Resend
            </p>
          </div>
          <Button
            onClick={() => setShowCompose(true)}
            disabled={!canSend}
            title={!canSend ? "Resend API key not configured" : "Compose new email"}
          >
            <Send className="h-4 w-4 mr-2" /> Compose
          </Button>
        </div>

        {/* Resend status card */}
        <Card>
          <CardContent className="pt-5 pb-4">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-3 flex-1">
                <p className="text-sm font-medium">Resend Configuration</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground uppercase tracking-wider">API Key</p>
                    {configLoading ? (
                      <div className="h-5 w-24 bg-muted animate-pulse rounded" />
                    ) : (
                      <div className="flex items-center gap-1.5">
                        {config?.resendConfigured
                          ? <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                          : <AlertTriangle className="h-4 w-4 text-amber-500" />
                        }
                        <span className={config?.resendConfigured ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}>
                          {config?.resendConfigured ? "Configured" : "Not configured"}
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground uppercase tracking-wider">Domain</p>
                    {configLoading ? (
                      <div className="h-5 w-32 bg-muted animate-pulse rounded" />
                    ) : (
                      <div className="flex items-center gap-1.5">
                        {config?.customDomain
                          ? <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                          : <AlertTriangle className="h-4 w-4 text-amber-500" />
                        }
                        <span className={config?.customDomain ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}>
                          {config?.customDomain ? "Verified" : "Pending verification"}
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground uppercase tracking-wider">From Address</p>
                    {configLoading ? (
                      <div className="h-5 w-40 bg-muted animate-pulse rounded" />
                    ) : (
                      <span className="font-mono text-xs">{config?.fromAddress || "—"}</span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Warnings */}
            {!configLoading && !config?.resendConfigured && (
              <div className="mt-4 flex items-start gap-2 p-3 rounded-md bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-400 text-xs">
                <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                <span>Resend API key is missing or invalid. Go to the Replit Secrets panel and set <strong>RESEND_API_KEY</strong> to a valid key from <strong>app.resend.com/api-keys</strong>.</span>
              </div>
            )}
            {!configLoading && config?.resendConfigured && !config?.customDomain && (
              <div className="mt-4 flex items-start gap-2 p-3 rounded-md bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-400 text-xs">
                <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                <span>Domain not yet verified. Emails will be sent but may be marked as spam until DNS records are confirmed in Resend.</span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Sent history */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
              Sent this session
            </h2>
            {sentHistory.length > 0 && (
              <Button variant="ghost" size="sm" className="text-xs h-7" onClick={() => setSentHistory([])}>
                <RefreshCw className="h-3 w-3 mr-1" /> Clear
              </Button>
            )}
          </div>

          {sentHistory.length === 0 ? (
            <Card>
              <CardContent className="py-12 flex flex-col items-center justify-center text-muted-foreground gap-3">
                <Mail className="h-10 w-10 opacity-20" />
                <div className="text-center">
                  <p className="text-sm font-medium">No emails sent yet</p>
                  <p className="text-xs opacity-60 mt-1">Emails you send will appear here</p>
                </div>
                {canSend && (
                  <Button size="sm" variant="outline" onClick={() => setShowCompose(true)}>
                    <Send className="h-3.5 w-3.5 mr-1.5" /> Send your first email
                  </Button>
                )}
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {sentHistory.map((email) => (
                <Card key={email.id}>
                  <CardContent className="py-3 px-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1 space-y-0.5">
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                          <p className="text-sm font-medium truncate">{email.subject}</p>
                        </div>
                        <p className="text-xs text-muted-foreground pl-5">
                          To: {email.to.join(", ")}
                        </p>
                        <p className="text-xs text-muted-foreground pl-5">
                          From: {email.from}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground shrink-0">
                        <Clock className="h-3 w-3" />
                        {timeAgo(email.sentAt)}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Compose dialog */}
      <Dialog open={showCompose} onOpenChange={setShowCompose}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Send className="h-4 w-4 text-primary" /> Compose Email
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>From</Label>
              <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-muted text-sm font-mono">
                {config?.fromAddress || "support@nextcarmarket.com"}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="to">To <span className="text-destructive">*</span></Label>
              <Input
                id="to"
                type="email"
                placeholder="recipient@example.com"
                value={form.to}
                onChange={(e) => setForm(f => ({ ...f, to: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="replyTo">Reply-To <span className="text-muted-foreground text-xs">(optional)</span></Label>
              <Input
                id="replyTo"
                type="email"
                placeholder="replyto@example.com"
                value={form.replyTo}
                onChange={(e) => setForm(f => ({ ...f, replyTo: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="subject">Subject <span className="text-destructive">*</span></Label>
              <Input
                id="subject"
                placeholder="Email subject"
                value={form.subject}
                onChange={(e) => setForm(f => ({ ...f, subject: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="text">Message <span className="text-destructive">*</span></Label>
              <Textarea
                id="text"
                placeholder="Write your message here…"
                rows={6}
                value={form.text}
                onChange={(e) => setForm(f => ({ ...f, text: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCompose(false)}>Cancel</Button>
            <Button
              onClick={() => sendMutation.mutate({
                to: form.to,
                subject: form.subject,
                text: form.text,
                replyTo: form.replyTo || undefined,
              })}
              disabled={!form.to || !form.subject || !form.text || sendMutation.isPending}
            >
              <Send className="h-4 w-4 mr-2" />
              {sendMutation.isPending ? "Sending…" : "Send Email"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
