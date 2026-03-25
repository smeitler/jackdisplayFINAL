/**
 * PracticePlayer Screen
 *
 * Layout (top → bottom):
 *   ┌─────────────────────────────────────┐
 *   │  [emoji] Title          [✕ close]   │  ← compact top bar
 *   │  ─────────────────────────────────  │
 *   │  ◄── journal photos slide ──►       │  ← Row 1: journal photos (hold=pause, swipe=scrub)
 *   │  ◄── vision board photos slide ──►  │  ← Row 2: vision board photos (slightly slower)
 *   │  ◄── gratitude text chips ──►       │  ← Row 3: gratitude text scrolling
 *   │  ─────────────────────────────────  │
 *   │  ████████░░░░░░░░  3:12 / 5:00      │  ← real-time progress bar
 *   │           [ ⏸ ]                     │  ← play/pause button
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
  PanResponder,
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

// Row dimensions
const ROW_H = SCREEN_H * 0.22;          // height of each photo row
const PHOTO_W = ROW_H * 0.75;           // portrait-ish aspect
const PHOTO_GAP = 10;
const GRAT_CHIP_H = 44;

// Scroll speeds (px/s)
const SPEED_JOURNAL = 40;
const SPEED_VISION  = 28;
const SPEED_GRAT    = 55;

// Theme
const PRIMARY        = '#3B82F6';
const PRIMARY_DIM    = 'rgba(108,99,255,0.22)';
const PRIMARY_BORDER = 'rgba(108,99,255,0.55)';
const SURFACE        = 'rgba(255,255,255,0.07)';
const OVERLAY        = 'rgba(0,0,0,0.55)';

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

function fmtTime(secs: number): string {
  const s = Math.max(0, Math.floor(secs));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, '0')}`;
}

// ─── SlidingRow ───────────────────────────────────────────────────────────────
// A generic horizontally-sliding row with hold-to-pause and swipe-to-scrub.

interface SlidingRowProps {
  speed: number;           // px/s
  rowHeight: number;
  items: React.ReactNode[];  // individual items passed as a proper array prop
  itemWidth: number;
  gap: number;
}

function SlidingRow({ speed, rowHeight, items, itemWidth, gap }: SlidingRowProps) {
  const count = items.length;
  // Triple the items so the loop is seamless
  const tripled = count > 0 ? [...items, ...items, ...items] : [];
  const loopW = count * (itemWidth + gap);
  const totalW = tripled.length * (itemWidth + gap) + 32;

  const scrollX   = useRef(new Animated.Value(0)).current;
  const curXRef   = useRef(0);
  const animRef   = useRef<Animated.CompositeAnimation | null>(null);
  const pausedRef = useRef(false);

  // Track current X
  useEffect(() => {
    const id = scrollX.addListener(({ value }) => { curXRef.current = value; });
    return () => scrollX.removeListener(id);
  }, [scrollX]);

  const startFrom = useCallback((fromX: number) => {
    if (count < 1 || speed <= 0) return;
    const loopedX = fromX % loopW;
    const distToLoop = loopW - loopedX;
    const duration = (distToLoop / speed) * 1000;
    animRef.current?.stop();
    animRef.current = Animated.timing(scrollX, {
      toValue: fromX + distToLoop,
      duration,
      easing: Easing.linear,
      useNativeDriver: true,
    });
    animRef.current.start(({ finished }) => {
      if (finished) {
        scrollX.setValue(fromX + distToLoop - loopW);
        curXRef.current = fromX + distToLoop - loopW;
        startFrom(fromX + distToLoop - loopW);
      }
    });
  }, [count, speed, loopW, scrollX]);

  useEffect(() => {
    if (count < 1) return;
    startFrom(0);
    return () => { animRef.current?.stop(); };
  }, [count, startFrom]);

  // PanResponder for hold-to-pause + swipe-to-scrub
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        pausedRef.current = true;
        animRef.current?.stop();
        if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      },
      onPanResponderMove: (_e, gs) => {
        // Swipe left = advance, swipe right = go back
        const newX = Math.max(0, curXRef.current - gs.dx * 0.5);
        scrollX.setValue(newX % loopW);
        curXRef.current = newX % loopW;
      },
      onPanResponderRelease: () => {
        pausedRef.current = false;
        startFrom(curXRef.current);
      },
      onPanResponderTerminate: () => {
        pausedRef.current = false;
        startFrom(curXRef.current);
      },
    })
  ).current;

  if (count < 1) return null;

  return (
    <View style={{ height: rowHeight, overflow: 'hidden' }} {...panResponder.panHandlers}>
      <Animated.View
        style={{
          flexDirection: 'row',
          width: totalW,
          alignItems: 'center',
          transform: [{ translateX: Animated.multiply(scrollX, -1) }],
        }}
      >
        {tripled.map((item, i) => (
          <View key={i} style={{ width: itemWidth, marginRight: gap }}>
            {item}
          </View>
        ))}
      </Animated.View>
    </View>
  );
}

// ─── PhotoItem ────────────────────────────────────────────────────────────────

function PhotoItem({ uri, height }: { uri: string; height: number }) {
  const [expanded, setExpanded] = useState(false);
  const scale = useRef(new Animated.Value(1)).current;

  const handlePress = () => {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setExpanded(true);
    Animated.sequence([
      Animated.timing(scale, { toValue: 1.12, duration: 180, useNativeDriver: true, easing: Easing.out(Easing.ease) }),
      Animated.timing(scale, { toValue: 1, duration: 220, useNativeDriver: true, easing: Easing.in(Easing.ease) }),
    ]).start(() => setExpanded(false));
  };

  return (
    <Pressable onPress={handlePress}>
      <Animated.View style={{ transform: [{ scale }] }}>
        <Image
          source={{ uri }}
          style={{
            width: PHOTO_W,
            height,
            borderRadius: 12,
            backgroundColor: '#1a1a2e',
          }}
          resizeMode="cover"
        />
      </Animated.View>
    </Pressable>
  );
}

// ─── GratitudeChip ────────────────────────────────────────────────────────────

function GratitudeChip({ text }: { text: string }) {
  const scale = useRef(new Animated.Value(1)).current;

  const handlePress = () => {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Animated.sequence([
      Animated.timing(scale, { toValue: 1.08, duration: 120, useNativeDriver: true }),
      Animated.timing(scale, { toValue: 1, duration: 200, useNativeDriver: true }),
    ]).start();
  };

  return (
    <Pressable onPress={handlePress}>
      <Animated.View style={[styles.gratChip, { transform: [{ scale }] }]}>
        <Text style={styles.gratChipText} numberOfLines={1}>🙏 {text}</Text>
      </Animated.View>
    </Pressable>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function PracticePlayerScreen() {
  useKeepAwake();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{
    type?: string;
    chunkUrls?: string;
    pausesBetweenChunks?: string;
    totalDurationMinutes?: string;
    title?: string;
  }>();

  const practiceType = (params.type ?? 'priming') as PracticeType;
  const chunkUrls: string[] = params.chunkUrls
    ? JSON.parse(decodeURIComponent(params.chunkUrls))
    : [];
  const pausesBetween = params.pausesBetweenChunks
    ? JSON.parse(decodeURIComponent(params.pausesBetweenChunks))
    : [];
  const totalMinutes = Number(params.totalDurationMinutes ?? 5);
  const displayTitle = params.title ?? PRACTICE_LABEL[practiceType];

  // ─── Audio state ─────────────────────────────────────────────────────────────
  const [currentChunk, setCurrentChunk] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isFinished, setIsFinished] = useState(false);
  const [elapsedSecs, setElapsedSecs] = useState(0);
  const [chunkDuration, setChunkDuration] = useState(0);
  const isPausedRef = useRef(false);

  // ─── Journal + Vision Board data ─────────────────────────────────────────────
  const [journalPhotos, setJournalPhotos] = useState<string[]>([]);
  const [visionPhotos, setVisionPhotos] = useState<string[]>([]);
  const [gratitudes, setGratitudes] = useState<string[]>([]);

  // ─── Refs ─────────────────────────────────────────────────────────────────────
  const voicePlayerRef = useRef<ReturnType<typeof createAudioPlayer> | null>(null);
  const musicPlayerRef = useRef<ReturnType<typeof createAudioPlayer> | null>(null);
  const pauseTimerRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const progressIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const chunkIndexRef  = useRef(0);

  // ─── Load journal + vision board data ────────────────────────────────────────
  useEffect(() => {
    async function loadData() {
      try {
        const { parseGratitudes, loadEntries } = await import('@/lib/journal-store');
        const { loadVisionBoard, loadGratitudeEntries, getLastUserId } = await import('@/lib/storage');

        const uid = await getLastUserId();
        const effectiveUid = uid || 'default';

        // ── Journal photos + body-parsed gratitudes ──
        const allEntries = await loadEntries(effectiveUid);
        allEntries.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

        const photoList: string[] = [];
        const gratList: string[] = [];
        for (const e of allEntries.slice(0, 60)) {
          for (const att of e.attachments ?? []) {
            if (att.type === 'photo' && att.uri && photoList.length < 30) {
              photoList.push(att.uri);
            }
          }
          const bodyGrats = parseGratitudes(e.body ?? '');
          for (const g of bodyGrats) {
            if (g.trim() && gratList.length < 20) gratList.push(g.trim());
          }
          for (const g of (e as any).gratitudes ?? []) {
            if (g.trim() && gratList.length < 20 && !gratList.includes(g.trim())) {
              gratList.push(g.trim());
            }
          }
        }
        setJournalPhotos(photoList);

        // ── Dedicated gratitude entries (from Vision Board / Gratitude tab) ──
        const gratEntries = await loadGratitudeEntries();
        // Sort newest first
        gratEntries.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        for (const entry of gratEntries) {
          for (const item of entry.items) {
            if (item.trim() && gratList.length < 30 && !gratList.includes(item.trim())) {
              gratList.push(item.trim());
            }
          }
        }
        setGratitudes(gratList);

        // ── Vision board photos ──
        const board = await loadVisionBoard();
        const vbPhotos: string[] = [];
        for (const uris of Object.values(board)) {
          for (const uri of uris) {
            if (uri && vbPhotos.length < 30) vbPhotos.push(uri);
          }
        }
        setVisionPhotos(vbPhotos);

        console.log('[PracticePlayer] Journal photos:', photoList.length, '| Vision photos:', vbPhotos.length, '| Gratitudes:', gratList.length);
      } catch (err) {
        console.warn('[PracticePlayer] Failed to load data:', err);
      }
    }
    loadData();
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
      p.volume = 0.12;
      musicPlayerRef.current = p;
    } catch { /* ignore */ }
    return () => {
      musicPlayerRef.current?.remove();
      musicPlayerRef.current = null;
    };
  }, []);

  const playChunk = useCallback((idx: number) => {
    if (idx >= chunkUrls.length) {
      setIsFinished(true);
      setIsPlaying(false);
      musicPlayerRef.current?.pause();
      return;
    }
    chunkIndexRef.current = idx;
    setCurrentChunk(idx);
    setIsLoading(true);
    setElapsedSecs(0);
    setChunkDuration(0);

    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);

    try {
      voicePlayerRef.current?.remove();
      const p = createAudioPlayer({ uri: chunkUrls[idx] });
      voicePlayerRef.current = p;

      // Poll for ready + duration
      pollIntervalRef.current = setInterval(() => {
        try {
          const dur = (p as any).duration ?? 0;
          if (dur > 0) {
            clearInterval(pollIntervalRef.current!);
            setChunkDuration(dur);
            setIsLoading(false);
            if (!isPausedRef.current) {
              p.play();
              setIsPlaying(true);
              musicPlayerRef.current?.play();
            }
          }
        } catch { clearInterval(pollIntervalRef.current!); }
      }, 200);

      // Progress polling
      progressIntervalRef.current = setInterval(() => {
        try {
          const t = (p as any).currentTime ?? 0;
          const d = (p as any).duration ?? 0;
          setElapsedSecs(t);
          if (d > 0 && t >= d - 0.3) {
            clearInterval(progressIntervalRef.current!);
            const pauseSecs = pausesBetween[idx] ?? 0;
            if (pauseSecs > 0) {
              pauseTimerRef.current = setTimeout(() => playChunk(idx + 1), pauseSecs * 1000);
            } else {
              playChunk(idx + 1);
            }
          }
        } catch { clearInterval(progressIntervalRef.current!); }
      }, 250);
    } catch (err) {
      console.warn('[PracticePlayer] Audio error:', err);
      setIsLoading(false);
    }
  }, [chunkUrls, pausesBetween]);

  useEffect(() => {
    if (chunkUrls.length > 0) playChunk(0);
    return () => {
      if (pauseTimerRef.current) clearTimeout(pauseTimerRef.current);
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
      if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
      voicePlayerRef.current?.remove();
    };
  }, []);

  const togglePlayPause = () => {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const p = voicePlayerRef.current;
    if (!p) return;
    if (isPlaying) {
      p.pause();
      musicPlayerRef.current?.pause();
      isPausedRef.current = true;
      setIsPlaying(false);
    } else {
      p.play();
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
    if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
    router.back();
  };

  // Progress bar values
  const totalSecs = totalMinutes * 60;
  const globalElapsed = currentChunk > 0
    ? (currentChunk / chunkUrls.length) * totalSecs + elapsedSecs
    : elapsedSecs;
  const progressFraction = totalSecs > 0 ? Math.min(globalElapsed / totalSecs, 1) : 0;
  const remaining = Math.max(0, totalSecs - globalElapsed);

  // Build carousel items
  const journalItems = journalPhotos.map((uri, i) => (
    <PhotoItem key={i} uri={uri} height={ROW_H} />
  ));
  const visionItems = visionPhotos.map((uri, i) => (
    <PhotoItem key={i} uri={uri} height={ROW_H} />
  ));
  const gratItems = gratitudes.map((text, i) => (
    <GratitudeChip key={i} text={text} />
  ));

  const hasJournal = journalPhotos.length > 0;
  const hasVision  = visionPhotos.length > 0;
  const hasGrats   = gratitudes.length > 0;

  return (
    <View style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      {/* ── Top bar ── */}
      <View style={styles.topBar}>
        <View style={styles.topBarLeft}>
          <Text style={styles.topEmoji}>{PRACTICE_EMOJI[practiceType]}</Text>
          <View>
            <Text style={styles.topTitle}>{displayTitle}</Text>
            <Text style={styles.topSub}>{totalMinutes} minutes</Text>
          </View>
        </View>
        <Pressable onPress={handleClose} style={styles.closeBtn} hitSlop={12}>
          <Text style={styles.closeTxt}>✕</Text>
        </Pressable>
      </View>

      {/* ── Content area ── */}
      <View style={styles.content}>
        {/* Row 1: Journal photos */}
        {hasJournal ? (
          <View style={styles.rowWrapper}>
            <Text style={styles.rowLabel}>MEMORIES</Text>
            <SlidingRow speed={SPEED_JOURNAL} rowHeight={ROW_H} itemWidth={PHOTO_W} gap={PHOTO_GAP} items={journalItems} />
          </View>
        ) : (
          <View style={[styles.emptyRow, { height: ROW_H }]}>
            <Text style={styles.emptyRowTxt}>📸 Add photos to your journal to see them here</Text>
          </View>
        )}

        {/* Row 2: Vision board photos */}
        {hasVision ? (
          <View style={styles.rowWrapper}>
            <Text style={styles.rowLabel}>VISION</Text>
            <SlidingRow speed={SPEED_VISION} rowHeight={ROW_H} itemWidth={PHOTO_W} gap={PHOTO_GAP} items={visionItems} />
          </View>
        ) : (
          <View style={[styles.emptyRow, { height: ROW_H }]}>
            <Text style={styles.emptyRowTxt}>🎯 Add images to your Vision Board to see them here</Text>
          </View>
        )}

        {/* Row 3: Gratitude text chips */}
        {hasGrats ? (
          <View style={styles.rowWrapper}>
            <Text style={styles.rowLabel}>GRATEFUL FOR</Text>
            <SlidingRow speed={SPEED_GRAT} rowHeight={GRAT_CHIP_H + 8} itemWidth={220} gap={12} items={gratItems} />
          </View>
        ) : (
          <View style={[styles.emptyRow, { height: GRAT_CHIP_H + 24 }]}>
            <Text style={styles.emptyRowTxt}>🙏 Write gratitudes in your journal to see them here</Text>
          </View>
        )}
      </View>

      {/* ── Bottom: progress + play/pause ── */}
      <View style={styles.bottomBar}>
        {/* Progress bar */}
        <View style={styles.progressRow}>
          <Text style={styles.progressTime}>{fmtTime(globalElapsed)}</Text>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${progressFraction * 100}%` }]} />
          </View>
          <Text style={styles.progressTime}>-{fmtTime(remaining)}</Text>
        </View>

        {/* Part indicator */}
        {chunkUrls.length > 1 && (
          <Text style={styles.partLabel}>Part {currentChunk + 1} of {chunkUrls.length}</Text>
        )}

        {/* Play/Pause */}
        <View style={styles.playRow}>
          {isFinished ? (
            <View style={styles.finishedBadge}>
              <Text style={styles.finishedTxt}>✓ Session Complete</Text>
            </View>
          ) : (
            <Pressable
              onPress={togglePlayPause}
              style={({ pressed }) => [
                styles.playBtn,
                pressed && { opacity: 0.75, transform: [{ scale: 0.95 }] },
              ]}
            >
              {isLoading ? (
                <Text style={styles.playIcon}>⏳</Text>
              ) : (
                <Text style={styles.playIcon}>{isPlaying ? '⏸' : '▶'}</Text>
              )}
            </Pressable>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#0d0d1a',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  topBarLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  topEmoji: {
    fontSize: 26,
  },
  topTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: 0.3,
  },
  topSub: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.5)',
    marginTop: 1,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeTxt: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
  },
  rowWrapper: {
    gap: 4,
  },
  rowLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.35)',
    letterSpacing: 1.5,
    paddingLeft: 16,
  },
  emptyRow: {
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 16,
    borderRadius: 12,
    backgroundColor: SURFACE,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    borderStyle: 'dashed',
  },
  emptyRowTxt: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.3)',
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  gratChip: {
    height: GRAT_CHIP_H,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 22,
    backgroundColor: 'rgba(108,99,255,0.18)',
    borderWidth: 1,
    borderColor: PRIMARY_BORDER,
    justifyContent: 'center',
    alignItems: 'center',
  },
  gratChipText: {
    fontSize: 13,
    color: '#e0ddff',
    fontWeight: '500',
  },
  bottomBar: {
    paddingHorizontal: 20,
    paddingBottom: 12,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.1)',
    gap: 6,
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  progressTime: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.45)',
    width: 38,
    textAlign: 'center',
  },
  progressTrack: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.12)',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
    backgroundColor: PRIMARY,
  },
  partLabel: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.35)',
    textAlign: 'center',
  },
  playRow: {
    alignItems: 'center',
    paddingTop: 4,
  },
  playBtn: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: PRIMARY_DIM,
    borderWidth: 2,
    borderColor: PRIMARY_BORDER,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playIcon: {
    fontSize: 26,
    color: '#fff',
  },
  finishedBadge: {
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 32,
    backgroundColor: 'rgba(34,197,94,0.2)',
    borderWidth: 1,
    borderColor: 'rgba(34,197,94,0.5)',
  },
  finishedTxt: {
    fontSize: 15,
    color: '#4ade80',
    fontWeight: '700',
  },
});
