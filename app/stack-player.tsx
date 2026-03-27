/**
 * Stack Player Screen
 * Runs a ritual stack step by step with auto-advance, countdown delay, and skip controls.
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, Pressable, StyleSheet, Platform, Animated } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';

import { IconSymbol } from '@/components/ui/icon-symbol';
import { useColors } from '@/hooks/use-colors';
import {
  loadStacks, stepLabel, stepDefaultDuration, stepIsAutoComplete, STEP_TYPE_META,
  type RitualStack,
} from '@/lib/stacks';

type Phase = 'delay' | 'running' | 'done';

export default function StackPlayerScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [stack, setStack] = useState<RitualStack | null>(null);
  const [stepIdx, setStepIdx] = useState(0);
  const [phase, setPhase] = useState<Phase>('delay');
  const [countdown, setCountdown] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    loadStacks().then((all) => {
      const found = all.find((s) => s.id === id);
      if (found) setStack(found);
    });
  }, [id]);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.08, duration: 900, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1,    duration: 900, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [stepIdx, pulseAnim]);

  const beginRunning = useCallback((idx: number, s: RitualStack) => {
    const step = s.steps[idx];
    setPhase('running');
    setElapsed(0);
    const dur = stepDefaultDuration(step);
    if (stepIsAutoComplete(step) && dur > 0) {
      let e = 0;
      intervalRef.current = setInterval(() => {
        e += 1;
        setElapsed(e);
        if (e >= dur) {
          clearInterval(intervalRef.current!);
          const next = idx + 1;
          if (next >= s.steps.length) {
            setPhase('done');
          } else {
            setStepIdx(next);
          }
        }
      }, 1000);
    }
  }, []);

  const startStep = useCallback((idx: number, s: RitualStack) => {
    const step = s.steps[idx];
    if (!step) { setPhase('done'); return; }
    clearInterval(intervalRef.current!);
    if (step.delayAfterSeconds > 0) {
      setPhase('delay');
      setCountdown(step.delayAfterSeconds);
      intervalRef.current = setInterval(() => {
        setCountdown((c) => {
          if (c <= 1) {
            clearInterval(intervalRef.current!);
            beginRunning(idx, s);
            return 0;
          }
          return c - 1;
        });
      }, 1000);
    } else {
      beginRunning(idx, s);
    }
  }, [beginRunning]);

  useEffect(() => {
    if (stack && stack.steps.length > 0) startStep(0, stack);
    return () => clearInterval(intervalRef.current!);
  }, [stack, startStep]);

  // When stepIdx changes due to auto-advance, restart
  const prevIdxRef = useRef(0);
  useEffect(() => {
    if (!stack || stepIdx === prevIdxRef.current) return;
    prevIdxRef.current = stepIdx;
    startStep(stepIdx, stack);
  }, [stepIdx, stack, startStep]);

  function skipStep() {
    if (!stack) return;
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    clearInterval(intervalRef.current!);
    const next = stepIdx + 1;
    if (next >= stack.steps.length) { setPhase('done'); } else { setStepIdx(next); }
  }

  function markDone() {
    if (!stack) return;
    clearInterval(intervalRef.current!);
    const next = stepIdx + 1;
    if (next >= stack.steps.length) { setPhase('done'); } else { setStepIdx(next); }
  }

  const accentColor = stack?.id === 'wakeup' ? '#F97316' : '#8B5CF6';

  if (!stack) {
    return <View style={[styles.root, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <Text style={{ color: colors.muted, textAlign: 'center', marginTop: 40 }}>Loading…</Text>
    </View>;
  }

  if (stack.steps.length === 0) {
    return (
      <View style={[styles.root, { backgroundColor: colors.background, paddingTop: insets.top }]}>
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <Pressable onPress={() => router.back()} style={({ pressed }) => [styles.backBtn, { opacity: pressed ? 0.6 : 1 }]}>
            <IconSymbol name="xmark" size={22} color={colors.foreground} />
          </Pressable>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>{stack.name}</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.centerContent}>
          <Text style={[styles.doneTitle, { color: colors.foreground }]}>No steps yet</Text>
          <Text style={[styles.doneSub, { color: colors.muted }]}>Add steps in the editor first.</Text>
          <Pressable onPress={() => router.back()} style={[styles.doneBtn, { backgroundColor: accentColor }]}>
            <Text style={styles.doneBtnText}>Go Back</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  if (phase === 'done') {
    return (
      <View style={[styles.root, { backgroundColor: colors.background, paddingTop: insets.top }]}>
        <View style={styles.centerContent}>
          <Text style={{ fontSize: 72 }}>🎉</Text>
          <Text style={[styles.doneTitle, { color: colors.foreground }]}>Stack Complete!</Text>
          <Text style={[styles.doneSub, { color: colors.muted }]}>
            You finished all {stack.steps.length} steps of your {stack.name}.
          </Text>
          <Pressable onPress={() => router.back()} style={[styles.doneBtn, { backgroundColor: accentColor }]}>
            <Text style={styles.doneBtnText}>Done</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const currentStep = stack.steps[stepIdx];
  const dur = stepDefaultDuration(currentStep);
  const progress = dur > 0 ? Math.min(elapsed / dur, 1) : 0;
  const remaining = dur > 0 ? Math.max(dur - elapsed, 0) : null;
  const isManual = !stepIsAutoComplete(currentStep);

  function formatTime(secs: number) {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable onPress={() => { clearInterval(intervalRef.current!); router.back(); }}
          style={({ pressed }) => [styles.backBtn, { opacity: pressed ? 0.6 : 1 }]}>
          <IconSymbol name="xmark" size={22} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>{stack.name}</Text>
        <Text style={[styles.stepCounter, { color: colors.muted }]}>{stepIdx + 1}/{stack.steps.length}</Text>
      </View>

      <View style={[styles.progressTrack, { backgroundColor: colors.border }]}>
        <View style={[styles.progressFill, {
          backgroundColor: accentColor,
          width: `${((stepIdx + (phase === 'running' ? progress : 0)) / stack.steps.length) * 100}%`,
        }]} />
      </View>

      {phase === 'delay' && (
        <View style={styles.centerContent}>
          <Text style={[styles.delayLabel, { color: colors.muted }]}>Next step in</Text>
          <Text style={[styles.delayCountdown, { color: accentColor }]}>{countdown}</Text>
          <Text style={[styles.delayStepName, { color: colors.foreground }]}>
            {STEP_TYPE_META[currentStep.type].emoji} {stepLabel(currentStep)}
          </Text>
          <Pressable onPress={skipStep} style={({ pressed }) => [styles.skipBtn, { borderColor: colors.border, opacity: pressed ? 0.7 : 1 }]}>
            <Text style={[styles.skipText, { color: colors.muted }]}>Skip delay</Text>
          </Pressable>
        </View>
      )}

      {phase === 'running' && (
        <View style={styles.centerContent}>
          <Animated.View style={[styles.bigIconWrap, { backgroundColor: accentColor + '22', transform: [{ scale: pulseAnim }] }]}>
            <Text style={styles.bigEmoji}>{STEP_TYPE_META[currentStep.type].emoji}</Text>
          </Animated.View>
          <Text style={[styles.stepTypeLabel, { color: colors.muted }]}>
            {STEP_TYPE_META[currentStep.type].label.toUpperCase()}
          </Text>
          <Text style={[styles.stepNameBig, { color: colors.foreground }]}>{stepLabel(currentStep)}</Text>
          {remaining !== null && (
            <Text style={[styles.timerText, { color: accentColor }]}>{formatTime(remaining)}</Text>
          )}
          {isManual && (
            <Pressable onPress={markDone} style={[styles.doneStepBtn, { backgroundColor: accentColor }]}>
              <Text style={styles.doneStepBtnText}>Done</Text>
            </Pressable>
          )}
          <Pressable onPress={skipStep} style={({ pressed }) => [styles.skipBtn, { borderColor: colors.border, opacity: pressed ? 0.7 : 1, marginTop: 16 }]}>
            <Text style={[styles.skipText, { color: colors.muted }]}>Skip step</Text>
          </Pressable>
          {stepIdx < stack.steps.length - 1 && (
            <View style={[styles.upcomingBox, { borderColor: colors.border }]}>
              <Text style={[styles.upcomingLabel, { color: colors.muted }]}>Up next</Text>
              <Text style={[styles.upcomingStep, { color: colors.foreground }]}>
                {STEP_TYPE_META[stack.steps[stepIdx + 1].type].emoji} {stepLabel(stack.steps[stepIdx + 1])}
              </Text>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  backBtn: { padding: 4, width: 40 },
  headerTitle: { flex: 1, fontSize: 18, fontWeight: '700', textAlign: 'center' },
  stepCounter: { fontSize: 13, fontWeight: '600', width: 40, textAlign: 'right' },
  progressTrack: { height: 3 },
  progressFill: { height: 3 },
  centerContent: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  delayLabel: { fontSize: 16, fontWeight: '600', marginBottom: 8 },
  delayCountdown: { fontSize: 80, fontWeight: '900', lineHeight: 88 },
  delayStepName: { fontSize: 20, fontWeight: '700', marginTop: 16, textAlign: 'center' },
  bigIconWrap: { width: 120, height: 120, borderRadius: 60, alignItems: 'center', justifyContent: 'center', marginBottom: 24 },
  bigEmoji: { fontSize: 56 },
  stepTypeLabel: { fontSize: 12, fontWeight: '700', letterSpacing: 1.5, marginBottom: 8 },
  stepNameBig: { fontSize: 26, fontWeight: '800', textAlign: 'center', marginBottom: 16 },
  timerText: { fontSize: 52, fontWeight: '900', letterSpacing: -1, marginBottom: 24 },
  doneStepBtn: { paddingHorizontal: 48, paddingVertical: 16, borderRadius: 30, marginBottom: 8 },
  doneStepBtnText: { color: '#fff', fontSize: 18, fontWeight: '800' },
  skipBtn: { borderWidth: 1, borderRadius: 20, paddingHorizontal: 20, paddingVertical: 8 },
  skipText: { fontSize: 14, fontWeight: '600' },
  upcomingBox: { borderWidth: 1, borderRadius: 12, padding: 12, marginTop: 32, alignItems: 'center', minWidth: 200 },
  upcomingLabel: { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
  upcomingStep: { fontSize: 15, fontWeight: '700' },
  doneTitle: { fontSize: 28, fontWeight: '900', marginTop: 16, marginBottom: 8 },
  doneSub: { fontSize: 15, textAlign: 'center', lineHeight: 22, marginBottom: 32 },
  doneBtn: { paddingHorizontal: 48, paddingVertical: 16, borderRadius: 30 },
  doneBtnText: { color: '#fff', fontSize: 18, fontWeight: '800' },
});
