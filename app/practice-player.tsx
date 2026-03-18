/**
 * PracticePlayer Screen
 *
 * Full-screen audio player for morning practice sessions:
 * - Priming, Guided Meditation, Breathwork, Visualization
 * - Plays voice chunks sequentially with pauses between them
 * - Loops background music underneath at lower volume
 * - Shows breathwork animation (expanding circle) for breathwork sessions
 * - Progress bar showing overall session completion
 * - Photo highlights slideshow from journal entries
 * - Gratitude entries and vision board goals displayed below player
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
  ScrollView,
  Image,
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

  // ─── Audio state ─────────────────────────────────────────────────────────────
  const [currentChunk, setCurrentChunk] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isFinished, setIsFinished] = useState(false);
  const [progress, setProgress] = useState(0); // 0-1
  const [breathPhase, setBreathPhase] = useState<BreathPhase>('idle');
  const [breathLabel, setBreathLabel] = useState('');

  // ─── Journal data state ───────────────────────────────────────────────────────
  const [photos, setPhotos] = useState<string[]>([]);
  const [gratitudes, setGratitudes] = useState<string[]>([]);
  const [goals, setGoals] = useState<string[]>([]);
  const [photoIdx, setPhotoIdx] = useState(0);
  const photoFade = useRef(new Animated.Value(1)).current;
  const slideTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ─── Refs ─────────────────────────────────────────────────────────────────────
  const voicePlayerRef = useRef<ReturnType<typeof createAudioPlayer> | null>(null);
  const musicPlayerRef = useRef<ReturnType<typeof createAudioPlayer> | null>(null);
  const pauseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const breathTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const breathPhaseIdxRef = useRef(0);
  const chunkIndexRef = useRef(0);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ─── Animated values ──────────────────────────────────────────────────────────
  const circleScale = useRef(new Animated.Value(1)).current;
  const circleOpacity = useRef(new Animated.Value(0.6)).current;

  // ─── Load journal photos and gratitudes ───────────────────────────────────────
  useEffect(() => {
    async function loadJournalData() {
      try {
        const { loadEntries, parseGratitudes } = await import('@/lib/journal-store');
        const { getLastUserId } = await import('@/lib/storage');
        const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;

        const uid = await getLastUserId();
        const entries = await loadEntries(uid || 'default');

        const photoList: string[] = [];
        const gratitudeList: string[] = [];

        for (const e of entries.slice(0, 30)) {
          // Collect photo attachments
          for (const att of e.attachments ?? []) {
            if (att.type === 'photo' && att.uri && photoList.length < 15) {
              photoList.push(att.uri);
            }
          }
          // Parse gratitudes from body
          const bodyGratitudes = parseGratitudes(e.body ?? '');
          for (const g of bodyGratitudes) {
            if (g.trim() && gratitudeList.length < 12) gratitudeList.push(g.trim());
          }
          // Also use legacy gratitudes field
          for (const g of e.gratitudes ?? []) {
            if (g.trim() && gratitudeList.length < 12 && !gratitudeList.includes(g.trim())) {
              gratitudeList.push(g.trim());
            }
          }
        }

        // Load vision board goals
        const goalsRaw = await AsyncStorage.getItem('daycheck:visionGoals');
        const goalList: string[] = goalsRaw ? JSON.parse(goalsRaw) : [];

        setPhotos(photoList);
        setGratitudes(gratitudeList);
        setGoals(goalList);
        setPhotoIdx(0);

        // Auto-advance slideshow every 5s with fade transition
        if (photoList.length > 1) {
          slideTimerRef.current = setInterval(() => {
            // Fade out
            Animated.timing(photoFade, { toValue: 0, duration: 600, useNativeDriver: true }).start(() => {
              setPhotoIdx((i) => (i + 1) % photoList.length);
              // Fade in
              Animated.timing(photoFade, { toValue: 1, duration: 600, useNativeDriver: true }).start();
            });
          }, 5000);
        }
      } catch {
        // journal data is optional — fail silently
      }
    }
    loadJournalData();
    return () => {
      if (slideTimerRef.current) clearInterval(slideTimerRef.current);
    };
  }, []);

  // ─── Setup audio mode ─────────────────────────────────────────────────────────
  useEffect(() => {
    setAudioModeAsync({ playsInSilentMode: true }).catch(() => {});
  }, []);

  // ─── Background music ─────────────────────────────────────────────────────────
  useEffect(() => {
    const musicUrl = 'https://cdn.pixabay.com/audio/2022/10/16/audio_12a0ee4e81.mp3';
    try {
      const musicPlayer = createAudioPlayer({ uri: musicUrl });
      musicPlayer.loop = true;
      musicPlayer.volume = 0.18;
      musicPlayer.play();
      musicPlayerRef.current = musicPlayer;
    } catch {
      // music is optional — fail silently
    }
    return () => {
      musicPlayerRef.current?.remove();
    };
  }, []);

  // ─── Play chunk sequence ──────────────────────────────────────────────────────
  const playChunk = useCallback((index: number) => {
    if (index >= chunkUrls.length) {
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

    voicePlayerRef.current?.remove();
    voicePlayerRef.current = null;

    const url = chunkUrls[index];
    const player = createAudioPlayer({ uri: url });
    voicePlayerRef.current = player;
    player.play();
    setIsPlaying(true);
    setIsLoading(false);

    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    pollIntervalRef.current = setInterval(() => {
      if (!voicePlayerRef.current) return;
      const p = voicePlayerRef.current;
      try {
        const dur = (p as any).duration ?? 0;
        const cur = (p as any).currentTime ?? 0;
        const playing = (p as any).playing ?? true;
        if (dur > 0 && cur >= dur - 0.2 && !playing) {
          clearInterval(pollIntervalRef.current!);
          pollIntervalRef.current = null;
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

  useEffect(() => {
    if (chunkUrls.length === 0) return;
    playChunk(0);
    return () => {
      voicePlayerRef.current?.remove();
      if (pauseTimerRef.current) clearTimeout(pauseTimerRef.current);
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Breathwork animation ─────────────────────────────────────────────────────
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
    const t = setTimeout(runBreathCycle, 1500);
    return () => {
      clearTimeout(t);
      if (breathTimerRef.current) clearTimeout(breathTimerRef.current);
    };
  }, [type, runBreathCycle]);

  // ─── Controls ─────────────────────────────────────────────────────────────────
  const handleClose = () => {
    voicePlayerRef.current?.remove();
    musicPlayerRef.current?.remove();
    if (pauseTimerRef.current) clearTimeout(pauseTimerRef.current);
    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    if (breathTimerRef.current) clearTimeout(breathTimerRef.current);
    if (slideTimerRef.current) clearInterval(slideTimerRef.current);
    router.back();
  };

  // ─── UI helpers ───────────────────────────────────────────────────────────────
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

  // ─── Render ───────────────────────────────────────────────────────────────────
  return (
    <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>

      {/* ── Photo backdrop (full-screen blurred background) ── */}
      {photos.length > 0 && (
        <Animated.View style={[StyleSheet.absoluteFillObject, { opacity: photoFade }]}>
          <Image
            source={{ uri: photos[photoIdx] }}
            style={StyleSheet.absoluteFillObject}
            resizeMode="cover"
          />
          {/* Dark overlay so text is readable */}
          <View style={[StyleSheet.absoluteFillObject, { backgroundColor: 'rgba(0,0,0,0.72)' }]} />
        </Animated.View>
      )}

      {/* ── Dark base (shown when no photos) ── */}
      {photos.length === 0 && (
        <View style={[StyleSheet.absoluteFillObject, { backgroundColor: '#0a0a1a' }]} />
      )}

      {/* ── Close button ── */}
      <Pressable style={styles.closeBtn} onPress={handleClose} hitSlop={16}>
        <Text style={styles.closeTxt}>✕</Text>
      </Pressable>

      {/* ── Scrollable content ── */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
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

        {/* Photo slideshow dots (shown when photos are available) */}
        {photos.length > 1 && (
          <View style={styles.photoDots}>
            {photos.map((_, i) => (
              <View
                key={i}
                style={[
                  styles.photoDot,
                  { backgroundColor: i === photoIdx ? '#fff' : 'rgba(255,255,255,0.35)', width: i === photoIdx ? 16 : 6 },
                ]}
              />
            ))}
          </View>
        )}

        {/* ── Gratitude section ── */}
        {gratitudes.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>🙏  GRATEFUL FOR</Text>
            {gratitudes.slice(0, 6).map((g, i) => (
              <View key={i} style={styles.gratitudeRow}>
                <View style={styles.gratitudeDot} />
                <Text style={styles.gratitudeText}>{g}</Text>
              </View>
            ))}
          </View>
        )}

        {/* ── Vision board goals ── */}
        {goals.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>🎯  YOUR GOALS</Text>
            {goals.slice(0, 5).map((g, i) => (
              <View key={i} style={styles.gratitudeRow}>
                <View style={[styles.gratitudeDot, { backgroundColor: '#FBBF24' }]} />
                <Text style={styles.gratitudeText}>{g}</Text>
              </View>
            ))}
          </View>
        )}

        {/* ── Finish message ── */}
        {isFinished && (
          <View style={styles.finishArea}>
            <Text style={styles.finishTitle}>Session Complete ✓</Text>
            <Text style={styles.finishSub}>Great work. Carry this energy into your day.</Text>
            <Pressable style={styles.doneBtn} onPress={handleClose}>
              <Text style={styles.doneBtnTxt}>Done</Text>
            </Pressable>
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const CIRCLE_SIZE = 200;

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingBottom: 20,
  },
  closeBtn: {
    alignSelf: 'flex-end',
    marginTop: 8,
    marginRight: 8,
    padding: 8,
    zIndex: 10,
  },
  closeTxt: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 18,
  },
  header: {
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
    marginBottom: 8,
  },
  emoji: {
    fontSize: 44,
  },
  title: {
    color: '#fff',
    fontSize: 26,
    fontWeight: '700',
    letterSpacing: 0.3,
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  subtitle: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 15,
  },
  animationArea: {
    width: CIRCLE_SIZE,
    height: CIRCLE_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 16,
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
    marginBottom: 12,
  },
  progressTrack: {
    width: '100%',
    height: 3,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: 3,
    backgroundColor: '#63B3ED',
    borderRadius: 2,
  },
  progressLabel: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
    letterSpacing: 0.3,
  },
  photoDots: {
    flexDirection: 'row',
    gap: 5,
    alignItems: 'center',
    marginBottom: 20,
  },
  photoDot: {
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.35)',
  },

  // Gratitude & goals sections
  section: {
    width: '100%',
    marginBottom: 20,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 16,
    padding: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  sectionLabel: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 12,
  },
  gratitudeRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 10,
  },
  gratitudeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#63B3ED',
    marginTop: 6,
    flexShrink: 0,
  },
  gratitudeText: {
    flex: 1,
    color: 'rgba(255,255,255,0.88)',
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '500',
  },

  // Finish
  finishArea: {
    width: '100%',
    alignItems: 'center',
    gap: 10,
    marginTop: 8,
    padding: 20,
    backgroundColor: 'rgba(74,222,128,0.12)',
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(74,222,128,0.3)',
  },
  finishTitle: {
    color: '#4ADE80',
    fontSize: 22,
    fontWeight: '800',
  },
  finishSub: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  doneBtn: {
    marginTop: 8,
    backgroundColor: '#4ADE80',
    paddingHorizontal: 32,
    paddingVertical: 12,
    borderRadius: 24,
  },
  doneBtnTxt: {
    color: '#0a0a1a',
    fontSize: 16,
    fontWeight: '700',
  },
});
