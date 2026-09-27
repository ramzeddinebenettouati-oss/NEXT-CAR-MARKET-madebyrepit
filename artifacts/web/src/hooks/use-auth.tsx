import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { 
  useLogin, 
  useRegister, 
  useLogout, 
  useGetCurrentUser,
  getGetCurrentUserQueryKey
} from "@workspace/api-client-react";
import type { 
  LoginInput, 
  RegisterInput, 
  UserProfile 
} from "@workspace/api-client-react";
import { useLocation } from "wouter";
import { disconnectAdminMessageSocket } from "@/lib/admin-message-socket";

interface AuthContextType {
  user: UserProfile | null;
  isLoading: boolean;
  login: ReturnType<typeof useLogin>["mutateAsync"];
  register: ReturnType<typeof useRegister>["mutateAsync"];
  logout: () => void;
  isAuthenticated: boolean;
  /** Set auth session directly (used by phone OTP and future OAuth flows). */
  setSession: (accessToken: string, refreshToken: string, user: UserProfile) => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem("ac_access_token"));
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();

  const { data: user, isLoading: isUserLoading } = useGetCurrentUser({
    query: {
      enabled: !!token,
      queryKey: getGetCurrentUserQueryKey(),
      retry: false,
    }
  });

  function applyUserLanguage(u: any) {
    const lang = u?.preferredLanguage;
    if (lang) import("@/i18n").then((m) => m.default.changeLanguage(lang));
  }

  const loginMutation = useLogin({
    mutation: {
      onSuccess: (data) => {
        localStorage.setItem("ac_access_token", data.accessToken);
        localStorage.setItem("ac_refresh_token", data.refreshToken);
        setToken(data.accessToken);
        queryClient.setQueryData(getGetCurrentUserQueryKey(), data.user);
        applyUserLanguage(data.user);
        setLocation("/dashboard");
      }
    }
  });

  const registerMutation = useRegister({
    mutation: {
      onSuccess: (data) => {
        localStorage.setItem("ac_access_token", data.accessToken);
        localStorage.setItem("ac_refresh_token", data.refreshToken);
        setToken(data.accessToken);
        queryClient.setQueryData(getGetCurrentUserQueryKey(), data.user);
        applyUserLanguage(data.user);
        setLocation("/dashboard");
      }
    }
  });

  const logoutMutation = useLogout({
    mutation: {
      onSettled: () => {
        disconnectAdminMessageSocket();
        localStorage.removeItem("ac_access_token");
        localStorage.removeItem("ac_refresh_token");
        setToken(null);
        queryClient.clear();
        setLocation("/");
      }
    }
  });

  const logout = () => {
    logoutMutation.mutate();
  };

  /**
   * Set a fully authenticated session from outside the normal login/register
   * mutations (e.g. phone OTP, future OAuth callbacks).
   * Updates both localStorage AND the in-memory token state so the
   * AuthProvider's token-guard effect never clears the cached user.
   * Also applies the user's stored language preference if present.
   */
  const setSession = (accessToken: string, refreshToken: string, userProfile: UserProfile) => {
    localStorage.setItem("ac_access_token", accessToken);
    localStorage.setItem("ac_refresh_token", refreshToken);
    setToken(accessToken);
    queryClient.setQueryData(getGetCurrentUserQueryKey(), userProfile);
    // Apply server-stored language preference (overrides localStorage)
    const lang = (userProfile as any).preferredLanguage;
    if (lang) import("@/i18n").then((m) => m.default.changeLanguage(lang));
  };

  // Apply server-stored language preference once when the user first loads
  // (covers app startup / page refresh when a token is already in localStorage)
  const appliedLangRef = useRef(false);
  useEffect(() => {
    if (user && !appliedLangRef.current) {
      appliedLangRef.current = true;
      applyUserLanguage(user);
    }
  }, [user]);

  useEffect(() => {
    if (!token && user) {
      queryClient.setQueryData(getGetCurrentUserQueryKey(), null);
    }
  }, [token, user, queryClient]);

  const value = {
    user: user || null,
    isLoading: isUserLoading,
    login: loginMutation.mutateAsync,
    register: registerMutation.mutateAsync,
    logout,
    setSession,
    isAuthenticated: !!user,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

const AUTH_FALLBACK: AuthContextType = {
  user: null,
  isLoading: false,
  isAuthenticated: false,
  login: async () => { throw new Error("Not in AuthProvider"); },
  register: async () => { throw new Error("Not in AuthProvider"); },
  logout: () => {},
  setSession: () => {},
};

export function useAuth() {
  const context = useContext(AuthContext);
  // Return a safe no-op default when called outside the provider
  // (e.g. LanguageSelector on public pages, LanguageDetectionBanner)
  return context ?? AUTH_FALLBACK;
}
