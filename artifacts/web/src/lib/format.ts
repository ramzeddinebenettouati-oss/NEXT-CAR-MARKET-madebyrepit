/**
 * Locale-aware formatting utilities for currency, numbers, and dates.
 * All functions accept the i18next language code (e.g. "en", "ar", "ru")
 * and map it to the appropriate BCP 47 locale for Intl APIs.
 */

const LOCALE_MAP: Record<string, string> = {
  en: "en-US",
  zh: "zh-CN",
  es: "es-ES",
  fr: "fr-FR",
  ar: "ar-SA",
  ru: "ru-RU",
  pt: "pt-BR",
  de: "de-DE",
  ja: "ja-JP",
  ko: "ko-KR",
};

export function getIntlLocale(lang: string): string {
  return LOCALE_MAP[lang] ?? "en-US";
}

/**
 * Format a monetary amount using locale-aware currency formatting.
 * Defaults to USD.
 */
export function formatCurrency(
  amount: number | string | null | undefined,
  lang: string,
  currency = "USD"
): string {
  const num = Number(amount ?? 0);
  if (isNaN(num)) return "—";
  const locale = getIntlLocale(lang);
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(num);
}

/**
 * Format a plain number (e.g. mileage) with locale-appropriate
 * thousands separators and decimal marks.
 */
export function formatNumber(
  value: number | string | null | undefined,
  lang: string
): string {
  const num = Number(value ?? 0);
  if (isNaN(num)) return "—";
  const locale = getIntlLocale(lang);
  return new Intl.NumberFormat(locale).format(num);
}

/**
 * Format a date as a short date string (e.g. "Jan 5, 2024").
 */
export function formatDate(
  date: Date | string | null | undefined,
  lang: string
): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  if (isNaN(d.getTime())) return "—";
  const locale = getIntlLocale(lang);
  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(d);
}

/**
 * Format a date with time (e.g. "Jan 5, 2024, 14:30").
 */
export function formatDateTime(
  date: Date | string | null | undefined,
  lang: string
): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  if (isNaN(d.getTime())) return "—";
  const locale = getIntlLocale(lang);
  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

/**
 * Format a time-of-day only (e.g. "14:30" or "2:30 PM").
 */
export function formatTime(
  date: Date | string | null | undefined,
  lang: string
): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  if (isNaN(d.getTime())) return "—";
  const locale = getIntlLocale(lang);
  return new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

/**
 * Format a past date as a relative time string (e.g. "3 hours ago").
 * Uses Intl.RelativeTimeFormat for locale-aware output.
 */
export function formatRelative(
  date: Date | string | null | undefined,
  lang: string
): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  if (isNaN(d.getTime())) return "—";
  const locale = getIntlLocale(lang);
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  const diffMs = d.getTime() - Date.now();
  const diffSecs = Math.round(diffMs / 1000);
  const diffMins = Math.round(diffSecs / 60);
  const diffHours = Math.round(diffMins / 60);
  const diffDays = Math.round(diffHours / 24);

  if (Math.abs(diffSecs) < 60) return rtf.format(diffSecs, "second");
  if (Math.abs(diffMins) < 60) return rtf.format(diffMins, "minute");
  if (Math.abs(diffHours) < 24) return rtf.format(diffHours, "hour");
  return rtf.format(diffDays, "day");
}
