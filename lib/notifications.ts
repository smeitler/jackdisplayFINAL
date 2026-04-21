import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { AlarmConfig, saveAlarms, loadAlarms } from './storage';
import {
  isAlarmKitAvailable,
  scheduleAlarmKitRepeating,
  cancelAlarmKitAlarm,
  cancelAllAlarmKitAlarms,
} from './alarm-kit';

// NOTE: setNotificationHandler is called in app/_layout.tsx (NotificationHandler component)
// so it runs before any notification fires. Do NOT call it here to avoid race conditions.

export const CHANNEL_ID = 'jack-alarm';

export async function requestNotificationPermissions(): Promise<boolean> {
  if (Platform.OS === 'android') {
    // On Android 8+, sound is controlled by the channel — must set it here.
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
      provideAppNotificationSettings: true,
    },
  });
  return status === 'granted';
}

/** Schedule one notification per enabled day-of-week. Returns notification IDs. */
async function scheduleLocalAlarm(config: AlarmConfig): Promise<string[]> {
  if (!config.isEnabled || config.days.length === 0) return [];

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
          assignedStackId: (config as AlarmConfig & { assignedStackId?: string }).assignedStackId ?? '',
          alarmLabel: (config as AlarmConfig & { label?: string }).label ?? 'Alarm',
          alarmTime: formatAlarmTime(config.hour, config.minute),
        },
        sound: false,
        ...(Platform.OS === 'ios' ? { interruptionLevel: 'timeSensitive' as const } : {}),
        priority: 'max',
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
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

/**
 * Schedule an alarm using AlarmKit (iOS 26+) if available, otherwise use local notifications.
 * Returns notification IDs (local) or AlarmKit IDs prefixed with 'ak:'.
 */
export async function scheduleAlarm(config: AlarmConfig): Promise<string[]> {
  // Cancel any previously scheduled alarms first
  await cancelAlarm(config);

  if (!config.isEnabled || config.days.length === 0) return [];

  // Try AlarmKit first (iOS 26+) — gives true system alarm that bypasses mute switch
  if (Platform.OS === 'ios') {
    const alarmKitAvailable = await isAlarmKitAvailable();
    if (alarmKitAvailable) {
      const label = (config as AlarmConfig & { label?: string }).label ?? 'Jack Alarm';
      const result = await scheduleAlarmKitRepeating({
        title: label,
        hour: config.hour,
        minute: config.minute,
        days: config.days,
        soundId: config.soundId ?? 'classic',
        snoozeMinutes: config.snoozeMinutes ?? 10,
        tintColor: '#6C63FF',
      });
      if (result.usedAlarmKit && result.alarmKitId) {
        // Return AlarmKit ID prefixed so we know how to cancel it later
        return [`ak:${result.alarmKitId}`];
      }
    }
  }

  // Fallback: local notifications (iOS 15-25, Android, web)
  return scheduleLocalAlarm(config);
}

export async function cancelAlarm(config: AlarmConfig): Promise<void> {
  for (const id of config.notificationIds) {
    if (id.startsWith('ak:')) {
      // AlarmKit alarm
      await cancelAlarmKitAlarm(id.slice(3));
    } else {
      try {
        await Notifications.cancelScheduledNotificationAsync(id);
      } catch {
        // ignore
      }
    }
  }
}

export async function cancelAllAlarms(): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync();
  await cancelAllAlarmKitAlarms();
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
