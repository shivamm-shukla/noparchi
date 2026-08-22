import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colorScheme, useColorScheme } from 'nativewind';
import themeTokens from '../config/theme';

export type ThemePreference = 'system' | 'light' | 'dark';
export type ResolvedTheme = 'light' | 'dark';

/** The semantic roles, resolved for whichever theme is active. */
export type ThemeColors = Record<string, string>;

interface ThemeContextValue {
  /** What the user chose. 'system' follows the device. */
  preference: ThemePreference;
  /** What is actually being shown right now. */
  resolved: ResolvedTheme;
  /**
   * Raw colour values for props that cannot take a class - lucide `color=`,
   * StatusBar, the tab bar. Class names resolve on their own through the CSS
   * variables, so this is only for those cases.
   */
  colors: ThemeColors;
  setPreference: (preference: ThemePreference) => void;
}

const STORAGE_KEY = '@noparchi/theme/v1';

const ThemeContext = createContext<ThemeContextValue | null>(null);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [preference, setPreferenceState] = useState<ThemePreference>('system');
  const { colorScheme: active } = useColorScheme();

  // Restore the saved choice. Until it loads the app follows the device, which
  // is the right default and avoids a flash of the wrong theme on first paint.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        if (cancelled) return;
        if (stored === 'light' || stored === 'dark' || stored === 'system') {
          setPreferenceState(stored);
          colorScheme.set(stored);
        }
      } catch {
        // Unreadable storage is not worth failing over; the device theme stands.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next);
    colorScheme.set(next);
    AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {});
  }, []);

  const resolved: ResolvedTheme = active === 'light' ? 'light' : 'dark';

  const value = useMemo<ThemeContextValue>(
    () => ({
      preference,
      resolved,
      colors: themeTokens.themes[resolved],
      setPreference,
    }),
    [preference, resolved, setPreference]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside ThemeProvider');
  return ctx;
}

/**
 * Just the colours, for the common case.
 *
 * Prefer a Tailwind class wherever one exists - `bg-brand-surface` needs no
 * hook and no re-render. Reach for this only when the value has to be a prop.
 */
export function useThemeColors(): ThemeColors {
  return useTheme().colors;
}
