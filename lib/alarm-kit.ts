/**
 * alarm-kit.ts
 *
 * AlarmKit integration for iOS 26+.
 * Uses expo-alarm-kit for true system-level alarms that bypass the mute switch
 * and appear in the native Clock app.
 * On older iOS / Android / web, falls back to local notifications (existing behavior).
 */

import { Platform } from 'react-native';

// App Group identifier — must match the one configured in app.config.ts
const APP_GROUP = 'group.com.jackalarm.app';

// ─── Lazy import ─────────────────────────────────────────────────────────────
type ExpoAlarmKitModule = typeof import('expo-alarm-kit');
let _kit: ExpoAlarmKitModule | null | undefined = undefined; // undefined = not yet checked
let _configured = false;

async function getAlarmKit(): Promise<ExpoAlarmKitModule | null> {
  if (Platform.OS !== 'ios') return null;
  if (_kit !== undefined) return _kit;
  try {
    const mod = await import('expo-alarm-kit');
    // Configure the module with the App Group identifier
    if (!_configured) {
      const ok = mod.configure(APP_GROUP);
      _configured = ok;
      if (!ok) {
        console.warn('[AlarmKit] configure() returned false — App Group may not be set up');
      }
    }
    _kit = mod;
  } catch {
    _kit = null;
  }
  return _kit;
}

/**
 * Call this at app startup (e.g., in _layout.tsx) to ensure AlarmKit is configured
 * before getLaunchPayload() or any other AlarmKit API is called.
 */
export async function configureAlarmKit(): Promise<void> {
  await getAlarmKit();
}

// ─── Sound mapping ────────────────────────────────────────────────────────────
/**
 * Map our soundId to the bundled sound base name (WITHOUT extension).
 * AlarmKit requires just the base filename — it looks for the file in the
 * main iOS bundle and will try .caf, .wav, .mp3 automatically.
 * Remote URL sounds (edm, fulltrack, etc.) are not bundled natively — fall back to classic.
 */
function soundIdToNativeFile(soundId: string): string {
  const map: Record<string, string> = {
    classic:    'alarm_classic',
    buzzer:     'alarm_buzzer',
    digital:    'alarm_digital',
    gentle:     'alarm_gentle',
    urgent:     'alarm_urgent',
    // Remote URL sounds — not bundled natively, fall back to classic
    edm:        'alarm_classic',
    fulltrack:  'alarm_classic',
    prisonbell: 'alarm_classic',
    stomp4k:    'alarm_classic',
    stomp5k:    'alarm_classic',
    drumming:   'alarm_classic',
  };
  return map[soundId] ?? 'alarm_classic';
}

// ─── Public API ───────────────────────────────────────────────────────────────

export interface AlarmKitResult {
  /** Whether AlarmKit was used (true) or local notifications fallback (false) */
  usedAlarmKit: boolean;
  /** The AlarmKit alarm ID (if usedAlarmKit=true) */
  alarmKitId?: string;
}

/**
 * Check if AlarmKit is available on this device (iOS 26+).
 */
export async function isAlarmKitAvailable(): Promise<boolean> {
  const kit = await getAlarmKit();
  return kit !== null;
}

/**
 * Request AlarmKit authorization. Returns true if granted.
 * On non-iOS-26+ platforms, returns false immediately.
 */
export async function requestAlarmKitPermission(): Promise<boolean> {
  const kit = await getAlarmKit();
  if (!kit) return false;
  try {
    const status = await kit.requestAuthorization();
    return status === 'authorized';
  } catch {
    return false;
  }
}

/**
 * Schedule a repeating alarm using AlarmKit (by weekday + time).
 * Returns the AlarmKit alarm ID, or usedAlarmKit=false if unavailable.
 */
export async function scheduleAlarmKitRepeating(params: {
  title: string;
  hour: number;
  minute: number;
  /** Day indices: 0=Sun, 1=Mon, ..., 6=Sat */
  days: number[];
  soundId: string;
  snoozeMinutes: number;
  tintColor?: string;
}): Promise<AlarmKitResult> {
  const kit = await getAlarmKit();
  if (!kit) return { usedAlarmKit: false };

  try {
    const status = await kit.requestAuthorization();
    if (status !== 'authorized') return { usedAlarmKit: false };

    // expo-alarm-kit weekdays: 1=Sun, 2=Mon, ..., 7=Sat
    // Our days: 0=Sun, 1=Mon, ..., 6=Sat
    const weekdays = params.days.map((d) => d + 1) as (1 | 2 | 3 | 4 | 5 | 6 | 7)[];
    const soundFile = soundIdToNativeFile(params.soundId);
    const alarmId = kit.generateUUID();

    const success = await kit.scheduleRepeatingAlarm({
      id: alarmId,
      hour: params.hour,
      minute: params.minute,
      weekdays,
      title: params.title,
      soundName: soundFile,
      launchAppOnDismiss: true,
      dismissPayload: alarmId,
      doSnoozeIntent: true,
      launchAppOnSnooze: false,
      snoozeDuration: params.snoozeMinutes * 60,
    });

    if (!success) return { usedAlarmKit: false };
    return { usedAlarmKit: true, alarmKitId: alarmId };
  } catch (err) {
    console.warn('[AlarmKit] scheduleRepeatingAlarm failed, falling back:', err);
    return { usedAlarmKit: false };
  }
}

/**
 * Cancel an AlarmKit alarm by its ID.
 */
export async function cancelAlarmKitAlarm(alarmKitId: string): Promise<void> {
  const kit = await getAlarmKit();
  if (!kit) return;
  try {
    await kit.cancelAlarm(alarmKitId);
  } catch (err) {
    console.warn('[AlarmKit] cancelAlarm failed:', err);
  }
}

/**
 * Cancel all AlarmKit alarms.
 */
export async function cancelAllAlarmKitAlarms(): Promise<void> {
  const kit = await getAlarmKit();
  if (!kit) return;
  try {
    // Get all active alarms and cancel them
    const alarms = kit.getAllAlarms();
    for (const id of alarms) {
      try {
        await kit.cancelAlarm(id);
      } catch {
        // ignore individual failures
      }
    }
  } catch (err) {
    console.warn('[AlarmKit] cancelAllAlarms failed:', err);
  }
}
