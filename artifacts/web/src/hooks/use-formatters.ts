import { useTranslation } from "react-i18next";
import {
  formatCurrency,
  formatDate,
  formatDateTime,
  formatNumber,
  formatRelative,
  formatTime,
} from "@/lib/format";

/**
 * Returns locale-aware formatting helpers bound to the active i18next language.
 * Re-renders automatically when the user switches language.
 */
export function useFormatters() {
  const { i18n } = useTranslation();
  const lang = i18n.language;

  return {
    formatCurrency: (
      amount: number | string | null | undefined,
      currency?: string
    ) => formatCurrency(amount, lang, currency),
    formatDate: (date: Date | string | null | undefined) =>
      formatDate(date, lang),
    formatDateTime: (date: Date | string | null | undefined) =>
      formatDateTime(date, lang),
    formatNumber: (value: number | string | null | undefined) =>
      formatNumber(value, lang),
    formatRelative: (date: Date | string | null | undefined) =>
      formatRelative(date, lang),
    formatTime: (date: Date | string | null | undefined) =>
      formatTime(date, lang),
  };
}
