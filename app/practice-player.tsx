/**
 * PracticePlayer Screen — redesigned
 *
 * Layout:
 * - Top half: horizontal sliding photo carousel (continuous smooth scroll, tap to expand)
 * - Middle: session title, progress bar, part label
 * - Bottom: cycling gratitude text (one item at a time, fade in/out), tap to pulse
 * - Fixed bottom bar: play/pause button + X close
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
  ScrollView,
  Image,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import { useKeepAwake } from 'expo-keep-awake';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const PHOTO_W = SCREEN_W * 0.52;
const PHOTO_H = SCREEN_H * 0.32;
const PHOTO_GAP = 12;
const CAROUSEL_SPEED = 40; // pixels per second

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

// ─── PhotoCarousel ────────────────────────────────────────────────────────────

function PhotoCarousel({ photos }: { photos: string[] }) {
  // Duplicate photos for infinite loop illusion
  const items = photos.length > 0 ? [...photos, ...photos, ...photos] : [];
  const totalW = items.length * (PHOTO_W + PHOTO_GAP);
  const scrollX = useRef(new Animated.Value(0)).current;
  const animRef = useRef<Animated.CompositeAnimation | null>(null);
  const currentXRef = useRef(0);
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
  const expandScale = useRef(new Animated.Value(1)).current;

  // Listen to scrollX to track current position
  useEffect(() => {
    const id = scrollX.addListener(({ value }) => { currentXRef.current = value; });
    return () => scrollX.removeListener(id);
  }, [scrollX]);

  const startScroll = useCallback((fromX: number) => {
    // Scroll from current position to end of one full set, then loop
    const loopW = photos.length * (PHOTO_W + PHOTO_GAP);
    const distanceToLoop = loopW - (fromX % loopW);
    const duration = (distanceToLoop / CAROUSEL_SPEED) * 1000;

    animRef.current?.stop();
    animRef.current = Animated.timing(scrollX, {
      toValue: fromX + distanceToLoop,
      duration,
      easing: Easing.linear,
      useNativeDriver: true,
    });
    animRef.current.start(({ finished }) => {
      if (finished) {
        // Reset to 0 and loop
        scrollX.setValue(0);
        currentXRef.current = 0;
        startScroll(0);
      }
    });
  }, [photos.length, scrollX]);

  useEffect(() => {
    if (photos.length < 2) return;
    startScroll(0);
    return () => { animRef.current?.stop(); };
  }, [photos.length, startScroll]);

  const handlePhotoTap = (idx: number) => {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setExpandedIdx(idx);
    // Pause carousel briefly
    animRef.current?.stop();
    Animated.sequence([
      Animated.timing(expandScale, { toValue: 1.18, duration: 200, useNativeDriver: true, easing: Easing.out(Easing.ease) }),
      Animated.delay(600),
      Animated.timing(expandScale, { toValue: 1, duration: 250, useNativeDriver: true, easing: Easing.in(Easing.ease) }),
    ]).start(() => {
      setExpandedIdx(null);
      // Resume from current position
      startScroll(currentXRef.current);
    });
  };

  if (photos.length === 0) {
    return (
      <View style={styles.carouselEmpty}>
        <Text style={styles.carouselEmptyTxt}>Add photos to your journal to see them here</Text>
      </View>
    );
  }

  return (
    <View style={styles.carouselContainer}>
      <Animated.View
        style={[
          styles.carouselTrack,
          { width: totalW, transform: [{ translateX: Animated.multiply(scrollX, -1) }] },
        ]}
      >
        {items.map((uri, i) => {
          const isExpanded = expandedIdx === i;
          return (
            <Pressable key={`${uri}-${i}`} onPress={() => handlePhotoTap(i)} style={styles.photoWrapper}>
              <Animated.View style={[styles.photoCard, isExpanded && { transform: [{ scale: expandScale }], zIndex: 10 }]}>
                <Image source={{ uri }} style={styles.photoImg} resizeMode="cover" />
              </Animated.View>
            </Pressable>
          );
        })}
      </Animated.View>
      {/* Fade edges */}
      <View style={styles.fadeLeft} pointerEvents="none" />
      <View style={styles.fadeRight} pointerEvents="none" />
    </View>
  );
}

// ─── GratitudeDisplay ─────────────────────────────────────────────────────────

function GratitudeDisplay({ items }: { items: string[] }) {
  const [idx, setIdx] = useState(0);
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (items.length < 2) return;
    timerRef.current = setInterval(() => {
      // Fade out
      Animated.timing(fadeAnim, { toValue: 0, duration: 500, useNativeDriver: true }).start(() => {
        setIdx((i) => (i + 1) % items.length);
        Animated.timing(fadeAnim, { toValue: 1, duration: 600, useNativeDriver: true }).start();
      });
    }, 5000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [items.length, fadeAnim]);

  const handleTap = () => {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Animated.sequence([
      Animated.spring(scaleAnim, { toValue: 1.06, useNativeDriver: true, speed: 40, bounciness: 8 }),
      Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, speed: 30, bounciness: 4 }),
    ]).start();
  };

  if (items.length === 0) return null;

  return (
    <Pressable onPress={handleTap} style={styles.gratitudeContainer}>
      <Animated.View style={[styles.gratitudeCard, { opacity: fadeAnim, transform: [{ scale: scaleAnim }] }]}>
        <Text style={styles.gratitudeLabel}>🙏  GRATEFUL FOR</Text>
        <Text style={styles.gratitudeText}>{items[idx]}</Text>
        {items.length > 1 && (
          <View style={styles.gratitudeDots}>
            {items.slice(0, Math.min(items.length, 8)).map((_, i) => (
              <View key={i} style={[styles.gDot, { backgroundColor: i === idx % Math.min(items.length, 8) ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.25)' }]} />
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

  // ─── Audio state ─────────────────────────────────────────────────────────────
  const [currentChunk, setCurrentChunk] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isFinished, setIsFinished] = useState(false);
  const [progress, setProgress] = useState(0);
  const isPausedRef = useRef(false);

  // ─── Journal data ─────────────────────────────────────────────────────────────
  const [photos, setPhotos] = useState<string[]>([]);
  const [gratitudes, setGratitudes] = useState<string[]>([]);

  // ─── Refs ─────────────────────────────────────────────────────────────────────
  const voicePlayerRef = useRef<ReturnType<typeof createAudioPlayer> | null>(null);
  const musicPlayerRef = useRef<ReturnType<typeof createAudioPlayer> | null>(null);
  const pauseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const chunkIndexRef = useRef(0);

  // ─── Load journal data ────────────────────────────────────────────────────────
  useEffect(() => {
    async function load() {
      try {
        const { loadEntries, parseGratitudes } = await import('@/lib/journal-store');
        const { getLastUserId } = await import('@/lib/storage');
        const uid = await getLastUserId();
        const entries = await loadEntries(uid || 'default');
        const photoList: string[] = [];
        const gratList: string[] = [];
        for (const e of entries.slice(0, 30)) {
          for (const att of e.attachments ?? []) {
            if (att.type === 'photo' && att.uri && photoList.length < 20) photoList.push(att.uri);
          }
          for (const g of parseGratitudes(e.body ?? '')) {
            if (g.trim() && gratList.length < 15) gratList.push(g.trim());
          }
          for (const g of e.gratitudes ?? []) {
            if (g.trim() && gratList.length < 15 && !gratList.includes(g.trim())) gratList.push(g.trim());
          }
        }
        setPhotos(photoList);
        setGratitudes(gratList);
      } catch { /* optional */ }
    }
    load();
  }, []);

  // ─── Audio setup ─────────────────────────────────────────────────────────────
  useEffect(() => {
    setAudioModeAsync({ playsInSilentMode: true }).catch(() => {});
  }, []);

  useEffect(() => {
    const musicUrl = 'https://cdn.pixabay.com/audio/2022/10/16/audio_12a0ee4e81.mp3';
    try {
      const p = createAudioPlayer({ uri: musicUrl });
      p.loop = true;
      p.volume = 0.18;
      p.play();
      musicPlayerRef.current = p;
    } catch { /* optional */ }
    return () => { musicPlayerRef.current?.remove(); };
  }, []);

  // ─── Playback logic ───────────────────────────────────────────────────────────
  const playChunk = useCallback((index: number) => {
    if (index >= chunkUrls.length) {
      setIsFinished(true);
      setIsPlaying(false);
      setProgress(1);
      musicPlayerRef.current?.pause();
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      return;
    }
    chunkIndexRef.current = index;
    setCurrentChunk(index);
    setProgress(index / chunkUrls.length);
    voicePlayerRef.current?.remove();
    voicePlayerRef.current = null;
    const player = createAudioPlayer({ uri: chunkUrls[index] });
    voicePlayerRef.current = player;
    player.play();
    setIsPlaying(true);
    setIsLoading(false);
    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    pollIntervalRef.current = setInterval(() => {
      if (!voicePlayerRef.current || isPausedRef.current) return;
      const p = voicePlayerRef.current as any;
      try {
        const dur = p.duration ?? 0;
        const cur = p.currentTime ?? 0;
        const playing = p.playing ?? true;
        if (dur > 0 && cur >= dur - 0.2 && !playing) {
          clearInterval(pollIntervalRef.current!);
          pollIntervalRef.current = null;
          const pause = pausesBetweenChunks[index] ?? 2000;
          pauseTimerRef.current = setTimeout(() => playChunk(index + 1), pause);
        }
      } catch { /* ignore */ }
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
    }
  };

  const handleClose = () => {
    voicePlayerRef.current?.remove();
    musicPlayerRef.current?.remove();
    if (pauseTimerRef.current) clearTimeout(pauseTimerRef.current);
    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    router.back();
  };

  const chunkLabel = isFinished
    ? 'Session complete'
    : isLoading
    ? 'Preparing...'
    : `Part ${currentChunk + 1} of ${chunkUrls.length}`;

  // ─── Render ───────────────────────────────────────────────────────────────────
  return (
    <View style={[styles.screen, { backgroundColor: '#080814' }]}>

      {/* ── Top bar: close + title ── */}
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

      {/* ── Progress ── */}
      <View style={styles.progressSection}>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${Math.round(progress * 100)}%` }]} />
        </View>
        <Text style={styles.progressLabel}>{chunkLabel}</Text>
      </View>

      {/* ── Gratitude display ── */}
      <View style={styles.gratitudeSection}>
        <GratitudeDisplay items={gratitudes} />
      </View>

      {/* ── Finish message ── */}
      {isFinished && (
        <View style={styles.finishBanner}>
          <Text style={styles.finishTxt}>✓  Session Complete — great work!</Text>
        </View>
      )}

      {/* ── Fixed bottom play/pause bar ── */}
      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 12 }]}>
        <Pressable
          style={({ pressed }) => [styles.playBtn, pressed && { opacity: 0.8, transform: [{ scale: 0.95 }] }]}
          onPress={isFinished ? handleClose : handlePlayPause}
        >
          <Text style={styles.playBtnTxt}>
            {isFinished ? 'Done' : isLoading ? '...' : isPlaying ? '⏸' : '▶'}
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
  },

  // Top bar
  topBar: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  topTitle: {
    flex: 1,
    gap: 2,
  },
  topEmoji: {
    fontSize: 28,
  },
  topLabel: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  topSub: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 13,
  },
  closeBtn: {
    padding: 8,
    marginTop: 2,
  },
  closeTxt: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 18,
  },

  // Photo carousel
  carouselSection: {
    height: PHOTO_H + 24,
    overflow: 'hidden',
  },
  carouselContainer: {
    height: PHOTO_H,
    overflow: 'hidden',
    marginTop: 8,
  },
  carouselTrack: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 16,
    gap: PHOTO_GAP,
  },
  photoWrapper: {
    width: PHOTO_W,
    height: PHOTO_H,
    marginRight: PHOTO_GAP,
  },
  photoCard: {
    width: PHOTO_W,
    height: PHOTO_H,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#1a1a2e',
  },
  photoImg: {
    width: '100%',
    height: '100%',
  },
  carouselEmpty: {
    height: PHOTO_H,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 24,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    borderStyle: 'dashed',
  },
  carouselEmptyTxt: {
    color: 'rgba(255,255,255,0.3)',
    fontSize: 13,
    textAlign: 'center',
    paddingHorizontal: 24,
    lineHeight: 20,
  },
  fadeLeft: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 32,
    backgroundColor: 'transparent',
  },
  fadeRight: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: 32,
    backgroundColor: 'transparent',
  },

  // Progress
  progressSection: {
    paddingHorizontal: 24,
    paddingTop: 16,
    gap: 6,
    alignItems: 'center',
  },
  progressTrack: {
    width: '100%',
    height: 3,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: 3,
    backgroundColor: '#63B3ED',
    borderRadius: 2,
  },
  progressLabel: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 12,
    letterSpacing: 0.3,
  },

  // Gratitude
  gratitudeSection: {
    flex: 1,
    paddingHorizontal: 20,
    justifyContent: 'center',
  },
  gratitudeContainer: {
    width: '100%',
  },
  gratitudeCard: {
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderRadius: 18,
    padding: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    gap: 10,
  },
  gratitudeLabel: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  gratitudeText: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 17,
    fontWeight: '500',
    textAlign: 'center',
    lineHeight: 24,
  },
  gratitudeDots: {
    flexDirection: 'row',
    gap: 5,
    alignItems: 'center',
    marginTop: 4,
  },
  gDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },

  // Finish
  finishBanner: {
    marginHorizontal: 24,
    marginBottom: 8,
    backgroundColor: 'rgba(74,222,128,0.15)',
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(74,222,128,0.35)',
  },
  finishTxt: {
    color: '#4ADE80',
    fontSize: 15,
    fontWeight: '700',
  },

  // Bottom bar
  bottomBar: {
    paddingHorizontal: 24,
    paddingTop: 12,
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.08)',
  },
  playBtn: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(99,179,237,0.25)',
    borderWidth: 2,
    borderColor: 'rgba(99,179,237,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  playBtnTxt: {
    color: '#fff',
    fontSize: 26,
    fontWeight: '700',
  },
});
