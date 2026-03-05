import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { AlarmConfig, saveAlarm } from './storage';

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
      lightColor: '#6C63FF',
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
    },
  });
  return status === 'granted';
}

/**
 * Maps a soundId string to the bundled .caf filename for iOS notification sounds.
 * .caf files must be included in the iOS bundle (assets/audio/).
 * Android uses the channel sound set in requestNotificationPermissions.
 */
function getSoundFilename(soundId?: string): string {
  const map: Record<string, string> = {
    classic:  'alarm_classic.caf',
    buzzer:   'alarm_buzzer.caf',
    digital:  'alarm_digital.caf',
    gentle:   'alarm_gentle.caf',
    urgent:   'alarm_urgent.caf',
  };
  return map[soundId ?? 'classic'] ?? 'alarm_classic.caf';
}

/** Schedule one notification per enabled day-of-week. Returns notification IDs. */
export async function scheduleAlarm(config: AlarmConfig): Promise<string[]> {
  // Cancel any previously scheduled alarms
  await cancelAlarm(config);

  if (!config.isEnabled || config.days.length === 0) return [];

  const soundFile = Platform.OS === 'ios' ? getSoundFilename(config.soundId) : 'default';
  const ids: string[] = [];

  for (const day of config.days) {
    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title: "Good morning! Time to check in 🌅",
        body: "How did yesterday go? Tap to log your progress.",
        data: { action: 'open_checkin' },
        sound: soundFile,
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
  const granted = await requestNotificationPermissions();
  if (!granted) {
    const updated = { ...config, isEnabled: false, notificationIds: [] };
    await saveAlarm(updated);
    return updated;
  }

  const ids = await scheduleAlarm(config);
  const updated = { ...config, notificationIds: ids };
  await saveAlarm(updated);
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
