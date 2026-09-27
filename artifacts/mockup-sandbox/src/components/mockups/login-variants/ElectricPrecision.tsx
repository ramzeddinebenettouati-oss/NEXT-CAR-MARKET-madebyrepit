import React, { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Github, Globe, Moon } from "lucide-react";
import "./_group.css";

export function ElectricPrecision() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const accentColor = "#00F5FF";

  return (
    <div className="min-h-screen w-full flex bg-[#050505] text-zinc-300 font-sans selection:bg-[#00F5FF]/30">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Mono:ital,wght@0,400;0,700;1,400;1,700&display=swap');
      `}</style>
      
      {/* Left Panel */}
      <div className="relative hidden lg:flex w-1/2 flex-col justify-between p-12 border-r border-[#00F5FF]/20 electric-dot-grid overflow-hidden">
        <div className="electric-scanline"></div>
        
        <div className="relative z-10">
          <div className="text-white font-bold text-2xl tracking-widest">
            NEXT CAR MARKET
          </div>
        </div>

        <div className="relative z-10 space-y-6">
          <h1 className="text-white text-4xl leading-tight font-medium tracking-tight" style={{ fontFamily: '"Space Mono", monospace' }}>
            INSTITUTIONAL VEHICLE <br /> PROCUREMENT TERMINAL.
          </h1>
          <div className="flex items-center gap-3 text-sm font-mono tracking-wider font-bold" style={{ color: accentColor }}>
            <span className="animate-pulse">●</span>
            SYSTEM ACTIVE — 14,208 VEHICLES INDEXED
          </div>
        </div>
      </div>

      {/* Right Panel */}
      <div className="w-full lg:w-1/2 flex flex-col bg-[#0A0A0A] relative">
        {/* Top actions */}
        <div className="absolute top-8 right-8 flex items-center gap-6 text-xs font-mono text-zinc-500">
          <a href="#" className="hover:text-zinc-300 transition-colors">Create account</a>
          <div className="flex items-center gap-3">
            <button className="hover:text-zinc-300 transition-colors flex items-center gap-1"><Globe className="w-3 h-3" /> EN</button>
            <button className="hover:text-zinc-300 transition-colors"><Moon className="w-3 h-3" /></button>
          </div>
        </div>

        <div className="flex-1 flex items-center justify-center p-8 sm:p-12 lg:p-24">
          <div className="w-full max-w-[400px] space-y-10">
            <div>
              <h2 className="text-3xl font-bold text-white tracking-tight">Welcome back</h2>
            </div>

            <Button 
              variant="outline" 
              className="w-full h-12 bg-transparent border-zinc-700 text-white hover:bg-zinc-800 hover:text-white rounded-none font-mono text-sm uppercase tracking-wider"
            >
              <Github className="w-4 h-4 mr-3" />
              Continue with Replit
            </Button>

            <div className="relative flex items-center py-2">
              <div className="flex-grow border-t border-zinc-800"></div>
              <span className="flex-shrink-0 mx-4 text-zinc-600 text-[10px] tracking-widest font-mono uppercase">OR</span>
              <div className="flex-grow border-t border-zinc-800"></div>
            </div>

            <form className="space-y-8" onSubmit={(e) => e.preventDefault()}>
              <div className="space-y-6">
                <div className="relative">
                  <input 
                    type="email" 
                    id="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="electric-input peer w-full h-10 bg-transparent border-b border-zinc-700 text-white placeholder-transparent focus:outline-none focus:border-transparent text-sm transition-colors rounded-none"
                    placeholder="Email address"
                  />
                  <label 
                    htmlFor="email"
                    className="absolute left-0 -top-3.5 text-zinc-500 text-[10px] font-mono uppercase tracking-widest transition-all peer-placeholder-shown:text-sm peer-placeholder-shown:text-zinc-600 peer-placeholder-shown:top-2.5 peer-focus:-top-3.5 peer-focus:text-[10px] peer-focus:text-[#00F5FF]"
                  >
                    Email address
                  </label>
                </div>
                
                <div className="relative">
                  <input 
                    type="password" 
                    id="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="electric-input peer w-full h-10 bg-transparent border-b border-zinc-700 text-white placeholder-transparent focus:outline-none focus:border-transparent text-sm transition-colors rounded-none"
                    placeholder="Password"
                  />
                  <label 
                    htmlFor="password"
                    className="absolute left-0 -top-3.5 text-zinc-500 text-[10px] font-mono uppercase tracking-widest transition-all peer-placeholder-shown:text-sm peer-placeholder-shown:text-zinc-600 peer-placeholder-shown:top-2.5 peer-focus:-top-3.5 peer-focus:text-[10px] peer-focus:text-[#00F5FF]"
                  >
                    Password
                  </label>
                </div>
              </div>

              <div className="flex items-center justify-end">
                <a href="#" className="text-xs font-mono tracking-wider hover:underline" style={{ color: accentColor }}>
                  Forgot password?
                </a>
              </div>

              <button 
                type="submit"
                className="w-full h-12 bg-[#050505] text-[#00F5FF] border border-[#00F5FF] electric-glow font-mono font-bold text-sm tracking-widest uppercase transition-all rounded-none"
              >
                Sign In →
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}