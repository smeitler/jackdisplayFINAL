/**
 * Permissions Setup Screen
 *
 * Shown once on first launch (after login). Walks the user through every
 * permission needed for the alarm to work reliably:
 *
 *  Step 1 – Notifications (required)
 *  Step 2 – Time-Sensitive notifications (breaks through Focus/DND)
 *  Step 3 – Focus / Do Not Disturb guide (manual step in iOS Settings)
 *  Step 4 – All done ✓
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { requestAlarmPermission, isAvailable as isAlarmKitAvailable } from 'react-native-nitro-ios-alarm-kit';
import {
  Animated,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as Notifications from 'expo-notifications';
import { requestRecordingPermissionsAsync } from 'expo-audio';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ScreenContainer } from '@/components/screen-container';
import { useColors } from '@/hooks/use-colors';

export const PERMISSIONS_DONE_KEY = '@jack/permissions_setup_done';

type StepStatus = 'idle' | 'loading' | 'done' | 'denied';

interface Step {
  id: string;
  icon: string;
  title: string;
  description: string;
  actionLabel: string;
  skipLabel?: string;
}

const STEPS: Step[] = [
  {
    id: 'microphone',
    icon: '🎙️',
    title: 'Allow Microphone',
    description:
      'Jack uses your microphone for voice check-ins and journal recordings. This lets you log your day hands-free.',
    actionLabel: 'Allow Microphone',
    skipLabel: 'Skip for now',
  },
  {
    id: 'notifications',
    icon: '🔔',
    title: 'Allow Notifications',
    description:
      'Jack needs permission to send you your daily alarm. Without this, the alarm cannot fire.',
    actionLabel: 'Allow Notifications',
  },
  {
    id: 'timeSensitive',
    icon: '⏰',
    title: 'Time-Sensitive Alerts',
    description:
      'This lets Jack break through Focus modes and Do Not Disturb so your alarm always wakes you up — even when your phone is on silent.',
    actionLabel: 'Enable Time-Sensitive',
    skipLabel: 'Skip for now',
  },
  {
    id: 'alarmKit',
    icon: '⏰',
    title: 'Allow System Alarms',
    description:
      'Jack uses iOS AlarmKit to fire alarms that bypass the mute switch and work even when the app is fully closed. This is required for reliable wake-up.',
    actionLabel: 'Allow Alarms',
    skipLabel: 'Skip for now',
  },
  {
    id: 'focus',
    icon: '🌙',
    title: 'Add Jack to Focus Exceptions',
    description:
      'To guarantee the alarm fires during Sleep Focus or any custom Focus mode, add Jack to your allowed apps list in iOS Settings.',
    actionLabel: 'Open Settings',
    skipLabel: 'I\'ll do this later',
  },
];

export default function PermissionsSetupScreen() {
  const colors = useColors();
  const router = useRouter();
  const [stepIndex, setStepIndex] = useState(0);
  const [statuses, setStatuses] = useState<Record<string, StepStatus>>({});
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const slideAnim = useRef(new Animated.Value(0)).current;

  const currentStep = STEPS[stepIndex];
  const isLastStep = stepIndex === STEPS.length - 1;

  // Animate transition between steps
  const animateToNext = useCallback((nextIndex: number) => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 0, duration: 180, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: -30, duration: 180, useNativeDriver: true }),
    ]).start(() => {
      setStepIndex(nextIndex);
      slideAnim.setValue(30);
      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 1, duration: 220, useNativeDriver: true }),
        Animated.timing(slideAnim, { toValue: 0, duration: 220, useNativeDriver: true }),
      ]).start();
    });
  }, [fadeAnim, slideAnim]);

  const markDone = useCallback(async () => {
    await AsyncStorage.setItem(PERMISSIONS_DONE_KEY, '1');
    if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    router.replace('/(tabs)' as never);
  }, [router]);

  const handleAction = useCallback(async () => {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    if (currentStep.id === 'microphone') {
      setStatuses(s => ({ ...s, microphone: 'loading' }));
      try {
        if (Platform.OS === 'web') {
          // Web: skip microphone permission (handled by browser)
          setStatuses(s => ({ ...s, microphone: 'done' }));
          setTimeout(() => animateToNext(stepIndex + 1), 600);
          return;
        }
        const perm = await requestRecordingPermissionsAsync();
        const granted = perm.granted;
        setStatuses(s => ({ ...s, microphone: granted ? 'done' : 'denied' }));
        if (granted) {
          setTimeout(() => animateToNext(stepIndex + 1), 600);
        }
      } catch {
        setStatuses(s => ({ ...s, microphone: 'denied' }));
      }

    } else if (currentStep.id === 'notifications') {
      setStatuses(s => ({ ...s, notifications: 'loading' }));
      try {
        const { status } = await Notifications.requestPermissionsAsync({
          ios: {
            allowAlert: true,
            allowBadge: true,
            allowSound: true,
          },
        });
        const granted = status === 'granted';
        setStatuses(s => ({ ...s, notifications: granted ? 'done' : 'denied' }));
        if (granted) {
          setTimeout(() => animateToNext(stepIndex + 1), 600);
        }
      } catch {
        setStatuses(s => ({ ...s, notifications: 'denied' }));
      }

    } else if (currentStep.id === 'timeSensitive') {
      setStatuses(s => ({ ...s, timeSensitive: 'loading' }));
      try {
        const perms = await Notifications.getPermissionsAsync();
        if (Platform.OS === 'ios') {
          await Linking.openSettings();
        }
        const granted = perms.status === 'granted';
        setStatuses(s => ({ ...s, timeSensitive: granted ? 'done' : 'idle' }));
        setTimeout(() => animateToNext(stepIndex + 1), 400);
      } catch {
        setStatuses(s => ({ ...s, timeSensitive: 'idle' }));
        animateToNext(stepIndex + 1);
      }

    } else if (currentStep.id === 'alarmKit') {
      setStatuses(s => ({ ...s, alarmKit: 'loading' }));
      try {
        if (Platform.OS === 'ios' && isAlarmKitAvailable()) {
          const granted = await requestAlarmPermission();
          setStatuses(s => ({ ...s, alarmKit: granted ? 'done' : 'denied' }));
          if (granted) {
            setTimeout(() => animateToNext(stepIndex + 1), 600);
          }
        } else {
          setStatuses(s => ({ ...s, alarmKit: 'done' }));
          setTimeout(() => animateToNext(stepIndex + 1), 400);
        }
      } catch {
        setStatuses(s => ({ ...s, alarmKit: 'idle' }));
        animateToNext(stepIndex + 1);
      }

    } else if (currentStep.id === 'focus') {
      if (Platform.OS === 'ios') {
        await Linking.openSettings();
      }
      setStatuses(s => ({ ...s, focus: 'done' }));
      setTimeout(() => markDone(), 800);
    }
  }, [currentStep, stepIndex, animateToNext, markDone]);

  const handleSkip = useCallback(() => {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (isLastStep) {
      markDone();
    } else {
      animateToNext(stepIndex + 1);
    }
  }, [isLastStep, stepIndex, animateToNext, markDone]);

  const stepStatus = statuses[currentStep?.id ?? ''] ?? 'idle';

  // Progress dots
  const dots = STEPS.map((_, i) => (
    <View
      key={i}
      style={[
        styles.dot,
        {
          backgroundColor: i === stepIndex
            ? colors.primary
            : i < stepIndex
              ? colors.success
              : colors.border,
          width: i === stepIndex ? 20 : 8,
        },
      ]}
    />
  ));

  return (
    <ScreenContainer className="px-6 py-8">
      {/* Header */}
      <View style={styles.header}>
        <Text style={[styles.appName, { color: colors.primary }]}>Jack</Text>
        <Text style={[styles.subtitle, { color: colors.muted }]}>
          Alarm Setup  •  Step {stepIndex + 1} of {STEPS.length}
        </Text>
      </View>

      {/* Progress dots */}
      <View style={styles.dotsRow}>{dots}</View>

      {/* Step card */}
      <Animated.View
        style={[
          styles.card,
          { backgroundColor: colors.surface, borderColor: colors.border },
          { opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
        ]}
      >
        <Text style={styles.stepIcon}>{currentStep?.icon}</Text>
        <Text style={[styles.stepTitle, { color: colors.foreground }]}>
          {currentStep?.title}
        </Text>
        <Text style={[styles.stepDesc, { color: colors.muted }]}>
          {currentStep?.description}
        </Text>

        {/* Status feedback */}
        {stepStatus === 'done' && (
          <View style={[styles.statusBadge, { backgroundColor: '#22C55E20' }]}>
            <Text style={[styles.statusText, { color: colors.success }]}>✓ Done</Text>
          </View>
        )}
        {stepStatus === 'denied' && (
          <View style={[styles.statusBadge, { backgroundColor: '#EF444420' }]}>
            <Text style={[styles.statusText, { color: colors.error }]}>
              Permission denied — please enable in Settings
            </Text>
          </View>
        )}
        {stepStatus === 'loading' && (
          <View style={[styles.statusBadge, { backgroundColor: colors.border }]}>
            <Text style={[styles.statusText, { color: colors.muted }]}>Requesting…</Text>
          </View>
        )}
      </Animated.View>

      {/* What this unlocks */}
      <View style={[styles.unlockBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Text style={[styles.unlockTitle, { color: colors.foreground }]}>Why this matters</Text>
        {currentStep?.id === 'microphone' && (
          <>
            <UnlockRow icon="🎤" text="Voice check-ins — rate habits by talking" />
            <UnlockRow icon="📝" text="Voice journal — capture thoughts hands-free" />
            <UnlockRow icon="🤖" text="AI transcription of your recordings" />
          </>
        )}
        {currentStep?.id === 'notifications' && (
          <>
            <UnlockRow icon="🔔" text="Alarm fires when app is closed" />
            <UnlockRow icon="📳" text="Sound + vibration on lock screen" />
            <UnlockRow icon="🚫" text="Required — alarm won't work without this" isWarning />
          </>
        )}
        {currentStep?.id === 'timeSensitive' && (
          <>
            <UnlockRow icon="🌙" text="Breaks through Do Not Disturb" />
            <UnlockRow icon="🎯" text="Breaks through Focus modes (Sleep, Work, etc.)" />
            <UnlockRow icon="📱" text="Appears on lock screen even in Focus" />
          </>
        )}
        {currentStep?.id === 'alarmKit' && (
          <>
            <UnlockRow icon="🔇" text="Bypasses the hardware mute switch" />
            <UnlockRow icon="📱" text="Shows 'Alarms' toggle in iOS Settings → Jack" />
            <UnlockRow icon="⏰" text="Fires even when app is fully killed" />
          </>
        )}
        {currentStep?.id === 'focus' && (
          <>
            <UnlockRow icon="💤" text="Alarm fires during Sleep Focus" />
            <UnlockRow icon="🔕" text="Works even when phone is on Do Not Disturb" />
            <UnlockRow icon="⚙️" text="Settings → Focus → [Your Focus] → Apps → Add Jack" />
          </>
        )}
      </View>

      {/* CTA buttons */}
      <View style={styles.btnGroup}>
        <Pressable
          style={({ pressed }) => [
            styles.primaryBtn,
            { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 },
          ]}
          onPress={handleAction}
          disabled={stepStatus === 'loading'}
        >
          <Text style={styles.primaryBtnText}>
            {stepStatus === 'loading' ? 'Please wait…' : currentStep?.actionLabel}
          </Text>
        </Pressable>

        {currentStep?.skipLabel && (
          <Pressable
            style={({ pressed }) => [styles.skipBtn, { opacity: pressed ? 0.6 : 1 }]}
            onPress={handleSkip}
          >
            <Text style={[styles.skipBtnText, { color: colors.muted }]}>
              {currentStep.skipLabel}
            </Text>
          </Pressable>
        )}
      </View>
    </ScreenContainer>
  );
}

function UnlockRow({ icon, text, isWarning }: { icon: string; text: string; isWarning?: boolean }) {
  const colors = useColors();
  return (
    <View style={styles.unlockRow}>
      <Text style={styles.unlockIcon}>{icon}</Text>
      <Text style={[styles.unlockText, { color: isWarning ? colors.error : colors.muted }]}>
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    alignItems: 'center',
    marginBottom: 16,
  },
  appName: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 13,
    marginTop: 4,
  },
  dotsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    marginBottom: 24,
  },
  dot: {
    height: 8,
    borderRadius: 4,
  },
  card: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 28,
    alignItems: 'center',
    marginBottom: 16,
  },
  stepIcon: {
    fontSize: 52,
    marginBottom: 16,
  },
  stepTitle: {
    fontSize: 22,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 10,
  },
  stepDesc: {
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
  },
  statusBadge: {
    marginTop: 16,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  statusText: {
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
  unlockBox: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    marginBottom: 24,
    gap: 10,
  },
  unlockTitle: {
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  unlockRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  unlockIcon: {
    fontSize: 16,
    lineHeight: 22,
  },
  unlockText: {
    fontSize: 14,
    lineHeight: 22,
    flex: 1,
  },
  btnGroup: {
    gap: 12,
  },
  primaryBtn: {
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  primaryBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  skipBtn: {
    alignItems: 'center',
    paddingVertical: 10,
  },
  skipBtnText: {
    fontSize: 14,
  },
});
