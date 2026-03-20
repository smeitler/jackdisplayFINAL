/**
 * WellnessAudio Screen
 *
 * Displays audio tracks for a given wellness category (Meditate, Sleep, Move, Focus).
 * Each category has its own curated list of audio tracks from Pixabay (royalty-free).
 * Tapping a track plays it inline with play/pause controls and a progress bar.
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
import { useColors } from '@/hooks/use-colors';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import { useKeepAwake } from 'expo-keep-awake';
import * as Haptics from 'expo-haptics';

// ─── Types ────────────────────────────────────────────────────────────────────

type WellnessCategory = 'meditate' | 'sleep' | 'move' | 'focus';

interface AudioTrack {
  id: string;
  title: string;
  artist: string;
  duration: string; // display string e.g. "1:27"
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

const CATEGORY_META: Record<WellnessCategory, { label: string; emoji: string; color: string; description: string }> = {
  meditate: { label: 'Meditate', emoji: '🟠', color: '#FF8C42', description: 'Guided meditation and calming music to center your mind.' },
  sleep: { label: 'Sleep', emoji: '🌙', color: '#B07FD0', description: 'Ambient sounds and white noise for restful sleep.' },
  move: { label: 'Move', emoji: '⏩', color: '#22C55E', description: 'High-energy tracks to power your workout.' },
  focus: { label: 'Focus', emoji: '🎵', color: '#3B82F6', description: 'Lo-fi beats and ambient music for deep concentration.' },
};

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

  const [playingId, setPlayingId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState(0); // 0-1
  const [currentTime, setCurrentTime] = useState(0);
  const playerRef = useRef<ReturnType<typeof createAudioPlayer> | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useKeepAwake();

  // Set audio mode for silent mode playback
  useEffect(() => {
    setAudioModeAsync({ playsInSilentMode: true });
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (playerRef.current) {
        try { playerRef.current.remove(); } catch {}
      }
    };
  }, []);

  const stopCurrent = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
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

    // If same track, toggle pause/play
    if (playingId === track.id && playerRef.current) {
      try {
        playerRef.current.pause();
      } catch {}
      stopCurrent();
      return;
    }

    // Stop any current playback
    stopCurrent();

    setIsLoading(true);
    setPlayingId(track.id);

    try {
      const player = createAudioPlayer({ uri: track.url });
      playerRef.current = player;

      // Start playback
      player.play();
      setIsLoading(false);

      // Track progress via polling
      intervalRef.current = setInterval(() => {
        try {
          const ct = player.currentTime || 0;
          const dur = player.duration || track.durationSec;
          setCurrentTime(ct);
          if (dur > 0) {
            setProgress(ct / dur);
          }
          // Auto-stop when done
          if (dur > 0 && ct >= dur - 0.5) {
            stopCurrent();
          }
        } catch {
          // Player may have been removed
        }
      }, 500);
    } catch (e) {
      console.error('Audio playback error:', e);
      setIsLoading(false);
      stopCurrent();
    }
  }, [playingId, stopCurrent]);

  function formatTime(sec: number): string {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  const renderTrack = useCallback(({ item }: { item: AudioTrack }) => {
    const isPlaying = playingId === item.id;
    const isThisLoading = isPlaying && isLoading;

    return (
      <Pressable
        onPress={() => handlePlay(item)}
        style={({ pressed }) => [
          styles.trackCard,
          {
            backgroundColor: isPlaying ? meta.color + '18' : colors.surface,
            borderColor: isPlaying ? meta.color + '55' : colors.border,
            opacity: pressed ? 0.85 : 1,
            transform: [{ scale: pressed ? 0.98 : 1 }],
          },
        ]}
      >
        {/* Play/Pause icon */}
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

          {/* Progress bar (only when playing) */}
          {isPlaying && (
            <View style={styles.progressRow}>
              <View style={[styles.progressBar, { backgroundColor: colors.border }]}>
                <View style={[styles.progressFill, { width: `${progress * 100}%`, backgroundColor: meta.color }]} />
              </View>
              <Text style={[styles.timeText, { color: colors.muted }]}>
                {formatTime(currentTime)}
              </Text>
            </View>
          )}
        </View>

        {/* Duration */}
        {!isPlaying && (
          <Text style={[styles.durationText, { color: colors.muted }]}>{item.duration}</Text>
        )}
      </Pressable>
    );
  }, [playingId, isLoading, progress, currentTime, colors, meta, handlePlay]);

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
        <Text style={styles.heroEmoji}>{meta.emoji}</Text>
        <Text style={[styles.heroTitle, { color: colors.foreground }]}>{meta.label}</Text>
        <Text style={[styles.heroDesc, { color: colors.muted }]}>{meta.description}</Text>
      </View>

      {/* Track list */}
      <FlatList
        data={tracks}
        keyExtractor={(item) => item.id}
        renderItem={renderTrack}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        ListFooterComponent={<View style={{ height: insets.bottom + 20 }} />}
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
  },
  hero: {
    marginHorizontal: 16,
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    marginBottom: 16,
  },
  heroEmoji: {
    fontSize: 40,
    marginBottom: 8,
  },
  heroTitle: {
    fontSize: 22,
    fontWeight: '800',
    marginBottom: 4,
  },
  heroDesc: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  listContent: {
    paddingHorizontal: 16,
  },
  trackCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 10,
  },
  playBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  trackTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  trackArtist: {
    fontSize: 13,
    marginTop: 2,
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    gap: 8,
  },
  progressBar: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
  },
  timeText: {
    fontSize: 11,
    fontVariant: ['tabular-nums'],
    width: 36,
  },
  durationText: {
    fontSize: 13,
    fontVariant: ['tabular-nums'],
    marginLeft: 8,
  },
});
