/**
 * Stack Player Screen
 * Runs a ritual stack step by step with auto-advance, countdown delay,
 * and always-visible Cancel (top-left) + Skip (top-right) controls.
 *
 * Audio playback:
 *  - motivational: plays a speech from the CDN library (random or sequential by category)
 *  - affirmations: plays N affirmations from the CDN library (random or sequential)
 *  - custom: plays user-uploaded MP3 files (random or sequential rotation)
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, Pressable, StyleSheet, Platform, Animated } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useAudioPlayer, setAudioModeAsync } from 'expo-audio';

import { IconSymbol } from '@/components/ui/icon-symbol';
import { useColors } from '@/hooks/use-colors';
import {
  loadStacks, stepLabel, stepDefaultDuration, stepIsAutoComplete, STEP_TYPE_META,
  type RitualStack, type RitualStep,
} from '@/lib/stacks';
import {
  MOTIVATIONAL_SPEECHES,
  getSpeechesByCategory,
  type SpeechCategory,
} from '@/app/data/motivational-speeches';
import { AFFIRMATIONS } from '@/app/data/affirmations';
import { loadCustomAudioFiles } from '@/lib/custom-audio';

const STEP_ICON: Record<string, string> = {
  timer:        'timer',
  stopwatch:    'stopwatch',
  meditation:   'sparkles',
  breathwork:   'wind',
  journal:      'book.fill',
  affirmations: 'quote.bubble.fill',
  priming:      'flame.fill',
  reminder:     'bell.fill',
  melatonin:    'moon.fill',
  motivational: 'bolt.fill',
  spiritual:    'sparkles',
  custom:       'pencil',
};

type Phase = 'delay' | 'running' | 'done';

// ── Sequential index storage (in-memory per session) ─────────────────────────
const seqIndexes: Record<string, number> = {};

function pickFromPool(pool: string[], mode: 'random' | 'sequential', key: string): string | null {
  if (!pool.length) return null;
  if (mode === 'random') return pool[Math.floor(Math.random() * pool.length)];
  const last = seqIndexes[key] ?? -1;
  const next = (last + 1) % pool.length;
  seqIndexes[key] = next;
  return pool[next];
}

// ── Resolve audio URLs for a step ────────────────────────────────────────────
async function resolveStepAudioUrls(step: RitualStep): Promise<string[]> {
  const cfg = step.config;

  if (step.type === 'motivational') {
    const mode = cfg.motivationalSpeechMode ?? 'random';
    const pool = cfg.motivationalSpeechCategory
      ? getSpeechesByCategory(cfg.motivationalSpeechCategory as SpeechCategory).map((s) => s.url)
      : MOTIVATIONAL_SPEECHES.map((s) => s.url);
    const url = pickFromPool(pool, mode, `motivational_${cfg.motivationalSpeechCategory ?? 'any'}`);
    return url ? [url] : [];
  }

  if (step.type === 'affirmations') {
    const mode = cfg.affirmationsMode ?? 'sequential';
    const count = cfg.affirmationsCount ?? 1;
    const pool = AFFIRMATIONS.map((a) => a.url);
    const urls: string[] = [];
    for (let i = 0; i < count; i++) {
      const url = pickFromPool(pool, mode, `affirmations_seq`);
      if (url) urls.push(url);
    }
    return urls;
  }

  if (step.type === 'custom') {
    const mode = cfg.customAudioMode ?? 'sequential';
    const files = await loadCustomAudioFiles();
    if (!files.length) return [];
    const pool = files.map((f) => f.uri);
    const url = pickFromPool(pool, mode, `custom_audio`);
    return url ? [url] : [];
  }

  return [];
}

// ── Audio player hook ─────────────────────────────────────────────────────────
function useStepAudio(step: RitualStep | null, phase: Phase) {
  const [audioUrls, setAudioUrls] = useState<string[]>([]);
  const [audioIdx, setAudioIdx] = useState(0);
  const player = useAudioPlayer(audioUrls[audioIdx] ? { uri: audioUrls[audioIdx] } : null);
  const resolvedRef = useRef(false);

  // Resolve URLs when step changes
  useEffect(() => {
    resolvedRef.current = false;
    setAudioUrls([]);
    setAudioIdx(0);
    if (!step) return;
    if (!['motivational', 'affirmations', 'custom'].includes(step.type)) return;
    resolveStepAudioUrls(step).then((urls) => {
      resolvedRef.current = true;
      setAudioUrls(urls);
      setAudioIdx(0);
    });
  }, [step?.id, step?.type]);

  // Play when running phase starts and we have a URL
  useEffect(() => {
    if (phase !== 'running') {
      try { player.pause(); } catch {}
      return;
    }
    if (!audioUrls[audioIdx]) return;
    (async () => {
      try {
        await setAudioModeAsync({ playsInSilentMode: true });
        player.play();
      } catch {}
    })();
  }, [phase, audioUrls, audioIdx]);

  // Advance to next track when current finishes (for affirmations playlist)
  useEffect(() => {
    if (!player) return;
    const sub = player.addListener('playbackStatusUpdate', (status: any) => {
      if (status.didJustFinish && audioIdx < audioUrls.length - 1) {
        setAudioIdx((i) => i + 1);
      }
    });
    return () => sub?.remove?.();
  }, [player, audioIdx, audioUrls.length]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      try { player.release(); } catch {}
    };
  }, []);

  function stopAudio() {
    try { player.pause(); } catch {}
  }

  return { stopAudio };
}

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

  const currentStep = stack?.steps[stepIdx] ?? null;
  const { stopAudio } = useStepAudio(currentStep, phase);

  useEffect(() => {
    loadStacks().then((all) => {
      const found = all.find((s) => s.id === id);
      if (found) setStack(found);
    });
  }, [id]);

  // Pulse animation for step icon
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.1, duration: 1000, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1,   duration: 1000, useNativeDriver: true }),
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
          if (next >= s.steps.length) { setPhase('done'); } else { setStepIdx(next); }
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
          if (c <= 1) { clearInterval(intervalRef.current!); beginRunning(idx, s); return 0; }
          return c - 1;
        });
      }, 1000);
    } else {
      beginRunning(idx, s);
    }
  }, [beginRunning]);

  // Start first step when stack loads
  useEffect(() => {
    if (stack && stack.steps.length > 0) startStep(0, stack);
    return () => clearInterval(intervalRef.current!);
  }, [stack, startStep]);

  // Re-trigger when stepIdx advances
  const prevIdxRef = useRef(0);
  useEffect(() => {
    if (!stack || stepIdx === prevIdxRef.current) return;
    prevIdxRef.current = stepIdx;
    startStep(stepIdx, stack);
  }, [stepIdx, stack, startStep]);

  function skipStep() {
    if (!stack) return;
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    stopAudio();
    clearInterval(intervalRef.current!);
    const next = stepIdx + 1;
    if (next >= stack.steps.length) { setPhase('done'); } else { setStepIdx(next); }
  }

  function markDone() {
    if (!stack) return;
    stopAudio();
    clearInterval(intervalRef.current!);
    const next = stepIdx + 1;
    if (next >= stack.steps.length) { setPhase('done'); } else { setStepIdx(next); }
  }

  function cancelStack() {
    stopAudio();
    clearInterval(intervalRef.current!);
    router.back();
  }

  const accentColor = stack?.id === 'wakeup' ? '#F97316' : '#8B5CF6';

  // ── Loading ──
  if (!stack) {
    return (
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        <Text style={{ color: colors.muted, textAlign: 'center', marginTop: 80 }}>Loading…</Text>
      </View>
    );
  }

  // ── Empty stack ──
  if (stack.steps.length === 0) {
    return (
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        <View style={[styles.topBar, { paddingTop: insets.top + 16 }]}>
          <Pressable onPress={cancelStack} style={({ pressed }) => [styles.topBarBtn, { opacity: pressed ? 0.6 : 1 }]}>
            <Text style={[styles.topBarBtnText, { color: colors.muted }]}>Cancel</Text>
          </Pressable>
          <Text style={[styles.topBarTitle, { color: colors.foreground }]}>{stack.name}</Text>
          <View style={{ width: 64 }} />
        </View>
        <View style={styles.centerContent}>
          <IconSymbol name="list.bullet" size={48} color={colors.muted} />
          <Text style={[styles.doneTitle, { color: colors.foreground }]}>No steps yet</Text>
          <Text style={[styles.doneSub, { color: colors.muted }]}>Add steps in the editor first.</Text>
          <Pressable onPress={cancelStack} style={[styles.doneBtn, { backgroundColor: accentColor }]}>
            <Text style={styles.doneBtnText}>Go Back</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  // ── Done ──
  if (phase === 'done') {
    return (
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        <View style={[styles.topBar, { paddingTop: insets.top + 16 }]}>
          <View style={{ width: 64 }} />
          <Text style={[styles.topBarTitle, { color: colors.foreground }]}>{stack.name}</Text>
          <View style={{ width: 64 }} />
        </View>
        <View style={styles.centerContent}>
          <IconSymbol name="checkmark.circle.fill" size={72} color={accentColor} />
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

  const step = stack.steps[stepIdx];
  const dur = stepDefaultDuration(step);
  const progress = dur > 0 ? Math.min(elapsed / dur, 1) : 0;
  const remaining = dur > 0 ? Math.max(dur - elapsed, 0) : null;
  const isManual = !stepIsAutoComplete(step);

  function formatTime(secs: number) {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* ── Top bar: Cancel (left) · title · Skip (right) — always visible ── */}
      <View style={[styles.topBar, { paddingTop: insets.top + 16 }]}>
        <Pressable onPress={cancelStack} style={({ pressed }) => [styles.topBarBtn, { opacity: pressed ? 0.6 : 1 }]}>
          <Text style={[styles.topBarBtnText, { color: colors.muted }]}>Cancel</Text>
        </Pressable>
        <Text style={[styles.topBarTitle, { color: colors.foreground }]}>
          {stepIdx + 1} / {stack.steps.length}
        </Text>
        <Pressable onPress={skipStep} style={({ pressed }) => [styles.topBarBtn, { opacity: pressed ? 0.6 : 1 }]}>
          <Text style={[styles.topBarBtnText, { color: accentColor }]}>Skip</Text>
        </Pressable>
      </View>

      {/* ── Progress bar ── */}
      <View style={[styles.progressTrack, { backgroundColor: colors.border }]}>
        <View style={[styles.progressFill, {
          backgroundColor: accentColor,
          width: `${((stepIdx + (phase === 'running' ? progress : 0)) / stack.steps.length) * 100}%`,
        }]} />
      </View>

      {/* ── Delay phase ── */}
      {phase === 'delay' && (
        <View style={styles.centerContent}>
          <Text style={[styles.delayLabel, { color: colors.muted }]}>Next step in</Text>
          <Text style={[styles.delayCountdown, { color: accentColor }]}>{countdown}</Text>
          <View style={styles.upcomingRow}>
            <IconSymbol name={STEP_ICON[step.type] as any} size={20} color={accentColor} />
            <Text style={[styles.delayStepName, { color: colors.foreground }]}>{stepLabel(step)}</Text>
          </View>
        </View>
      )}

      {/* ── Running phase ── */}
      {phase === 'running' && (
        <View style={styles.centerContent}>
          {/* Pulsing icon — no background circle */}
          <Animated.View style={{ transform: [{ scale: pulseAnim }], marginBottom: 24 }}>
            <IconSymbol name={STEP_ICON[step.type] as any} size={80} color={accentColor} />
          </Animated.View>

          <Text style={[styles.stepTypeLabelBig, { color: colors.muted }]}>
            {STEP_TYPE_META[step.type].label.toUpperCase()}
          </Text>
          <Text style={[styles.stepNameBig, { color: colors.foreground }]}>
            {stepLabel(step)}
          </Text>

          {/* Countdown timer */}
          {remaining !== null && (
            <Text style={[styles.timerText, { color: accentColor }]}>{formatTime(remaining)}</Text>
          )}

          {/* Manual "Done" button for non-auto steps */}
          {isManual && (
            <Pressable onPress={markDone} style={[styles.doneStepBtn, { backgroundColor: accentColor }]}>
              <Text style={styles.doneStepBtnText}>Done</Text>
            </Pressable>
          )}

          {/* Up next */}
          {stepIdx < stack.steps.length - 1 && (
            <View style={[styles.upcomingBox, { borderColor: colors.border }]}>
              <Text style={[styles.upcomingLabel, { color: colors.muted }]}>Up next</Text>
              <View style={styles.upcomingRow}>
                <IconSymbol name={STEP_ICON[stack.steps[stepIdx + 1].type] as any} size={16} color={colors.muted} />
                <Text style={[styles.upcomingStep, { color: colors.foreground }]}>
                  {stepLabel(stack.steps[stepIdx + 1])}
                </Text>
              </View>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  // Top bar — always rendered, always in safe area
  topBar: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 8, paddingBottom: 10,
    backgroundColor: 'transparent',
  },
  topBarBtn: { paddingHorizontal: 12, paddingVertical: 6, minWidth: 64 },
  topBarBtnText: { fontSize: 15, fontWeight: '600' },
  topBarTitle: { flex: 1, fontSize: 15, fontWeight: '700', textAlign: 'center' },
  progressTrack: { height: 3 },
  progressFill: { height: 3 },
  centerContent: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  delayLabel: { fontSize: 16, fontWeight: '600', marginBottom: 8 },
  delayCountdown: { fontSize: 88, fontWeight: '900', lineHeight: 96 },
  delayStepName: { fontSize: 18, fontWeight: '700', marginLeft: 8 },
  stepTypeLabelBig: { fontSize: 12, fontWeight: '700', letterSpacing: 1.5, marginBottom: 8 },
  stepNameBig: { fontSize: 26, fontWeight: '800', textAlign: 'center', marginBottom: 16 },
  timerText: { fontSize: 56, fontWeight: '900', letterSpacing: -1, marginBottom: 28 },
  doneStepBtn: { paddingHorizontal: 52, paddingVertical: 16, borderRadius: 30, marginBottom: 8 },
  doneStepBtnText: { color: '#fff', fontSize: 18, fontWeight: '800' },
  upcomingBox: { borderWidth: 1, borderRadius: 14, padding: 14, marginTop: 32, alignItems: 'center', minWidth: 200 },
  upcomingLabel: { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 },
  upcomingRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  upcomingStep: { fontSize: 15, fontWeight: '700' },
  doneTitle: { fontSize: 28, fontWeight: '900', marginTop: 16, marginBottom: 8 },
  doneSub: { fontSize: 15, textAlign: 'center', lineHeight: 22, marginBottom: 32 },
  doneBtn: { paddingHorizontal: 52, paddingVertical: 16, borderRadius: 30 },
  doneBtnText: { color: '#fff', fontSize: 18, fontWeight: '800' },
});
