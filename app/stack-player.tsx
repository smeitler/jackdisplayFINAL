/**
 * Stack Player Screen
 * Runs through a ritual stack step by step.
 * - Full-screen immersive UI
 * - Each step shows its own content (timer, breathwork, reminder, journal, etc.)
 * - When a step completes, a countdown runs before auto-advancing
 * - Skip button always visible; Adjust button opens step config
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useKeepAwake } from 'expo-keep-awake';

import { IconSymbol } from '@/components/ui/icon-symbol';
import { useColors } from '@/hooks/use-colors';
import {
  type RitualStack,
  type RitualStep,
  STEP_TYPE_META,
  loadStacks,
  stepLabel,
  stepDefaultDuration,
  stepIsAutoComplete,
} from '@/lib/stacks';

// ─── Breathwork patterns ─────────────────────────────────────────────────────

const BREATH_PATTERNS: Record<string, { phases: { label: string; seconds: number }[]; name: string }> = {
  box:     { name: 'Box Breathing',  phases: [{ label: 'Inhale', seconds: 4 }, { label: 'Hold', seconds: 4 }, { label: 'Exhale', seconds: 4 }, { label: 'Hold', seconds: 4 }] },
  '4_7_8': { name: '4-7-8 Breathing', phases: [{ label: 'Inhale', seconds: 4 }, { label: 'Hold', seconds: 7 }, { label: 'Exhale', seconds: 8 }] },
  wim_hof: { name: 'Wim Hof',        phases: [{ label: 'Inhale', seconds: 2 }, { label: 'Exhale', seconds: 2 }] },
};

// ─── Step Content Components ──────────────────────────────────────────────────

interface StepContentProps {
  step: RitualStep;
  onComplete: () => void;
  colors: ReturnType<typeof useColors>;
}

/** Timer step — countdown from durationSeconds */
function TimerStep({ step, onComplete, colors }: StepContentProps) {
  const total = step.config.durationSeconds ?? 300;
  const [remaining, setRemaining] = useState(total);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    intervalRef.current = setInterval(() => {
      setRemaining((r) => {
        if (r <= 1) {
          clearInterval(intervalRef.current!);
          onComplete();
          return 0;
        }
        return r - 1;
      });
    }, 1000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, []);

  const mins = Math.floor(remaining / 60);
  const secs = remaining % 60;
  const progress = 1 - remaining / total;

  return (
    <View style={styles.stepContent}>
      <Text style={{ fontSize: 64, marginBottom: 16 }}>⏱️</Text>
      <Text style={[styles.timerDisplay, { color: colors.foreground }]}>
        {String(mins).padStart(2, '0')}:{String(secs).padStart(2, '0')}
      </Text>
      <View style={[styles.progressBar, { backgroundColor: colors.border }]}>
        <View style={[styles.progressFill, { width: `${progress * 100}%` as any, backgroundColor: colors.primary }]} />
      </View>
      <Text style={[styles.stepHint, { color: colors.muted }]}>Timer running…</Text>
    </View>
  );
}

/** Stopwatch step — count up, user taps Done */
function StopwatchStep({ step, onComplete, colors }: StepContentProps) {
  const [elapsed, setElapsed] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    intervalRef.current = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, []);

  const mins = Math.floor(elapsed / 60);
  const secs = elapsed % 60;

  return (
    <View style={styles.stepContent}>
      <Text style={{ fontSize: 64, marginBottom: 16 }}>⏲️</Text>
      <Text style={[styles.timerDisplay, { color: colors.foreground }]}>
        {String(mins).padStart(2, '0')}:{String(secs).padStart(2, '0')}
      </Text>
      <TouchableOpacity
        onPress={onComplete}
        style={[styles.doneBtn, { backgroundColor: colors.primary }]}
        activeOpacity={0.85}
      >
        <Text style={styles.doneBtnText}>Done</Text>
      </TouchableOpacity>
    </View>
  );
}

/** Breathwork step — animated phase guide */
function BreathworkStep({ step, onComplete, colors }: StepContentProps) {
  const style = step.config.breathworkStyle ?? 'box';
  const rounds = step.config.breathworkRounds ?? 4;
  const pattern = BREATH_PATTERNS[style] ?? BREATH_PATTERNS.box;
  const [round, setRound] = useState(1);
  const [phaseIdx, setPhaseIdx] = useState(0);
  const [phaseRemaining, setPhaseRemaining] = useState(pattern.phases[0].seconds);
  const scaleAnim = useRef(new Animated.Value(0.6)).current;

  const currentPhase = pattern.phases[phaseIdx];

  useEffect(() => {
    // Animate circle scale based on phase
    const isExpand = currentPhase.label === 'Inhale';
    const isHold = currentPhase.label === 'Hold';
    const target = isExpand ? 1 : isHold ? (scaleAnim as any)._value : 0.6;
    Animated.timing(scaleAnim, {
      toValue: isExpand ? 1 : isHold ? (scaleAnim as any)._value : 0.6,
      duration: currentPhase.seconds * 1000,
      useNativeDriver: true,
    }).start();
  }, [phaseIdx, round]);

  useEffect(() => {
    const interval = setInterval(() => {
      setPhaseRemaining((r) => {
        if (r <= 1) {
          // Advance phase
          const nextPhase = (phaseIdx + 1) % pattern.phases.length;
          if (nextPhase === 0) {
            // Completed a round
            if (round >= rounds) {
              clearInterval(interval);
              onComplete();
              return 0;
            }
            setRound((rnd) => rnd + 1);
          }
          setPhaseIdx(nextPhase);
          return pattern.phases[nextPhase].seconds;
        }
        return r - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [phaseIdx, round, rounds, pattern]);

  return (
    <View style={styles.stepContent}>
      <Text style={[styles.breathPatternName, { color: colors.muted }]}>{pattern.name}</Text>
      <Animated.View
        style={[
          styles.breathCircle,
          { backgroundColor: colors.primary + '33', borderColor: colors.primary },
          { transform: [{ scale: scaleAnim }] },
        ]}
      />
      <Text style={[styles.breathPhaseLabel, { color: colors.foreground }]}>{currentPhase.label}</Text>
      <Text style={[styles.breathPhaseTimer, { color: colors.primary }]}>{phaseRemaining}</Text>
      <Text style={[styles.stepHint, { color: colors.muted }]}>Round {round} of {rounds}</Text>
    </View>
  );
}

/** Reminder step — shows message, user taps Done */
function ReminderStep({ step, onComplete, colors }: StepContentProps) {
  const text = step.config.reminderText ?? 'Complete this step';
  return (
    <View style={styles.stepContent}>
      <Text style={{ fontSize: 64, marginBottom: 20 }}>💧</Text>
      <Text style={[styles.reminderText, { color: colors.foreground }]}>{text}</Text>
      <TouchableOpacity
        onPress={onComplete}
        style={[styles.doneBtn, { backgroundColor: colors.primary }]}
        activeOpacity={0.85}
      >
        <Text style={styles.doneBtnText}>Done ✓</Text>
      </TouchableOpacity>
    </View>
  );
}

/** Journal step — simple text entry */
function JournalStep({ step, onComplete, colors }: StepContentProps) {
  const [text, setText] = useState('');
  const prompt = step.config.journalPrompt ?? 'Write your thoughts…';
  return (
    <View style={[styles.stepContent, { paddingHorizontal: 0, width: '100%' }]}>
      <Text style={{ fontSize: 40, marginBottom: 12 }}>📓</Text>
      <Text style={[styles.journalPrompt, { color: colors.muted }]}>{prompt}</Text>
      <TextInput
        style={[styles.journalInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.surface }]}
        value={text}
        onChangeText={setText}
        placeholder="Start writing…"
        placeholderTextColor={colors.muted}
        multiline
        numberOfLines={6}
        textAlignVertical="top"
      />
      <TouchableOpacity
        onPress={onComplete}
        style={[styles.doneBtn, { backgroundColor: colors.primary, marginTop: 12 }]}
        activeOpacity={0.85}
      >
        <Text style={styles.doneBtnText}>Done ✓</Text>
      </TouchableOpacity>
    </View>
  );
}

/** Custom step — shows label + note, user taps Done */
function CustomStep({ step, onComplete, colors }: StepContentProps) {
  const label = step.config.customLabel ?? 'Custom Step';
  const note = step.config.customNote;
  return (
    <View style={styles.stepContent}>
      <Text style={{ fontSize: 64, marginBottom: 20 }}>✏️</Text>
      <Text style={[styles.reminderText, { color: colors.foreground }]}>{label}</Text>
      {note && <Text style={[styles.stepHint, { color: colors.muted, marginTop: 8 }]}>{note}</Text>}
      <TouchableOpacity
        onPress={onComplete}
        style={[styles.doneBtn, { backgroundColor: colors.primary }]}
        activeOpacity={0.85}
      >
        <Text style={styles.doneBtnText}>Done ✓</Text>
      </TouchableOpacity>
    </View>
  );
}

/** Meditation / Priming / Affirmations — placeholder (routes to wellness-audio or practice player) */
function AudioStep({ step, onComplete, colors }: StepContentProps) {
  const meta = STEP_TYPE_META[step.type];
  return (
    <View style={styles.stepContent}>
      <Text style={{ fontSize: 64, marginBottom: 20 }}>{meta.emoji}</Text>
      <Text style={[styles.reminderText, { color: colors.foreground }]}>{meta.label}</Text>
      <Text style={[styles.stepHint, { color: colors.muted, marginTop: 8, textAlign: 'center' }]}>
        {step.type === 'meditation' && 'Open the Sounds section to select a track, then return here.'}
        {step.type === 'priming' && 'Your priming session will begin. Tap Done when finished.'}
        {step.type === 'affirmations' && (step.config.affirmationLines?.join('\n\n') ?? 'No affirmations set. Edit this step to add them.')}
      </Text>
      <TouchableOpacity
        onPress={onComplete}
        style={[styles.doneBtn, { backgroundColor: colors.primary, marginTop: 20 }]}
        activeOpacity={0.85}
      >
        <Text style={styles.doneBtnText}>Done ✓</Text>
      </TouchableOpacity>
    </View>
  );
}

function renderStepContent(step: RitualStep, onComplete: () => void, colors: ReturnType<typeof useColors>) {
  switch (step.type) {
    case 'timer':        return <TimerStep step={step} onComplete={onComplete} colors={colors} />;
    case 'stopwatch':    return <StopwatchStep step={step} onComplete={onComplete} colors={colors} />;
    case 'breathwork':   return <BreathworkStep step={step} onComplete={onComplete} colors={colors} />;
    case 'reminder':     return <ReminderStep step={step} onComplete={onComplete} colors={colors} />;
    case 'journal':      return <JournalStep step={step} onComplete={onComplete} colors={colors} />;
    case 'custom':       return <CustomStep step={step} onComplete={onComplete} colors={colors} />;
    default:             return <AudioStep step={step} onComplete={onComplete} colors={colors} />;
  }
}

// ─── Countdown Overlay ────────────────────────────────────────────────────────

interface CountdownOverlayProps {
  seconds: number;
  nextStep: RitualStep;
  onSkipDelay: () => void;
  colors: ReturnType<typeof useColors>;
}

function CountdownOverlay({ seconds, nextStep, onSkipDelay, colors }: CountdownOverlayProps) {
  const [remaining, setRemaining] = useState(seconds);

  useEffect(() => {
    const interval = setInterval(() => {
      setRemaining((r) => {
        if (r <= 1) { clearInterval(interval); onSkipDelay(); return 0; }
        return r - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const meta = STEP_TYPE_META[nextStep.type];

  return (
    <View style={[styles.countdownOverlay, { backgroundColor: 'rgba(0,0,0,0.75)' }]}>
      <Text style={styles.countdownLabel}>Next up</Text>
      <Text style={{ fontSize: 40, marginVertical: 8 }}>{meta.emoji}</Text>
      <Text style={styles.countdownStepName}>{stepLabel(nextStep)}</Text>
      <Text style={styles.countdownNumber}>{remaining}</Text>
      <TouchableOpacity
        onPress={onSkipDelay}
        style={[styles.skipDelayBtn, { backgroundColor: 'rgba(255,255,255,0.15)' }]}
        activeOpacity={0.85}
      >
        <Text style={styles.skipDelayText}>Start Now</Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── Completion Screen ────────────────────────────────────────────────────────

function CompletionScreen({ stack, onClose, colors }: { stack: RitualStack; onClose: () => void; colors: ReturnType<typeof useColors> }) {
  return (
    <View style={[styles.completionWrap, { backgroundColor: colors.background }]}>
      <Text style={{ fontSize: 72, marginBottom: 16 }}>🎉</Text>
      <Text style={[styles.completionTitle, { color: colors.foreground }]}>Stack Complete!</Text>
      <Text style={[styles.completionSub, { color: colors.muted }]}>
        You finished your {stack.name}. Great work!
      </Text>
      <TouchableOpacity
        onPress={onClose}
        style={[styles.doneBtn, { backgroundColor: colors.primary, marginTop: 32, paddingHorizontal: 48 }]}
        activeOpacity={0.85}
      >
        <Text style={styles.doneBtnText}>Done</Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── Main Screen ─────────────────────────────────────────────────────────────

export default function StackPlayerScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = useColors();
  useKeepAwake();

  const [stack, setStack] = useState<RitualStack | null>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [showCountdown, setShowCountdown] = useState(false);
  const [completed, setCompleted] = useState(false);

  useEffect(() => {
    loadStacks().then((stacks) => {
      const found = stacks.find((s) => s.id === id);
      if (found) setStack(found);
    });
  }, [id]);

  const currentStep = stack?.steps[stepIndex] ?? null;
  const nextStep = stack?.steps[stepIndex + 1] ?? null;
  const isLastStep = stack ? stepIndex === stack.steps.length - 1 : false;

  function handleStepComplete() {
    if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    if (isLastStep) {
      setCompleted(true);
      return;
    }
    const delay = currentStep?.delayAfterSeconds ?? 0;
    if (delay > 0 && nextStep) {
      setShowCountdown(true);
    } else {
      advanceStep();
    }
  }

  function advanceStep() {
    setShowCountdown(false);
    setStepIndex((i) => i + 1);
  }

  function handleSkip() {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (isLastStep) {
      setCompleted(true);
    } else {
      setShowCountdown(false);
      setStepIndex((i) => i + 1);
    }
  }

  function handleClose() {
    Alert.alert('Exit Stack?', 'Your progress will be lost.', [
      { text: 'Keep Going', style: 'cancel' },
      { text: 'Exit', style: 'destructive', onPress: () => router.back() },
    ]);
  }

  if (!stack || !currentStep) {
    return (
      <View style={[styles.loadingWrap, { backgroundColor: colors.background }]}>
        <Text style={[styles.loadingText, { color: colors.muted }]}>Loading…</Text>
      </View>
    );
  }

  if (completed) {
    return <CompletionScreen stack={stack} onClose={() => router.back()} colors={colors} />;
  }

  const meta = STEP_TYPE_META[currentStep.type];
  const totalSteps = stack.steps.length;

  return (
    <View style={[styles.root, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.playerHeader}>
        <Pressable
          onPress={handleClose}
          style={({ pressed }) => [styles.closeBtn, { opacity: pressed ? 0.6 : 1 }]}
        >
          <IconSymbol name="xmark" size={20} color={colors.muted} />
        </Pressable>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={[styles.stackName, { color: colors.muted }]}>{stack.emoji} {stack.name}</Text>
          <Text style={[styles.stepCounter, { color: colors.foreground }]}>
            Step {stepIndex + 1} of {totalSteps}
          </Text>
        </View>
        <Pressable
          onPress={handleSkip}
          style={({ pressed }) => [styles.skipBtn, { opacity: pressed ? 0.6 : 1 }]}
        >
          <Text style={[styles.skipBtnText, { color: colors.muted }]}>Skip</Text>
        </Pressable>
      </View>

      {/* Step progress dots */}
      <View style={styles.dotsRow}>
        {stack.steps.map((_, i) => (
          <View
            key={i}
            style={[
              styles.dot,
              {
                backgroundColor: i < stepIndex
                  ? colors.success
                  : i === stepIndex
                    ? colors.primary
                    : colors.border,
                width: i === stepIndex ? 20 : 8,
              },
            ]}
          />
        ))}
      </View>

      {/* Step title */}
      <View style={[styles.stepTitleRow, { borderBottomColor: colors.border }]}>
        <View style={[styles.stepIconWrap, { backgroundColor: meta.color + '22' }]}>
          <Text style={{ fontSize: 22 }}>{meta.emoji}</Text>
        </View>
        <Text style={[styles.stepTitle, { color: colors.foreground }]}>{stepLabel(currentStep)}</Text>
      </View>

      {/* Step content */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[styles.contentArea, { paddingBottom: insets.bottom + 32 }]}
        keyboardShouldPersistTaps="handled"
      >
        {renderStepContent(currentStep, handleStepComplete, colors)}
      </ScrollView>

      {/* Countdown overlay */}
      {showCountdown && nextStep && (
        <CountdownOverlay
          seconds={currentStep.delayAfterSeconds}
          nextStep={nextStep}
          onSkipDelay={advanceStep}
          colors={colors}
        />
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1 },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loadingText: { fontSize: 16 },

  playerHeader: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 12,
  },
  closeBtn: { padding: 8 },
  skipBtn: { padding: 8 },
  skipBtnText: { fontSize: 14, fontWeight: '600' },
  stackName: { fontSize: 12, fontWeight: '600' },
  stepCounter: { fontSize: 15, fontWeight: '700' },

  dotsRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 8,
  },
  dot: { height: 8, borderRadius: 4 },

  stepTitleRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth, gap: 12,
  },
  stepIconWrap: {
    width: 44, height: 44, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  stepTitle: { fontSize: 20, fontWeight: '700', flex: 1 },

  contentArea: {
    flexGrow: 1, alignItems: 'center',
    paddingHorizontal: 24, paddingTop: 32,
  },

  // Step content shared
  stepContent: {
    alignItems: 'center', width: '100%',
  },
  timerDisplay: {
    fontSize: 72, fontWeight: '200', letterSpacing: 4, marginBottom: 20,
  },
  progressBar: {
    width: '80%', height: 6, borderRadius: 3, overflow: 'hidden', marginBottom: 16,
  },
  progressFill: { height: '100%', borderRadius: 3 },
  stepHint: { fontSize: 14 },
  doneBtn: {
    paddingHorizontal: 40, paddingVertical: 14,
    borderRadius: 30, marginTop: 24,
  },
  doneBtnText: { color: '#fff', fontSize: 17, fontWeight: '700' },

  // Breathwork
  breathPatternName: { fontSize: 14, fontWeight: '600', marginBottom: 24 },
  breathCircle: {
    width: 160, height: 160, borderRadius: 80,
    borderWidth: 3, marginBottom: 24,
  },
  breathPhaseLabel: { fontSize: 28, fontWeight: '700', marginBottom: 4 },
  breathPhaseTimer: { fontSize: 48, fontWeight: '200', marginBottom: 8 },

  // Reminder / Custom
  reminderText: { fontSize: 22, fontWeight: '700', textAlign: 'center', lineHeight: 32 },

  // Journal
  journalPrompt: { fontSize: 15, marginBottom: 12, textAlign: 'center' },
  journalInput: {
    width: '100%', borderWidth: 1, borderRadius: 12,
    padding: 14, fontSize: 15, minHeight: 140,
  },

  // Countdown overlay
  countdownOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center', justifyContent: 'center',
    zIndex: 100,
  },
  countdownLabel: { color: 'rgba(255,255,255,0.7)', fontSize: 14, fontWeight: '600', letterSpacing: 1 },
  countdownStepName: { color: '#fff', fontSize: 22, fontWeight: '700', marginBottom: 16 },
  countdownNumber: { color: '#fff', fontSize: 80, fontWeight: '200', lineHeight: 90 },
  skipDelayBtn: {
    marginTop: 16, paddingHorizontal: 32, paddingVertical: 12, borderRadius: 30,
  },
  skipDelayText: { color: '#fff', fontSize: 16, fontWeight: '700' },

  // Completion
  completionWrap: {
    flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32,
  },
  completionTitle: { fontSize: 32, fontWeight: '800', marginBottom: 12 },
  completionSub: { fontSize: 16, textAlign: 'center', lineHeight: 24 },
});
