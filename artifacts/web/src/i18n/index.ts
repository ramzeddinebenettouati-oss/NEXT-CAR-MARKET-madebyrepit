import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import en from "./locales/en.json";
import zh from "./locales/zh.json";
import es from "./locales/es.json";
import fr from "./locales/fr.json";
import ar from "./locales/ar.json";
import ru from "./locales/ru.json";
import pt from "./locales/pt.json";
import de from "./locales/de.json";
import ja from "./locales/ja.json";
import ko from "./locales/ko.json";

const RTL_LANGUAGES = ["ar"];

const savedLang = localStorage.getItem("ncm-language") ?? "en";

function applyDirection(lang: string) {
  document.documentElement.dir = RTL_LANGUAGES.includes(lang) ? "rtl" : "ltr";
  document.documentElement.lang = lang;
}

applyDirection(savedLang);

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    zh: { translation: zh },
    es: { translation: es },
    fr: { translation: fr },
    ar: { translation: ar },
    ru: { translation: ru },
    pt: { translation: pt },
    de: { translation: de },
    ja: { translation: ja },
    ko: { translation: ko },
  },
  lng: savedLang,
  fallbackLng: "en",
  interpolation: {
    escapeValue: false,
  },
});

i18n.on("languageChanged", (lang) => {
  localStorage.setItem("ncm-language", lang);
  applyDirection(lang);
});

export default i18n;
