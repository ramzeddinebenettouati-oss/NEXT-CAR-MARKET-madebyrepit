import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";

const API_BASE = import.meta.env.BASE_URL?.replace(/\/$/, "");

export type AdminPermissions = {
  permissions: string[];
  hasAll: boolean;
  can: (permission: string) => boolean;
  isLoading: boolean;
};

export function useAdminPermissions(): AdminPermissions {
  const { user } = useAuth();
  const isSuperAdmin = user?.role === "super_admin";

  const { data, isLoading } = useQuery<{ permissions: string[] }>({
    queryKey: ["admin-me-permissions", user?.id],
    queryFn: async () => {
      const token = localStorage.getItem("ac_access_token");
      const res = await fetch(`${API_BASE}/api/admin/me/permissions`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to fetch permissions");
      return res.json();
    },
    enabled: user?.role === "admin" || user?.role === "super_admin",
    staleTime: 60_000,
  });

  const permissions = data?.permissions ?? [];
  const hasAll = isSuperAdmin || permissions.includes("*");
  const permSet = new Set(permissions);

  return {
    permissions,
    hasAll,
    can: (permission: string) => hasAll || permSet.has(permission),
    isLoading: !isSuperAdmin && isLoading,
  };
}
