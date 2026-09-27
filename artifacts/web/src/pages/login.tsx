import { useEffect, useState, useRef } from "react";
import { Link } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import { ArrowRight, Phone, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { ModeToggle } from "@/components/mode-toggle";
import { LanguageSelector } from "@/components/language-selector";
import { useTranslation } from "react-i18next";
import { PhoneOtpDialog } from "@/components/phone-otp-dialog";

const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

export default function Login() {
  const { login } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [phoneDialogOpen, setPhoneDialogOpen] = useState(false);
  const { t } = useTranslation();
  const emailRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const error = new URLSearchParams(window.location.search).get("error");
    if (error === "google_config") {
      toast.error("Google sign-in is temporarily unavailable. Please use email or phone.");
      window.history.replaceState({}, "", window.location.pathname);
    } else if (error === "google_failed") {
      toast.error("Google sign-in could not be completed. Please try again.");
      window.history.replaceState({}, "", window.location.pathname);
    } else if (error === "wechat_config") {
      toast.error("WeChat sign-in is temporarily unavailable. Please use email or phone.");
      window.history.replaceState({}, "", window.location.pathname);
    } else if (error === "wechat_failed" || error === "wechat_state") {
      toast.error("WeChat sign-in could not be completed. Please try again.");
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  const form = useForm<z.infer<typeof loginSchema>>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  const onSubmit = async (values: z.infer<typeof loginSchema>) => {
    try {
      setIsLoading(true);
      await login({ data: values });
      toast.success(t("login.successMsg"));
      // Router handles redirect in AuthProvider
    } catch (error: any) {
      toast.error(error?.message || t("login.errorMsg"));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-[100dvh] flex flex-col md:flex-row bg-background">
      {/* Left side - Branding (Hidden on mobile) */}
      <div className="hidden md:flex md:w-1/2 lg:w-[55%] bg-zinc-950 text-white flex-col justify-between p-10 relative overflow-hidden">
        {/* Abstract Data Viz Background */}
        <div className="absolute inset-0 opacity-20 bg-[linear-gradient(45deg,rgba(255,255,255,0.05)_1px,transparent_1px),linear-gradient(-45deg,rgba(255,255,255,0.05)_1px,transparent_1px)] bg-[size:40px_40px]" />
        
        <div className="relative z-10">
          <Link href="/" className="flex items-center w-fit">
            <img src="/logo.svg" alt="NEXT CAR MARKET" className="w-auto h-12 object-contain" />
          </Link>
        </div>
        
        <div className="relative z-10 max-w-xl">
          <h1 className="text-4xl lg:text-5xl font-semibold tracking-tight leading-[1.1] mb-6">
            {t("login.brandingTitle")}
          </h1>
          <p className="text-zinc-400 text-lg leading-relaxed">
            {t("login.brandingSubtitle")}
          </p>
        </div>
      </div>

      {/* Right side - Form */}
      <div className="flex-1 flex flex-col items-center justify-center p-6 lg:p-12 relative">
        <div className="absolute top-6 right-6 flex items-center gap-1">
          <LanguageSelector />
          <ModeToggle />
        </div>
        <Link href="/register" className="absolute top-6 left-6 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors md:hidden">
          {t("login.createAccount")}
        </Link>
        <Link href="/register" className="hidden md:block absolute top-8 right-36 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
          {t("login.createAccount")}
        </Link>
        
        <div className="w-full max-w-md space-y-8">
          <div className="md:hidden flex items-center mb-8">
            <img src="/logo.svg" alt="NEXT CAR MARKET" className="w-auto h-12 object-contain" />
          </div>

          <div className="space-y-2">
            <h2 className="text-3xl font-semibold tracking-tight">{t("login.welcomeBack")}</h2>
            <p className="text-muted-foreground">{t("login.subtitle")}</p>
          </div>

          {/* Social login options */}
          <div className="space-y-3">
            <p className="text-sm font-medium text-muted-foreground text-center">Sign in with</p>
            <div className="grid grid-cols-2 gap-3">
              {/* Phone */}
              <button
                type="button"
                onClick={() => setPhoneDialogOpen(true)}
                className="flex items-center justify-center gap-2.5 h-11 rounded-md border border-green-500/40 bg-green-500/5 hover:bg-green-500/10 transition-colors text-sm font-medium px-4 text-green-500"
              >
                <Phone className="h-4 w-4 shrink-0" />
                Phone
              </button>
              {/* Gmail / Google */}
              <button
                type="button"
                onClick={() => { window.location.href = "/api/auth/google?role=buyer"; }}
                className="flex items-center justify-center gap-2.5 h-11 rounded-md border border-border bg-background hover:bg-muted transition-colors text-sm font-medium px-4"
              >
                <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
                Gmail
              </button>
              {/* Email — focuses the form below */}
              <button
                type="button"
                onClick={() => emailRef.current?.focus()}
                className="flex items-center justify-center gap-2.5 h-11 rounded-md border border-primary/40 bg-primary/5 hover:bg-primary/10 transition-colors text-sm font-medium px-4 text-primary"
              >
                <Mail className="h-4 w-4 shrink-0" />
                Email
              </button>
              {/* WeChat */}
              <button
                type="button"
                onClick={() => { window.location.href = "/api/auth/wechat?role=buyer"; }}
                className="flex items-center justify-center gap-2.5 h-11 rounded-md border border-border bg-background hover:bg-muted transition-colors text-sm font-medium px-4"
              >
                <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="#07C160" aria-hidden="true">
                  <path d="M8.691 2.188C3.891 2.188 0 5.476 0 9.53c0 2.212 1.17 4.203 3.002 5.55a.59.59 0 0 1 .213.665l-.39 1.48c-.019.07-.048.141-.048.213 0 .163.13.295.29.295a.326.326 0 0 0 .167-.054l1.903-1.114a.864.864 0 0 1 .717-.098 10.16 10.16 0 0 0 2.837.403c.276 0 .543-.027.811-.05-.857-2.578.157-4.972 1.932-6.446 1.703-1.415 3.882-1.98 5.853-1.838-.576-3.583-4.196-6.348-8.596-6.348zM5.785 5.991c.642 0 1.162.529 1.162 1.18a1.17 1.17 0 0 1-1.162 1.178A1.17 1.17 0 0 1 4.623 7.17c0-.651.52-1.18 1.162-1.18zm5.813 0c.642 0 1.162.529 1.162 1.18a1.17 1.17 0 0 1-1.162 1.178 1.17 1.17 0 0 1-1.162-1.178c0-.651.52-1.18 1.162-1.18z"/>
                  <path d="M16.05 9.926c-3.813 0-6.914 2.642-6.914 5.898 0 1.758.902 3.33 2.334 4.393a.464.464 0 0 1 .166.52l-.303 1.15c-.015.055-.037.11-.037.166 0 .127.102.23.227.23a.255.255 0 0 0 .13-.043l1.481-.867a.672.672 0 0 1 .558-.076c.578.163 1.198.25 1.837.25C19.164 21.547 22 18.905 22 15.824c0-3.082-2.836-5.898-5.95-5.898zm-2.305 3.76a.76.76 0 0 1 .756.763.76.76 0 0 1-.756.764.76.76 0 0 1-.756-.764.76.76 0 0 1 .756-.763zm4.61 0a.76.76 0 0 1 .756.763.76.76 0 0 1-.756.764.76.76 0 0 1-.756-.764.76.76 0 0 1 .756-.763z"/>
                </svg>
                WeChat
              </button>
            </div>
            <div className="relative">
              <div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-background px-2 text-muted-foreground">or sign in with email</span>
              </div>
            </div>
          </div>

          <PhoneOtpDialog open={phoneDialogOpen} onOpenChange={setPhoneDialogOpen} mode="login" />

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("login.emailLabel")}</FormLabel>
                    <FormControl>
                      <Input 
                        placeholder={t("login.emailPlaceholder")} 
                        type="email" 
                        autoComplete="email"
                        className="h-11"
                        data-testid="input-email"
                        ref={emailRef}
                        {...field} 
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <div className="flex items-center justify-between">
                      <FormLabel>{t("login.passwordLabel")}</FormLabel>
                      <Link href="/forgot-password" className="text-sm font-medium text-primary hover:underline">
                        {t("login.forgotPassword")}
                      </Link>
                    </div>
                    <FormControl>
                      <Input 
                        type="password" 
                        autoComplete="current-password"
                        className="h-11"
                        data-testid="input-password"
                        {...field} 
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button 
                type="submit" 
                className="w-full h-11 text-base font-medium gap-2"
                disabled={isLoading}
                data-testid="button-login"
              >
                {isLoading ? t("login.signingIn") : t("login.signIn")}
                {!isLoading && <ArrowRight className="h-4 w-4" />}
              </Button>
            </form>
          </Form>
        </div>
      </div>
    </div>
  );
}
