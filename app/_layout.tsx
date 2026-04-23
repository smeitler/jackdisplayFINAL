
import { useRef } from "react";
import * as Notifications from "expo-notifications";
import { setAudioModeAsync } from "expo-audio";
import { AppProvider, useApp } from "@/lib/app-context";
import { JournalProvider } from "@/lib/journal-context";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import "react-native-reanimated";
import { Platform } from "react-native";
import "@/lib/_core/nativewind-pressable";
import { ThemeProvider } from "@/lib/theme-provider";
import { useColors } from "@/hooks/use-colors";
import { trpc, createTRPCClient } from "@/lib/trpc";
import { initManusRuntime } from "@/lib/_core/manus-runtime";
import { readAndClearCrashReport, formatCrashReport } from "@/lib/crash-diagnostics";
import { Alert } from "react-native";
import { useRouter, usePathname } from "expo-router";
// Live Activity helpers — loaded dynamically so expo-widgets (iOS-only native module)
// is never evaluated on web or Android, preventing the LinkingContext crash.
async function startAlarmActivitySafe(params: { alarmLabel: string; alarmTime: string }) {
  if (Platform.OS !== 'ios') return;
  const { startAlarmActivity } = await import('@/lib/live-activity');
  await startAlarmActivity(params);
}
async function endAlarmActivitySafe() {
  if (Platform.OS !== 'ios') return;
  const { endAlarmActivity } = await import('@/lib/live-activity');
  await endAlarmActivity();
}


// ── Notification handler (must be called before any notifications fire) ──────
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export const unstable_settings = {
  anchor: "(tabs)",
};

// ── Audio mode: allow playback in silent mode ─────────────────────────────────────────────
setAudioModeAsync({ playsInSilentMode: true }).catch(() => {});

// AlarmKit initialization is done inside RootLayout useEffect (see below)
// DO NOT call AlarmKit at module scope — it runs on a background dispatch queue
// and throws NSException if entitlements are missing, crashing the app before React mounts.

function CheckinGate() {
  const { lastCheckInDate } = useApp();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const now = new Date();
    const hour = now.getHours();
    const isCheckinTime = hour >= 20;
    const alreadyCheckedIn = lastCheckInDate === now.toDateString();
    const onCheckinScreen = pathname === '/checkin';
    const onAlarmScreen = pathname === '/alarm-ring' || pathname === '/alarm-journal' || pathname === '/alarm-meditation';

    if (isCheckinTime && !alreadyCheckedIn && !onCheckinScreen && !onAlarmScreen) {
      // Don't auto-navigate — let the user choose
    }
  }, [lastCheckInDate, pathname, router]);

  return null;
}

function NotificationHandler() {
  const router = useRouter();
  const { isLoaded } = useApp();
  const responseListener = useRef<Notifications.EventSubscription | null>(null);
  const receivedListener = useRef<Notifications.EventSubscription | null>(null);
  // Track whether the router is ready to accept navigation commands.
  // On cold launch (app killed), the JS bundle reloads and the router
  // isn't ready immediately — we queue the pending route and fire it
  // once the app context has finished loading (isLoaded = true).
  const pendingRoute = useRef<{ pathname: string; params?: Record<string, string> } | null>(null);
  const firedRef = useRef(false);
  // Prevent double navigation: both responseListener and getLastNotificationResponseAsync
  // can fire for the same cold-launch tap. This ref ensures we only navigate once.
  const navigatedRef = useRef(false);

  // Fire any queued cold-launch navigation once app context is fully loaded
  useEffect(() => {
    if (!isLoaded || !pendingRoute.current || firedRef.current) return;
    firedRef.current = true;
    const { pathname, params } = pendingRoute.current;
    pendingRoute.current = null;
    // Small extra delay to ensure the navigator stack is fully mounted after providers settle
    const t = setTimeout(() => {
      router.push({ pathname, params } as never);
    }, 150);
    return () => clearTimeout(t);
  }, [isLoaded, router]);

  function navigateToAlarmRing(data: { soundId?: string; snoozeMinutes?: string; meditationId?: string; practiceDuration?: string; assignedStackId?: string; alarmLabel?: string; alarmTime?: string }) {
    if (navigatedRef.current) return; // prevent double navigation
    navigatedRef.current = true;
    const params = {
      soundId: data.soundId ?? 'edm',
      snoozeMinutes: data.snoozeMinutes ?? '10',
      meditationId: data.meditationId ?? 'none',
      practiceDuration: data.practiceDuration ?? '10',
      assignedStackId: data.assignedStackId ?? '',
      alarmLabel: data.alarmLabel ?? 'Alarm',
      alarmTime: data.alarmTime ?? '',
    };
    startAlarmActivitySafe({
      alarmLabel: data.alarmLabel ?? 'Alarm',
      alarmTime: data.alarmTime ?? '',
    }).catch(() => {});
    router.push({ pathname: '/alarm-ring', params } as never);
  }

  useEffect(() => {
    // ── Foreground: notification received while app is open ──────────────────
    receivedListener.current = Notifications.addNotificationReceivedListener((notification) => {
      const data = notification.request.content.data as { action?: string; soundId?: string; snoozeMinutes?: string; meditationId?: string; practiceDuration?: string; assignedStackId?: string; alarmLabel?: string; alarmTime?: string };
      if (data?.action === 'open_alarm_ring') {
        navigateToAlarmRing(data);
      }
    });

    // ── Background: user tapped notification banner ──────────────────────────
    responseListener.current = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as { action?: string; soundId?: string; snoozeMinutes?: string; meditationId?: string; practiceDuration?: string; assignedStackId?: string; alarmLabel?: string; alarmTime?: string };
      if (data?.action === 'open_alarm_ring') {
        navigateToAlarmRing(data);
      } else if (data?.action === 'open_checkin') {
        router.push('/checkin?fromAlarm=1' as never);
      }
    });

    // ── Cold launch: app opened by tapping a notification ────────────────────
    // getLastNotificationResponseAsync() is called immediately but the router
    // may not be ready yet (JS bundle just reloaded). We queue the navigation
    // and fire it once routerReady flips to true (see effect above).
    if (Platform.OS !== 'web') {
      Notifications.getLastNotificationResponseAsync().then((response) => {
        if (!response) return;
        const data = response.notification.request.content.data as { action?: string; soundId?: string; snoozeMinutes?: string; meditationId?: string; practiceDuration?: string; assignedStackId?: string; alarmLabel?: string; alarmTime?: string };
        if (data?.action === 'open_alarm_ring') {
          startAlarmActivitySafe({
            alarmLabel: data.alarmLabel ?? 'Alarm',
            alarmTime: data.alarmTime ?? '',
          }).catch(() => {});
          // Queue the navigation — it will fire once routerReady is true
          pendingRoute.current = {
            pathname: '/alarm-ring',
            params: {
              soundId: data.soundId ?? 'edm',
              snoozeMinutes: data.snoozeMinutes ?? '10',
              meditationId: data.meditationId ?? 'none',
              practiceDuration: data.practiceDuration ?? '10',
              assignedStackId: data.assignedStackId ?? '',
              alarmLabel: data.alarmLabel ?? 'Alarm',
              alarmTime: data.alarmTime ?? '',
            },
          };
        } else if (data?.action === 'open_checkin') {
          pendingRoute.current = { pathname: '/checkin', params: { fromAlarm: '1' } };
        }
      });
    }

    return () => {
      responseListener.current?.remove();
      receivedListener.current?.remove();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  return null;
}

// ThemedStack is inside ThemeProvider so it can read the active theme colors
// and pass them as contentStyle to prevent react-navigation's default
// grey (rgb(242,242,242)) background from showing through.
function ThemedStack() {
  const colors = useColors();
  const bgStyle = { backgroundColor: colors.background };
  return (
    // contentStyle is NOT applied to (tabs) — the tab screens manage their own
    // backgrounds via ScreenContainer. Applying contentStyle to (tabs) caused
    // blank content areas on native iOS (layout conflict with tab flex tree).
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="login" options={{ presentation: 'fullScreenModal', contentStyle: bgStyle }} />
      <Stack.Screen name="oauth/callback" />
      <Stack.Screen name="checkin" options={{ presentation: 'modal', contentStyle: bgStyle }} />
      <Stack.Screen name="habits" options={{ presentation: 'modal', contentStyle: bgStyle }} />
      <Stack.Screen name="alarm-preview" options={{ presentation: 'modal', contentStyle: bgStyle }} />
      <Stack.Screen name="crowpanel-preview" options={{ presentation: 'modal', contentStyle: bgStyle }} />
      <Stack.Screen name="category-detail" options={{ presentation: 'modal', contentStyle: bgStyle }} />
      <Stack.Screen name="habit-detail" options={{ presentation: 'modal', contentStyle: bgStyle }} />
      <Stack.Screen name="mind-dump" options={{ presentation: 'modal', contentStyle: bgStyle }} />
      <Stack.Screen name="team/[id]" options={{ presentation: 'modal', contentStyle: bgStyle }} />
      <Stack.Screen name="team/chat/[id]" options={{ presentation: 'modal', contentStyle: bgStyle }} />
      <Stack.Screen name="permissions-setup" options={{ presentation: 'fullScreenModal', contentStyle: bgStyle }} />
      <Stack.Screen name="practice-player" options={{ presentation: 'fullScreenModal', contentStyle: bgStyle }} />
      <Stack.Screen name="morning-practice-catalog" options={{ presentation: 'modal', contentStyle: bgStyle }} />
      <Stack.Screen name="voice-checkin" options={{ presentation: 'fullScreenModal', headerShown: false, contentStyle: bgStyle }} />
      <Stack.Screen name="alarm-ring" options={{ presentation: 'fullScreenModal', headerShown: false, gestureEnabled: false, contentStyle: bgStyle }} />
      <Stack.Screen name="alarm-journal" options={{ presentation: 'fullScreenModal', headerShown: false, contentStyle: bgStyle }} />
      <Stack.Screen name="alarm-meditation" options={{ presentation: 'fullScreenModal', headerShown: false, contentStyle: bgStyle }} />
    </Stack>
  );
}

export default function RootLayout() {
  // Initialize Manus runtime for cookie injection from parent container
  useEffect(() => {
    initManusRuntime();
  }, []);

  // ── Crash Diagnostics: check for crash report from previous launch ─────────
  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    (async () => {
      try {
        const report = await readAndClearCrashReport();
        if (report) {
          const formatted = formatCrashReport(report);
          console.error('[CrashDiagnostics] Previous crash:', formatted);
          Alert.alert(
            '⚠️ Previous Crash Detected',
            `Exception: ${report.name}\n\nReason: ${report.reason}`,
            [
              {
                text: 'Copy Full Report',
                onPress: async () => {
                  try {
                    const Clipboard = await import('expo-clipboard');
                    await Clipboard.setStringAsync(formatted);
                  } catch { /* clipboard unavailable */ }
                },
              },
              { text: 'Dismiss', style: 'cancel' },
            ]
          );
        }
      } catch {
        // Never crash the app trying to read a crash report
      }
    })();
  }, []);

  // ── AlarmKit: configure App Group after React mounts ──────────────────────
  // IMPORTANT: Must be inside useEffect, NOT at module scope.
  // At module scope it runs on a background dispatch queue before React is ready,
  // and if entitlements are missing it throws NSException crashing the app.
  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    let cancelled = false;
    (async () => {
      try {
        const { configureAlarmKit } = await import('@/lib/alarm-kit');
        if (!cancelled) await configureAlarmKit();
      } catch {
        // AlarmKit unavailable or entitlement missing — app continues without it
      }
    })();
    return () => { cancelled = true; };
  }, []);

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

  // In SDK 55, ExpoRoot already provides SafeAreaProvider and NavigationContainer.
  // We only wrap with ThemeProvider, GestureHandlerRootView, and our app providers.
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <trpc.Provider client={trpcClient} queryClient={queryClient}>
        <QueryClientProvider client={queryClient}>
          <ThemeProvider>
            <AppProvider>
              <JournalProvider>
                <NotificationHandler />
                <CheckinGate />
                <ThemedStack />
                <StatusBar style="auto" />
              </JournalProvider>
            </AppProvider>
          </ThemeProvider>
        </QueryClientProvider>
      </trpc.Provider>
    </GestureHandlerRootView>
  );
}
