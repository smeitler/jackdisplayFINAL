import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { AlarmConfig, saveAlarms, loadAlarms } from './storage';

// NOTE: setNotificationHandler is called in app/_layout.tsx (NotificationHandler component)
// so it runs before any notification fires. Do NOT call it here to avoid race conditions.

export const CHANNEL_ID = 'jack-alarm';

export async function requestNotificationPermissions(): Promise<boolean> {
  if (Platform.OS === 'android') {
    // On Android 8+, sound is controlled by the channel — must set it here.
    // Use alarm_classic.wav as the notification sound (bundled via expo-notifications plugin).
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: 'Jack Daily Alarm',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#3B82F6',
      sound: 'alarm_classic.wav',
      bypassDnd: true,
    });
  }

  const { status: existing } = await Notifications.getPermissionsAsync();
  if (existing === 'granted') return true;

  const { status } = await Notifications.requestPermissionsAsync({
    ios: {
      allowAlert: true,
      allowBadge: true,
      allowSound: true,
      // provideAppNotificationSettings: shows Jack in iOS Focus filter settings
      provideAppNotificationSettings: true,
    },
  });
  return status === 'granted';
}

/**
 * Maps a soundId string to the bundled notification sound filename.
 *
 * IMPORTANT: Only sounds listed in the expo-notifications plugin `sounds` array
 * in app.config.ts can be used as notification sounds — they must be bundled
 * into the native app at build time.
 *
 * Remote MP3 URLs (edm, fulltrack, prisonbell, stomp4k, stomp5k) are used for
 * in-app audio playback on the alarm-ring screen, NOT for notification sounds.
 * All soundIds that don't have a bundled .wav fall back to alarm_classic.wav.
 *
 * The notification sound plays when the banner appears; the full alarm track
 * plays when the user taps the notification and the alarm-ring screen opens.
 */
function getSoundFilename(soundId?: string): string {
  const map: Record<string, string> = {
    classic:    'alarm_classic.wav',
    buzzer:     'alarm_buzzer.wav',
    digital:    'alarm_digital.wav',
    gentle:     'alarm_gentle.wav',
    urgent:     'alarm_urgent.wav',
    // Remote-only sounds — no bundled .wav, use classic as notification sound
    // (the actual track plays in alarm-ring screen via expo-audio)
    edm:        'alarm_classic.wav',
    fulltrack:  'alarm_classic.wav',
    prisonbell: 'alarm_classic.wav',
    stomp4k:    'alarm_classic.wav',
    stomp5k:    'alarm_classic.wav',
    drumming:   'alarm_classic.wav',
  };
  return map[soundId ?? 'classic'] ?? 'alarm_classic.wav';
}

/** Schedule one notification per enabled day-of-week. Returns notification IDs. */
export async function scheduleAlarm(config: AlarmConfig): Promise<string[]> {
  // Cancel any previously scheduled alarms
  await cancelAlarm(config);

  if (!config.isEnabled || config.days.length === 0) return [];

  // Use the registered .wav sound file on both platforms.
  // On Android, the channel sound is 'default' but per-notification sound overrides it.
  const soundFile = getSoundFilename(config.soundId);
  const ids: string[] = [];

  for (const day of config.days) {
    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title: "Good morning! ☀️",
        body: "Your alarm is ringing — tap to wake up.",
        data: {
          action: 'open_alarm_ring',
          soundId: config.soundId ?? 'classic',
          snoozeMinutes: String(config.snoozeMinutes ?? 10),
          meditationId: config.meditationId ?? 'none',
          practiceDuration: String(
            config.practiceDurations?.[config.meditationId ?? 'none'] ?? 10
          ),
          // Pass the assigned stack ID so the alarm ring screen can launch it
          assignedStackId: (config as AlarmConfig & { assignedStackId?: string }).assignedStackId ?? '',
        },
        sound: soundFile,
        // timeSensitive: breaks through Focus modes (Sleep Focus, Work Focus, etc.) on iOS 15+
        // without requiring a special Apple entitlement.
        // NOTE: timeSensitive does NOT bypass the hardware mute switch — only 'critical' does,
        // and that requires Apple entitlement approval. The alarm-ring screen plays audio via
        // expo-audio with playsInSilentMode:true which DOES bypass the mute switch.
        ...(Platform.OS === 'ios' ? { interruptionLevel: 'timeSensitive' as const } : {}),
        // Android: highest priority channel ensures alarm-level delivery
        priority: 'max',
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
        // Expo weekday: 1=Sunday, 2=Monday, …, 7=Saturday
        // Our days array: 0=Sunday, 1=Monday, …, 6=Saturday
        // Mapping: day + 1 (0→1=Sun, 1→2=Mon, …, 6→7=Sat) ✓
        weekday: day + 1,
        hour: config.hour,
        minute: config.minute,
        repeats: true,
        channelId: Platform.OS === 'android' ? CHANNEL_ID : undefined,
      } as Notifications.WeeklyTriggerInput,
    });
    ids.push(id);
  }

  return ids;
}

export async function cancelAlarm(config: AlarmConfig): Promise<void> {
  for (const id of config.notificationIds) {
    try {
      await Notifications.cancelScheduledNotificationAsync(id);
    } catch {
      // ignore
    }
  }
}

export async function cancelAllAlarms(): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync();
}

/** Save alarm config with new notification IDs after scheduling. */
export async function applyAlarm(config: AlarmConfig): Promise<AlarmConfig> {
  // Web doesn't support push notifications — just persist the config as-is
  if (Platform.OS === 'web') {
    const updated = { ...config, notificationIds: [] };
    const alarms = await loadAlarms();
    const alarmId = (config as AlarmConfig & { id?: string }).id;
    const idx = alarms.findIndex((a) => a.id === alarmId);
    const entry = updated as unknown as typeof alarms[0];
    if (idx >= 0) { alarms[idx] = entry; } else { alarms.push(entry); }
    await saveAlarms(alarms);
    return updated;
  }

  const granted = await requestNotificationPermissions();
  if (!granted) {
    const updated = { ...config, isEnabled: false, notificationIds: [] };
    const alarms = await loadAlarms();
    const alarmId = (config as AlarmConfig & { id?: string }).id;
    const idx = alarms.findIndex((a) => a.id === alarmId);
    const entry = updated as unknown as typeof alarms[0];
    if (idx >= 0) { alarms[idx] = entry; } else { alarms.push(entry); }
    await saveAlarms(alarms);
    return updated;
  }

  const ids = await scheduleAlarm(config);
  const updated = { ...config, notificationIds: ids };
  const alarms = await loadAlarms();
  const alarmId = (config as AlarmConfig & { id?: string }).id;
  const idx = alarms.findIndex((a) => a.id === alarmId);
  const entry = updated as unknown as typeof alarms[0];
  if (idx >= 0) { alarms[idx] = entry; } else { alarms.push(entry); }
  await saveAlarms(alarms);
  return updated;
}

/** Format hour/minute as "8:05 AM" */
export function formatAlarmTime(hour: number, minute: number): string {
  const period = hour >= 12 ? 'PM' : 'AM';
  const h = hour % 12 === 0 ? 12 : hour % 12;
  const m = minute.toString().padStart(2, '0');
  return `${h}:${m} ${period}`;
}

export const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const DAY_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
