import { useEffect, useState } from "react";

export default function ReplitCallback() {
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function exchange() {
      try {
        const res = await fetch("/api/auth/session-tokens", {
          credentials: "include",
        });

        if (!res.ok) {
          throw new Error("Token exchange failed");
        }

        const { accessToken, refreshToken } = await res.json();

        if (!accessToken || !cancelled) {
          localStorage.setItem("ac_access_token", accessToken);
          if (refreshToken) {
            localStorage.setItem("ac_refresh_token", refreshToken);
          }
          // Hard redirect so AuthProvider re-initialises with the fresh token
          window.location.replace("/dashboard");
        }
      } catch {
        if (!cancelled) setError(true);
      }
    }

    exchange();
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4">
        <p className="text-destructive">Sign-in failed. Please try again.</p>
        <a href="/login" className="text-primary underline">
          Back to login
        </a>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4">
      <img src="/logo.svg" alt="NEXT CAR MARKET" className="h-16 w-auto object-contain animate-pulse" />
      <p className="text-muted-foreground">Completing sign in…</p>
    </div>
  );
}
