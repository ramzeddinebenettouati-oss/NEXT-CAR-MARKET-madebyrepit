import { useState } from "react";
import { Link } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { CheckCircle2, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

const schema = z.object({
  email: z.string().email("Invalid email address"),
});

export default function ForgotPassword() {
  const [isSubmitted, setIsSubmitted] = useState(false);

  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { email: "" },
  });

  const onSubmit = async (values: z.infer<typeof schema>) => {
    try {
      const response = await fetch("/api/auth/forgot-password", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(values),
      });
      if (!response.ok) throw new Error("Request failed");
      setIsSubmitted(true);
    } catch {
      toast.error("Could not send the reset request. Please try again.");
    }
  };

  return (
    <div className="min-h-[100dvh] flex flex-col md:flex-row bg-background">
      {/* Left side - Branding */}
      <div className="hidden md:flex md:w-1/2 lg:w-[45%] bg-zinc-950 text-white flex-col justify-between p-10 relative overflow-hidden">
        {/* Subtle background pattern/texture */}
        <div className="absolute inset-0 opacity-10 bg-[linear-gradient(45deg,rgba(255,255,255,0.1)_1px,transparent_1px),linear-gradient(-45deg,rgba(255,255,255,0.1)_1px,transparent_1px)] bg-[size:20px_20px]" />
        
        <div className="relative z-10">
          <Link href="/" className="flex items-center w-fit">
            <img src="/logo.svg" alt="NEXT CAR MARKET" className="w-auto h-12 object-contain" />
          </Link>
        </div>
        
        <div className="relative z-10 max-w-md">
          <h1 className="text-3xl lg:text-4xl font-semibold tracking-tight mb-4">
            Regain access to your global vehicle network.
          </h1>
          <p className="text-zinc-400 text-lg leading-relaxed">
            Secure, verified access for international automotive trade.
          </p>
        </div>
      </div>

      {/* Right side - Form */}
      <div className="flex-1 flex flex-col items-center justify-center p-6 lg:p-12 relative">
        <Link href="/login" className="absolute top-8 right-8 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
          Back to Login
        </Link>
        
        <div className="w-full max-w-md space-y-8">
          <div className="md:hidden flex items-center mb-8">
            <img src="/logo.svg" alt="NEXT CAR MARKET" className="w-auto h-12 object-contain" />
          </div>

          <div className="space-y-2">
            <h2 className="text-3xl font-semibold tracking-tight">Reset password</h2>
            <p className="text-muted-foreground">
              Enter your email address and we'll send you a link to reset your password.
            </p>
          </div>

          {isSubmitted ? (
            <div className="p-6 border border-border bg-card rounded-lg flex flex-col items-center text-center space-y-4">
              <div className="h-12 w-12 bg-primary/10 rounded-full flex items-center justify-center text-primary mb-2">
                <CheckCircle2 className="h-6 w-6" />
              </div>
              <h3 className="text-xl font-medium tracking-tight">Check your email</h3>
              <p className="text-sm text-muted-foreground">
                We've sent a password reset link to <span className="font-medium text-foreground">{form.getValues().email}</span>.
              </p>
              <Button asChild variant="outline" className="mt-4 w-full" data-testid="link-return-login">
                <Link href="/login">Return to login</Link>
              </Button>
            </div>
          ) : (
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email Address</FormLabel>
                      <FormControl>
                        <Input 
                          placeholder="name@company.com" 
                          type="email" 
                          autoComplete="email"
                          autoFocus
                          className="h-11"
                          data-testid="input-email"
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
                  data-testid="button-reset-password"
                >
                  Send reset link
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </form>
            </Form>
          )}
        </div>
      </div>
    </div>
  );
}
