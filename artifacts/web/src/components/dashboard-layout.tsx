import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { NotificationBell } from "@/components/notification-bell";
import { ModeToggle } from "@/components/mode-toggle";
import { LanguageSelector } from "@/components/language-selector";
import {
  LogOut, Heart, MessageCircle,
  Bell, LayoutDashboard, FileText, Container, Receipt, Truck, Menu, Settings,
} from "lucide-react";
import { useTranslation } from "react-i18next";

export function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const [location] = useLocation();
  const { t, i18n } = useTranslation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const isRTL = i18n.dir() === "rtl";

  const getRoleLinks = () => {
    switch (user?.role) {
      case "seller":
        return [
          { icon: LayoutDashboard, label: t("dashboard.overview"), href: "/seller/dashboard" },
          { icon: FileText, label: t("dashboard.myListings"), href: "/seller/listings" },
          { icon: MessageCircle, label: t("dashboard.messages"), href: "/seller/conversations" },
          { icon: Receipt, label: t("dashboard.quotations"), href: "/seller/quotations" },
          { icon: Container, label: t("dashboard.orders"), href: "/seller/orders" },
        ];
      case "buyer":
        return [
          { icon: LayoutDashboard, label: t("dashboard.overview"), href: "/buyer/dashboard" },
          { icon: Heart, label: t("dashboard.savedVehicles"), href: "/buyer/favorites" },
          { icon: MessageCircle, label: t("dashboard.messages"), href: "/buyer/conversations" },
          { icon: Receipt, label: t("dashboard.quotations"), href: "/buyer/quotations" },
          { icon: Container, label: t("dashboard.orders"), href: "/buyer/orders" },
          { icon: Bell, label: t("dashboard.notifications"), href: "/buyer/notifications" },
        ];
      case "freight_forwarder":
        return [
          { icon: Truck, label: t("dashboard.freightRequests"), href: "/forwarder/freight-requests" },
          { icon: Package, label: t("dashboard.myShipments"), href: "/forwarder/shipments" },
        ];
      default:
        return [];
    }
  };

  const links = getRoleLinks();
  const showNotifBell = user?.role === "buyer" || user?.role === "seller";

  const settingsLink = { icon: Settings, label: t("nav.settings", "Settings"), href: "/account/settings" };

  const SidebarContent = ({ onNavigate }: { onNavigate?: () => void }) => (
    <>
      <div className="h-16 flex items-center ps-5 pe-12 border-b border-sidebar-border shrink-0">
        <Link href="/" className="flex items-center" onClick={onNavigate}>
          <img src="/logo.svg" alt="NEXT CAR MARKET" className="h-8 w-auto object-contain max-w-full" />
        </Link>
      </div>
      <div className="p-3 space-y-0.5 flex-1 overflow-y-auto">
        {links.map((link, i) => {
          const isActive = location === link.href || location.startsWith(link.href + "/");
          return (
            <Link
              key={i}
              href={link.href}
              onClick={onNavigate}
              className={`flex items-center gap-3 px-3 py-2.5 text-sm font-display font-semibold rounded-md transition-colors ${
                isActive
                  ? "bg-primary/20 text-primary border-s-2 border-primary ps-[10px]"
                  : "text-sidebar-foreground/80 hover:text-sidebar-foreground hover:bg-white/8 border-s-2 border-transparent ps-[10px]"
              }`}
            >
              <link.icon className="h-4 w-4 shrink-0" />
              {link.label}
            </Link>
          );
        })}
      </div>
      <div className="p-3 border-t border-sidebar-border shrink-0">
        {(() => {
          const isActive = location === settingsLink.href;
          return (
            <Link
              href={settingsLink.href}
              onClick={onNavigate}
              className={`flex items-center gap-3 px-3 py-2.5 text-sm font-display font-semibold rounded-md transition-colors ${
                isActive
                  ? "bg-primary/20 text-primary border-s-2 border-primary ps-[10px]"
                  : "text-sidebar-foreground/80 hover:text-sidebar-foreground hover:bg-white/8 border-s-2 border-transparent ps-[10px]"
              }`}
            >
              <settingsLink.icon className="h-4 w-4 shrink-0" />
              {settingsLink.label}
            </Link>
          );
        })()}
      </div>
    </>
  );

  return (
    <div className="min-h-[100dvh] flex flex-col md:flex-row bg-background">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex w-64 border-e border-sidebar-border bg-sidebar flex-shrink-0 flex-col">
        <SidebarContent />
      </aside>

      {/* Main column */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0">
        {/* Top header */}
        <header className="h-16 flex items-center justify-between px-4 sm:px-6 border-b border-border bg-card gap-2 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="md:hidden shrink-0" aria-label="Open menu">
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side={isRTL ? "right" : "left"} className="w-72 p-0 flex flex-col bg-sidebar text-sidebar-foreground border-sidebar-border">
                <SidebarContent onNavigate={() => setSidebarOpen(false)} />
              </SheetContent>
            </Sheet>
            <span className="text-base sm:text-lg font-display font-bold capitalize truncate">
              {user?.role?.replace(/_/g, " ")} {t("nav.dashboard")}
            </span>
          </div>
          <div className="flex items-center gap-1 sm:gap-2 shrink-0">
            <span className="text-sm text-muted-foreground hidden lg:inline-block">{user?.email}</span>
            {showNotifBell && <NotificationBell />}
            <LanguageSelector />
            <ModeToggle />
            <Button
              variant="ghost"
              size="sm"
              onClick={logout}
              className="gap-1.5"
              data-testid="button-logout"
            >
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline-block">{t("nav.logout")}</span>
            </Button>
          </div>
        </header>

        {/* Page content */}
        <div className="flex-1 overflow-auto">
          {children}
        </div>
      </div>
    </div>
  );
}
