import { useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";

export default function WeChatCallback() {
  const [, navigate] = useLocation();
  const { setSession } = useAuth();
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const accessToken = params.get("accessToken"), refreshToken = params.get("refreshToken");
    if (!accessToken || !refreshToken) { navigate("/login?error=wechat_failed"); return; }
    fetch("/api/auth/me", { headers: { Authorization: `Bearer ${accessToken}` } })
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(user => { setSession(accessToken, refreshToken, user); navigate("/dashboard"); })
      .catch(() => navigate("/login?error=wechat_failed"));
  }, [navigate, setSession]);
  return <div className="min-h-screen flex items-center justify-center">Signing you in with WeChat…</div>;
}