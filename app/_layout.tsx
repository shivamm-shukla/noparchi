import React from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import theme from '../src/config/theme';
import { AuthProvider, useAuth } from '../src/context/AuthContext';
import { AppProvider } from '../src/context/AppContext';
import '../global.css';

/**
 * Routes a stranger may open without signing in.
 *
 * This is the app-less half of the product: a customer scans the gate QR and
 * lands on /pay/<merchantId> with no account and no install, then keeps their
 * pass at /ticket/<code>. Both read through anon-executable RPCs that return
 * only non-sensitive fields, so leaving them open exposes no merchant data.
 */
const PUBLIC_SEGMENTS = ['pay', 'ticket'];

function RouteGuard({ children }: { children: React.ReactNode }) {
  const { status, missingEnvKeys } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  const isPublicRoute = PUBLIC_SEGMENTS.includes(segments[0] as string);
  const inAuthGroup = segments[0] === '(auth)';

  React.useEffect(() => {
    if (status === 'loading' || isPublicRoute) return;

    if (status === 'signed-out' && !inAuthGroup) {
      router.replace('/(auth)/sign-in');
    } else if (status === 'needs-business' && segments[1] !== 'setup-business') {
      router.replace('/(auth)/setup-business');
    } else if (status === 'signed-in' && inAuthGroup) {
      router.replace('/(tabs)');
    }
  }, [status, isPublicRoute, inAuthGroup, segments, router]);

  if (status === 'unconfigured' && !isPublicRoute) {
    return <ConfigurationNeeded missing={missingEnvKeys} />;
  }

  if (status === 'loading' && !isPublicRoute) {
    return (
      <View className="flex-1 items-center justify-center bg-slate-950">
        <ActivityIndicator size="large" color={theme.semantic.accent} />
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
    <View className="flex-1 items-center justify-center bg-slate-950 p-6">
      <View className="w-full max-w-md rounded-3xl border border-amber-500/30 bg-slate-900 p-6">
        <Text className="text-xl font-extrabold text-slate-100 mb-2">Finish the setup</Text>
        <Text className="text-sm text-slate-400 leading-5 mb-4">
          NoParchi needs a Supabase project before it can store anything. Copy{' '}
          <Text className="font-mono text-slate-200">.env.example</Text> to{' '}
          <Text className="font-mono text-slate-200">.env</Text>, fill it in, and restart the
          dev server.
        </Text>
        <View className="rounded-2xl bg-slate-950 border border-slate-800 p-3.5">
          {missing.map((key) => (
            <Text key={key} className="text-xs font-mono text-amber-300 leading-5">
              {key}
            </Text>
          ))}
        </View>
      </View>
    </View>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <AppProvider>
          <StatusBar style="light" backgroundColor={theme.semantic.surface} />
          <RouteGuard>
            <Stack
              screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: theme.semantic.bg },
              }}
            >
              <Stack.Screen name="(tabs)" />
              <Stack.Screen name="(auth)" />
            </Stack>
          </RouteGuard>
        </AppProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
