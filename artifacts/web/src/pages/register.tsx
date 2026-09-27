import { useState } from "react";
import { Link } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import { CarFront, ArrowRight, Building2, Phone, Mail, MessageCircle } from "lucide-react";
import { PhoneOtpDialog } from "@/components/phone-otp-dialog";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useTranslation } from "react-i18next";

const registerSchema = z.object({
  role: z.enum(["buyer", "seller"]),
  email: z.string().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  companyName: z.string().min(1, "Company name is required"),
  phone: z.string().optional(),
  country: z.string().optional(),
  signupMethod: z.enum(["email", "phone", "google", "wechat"]).default("email"),
});

export default function Register() {
  const { register } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const { t } = useTranslation();
  const [activeMethod, setActiveMethod] = useState<"email" | "phone" | "google" | "wechat">("email");
  const [phoneDialogOpen, setPhoneDialogOpen] = useState(false);

  const form = useForm<z.infer<typeof registerSchema>>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      role: "buyer",
      email: "",
      password: "",
      firstName: "",
      lastName: "",
      companyName: "",
      phone: "",
      country: "",
      signupMethod: "email",
    },
  });

  function selectMethod(m: "email" | "phone" | "google" | "wechat") {
    if (m === "phone") { setPhoneDialogOpen(true); return; }
    if (m === "google") {
      const role = form.getValues("role");
      window.location.href = `/api/auth/google?role=${role}`;
      return;
    }
    if (m === "wechat") {
      const role = form.getValues("role");
      window.location.href = `/api/auth/wechat?role=${role}`;
      return;
    }
    setActiveMethod("email");
    form.setValue("signupMethod", "email");
    document.getElementById("reg-email")?.focus();
  }

  const onSubmit = async (values: z.infer<typeof registerSchema>) => {
    try {
      setIsLoading(true);
      await register({ data: { ...values, signupMethod: activeMethod } });
      toast.success(t("register.successMsg"));
    } catch (error: any) {
      toast.error(error?.message || t("register.errorMsg"));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-[100dvh] flex flex-col md:flex-row bg-background">
      {/* Left side - Branding (Hidden on mobile) */}
      <div className="hidden md:flex md:w-[40%] bg-zinc-950 text-white flex-col justify-between p-10 relative overflow-hidden">
        {/* Subtle grid pattern */}
        <div className="absolute inset-0 opacity-10 bg-[linear-gradient(rgba(255,255,255,0.1)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.1)_1px,transparent_1px)] bg-[size:20px_20px]" />
        
        <div className="relative z-10">
          <Link href="/" className="flex items-center w-fit">
            <img src="/logo.svg" alt="NEXT CAR MARKET" className="w-auto h-12 object-contain" />
          </Link>
        </div>
        
        <div className="relative z-10">
          <h1 className="text-4xl font-semibold tracking-tight mb-6">
            {t("register.brandingTitle")}
          </h1>
          <ul className="space-y-4 text-zinc-400">
            <li className="flex items-start gap-3">
              <div className="mt-1 h-1.5 w-1.5 rounded-full bg-primary flex-shrink-0" />
              <span>{t("register.brandingFeature1")}</span>
            </li>
            <li className="flex items-start gap-3">
              <div className="mt-1 h-1.5 w-1.5 rounded-full bg-primary flex-shrink-0" />
              <span>{t("register.brandingFeature2")}</span>
            </li>
            <li className="flex items-start gap-3">
              <div className="mt-1 h-1.5 w-1.5 rounded-full bg-primary flex-shrink-0" />
              <span>{t("register.brandingFeature3")}</span>
            </li>
          </ul>
        </div>
      </div>

      {/* Right side - Form */}
      <div className="flex-1 flex flex-col p-6 lg:p-12 relative overflow-y-auto">
        <div className="w-full max-w-xl mx-auto space-y-8 my-auto">
          <div className="flex items-center justify-between mb-8">
            <div className="md:hidden flex items-center">
              <img src="/logo.svg" alt="NEXT CAR MARKET" className="w-auto h-12 object-contain" />
            </div>
            <Link href="/login" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors ml-auto">
              {t("register.alreadyHaveAccount")}
            </Link>
          </div>

          <div className="space-y-2">
            <h2 className="text-3xl font-semibold tracking-tight">{t("register.createAccount")}</h2>
            <p className="text-muted-foreground">{t("register.subtitle")}</p>
          </div>

          <div className="space-y-3">
            <p className="text-sm font-medium">{t("register.registeringAs")}</p>
            <RadioGroup
              value={form.watch("role")}
              onValueChange={(value) => form.setValue("role", value as "buyer" | "seller")}
              className="grid grid-cols-2 gap-4"
              data-testid="radio-role-group"
            >
              <label className={`flex flex-col items-center justify-center rounded-md border-2 p-4 cursor-pointer transition-colors ${form.watch("role") === "buyer" ? "border-primary bg-primary/5" : "border-muted hover:bg-accent"}`}>
                <RadioGroupItem value="buyer" className="sr-only" data-testid="radio-role-buyer" />
                <Building2 className="mb-2 h-6 w-6" />
                <span className="font-medium">{t("register.internationalBuyer")}</span>
              </label>
              <label className={`flex flex-col items-center justify-center rounded-md border-2 p-4 cursor-pointer transition-colors ${form.watch("role") === "seller" ? "border-primary bg-primary/5" : "border-muted hover:bg-accent"}`}>
                <RadioGroupItem value="seller" className="sr-only" data-testid="radio-role-seller" />
                <CarFront className="mb-2 h-6 w-6" />
                <span className="font-medium">{t("register.chineseSeller")}</span>
              </label>
            </RadioGroup>
          </div>

          {/* Social sign-up options */}
          <div className="space-y-3">
            <p className="text-sm font-medium text-muted-foreground text-center">Sign up with</p>
            <div className="grid grid-cols-2 gap-3">
              {/* Phone */}
              <button
                type="button"
                onClick={() => selectMethod("phone")}
                className="flex items-center justify-center gap-2.5 h-11 rounded-md border border-green-500/40 bg-green-500/5 hover:bg-green-500/10 transition-colors text-sm font-medium px-4 text-green-500"
              >
                <Phone className="h-4 w-4 shrink-0" />
                Phone
              </button>
              {/* Gmail / Google */}
              <button
                type="button"
                onClick={() => selectMethod("google")}
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
              {/* Email — active/selected */}
              <button
                type="button"
                onClick={() => selectMethod("email")}
                className={`flex items-center justify-center gap-2.5 h-11 rounded-md border transition-colors text-sm font-medium px-4 ${
                  activeMethod === "email"
                    ? "border-primary/40 bg-primary/5 text-primary"
                    : "border-border bg-background hover:bg-muted"
                }`}
              >
                <Mail className="h-4 w-4 shrink-0" />
                Email
              </button>
              {/* WeChat */}
              <button
                type="button"
                onClick={() => selectMethod("wechat")}
                className="flex items-center justify-center gap-2.5 h-11 rounded-md border border-border bg-background hover:bg-muted transition-colors text-sm font-medium px-4"
              >
                <MessageCircle className="h-4 w-4 text-[#07C160] shrink-0" />
                WeChat
              </button>
            </div>
            <div className="relative">
              <div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-background px-2 text-muted-foreground">or continue with email</span>
              </div>
            </div>
          </div>

          <PhoneOtpDialog
            open={phoneDialogOpen}
            onOpenChange={setPhoneDialogOpen}
            mode="register"
            initialRole={form.watch("role")}
          />

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="firstName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("register.firstName")}</FormLabel>
                      <FormControl>
                        <Input placeholder="John" className="h-11" data-testid="input-firstname" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="lastName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("register.lastName")}</FormLabel>
                      <FormControl>
                        <Input placeholder="Doe" className="h-11" data-testid="input-lastname" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="companyName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("register.companyName")}</FormLabel>
                    <FormControl>
                      <Input placeholder="Acme Logistics LLC" className="h-11" data-testid="input-company" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("register.workEmail")}</FormLabel>
                    <FormControl>
                      <Input placeholder="john@company.com" type="email" className="h-11" data-testid="input-email" id="reg-email" {...field} />
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
                    <FormLabel>{t("register.password")}</FormLabel>
                    <FormControl>
                      <Input type="password" placeholder={t("register.passwordPlaceholder")} className="h-11" data-testid="input-password" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button 
                type="submit" 
                className="w-full h-11 text-base font-medium gap-2 mt-4"
                disabled={isLoading}
                data-testid="button-register"
              >
                {isLoading ? t("register.submitting") : t("register.submitApplication")}
                {!isLoading && <ArrowRight className="h-4 w-4" />}
              </Button>
              
              <p className="text-xs text-center text-muted-foreground mt-4">
                {t("register.terms")}
              </p>
            </form>
          </Form>
        </div>
      </div>
    </div>
  );
}
