import { useState } from "react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

export default function ResetPassword() {
  const [, navigate] = useLocation();
  const token = new URLSearchParams(window.location.search).get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState(!token ? "This reset link is missing its token." : "");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) { setError("Password must be at least 8 characters."); return; }
    if (password !== confirm) { setError("Passwords do not match."); return; }
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/auth/reset-password", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, password }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message ?? "This reset link is invalid or expired.");
      toast.success("Password updated — please sign in");
      navigate("/login");
    } catch (err: any) { setError(err.message); } finally { setLoading(false); }
  }

  return <div className="min-h-[100dvh] flex items-center justify-center bg-background p-6">
    <div className="w-full max-w-md space-y-6">
      <Link href="/" className="block"><img src="/logo.svg" alt="NEXT CAR MARKET" className="h-12 w-auto" /></Link>
      <div><h1 className="text-3xl font-semibold">Choose a new password</h1><p className="text-muted-foreground mt-2">Enter a new password for your account.</p></div>
      {error && <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">{error}</div>}
      {token && <form onSubmit={submit} className="space-y-4">
        <Input type="password" autoComplete="new-password" placeholder="New password (8+ characters)" value={password} onChange={e => setPassword(e.target.value)} />
        <Input type="password" autoComplete="new-password" placeholder="Confirm new password" value={confirm} onChange={e => setConfirm(e.target.value)} />
        <Button className="w-full" disabled={loading}>{loading ? "Updating…" : "Update password"}</Button>
      </form>}
      <Link href="/login" className="block text-center text-sm text-primary hover:underline">Return to login</Link>
    </div>
  </div>;
}