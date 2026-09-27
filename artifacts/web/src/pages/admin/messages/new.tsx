import { useState, useEffect, useRef } from "react";
import { Link, useLocation, useSearch } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AdminLayout } from "@/components/admin-layout";
import { useAdminPermissions } from "@/hooks/use-admin-permissions";
import { useAuth } from "@/hooks/use-auth";
import { customFetch } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { ArrowLeft, Send, Search, User, CheckCircle2 } from "lucide-react";

type AdminUser = { id: string; name: string; email: string; role: string };
type ReferenceResult = { id: string; number: string; label: string };
type CreateResult = { conversation: { id: string }; message: { id: string } };

export default function AdminMessagesNew() {
  const { user } = useAuth();
  const { can } = useAdminPermissions();
  const [, navigate] = useLocation();
  const searchStr = useSearch();
  const qc = useQueryClient();

  const isSuperAdmin = user?.role === "super_admin";
  const hasAccess = isSuperAdmin || can("messages_management");

  // Pre-fill from URL params (e.g. from "View Related Messages" buttons)
  const urlParams = new URLSearchParams(searchStr);
  const [subject, setSubject] = useState(urlParams.get("subject") ?? "");
  const [referenceType, setReferenceType] = useState(urlParams.get("referenceType") ?? "order");
  const [referenceId, setReferenceId] = useState(urlParams.get("referenceId") ?? "");
  const [referenceNumber, setReferenceNumber] = useState(urlParams.get("referenceNumber") ?? "");
  const [referenceResolved, setReferenceResolved] = useState<ReferenceResult | null>(null);
  const [body, setBody] = useState("");

  // Recipient picker state
  const [recipientQuery, setRecipientQuery] = useState("");
  const [selectedRecipient, setSelectedRecipient] = useState<AdminUser | null>(null);
  const [recipientDropdownOpen, setRecipientDropdownOpen] = useState(false);
  const recipientRef = useRef<HTMLDivElement>(null);

  // Reference lookup state
  const [refQuery, setRefQuery] = useState(urlParams.get("referenceNumber") ?? "");
  const [refDropdownOpen, setRefDropdownOpen] = useState(false);
  const refInputRef = useRef<HTMLDivElement>(null);

  // If URL provided referenceId + referenceNumber, mark it as resolved immediately
  useEffect(() => {
    if (urlParams.get("referenceId") && urlParams.get("referenceNumber")) {
      setReferenceResolved({
        id: urlParams.get("referenceId")!,
        number: urlParams.get("referenceNumber")!,
        label: urlParams.get("referenceNumber")!,
      });
    }
  }, []);

  // Auto-generate subject when reference changes
  useEffect(() => {
    if (!urlParams.get("subject") && referenceResolved) {
      setSubject(`Discussion re: ${referenceResolved.number}`);
    }
  }, [referenceResolved?.id]);

  // Recipient search
  const { data: recipientResults, isFetching: recipientSearching } = useQuery({
    queryKey: ["admin-users", recipientQuery],
    queryFn: () => customFetch<AdminUser[]>(`/api/admin-messages/admin-users?q=${encodeURIComponent(recipientQuery)}`),
    enabled: hasAccess && recipientQuery.length > 0,
    staleTime: 5000,
  });

  // Reference lookup
  const { data: refResults, isFetching: refSearching } = useQuery({
    queryKey: ["admin-ref-lookup", referenceType, refQuery],
    queryFn: () =>
      customFetch<ReferenceResult[]>(`/api/admin-messages/reference-lookup?referenceType=${referenceType}&q=${encodeURIComponent(refQuery)}`),
    enabled: hasAccess && refQuery.length >= 2,
    staleTime: 5000,
  });

  // Close dropdowns on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (recipientRef.current && !recipientRef.current.contains(e.target as Node)) {
        setRecipientDropdownOpen(false);
      }
      if (refInputRef.current && !refInputRef.current.contains(e.target as Node)) {
        setRefDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const createMut = useMutation({
    mutationFn: () =>
      customFetch<CreateResult>("/api/admin-messages", {
        method: "POST",
        body: JSON.stringify({
          subject: subject.trim(),
          referenceType,
          referenceId: referenceResolved?.id || undefined,
          referenceNumber: referenceResolved?.number || undefined,
          recipientId: selectedRecipient!.id,
          body: body.trim(),
        }),
      }),
    onSuccess: (data) => {
      toast.success("Conversation started");
      qc.invalidateQueries({ queryKey: ["admin-messages"] });
      qc.invalidateQueries({ queryKey: ["admin-messages-unread"] });
      navigate(`/admin/messages/${data.conversation.id}`);
    },
    onError: (err: any) => {
      toast.error(err?.data?.message ?? "Failed to create conversation");
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!subject.trim()) { toast.error("Subject is required"); return; }
    if (!selectedRecipient) { toast.error("Please select a recipient"); return; }
    if (!body.trim()) { toast.error("Message body is required"); return; }
    createMut.mutate();
  }

  if (!hasAccess) {
    return (
      <AdminLayout>
        <div className="p-6 lg:p-8 max-w-2xl mx-auto">
          <p className="text-muted-foreground">You don't have permission to create messages.</p>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="p-6 lg:p-8 max-w-2xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/admin/messages"><ArrowLeft className="h-4 w-4" /></Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">New Conversation</h1>
            <p className="text-muted-foreground text-sm">Start an internal admin discussion</p>
          </div>
        </div>

        <Card className="border-border">
          <CardHeader className="pb-4">
            <CardTitle className="text-base">Conversation details</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Recipient picker */}
              <div className="space-y-1.5">
                <Label>Recipient (admin user) *</Label>
                {selectedRecipient ? (
                  <div className="flex items-center gap-3 p-3 border border-border rounded-md bg-muted/40">
                    <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold text-primary">
                      {selectedRecipient.name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{selectedRecipient.name}</p>
                      <p className="text-xs text-muted-foreground truncate">{selectedRecipient.email}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                      <Button type="button" variant="ghost" size="sm" onClick={() => setSelectedRecipient(null)}>
                        Change
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div ref={recipientRef} className="relative">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        value={recipientQuery}
                        onChange={e => { setRecipientQuery(e.target.value); setRecipientDropdownOpen(true); }}
                        onFocus={() => setRecipientDropdownOpen(true)}
                        placeholder="Search admin by name or email…"
                        className="pl-9"
                      />
                    </div>
                    {recipientDropdownOpen && recipientResults && recipientResults.length > 0 && (
                      <div className="absolute z-50 top-full mt-1 left-0 right-0 bg-popover border border-border rounded-md shadow-lg max-h-48 overflow-y-auto">
                        {recipientResults.map(u => (
                          <button
                            key={u.id}
                            type="button"
                            className="w-full px-3 py-2 text-left hover:bg-muted flex items-center gap-3"
                            onClick={() => {
                              setSelectedRecipient(u);
                              setRecipientQuery("");
                              setRecipientDropdownOpen(false);
                            }}
                          >
                            <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold text-primary shrink-0">
                              {u.name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-medium truncate">{u.name}</p>
                              <p className="text-xs text-muted-foreground truncate">{u.email} · {u.role.replace(/_/g, " ")}</p>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                    {recipientDropdownOpen && recipientQuery.length > 0 && !recipientSearching && (!recipientResults || recipientResults.length === 0) && (
                      <div className="absolute z-50 top-full mt-1 left-0 right-0 bg-popover border border-border rounded-md shadow-lg px-3 py-2 text-sm text-muted-foreground">
                        No admin users found
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Subject */}
              <div className="space-y-1.5">
                <Label htmlFor="subject">Subject *</Label>
                <Input
                  id="subject"
                  value={subject}
                  onChange={e => setSubject(e.target.value)}
                  placeholder="e.g. Payment issue for ORD-2025-001234"
                  required
                />
              </div>

              {/* Reference type + lookup */}
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label>Reference type</Label>
                  <Select value={referenceType} onValueChange={v => {
                    setReferenceType(v);
                    setReferenceResolved(null);
                    setRefQuery("");
                  }}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="order">Order</SelectItem>
                      <SelectItem value="quotation">Quotation</SelectItem>
                      <SelectItem value="vehicle">Vehicle</SelectItem>
                      <SelectItem value="shipment">Shipment</SelectItem>
                      <SelectItem value="payment">Payment</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                    <Label>Reference record <span className="text-destructive">*</span></Label>
                    {referenceResolved ? (
                      <div className="flex items-center gap-3 p-3 border border-border rounded-md bg-muted/40">
                        <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium">{referenceResolved.label}</p>
                          <p className="text-xs font-mono text-muted-foreground">{referenceResolved.id.slice(0, 20)}…</p>
                        </div>
                        <Button type="button" variant="ghost" size="sm" onClick={() => {
                          setReferenceResolved(null);
                          setRefQuery("");
                          setReferenceId("");
                          setReferenceNumber("");
                        }}>
                          Clear
                        </Button>
                      </div>
                    ) : (
                      <div ref={refInputRef} className="relative">
                        <div className="relative">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                          <Input
                            value={refQuery}
                            onChange={e => { setRefQuery(e.target.value); setRefDropdownOpen(true); }}
                            onFocus={() => setRefDropdownOpen(true)}
                            placeholder={referenceType === "order" ? "Search by order number (ORD-...)" :
                              referenceType === "vehicle" ? "Search by brand or model" :
                              referenceType === "payment" ? "Search by payment reference" :
                              "Search by ID or number…"}
                            className="pl-9"
                          />
                        </div>
                        {refDropdownOpen && refResults && refResults.length > 0 && (
                          <div className="absolute z-50 top-full mt-1 left-0 right-0 bg-popover border border-border rounded-md shadow-lg max-h-48 overflow-y-auto">
                            {refResults.map(r => (
                              <button
                                key={r.id}
                                type="button"
                                className="w-full px-3 py-2 text-left hover:bg-muted text-sm"
                                onClick={() => {
                                  setReferenceResolved(r);
                                  setRefDropdownOpen(false);
                                  if (!subject || subject === `Discussion re: ${referenceResolved?.number}`) {
                                    setSubject(`Discussion re: ${r.number}`);
                                  }
                                }}
                              >
                                <span className="font-medium">{r.label}</span>
                              </button>
                            ))}
                          </div>
                        )}
                        {refDropdownOpen && refQuery.length >= 2 && !refSearching && (!refResults || refResults.length === 0) && (
                          <div className="absolute z-50 top-full mt-1 left-0 right-0 bg-popover border border-border rounded-md shadow-lg px-3 py-2 text-sm text-muted-foreground">
                            No records found for "{refQuery}"
                          </div>
                        )}
                        <p className="text-xs text-muted-foreground mt-1">
                          Type at least 2 characters to search. Every conversation must be linked to a record.
                        </p>
                      </div>
                    )}
                  </div>
              </div>

              {/* Message body */}
              <div className="space-y-1.5">
                <Label htmlFor="body">Message *</Label>
                <Textarea
                  id="body"
                  value={body}
                  onChange={e => setBody(e.target.value)}
                  placeholder="Describe the issue or topic…"
                  className="min-h-[120px] resize-none"
                  required
                />
              </div>

              <div className="flex justify-end gap-3">
                <Button variant="outline" type="button" asChild>
                  <Link href="/admin/messages">Cancel</Link>
                </Button>
                <Button
                  type="submit"
                  disabled={createMut.isPending || !subject.trim() || !selectedRecipient || !body.trim() || !referenceResolved}
                >
                  <Send className="h-4 w-4 mr-2" />
                  {createMut.isPending ? "Starting…" : "Start conversation"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
