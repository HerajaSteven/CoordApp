import '../theme/globals.css';
import React, { useEffect } from 'react';
import { Stack } from 'expo-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts } from 'expo-font';
import {
  Poppins_400Regular,
  Poppins_500Medium,
  Poppins_600SemiBold,
  Poppins_700Bold,
} from '@expo-google-fonts/poppins';
import { useAuthStore } from '@/store/auth.store';
import { useNetworkSync } from '@/hooks/useNetworkSync';
import { initSentry } from '@/config/sentry';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { useRootScale } from '@/theme/rootScale';

initSentry();

/* Held open until Poppins is in — see RootLayout for why a frame of the
   system typeface is worse than a moment more of splash. */
void SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 2, staleTime: 1000 * 60 * 2, gcTime: 1000 * 60 * 10 },
  },
});

function AppContent() {
  const loadSession = useAuthStore((s) => s.loadSession);
  /* One number decides how large the whole design draws — see rootScale. */
  useRootScale();
  useNetworkSync();

  useEffect(() => {
    loadSession();
  }, [loadSession]);

  return (
    <>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen
          name="farm/[appId]"
          options={{ animation: 'slide_from_right' }}
        />
        <Stack.Screen
          name="verification/[appId]"
          options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
        />
        <Stack.Screen
          name="sites/[appId]"
          options={{ animation: 'slide_from_right' }}
        />
        <Stack.Screen
          name="units/[appId]"
          options={{ animation: 'slide_from_right' }}
        />
        <Stack.Screen
          name="incident/[appId]"
          options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
        />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  /*
    ── THE APP HAD NO FONT OF ITS OWN ────────────────────────────────────

    Nothing was ever loaded, so every screen rendered in whatever the
    device ships — Roboto on most Android phones, and something else
    entirely on the handsets that do not. A design drawn to one set of
    letterforms, laid out by another, on a device the designer never saw.

    Poppins is wider and rounder than Roboto at the same point size, so
    this also moves text within the boxes drawn for it. That is the point:
    the boxes were drawn for the real font.
  */
  const [fontsLoaded, fontError] = useFonts({
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_600SemiBold,
    Poppins_700Bold,
  });

  useEffect(() => {
    /*
      The splash stays up until the font is in, or until loading it has
      failed. Hiding it while the font is still coming shows a frame of
      the system typeface and then reflows the whole screen under the
      reader — and a font that fails to load must not hold the app
      hostage, so an error lets it through in the system face rather than
      on a splash screen forever.
    */
    if (fontsLoaded || fontError) {
      void SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) {
    return null;
  }

  return (
    <ErrorBoundary>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider>
          <QueryClientProvider client={queryClient}>
            <AppContent />
          </QueryClientProvider>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </ErrorBoundary>
  );
}
