import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useAdminPermissions } from "@/hooks/use-admin-permissions";
import { Button } from "@/components/ui/button";
import { ModeToggle } from "@/components/mode-toggle";
import { LanguageSelector } from "@/components/language-selector";
import {
  LayoutDashboard, Users, CarFront, CreditCard, PercentCircle,
  Shield, Settings, UserCog, LogOut, Menu, Globe, ClipboardList, Container, MessageSquare, Inbox,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { toast } from "sonner";
import { getAdminMessageSocket, subscribeAdminMessageSocket } from "@/lib/admin-message-socket";

type NavItem = {
  icon: React.ElementType;
  label: string;
  href: string;
  permission?: string;
  anyPermission?: string[];
  superAdminOnly?: boolean;
};

const ALL_NAV: NavItem[] = [
  { icon: LayoutDashboard, label: "Overview",          href: "/admin/dashboard",        permission: "view_analytics" },
  { icon: Users,           label: "Users",             href: "/admin/users",            permission: "manage_users" },
  { icon: CarFront,        label: "New Listed Vehicles", href: "/admin/moderation",       anyPermission: ["manage_listings", "commission_assignment"] },
  { icon: CreditCard,      label: "Payments",          href: "/admin/payments",         permission: "manage_payments" },
  { icon: ClipboardList,   label: "Quotations",        href: "/admin/quotations",       permission: "manage_quotations" },
  { icon: Container,       label: "Orders",            href: "/admin/orders",           permission: "order_management" },
  { icon: PercentCircle,   label: "Commission Rules",  href: "/admin/commission-rules", permission: "manage_commissions" },
  { icon: Shield,          label: "Audit Logs",        href: "/admin/audit-logs",       permission: "view_audit_logs" },
  { icon: Settings,        label: "Settings",          href: "/admin/settings",         permission: "manage_settings" },
  { icon: Globe,           label: "Reference Data",     href: "/admin/reference",        permission: "manage_settings" },
  { icon: MessageSquare,   label: "Messages",           href: "/admin/messages",         permission: "messages_management" },
  { icon: Inbox,           label: "Mailboxes",          href: "/admin/mailboxes",        permission: "manage_mailboxes" },
  { icon: UserCog,         label: "Admin Accounts",    href: "/admin/admins",           superAdminOnly: true },
];

export function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const [location] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { i18n } = useTranslation();
  const isRTL = i18n.dir() === "rtl";
  const qc = useQueryClient();

  const isSuperAdmin = user?.role === "super_admin";
  const { can, isLoading: permLoading } = useAdminPermissions();

  const canSeeMessages = isSuperAdmin || can("messages_management");
  const { data: unreadData } = useQuery({
    queryKey: ["admin-messages-unread"],
    queryFn: () => customFetch<{ count: number }>("/api/admin-messages/unread-count"),
    enabled: canSeeMessages,
    refetchInterval: 30000,
  });
  const unreadCount = unreadData?.count ?? 0;

  useEffect(() => {
    if (!canSeeMessages) return;

    const handleNewMessage = (event: {
      conversationId?: string;
      subject?: string;
      from?: string;
    }) => {
      qc.invalidateQueries({ queryKey: ["admin-messages-unread"] });
      qc.invalidateQueries({ queryKey: ["admin-messages"] });
      toast.info("New internal message", {
        description: event.subject
          ? `${event.from ?? "A team member"} sent a message in “${event.subject}”.`
          : "A team member sent you an internal message.",
        duration: 5000,
      });
    };

    const token = localStorage.getItem("ac_access_token");
    const socket = getAdminMessageSocket(token);
    if (!socket) return;

    socket.on("admin_message:new", handleNewMessage);
    const unsubscribeLifecycle = subscribeAdminMessageSocket(token, {
      onDisconnect: () => {
        toast.dismiss("admin-message-socket-reconnected");
        toast.warning("Message alerts disconnected", {
          id: "admin-message-socket-disconnected",
          description: "Polling fallback is active while we reconnect.",
        });
      },
      onReconnect: () => {
        qc.invalidateQueries({ queryKey: ["admin-messages-unread"] });
        qc.invalidateQueries({ queryKey: ["admin-messages"] });
        toast.dismiss("admin-message-socket-disconnected");
        toast.success("Message alerts reconnected", {
          id: "admin-message-socket-reconnected",
          description: "Your message lists are up to date.",
          duration: 5000,
        });
      },
    });

    return () => {
      socket.off("admin_message:new", handleNewMessage);
      unsubscribeLifecycle();
    };
  }, [canSeeMessages, qc]);

  const navLinks = ALL_NAV.filter(link => {
    if (link.superAdminOnly) return isSuperAdmin;
    if (permLoading) return false;
    if (link.anyPermission) return isSuperAdmin || link.anyPermission.some(p => can(p));
    return link.permission ? (isSuperAdmin || can(link.permission)) : true;
  });

  const Sidebar = () => (
    <aside className={`w-64 bg-sidebar flex flex-col shrink-0 h-full ${isRTL ? "border-l border-sidebar-border" : "border-r border-sidebar-border"}`}>
      <div className="h-16 flex items-center px-5 border-b border-sidebar-border">
        <Link href="/" className="flex items-center">
          <img src="/logo.svg" alt="NEXT CAR MARKET" className="h-9 w-auto object-contain" />
        </Link>
      </div>
      <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
        {navLinks.map((link) => {
          const isActive = location === link.href || location.startsWith(link.href + "/");
          return (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setMobileOpen(false)}
              className={`flex items-center gap-3 px-3 py-2 text-sm font-display font-semibold rounded-md transition-colors ${
                isActive
                  ? "bg-primary/20 text-primary border-s-2 border-primary ps-[10px]"
                  : "text-sidebar-foreground/80 hover:text-sidebar-foreground hover:bg-white/8 border-s-2 border-transparent ps-[10px]"
              }`}
            >
              <link.icon className="h-4 w-4 shrink-0" />
              <span className="flex-1">{link.label}</span>
              {link.href === "/admin/messages" && unreadCount > 0 && (
                <span className="bg-sidebar-primary text-sidebar-primary-foreground text-xs px-1.5 py-0.5 rounded-full font-bold leading-none">
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              )}
            </Link>
          );
        })}
      </nav>
      <div className="p-4 border-t border-sidebar-border space-y-1">
        <div className="px-3 py-1.5">
          <p className="text-xs font-display font-semibold text-sidebar-foreground truncate">{user?.firstName} {user?.lastName}</p>
          <p className="text-xs text-sidebar-foreground/60 truncate">{user?.email}</p>
          <span className="inline-block mt-1 text-xs px-1.5 py-0.5 rounded bg-sidebar-primary/20 text-sidebar-primary border border-sidebar-primary/30 capitalize font-display font-semibold">
            {user?.role?.replace(/_/g, " ")}
          </span>
        </div>
        <Button variant="ghost" size="sm" className="w-full justify-start gap-2 text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent normal-case tracking-normal" onClick={logout}>
          <LogOut className="h-4 w-4" /> Sign out
        </Button>
      </div>
    </aside>
  );

  return (
    <div className="min-h-[100dvh] flex bg-background">
      {/* Desktop sidebar */}
      <div className="hidden md:flex flex-col" style={{ width: 256 }}>
        <div className={`fixed top-0 h-full w-64 flex flex-col border-sidebar-border bg-sidebar ${isRTL ? "right-0 border-l" : "left-0 border-r"}`}>
          <Sidebar />
        </div>
      </div>

      {/* Mobile sidebar overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={() => setMobileOpen(false)} />
          <div className="relative z-10 h-full flex flex-col">
            <Sidebar />
          </div>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile topbar */}
        <header className="md:hidden h-14 flex items-center justify-between px-4 border-b border-border bg-card">
          <Button variant="ghost" size="icon" onClick={() => setMobileOpen(true)}>
            <Menu className="h-5 w-5" />
          </Button>
          <Link href="/" className="flex items-center">
            <img src="/logo.svg" alt="NEXT CAR MARKET" className="w-auto h-8 object-contain" />
          </Link>
          <div className="flex items-center gap-1">
            <LanguageSelector />
            <ModeToggle />
            <Button variant="ghost" size="icon" onClick={logout}>
              <LogOut className="h-5 w-5" />
            </Button>
          </div>
        </header>

        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
