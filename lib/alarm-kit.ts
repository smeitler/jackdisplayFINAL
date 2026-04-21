/**
 * alarm-kit.ts
 *
 * AlarmKit integration for iOS 26+.
 * On iOS 26+, uses react-native-nitro-ios-alarm-kit for true system-level alarms
 * that bypass the mute switch and appear in the native Clock app.
 * On older iOS / Android / web, falls back to local notifications (existing behavior).
 */

import { Platform } from 'react-native';
import type { AlarmWeekday } from 'react-native-nitro-ios-alarm-kit';

// ─── Lazy import ─────────────────────────────────────────────────────────────
// We lazy-import to avoid crashing on Android/web where the native module
// doesn't exist. We cache the result after the first call.
type AlarmKitModule = typeof import('react-native-nitro-ios-alarm-kit');
let _kit: AlarmKitModule | null | undefined = undefined; // undefined = not yet checked

async function getAlarmKit(): Promise<AlarmKitModule | null> {
  if (Platform.OS !== 'ios') return null;
  if (_kit !== undefined) return _kit;
  try {
    const mod = await import('react-native-nitro-ios-alarm-kit');
    // isAvailable() is a top-level function that returns false on iOS < 26
    _kit = mod.isAvailable() ? mod : null;
  } catch {
    _kit = null;
  }
  return _kit;
}

// ─── Sound mapping ────────────────────────────────────────────────────────────
/**
 * Map our soundId to the bundled .caf filename (without extension).
 * AlarmKit looks for these files in the main iOS bundle.
 * Remote URL sounds (edm, fulltrack, etc.) are not bundled natively — use classic fallback.
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
    return await kit.requestAlarmPermission();
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
    const authorized = await kit.requestAlarmPermission();
    if (!authorized) return { usedAlarmKit: false };

    const weekdayMap: AlarmWeekday[] = [
      'sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday',
    ];
    const repeats: AlarmWeekday[] = params.days.map((d) => weekdayMap[d] ?? 'monday');
    const soundFile = soundIdToNativeFile(params.soundId);

    const alarmKitId = await kit.scheduleRelativeAlarm(
      params.title,
      { text: 'Wake Up', textColor: '#FFFFFF', icon: 'sun.max.fill' },
      params.tintColor ?? '#6C63FF',
      params.hour,
      params.minute,
      repeats,
      { text: `Snooze ${params.snoozeMinutes}m`, textColor: '#FFFFFF', icon: 'moon.zzz.fill' },
      { postAlert: params.snoozeMinutes * 60 },
      soundFile
    );

    return { usedAlarmKit: true, alarmKitId: alarmKitId ?? undefined };
  } catch (err) {
    console.warn('[AlarmKit] scheduleRelativeAlarm failed, falling back:', err);
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
    await kit.stopAlarm(alarmKitId);
  } catch (err) {
    console.warn('[AlarmKit] stopAlarm failed:', err);
  }
}

/**
 * Cancel all AlarmKit alarms.
 */
export async function cancelAllAlarmKitAlarms(): Promise<void> {
  const kit = await getAlarmKit();
  if (!kit) return;
  try {
    await kit.stopAllAlarms();
  } catch (err) {
    console.warn('[AlarmKit] stopAllAlarms failed:', err);
  }
}
