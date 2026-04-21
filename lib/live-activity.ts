/**
 * live-activity.ts — Safe wrapper for the AlarmActivity Live Activity.
 *
 * All methods are no-ops on Android and web — only runs on iOS.
 *
 * Usage:
 *   import { startAlarmActivity, updateAlarmActivitySnoozed, endAlarmActivity } from '@/lib/live-activity';
 *
 *   // When alarm fires (called from _layout.tsx notification listener):
 *   await startAlarmActivity({ alarmLabel: 'Morning', alarmTime: '7:00 AM' });
 *
 *   // When user snoozes (called from alarm-ring.tsx handleSnooze):
 *   await updateAlarmActivitySnoozed({ alarmLabel: 'Morning', alarmTime: '7:00 AM', snoozeMinutes: 10 });
 *
 *   // When user dismisses (called from alarm-ring.tsx handleWakeUp):
 *   await endAlarmActivity();
 */
import { Platform } from 'react-native';
import type { LiveActivity } from 'expo-widgets';
import type { AlarmActivityProps } from '../widgets/AlarmActivity';
import { formatAlarmTime } from './notifications';

// Keep a reference to the active Live Activity instance
// so we can update/end it later from alarm-ring.tsx
let activeInstance: LiveActivity<AlarmActivityProps> | null = null;

// Lazy-load the AlarmActivity factory only on iOS
async function getFactory() {
  if (Platform.OS !== 'ios') return null;
  try {
    const mod = await import('../widgets/AlarmActivity');
    return mod.default; // LiveActivityFactory<AlarmActivityProps>
  } catch (e) {
    console.warn('[LiveActivity] Failed to load AlarmActivity factory:', e);
    return null;
  }
}

/**
 * Start the alarm Live Activity when an alarm fires.
 * Call this from _layout.tsx when the alarm notification is received/tapped.
 */
export async function startAlarmActivity(params: {
  alarmLabel: string;
  alarmTime: string;
}): Promise<void> {
  if (Platform.OS !== 'ios') return;
  try {
    const factory = await getFactory();
    if (!factory) return;

    // End any existing instance first (e.g., from a previous alarm)
    await endAlarmActivity();

    const instance = factory.start(
      {
        alarmLabel: params.alarmLabel,
        alarmTime: params.alarmTime,
        status: 'ringing',
      },
      // Deep link URL — opens the alarm-ring screen when tapped from lock screen
      'jackalarm://alarm-ring'
    );

    activeInstance = instance;
  } catch (e) {
    console.warn('[LiveActivity] startAlarmActivity error:', e);
  }
}

/**
 * Update the Live Activity to show "snoozed" state.
 * Call this from alarm-ring.tsx handleSnooze().
 */
export async function updateAlarmActivitySnoozed(params: {
  alarmLabel: string;
  alarmTime: string;
  snoozeMinutes: number;
}): Promise<void> {
  if (Platform.OS !== 'ios') return;
  if (!activeInstance) return;
  try {
    const snoozeDate = new Date(Date.now() + params.snoozeMinutes * 60 * 1000);
    const snoozeUntil = formatAlarmTime(snoozeDate.getHours(), snoozeDate.getMinutes());
    await activeInstance.update({
      alarmLabel: params.alarmLabel,
      alarmTime: params.alarmTime,
      status: 'snoozed',
      snoozeUntil,
    });
  } catch (e) {
    console.warn('[LiveActivity] updateAlarmActivitySnoozed error:', e);
  }
}

/**
 * End the Live Activity when the alarm is dismissed.
 * Call this from alarm-ring.tsx handleWakeUp().
 */
export async function endAlarmActivity(): Promise<void> {
  if (Platform.OS !== 'ios') return;
  if (!activeInstance) return;
  try {
    await activeInstance.end('immediate');
    activeInstance = null;
  } catch (e) {
    console.warn('[LiveActivity] endAlarmActivity error:', e);
    activeInstance = null;
  }
}

/**
 * Check if there's an active alarm Live Activity.
 */
export function hasActiveAlarmActivity(): boolean {
  return activeInstance !== null;
}
