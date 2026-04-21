/**
 * AlarmActivity — iOS Live Activity for the Jack alarm.
 *
 * Shown on the Lock Screen and in the Dynamic Island when an alarm fires.
 *
 * States:
 *   status: 'ringing'  — alarm is currently ringing
 *   status: 'snoozed'  — user snoozed, shows countdown
 *
 * Layout:
 *   banner         — lock screen / notification center card
 *   compactLeading — Dynamic Island left side (bell icon)
 *   compactTrailing— Dynamic Island right side (time)
 *   minimal        — Dynamic Island minimal (bell icon)
 *   expandedLeading— Dynamic Island expanded left (bell + label)
 *   expandedTrailing—Dynamic Island expanded right (time + status)
 *   expandedBottom — Dynamic Island expanded bottom (snooze info)
 */
import { HStack, Image, Spacer, Text, VStack } from '@expo/ui/swift-ui';
import {
  font,
  foregroundStyle,
  padding,
  frame,
  background,
  cornerRadius,
} from '@expo/ui/swift-ui/modifiers';
import { createLiveActivity } from 'expo-widgets';

export type AlarmActivityProps = {
  /** Alarm label, e.g. "Morning" */
  alarmLabel: string;
  /** Formatted time string, e.g. "7:00 AM" */
  alarmTime: string;
  /** Current state of the alarm */
  status: 'ringing' | 'snoozed';
  /** When snoozed: formatted snooze-end time, e.g. "7:10 AM" */
  snoozeUntil?: string;
};

const AlarmActivity = (props: AlarmActivityProps, environment: { colorScheme: 'light' | 'dark' }) => {
  'widget';

  const isDark = environment.colorScheme === 'dark';
  const accent = '#FF6B35'; // warm orange — matches Jack's alarm brand
  const textPrimary = isDark ? '#FFFFFF' : '#11181C';
  const textSecondary = isDark ? '#9BA1A6' : '#687076';
  const cardBg = isDark ? '#1E2022' : '#F5F5F5';

  const isRinging = props.status === 'ringing';
  const statusText = isRinging ? 'Alarm Ringing' : `Snoozed until ${props.snoozeUntil ?? ''}`;
  const statusIcon = isRinging ? 'alarm' : 'alarm.waves.left.and.right';

  return {
    // ── Lock Screen / Notification Center banner ──────────────────────────
    banner: (
      <VStack modifiers={[padding({ all: 14 }), background(cardBg), cornerRadius(16)]}>
        <HStack>
          <Image
            systemName={statusIcon}
            color={accent}
            size={20}
          />
          <Text modifiers={[font({ weight: 'semibold', size: 15 }), foregroundStyle(accent), padding({ leading: 6 })]}>
            {props.alarmLabel}
          </Text>
          <Spacer />
          <Text modifiers={[font({ weight: 'bold', size: 18 }), foregroundStyle(textPrimary)]}>
            {props.alarmTime}
          </Text>
        </HStack>
        <Text modifiers={[font({ size: 13 }), foregroundStyle(textSecondary), padding({ top: 4 })]}>
          {statusText}
        </Text>
      </VStack>
    ),

    // ── Dynamic Island — compact (pill) ──────────────────────────────────
    compactLeading: (
      <Image
        systemName={statusIcon}
        color={accent}
        size={16}
      />
    ),
    compactTrailing: (
      <Text modifiers={[font({ weight: 'bold', size: 14 }), foregroundStyle(textPrimary)]}>
        {props.alarmTime}
      </Text>
    ),

    // ── Dynamic Island — minimal (tiny dot) ──────────────────────────────
    minimal: (
      <Image
        systemName="alarm"
        color={accent}
        size={14}
      />
    ),

    // ── Dynamic Island — expanded ─────────────────────────────────────────
    expandedLeading: (
      <VStack modifiers={[padding({ all: 10 })]}>
        <Image
          systemName={statusIcon}
          color={accent}
          size={24}
        />
        <Text modifiers={[font({ size: 11 }), foregroundStyle(textSecondary), padding({ top: 2 })]}>
          {props.alarmLabel}
        </Text>
      </VStack>
    ),
    expandedTrailing: (
      <VStack modifiers={[padding({ all: 10 })]}>
        <Text modifiers={[font({ weight: 'bold', size: 22 }), foregroundStyle(textPrimary)]}>
          {props.alarmTime}
        </Text>
        <Text modifiers={[font({ size: 11 }), foregroundStyle(accent), padding({ top: 2 })]}>
          {isRinging ? 'Ringing' : 'Snoozed'}
        </Text>
      </VStack>
    ),
    expandedBottom: isRinging ? undefined : (
      <Text modifiers={[font({ size: 12 }), foregroundStyle(textSecondary), padding({ bottom: 8 })]}>
        Rings again at {props.snoozeUntil}
      </Text>
    ),
  };
};

export default createLiveActivity('AlarmActivity', AlarmActivity);
