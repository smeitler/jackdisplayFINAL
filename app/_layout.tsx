import "@/global.css";
import { useRef } from "react";
import * as Notifications from "expo-notifications";
import { AppProvider, useApp } from "@/lib/app-context";
import { JournalProvider } from "@/lib/journal-context";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useMemo, useState } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import "react-native-reanimated";
import { Platform } from "react-native";
import "@/lib/_core/nativewind-pressable";
import { ThemeProvider } from "@/lib/theme-provider";
import {
  SafeAreaFrameContext,
  SafeAreaInsetsContext,
  SafeAreaProvider,
  initialWindowMetrics,
} from "react-native-safe-area-context";
import type { EdgeInsets, Metrics, Rect } from "react-native-safe-area-context";

import { trpc, createTRPCClient } from "@/lib/trpc";
import { initManusRuntime, subscribeSafeAreaInsets } from "@/lib/_core/manus-runtime";
import { useRouter, usePathname } from "expo-router";

const DEFAULT_WEB_INSETS: EdgeInsets = { top: 0, right: 0, bottom: 0, left: 0 };
const DEFAULT_WEB_FRAME: Rect = { x: 0, y: 0, width: 0, height: 0 };

export const unstable_settings = {
  anchor: "(tabs)",
};

function CheckinGate() {
  const router = useRouter();
  const pathname = usePathname();
  const { alarm, isPendingCheckIn, isLoaded } = useApp();

  useEffect(() => {
    if (!isLoaded) return;
    if (!alarm.requireCheckin) return;
    if (!isPendingCheckIn) return;
    // Don't redirect if already on check-in, alarm-preview, or login screens
    if (
      pathname === '/checkin' ||
      pathname === '/alarm-preview' ||
      pathname === '/login' ||
      pathname.startsWith('/oauth')
    ) return;
    router.push('/checkin?fromAlarm=1' as never);
  }, [isLoaded, alarm.requireCheckin, isPendingCheckIn, pathname, router]);

  return null;
}

function NotificationHandler() {
  const router = useRouter();
  const responseListener = useRef<Notifications.EventSubscription | null>(null);

  useEffect(() => {
    responseListener.current = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as { action?: string };
      if (data?.action === 'open_checkin') {
        router.push('/checkin?fromAlarm=1' as never);
      }
    });
    return () => { responseListener.current?.remove(); };
  }, [router]);

  return null;
}

export default function RootLayout() {
  const initialInsets = initialWindowMetrics?.insets ?? DEFAULT_WEB_INSETS;
  const initialFrame = initialWindowMetrics?.frame ?? DEFAULT_WEB_FRAME;

  const [insets, setInsets] = useState<EdgeInsets>(initialInsets);
  const [frame, setFrame] = useState<Rect>(initialFrame);

  // Initialize Manus runtime for cookie injection from parent container
  useEffect(() => {
    initManusRuntime();
  }, []);

  const handleSafeAreaUpdate = useCallback((metrics: Metrics) => {
    setInsets(metrics.insets);
    setFrame(metrics.frame);
  }, []);

  useEffect(() => {
    if (Platform.OS !== "web") return;
    const unsubscribe = subscribeSafeAreaInsets(handleSafeAreaUpdate);
    return () => unsubscribe();
  }, [handleSafeAreaUpdate]);

  // Create clients once and reuse them
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Disable automatic refetching on window focus for mobile
            refetchOnWindowFocus: false,
            // Retry failed requests once
            retry: 1,
          },
        },
      }),
  );
  const [trpcClient] = useState(() => createTRPCClient());

  // Use actual device insets — do NOT override with hardcoded minimums as that
  // prevents the real notch height from being applied on physical devices.
  const providerInitialMetrics = useMemo(() => {
    return initialWindowMetrics ?? { insets: initialInsets, frame: initialFrame };
  }, [initialInsets, initialFrame]);

  const content = (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <trpc.Provider client={trpcClient} queryClient={queryClient}>
        <QueryClientProvider client={queryClient}>
          <AppProvider>
            <JournalProvider>
            {/* Default to hiding native headers so raw route segments don't appear (e.g. "(tabs)", "products/[id]"). */}
            {/* If a screen needs the native header, explicitly enable it and set a human title via Stack.Screen options. */}
            {/* in order for ios apps tab switching to work properly, use presentation: "fullScreenModal" for login page, whenever you decide to use presentation: "modal*/}
            <NotificationHandler />
            <CheckinGate />
            <Stack screenOptions={{ headerShown: false }}>
              <Stack.Screen name="(tabs)" />
              <Stack.Screen name="login" options={{ presentation: 'fullScreenModal' }} />
              <Stack.Screen name="oauth/callback" />
              <Stack.Screen name="checkin" options={{ presentation: 'modal' }} />
              <Stack.Screen name="habits" options={{ presentation: 'modal' }} />
              <Stack.Screen name="alarm-preview" options={{ presentation: 'modal' }} />
              <Stack.Screen name="crowpanel-preview" options={{ presentation: 'modal' }} />
              <Stack.Screen name="category-detail" options={{ presentation: 'modal' }} />
              <Stack.Screen name="habit-detail" options={{ presentation: 'modal' }} />
              <Stack.Screen name="mind-dump" options={{ presentation: 'modal' }} />
              <Stack.Screen name="team/[id]" options={{ presentation: 'modal' }} />
              <Stack.Screen name="team/chat/[id]" options={{ presentation: 'modal' }} />
              <Stack.Screen name="permissions-setup" options={{ presentation: 'fullScreenModal' }} />
              <Stack.Screen name="practice-player" options={{ presentation: 'fullScreenModal' }} />
              <Stack.Screen name="morning-practice-catalog" options={{ presentation: 'modal' }} />
              <Stack.Screen name="voice-checkin" options={{ presentation: 'fullScreenModal', headerShown: false }} />
            </Stack>
            <StatusBar style="auto" />
            </JournalProvider>
          </AppProvider>
        </QueryClientProvider>
      </trpc.Provider>
    </GestureHandlerRootView>
  );

  const shouldOverrideSafeArea = Platform.OS === "web";

  if (shouldOverrideSafeArea) {
    return (
      <ThemeProvider>
        <SafeAreaProvider initialMetrics={providerInitialMetrics}>
          <SafeAreaFrameContext.Provider value={frame}>
            <SafeAreaInsetsContext.Provider value={insets}>
              {content}
            </SafeAreaInsetsContext.Provider>
          </SafeAreaFrameContext.Provider>
        </SafeAreaProvider>
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider>
      <SafeAreaProvider initialMetrics={providerInitialMetrics}>{content}</SafeAreaProvider>
    </ThemeProvider>
  );
}
