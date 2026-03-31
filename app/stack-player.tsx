/**
 * Stack Player Screen
 * Runs a ritual stack step by step with auto-advance, countdown delay,
 * and always-visible Cancel (top-left) + Skip (top-right) controls.
 *
 * Audio playback:
 *  - motivational: plays one speech from CDN; audio-driven advance (no timer cut-off)
 *  - affirmations: plays N affirmations in sequence, showing current + up-next
 *  - custom: plays user-uploaded MP3 with play/pause controls
 *
 * Uses createAudioPlayer + player.replace() for reliable track swapping.
 * Custom audio starts AFTER the step screen is visible (500ms delay).
 *
 * Reminder steps show a green/yellow/red habit rating UI instead of Next Step.
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
import { saveHabitRating, type HabitRating as HabitRatingType } from '@/lib/habit-history';

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
  custom:       'music.note',
};

type Phase = 'delay' | 'running' | 'done';
type HabitRating = 'done' | 'partial' | 'missed';

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
  label: string;
  category?: string;
}

interface ResolvedAudio {
  tracks: ResolvedTrack[];
  isAffirmations: boolean;
  isCustom: boolean;
  isMotivational: boolean;
}

async function resolveStepAudio(step: RitualStep): Promise<ResolvedAudio> {
  const cfg = step.config;

  if (step.type === 'motivational') {
    const mode = cfg.motivationalSpeechMode ?? 'random';
    const pool = cfg.motivationalSpeechCategory
      ? getSpeechesByCategory(cfg.motivationalSpeechCategory as SpeechCategory)
      : MOTIVATIONAL_SPEECHES;
    const idx = pickIndexFromPool(pool.length, mode, `motivational_${cfg.motivationalSpeechCategory ?? 'any'}`);
    if (idx < 0) return { tracks: [], isAffirmations: false, isCustom: false, isMotivational: true };
    const s = pool[idx];
    return {
      tracks: [{ url: s.url, label: s.category, category: s.category }],
      isAffirmations: false,
      isCustom: false,
      isMotivational: true,
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
      let idx: number;
      if (mode === 'random') {
        const available = pool.map((_, j) => j).filter((j) => !usedIndexes.has(j));
        if (available.length === 0) break;
        idx = available[Math.floor(Math.random() * available.length)];
        usedIndexes.add(idx);
      } else {
        idx = pickIndexFromPool(pool.length, 'sequential', seqKey);
      }
      if (idx < 0) break;
      const a = pool[idx];
      tracks.push({ url: a.url, label: `${a.category} #${a.number}`, category: a.category });
    }
    return { tracks, isAffirmations: true, isCustom: false, isMotivational: false };
  }

  if (step.type === 'custom') {
    const files = await loadCustomAudioFiles();
    if (files.length === 0) return { tracks: [], isAffirmations: false, isCustom: true, isMotivational: false };
    const mode = step.config.customAudioMode ?? 'random';
    const idx = pickIndexFromPool(files.length, mode, 'custom');
    if (idx < 0) return { tracks: [], isAffirmations: false, isCustom: true, isMotivational: false };
    const f = files[idx];
    const name = f.name ?? f.uri.split('/').pop() ?? 'Audio';
    return {
      tracks: [{ url: f.uri, label: name }],
      isAffirmations: false,
      isCustom: true,
      isMotivational: false,
    };
  }

  return { tracks: [], isAffirmations: false, isCustom: false, isMotivational: false };
}

// ── Audio state exposed to UI ─────────────────────────────────────────────────
interface AudioState {
  tracks: ResolvedTrack[];
  currentIdx: number;
  isAffirmations: boolean;
  isCustom: boolean;
  isMotivational: boolean;
  isPlaying: boolean;
  isPaused: boolean;
  isFinished: boolean; // true when all tracks have completed
}

// ── Robust audio engine ───────────────────────────────────────────────────────
function useStepAudio(
  step: RitualStep | null,
  phase: Phase,
  onAllTracksFinished: () => void,
) {
  const playerRef = useRef<ReturnType<typeof createAudioPlayer> | null>(null);
  const audioStateRef = useRef<AudioState>({
    tracks: [], currentIdx: 0, isAffirmations: false, isCustom: false, isMotivational: false,
    isPlaying: false, isPaused: false, isFinished: false,
  });
  const activeStepIdRef = useRef<string | null>(null);
  const onFinishedRef = useRef(onAllTracksFinished);
  onFinishedRef.current = onAllTracksFinished;
  const customDelayRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [audioState, setAudioState] = useState<AudioState>({
    tracks: [], currentIdx: 0, isAffirmations: false, isCustom: false, isMotivational: false,
    isPlaying: false, isPaused: false, isFinished: false,
  });

  // Create player once on mount
  useEffect(() => {
    const p = createAudioPlayer({ uri: '' });
    playerRef.current = p;

    const sub = p.addListener('playbackStatusUpdate', (status: any) => {
      if (!status.didJustFinish) return;
      const { tracks, currentIdx } = audioStateRef.current;
      if (currentIdx < tracks.length - 1) {
        const nextIdx = currentIdx + 1;
        audioStateRef.current = { ...audioStateRef.current, currentIdx: nextIdx };
        setAudioState({ ...audioStateRef.current });
        playTrack(tracks[nextIdx].url);
      } else {
        audioStateRef.current = { ...audioStateRef.current, isPlaying: false, isPaused: false, isFinished: true };
        setAudioState({ ...audioStateRef.current });
        onFinishedRef.current();
      }
    });

    return () => {
      if (customDelayRef.current) clearTimeout(customDelayRef.current);
      try { sub?.remove?.(); } catch {}
      try { p.remove(); } catch {}
      playerRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // When step changes, resolve tracks (but don't play yet)
  useEffect(() => {
    if (customDelayRef.current) clearTimeout(customDelayRef.current);
    const empty: AudioState = {
      tracks: [], currentIdx: 0, isAffirmations: false, isCustom: false, isMotivational: false,
      isPlaying: false, isPaused: false, isFinished: false,
    };
    audioStateRef.current = empty;
    setAudioState(empty);

    if (!step || !['motivational', 'affirmations', 'custom'].includes(step.type)) return;

    const stepId = step.id;
    activeStepIdRef.current = stepId;

    resolveStepAudio(step).then(({ tracks, isAffirmations, isCustom, isMotivational }) => {
      if (activeStepIdRef.current !== stepId) return;
      const newState: AudioState = {
        tracks, currentIdx: 0, isAffirmations, isCustom, isMotivational,
        isPlaying: false, isPaused: false, isFinished: false,
      };
      audioStateRef.current = newState;
      setAudioState(newState);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step?.id, step?.type]);

  // When phase becomes running, start playback
  useEffect(() => {
    if (customDelayRef.current) clearTimeout(customDelayRef.current);

    if (phase === 'running') {
      const { tracks, currentIdx, isCustom } = audioStateRef.current;
      if (tracks.length > 0) {
        if (isCustom) {
          // Delay custom audio so screen is fully visible first
          customDelayRef.current = setTimeout(() => {
            const { tracks: t, currentIdx: ci } = audioStateRef.current;
            if (t.length > 0) startPlayTrack(t[ci].url);
          }, 500);
        } else {
          startPlayTrack(tracks[currentIdx].url);
        }
      }
    } else {
      try { playerRef.current?.pause(); } catch {}
      audioStateRef.current = { ...audioStateRef.current, isPlaying: false, isPaused: false };
      setAudioState({ ...audioStateRef.current });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  function startPlayTrack(url: string) {
    audioStateRef.current = { ...audioStateRef.current, isPlaying: true, isPaused: false };
    setAudioState({ ...audioStateRef.current });
    playTrack(url);
  }

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
    if (customDelayRef.current) clearTimeout(customDelayRef.current);
    try { playerRef.current?.pause(); } catch {}
    audioStateRef.current = { ...audioStateRef.current, isPlaying: false, isPaused: false };
    setAudioState({ ...audioStateRef.current });
  }

  function pauseAudio() {
    try { playerRef.current?.pause(); } catch {}
    audioStateRef.current = { ...audioStateRef.current, isPlaying: false, isPaused: true };
    setAudioState({ ...audioStateRef.current });
  }

  function resumeAudio() {
    try { playerRef.current?.play(); } catch {}
    audioStateRef.current = { ...audioStateRef.current, isPlaying: true, isPaused: false };
    setAudioState({ ...audioStateRef.current });
  }

  function toggleAudio() {
    if (audioStateRef.current.isPaused) {
      resumeAudio();
    } else if (audioStateRef.current.isPlaying) {
      pauseAudio();
    }
  }

  return { stopAudio, toggleAudio, audioState };
}

// ── Habit rating buttons ──────────────────────────────────────────────────────
const RATING_CONFIG = [
  { key: 'done'    as HabitRating, label: 'Done',    color: '#22C55E', icon: 'checkmark.circle.fill' as const },
  { key: 'partial' as HabitRating, label: 'Partial', color: '#F59E0B', icon: 'minus.circle.fill'     as const },
  { key: 'missed'  as HabitRating, label: 'Missed',  color: '#EF4444', icon: 'xmark.circle.fill'     as const },
];

function HabitRatingButtons({
  onRate,
  colors,
}: {
  onRate: (r: HabitRating) => void;
  colors: ReturnType<typeof import('@/hooks/use-colors').useColors>;
}) {
  const [selected, setSelected] = useState<HabitRating | null>(null);
  const scaleAnims = useRef(RATING_CONFIG.map(() => new Animated.Value(1))).current;

  function handlePress(r: HabitRating, idx: number) {
    setSelected(r);
    if (Platform.OS !== 'web') {
      Haptics.notificationAsync(
        r === 'done' ? Haptics.NotificationFeedbackType.Success
          : r === 'partial' ? Haptics.NotificationFeedbackType.Warning
          : Haptics.NotificationFeedbackType.Error,
      );
    }
    Animated.sequence([
      Animated.timing(scaleAnims[idx], { toValue: 0.92, duration: 80, useNativeDriver: true }),
      Animated.timing(scaleAnims[idx], { toValue: 1.04, duration: 120, useNativeDriver: true }),
      Animated.timing(scaleAnims[idx], { toValue: 1, duration: 100, useNativeDriver: true }),
    ]).start(() => {
      setTimeout(() => onRate(r), 200);
    });
  }

  return (
    <View style={ratingStyles.container}>
      <Text style={[ratingStyles.prompt, { color: colors.muted }]}>How did it go?</Text>
      <View style={ratingStyles.row}>
        {RATING_CONFIG.map(({ key, label, color, icon }, idx) => (
          <Animated.View key={key} style={{ flex: 1, transform: [{ scale: scaleAnims[idx] }] }}>
            <Pressable
              onPress={() => handlePress(key, idx)}
              style={[
                ratingStyles.btn,
                {
                  backgroundColor: selected === key ? color : color + '18',
                  borderColor: color + (selected === key ? 'ff' : '40'),
                  borderWidth: 1.5,
                },
              ]}
            >
              <IconSymbol name={icon} size={28} color={selected === key ? '#fff' : color} />
              <Text style={[
                ratingStyles.btnLabel,
                { color: selected === key ? '#fff' : color },
              ]}>
                {label}
              </Text>
            </Pressable>
          </Animated.View>
        ))}
      </View>
    </View>
  );
}

const ratingStyles = StyleSheet.create({
  container: { width: '100%', gap: 12, marginTop: 8 },
  prompt: { fontSize: 15, fontWeight: '600', textAlign: 'center' },
  row: { flexDirection: 'row', gap: 10, width: '100%' },
  btn: {
    borderRadius: 16,
    paddingVertical: 18,
    alignItems: 'center',
    gap: 6,
  },
  btnLabel: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
});

// ── Waveform bars animation ───────────────────────────────────────────────────
const BAR_HEIGHTS = [14, 22, 30, 22, 14, 26, 18, 30, 22, 14];

function WaveformBars({ isPlaying, color }: { isPlaying: boolean; color: string }) {
  const anims = useRef(BAR_HEIGHTS.map(() => new Animated.Value(0.3))).current;

  useEffect(() => {
    if (isPlaying) {
      const loops = anims.map((anim, i) =>
        Animated.loop(
          Animated.sequence([
            Animated.delay(i * 70),
            Animated.timing(anim, { toValue: 1, duration: 280 + i * 25, useNativeDriver: true }),
            Animated.timing(anim, { toValue: 0.2, duration: 280 + i * 25, useNativeDriver: true }),
          ]),
        ),
      );
      loops.forEach((l) => l.start());
      return () => loops.forEach((l) => l.stop());
    } else {
      anims.forEach((a) => a.setValue(0.3));
    }
  }, [isPlaying]);

  return (
    <View style={waveStyles.container}>
      {anims.map((anim, i) => (
        <Animated.View
          key={i}
          style={[
            waveStyles.bar,
            { height: BAR_HEIGHTS[i], backgroundColor: color, transform: [{ scaleY: anim }] },
          ]}
        />
      ))}
    </View>
  );
}

const waveStyles = StyleSheet.create({
  container: { flexDirection: 'row', alignItems: 'center', gap: 4, height: 36, marginVertical: 4 },
  bar: { width: 4, borderRadius: 2 },
});

// ── Custom audio player card ──────────────────────────────────────────────────
function CustomAudioCard({
  track,
  isPlaying,
  isPaused,
  elapsed,
  onToggle,
  colors,
}: {
  track: ResolvedTrack;
  isPlaying: boolean;
  isPaused: boolean;
  elapsed: number;
  onToggle: () => void;
  colors: ReturnType<typeof import('@/hooks/use-colors').useColors>;
}) {
  const isActive = isPlaying || isPaused;

  return (
    <View style={[audioCardStyles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      {/* Music note icon */}
      <View style={[audioCardStyles.iconCircle, { backgroundColor: colors.primary + '18' }]}>
        <IconSymbol name="music.note" size={32} color={colors.primary} />
      </View>

      {/* Track name */}
      <Text style={[audioCardStyles.trackLabel, { color: colors.foreground }]} numberOfLines={2}>
        {track.label}
      </Text>

      {/* Waveform */}
      <WaveformBars isPlaying={isPlaying} color={colors.primary} />

      {/* Status + elapsed */}
      <Text style={[audioCardStyles.statusText, { color: colors.muted }]}>
        {!isActive ? 'Loading…' : isPaused ? `Paused · ${elapsed}s` : `Now Playing · ${elapsed}s`}
      </Text>

      {/* Play / Pause button */}
      <Pressable
        onPress={() => {
          if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          onToggle();
        }}
        style={({ pressed }) => [
          audioCardStyles.playBtn,
          { backgroundColor: colors.primary, opacity: pressed ? 0.8 : 1 },
        ]}
      >
        <IconSymbol
          name={isPlaying ? 'pause.fill' : 'play.fill'}
          size={28}
          color="#fff"
        />
      </Pressable>
    </View>
  );
}

// ── Motivational speech player card ──────────────────────────────────────────
function MotivationalCard({
  track,
  isPlaying,
  isPaused,
  elapsed,
  onToggle,
  colors,
}: {
  track: ResolvedTrack;
  isPlaying: boolean;
  isPaused: boolean;
  elapsed: number;
  onToggle: () => void;
  colors: ReturnType<typeof import('@/hooks/use-colors').useColors>;
}) {
  const isActive = isPlaying || isPaused;
  const accentColor = '#F59E0B';

  return (
    <View style={[audioCardStyles.card, { backgroundColor: accentColor + '10', borderColor: accentColor + '30' }]}>
      {/* Category badge */}
      {track.category && (
        <View style={[audioCardStyles.badge, { backgroundColor: accentColor + '20' }]}>
          <Text style={[audioCardStyles.badgeText, { color: accentColor }]}>{track.category}</Text>
        </View>
      )}

      {/* Waveform */}
      <WaveformBars isPlaying={isPlaying} color={accentColor} />

      {/* Status + elapsed */}
      <Text style={[audioCardStyles.statusText, { color: colors.muted }]}>
        {!isActive ? 'Loading…' : isPaused ? `Paused · ${elapsed}s` : `Now Playing · ${elapsed}s`}
      </Text>

      {/* Play / Pause button */}
      <Pressable
        onPress={() => {
          if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          onToggle();
        }}
        style={({ pressed }) => [
          audioCardStyles.playBtn,
          { backgroundColor: accentColor, opacity: pressed ? 0.8 : 1 },
        ]}
      >
        <IconSymbol
          name={isPlaying ? 'pause.fill' : 'play.fill'}
          size={28}
          color="#fff"
        />
      </Pressable>
    </View>
  );
}

const audioCardStyles = StyleSheet.create({
  card: {
    width: '100%',
    borderRadius: 24,
    borderWidth: 1,
    padding: 24,
    alignItems: 'center',
    gap: 10,
    marginTop: 4,
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  trackLabel: {
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
    lineHeight: 24,
  },
  statusText: {
    fontSize: 13,
    fontWeight: '500',
    letterSpacing: 0.3,
  },
  playBtn: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  badge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
});

// ── Main screen ───────────────────────────────────────────────────────────────
export default function StackPlayerScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [stack, setStack] = useState<RitualStack | null>(null);
  const [stepIdx, setStepIdx] = useState(0);
  const [phase, setPhase] = useState<Phase>('running');
  const [elapsed, setElapsed] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fadeAnim = useRef(new Animated.Value(1)).current;
  const trackFadeAnim = useRef(new Animated.Value(1)).current;

  const currentStep = stack?.steps[stepIdx] ?? null;
  const totalSteps = stack?.steps.length ?? 0;
  const advanceStepRef = useRef<() => void>(() => {});

  // For custom steps with a linked habit, audio finishing should NOT auto-advance.
  // Instead it unlocks the habit rating buttons. We track this with a ref.
  const customHabitLinkedRef = useRef(false);

  const { stopAudio, toggleAudio, audioState } = useStepAudio(
    currentStep,
    phase,
    useCallback(() => {
      // If this is a custom step with a linked habit, don't advance — just unlock rating
      if (customHabitLinkedRef.current) return;
      advanceStepRef.current();
    }, []),
  );

  useEffect(() => {
    if (!id) return;
    loadStacks().then((stacks) => {
      const found = stacks.find((s) => s.id === id);
      if (found) setStack(found);
    });
  }, [id]);

  useEffect(() => {
    if (!stack || !currentStep) return;
    setPhase('running');
    setElapsed(0);
  }, [stack, stepIdx]);

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

  useEffect(() => { advanceStepRef.current = advanceStep; }, [advanceStep]);

  // Tick logic
  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);

    if (phase === 'running') {
      const step = currentStep;
      if (!step) return;

      // Audio-driven steps: just count elapsed, advance is triggered by audio finishing
      if (step.type === 'affirmations' || step.type === 'motivational' || step.type === 'custom') {
        intervalRef.current = setInterval(() => setElapsed((e) => e + 1), 1000);
        return;
      }

      // Reminder / melatonin: manual rating, no timer advance
      if (step.type === 'reminder' || step.type === 'melatonin') {
        intervalRef.current = setInterval(() => setElapsed((e) => e + 1), 1000);
        return;
      }

      const autoComplete = stepIsAutoComplete(step);
      const duration = stepDefaultDuration(step);

      if (autoComplete) {
        intervalRef.current = setInterval(() => {
          setElapsed((e) => {
            if (e + 1 >= duration) { clearInterval(intervalRef.current!); advanceStep(); return 0; }
            return e + 1;
          });
        }, 1000);
      } else {
        intervalRef.current = setInterval(() => setElapsed((e) => e + 1), 1000);
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

  const handleViewHistory = useCallback(() => {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push('/habit-history' as never);
  }, [router]);

  const handleHabitRate = useCallback((rating: HabitRating) => {
    const step = currentStep;
    if (step && stack) {
      const habitName = stepLabel(step);
      saveHabitRating({
        habitName,
        stackName: stack.name,
        rating: rating as HabitRatingType,
      }).catch((e) => console.warn('[StackPlayer] failed to save habit rating:', e));
    }
    advanceStep();
  }, [currentStep, stack, advanceStep]);

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
          <Pressable
            onPress={handleViewHistory}
            style={({ pressed }) => [styles.historyBtn, { opacity: pressed ? 0.6 : 1 }]}
          >
            <IconSymbol name="calendar" size={16} color={colors.muted} />
            <Text style={[styles.historyBtnText, { color: colors.muted }]}>View Habit History</Text>
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

  const isAffirmationsStep = step.type === 'affirmations';
  const isCustomStep = step.type === 'custom';
  const isMotivationalStep = step.type === 'motivational';
  const isReminderStep = step.type === 'reminder' || step.type === 'melatonin';

  // Linked habit on custom step
  const linkedHabitName = isCustomStep ? (step.config.linkedHabitName ?? null) : null;
  const hasLinkedHabit = !!linkedHabitName;
  // Keep the ref in sync so the audio callback can read it synchronously
  customHabitLinkedRef.current = hasLinkedHabit;
  // Rating buttons are locked while audio is playing, unlocked when audio finishes
  const habitRatingUnlocked = hasLinkedHabit && audioState.isFinished;

  const currentTrack = audioState.tracks[audioState.currentIdx] ?? null;
  const nextTrack = audioState.tracks[audioState.currentIdx + 1] ?? null;
  const trackCount = audioState.tracks.length;
  const trackNum = audioState.currentIdx + 1;

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      {/* Header */}
      <View style={styles.headerRow}>
        <Pressable onPress={handleCancel} style={({ pressed }) => [styles.headerBtn, { opacity: pressed ? 0.6 : 1 }]}>
          <Text style={[styles.headerBtnText, { color: colors.muted }]}>Cancel</Text>
        </Pressable>
        <View style={styles.dotRow}>
          {stack.steps.map((_, i) => (
            <View key={i} style={[styles.dot, {
              backgroundColor: i === stepIdx ? colors.primary : colors.border,
              width: i === stepIdx ? 20 : 8,
            }]} />
          ))}
        </View>
        <Pressable onPress={handleSkip} style={({ pressed }) => [styles.headerBtn, { opacity: pressed ? 0.6 : 1 }]}>
          <Text style={[styles.headerBtnText, { color: colors.muted }]}>Skip</Text>
        </Pressable>
      </View>

      {/* Step content */}
      <Animated.View style={[styles.content, { opacity: fadeAnim }]}>
        <View style={styles.stepContainer}>
            <View style={[styles.iconCircle, { backgroundColor: colors.primary + '18' }]}>
              <IconSymbol name={iconName} size={48} color={colors.primary} />
            </View>

            <Text style={[styles.stepTitle, { color: colors.foreground }]}>{stepLabel(step)}</Text>
            <Text style={[styles.stepType, { color: colors.muted }]}>{meta.label}</Text>

            {/* ── Affirmations track display ── */}
            {isAffirmationsStep && trackCount > 0 && (
              <View style={styles.affirmationsArea}>
                <View style={styles.trackPills}>
                  {audioState.tracks.map((_, i) => (
                    <View key={i} style={[styles.trackPill, {
                      backgroundColor: i === audioState.currentIdx
                        ? colors.primary
                        : i < audioState.currentIdx ? colors.primary + '40' : colors.border,
                      width: i === audioState.currentIdx ? 24 : 8,
                    }]} />
                  ))}
                </View>
                <Animated.View style={[styles.currentTrackCard, {
                  backgroundColor: colors.primary + '14',
                  borderColor: colors.primary + '30',
                  opacity: trackFadeAnim,
                }]}>
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
                {nextTrack && (
                  <View style={[styles.upNextRow, { borderColor: colors.border }]}>
                    <Text style={[styles.upNextLabel, { color: colors.muted }]}>Up Next</Text>
                    <Text style={[styles.upNextTrack, { color: colors.foreground }]}>{nextTrack.label}</Text>
                  </View>
                )}
                {!nextTrack && trackCount > 1 && (
                  <View style={[styles.upNextRow, { borderColor: colors.border }]}>
                    <Text style={[styles.upNextLabel, { color: colors.muted }]}>Last affirmation</Text>
                  </View>
                )}
              </View>
            )}

            {/* ── Motivational speech player card ── */}
            {isMotivationalStep && currentTrack && (
              <MotivationalCard
                track={currentTrack}
                isPlaying={audioState.isPlaying}
                isPaused={audioState.isPaused}
                elapsed={elapsed}
                onToggle={toggleAudio}
                colors={colors}
              />
            )}

            {/* ── Custom audio player card ── */}
            {isCustomStep && currentTrack && (
              <CustomAudioCard
                track={currentTrack}
                isPlaying={audioState.isPlaying}
                isPaused={audioState.isPaused}
                elapsed={elapsed}
                onToggle={toggleAudio}
                colors={colors}
              />
            )}

            {/* ── Linked habit rating for custom audio step ── */}
            {isCustomStep && hasLinkedHabit && (
              <View style={{ width: '100%', marginTop: 16 }}>
                {!habitRatingUnlocked && (
                  <View style={[
                    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
                      padding: 12, borderRadius: 14, marginBottom: 10,
                      backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
                  ]}>
                    <IconSymbol name="lock.fill" size={14} color={colors.muted} />
                    <Text style={{ color: colors.muted, fontSize: 13, fontWeight: '600' }}>
                      Finish listening to unlock habit rating
                    </Text>
                  </View>
                )}
                <View style={{ opacity: habitRatingUnlocked ? 1 : 0.35, pointerEvents: habitRatingUnlocked ? 'auto' : 'none' }}>
                  <Text style={{ color: colors.muted, fontSize: 14, fontWeight: '600', textAlign: 'center', marginBottom: 8 }}>
                    {linkedHabitName}
                  </Text>
                  <HabitRatingButtons
                    onRate={(r) => {
                      if (!habitRatingUnlocked) return;
                      handleHabitRate(r);
                    }}
                    colors={colors}
                  />
                </View>
              </View>
            )}

            {/* ── Next Step button for custom step without linked habit (after audio finishes) ── */}
            {isCustomStep && !hasLinkedHabit && audioState.isFinished && (
              <Pressable
                onPress={advanceStep}
                style={({ pressed }) => [styles.completeBtn, { backgroundColor: colors.primary, opacity: pressed ? 0.8 : 1, marginTop: 16 }]}
              >
                <Text style={[styles.completeBtnText, { color: '#fff' }]}>
                  {stepIdx + 1 < totalSteps ? 'Next Step' : 'Finish'}
                </Text>
              </Pressable>
            )}

            {/* ── Habit rating for reminder/melatonin steps ── */}
            {isReminderStep && (
              <HabitRatingButtons onRate={handleHabitRate} colors={colors} />
            )}

            {/* ── Timer for auto-complete steps ── */}
            {!isAffirmationsStep && !isCustomStep && !isMotivationalStep && !isReminderStep && autoComplete && (
              <View style={styles.timerArea}>
                <Text style={[styles.timerText, { color: colors.foreground }]}>
                  {Math.max(0, duration - elapsed)}s
                </Text>
                <View style={[styles.progressBar, { backgroundColor: colors.border }]}>
                  <View style={[styles.progressFill, { backgroundColor: colors.primary, width: `${progress * 100}%` as any }]} />
                </View>
              </View>
            )}

            {/* ── Elapsed + Next button for manual non-reminder steps ── */}
            {!isAffirmationsStep && !isCustomStep && !isMotivationalStep && !isReminderStep && !autoComplete && (
              <>
                <Text style={[styles.elapsedText, { color: colors.muted }]}>{elapsed}s elapsed</Text>
                <Pressable
                  onPress={advanceStep}
                  style={({ pressed }) => [styles.completeBtn, { backgroundColor: colors.primary, opacity: pressed ? 0.8 : 1 }]}
                >
                  <Text style={[styles.completeBtnText, { color: '#fff' }]}>
                    {stepIdx + 1 < totalSteps ? 'Next Step' : 'Finish'}
                  </Text>
                </Pressable>
              </>
            )}
        </View>
      </Animated.View>

      {/* Step counter */}
      <Text style={[styles.stepCounter, { color: colors.muted }]}>
        Step {stepIdx + 1} of {totalSteps}
      </Text>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1 },
  loadingText: { textAlign: 'center', marginTop: 40, fontSize: 16 },

  // Header
  headerRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12 },
  headerBtn: { minWidth: 64, paddingVertical: 4 },
  headerBtnText: { fontSize: 16, fontWeight: '500' },
  dotRow: { flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6 },
  dot: { height: 8, borderRadius: 4 },

  // Content
  content: { flex: 1, justifyContent: 'center', paddingHorizontal: 24 },

  // Step content
  stepContainer: { alignItems: 'center', gap: 12 },
  iconCircle: { width: 96, height: 96, borderRadius: 48, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  stepTitle: { fontSize: 26, fontWeight: '800', textAlign: 'center', lineHeight: 32 },
  stepType: { fontSize: 16, fontWeight: '500' },

  // Affirmations
  affirmationsArea: { width: '100%', gap: 10, marginTop: 4 },
  trackPills: { flexDirection: 'row', justifyContent: 'center', gap: 6 },
  trackPill: { height: 8, borderRadius: 4 },
  currentTrackCard: { borderRadius: 16, borderWidth: 1, padding: 16, alignItems: 'center', gap: 6 },
  trackCounterText: { fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8 },
  currentTrackLabel: { fontSize: 18, fontWeight: '700', textAlign: 'center', lineHeight: 24 },
  categoryBadge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 10 },
  categoryBadgeText: { fontSize: 12, fontWeight: '600' },
  upNextRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, borderTopWidth: StyleSheet.hairlineWidth },
  upNextLabel: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6 },
  upNextTrack: { flex: 1, fontSize: 14, fontWeight: '600' },

  // Timer
  timerArea: { alignItems: 'center', gap: 12, marginTop: 8, width: '100%' },
  timerText: { fontSize: 56, fontWeight: '800', lineHeight: 64 },
  progressBar: { width: '100%', height: 6, borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 3 },

  // Manual step
  elapsedText: { fontSize: 16, fontWeight: '500' },
  completeBtn: { marginTop: 8, paddingHorizontal: 40, paddingVertical: 16, borderRadius: 14 },
  completeBtnText: { fontSize: 18, fontWeight: '700' },

  // Done screen
  doneContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, paddingHorizontal: 32 },
  doneTitle: { fontSize: 32, fontWeight: '700' },
  doneSubtitle: { fontSize: 18, fontWeight: '500' },
  doneButton: { marginTop: 24, paddingHorizontal: 48, paddingVertical: 16, borderRadius: 14 },
  doneButtonText: { fontSize: 18, fontWeight: '700' },
  historyBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12, paddingVertical: 8 },
  historyBtnText: { fontSize: 14, fontWeight: '500' },

  // Footer
  stepCounter: { textAlign: 'center', fontSize: 13, fontWeight: '500', paddingBottom: 12 },
});
