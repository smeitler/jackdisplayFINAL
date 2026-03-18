/**
 * PracticePlayer Screen
 *
 * Layout (top → bottom):
 *   ┌─────────────────────────────────────┐
 *   │  [emoji] Title          [✕ close]   │  ← top bar
 *   │  ─────────────────────────────────  │
 *   │  ◄── photos slide across ──►        │  ← horizontal photo carousel (top half)
 *   │  ─────────────────────────────────  │
 *   │  🙏 GRATEFUL FOR                    │  ← cycling gratitude card (middle)
 *   │    "item text here"                 │
 *   │  ─────────────────────────────────  │
 *   │  ████████░░░░░░░░  3:12 / 5:00      │  ← real-time progress bar
 *   │           [ ⏸ ]                     │  ← play/pause button (themed purple)
 *   └─────────────────────────────────────┘
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
  Dimensions,
  Image,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import { useKeepAwake } from 'expo-keep-awake';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const PHOTO_W = SCREEN_W * 0.54;
const PHOTO_H = SCREEN_H * 0.30;
const PHOTO_GAP = 12;
const CAROUSEL_SPEED = 38; // px/s

// Theme colours (matches theme.config.js primary)
const PRIMARY = '#6C63FF';
const PRIMARY_DIM = 'rgba(108,99,255,0.25)';
const PRIMARY_BORDER = 'rgba(108,99,255,0.6)';

// ─── Types ────────────────────────────────────────────────────────────────────

type PracticeType = 'priming' | 'meditation' | 'breathwork' | 'visualization';

const PRACTICE_LABEL: Record<PracticeType, string> = {
  priming: 'Morning Priming',
  meditation: 'Guided Meditation',
  breathwork: 'Breathwork',
  visualization: 'Visualization',
};
const PRACTICE_EMOJI: Record<PracticeType, string> = {
  priming: '⚡',
  meditation: '🧘',
  breathwork: '💨',
  visualization: '🎯',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtTime(secs: number): string {
  const s = Math.max(0, Math.floor(secs));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, '0')}`;
}

// ─── PhotoCarousel ────────────────────────────────────────────────────────────

function PhotoCarousel({ photos }: { photos: string[] }) {
  const items = photos.length > 0 ? [...photos, ...photos, ...photos] : [];
  const totalW = items.length * (PHOTO_W + PHOTO_GAP) + 32;
  const scrollX = useRef(new Animated.Value(0)).current;
  const animRef = useRef<Animated.CompositeAnimation | null>(null);
  const currentXRef = useRef(0);
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
  const expandScale = useRef(new Animated.Value(1)).current;
  const pausedForExpand = useRef(false);

  useEffect(() => {
    const id = scrollX.addListener(({ value }) => { currentXRef.current = value; });
    return () => scrollX.removeListener(id);
  }, [scrollX]);

  const startScroll = useCallback((fromX: number) => {
    if (photos.length < 1) return;
    const loopW = photos.length * (PHOTO_W + PHOTO_GAP);
    const distToLoop = loopW - (fromX % loopW);
    const duration = (distToLoop / CAROUSEL_SPEED) * 1000;
    animRef.current?.stop();
    animRef.current = Animated.timing(scrollX, {
      toValue: fromX + distToLoop,
      duration,
      easing: Easing.linear,
      useNativeDriver: true,
    });
    animRef.current.start(({ finished }) => {
      if (finished) {
        scrollX.setValue(0);
        currentXRef.current = 0;
        startScroll(0);
      }
    });
  }, [photos.length, scrollX]);

  useEffect(() => {
    if (photos.length < 1) return;
    startScroll(0);
    return () => { animRef.current?.stop(); };
  }, [photos.length, startScroll]);

  const handlePhotoTap = (idx: number) => {
    if (pausedForExpand.current) return;
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    pausedForExpand.current = true;
    setExpandedIdx(idx);
    animRef.current?.stop();
    Animated.sequence([
      Animated.timing(expandScale, { toValue: 1.2, duration: 200, useNativeDriver: true, easing: Easing.out(Easing.ease) }),
      Animated.delay(700),
      Animated.timing(expandScale, { toValue: 1, duration: 250, useNativeDriver: true, easing: Easing.in(Easing.ease) }),
    ]).start(() => {
      setExpandedIdx(null);
      pausedForExpand.current = false;
      startScroll(currentXRef.current);
    });
  };

  if (photos.length === 0) {
    return (
      <View style={styles.carouselEmpty}>
        <Text style={styles.carouselEmptyTxt}>📷  Add photos to your journal entries{'\n'}and they'll appear here</Text>
      </View>
    );
  }

  return (
    <View style={styles.carouselOuter}>
      <Animated.View
        style={[
          styles.carouselTrack,
          { width: totalW, transform: [{ translateX: Animated.multiply(scrollX, -1) }] },
        ]}
      >
        {items.map((uri, i) => {
          const isExp = expandedIdx === i;
          return (
            <Pressable key={`${uri}-${i}`} onPress={() => handlePhotoTap(i)} style={styles.photoWrapper}>
              <Animated.View style={[styles.photoCard, isExp && { transform: [{ scale: expandScale }], zIndex: 20 }]}>
                <Image source={{ uri }} style={styles.photoImg} resizeMode="cover" />
              </Animated.View>
            </Pressable>
          );
        })}
      </Animated.View>
    </View>
  );
}

// ─── GratitudeDisplay ─────────────────────────────────────────────────────────

function GratitudeDisplay({ items }: { items: string[] }) {
  const [idx, setIdx] = useState(0);
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (items.length < 2) return;
    const timer = setInterval(() => {
      Animated.timing(fadeAnim, { toValue: 0, duration: 500, useNativeDriver: true }).start(() => {
        setIdx((i) => (i + 1) % items.length);
        Animated.timing(fadeAnim, { toValue: 1, duration: 600, useNativeDriver: true }).start();
      });
    }, 5000);
    return () => clearInterval(timer);
  }, [items.length, fadeAnim]);

  const handleTap = () => {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Animated.sequence([
      Animated.spring(scaleAnim, { toValue: 1.05, useNativeDriver: true, speed: 40, bounciness: 8 }),
      Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, speed: 30, bounciness: 4 }),
    ]).start();
  };

  if (items.length === 0) {
    return (
      <View style={styles.gratitudeCard}>
        <Text style={styles.gratitudeLabel}>🙏  GRATEFUL FOR</Text>
        <Text style={[styles.gratitudeText, { color: 'rgba(255,255,255,0.3)', fontStyle: 'italic' }]}>
          Write journal entries with gratitudes{'\n'}and they'll appear here
        </Text>
      </View>
    );
  }

  return (
    <Pressable onPress={handleTap} style={{ width: '100%' }}>
      <Animated.View style={[styles.gratitudeCard, { opacity: fadeAnim, transform: [{ scale: scaleAnim }] }]}>
        <Text style={styles.gratitudeLabel}>🙏  GRATEFUL FOR</Text>
        <Text style={styles.gratitudeText}>{items[idx]}</Text>
        {items.length > 1 && (
          <View style={styles.gratitudeDots}>
            {items.slice(0, Math.min(items.length, 8)).map((_, i) => (
              <View key={i} style={[styles.gDot, {
                backgroundColor: i === (idx % Math.min(items.length, 8))
                  ? 'rgba(255,255,255,0.8)'
                  : 'rgba(255,255,255,0.2)',
              }]} />
            ))}
          </View>
        )}
      </Animated.View>
    </Pressable>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function PracticePlayerScreen() {
  useKeepAwake();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams();

  const rawType = Array.isArray(params.type) ? params.type[0] : params.type;
  const rawChunkUrls = Array.isArray(params.chunkUrls) ? params.chunkUrls[0] : params.chunkUrls;
  const rawPauses = Array.isArray(params.pausesBetweenChunks) ? params.pausesBetweenChunks[0] : params.pausesBetweenChunks;
  const rawMinutes = Array.isArray(params.totalDurationMinutes) ? params.totalDurationMinutes[0] : params.totalDurationMinutes;

  const type = (rawType ?? 'meditation') as PracticeType;
  const chunkUrls: string[] = JSON.parse(rawChunkUrls ?? '[]');
  const pausesBetweenChunks: number[] = JSON.parse(rawPauses ?? '[]');
  const totalMinutes = parseInt(rawMinutes ?? '10', 10);
  const totalSecs = totalMinutes * 60;

  // ─── Audio state ─────────────────────────────────────────────────────────────
  const [currentChunk, setCurrentChunk] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isFinished, setIsFinished] = useState(false);
  // Real-time progress from audio player
  const [elapsedSecs, setElapsedSecs] = useState(0);
  const [chunkDuration, setChunkDuration] = useState(0);
  const isPausedRef = useRef(false);

  // ─── Journal data ─────────────────────────────────────────────────────────────
  const [photos, setPhotos] = useState<string[]>([]);
  const [gratitudes, setGratitudes] = useState<string[]>([]);

  // ─── Refs ─────────────────────────────────────────────────────────────────────
  const voicePlayerRef = useRef<ReturnType<typeof createAudioPlayer> | null>(null);
  const musicPlayerRef = useRef<ReturnType<typeof createAudioPlayer> | null>(null);
  const pauseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const progressIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const chunkIndexRef = useRef(0);

  // ─── Load journal data ───────────────────────────────────────────────────────
  // Scans ALL @journal_entries_v2_* keys so it works regardless of login state.
  useEffect(() => {
    async function loadJournalData() {
      try {
        import('@/lib/journal-store').then(async ({ parseGratitudes }) => {
          const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;

          // Get all keys and find every journal-entries key
          const allKeys = await AsyncStorage.getAllKeys();
          const journalKeys = allKeys.filter((k) => k.startsWith('@journal_entries_v2_'));

          // Also try the primary key from getLastUserId
          const { getLastUserId } = await import('@/lib/storage');
          const uid = await getLastUserId();
          const primaryKey = `@journal_entries_v2_${uid || 'default'}`;
          if (!journalKeys.includes(primaryKey)) journalKeys.unshift(primaryKey);

          console.log('[PracticePlayer] Journal keys found:', journalKeys);

          // Merge entries from all keys
          const allEntries: any[] = [];
          for (const key of journalKeys) {
            try {
              const raw = await AsyncStorage.getItem(key);
              if (raw) {
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed)) allEntries.push(...parsed);
              }
            } catch { /* skip bad key */ }
          }

          // Sort newest first
          allEntries.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
          console.log('[PracticePlayer] Total entries across all keys:', allEntries.length);

          const photoList: string[] = [];
          const gratList: string[] = [];

          for (const e of allEntries.slice(0, 50)) {
            for (const att of e.attachments ?? []) {
              if (att.type === 'photo' && att.uri && photoList.length < 20) {
                photoList.push(att.uri);
              }
            }
            const bodyGrats = parseGratitudes(e.body ?? '');
            for (const g of bodyGrats) {
              if (g.trim() && gratList.length < 15) gratList.push(g.trim());
            }
            for (const g of e.gratitudes ?? []) {
              if (g.trim() && gratList.length < 15 && !gratList.includes(g.trim())) {
                gratList.push(g.trim());
              }
            }
          }

          console.log('[PracticePlayer] Photos found:', photoList.length, '| Gratitudes found:', gratList.length);
          setPhotos(photoList);
          setGratitudes(gratList);
        });
      } catch (err) {
        console.warn('[PracticePlayer] Failed to load journal data:', err);
      }
    }
    loadJournalData();
  }, []);

  // ─── Audio setup ─────────────────────────────────────────────────────────────
  useEffect(() => {
    setAudioModeAsync({ playsInSilentMode: true }).catch(() => {});
  }, []);

  useEffect(() => {
    // Soft ambient background music
    const musicUrl = 'https://cdn.pixabay.com/audio/2022/10/16/audio_12a0ee4e81.mp3';
    try {
      const p = createAudioPlayer({ uri: musicUrl });
      p.loop = true;
      p.volume = 0.15;
      p.play();
      musicPlayerRef.current = p;
    } catch { /* optional */ }
    return () => { musicPlayerRef.current?.remove(); };
  }, []);

  // ─── Progress polling ─────────────────────────────────────────────────────────
  const startProgressPoll = useCallback(() => {
    if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
    progressIntervalRef.current = setInterval(() => {
      const p = voicePlayerRef.current as any;
      if (!p || isPausedRef.current) return;
      try {
        const cur = typeof p.currentTime === 'number' ? p.currentTime : 0;
        const dur = typeof p.duration === 'number' ? p.duration : 0;
        setElapsedSecs(cur);
        if (dur > 0) setChunkDuration(dur);
      } catch { /* ignore */ }
    }, 250);
  }, []);

  // ─── Playback logic ───────────────────────────────────────────────────────────
  const playChunk = useCallback((index: number) => {
    if (index >= chunkUrls.length) {
      setIsFinished(true);
      setIsPlaying(false);
      setElapsedSecs(chunkDuration);
      musicPlayerRef.current?.pause();
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      return;
    }
    chunkIndexRef.current = index;
    setCurrentChunk(index);
    setElapsedSecs(0);
    setChunkDuration(0);

    voicePlayerRef.current?.remove();
    voicePlayerRef.current = null;

    const player = createAudioPlayer({ uri: chunkUrls[index] });
    voicePlayerRef.current = player;
    player.play();
    setIsPlaying(true);
    setIsLoading(false);
    startProgressPoll();

    // Poll for chunk completion
    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    pollIntervalRef.current = setInterval(() => {
      if (!voicePlayerRef.current || isPausedRef.current) return;
      const p = voicePlayerRef.current as any;
      try {
        const dur = typeof p.duration === 'number' ? p.duration : 0;
        const cur = typeof p.currentTime === 'number' ? p.currentTime : 0;
        const playing = typeof p.playing === 'boolean' ? p.playing : true;
        if (dur > 0.5 && cur >= dur - 0.3 && !playing) {
          clearInterval(pollIntervalRef.current!);
          pollIntervalRef.current = null;
          if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
          const pause = pausesBetweenChunks[index] ?? 2000;
          pauseTimerRef.current = setTimeout(() => playChunk(index + 1), pause);
        }
      } catch { /* ignore */ }
    }, 400);
  }, [chunkUrls, pausesBetweenChunks, chunkDuration, startProgressPoll]);

  useEffect(() => {
    if (chunkUrls.length === 0) { setIsLoading(false); return; }
    playChunk(0);
    return () => {
      voicePlayerRef.current?.remove();
      if (pauseTimerRef.current) clearTimeout(pauseTimerRef.current);
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
      if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Controls ─────────────────────────────────────────────────────────────────
  const handlePlayPause = () => {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (isPlaying) {
      voicePlayerRef.current?.pause();
      musicPlayerRef.current?.pause();
      isPausedRef.current = true;
      setIsPlaying(false);
    } else {
      voicePlayerRef.current?.play();
      musicPlayerRef.current?.play();
      isPausedRef.current = false;
      setIsPlaying(true);
      startProgressPoll();
    }
  };

  const handleClose = () => {
    voicePlayerRef.current?.remove();
    musicPlayerRef.current?.remove();
    if (pauseTimerRef.current) clearTimeout(pauseTimerRef.current);
    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
    router.back();
  };

  // ─── Progress bar values ──────────────────────────────────────────────────────
  // Use chunk progress for multi-chunk, or single-chunk elapsed/duration
  const chunkProgress = chunkDuration > 0 ? Math.min(elapsedSecs / chunkDuration, 1) : 0;
  // Overall progress across all chunks
  const overallProgress = chunkUrls.length > 1
    ? (currentChunk + chunkProgress) / chunkUrls.length
    : chunkProgress;
  const displayProgress = isFinished ? 1 : overallProgress;

  // Time display: use actual audio time if available, else estimate from overall progress
  const displayElapsed = elapsedSecs > 0 ? elapsedSecs + currentChunk * (chunkDuration || 0) : displayProgress * totalSecs;
  const displayRemaining = Math.max(0, totalSecs - displayElapsed);

  const chunkLabel = isFinished
    ? 'Session complete ✓'
    : isLoading
    ? 'Preparing session...'
    : chunkUrls.length > 1
    ? `Part ${currentChunk + 1} of ${chunkUrls.length}`
    : '';

  // ─── Render ───────────────────────────────────────────────────────────────────
  return (
    <View style={[styles.screen]}>

      {/* ── Top bar ── */}
      <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
        <View style={styles.topTitle}>
          <Text style={styles.topEmoji}>{PRACTICE_EMOJI[type]}</Text>
          <Text style={styles.topLabel}>{PRACTICE_LABEL[type]}</Text>
          <Text style={styles.topSub}>{totalMinutes} min</Text>
        </View>
        <Pressable style={styles.closeBtn} onPress={handleClose} hitSlop={16}>
          <Text style={styles.closeTxt}>✕</Text>
        </Pressable>
      </View>

      {/* ── Photo carousel ── */}
      <View style={styles.carouselSection}>
        <PhotoCarousel photos={photos} />
      </View>

      {/* ── Gratitude display ── */}
      <View style={styles.gratitudeSection}>
        <GratitudeDisplay items={gratitudes} />
      </View>

      {/* ── Finish banner ── */}
      {isFinished && (
        <View style={styles.finishBanner}>
          <Text style={styles.finishTxt}>Great work — session complete!</Text>
        </View>
      )}

      {/* ── Bottom bar: progress + play/pause ── */}
      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 16 }]}>

        {/* Progress bar + time */}
        <View style={styles.progressRow}>
          <Text style={styles.timeLabel}>{fmtTime(displayElapsed)}</Text>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${Math.round(displayProgress * 100)}%` }]} />
          </View>
          <Text style={styles.timeLabel}>-{fmtTime(displayRemaining)}</Text>
        </View>

        {chunkLabel ? <Text style={styles.chunkLabel}>{chunkLabel}</Text> : null}

        {/* Play / Pause / Done button */}
        <Pressable
          style={({ pressed }) => [
            styles.playBtn,
            pressed && { opacity: 0.8, transform: [{ scale: 0.94 }] },
          ]}
          onPress={isFinished ? handleClose : handlePlayPause}
        >
          <Text style={styles.playBtnTxt}>
            {isFinished ? 'Done' : isLoading ? '···' : isPlaying ? '⏸' : '▶'}
          </Text>
        </Pressable>

      </View>

    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#0F0E1A', // matches dark background token
  },

  // Top bar
  topBar: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 10,
  },
  topTitle: { flex: 1, gap: 2 },
  topEmoji: { fontSize: 26 },
  topLabel: { color: '#EEEEFF', fontSize: 20, fontWeight: '700', letterSpacing: 0.2 },
  topSub: { color: 'rgba(238,238,255,0.4)', fontSize: 13 },
  closeBtn: { padding: 8, marginTop: 2 },
  closeTxt: { color: 'rgba(238,238,255,0.5)', fontSize: 18 },

  // Photo carousel
  carouselSection: {
    height: PHOTO_H + 8,
    overflow: 'hidden',
  },
  carouselOuter: {
    height: PHOTO_H,
    overflow: 'hidden',
    marginTop: 4,
  },
  carouselTrack: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 16,
  },
  photoWrapper: {
    width: PHOTO_W,
    height: PHOTO_H,
    marginRight: PHOTO_GAP,
  },
  photoCard: {
    width: PHOTO_W,
    height: PHOTO_H,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: '#1C1B2E',
  },
  photoImg: { width: '100%', height: '100%' },
  carouselEmpty: {
    height: PHOTO_H,
    marginHorizontal: 20,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(108,99,255,0.2)',
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  carouselEmptyTxt: {
    color: 'rgba(238,238,255,0.3)',
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: 24,
  },

  // Gratitude
  gratitudeSection: {
    flex: 1,
    paddingHorizontal: 20,
    justifyContent: 'center',
    minHeight: 100,
  },
  gratitudeCard: {
    backgroundColor: 'rgba(108,99,255,0.1)',
    borderRadius: 16,
    padding: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(108,99,255,0.3)',
    alignItems: 'center',
    gap: 8,
  },
  gratitudeLabel: {
    color: 'rgba(238,238,255,0.4)',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  gratitudeText: {
    color: 'rgba(238,238,255,0.9)',
    fontSize: 16,
    fontWeight: '500',
    textAlign: 'center',
    lineHeight: 23,
  },
  gratitudeDots: {
    flexDirection: 'row',
    gap: 5,
    alignItems: 'center',
    marginTop: 2,
  },
  gDot: { width: 5, height: 5, borderRadius: 2.5 },

  // Finish
  finishBanner: {
    marginHorizontal: 20,
    marginBottom: 8,
    backgroundColor: 'rgba(74,222,128,0.12)',
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(74,222,128,0.3)',
  },
  finishTxt: { color: '#4ADE80', fontSize: 14, fontWeight: '700' },

  // Bottom bar
  bottomBar: {
    paddingHorizontal: 24,
    paddingTop: 12,
    alignItems: 'center',
    gap: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(108,99,255,0.15)',
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    gap: 10,
  },
  timeLabel: {
    color: 'rgba(238,238,255,0.4)',
    fontSize: 11,
    fontVariant: ['tabular-nums'],
    minWidth: 36,
    textAlign: 'center',
  },
  progressTrack: {
    flex: 1,
    height: 4,
    backgroundColor: 'rgba(108,99,255,0.2)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: 4,
    backgroundColor: PRIMARY,
    borderRadius: 2,
  },
  chunkLabel: {
    color: 'rgba(238,238,255,0.3)',
    fontSize: 11,
    letterSpacing: 0.3,
  },
  playBtn: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: PRIMARY_DIM,
    borderWidth: 2,
    borderColor: PRIMARY_BORDER,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  playBtnTxt: {
    color: '#EEEEFF',
    fontSize: 24,
    fontWeight: '700',
  },
});
