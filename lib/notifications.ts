import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { AlarmConfig, saveAlarms, loadAlarms } from './storage';

// Configure how notifications appear when app is in foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

const CHANNEL_ID = 'jack-alarm';

export async function requestNotificationPermissions(): Promise<boolean> {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: 'Jack Daily Alarm',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#3B82F6',
      sound: 'default',
    });
  }

  const { status: existing } = await Notifications.getPermissionsAsync();
  if (existing === 'granted') return true;

  const { status } = await Notifications.requestPermissionsAsync({
    ios: {
      allowAlert: true,
      allowBadge: true,
      allowSound: true,
      // Critical alerts bypass DND and silent mode at the OS level (iOS 12+)
      // Note: requires Apple entitlement for App Store; works in dev/TestFlight builds
      allowCriticalAlerts: true,
      // Time-Sensitive breaks through Focus modes (iOS 15+)
      provideAppNotificationSettings: true,
    },
  });
  return status === 'granted';
}

/**
 * Maps a soundId string to the bundled sound filename for notification sounds.
 * Use .wav — these match the filenames registered in the expo-notifications
 * plugin config (app.config.ts sounds array). The plugin copies them into
 * the native bundle; we reference by base filename only.
 */
function getSoundFilename(soundId?: string): string {
  const map: Record<string, string> = {
    classic:  'alarm_classic.wav',
    buzzer:   'alarm_buzzer.wav',
    digital:  'alarm_digital.wav',
    gentle:   'alarm_gentle.wav',
    urgent:   'alarm_urgent.wav',
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
        // Critical: bypasses DND, silent mode, and Focus on iOS 15+
        // Falls back gracefully on older iOS / Expo Go (still delivers notification)
        ...(Platform.OS === 'ios' ? { interruptionLevel: 'critical' as const } : {}),
        // Android: highest priority channel ensures alarm-level delivery
        priority: 'max',
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
        weekday: day === 0 ? 1 : day + 1, // Expo uses 1=Sun … 7=Sat
        hour: config.hour,
        minute: config.minute,
        repeats: true,
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
