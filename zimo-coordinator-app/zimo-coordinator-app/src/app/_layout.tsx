import '../theme/globals.css';
import React, { useEffect } from 'react';
import { Stack } from 'expo-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StatusBar } from 'expo-status-bar';
import { useAuthStore } from '@/store/auth.store';
import { useNetworkSync } from '@/hooks/useNetworkSync';
import { initSentry } from '@/config/sentry';
import { ErrorBoundary } from '@/components/ErrorBoundary';

initSentry();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 2, staleTime: 1000 * 60 * 2, gcTime: 1000 * 60 * 10 },
  },
});

function AppContent() {
  const loadSession = useAuthStore((s) => s.loadSession);
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
  return (
    <ErrorBoundary>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <QueryClientProvider client={queryClient}>
          <AppContent />
        </QueryClientProvider>
      </GestureHandlerRootView>
    </ErrorBoundary>
  );
}
