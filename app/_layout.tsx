import React from 'react';
import { View, Text, ActivityIndicator, Platform } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { AuthProvider, useAuth } from '../src/context/AuthContext';
import { AppProvider } from '../src/context/AppContext';
import { ThemeProvider, useTheme, useThemeColors } from '../src/context/ThemeContext';
import { LanguageProvider } from '../src/context/LanguageContext';
import { FONT_ASSETS } from '../src/config/fonts';
import { PreviewBanner } from '../components/ui/PreviewBanner';
import '../global.css';

// Held until the faces are ready, so the first paint is not in a fallback font
// that then jumps. Native only - see useBrandFonts below.
SplashScreen.preventAutoHideAsync().catch(() => {});

/**
 * Everything the merchant app owns lives under /app; everything else is public.
 *
 * The public half is three things, and none of them may be gated:
 *   /                 the marketing site a stranger lands on
 *   /pay/<merchantId> a customer who scanned a gate QR, with no account
 *   /ticket/<code>    that customer's pass afterwards
 *
 * The two customer routes read through anon-executable RPCs that return only
 * non-sensitive fields, so leaving them open exposes no merchant data.
 *
 * Checking for the /app prefix rather than listing public segments means a new
 * public page is public by default. The old list worked the other way round: a
 * route nobody remembered to add became a page a signed-out visitor got bounced
 * off, which is the wrong failure for a marketing site.
 */
function RouteGuard({ children }: { children: React.ReactNode }) {
  const colors = useThemeColors();
  const { status, missingEnvKeys } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  const inMerchantApp = segments[0] === 'app';
  const inAuthGroup = inMerchantApp && segments[1] === '(auth)';
  const isPublicRoute = !inMerchantApp;

  React.useEffect(() => {
    if (status === 'loading' || isPublicRoute) return;

    if (status === 'signed-out' && !inAuthGroup) {
      router.replace('/app/sign-in');
    } else if (status === 'needs-business' && segments[2] !== 'setup-business') {
      router.replace('/app/setup-business');
    } else if (status === 'signed-in' && inAuthGroup) {
      router.replace('/app');
    }
  }, [status, isPublicRoute, inAuthGroup, segments, router]);

  if (status === 'unconfigured' && !isPublicRoute) {
    return <ConfigurationNeeded missing={missingEnvKeys} />;
  }

  if (status === 'loading' && !isPublicRoute) {
    return (
      <View className="flex-1 items-center justify-center bg-brand-bg">
        <ActivityIndicator size="large" color={colors['accent']} />
      </View>
    );
  }

  return <>{children}</>;
}

/**
 * Shown instead of the app when there is no backend to talk to.
 *
 * The previous build pointed a missing configuration at a fake demo host and
 * fell back to mock data on every error, so an entirely unconfigured app looked
 * like a working one - which is why nobody noticed nothing reached a database.
 */
function ConfigurationNeeded({ missing }: { missing: string[] }) {
  return (
    <View className="flex-1 items-center justify-center bg-brand-bg p-6">
      <View className="w-full max-w-md rounded-3xl border border-brand-warning/30 bg-brand-surface p-6">
        <Text className="text-xl font-extrabold text-brand-text mb-2">Finish the setup</Text>
        <Text className="text-sm text-brand-text-muted leading-5 mb-4">
          NoParchi needs a Supabase project before it can store anything. Copy{' '}
          <Text className="font-mono text-brand-text">.env.example</Text> to{' '}
          <Text className="font-mono text-brand-text">.env</Text>, fill it in, and restart the
          dev server.
        </Text>
        <View className="rounded-2xl bg-brand-bg border border-brand-border p-3.5">
          {missing.map((key) => (
            <Text key={key} className="text-xs font-mono text-brand-warning leading-5">
              {key}
            </Text>
          ))}
        </View>
      </View>
    </View>
  );
}

/**
 * Everything that needs the resolved palette lives here rather than in
 * RootLayout, because RootLayout is what renders ThemeProvider - a hook call up
 * there runs outside the provider it is about to create.
 */
function ThemedShell() {
  const { colors, resolved } = useTheme();
  const segments = useSegments();

  /*
    The sample-data banner belongs anywhere sample data is shown - the merchant
    app and both customer pages. Not on the marketing site, which shows no
    account data at all, and where an amber warning about unsaved data is
    simply confusing to a visitor who has not signed up for anything.
  */
  const showsAccountData = segments.length > 0;

  return (
    <>
      {/* The bar's own glyphs need the opposite of the surface behind them. */}
      <StatusBar
        style={resolved === 'dark' ? 'light' : 'dark'}
        backgroundColor={colors['surface']}
      />
      {showsAccountData ? <PreviewBanner /> : null}
      <RouteGuard>
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: colors['bg'] },
          }}
        >
          <Stack.Screen name="index" />
          <Stack.Screen name="app" />
        </Stack>
      </RouteGuard>
    </>
  );
}

/**
 * Loads the brand faces, and reports whether it is safe to paint yet.
 *
 * The web answer is always yes, and that is not a shortcut. Static rendering
 * runs this component in Node, where there is no FontFace API for expo-font to
 * use, so `loaded` never becomes true - and a layout that returns null until it
 * does emits an empty shell for all 18 routes while still exiting 0. That
 * exact failure has bitten this project before. On web the browser applies the
 * faces as they arrive anyway, which is what a font swap is for.
 */
function useBrandFonts(): boolean {
  const [loaded, error] = useFonts(FONT_ASSETS);

  React.useEffect(() => {
    if (loaded || error) SplashScreen.hideAsync().catch(() => {});
  }, [loaded, error]);

  // An error here means a face is missing, not that the app is broken; render
  // in the fallback rather than holding the splash forever.
  return Platform.OS === 'web' || loaded || Boolean(error);
}

export default function RootLayout() {
  const fontsReady = useBrandFonts();

  if (!fontsReady) return null;

  return (
    <SafeAreaProvider>
      <LanguageProvider>
        <ThemeProvider>
          <AuthProvider>
            <AppProvider>
              <ThemedShell />
            </AppProvider>
          </AuthProvider>
        </ThemeProvider>
      </LanguageProvider>
    </SafeAreaProvider>
  );
}
