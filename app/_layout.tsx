
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

import { trpc, createTRPCClient } from "@/lib/trpc";
import { initManusRuntime } from "@/lib/_core/manus-runtime";
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

// ── Audio mode: allow playback in silent mode ─────────────────────────────────
setAudioModeAsync({ playsInSilentMode: true }).catch(() => {});

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
  const responseListener = useRef<Notifications.EventSubscription | null>(null);
  const receivedListener = useRef<Notifications.EventSubscription | null>(null);

  useEffect(() => {
    // ── Foreground: notification received while app is open ──────────────────
    receivedListener.current = Notifications.addNotificationReceivedListener((notification) => {
      const data = notification.request.content.data as { action?: string; soundId?: string; snoozeMinutes?: string; meditationId?: string; practiceDuration?: string; assignedStackId?: string; alarmLabel?: string; alarmTime?: string };
      if (data?.action === 'open_alarm_ring') {
        // Start Live Activity when alarm fires while app is in foreground
        startAlarmActivitySafe({
          alarmLabel: data.alarmLabel ?? 'Alarm',
          alarmTime: data.alarmTime ?? '',
        }).catch(() => {});
        router.push({
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
        } as never);
      }
    });

    // ── Background: user tapped notification banner ──────────────────────────
    responseListener.current = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as { action?: string; soundId?: string; snoozeMinutes?: string; meditationId?: string; practiceDuration?: string; assignedStackId?: string; alarmLabel?: string; alarmTime?: string };
      if (data?.action === 'open_alarm_ring') {
        // Start Live Activity when user taps the notification banner
        startAlarmActivitySafe({
          alarmLabel: data.alarmLabel ?? 'Alarm',
          alarmTime: data.alarmTime ?? '',
        }).catch(() => {});
        router.push({
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
        } as never);
      } else if (data?.action === 'open_checkin') {
        router.push('/checkin?fromAlarm=1' as never);
      }
    });

    // ── Cold launch: app opened by tapping a notification ────────────────────
    if (Platform.OS !== 'web') {
      Notifications.getLastNotificationResponseAsync().then((response) => {
        if (response) {
          const data = response.notification.request.content.data as { action?: string; soundId?: string; snoozeMinutes?: string; meditationId?: string; practiceDuration?: string; assignedStackId?: string; alarmLabel?: string; alarmTime?: string };
          if (data?.action === 'open_alarm_ring') {
            // Start Live Activity on cold launch (app was killed)
            startAlarmActivitySafe({
              alarmLabel: data.alarmLabel ?? 'Alarm',
              alarmTime: data.alarmTime ?? '',
            }).catch(() => {});
            router.push({
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
            } as never);
          } else if (data?.action === 'open_checkin') {
            router.push('/checkin?fromAlarm=1' as never);
          }
        }
      });
    }

    return () => {
      responseListener.current?.remove();
      receivedListener.current?.remove();
    };
  }, [router]);

  return null;
}

export default function RootLayout() {
  // Initialize Manus runtime for cookie injection from parent container
  useEffect(() => {
    initManusRuntime();
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
                  <Stack.Screen name="alarm-ring" options={{ presentation: 'fullScreenModal', headerShown: false, gestureEnabled: false }} />
                  <Stack.Screen name="alarm-journal" options={{ presentation: 'fullScreenModal', headerShown: false }} />
                  <Stack.Screen name="alarm-meditation" options={{ presentation: 'fullScreenModal', headerShown: false }} />
                </Stack>
                <StatusBar style="auto" />
              </JournalProvider>
            </AppProvider>
          </ThemeProvider>
        </QueryClientProvider>
      </trpc.Provider>
    </GestureHandlerRootView>
  );
}
