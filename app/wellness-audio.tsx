/**
 * WellnessAudio Screen
 *
 * Displays audio tracks for a given wellness category (Meditate, Sleep, Move, Focus).
 *
 * Features:
 * - Pill tab switcher: Explore (default) / Favorites
 * - Explore tab: full track list; first favorited track pinned at top with a star badge
 * - Favorites tab: all tracks the user has starred, persisted via AsyncStorage
 * - Heart button on each track row to toggle favorite with haptic feedback
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  FlatList,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useColors } from '@/hooks/use-colors';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import { WellnessIcon } from '@/components/wellness-icon';
import { useKeepAwake } from 'expo-keep-awake';
import * as Haptics from 'expo-haptics';

// ─── Types ────────────────────────────────────────────────────────────────────

type WellnessCategory = 'meditate' | 'sleep' | 'move' | 'focus';
type TabKey = 'explore' | 'favorites';

interface AudioTrack {
  id: string;
  title: string;
  artist: string;
  duration: string;
  durationSec: number;
  url: string;
}

// ─── Audio Catalog ────────────────────────────────────────────────────────────

const AUDIO_CATALOG: Record<WellnessCategory, AudioTrack[]> = {
  meditate: [
    {
      id: 'med-1',
      title: 'Meditation',
      artist: 'FreeMusicForVideo',
      duration: '1:27',
      durationSec: 87,
      url: 'https://cdn.pixabay.com/download/audio/2026/03/05/audio_37d75d2b63.mp3?filename=freemusicforvideo-meditation-495611.mp3',
    },
    {
      id: 'med-2',
      title: 'Peaceful Zen Garden',
      artist: 'Ambient Sounds',
      duration: '3:00',
      durationSec: 180,
      url: 'https://cdn.pixabay.com/download/audio/2022/02/22/audio_d1718ab41b.mp3?filename=please-calm-my-mind-125566.mp3',
    },
    {
      id: 'med-3',
      title: 'Deep Calm',
      artist: 'Relaxation Music',
      duration: '2:30',
      durationSec: 150,
      url: 'https://cdn.pixabay.com/download/audio/2024/11/04/audio_4956b4edd1.mp3?filename=meditation-music-432hz-deep-calm-mind-relaxation-276988.mp3',
    },
  ],
  sleep: [
    {
      id: 'slp-1',
      title: 'Gentle Midday Rain',
      artist: 'DRAGON-STUDIO',
      duration: '0:57',
      durationSec: 57,
      url: 'https://cdn.pixabay.com/download/audio/2026/03/10/audio_feb4530766.mp3?filename=dragon-studio-gentle-midday-rain-499668.mp3',
    },
    {
      id: 'slp-2',
      title: 'Ocean Waves at Night',
      artist: 'Nature Sounds',
      duration: '2:00',
      durationSec: 120,
      url: 'https://cdn.pixabay.com/download/audio/2022/03/24/audio_1c85b2b1e1.mp3?filename=ocean-waves-112906.mp3',
    },
    {
      id: 'slp-3',
      title: 'White Noise',
      artist: 'Sleep Aid',
      duration: '3:00',
      durationSec: 180,
      url: 'https://cdn.pixabay.com/download/audio/2024/02/14/audio_8e8c0db72a.mp3?filename=white-noise-200408.mp3',
    },
  ],
  move: [
    {
      id: 'mov-1',
      title: 'Bouncy Workout',
      artist: 'MomotMusic',
      duration: '1:44',
      durationSec: 104,
      url: 'https://cdn.pixabay.com/download/audio/2023/10/22/audio_135339dfbf.mp3?filename=momotmusic-bouncy-workout-172772.mp3',
    },
    {
      id: 'mov-2',
      title: 'Energy Boost',
      artist: 'Fitness Beats',
      duration: '2:10',
      durationSec: 130,
      url: 'https://cdn.pixabay.com/download/audio/2022/10/25/audio_946bc3e303.mp3?filename=energetic-hip-hop-124775.mp3',
    },
    {
      id: 'mov-3',
      title: 'Power Run',
      artist: 'Workout Mix',
      duration: '1:50',
      durationSec: 110,
      url: 'https://cdn.pixabay.com/download/audio/2023/07/30/audio_e0908e4237.mp3?filename=powerful-beat-121791.mp3',
    },
  ],
  focus: [
    {
      id: 'foc-1',
      title: 'Chill Study Desk',
      artist: 'DesiFreeMusic',
      duration: '2:24',
      durationSec: 144,
      url: 'https://cdn.pixabay.com/download/audio/2025/12/14/audio_de38cecd46.mp3?filename=desifreemusic-chill-study-desk-focus-amp-concentration-lofi-451181.mp3',
    },
    {
      id: 'foc-2',
      title: 'Lo-fi Beats',
      artist: 'Study Music',
      duration: '2:00',
      durationSec: 120,
      url: 'https://cdn.pixabay.com/download/audio/2023/07/19/audio_d16137e570.mp3?filename=lofi-study-112191.mp3',
    },
    {
      id: 'foc-3',
      title: 'Deep Focus',
      artist: 'Concentration',
      duration: '3:00',
      durationSec: 180,
      url: 'https://cdn.pixabay.com/download/audio/2024/09/10/audio_6e5d7d1bab.mp3?filename=deep-meditation-192828.mp3',
    },
  ],
};

const CATEGORY_META: Record<WellnessCategory, { label: string; color: string; description: string }> = {
  meditate: { label: 'Meditate', color: '#FF8C42', description: 'Guided meditation and calming music to center your mind.' },
  sleep:    { label: 'Sleep',    color: '#B07FD0', description: 'Ambient sounds and white noise for restful sleep.' },
  move:     { label: 'Move',     color: '#22C55E', description: 'High-energy tracks to power your workout.' },
  focus:    { label: 'Focus',    color: '#3B82F6', description: 'Lo-fi beats and ambient music for deep concentration.' },
};

function favKey(category: WellnessCategory) {
  return `wellness_favorites_${category}`;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function WellnessAudioScreen() {
  const { category } = useLocalSearchParams<{ category: string }>();
  const cat = (category || 'meditate') as WellnessCategory;
  const meta = CATEGORY_META[cat] || CATEGORY_META.meditate;
  const tracks = AUDIO_CATALOG[cat] || AUDIO_CATALOG.meditate;

  const router = useRouter();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === 'web' ? Math.max(insets.top, 50) : insets.top;

  // ── Tab state ────────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<TabKey>('explore');

  // ── Favorites state ──────────────────────────────────────────────────────────
  const [favoriteIds, setFavoriteIds] = useState<string[]>([]);

  useEffect(() => {
    AsyncStorage.getItem(favKey(cat)).then((raw) => {
      if (raw) {
        try { setFavoriteIds(JSON.parse(raw)); } catch {}
      }
    });
  }, [cat]);

  const toggleFavorite = useCallback(async (trackId: string) => {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setFavoriteIds((prev) => {
      const next = prev.includes(trackId)
        ? prev.filter((id) => id !== trackId)
        : [...prev, trackId];
      AsyncStorage.setItem(favKey(cat), JSON.stringify(next));
      return next;
    });
  }, [cat]);

  // ── Audio playback ───────────────────────────────────────────────────────────
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const playerRef = useRef<ReturnType<typeof createAudioPlayer> | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useKeepAwake();

  useEffect(() => {
    setAudioModeAsync({ playsInSilentMode: true });
  }, []);

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (playerRef.current) { try { playerRef.current.remove(); } catch {} }
    };
  }, []);

  const stopCurrent = useCallback(() => {
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
    if (playerRef.current) {
      try { playerRef.current.pause(); } catch {}
      try { playerRef.current.remove(); } catch {}
      playerRef.current = null;
    }
    setPlayingId(null);
    setProgress(0);
    setCurrentTime(0);
  }, []);

  const handlePlay = useCallback(async (track: AudioTrack) => {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (playingId === track.id && playerRef.current) { stopCurrent(); return; }
    stopCurrent();
    setIsLoading(true);
    setPlayingId(track.id);
    try {
      const player = createAudioPlayer({ uri: track.url });
      playerRef.current = player;
      player.play();
      setIsLoading(false);
      intervalRef.current = setInterval(() => {
        try {
          const ct = player.currentTime || 0;
          const dur = player.duration || track.durationSec;
          setCurrentTime(ct);
          if (dur > 0) setProgress(ct / dur);
          if (dur > 0 && ct >= dur - 0.5) stopCurrent();
        } catch {}
      }, 500);
    } catch {
      setIsLoading(false);
      stopCurrent();
    }
  }, [playingId, stopCurrent]);

  function formatTime(sec: number): string {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  // ── Derived lists ─────────────────────────────────────────────────────────────
  // Explore: pinned first-favorite at top, then remaining tracks
  const pinnedId = favoriteIds[0] ?? null;
  const exploreList: (AudioTrack & { pinned?: boolean })[] = pinnedId
    ? [
        { ...tracks.find((t) => t.id === pinnedId)!, pinned: true },
        ...tracks.filter((t) => t.id !== pinnedId),
      ]
    : tracks;

  const favoritesList = favoriteIds
    .map((id) => tracks.find((t) => t.id === id))
    .filter(Boolean) as AudioTrack[];

  // ── Track row renderer ────────────────────────────────────────────────────────
  const renderTrack = useCallback(({ item }: { item: AudioTrack & { pinned?: boolean } }) => {
    const isPlaying = playingId === item.id;
    const isThisLoading = isPlaying && isLoading;
    const isFav = favoriteIds.includes(item.id);

    return (
      <View>
        {item.pinned && (
          <View style={styles.pinnedBadgeRow}>
            <Text style={[styles.pinnedBadge, { color: meta.color }]}>⭐ Pinned Favorite</Text>
          </View>
        )}
        <Pressable
          onPress={() => handlePlay(item)}
          style={({ pressed }) => [
            styles.trackCard,
            {
              backgroundColor: isPlaying
                ? meta.color + '18'
                : item.pinned
                ? meta.color + '10'
                : colors.surface,
              borderColor: item.pinned ? meta.color + '55' : isPlaying ? meta.color + '55' : colors.border,
              opacity: pressed ? 0.85 : 1,
              transform: [{ scale: pressed ? 0.98 : 1 }],
            },
          ]}
        >
          {/* Play/Pause */}
          <View style={[styles.playBtn, { backgroundColor: isPlaying ? meta.color : meta.color + '22' }]}>
            {isThisLoading ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <IconSymbol
                name={isPlaying ? 'pause.fill' : 'play.fill'}
                size={20}
                color={isPlaying ? '#fff' : meta.color}
              />
            )}
          </View>

          {/* Track info */}
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={[styles.trackTitle, { color: colors.foreground }]} numberOfLines={1}>
              {item.title}
            </Text>
            <Text style={[styles.trackArtist, { color: colors.muted }]} numberOfLines={1}>
              {item.artist}
            </Text>
            {isPlaying && (
              <View style={styles.progressRow}>
                <View style={[styles.progressBar, { backgroundColor: colors.border }]}>
                  <View style={[styles.progressFill, { width: `${progress * 100}%`, backgroundColor: meta.color }]} />
                </View>
                <Text style={[styles.timeText, { color: colors.muted }]}>{formatTime(currentTime)}</Text>
              </View>
            )}
          </View>

          {/* Duration / heart */}
          <View style={styles.rightCol}>
            {!isPlaying && (
              <Text style={[styles.durationText, { color: colors.muted }]}>{item.duration}</Text>
            )}
            <Pressable
              onPress={() => toggleFavorite(item.id)}
              style={({ pressed }) => [styles.heartBtn, { opacity: pressed ? 0.6 : 1 }]}
              hitSlop={8}
            >
              <Text style={{ fontSize: 18, color: isFav ? '#FF3B6B' : colors.muted }}>
                {isFav ? '♥' : '♡'}
              </Text>
            </Pressable>
          </View>
        </Pressable>
      </View>
    );
  }, [playingId, isLoading, progress, currentTime, colors, meta, favoriteIds, handlePlay, toggleFavorite]);

  // ── Empty favorites state ─────────────────────────────────────────────────────
  const EmptyFavorites = () => (
    <View style={styles.emptyWrap}>
      <Text style={[styles.emptyIcon]}>♡</Text>
      <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No favorites yet</Text>
      <Text style={[styles.emptyDesc, { color: colors.muted }]}>
        Tap the heart on any track in Explore to save it here.
      </Text>
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: topPad + 8 }]}>
        <Pressable
          onPress={() => { stopCurrent(); router.back(); }}
          style={({ pressed }) => [styles.backBtn, { opacity: pressed ? 0.6 : 1 }]}
        >
          <IconSymbol name="chevron.left" size={24} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>{meta.label}</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Category hero */}
      <View style={[styles.hero, { backgroundColor: meta.color + '12' }]}>
        <WellnessIcon category={cat} size={56} color={meta.color} />
        <Text style={[styles.heroTitle, { color: colors.foreground }]}>{meta.label}</Text>
        <Text style={[styles.heroDesc, { color: colors.muted }]}>{meta.description}</Text>
      </View>

      {/* Pill tab switcher */}
      <View style={[styles.pillWrap, { backgroundColor: colors.surface }]}>
        {(['explore', 'favorites'] as TabKey[]).map((tab) => {
          const active = activeTab === tab;
          return (
            <Pressable
              key={tab}
              onPress={() => {
                if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setActiveTab(tab);
              }}
              style={[
                styles.pillTab,
                active && { backgroundColor: meta.color },
              ]}
            >
              <Text
                style={[
                  styles.pillLabel,
                  { color: active ? '#fff' : colors.muted },
                ]}
              >
                {tab === 'explore' ? 'Explore' : `Favorites${favoriteIds.length > 0 ? ` (${favoriteIds.length})` : ''}`}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* Track list */}
      {activeTab === 'explore' ? (
        <FlatList
          data={exploreList}
          keyExtractor={(item) => item.id}
          renderItem={renderTrack}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          ListFooterComponent={<View style={{ height: insets.bottom + 20 }} />}
        />
      ) : favoritesList.length === 0 ? (
        <EmptyFavorites />
      ) : (
        <FlatList
          data={favoritesList}
          keyExtractor={(item) => item.id}
          renderItem={renderTrack}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          ListFooterComponent={<View style={{ height: insets.bottom + 20 }} />}
        />
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '700', textAlign: 'center' },
  hero: {
    marginHorizontal: 16,
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    marginBottom: 12,
  },
  heroTitle: { fontSize: 22, fontWeight: '800', marginBottom: 4, marginTop: 10 },
  heroDesc: { fontSize: 14, textAlign: 'center', lineHeight: 20 },

  // Pill tabs
  pillWrap: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginBottom: 14,
    borderRadius: 50,
    padding: 4,
  },
  pillTab: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillLabel: { fontSize: 14, fontWeight: '600' },

  // Pinned badge
  pinnedBadgeRow: { paddingHorizontal: 4, marginBottom: 4 },
  pinnedBadge: { fontSize: 12, fontWeight: '600' },

  // Track cards
  listContent: { paddingHorizontal: 16 },
  trackCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 10,
  },
  playBtn: {
    width: 44, height: 44, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center',
  },
  trackTitle: { fontSize: 16, fontWeight: '600' },
  trackArtist: { fontSize: 13, marginTop: 2 },
  progressRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8, gap: 8 },
  progressBar: { flex: 1, height: 4, borderRadius: 2, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 2 },
  timeText: { fontSize: 11, fontVariant: ['tabular-nums'], width: 36 },
  rightCol: { alignItems: 'flex-end', gap: 4, marginLeft: 8 },
  durationText: { fontSize: 13, fontVariant: ['tabular-nums'] },
  heartBtn: { padding: 4 },

  // Empty favorites
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  emptyTitle: { fontSize: 18, fontWeight: '700', marginBottom: 8, textAlign: 'center' },
  emptyDesc: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
});
