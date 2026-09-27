import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { X, Globe } from "lucide-react";
import { Button } from "@/components/ui/button";

const SUPPORTED_LOCALES = ["en", "zh", "es", "fr", "ar", "ru", "pt", "de", "ja", "ko"];

const LANGUAGE_NAMES: Record<string, string> = {
  zh: "中文",
  es: "Español",
  fr: "Français",
  ar: "العربية",
  ru: "Русский",
  pt: "Português",
  de: "Deutsch",
  ja: "日本語",
  ko: "한국어",
};

const BANNER_MESSAGES: Record<string, { prompt: string; accept: string; dismiss: string }> = {
  zh: {
    prompt: "我们检测到您可能偏好中文。",
    accept: "切换到中文",
    dismiss: "保持英文",
  },
  es: {
    prompt: "Detectamos que podrías preferir Español.",
    accept: "Cambiar a Español",
    dismiss: "Mantener inglés",
  },
  fr: {
    prompt: "Nous avons détecté que vous pourriez préférer le Français.",
    accept: "Passer au Français",
    dismiss: "Garder l'anglais",
  },
  ar: {
    prompt: "اكتشفنا أنك قد تفضل العربية.",
    accept: "التبديل إلى العربية",
    dismiss: "إبقاء الإنجليزية",
  },
  ru: {
    prompt: "Мы обнаружили, что вы можете предпочесть Русский.",
    accept: "Переключить на Русский",
    dismiss: "Оставить английский",
  },
  pt: {
    prompt: "Detectamos que você pode preferir Português.",
    accept: "Mudar para Português",
    dismiss: "Manter inglês",
  },
  de: {
    prompt: "Wir haben erkannt, dass Sie möglicherweise Deutsch bevorzugen.",
    accept: "Zu Deutsch wechseln",
    dismiss: "Englisch behalten",
  },
  ja: {
    prompt: "日本語が好みである可能性が検出されました。",
    accept: "日本語に切り替え",
    dismiss: "英語のまま",
  },
  ko: {
    prompt: "한국어를 선호하실 수 있음을 감지했습니다.",
    accept: "한국어로 전환",
    dismiss: "영어 유지",
  },
};

function detectLocale(): string | null {
  const stored = localStorage.getItem("ncm-language");
  if (stored !== null) return null;

  const browserLangs = navigator.languages?.length
    ? navigator.languages
    : [navigator.language];

  for (const lang of browserLangs) {
    const base = lang.split("-")[0].toLowerCase();
    if (SUPPORTED_LOCALES.includes(base) && base !== "en") {
      return base;
    }
  }
  return null;
}

export function LanguageDetectionBanner() {
  const { i18n } = useTranslation();
  const [detectedLang, setDetectedLang] = useState<string | null>(null);

  useEffect(() => {
    const lang = detectLocale();
    setDetectedLang(lang);
  }, []);

  if (!detectedLang || !BANNER_MESSAGES[detectedLang]) return null;

  const msg = BANNER_MESSAGES[detectedLang];
  const isRtl = detectedLang === "ar";

  function handleAccept() {
    i18n.changeLanguage(detectedLang!);
    setDetectedLang(null);
  }

  function handleDismiss() {
    localStorage.setItem("ncm-language", "en");
    setDetectedLang(null);
  }

  return (
    <div
      dir={isRtl ? "rtl" : "ltr"}
      className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-2rem)] max-w-xl"
      role="alert"
      aria-live="polite"
    >
      <div className="flex items-start gap-3 rounded-xl border border-border bg-background/95 backdrop-blur-sm shadow-lg px-4 py-3">
        <Globe className="h-5 w-5 text-primary shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground leading-snug">
            {msg.prompt}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {LANGUAGE_NAMES[detectedLang]}
          </p>
        </div>
        <div className={`flex items-center gap-2 shrink-0 ${isRtl ? "flex-row-reverse" : ""}`}>
          <Button
            size="sm"
            variant="default"
            className="h-8 text-xs px-3"
            onClick={handleAccept}
          >
            {msg.accept}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-8 text-xs px-3 text-muted-foreground"
            onClick={handleDismiss}
          >
            {msg.dismiss}
          </Button>
          <button
            onClick={handleDismiss}
            aria-label="Close"
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
