import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en.json';
import hi from './locales/hi.json';

export const SUPPORTED_LANGUAGES = ['en', 'hi'] as const;
export type Language = (typeof SUPPORTED_LANGUAGES)[number];

/** Which script a language is written in, which decides the typeface. */
export const SCRIPT_FOR_LANGUAGE: Record<Language, 'latin' | 'devanagari'> = {
  en: 'latin',
  hi: 'devanagari',
};

/**
 * Set up once, at import time, so that any module reading a string during the
 * first render finds an initialised instance rather than a key echoed back.
 *
 * Structured as translation keys from the start - every user-facing string in
 * the app goes through `t()`, so a third language is a new JSON file and
 * nothing else. This is deliberately NOT the landing page's approach of
 * shipping both languages in the markup and hiding one; that was a stopgap for
 * a static page and would double every string in the bundle here.
 */
i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    hi: { translation: hi },
  },
  lng: 'en',
  fallbackLng: 'en',
  // A missing Hindi key should show the English string, not the raw key. A
  // gatekeeper seeing `scanner.alreadyUsed` at a gate is worse than seeing it
  // in the wrong language.
  returnEmptyString: false,
  interpolation: {
    // React already escapes everything it renders.
    escapeValue: false,
  },
});

export default i18n;
