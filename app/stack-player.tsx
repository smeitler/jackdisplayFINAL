/**
 * Stack Player Screen
 * Runs a ritual stack step by step with auto-advance, countdown delay,
 * and always-visible Cancel (top-left) + Skip (top-right) controls.
 *
 * Audio playback:
 *  - motivational: plays a speech from the CDN library (random or sequential by category)
 *  - affirmations: plays N affirmations from the CDN library (random or sequential, by category)
 *  - custom: plays user-uploaded MP3 files (random or sequential rotation)
 *
 * Uses createAudioPlayer (not useAudioPlayer) so we can call player.replace()
 * to swap tracks without creating/destroying the native player object.
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, Pressable, StyleSheet, Platform, Animated } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';

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
import {
  AFFIRMATIONS,
  getAffirmationsByCategory,
  type AffirmationCategory,
} from '@/app/data/affirmations';
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
    const mode = cfg.affirmationsMode ?? 'random';
    const count = Math.min(cfg.affirmationsCount ?? 1, 10);
    const category = cfg.affirmationsCategory as AffirmationCategory | undefined;
    const pool = category
      ? getAffirmationsByCategory(category).map((a) => a.url)
      : AFFIRMATIONS.map((a) => a.url);
    const seqKey = `affirmations_${category ?? 'all'}`;
    const urls: string[] = [];
    for (let i = 0; i < count; i++) {
      const url = pickFromPool(pool, mode, seqKey);
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

// ── Robust audio engine using createAudioPlayer + replace() ──────────────────
// This avoids the useAudioPlayer limitation where source changes don't
// reliably trigger a new load. createAudioPlayer gives us a stable native
// player instance we can replace() the source on at will.
function useStepAudio(step: RitualStep | null, phase: Phase) {
  const playerRef = useRef<ReturnType<typeof createAudioPlayer> | null>(null);
  const urlsRef = useRef<string[]>([]);
  const idxRef = useRef(0);
  const activeStepIdRef = useRef<string | null>(null);

  // Create the player once on mount, destroy on unmount
  useEffect(() => {
    // Start with a silent placeholder so the player is ready
    const p = createAudioPlayer({ uri: '' });
    playerRef.current = p;
    return () => {
      try { p.remove(); } catch {}
      playerRef.current = null;
    };
  }, []);

  // When step changes, resolve URLs and load the first track
  useEffect(() => {
    urlsRef.current = [];
    idxRef.current = 0;

    if (!step || !['motivational', 'affirmations', 'custom'].includes(step.type)) {
      return;
    }

    const stepId = step.id;
    activeStepIdRef.current = stepId;

    resolveStepAudioUrls(step).then((urls) => {
      // Guard: step may have changed while we were resolving
      if (activeStepIdRef.current !== stepId) return;
      urlsRef.current = urls;
      idxRef.current = 0;
      // If already running, start playing immediately
      if (phase === 'running' && urls.length > 0) {
        playCurrentTrack();
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step?.id, step?.type]);

  // When phase transitions to running, start playback
  useEffect(() => {
    if (phase === 'running') {
      if (urlsRef.current.length > 0) {
        playCurrentTrack();
      }
    } else {
      // Pause on any non-running phase
      try { playerRef.current?.pause(); } catch {}
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // Set up the "did just finish" listener once on mount
  useEffect(() => {
    const p = playerRef.current;
    if (!p) return;
    const sub = p.addListener('playbackStatusUpdate', (status: any) => {
      if (!status.didJustFinish) return;
      const urls = urlsRef.current;
      const idx = idxRef.current;
      if (idx < urls.length - 1) {
        // Advance to next track in playlist (affirmations)
        idxRef.current = idx + 1;
        playCurrentTrack();
      }
    });
    return () => { try { sub?.remove?.(); } catch {} };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function playCurrentTrack() {
    const p = playerRef.current;
    if (!p) return;
    const url = urlsRef.current[idxRef.current];
    if (!url) return;
    (async () => {
      try {
        await setAudioModeAsync({ playsInSilentMode: true });
        p.replace({ uri: url });
        p.play();
      } catch (e) {
        console.warn('[StackPlayer] audio error:', e);
      }
    })();
  }

  function stopAudio() {
    try { playerRef.current?.pause(); } catch {}
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

  // Fade animation for step transitions
  const fadeAnim = useRef(new Animated.Value(1)).current;

  const currentStep = stack?.steps[stepIdx] ?? null;
  const totalSteps = stack?.steps.length ?? 0;

  const { stopAudio } = useStepAudio(currentStep, phase);

  // Load stack on mount
  useEffect(() => {
    if (!id) return;
    loadStacks().then((stacks) => {
      const found = stacks.find((s) => s.id === id);
      if (found) setStack(found);
    });
  }, [id]);

  // Start delay countdown when stack loads or step changes
  useEffect(() => {
    if (!stack || !currentStep) return;
    setPhase('delay');
    setCountdown(3);
    setElapsed(0);
  }, [stack, stepIdx]);

  // Tick logic
  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);

    if (phase === 'delay') {
      intervalRef.current = setInterval(() => {
        setCountdown((c) => {
          if (c <= 1) {
            clearInterval(intervalRef.current!);
            setPhase('running');
            return 0;
          }
          return c - 1;
        });
      }, 1000);
    } else if (phase === 'running') {
      const step = currentStep;
      if (!step) return;
      const autoComplete = stepIsAutoComplete(step);
      const duration = stepDefaultDuration(step);

      if (autoComplete) {
        intervalRef.current = setInterval(() => {
          setElapsed((e) => {
            if (e + 1 >= duration) {
              clearInterval(intervalRef.current!);
              advanceStep();
              return 0;
            }
            return e + 1;
          });
        }, 1000);
      } else {
        intervalRef.current = setInterval(() => {
          setElapsed((e) => e + 1);
        }, 1000);
      }
    }

    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, stepIdx]);

  const advanceStep = useCallback(() => {
    stopAudio();
    if (stepIdx + 1 >= totalSteps) {
      setPhase('done');
      return;
    }
    Animated.sequence([
      Animated.timing(fadeAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
      Animated.timing(fadeAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
    ]).start();
    setStepIdx((i) => i + 1);
  }, [stopAudio, stepIdx, totalSteps, fadeAnim]);

  const handleSkip = useCallback(() => {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (intervalRef.current) clearInterval(intervalRef.current);
    advanceStep();
  }, [advanceStep]);

  const handleCancel = useCallback(() => {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (intervalRef.current) clearInterval(intervalRef.current);
    stopAudio();
    router.back();
  }, [stopAudio, router]);

  const handleComplete = useCallback(() => {
    if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    router.back();
  }, [router]);

  if (!stack) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
        <Text style={[styles.loadingText, { color: colors.muted }]}>Loading…</Text>
      </View>
    );
  }

  if (phase === 'done') {
    return (
      <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <View style={styles.doneContainer}>
          <IconSymbol name="checkmark.circle.fill" size={72} color={colors.success ?? '#22C55E'} />
          <Text style={[styles.doneTitle, { color: colors.foreground }]}>Stack Complete</Text>
          <Text style={[styles.doneSubtitle, { color: colors.muted }]}>{stack.name}</Text>
          <Pressable
            onPress={handleComplete}
            style={({ pressed }) => [styles.doneButton, { backgroundColor: colors.primary, opacity: pressed ? 0.8 : 1 }]}
          >
            <Text style={[styles.doneButtonText, { color: '#fff' }]}>Done</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const step = currentStep!;
  const meta = STEP_TYPE_META[step.type];
  const iconName = (STEP_ICON[step.type] ?? 'sparkles') as any;
  const duration = stepDefaultDuration(step);
    const autoComplete = stepIsAutoComplete(step);
  const progress = autoComplete && duration > 0 ? Math.min(elapsed / duration, 1) : 0;

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      {/* Header row: Cancel | progress dots | Skip */}
      <View style={styles.headerRow}>
        <Pressable
          onPress={handleCancel}
          style={({ pressed }) => [styles.headerBtn, { opacity: pressed ? 0.6 : 1 }]}
        >
          <Text style={[styles.headerBtnText, { color: colors.muted }]}>Cancel</Text>
        </Pressable>

        <View style={styles.dotRow}>
          {stack.steps.map((_, i) => (
            <View
              key={i}
              style={[
                styles.dot,
                {
                  backgroundColor: i === stepIdx ? colors.primary : colors.border,
                  width: i === stepIdx ? 20 : 8,
                },
              ]}
            />
          ))}
        </View>

        <Pressable
          onPress={handleSkip}
          style={({ pressed }) => [styles.headerBtn, { opacity: pressed ? 0.6 : 1 }]}
        >
          <Text style={[styles.headerBtnText, { color: colors.muted }]}>Skip</Text>
        </Pressable>
      </View>

      {/* Step content */}
      <Animated.View style={[styles.content, { opacity: fadeAnim }]}>
        {phase === 'delay' ? (
          <View style={styles.delayContainer}>
            <Text style={[styles.delayLabel, { color: colors.muted }]}>Starting in</Text>
            <Text style={[styles.delayCount, { color: colors.foreground }]}>{countdown}</Text>
            <Text style={[styles.delayStepName, { color: colors.muted }]}>{meta.label}</Text>
          </View>
        ) : (
          <View style={styles.stepContainer}>
            <View style={[styles.iconCircle, { backgroundColor: colors.primary + '18' }]}>
              <IconSymbol name={iconName} size={48} color={colors.primary} />
            </View>

            <Text style={[styles.stepTitle, { color: colors.foreground }]}>{stepLabel(step)}</Text>
            <Text style={[styles.stepType, { color: colors.muted }]}>{meta.label}</Text>

            {/* Timer / elapsed */}
            {autoComplete ? (
              <View style={styles.timerArea}>
                <Text style={[styles.timerText, { color: colors.foreground }]}>
                  {Math.max(0, duration - elapsed)}s
                </Text>
                <View style={[styles.progressBar, { backgroundColor: colors.border }]}>
                  <View style={[styles.progressFill, { backgroundColor: colors.primary, width: `${progress * 100}%` as any }]} />
                </View>
              </View>
            ) : (
              <Text style={[styles.elapsedText, { color: colors.muted }]}>
                {elapsed}s elapsed
              </Text>
            )}

            {/* Manual complete for non-auto steps */}
            {!autoComplete && (
              <Pressable
                onPress={advanceStep}
                style={({ pressed }) => [styles.completeBtn, { backgroundColor: colors.primary, opacity: pressed ? 0.8 : 1 }]}
              >
                <Text style={[styles.completeBtnText, { color: '#fff' }]}>
                  {stepIdx + 1 < totalSteps ? 'Next Step' : 'Finish'}
                </Text>
              </Pressable>
            )}
          </View>
        )}
      </Animated.View>

      {/* Step counter */}
      <Text style={[styles.stepCounter, { color: colors.muted }]}>
        Step {stepIdx + 1} of {totalSteps}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingText: {
    textAlign: 'center',
    marginTop: 80,
    fontSize: 16,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  headerBtn: {
    paddingHorizontal: 8,
    paddingVertical: 6,
    minWidth: 60,
  },
  headerBtnText: {
    fontSize: 16,
    fontWeight: '500',
  },
  dotRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dot: {
    height: 8,
    borderRadius: 4,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  delayContainer: {
    alignItems: 'center',
    gap: 8,
  },
  delayLabel: {
    fontSize: 16,
    fontWeight: '500',
  },
  delayCount: {
    fontSize: 72,
    fontWeight: '700',
    lineHeight: 80,
  },
  delayStepName: {
    fontSize: 18,
    fontWeight: '500',
    marginTop: 8,
  },
  stepContainer: {
    alignItems: 'center',
    gap: 16,
    width: '100%',
  },
  iconCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  stepTitle: {
    fontSize: 24,
    fontWeight: '700',
    textAlign: 'center',
  },
  stepType: {
    fontSize: 16,
    fontWeight: '500',
  },
  timerArea: {
    alignItems: 'center',
    gap: 12,
    width: '100%',
    marginTop: 8,
  },
  timerText: {
    fontSize: 48,
    fontWeight: '700',
    lineHeight: 56,
  },
  progressBar: {
    width: '100%',
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
  },
  elapsedText: {
    fontSize: 20,
    fontWeight: '500',
    marginTop: 8,
  },
  completeBtn: {
    marginTop: 32,
    paddingHorizontal: 40,
    paddingVertical: 16,
    borderRadius: 14,
  },
  completeBtnText: {
    fontSize: 18,
    fontWeight: '700',
  },
  stepCounter: {
    textAlign: 'center',
    fontSize: 14,
    paddingBottom: 16,
  },
  doneContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    paddingHorizontal: 32,
  },
  doneTitle: {
    fontSize: 32,
    fontWeight: '700',
  },
  doneSubtitle: {
    fontSize: 18,
    fontWeight: '500',
  },
  doneButton: {
    marginTop: 24,
    paddingHorizontal: 48,
    paddingVertical: 16,
    borderRadius: 14,
  },
  doneButtonText: {
    fontSize: 18,
    fontWeight: '700',
  },
});
