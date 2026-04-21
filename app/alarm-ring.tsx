/**
 * AlarmRingScreen — Full-screen alarm that fires when the user taps the notification.
 *
 * Layout:
 *   - Dark full-screen overlay with pulsing glow
 *   - Current time (large)
 *   - "Good morning" greeting
 *   - Two buttons: WAKE UP (primary) and SNOOZE (secondary)
 *
 * Audio: plays the alarm sound in a loop using expo-audio.
 * On Wake Up: stops sound → navigates to /alarm-journal
 * On Snooze: stops sound → schedules a one-time notification in snoozeMinutes → goes home
 */

import { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Animated,
  Easing,
  Platform,
  Dimensions,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import * as Notifications from 'expo-notifications';
import * as Haptics from 'expo-haptics';
import { useApp } from '@/lib/app-context';

const { width: W, height: H } = Dimensions.get('window');

// Alarm sound sources keyed by soundId — MP3 only (WAV removed)
const SOUND_SOURCES: Record<string, ReturnType<typeof require> | { uri: string }> = {
  classic:    require('@/assets/audio/alarm_classic.mp3'),
  edm:        { uri: 'https://d2xsxph8kpxj0f.cloudfront.net/310519663287248938/bFcyWdAL5JXed3bpyDvBEf/alarm_edm_ce8fe03f.mp3' },
  fulltrack:  { uri: 'https://d2xsxph8kpxj0f.cloudfront.net/310519663287248938/bFcyWdAL5JXed3bpyDvBEf/alarm_fulltrack_6082bd59.mp3' },
  prisonbell: { uri: 'https://d2xsxph8kpxj0f.cloudfront.net/310519663287248938/bFcyWdAL5JXed3bpyDvBEf/alarm_prisonbell_9d68b4d6.mp3' },
  stomp4k:    { uri: 'https://d2xsxph8kpxj0f.cloudfront.net/310519663287248938/bFcyWdAL5JXed3bpyDvBEf/alarm_stomp4k_be7c271e.mp3' },
  stomp5k:    { uri: 'https://d2xsxph8kpxj0f.cloudfront.net/310519663287248938/bFcyWdAL5JXed3bpyDvBEf/alarm_stomp5k_e7c316e0.mp3' },
};

function getSource(soundId?: string) {
  return SOUND_SOURCES[soundId ?? 'edm'] ?? SOUND_SOURCES.edm;
}

function formatTime(date: Date): string {
  const h = date.getHours();
  const m = date.getMinutes();
  const period = h >= 12 ? 'PM' : 'AM';
  const hh = h % 12 === 0 ? 12 : h % 12;
  return `${hh}:${String(m).padStart(2, '0')} ${period}`;
}

function formatDate(date: Date): string {
  return date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

export default function AlarmRingScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { alarm } = useApp();
  const params = useLocalSearchParams<{ soundId?: string; snoozeMinutes?: string; meditationId?: string; practiceDuration?: string; assignedStackId?: string }>();

  const soundId = params.soundId ?? alarm.soundId ?? 'edm';
  const snoozeMinutes = parseInt(params.snoozeMinutes ?? String(alarm.snoozeMinutes ?? 10), 10);
  const meditationId = params.meditationId ?? alarm.meditationId ?? 'none';
  const practiceDuration = parseInt(params.practiceDuration ?? String((alarm.practiceDurations?.[meditationId] ?? 10)), 10);
  // The ritual stack to launch after dismissing the alarm (empty string = none)
  const assignedStackId = params.assignedStackId ?? (alarm as typeof alarm & { assignedStackId?: string }).assignedStackId ?? '';

  const [now, setNow] = useState(new Date());
  const [snoozed, setSnoozed] = useState(false);
  const playerRef = useRef<ReturnType<typeof createAudioPlayer> | null>(null);

  // Pulsing glow animation
  const glowAnim = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, { toValue: 1, duration: 1200, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(glowAnim, { toValue: 0.4, duration: 1200, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    ).start();
  }, []);

  // Clock tick
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Start alarm sound
  useEffect(() => {
    let mounted = true;
    async function startAlarm() {
      try {
        await setAudioModeAsync({ playsInSilentMode: true });
        const source = getSource(soundId) as Parameters<typeof createAudioPlayer>[0];
        const player = createAudioPlayer(source);
        player.loop = true;
        player.play();
        if (mounted) playerRef.current = player;
      } catch (e) {
        console.warn('[AlarmRing] Audio error:', e);
      }
    }
    startAlarm();
    return () => {
      mounted = false;
      playerRef.current?.remove();
      playerRef.current = null;
    };
  }, [soundId]);

  function stopSound() {
    try {
      playerRef.current?.pause();
      playerRef.current?.remove();
      playerRef.current = null;
    } catch {}
  }

  async function handleWakeUp() {
    if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    stopSound();
    // If a ritual stack is assigned, launch it directly; otherwise go home
    if (assignedStackId) {
      router.replace({
        pathname: '/stack-player',
        params: { id: assignedStackId },
      } as never);
    } else {
      router.replace('/(tabs)' as never);
    }
  }

  async function handleSnooze() {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    stopSound();
    setSnoozed(true);

    // Schedule a one-time notification in snoozeMinutes
    if (Platform.OS !== 'web') {
      try {
        await Notifications.scheduleNotificationAsync({
          content: {
            title: `Snooze over — time to wake up! ⏰`,
            body: 'Your alarm is ringing again.',
            data: { action: 'open_alarm_ring', soundId, snoozeMinutes: String(snoozeMinutes), meditationId, practiceDuration: String(practiceDuration), assignedStackId },
            sound: 'alarm_classic.wav',
            ...(Platform.OS === 'ios' ? { interruptionLevel: 'timeSensitive' as const } : {}),
            priority: 'max',
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
            seconds: snoozeMinutes * 60,
            repeats: false,
            channelId: Platform.OS === 'android' ? 'jack-alarm' : undefined,
          },
        });
      } catch (e) {
        console.warn('[AlarmRing] Snooze schedule error:', e);
      }
    }

    router.replace('/(tabs)' as never);
  }

  return (
    <View style={styles.container}>
      {/* Pulsing background glow */}
      <Animated.View style={[styles.glow, { opacity: glowAnim }]} />

      <View style={[styles.content, { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 32 }]}>
        {/* Date */}
        <Text style={styles.dateText}>{formatDate(now)}</Text>

        {/* Time */}
        <Text style={styles.timeText}>{formatTime(now)}</Text>

        {/* Greeting */}
        <Text style={styles.greetingText}>Good morning ☀️</Text>

        {snoozed ? (
          <Text style={styles.snoozedText}>Snoozed for {snoozeMinutes} min</Text>
        ) : (
          <View style={styles.buttonContainer}>
            {/* Wake Up — primary */}
            <Pressable
              style={({ pressed }) => [styles.wakeBtn, pressed && { opacity: 0.85, transform: [{ scale: 0.97 }] }]}
              onPress={handleWakeUp}
            >
              <Text style={styles.wakeBtnText}>Wake Up</Text>
            </Pressable>

            {/* Snooze — secondary */}
            <Pressable
              style={({ pressed }) => [styles.snoozeBtn, pressed && { opacity: 0.75 }]}
              onPress={handleSnooze}
            >
              <Text style={styles.snoozeBtnText}>Snooze {snoozeMinutes} min</Text>
            </Pressable>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a1a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  glow: {
    ...StyleSheet.absoluteFillObject,
    // Radial-like glow via a large rounded view
    borderRadius: W,
    width: W * 1.5,
    height: W * 1.5,
    top: H * 0.1,
    left: -(W * 0.25),
    backgroundColor: 'rgba(59,130,246,0.15)',
  },
  content: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 32,
  },
  dateText: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.55)',
    fontWeight: '500',
    letterSpacing: 0.3,
    textAlign: 'center',
  },
  timeText: {
    fontSize: 72,
    fontWeight: '200',
    color: '#ffffff',
    letterSpacing: -2,
    textAlign: 'center',
    marginTop: 8,
  },
  greetingText: {
    fontSize: 24,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.85)',
    textAlign: 'center',
    marginTop: 8,
  },
  buttonContainer: {
    width: '100%',
    gap: 16,
    alignItems: 'center',
  },
  wakeBtn: {
    width: '100%',
    backgroundColor: '#3B82F6',
    borderRadius: 18,
    paddingVertical: 20,
    alignItems: 'center',
    shadowColor: '#3B82F6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 8,
  },
  wakeBtnText: {
    fontSize: 20,
    fontWeight: '700',
    color: '#ffffff',
    letterSpacing: 0.3,
  },
  snoozeBtn: {
    width: '100%',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 18,
    paddingVertical: 18,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  snoozeBtnText: {
    fontSize: 17,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.7)',
  },
  snoozedText: {
    fontSize: 18,
    color: 'rgba(255,255,255,0.5)',
    fontStyle: 'italic',
  },
});
