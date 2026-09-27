import { Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useTranslation } from "react-i18next";
import { customFetch } from "@workspace/api-client-react";
import { useAuth } from "@/hooks/use-auth";

const LANGUAGES = [
  { code: "en", label: "English",    flag: "🇬🇧" },
  { code: "zh", label: "中文",        flag: "🇨🇳" },
  { code: "es", label: "Español",    flag: "🇪🇸" },
  { code: "fr", label: "Français",   flag: "🇫🇷" },
  { code: "ar", label: "العربية",    flag: "🇦🇪" },
  { code: "ru", label: "Русский",    flag: "🇷🇺" },
  { code: "pt", label: "Português",  flag: "🇧🇷" },
  { code: "de", label: "Deutsch",    flag: "🇩🇪" },
  { code: "ja", label: "日本語",      flag: "🇯🇵" },
  { code: "ko", label: "한국어",      flag: "🇰🇷" },
];

export function LanguageSelector({ className }: { className?: string }) {
  const { i18n } = useTranslation();
  const { isAuthenticated } = useAuth();
  const current = i18n.language ?? "en";

  const active = LANGUAGES.find((l) => l.code === current) ?? LANGUAGES[0];

  async function handleChange(code: string) {
    i18n.changeLanguage(code); // immediate UI + localStorage update
    if (isAuthenticated) {
      // persist to account server-side (best-effort — failures are silent)
      try {
        await customFetch("/api/auth/me", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ preferredLanguage: code }),
        });
      } catch {
        // non-critical — language already saved to localStorage
      }
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className={`gap-2 font-medium ${className ?? ""}`}>
          <Globe className="h-4 w-4" />
          <span className="hidden sm:inline-block">{active.flag} {active.code.toUpperCase()}</span>
          <span className="sm:hidden">{active.flag}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        {LANGUAGES.map((lang) => (
          <DropdownMenuItem
            key={lang.code}
            onClick={() => handleChange(lang.code)}
            className={`gap-3 cursor-pointer ${current === lang.code ? "font-semibold text-primary" : ""}`}
          >
            <span className="text-base">{lang.flag}</span>
            <span>{lang.label}</span>
            {current === lang.code && (
              <span className="ms-auto text-xs text-primary">✓</span>
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
