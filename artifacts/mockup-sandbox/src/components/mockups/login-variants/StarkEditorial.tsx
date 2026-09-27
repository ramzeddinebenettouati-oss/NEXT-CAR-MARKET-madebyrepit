import React from 'react';

export function StarkEditorial() {
  return (
    <div className="min-h-screen w-full flex flex-col md:flex-row font-sans selection:bg-black selection:text-white">
      <style dangerouslySetInnerHTML={{__html: `
        @import url('https://fonts.googleapis.com/css2?family=Space+Mono&display=swap');
      `}} />
      
      {/* Left Panel - Branding */}
      <div className="w-full md:w-1/2 bg-black text-white p-8 md:p-16 flex flex-col justify-between">
        <div className="flex justify-between items-start">
          <div className="font-['Space_Mono'] text-xs tracking-[0.2em] uppercase opacity-70">
            Next Car Market
          </div>
        </div>
        
        <div className="mt-32 mb-16">
          <h1 className="text-[5rem] md:text-[7rem] lg:text-[8.5rem] leading-[0.85] font-thin tracking-tighter antialiased">
            Institutional<br />
            vehicle<br />
            procurement<br />
            terminal.
          </h1>
        </div>
        
        <div className="font-['Space_Mono'] text-[10px] tracking-widest uppercase opacity-50">
          SECURE ENCLAVE — V 2.4.0
        </div>
      </div>

      {/* Right Panel - Form */}
      <div className="w-full md:w-1/2 bg-white text-black p-8 md:p-16 flex flex-col lg:px-32 xl:px-40 justify-center">
        <div className="w-full max-w-md mx-auto space-y-16">
          
          <div className="flex justify-between items-center w-full">
            <h2 className="text-3xl font-light tracking-tight">Welcome back</h2>
            <a href="#" className="font-['Space_Mono'] text-[10px] tracking-widest uppercase hover:underline">
              Create account
            </a>
          </div>

          <div className="space-y-12">
            <button className="w-full h-14 bg-white text-black border border-black rounded-none font-medium flex items-center justify-center hover:bg-gray-50 transition-colors">
              Continue with Replit
            </button>

            <div className="flex items-center gap-4">
              <div className="flex-1 h-px bg-gray-200"></div>
              <span className="text-[9px] uppercase tracking-widest text-gray-400 font-['Space_Mono']">or</span>
              <div className="flex-1 h-px bg-gray-200"></div>
            </div>

            <form className="space-y-10" onSubmit={(e) => e.preventDefault()}>
              <div className="space-y-2">
                <label className="block text-[10px] uppercase tracking-[0.2em] font-medium text-gray-500 mb-2">
                  Email Address
                </label>
                <input 
                  type="email" 
                  className="w-full h-10 bg-transparent border-0 border-b border-gray-300 rounded-none px-0 text-lg focus:ring-0 focus:outline-none focus:border-black transition-colors"
                  placeholder=""
                />
              </div>

              <div className="space-y-2">
                <div className="flex justify-between items-center mb-2">
                  <label className="block text-[10px] uppercase tracking-[0.2em] font-medium text-gray-500">
                    Password
                  </label>
                  <a href="#" className="text-[10px] uppercase tracking-widest text-gray-500 hover:text-black transition-colors">
                    Forgot?
                  </a>
                </div>
                <input 
                  type="password" 
                  className="w-full h-10 bg-transparent border-0 border-b border-gray-300 rounded-none px-0 text-lg focus:ring-0 focus:outline-none focus:border-black transition-colors"
                  placeholder=""
                />
              </div>

              <button className="w-full h-14 bg-black text-white rounded-none font-medium text-sm hover:bg-gray-900 transition-colors mt-8">
                Sign in
              </button>
            </form>
          </div>
          
          <div className="flex justify-between items-center pt-16 border-t border-gray-100">
            <button className="text-[10px] uppercase tracking-widest text-gray-400 hover:text-black transition-colors">
              EN / FR
            </button>
            <button className="text-[10px] uppercase tracking-widest text-gray-400 hover:text-black transition-colors">
              Dark Mode
            </button>
          </div>
          
        </div>
      </div>
    </div>
  );
}
