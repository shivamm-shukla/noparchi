import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getLocales } from 'expo-localization';
import { useTranslation } from 'react-i18next';
import i18n, { SCRIPT_FOR_LANGUAGE, SUPPORTED_LANGUAGES, type Language } from '../i18n';

export type LanguagePreference = 'system' | Language;
export type Script = 'latin' | 'devanagari';

interface LanguageContextValue {
  /** What the user chose. 'system' follows the device. */
  preference: LanguagePreference;
  /** What is actually being shown right now. */
  resolved: Language;
  /** Which script that language is written in - picks the typeface. */
  script: Script;
  setPreference: (preference: LanguagePreference) => void;
}

const STORAGE_KEY = '@noparchi/language/v1';

const LanguageContext = createContext<LanguageContextValue | null>(null);

/**
 * The device's language, if we speak it.
 *
 * `getLocales()` returns entries like `hi-IN`, so only the leading subtag is
 * compared. Anything we do not have a file for lands on English rather than on
 * a half-translated screen.
 */
function deviceLanguage(): Language {
  const tag = getLocales()[0]?.languageCode ?? 'en';
  return (SUPPORTED_LANGUAGES as readonly string[]).includes(tag) ? (tag as Language) : 'en';
}

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [preference, setPreferenceState] = useState<LanguagePreference>('system');
  const [resolved, setResolved] = useState<Language>(deviceLanguage);

  const apply = useCallback((next: LanguagePreference) => {
    const language = next === 'system' ? deviceLanguage() : next;
    setResolved(language);
    // i18next holds the active language; changing it re-renders every
    // useTranslation() consumer, which is why nothing else has to be told.
    if (i18n.language !== language) i18n.changeLanguage(language);
  }, []);

  // Restore the saved choice. Until it loads the app follows the device, which
  // is the right default and avoids a flash of the wrong language on first paint.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        if (cancelled) return;
        if (stored === 'system' || (SUPPORTED_LANGUAGES as readonly string[]).includes(stored ?? '')) {
          setPreferenceState(stored as LanguagePreference);
          apply(stored as LanguagePreference);
          return;
        }
      } catch {
        // Unreadable storage is not worth failing over; the device language stands.
      }
      apply('system');
    })();
    return () => {
      cancelled = true;
    };
  }, [apply]);

  const setPreference = useCallback(
    (next: LanguagePreference) => {
      setPreferenceState(next);
      apply(next);
      AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {});
    },
    [apply]
  );

  const value = useMemo<LanguageContextValue>(
    () => ({
      preference,
      resolved,
      script: SCRIPT_FOR_LANGUAGE[resolved],
      setPreference,
    }),
    [preference, resolved, setPreference]
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
};

export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLanguage must be used inside LanguageProvider');
  return ctx;
}

/**
 * The active script, for anything choosing a typeface.
 *
 * Separate from useLanguage() because a component that only needs to know
 * "Latin or Devanagari" should not re-render when the preference changes
 * between two languages sharing a script.
 */
export function useScript(): Script {
  return useLanguage().script;
}

/** Re-exported so screens import one thing to get strings. */
export { useTranslation };
