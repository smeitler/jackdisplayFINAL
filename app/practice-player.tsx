/**
 * PracticePlayer Screen
 *
 * Full-screen audio player for morning practice sessions:
 * - Priming, Guided Meditation, Breathwork, Visualization
 * - Plays voice chunks sequentially with pauses between them
 * - Loops background music underneath at lower volume
 * - Shows breathwork animation (expanding circle) for breathwork sessions
 * - Progress bar showing overall session completion
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Animated,
  Easing,
  Platform,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import { useKeepAwake } from 'expo-keep-awake';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/use-colors';
import * as Haptics from 'expo-haptics';

// ─── Types ────────────────────────────────────────────────────────────────────

type PracticeType = 'priming' | 'meditation' | 'breathwork' | 'visualization';
type BreathPhase = 'inhale' | 'hold_in' | 'exhale' | 'hold_out' | 'idle';

interface PracticeParams {
  type: PracticeType;
  chunkUrls: string;        // JSON-encoded string[]
  pausesBetweenChunks: string; // JSON-encoded number[]
  totalDurationMinutes: string;
  breathworkStyle?: string; // 'wim_hof' | 'box' | '4_7_8'
}

// ─── Breathwork animation config ─────────────────────────────────────────────

const BREATHWORK_PATTERNS: Record<string, { phases: { phase: BreathPhase; duration: number; label: string }[] }> = {
  box: {
    phases: [
      { phase: 'inhale',   duration: 4000, label: 'Breathe In' },
      { phase: 'hold_in',  duration: 4000, label: 'Hold' },
      { phase: 'exhale',   duration: 4000, label: 'Breathe Out' },
      { phase: 'hold_out', duration: 4000, label: 'Hold' },
    ],
  },
  '4_7_8': {
    phases: [
      { phase: 'inhale',   duration: 4000,  label: 'Breathe In' },
      { phase: 'hold_in',  duration: 7000,  label: 'Hold' },
      { phase: 'exhale',   duration: 8000,  label: 'Breathe Out' },
    ],
  },
  wim_hof: {
    phases: [
      { phase: 'inhale',   duration: 1500, label: 'In' },
      { phase: 'exhale',   duration: 1500, label: 'Out' },
    ],
  },
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function PracticePlayerScreen() {
  useKeepAwake();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams();

  const rawType = Array.isArray(params.type) ? params.type[0] : params.type;
  const rawChunkUrls = Array.isArray(params.chunkUrls) ? params.chunkUrls[0] : params.chunkUrls;
  const rawPauses = Array.isArray(params.pausesBetweenChunks) ? params.pausesBetweenChunks[0] : params.pausesBetweenChunks;
  const rawMinutes = Array.isArray(params.totalDurationMinutes) ? params.totalDurationMinutes[0] : params.totalDurationMinutes;
  const rawBreathStyle = Array.isArray(params.breathworkStyle) ? params.breathworkStyle[0] : params.breathworkStyle;

  const type = (rawType ?? 'meditation') as PracticeType;
  const chunkUrls: string[] = JSON.parse(rawChunkUrls ?? '[]');
  const pausesBetweenChunks: number[] = JSON.parse(rawPauses ?? '[]');
  const totalMinutes = parseInt(rawMinutes ?? '10', 10);
  const breathworkStyle = rawBreathStyle ?? 'box';

  // ─── State ──────────────────────────────────────────────────────────────────
  const [currentChunk, setCurrentChunk] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isFinished, setIsFinished] = useState(false);
  const [progress, setProgress] = useState(0); // 0-1
  const [breathPhase, setBreathPhase] = useState<BreathPhase>('idle');
  const [breathLabel, setBreathLabel] = useState('');

  // ─── Refs ───────────────────────────────────────────────────────────────────
  const voicePlayerRef = useRef<ReturnType<typeof createAudioPlayer> | null>(null);
  const musicPlayerRef = useRef<ReturnType<typeof createAudioPlayer> | null>(null);
  const pauseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const breathTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const breathPhaseIdxRef = useRef(0);
  const chunkIndexRef = useRef(0);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ─── Animated values ────────────────────────────────────────────────────────
  const circleScale = useRef(new Animated.Value(1)).current;
  const circleOpacity = useRef(new Animated.Value(0.6)).current;

  // ─── Setup audio mode ───────────────────────────────────────────────────────
  useEffect(() => {
    setAudioModeAsync({ playsInSilentMode: true }).catch(() => {});
  }, []);

  // ─── Background music ───────────────────────────────────────────────────────
  useEffect(() => {
    // Use a royalty-free ambient track bundled with the app
    // For now we use a simple sine-wave-like ambient track from a CDN
    // In production this would be a bundled asset
    const musicUrl = 'https://cdn.pixabay.com/audio/2022/10/16/audio_12a0ee4e81.mp3';
    try {
      const musicPlayer = createAudioPlayer({ uri: musicUrl });
      musicPlayer.loop = true;
      musicPlayer.volume = 0.18; // quiet background
      musicPlayer.play();
      musicPlayerRef.current = musicPlayer;
    } catch {
      // music is optional — fail silently
    }
    return () => {
      musicPlayerRef.current?.remove();
    };
  }, []);

  // ─── Play chunk sequence ────────────────────────────────────────────────────
  const playChunk = useCallback((index: number) => {
    if (index >= chunkUrls.length) {
      // All chunks done
      setIsFinished(true);
      setIsPlaying(false);
      setProgress(1);
      musicPlayerRef.current?.pause();
      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      return;
    }

    chunkIndexRef.current = index;
    setCurrentChunk(index);
    setProgress(index / chunkUrls.length);

    // Clean up previous voice player
    voicePlayerRef.current?.remove();
    voicePlayerRef.current = null;

    const url = chunkUrls[index];
    const player = createAudioPlayer({ uri: url });
    voicePlayerRef.current = player;
    player.play();
    setIsPlaying(true);
    setIsLoading(false);

    // Poll for completion since expo-audio doesn't have a simple onEnd callback
    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    pollIntervalRef.current = setInterval(() => {
      if (!voicePlayerRef.current) return;
      const p = voicePlayerRef.current;
      // Check if playback has ended: currentTime >= duration and not playing
      try {
        const dur = (p as any).duration ?? 0;
        const cur = (p as any).currentTime ?? 0;
        const playing = (p as any).playing ?? true;
        if (dur > 0 && cur >= dur - 0.2 && !playing) {
          clearInterval(pollIntervalRef.current!);
          pollIntervalRef.current = null;
          // Wait for the pause between chunks
          const pause = pausesBetweenChunks[index] ?? 2000;
          pauseTimerRef.current = setTimeout(() => {
            playChunk(index + 1);
          }, pause);
        }
      } catch {
        // ignore
      }
    }, 500);
  }, [chunkUrls, pausesBetweenChunks]);

  // Start playback on mount
  useEffect(() => {
    if (chunkUrls.length === 0) return;
    playChunk(0);
    return () => {
      voicePlayerRef.current?.remove();
      if (pauseTimerRef.current) clearTimeout(pauseTimerRef.current);
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Breathwork animation ───────────────────────────────────────────────────
  const runBreathCycle = useCallback(() => {
    if (type !== 'breathwork') return;
    const pattern = BREATHWORK_PATTERNS[breathworkStyle as keyof typeof BREATHWORK_PATTERNS] ?? BREATHWORK_PATTERNS.box;
    const phases = pattern.phases;
    const idx = breathPhaseIdxRef.current % phases.length;
    const { phase, duration, label } = phases[idx];

    setBreathPhase(phase);
    setBreathLabel(label);

    const toScale = phase === 'inhale' ? 1.5 : phase === 'exhale' ? 0.85 : 1;
    const toOpacity = phase === 'inhale' ? 1 : phase === 'exhale' ? 0.5 : 0.7;

    Animated.parallel([
      Animated.timing(circleScale, {
        toValue: toScale,
        duration,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: true,
      }),
      Animated.timing(circleOpacity, {
        toValue: toOpacity,
        duration,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: true,
      }),
    ]).start();

    breathPhaseIdxRef.current += 1;
    breathTimerRef.current = setTimeout(runBreathCycle, duration);
  }, [type, breathworkStyle, circleScale, circleOpacity]);

  useEffect(() => {
    if (type !== 'breathwork') return;
    // Start breath cycle after a short delay
    const t = setTimeout(runBreathCycle, 1500);
    return () => {
      clearTimeout(t);
      if (breathTimerRef.current) clearTimeout(breathTimerRef.current);
    };
  }, [type, runBreathCycle]);

  // ─── Controls ───────────────────────────────────────────────────────────────
  const handleClose = () => {
    voicePlayerRef.current?.remove();
    musicPlayerRef.current?.remove();
    if (pauseTimerRef.current) clearTimeout(pauseTimerRef.current);
    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    if (breathTimerRef.current) clearTimeout(breathTimerRef.current);
    router.back();
  };

  // ─── UI helpers ─────────────────────────────────────────────────────────────
  const practiceLabel: Record<PracticeType, string> = {
    priming: 'Morning Priming',
    meditation: 'Guided Meditation',
    breathwork: 'Breathwork',
    visualization: 'Visualization',
  };

  const practiceEmoji: Record<PracticeType, string> = {
    priming: '⚡',
    meditation: '🧘',
    breathwork: '💨',
    visualization: '🎯',
  };

  const chunkLabel = isFinished
    ? 'Session complete'
    : isLoading
    ? 'Preparing your session...'
    : `Part ${currentChunk + 1} of ${chunkUrls.length}`;

  // ─── Render ─────────────────────────────────────────────────────────────────
  return (
    <View style={[styles.container, { backgroundColor: '#0a0a1a', paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      {/* Close button */}
      <Pressable
        style={styles.closeBtn}
        onPress={handleClose}
        hitSlop={16}
      >
        <Text style={styles.closeTxt}>✕</Text>
      </Pressable>

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.emoji}>{practiceEmoji[type]}</Text>
        <Text style={styles.title}>{practiceLabel[type]}</Text>
        <Text style={styles.subtitle}>{totalMinutes} minutes</Text>
      </View>

      {/* Breathwork animation OR generic pulse */}
      <View style={styles.animationArea}>
        <Animated.View
          style={[
            styles.outerRing,
            {
              transform: [{ scale: circleScale }],
              opacity: circleOpacity,
            },
          ]}
        />
        <View style={styles.innerCircle}>
          {type === 'breathwork' && breathLabel ? (
            <Text style={styles.breathLabel}>{breathLabel}</Text>
          ) : isFinished ? (
            <Text style={styles.doneEmoji}>✓</Text>
          ) : (
            <Text style={styles.playingDot}>
              {isLoading ? '...' : isPlaying ? '▶' : '⏸'}
            </Text>
          )}
        </View>
      </View>

      {/* Progress bar */}
      <View style={styles.progressContainer}>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${Math.round(progress * 100)}%` }]} />
        </View>
        <Text style={styles.progressLabel}>{chunkLabel}</Text>
      </View>

      {/* Finish message */}
      {isFinished && (
        <View style={styles.finishArea}>
          <Text style={styles.finishTitle}>Session Complete</Text>
          <Text style={styles.finishSub}>Great work. Carry this energy into your day.</Text>
          <Pressable style={styles.doneBtn} onPress={handleClose}>
            <Text style={styles.doneBtnTxt}>Done</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const CIRCLE_SIZE = 220;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
  },
  closeBtn: {
    alignSelf: 'flex-end',
    marginTop: 8,
    padding: 8,
  },
  closeTxt: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 18,
  },
  header: {
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
  },
  emoji: {
    fontSize: 48,
  },
  title: {
    color: '#fff',
    fontSize: 26,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  subtitle: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 15,
  },
  animationArea: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  outerRing: {
    position: 'absolute',
    width: CIRCLE_SIZE,
    height: CIRCLE_SIZE,
    borderRadius: CIRCLE_SIZE / 2,
    backgroundColor: 'rgba(99, 179, 237, 0.15)',
    borderWidth: 1.5,
    borderColor: 'rgba(99, 179, 237, 0.4)',
  },
  innerCircle: {
    width: CIRCLE_SIZE * 0.55,
    height: CIRCLE_SIZE * 0.55,
    borderRadius: (CIRCLE_SIZE * 0.55) / 2,
    backgroundColor: 'rgba(99, 179, 237, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  breathLabel: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
  },
  doneEmoji: {
    color: '#4ADE80',
    fontSize: 36,
    fontWeight: '700',
  },
  playingDot: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 28,
  },
  progressContainer: {
    width: '100%',
    alignItems: 'center',
    gap: 8,
    marginBottom: 32,
  },
  progressTrack: {
    width: '100%',
    height: 3,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#63B3ED',
    borderRadius: 2,
  },
  progressLabel: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 13,
  },
  finishArea: {
    position: 'absolute',
    bottom: 80,
    left: 24,
    right: 24,
    alignItems: 'center',
    gap: 8,
  },
  finishTitle: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '700',
  },
  finishSub: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 14,
    textAlign: 'center',
  },
  doneBtn: {
    marginTop: 12,
    backgroundColor: '#63B3ED',
    paddingHorizontal: 40,
    paddingVertical: 14,
    borderRadius: 30,
  },
  doneBtnTxt: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
});
