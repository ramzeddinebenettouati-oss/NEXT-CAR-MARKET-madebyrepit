import { useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";

export default function Dashboard() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!user) return;
    if (user.role === "buyer") {
      setLocation("/buyer/dashboard");
    } else if (user.role === "seller") {
      setLocation("/seller/dashboard");
    } else if (user.role === "freight_forwarder") {
      setLocation("/forwarder/freight-requests");
    } else if (user.role === "admin" || user.role === "super_admin") {
      setLocation("/admin/dashboard");
    }
  }, [user?.role, setLocation]);

  return (
    <div className="min-h-[100dvh] flex items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-3 text-muted-foreground">
        <div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        <span className="text-sm">Loading dashboard…</span>
      </div>
    </div>
  );
}
