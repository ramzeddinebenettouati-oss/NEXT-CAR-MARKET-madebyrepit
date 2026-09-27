import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { ModeToggle } from "@/components/mode-toggle";
import { LanguageSelector } from "@/components/language-selector";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Globe, TrendingUp, ShieldCheck, ArrowRight, CheckCircle2, BarChart3, MapPin, Menu } from "lucide-react";
import { useTranslation, Trans } from "react-i18next";

export default function Landing() {
  const { isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();
  const { t } = useTranslation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleCtaClick = () => {
    if (isAuthenticated) {
      setLocation("/dashboard");
    } else {
      setLocation("/register");
    }
  };

  return (
    <div className="min-h-[100dvh] bg-background text-foreground flex flex-col font-sans selection:bg-primary selection:text-primary-foreground">
      {/* Navigation */}
      <nav className="border-b border-border/40 bg-background/80 backdrop-blur-md sticky top-0 z-50 mt-[0px] mb-[0px] pt-[0px] pb-[0px]">
        <div className="container mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-2 text-[color:var(--color-zinc-950)]">
          {/* Logo */}
          <Link href="/" className="flex items-center shrink-0">
            <img src="/logo.svg" alt="NEXT CAR MARKET" className="w-auto h-10 object-contain" />
          </Link>

          {/* Desktop links */}
          <div className="hidden md:flex items-center gap-8 text-sm font-medium text-[color:var(--color-zinc-950)]">
            <a href="/vehicles" className="hover:text-foreground transition-colors text-[color:var(--color-zinc-900)]">{t("nav.browseVehicles")}</a>
            <a href="#stats" className="hover:text-foreground transition-colors text-[color:var(--color-zinc-950)]">{t("nav.marketData")}</a>
            <a href="#trust" className="hover:text-foreground transition-colors text-[color:var(--color-zinc-950)]">{t("nav.trustSafety")}</a>
          </div>

          {/* Desktop right actions */}
          <div className="hidden md:flex items-center gap-2">
            <LanguageSelector />
            <ModeToggle />
            {isAuthenticated ? (
              <Button onClick={() => setLocation("/dashboard")} className="font-medium ml-1" data-testid="nav-dashboard">
                {t("nav.dashboard")}
              </Button>
            ) : (
              <>
                <Button variant="ghost" asChild className="font-medium hover:text-foreground text-[color:var(--color-zinc-950)]">
                  <Link href="/login" data-testid="nav-login">{t("nav.signIn")}</Link>
                </Button>
                <Button asChild className="font-medium px-5" data-testid="nav-register">
                  <Link href="/register">{t("nav.createAccount")}</Link>
                </Button>
              </>
            )}
          </div>

          {/* Mobile right: theme + hamburger */}
          <div className="flex md:hidden items-center gap-1">
            <LanguageSelector />
            <ModeToggle />
            <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="Open menu">
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-72 p-0 flex flex-col">
                {/* Sheet header */}
                <div className="h-16 flex items-center px-5 border-b border-border">
                  <img src="/logo.svg" alt="NEXT CAR MARKET" className="w-auto h-8 object-contain" />
                </div>
                {/* Nav links */}
                <nav className="flex flex-col gap-1 p-4">
                  <a
                    href="/vehicles"
                    onClick={() => setMobileMenuOpen(false)}
                    className="flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                  >
                    {t("nav.browseVehicles")}
                  </a>
                  <a
                    href="#stats"
                    onClick={() => setMobileMenuOpen(false)}
                    className="flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                  >
                    {t("nav.marketData")}
                  </a>
                  <a
                    href="#trust"
                    onClick={() => setMobileMenuOpen(false)}
                    className="flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                  >
                    {t("nav.trustSafety")}
                  </a>
                </nav>
                {/* CTA buttons */}
                <div className="mt-auto p-4 border-t border-border flex flex-col gap-2">
                  {isAuthenticated ? (
                    <Button
                      onClick={() => { setMobileMenuOpen(false); setLocation("/dashboard"); }}
                      className="w-full font-medium"
                      data-testid="nav-dashboard-mobile"
                    >
                      {t("nav.dashboard")}
                    </Button>
                  ) : (
                    <>
                      <Button variant="outline" asChild className="w-full font-medium">
                        <Link href="/login" onClick={() => setMobileMenuOpen(false)} data-testid="nav-login-mobile">
                          {t("nav.signIn")}
                        </Link>
                      </Button>
                      <Button asChild className="w-full font-medium">
                        <Link href="/register" onClick={() => setMobileMenuOpen(false)} data-testid="nav-register-mobile">
                          {t("nav.createAccount")}
                        </Link>
                      </Button>
                    </>
                  )}
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </nav>
      {/* Hero Section */}
      <section className="relative pt-24 pb-32 lg:pt-36 lg:pb-40 overflow-hidden">
        {/* Abstract Data Viz Background */}
        <div className="absolute inset-0 z-0 opacity-10 dark:opacity-20 pointer-events-none">
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/20 rounded-full blur-[128px]" />
          <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-[128px]" />
          <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.05)_1px,transparent_1px)] bg-[size:40px_40px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_50%,#000_70%,transparent_100%)]" />
        </div>

        <div className="container mx-auto px-6 relative z-10">
          <div className="max-w-4xl mx-auto text-center space-y-8">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-secondary/50 border border-border text-sm font-medium text-muted-foreground mb-4">
              <Globe className="h-4 w-4 text-primary" />
              <span>{t("landing.badge")}</span>
            </div>
            
            <h1 className="text-[clamp(2rem,7vw,4.5rem)] font-bold tracking-tight leading-[1.1]">
              <Trans i18nKey="landing.heroTitle" components={{ highlight: <span className="text-primary" /> }} />
            </h1>
            
            <p className="text-[clamp(1rem,2.5vw,1.375rem)] text-muted-foreground font-light leading-relaxed max-w-2xl mx-auto">
              {t("landing.heroSubtitle")}
            </p>
            
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-6">
              <Button size="lg" onClick={handleCtaClick} className="h-14 px-8 text-base font-semibold w-full sm:w-auto" data-testid="hero-cta-primary">
                {t("landing.enterPlatform")} <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
              <Button size="lg" variant="outline" className="h-14 px-8 text-base font-medium w-full sm:w-auto bg-background/50 backdrop-blur-sm" data-testid="hero-cta-secondary">
                {t("landing.viewMarketData")}
              </Button>
            </div>
          </div>
        </div>
      </section>
      {/* Terminal/Data Preview Section */}
      <section id="stats" className="py-24 bg-card border-y border-border">
        <div className="container mx-auto px-6">
          <div className="grid lg:grid-cols-12 gap-12 items-center">
            <div className="lg:col-span-5 space-y-6">
              <h2 className="text-[clamp(1.5rem,4vw,2.25rem)] font-bold tracking-tight">{t("landing.statsTitle")}</h2>
              <p className="text-muted-foreground text-[clamp(0.95rem,2vw,1.125rem)] leading-relaxed">
                {t("landing.statsSubtitle")}
              </p>
              
              <ul className="space-y-4 pt-4">
                {([
                  t("landing.statFeature1"),
                  t("landing.statFeature2"),
                  t("landing.statFeature3"),
                  t("landing.statFeature4"),
                ] as string[]).map((item, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <CheckCircle2 className="h-6 w-6 text-primary flex-shrink-0" />
                    <span className="text-foreground">{item}</span>
                  </li>
                ))}
              </ul>
            </div>
            
            <div className="lg:col-span-7">
              {/* Abstract Terminal UI */}
              <div className="rounded-xl border border-border bg-background shadow-2xl overflow-hidden">
                <div className="h-10 bg-muted/50 border-b border-border flex items-center px-4 gap-2">
                  <div className="flex gap-1.5">
                    <div className="w-3 h-3 rounded-full bg-border" />
                    <div className="w-3 h-3 rounded-full bg-border" />
                    <div className="w-3 h-3 rounded-full bg-border" />
                  </div>
                  <div className="mx-auto px-3 py-1 rounded bg-background border border-border text-xs font-mono text-muted-foreground">
                    ncm-terminal-v1.0
                  </div>
                </div>
                <div className="p-6">
                  <div className="grid grid-cols-3 gap-4 mb-6">
                    {[
                      { label: t("landing.activeListings"), value: "24,592", trend: "+12%" },
                      { label: t("landing.dailyVolume"), value: "$42.5M", trend: "+4%" },
                      { label: t("landing.clearanceRate"), value: "94.2%", trend: "-1%" }
                    ].map((stat, i) => (
                      <div key={i} className="space-y-1">
                        <p className="text-xs text-muted-foreground font-mono uppercase tracking-wider">{stat.label}</p>
                        <p className="text-2xl font-bold font-mono">{stat.value}</p>
                        <p className={`text-xs font-mono ${stat.trend.startsWith('+') ? 'text-green-500' : 'text-red-500'}`}>
                          {stat.trend} 24h
                        </p>
                      </div>
                    ))}
                  </div>
                  
                  <div className="h-48 border border-border/50 rounded-lg flex items-end px-2 pt-8 pb-2 gap-2">
                    {/* Simulated chart bars */}
                    {Array.from({ length: 24 }).map((_, i) => (
                      <div 
                        key={i} 
                        className="flex-1 bg-primary/20 rounded-t-sm hover:bg-primary/40 transition-colors"
                        style={{ height: `${30 + Math.random() * 70}%` }}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
      {/* Trust & Verification */}
      <section id="trust" className="py-24">
        <div className="container mx-auto px-6">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <h2 className="text-[clamp(1.5rem,4vw,2.25rem)] font-bold tracking-tight mb-4">{t("landing.trustTitle")}</h2>
            <p className="text-muted-foreground text-[clamp(0.95rem,2vw,1.125rem)]">{t("landing.trustSubtitle")}</p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                icon: ShieldCheck,
                title: t("landing.trust1Title"),
                desc: t("landing.trust1Desc"),
              },
              {
                icon: MapPin,
                title: t("landing.trust2Title"),
                desc: t("landing.trust2Desc"),
              },
              {
                icon: TrendingUp,
                title: t("landing.trust3Title"),
                desc: t("landing.trust3Desc"),
              }
            ].map((feature, i) => (
              <div key={i} className="p-8 rounded-2xl bg-card border border-border hover:border-primary/50 transition-colors group">
                <div className="h-12 w-12 rounded-lg bg-secondary flex items-center justify-center mb-6 group-hover:bg-primary/10 group-hover:text-primary transition-colors">
                  <feature.icon className="h-6 w-6" />
                </div>
                <h3 className="text-[clamp(1.05rem,2vw,1.25rem)] font-semibold mb-3">{feature.title}</h3>
                <p className="text-muted-foreground text-[clamp(0.875rem,1.5vw,1rem)] leading-relaxed">{feature.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
      {/* Footer CTA */}
      <section className="py-32 bg-zinc-950 text-white border-t border-zinc-800">
        <div className="container mx-auto px-6 text-center">
          <h2 className="text-[clamp(1.75rem,5vw,3.5rem)] font-bold tracking-tight mb-6">{t("landing.footerCtaTitle")}</h2>
          <p className="text-zinc-400 text-[clamp(0.95rem,2.5vw,1.25rem)] max-w-2xl mx-auto mb-10">
            {t("landing.footerCtaSubtitle")}
          </p>
          <Button size="lg" onClick={handleCtaClick} className="h-14 px-10 text-base font-semibold bg-primary text-black hover:bg-primary/90">
            {t("nav.createAccount")}
          </Button>
        </div>
      </section>
      {/* Footer */}
      <footer className="py-12 border-t border-zinc-900 text-[color:var(--color-zinc-950)] bg-[color:var(--muted-border)]">
        <div className="container mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex items-center">
            <img src="/logo.svg" alt="NEXT CAR MARKET" className="w-auto h-8 object-contain opacity-80" />
          </div>
          <div className="text-sm">
            {t("landing.footerCopyright", { year: new Date().getFullYear() })}
          </div>
        </div>
      </footer>
    </div>
  );
}
