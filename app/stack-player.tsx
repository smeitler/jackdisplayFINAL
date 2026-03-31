/**
 * Stack Player Screen
 * Runs a ritual stack step by step with auto-advance, countdown delay,
 * and always-visible Cancel (top-left) + Skip (top-right) controls.
 *
 * Audio playback:
 *  - motivational: plays one speech from the CDN library
 *  - affirmations: plays N affirmations in sequence, showing current + up-next,
 *                  and advances to the next STEP only after all tracks finish
 *  - custom: plays one user-uploaded MP3 per step run
 *
 * Uses createAudioPlayer + player.replace() for reliable track swapping.
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
  type Affirmation,
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

function pickIndexFromPool(poolLen: number, mode: 'random' | 'sequential', key: string): number {
  if (poolLen === 0) return -1;
  if (mode === 'random') return Math.floor(Math.random() * poolLen);
  const last = seqIndexes[key] ?? -1;
  const next = (last + 1) % poolLen;
  seqIndexes[key] = next;
  return next;
}

// ── Resolved track info ───────────────────────────────────────────────────────
interface ResolvedTrack {
  url: string;
  label: string;   // e.g. "Confidence #3" or "Track 1"
  category?: string;
}

interface ResolvedAudio {
  tracks: ResolvedTrack[];
  isAffirmations: boolean;
}

async function resolveStepAudio(step: RitualStep): Promise<ResolvedAudio> {
  const cfg = step.config;

  if (step.type === 'motivational') {
    const mode = cfg.motivationalSpeechMode ?? 'random';
    const pool = cfg.motivationalSpeechCategory
      ? getSpeechesByCategory(cfg.motivationalSpeechCategory as SpeechCategory)
      : MOTIVATIONAL_SPEECHES;
    const idx = pickIndexFromPool(pool.length, mode, `motivational_${cfg.motivationalSpeechCategory ?? 'any'}`);
    if (idx < 0) return { tracks: [], isAffirmations: false };
    const s = pool[idx];
    return {
      tracks: [{ url: s.url, label: s.category, category: s.category }],
      isAffirmations: false,
    };
  }

  if (step.type === 'affirmations') {
    const mode = cfg.affirmationsMode ?? 'random';
    const count = Math.min(cfg.affirmationsCount ?? 1, 10);
    const category = cfg.affirmationsCategory as AffirmationCategory | undefined;
    const pool: Affirmation[] = category
      ? getAffirmationsByCategory(category)
      : AFFIRMATIONS;
    const seqKey = `affirmations_${category ?? 'all'}`;
    const tracks: ResolvedTrack[] = [];
    const usedIndexes = new Set<number>();
    for (let i = 0; i < count; i++) {
      // For random mode, avoid repeats within the same session batch
      let idx: number;
      if (mode === 'random') {
        const available = pool
          .map((_, j) => j)
          .filter((j) => !usedIndexes.has(j));
        if (available.length === 0) break;
        idx = available[Math.floor(Math.random() * available.length)];
        usedIndexes.add(idx);
      } else {
        idx = pickIndexFromPool(pool.length, 'sequential', seqKey);
      }
      if (idx < 0) break;
      const a = pool[idx];
      tracks.push({
        url: a.url,
        label: `${a.category} #${a.number}`,
        category: a.category,
      });
    }
    return { tracks, isAffirmations: true };
  }

  if (step.type === 'custom') {
    const mode = cfg.customAudioMode ?? 'sequential';
    const files = await loadCustomAudioFiles();
    if (!files.length) return { tracks: [], isAffirmations: false };
    const idx = pickIndexFromPool(files.length, mode, `custom_audio`);
    if (idx < 0) return { tracks: [], isAffirmations: false };
    const f = files[idx];
    const name = f.name ?? f.uri.split('/').pop() ?? 'Custom Audio';
    return {
      tracks: [{ url: f.uri, label: name }],
      isAffirmations: false,
    };
  }

  return { tracks: [], isAffirmations: false };
}

// ── Audio state exposed to UI ─────────────────────────────────────────────────
interface AudioState {
  tracks: ResolvedTrack[];
  currentIdx: number;
  isAffirmations: boolean;
}

// ── Robust audio engine ───────────────────────────────────────────────────────
function useStepAudio(
  step: RitualStep | null,
  phase: Phase,
  onAllTracksFinished: () => void,
) {
  const playerRef = useRef<ReturnType<typeof createAudioPlayer> | null>(null);
  const audioStateRef = useRef<AudioState>({ tracks: [], currentIdx: 0, isAffirmations: false });
  const activeStepIdRef = useRef<string | null>(null);
  const onFinishedRef = useRef(onAllTracksFinished);
  onFinishedRef.current = onAllTracksFinished;

  // Expose current audio state to React via a state variable
  const [audioState, setAudioState] = useState<AudioState>({
    tracks: [], currentIdx: 0, isAffirmations: false,
  });

  // Create player once on mount
  useEffect(() => {
    const p = createAudioPlayer({ uri: '' });
    playerRef.current = p;

    const sub = p.addListener('playbackStatusUpdate', (status: any) => {
      if (!status.didJustFinish) return;
      const { tracks, currentIdx, isAffirmations } = audioStateRef.current;
      if (currentIdx < tracks.length - 1) {
        // More tracks — advance to next
        const nextIdx = currentIdx + 1;
        audioStateRef.current = { ...audioStateRef.current, currentIdx: nextIdx };
        setAudioState({ ...audioStateRef.current });
        playTrack(tracks[nextIdx].url);
      } else {
        // All tracks done — notify parent to advance step
        onFinishedRef.current();
      }
    });

    return () => {
      try { sub?.remove?.(); } catch {}
      try { p.remove(); } catch {}
      playerRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // When step changes, resolve tracks
  useEffect(() => {
    const empty: AudioState = { tracks: [], currentIdx: 0, isAffirmations: false };
    audioStateRef.current = empty;
    setAudioState(empty);

    if (!step || !['motivational', 'affirmations', 'custom'].includes(step.type)) return;

    const stepId = step.id;
    activeStepIdRef.current = stepId;

    resolveStepAudio(step).then(({ tracks, isAffirmations }) => {
      if (activeStepIdRef.current !== stepId) return;
      const newState: AudioState = { tracks, currentIdx: 0, isAffirmations };
      audioStateRef.current = newState;
      setAudioState(newState);
      if (phase === 'running' && tracks.length > 0) {
        playTrack(tracks[0].url);
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step?.id, step?.type]);

  // When phase becomes running, start playback
  useEffect(() => {
    if (phase === 'running') {
      const { tracks, currentIdx } = audioStateRef.current;
      if (tracks.length > 0) {
        playTrack(tracks[currentIdx].url);
      }
    } else {
      try { playerRef.current?.pause(); } catch {}
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  function playTrack(url: string) {
    const p = playerRef.current;
    if (!p || !url) return;
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

  return { stopAudio, audioState };
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
  // Track fade for affirmation transitions
  const trackFadeAnim = useRef(new Animated.Value(1)).current;

  const currentStep = stack?.steps[stepIdx] ?? null;
  const totalSteps = stack?.steps.length ?? 0;

  // advanceStep is called either by the timer (non-affirmation auto steps)
  // or by the audio engine (when all affirmation tracks finish)
  const advanceStepRef = useRef<() => void>(() => {});

  const { stopAudio, audioState } = useStepAudio(
    currentStep,
    phase,
    useCallback(() => {
      // Called when all audio tracks for this step are done
      advanceStepRef.current();
    }, []),
  );

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

  // Animate track card when currentIdx changes
  useEffect(() => {
    if (audioState.isAffirmations && audioState.currentIdx > 0) {
      Animated.sequence([
        Animated.timing(trackFadeAnim, { toValue: 0, duration: 150, useNativeDriver: true }),
        Animated.timing(trackFadeAnim, { toValue: 1, duration: 250, useNativeDriver: true }),
      ]).start();
    }
  }, [audioState.currentIdx]);

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

  // Keep advanceStepRef in sync
  useEffect(() => {
    advanceStepRef.current = advanceStep;
  }, [advanceStep]);

  // Tick logic — affirmations steps are audio-driven, not timer-driven
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

      // Affirmations: audio-driven advance — just count elapsed for display
      if (step.type === 'affirmations') {
        intervalRef.current = setInterval(() => {
          setElapsed((e) => e + 1);
        }, 1000);
        return;
      }

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

  // Affirmations track info
  const isAffirmationsStep = step.type === 'affirmations';
  const currentTrack = audioState.tracks[audioState.currentIdx] ?? null;
  const nextTrack = audioState.tracks[audioState.currentIdx + 1] ?? null;
  const trackCount = audioState.tracks.length;
  const trackNum = audioState.currentIdx + 1;

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

            {/* ── Affirmations: track display ── */}
            {isAffirmationsStep && trackCount > 0 && (
              <View style={styles.affirmationsArea}>
                {/* Track counter pills */}
                <View style={styles.trackPills}>
                  {audioState.tracks.map((_, i) => (
                    <View
                      key={i}
                      style={[
                        styles.trackPill,
                        {
                          backgroundColor: i === audioState.currentIdx
                            ? colors.primary
                            : i < audioState.currentIdx
                              ? colors.primary + '40'
                              : colors.border,
                          width: i === audioState.currentIdx ? 24 : 8,
                        },
                      ]}
                    />
                  ))}
                </View>

                {/* Current track card */}
                <Animated.View
                  style={[
                    styles.currentTrackCard,
                    { backgroundColor: colors.primary + '14', borderColor: colors.primary + '30', opacity: trackFadeAnim },
                  ]}
                >
                  <Text style={[styles.trackCounterText, { color: colors.primary }]}>
                    {trackNum} of {trackCount}
                  </Text>
                  <Text style={[styles.currentTrackLabel, { color: colors.foreground }]}>
                    {currentTrack?.label ?? '…'}
                  </Text>
                  {currentTrack?.category && (
                    <View style={[styles.categoryBadge, { backgroundColor: colors.primary + '20' }]}>
                      <Text style={[styles.categoryBadgeText, { color: colors.primary }]}>
                        {currentTrack.category}
                      </Text>
                    </View>
                  )}
                </Animated.View>

                {/* Up Next */}
                {nextTrack && (
                  <View style={[styles.upNextRow, { borderColor: colors.border }]}>
                    <Text style={[styles.upNextLabel, { color: colors.muted }]}>Up Next</Text>
                    <Text style={[styles.upNextTrack, { color: colors.foreground }]}>
                      {nextTrack.label}
                    </Text>
                  </View>
                )}

                {/* "Last one" indicator */}
                {!nextTrack && trackCount > 1 && (
                  <View style={[styles.upNextRow, { borderColor: colors.border }]}>
                    <Text style={[styles.upNextLabel, { color: colors.muted }]}>Last affirmation</Text>
                  </View>
                )}
              </View>
            )}

            {/* ── Timer / elapsed for non-affirmation steps ── */}
            {!isAffirmationsStep && autoComplete && (
              <View style={styles.timerArea}>
                <Text style={[styles.timerText, { color: colors.foreground }]}>
                  {Math.max(0, duration - elapsed)}s
                </Text>
                <View style={[styles.progressBar, { backgroundColor: colors.border }]}>
                  <View style={[styles.progressFill, { backgroundColor: colors.primary, width: `${progress * 100}%` as any }]} />
                </View>
              </View>
            )}

            {/* Elapsed for affirmations (audio-driven) */}
            {isAffirmationsStep && (
              <Text style={[styles.elapsedText, { color: colors.muted }]}>
                {elapsed}s
              </Text>
            )}

            {/* Elapsed for non-auto, non-affirmation steps */}
            {!isAffirmationsStep && !autoComplete && (
              <Text style={[styles.elapsedText, { color: colors.muted }]}>
                {elapsed}s elapsed
              </Text>
            )}

            {/* Manual complete for non-auto, non-affirmation steps */}
            {!isAffirmationsStep && !autoComplete && (
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
  // ── Affirmations track display ──────────────────────────────────────────────
  affirmationsArea: {
    width: '100%',
    alignItems: 'center',
    gap: 12,
    marginTop: 4,
  },
  trackPills: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  trackPill: {
    height: 6,
    borderRadius: 3,
  },
  currentTrackCard: {
    width: '100%',
    borderRadius: 16,
    borderWidth: 1,
    padding: 20,
    alignItems: 'center',
    gap: 8,
  },
  trackCounterText: {
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  currentTrackLabel: {
    fontSize: 22,
    fontWeight: '700',
    textAlign: 'center',
  },
  categoryBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 20,
    marginTop: 2,
  },
  categoryBadgeText: {
    fontSize: 13,
    fontWeight: '600',
  },
  upNextRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderTopWidth: 1,
  },
  upNextLabel: {
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    minWidth: 60,
  },
  upNextTrack: {
    fontSize: 15,
    fontWeight: '500',
    flex: 1,
  },
  // ── Timer / elapsed ─────────────────────────────────────────────────────────
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
