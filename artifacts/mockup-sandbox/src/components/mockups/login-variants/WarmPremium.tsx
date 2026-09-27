import React, { useState } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Globe, Moon, Sun, ArrowRight, Shield } from "lucide-react";

export function WarmPremium() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setTimeout(() => setIsLoading(false), 1000);
  };

  return (
    <>
      <style dangerouslySetInnerHTML={{__html: `
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,500;0,600;0,700;1,400&family=Inter:wght@300;400;500;600&display=swap');
        
        .font-serif {
          font-family: 'Playfair Display', serif;
        }
        .font-sans {
          font-family: 'Inter', sans-serif;
        }
        
        .premium-bg {
          background-color: #0F0E17;
        }
        
        .gold-accent {
          color: #C9A84C;
        }
        
        .gold-bg {
          background-color: #C9A84C;
        }
        
        .gold-border {
          border-color: #C9A84C;
        }
        
        .gold-ring:focus-within {
          box-shadow: 0 0 0 1px #C9A84C;
          border-color: #C9A84C;
        }
        
        .cream-bg {
          background-color: #FAF8F3;
        }
        
        .glass-panel {
          background: rgba(255, 255, 255, 0.03);
          backdrop-filter: blur(10px);
          border: 1px solid rgba(255, 255, 255, 0.05);
        }
      `}} />

      <div className="min-h-screen w-full flex font-sans cream-bg text-slate-900 selection:bg-[#C9A84C] selection:text-white">
        
        {/* Left Panel - Branding */}
        <div className="hidden lg:flex w-1/2 premium-bg relative flex-col justify-between p-12 overflow-hidden">
          
          {/* Subtle noise/texture overlay */}
          <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=%220 0 200 200%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cfilter id=%22noiseFilter%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%220.65%22 numOctaves=%223%22 stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23noiseFilter)%22/%3E%3C/svg%3E")' }}></div>

          {/* Logo area */}
          <div className="relative z-10 flex items-center gap-3">
            <div className="w-10 h-10 rounded bg-[#C9A84C] flex items-center justify-center shadow-lg">
              <Shield className="text-[#0F0E17] w-5 h-5" />
            </div>
            <span className="text-white font-serif tracking-widest text-lg uppercase font-semibold">Next Car Market</span>
          </div>

          {/* Main Copy */}
          <div className="relative z-10 max-w-lg mb-12">
            <div className="h-[1px] w-16 gold-bg mb-8 opacity-70"></div>
            <h1 className="text-5xl font-serif text-white leading-tight mb-6">
              Institutional vehicle <br/>
              <span className="gold-accent italic">procurement terminal.</span>
            </h1>
            <p className="text-slate-400 text-lg font-light leading-relaxed">
              Secure, transparent, and exclusive access to premium automotive inventory for verified institutional partners globally.
            </p>
          </div>

          {/* Footer of left panel */}
          <div className="relative z-10 flex items-center justify-between text-sm text-slate-500 font-light tracking-wide">
            <span>© {new Date().getFullYear()} NCM Global</span>
            <div className="flex gap-6">
              <a href="#" className="hover:text-white transition-colors duration-300">Terms</a>
              <a href="#" className="hover:text-white transition-colors duration-300">Privacy</a>
            </div>
          </div>
        </div>

        {/* Right Panel - Login Form */}
        <div className="w-full lg:w-1/2 flex flex-col relative min-h-screen">
          
          {/* Top Actions */}
          <div className="absolute top-0 right-0 w-full p-6 flex justify-between lg:justify-end items-center gap-6 z-10">
            {/* Mobile Logo */}
            <div className="lg:hidden flex items-center gap-2">
              <div className="w-8 h-8 rounded bg-[#0F0E17] flex items-center justify-center">
                <Shield className="text-[#C9A84C] w-4 h-4" />
              </div>
            </div>

            <div className="flex items-center gap-6">
              <div className="flex items-center gap-4 text-sm font-medium text-slate-500">
                <button className="flex items-center gap-2 hover:text-slate-900 transition-colors">
                  <Globe className="w-4 h-4" />
                  <span>EN</span>
                </button>
              </div>
              <div className="h-4 w-[1px] bg-slate-300"></div>
              <div className="text-sm">
                <span className="text-slate-500 mr-2">New here?</span>
                <a href="#" className="gold-accent font-medium hover:text-[#a88a38] transition-colors">
                  Create account
                </a>
              </div>
            </div>
          </div>

          {/* Form Container */}
          <div className="flex-1 flex flex-col justify-center items-center p-8 sm:p-12 lg:p-24">
            <div className="w-full max-w-[420px] space-y-10">
              
              <div className="space-y-3">
                <h2 className="text-3xl font-serif text-slate-900 tracking-tight">Welcome back</h2>
                <p className="text-slate-500 font-light text-sm">Sign in to access your institutional dashboard</p>
              </div>

              <Button 
                variant="outline" 
                className="w-full h-12 border-slate-300 text-slate-700 font-medium hover:bg-white hover:text-slate-900 shadow-sm transition-all"
                onClick={() => {}}
              >
                <img src="https://upload.wikimedia.org/wikipedia/commons/b/b2/Repl.it_logo.svg" alt="Replit" className="w-4 h-4 mr-3" />
                Continue with Replit
              </Button>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t border-slate-200" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="cream-bg px-4 text-slate-400 tracking-widest">Or strictly</span>
                </div>
              </div>

              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="space-y-5">
                  <div className="space-y-2">
                    <Label htmlFor="email" className="text-xs font-semibold text-slate-700 tracking-wide uppercase">Email Address</Label>
                    <div className="relative gold-ring rounded-none transition-all duration-300 group">
                      <Input 
                        id="email" 
                        type="email" 
                        placeholder="john.doe@company.com" 
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="h-12 bg-transparent border-0 border-b border-slate-300 rounded-none px-0 focus-visible:ring-0 focus-visible:border-[#C9A84C] text-lg font-light placeholder:text-slate-400 placeholder:font-light"
                        required
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="password" className="text-xs font-semibold text-slate-700 tracking-wide uppercase">Password</Label>
                      <a href="#" className="text-sm gold-accent hover:text-[#a88a38] transition-colors">
                        Forgot password?
                      </a>
                    </div>
                    <div className="relative gold-ring rounded-none transition-all duration-300 group">
                      <Input 
                        id="password" 
                        type="password" 
                        placeholder="••••••••" 
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="h-12 bg-transparent border-0 border-b border-slate-300 rounded-none px-0 focus-visible:ring-0 focus-visible:border-[#C9A84C] text-lg font-light placeholder:text-slate-400"
                        required
                      />
                    </div>
                  </div>
                </div>

                <div className="flex items-center space-x-2 pt-2">
                  <Checkbox 
                    id="remember" 
                    className="border-slate-300 text-[#C9A84C] focus-visible:ring-[#C9A84C] data-[state=checked]:bg-[#C9A84C] data-[state=checked]:border-[#C9A84C]"
                  />
                  <label
                    htmlFor="remember"
                    className="text-sm font-light text-slate-600 leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                  >
                    Keep me signed in on this device
                  </label>
                </div>

                <Button 
                  type="submit" 
                  disabled={isLoading}
                  className="w-full h-14 bg-[#C9A84C] hover:bg-[#a88a38] text-white font-medium text-lg rounded-sm shadow-md transition-all duration-300"
                >
                  {isLoading ? "Authenticating..." : "Sign In"}
                  {!isLoading && <ArrowRight className="w-5 h-5 ml-2" />}
                </Button>
              </form>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
