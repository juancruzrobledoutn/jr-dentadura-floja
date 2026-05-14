import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import { i18nLogger } from '../utils/logger'

import es from './locales/es.json'
import en from './locales/en.json'
import pt from './locales/pt.json'

export const SUPPORTED_LANGUAGES = ['es', 'en', 'pt'] as const
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number]

export const LANGUAGE_NAMES = {
  es: 'Español',
  en: 'English',
  pt: 'Português',
} as const satisfies Record<SupportedLanguage, string>

// LOW PRIORITY FIX: Custom language detector with validation
const validatedLanguageDetector = new LanguageDetector()
validatedLanguageDetector.addDetector({
  name: 'validatedLocalStorage',
  lookup() {
    const stored = localStorage.getItem('pwamenu-language')
    // Only return if it's a valid supported language
    if (stored && SUPPORTED_LANGUAGES.includes(stored as SupportedLanguage)) {
      return stored
    }
    return undefined
  },
  cacheUserLanguage(lng: string) {
    // Only cache if it's a supported language
    if (SUPPORTED_LANGUAGES.includes(lng as SupportedLanguage)) {
      localStorage.setItem('pwamenu-language', lng)
    }
  }
})

i18n
  .use(validatedLanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      es: { translation: es },
      en: { translation: en },
      pt: { translation: pt },
    },
    // Fallback chain: if key missing in current language, try these in order
    // en -> es ensures English users see Spanish (most complete) rather than keys
    // pt -> es for Portuguese users
    fallbackLng: {
      en: ['es'],      // English falls back to Spanish
      pt: ['es'],      // Portuguese falls back to Spanish
      default: ['es'], // All others fall back to Spanish
    },
    supportedLngs: SUPPORTED_LANGUAGES,
    interpolation: {
      escapeValue: false, // React already escapes
    },
    // Log missing keys in development (helps catch translation gaps)
    saveMissing: import.meta.env.DEV,
    missingKeyHandler: import.meta.env.DEV
      ? (lngs, _ns, key) => i18nLogger.warn(`Missing key: ${key} for ${lngs.join(', ')}`)
      : undefined,
    detection: {
      // LOW PRIORITY FIX: Use validatedLocalStorage detector first
      order: ['validatedLocalStorage', 'navigator', 'htmlTag'],
      caches: ['validatedLocalStorage'],
    },
  })

export default i18n
