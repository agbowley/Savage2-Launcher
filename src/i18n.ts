import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";

import commonEn from "./locales/en/common.json";
import launchEn from "./locales/en/launch.json";
import sidebarEn from "./locales/en/sidebar.json";
import dialogsEn from "./locales/en/dialogs.json";
import settingsEn from "./locales/en/settings.json";
import modsEn from "./locales/en/mods.json";
import newsEn from "./locales/en/news.json";
import accountEn from "./locales/en/account.json";

import commonEs from "./locales/es/common.json";
import launchEs from "./locales/es/launch.json";
import sidebarEs from "./locales/es/sidebar.json";
import dialogsEs from "./locales/es/dialogs.json";
import settingsEs from "./locales/es/settings.json";
import modsEs from "./locales/es/mods.json";
import newsEs from "./locales/es/news.json";
import accountEs from "./locales/es/account.json";

i18n
    .use(LanguageDetector)
    .use(initReactI18next)
    .init({
        resources: {
            en: {
                common: commonEn,
                launch: launchEn,
                sidebar: sidebarEn,
                dialogs: dialogsEn,
                settings: settingsEn,
                mods: modsEn,
                news: newsEn,
                account: accountEn,
            },
            es: {
                common: commonEs,
                launch: launchEs,
                sidebar: sidebarEs,
                dialogs: dialogsEs,
                settings: settingsEs,
                mods: modsEs,
                news: newsEs,
                account: accountEs,
            },
        },
        fallbackLng: "en",
        supportedLngs: ["en", "es"],
        defaultNS: "common",
        interpolation: {
            escapeValue: false,
        },
        detection: {
            order: ["navigator"],
            caches: [],
        },
    });

export default i18n;
