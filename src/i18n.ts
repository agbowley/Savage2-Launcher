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

import commonDe from "./locales/de/common.json";
import launchDe from "./locales/de/launch.json";
import sidebarDe from "./locales/de/sidebar.json";
import dialogsDe from "./locales/de/dialogs.json";
import settingsDe from "./locales/de/settings.json";
import modsDe from "./locales/de/mods.json";
import newsDe from "./locales/de/news.json";
import accountDe from "./locales/de/account.json";

import commonFr from "./locales/fr/common.json";
import launchFr from "./locales/fr/launch.json";
import sidebarFr from "./locales/fr/sidebar.json";
import dialogsFr from "./locales/fr/dialogs.json";
import settingsFr from "./locales/fr/settings.json";
import modsFr from "./locales/fr/mods.json";
import newsFr from "./locales/fr/news.json";
import accountFr from "./locales/fr/account.json";

import commonPt from "./locales/pt/common.json";
import launchPt from "./locales/pt/launch.json";
import sidebarPt from "./locales/pt/sidebar.json";
import dialogsPt from "./locales/pt/dialogs.json";
import settingsPt from "./locales/pt/settings.json";
import modsPt from "./locales/pt/mods.json";
import newsPt from "./locales/pt/news.json";
import accountPt from "./locales/pt/account.json";

import commonRu from "./locales/ru/common.json";
import launchRu from "./locales/ru/launch.json";
import sidebarRu from "./locales/ru/sidebar.json";
import dialogsRu from "./locales/ru/dialogs.json";
import settingsRu from "./locales/ru/settings.json";
import modsRu from "./locales/ru/mods.json";
import newsRu from "./locales/ru/news.json";
import accountRu from "./locales/ru/account.json";

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
            de: {
                common: commonDe,
                launch: launchDe,
                sidebar: sidebarDe,
                dialogs: dialogsDe,
                settings: settingsDe,
                mods: modsDe,
                news: newsDe,
                account: accountDe,
            },
            fr: {
                common: commonFr,
                launch: launchFr,
                sidebar: sidebarFr,
                dialogs: dialogsFr,
                settings: settingsFr,
                mods: modsFr,
                news: newsFr,
                account: accountFr,
            },
            pt: {
                common: commonPt,
                launch: launchPt,
                sidebar: sidebarPt,
                dialogs: dialogsPt,
                settings: settingsPt,
                mods: modsPt,
                news: newsPt,
                account: accountPt,
            },
            ru: {
                common: commonRu,
                launch: launchRu,
                sidebar: sidebarRu,
                dialogs: dialogsRu,
                settings: settingsRu,
                mods: modsRu,
                news: newsRu,
                account: accountRu,
            },
        },
        fallbackLng: "en",
        supportedLngs: ["en", "es", "de", "fr", "pt", "ru"],
        defaultNS: "common",
        interpolation: {
            escapeValue: false,
        },
        detection: {
            order: ["localStorage", "navigator"],
            caches: ["localStorage"],
        },
    });

export default i18n;
