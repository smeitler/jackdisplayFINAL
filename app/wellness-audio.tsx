/**
 * WellnessAudio Screen — 4-Layer UX
 *
 * Layer 1: Contextual header strip (time-based cue)
 * Layer 2: Recommended cards — horizontal swipeable, 1 short + 1 medium + 1 long
 * Layer 3: Quick Actions — pill buttons, outcome-based, tap = immediate play
 * Layer 4: Explore library — subcategory rows with horizontal scroll
 *
 * Pill tabs: Explore (default) | Favorites
 * Full-screen player modal on any track tap.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  FlatList,
  ScrollView,
  Platform,
  ActivityIndicator,
  Modal,
  Dimensions,
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
  /** e.g. "3:00" */
  duration: string;
  durationSec: number;
  /** Outcome label shown on recommended cards, e.g. "Calm anxiety fast" */
  outcome?: string;
  url: string;
  subcategory?: string;
}

interface QuickAction {
  id: string;
  label: string;
  trackId: string;
}

interface Subcategory {
  id: string;
  title: string;
  trackIds: string[];
}

interface CategoryConfig {
  label: string;
  color: string;
  description: string;
  tracks: AudioTrack[];
  /** IDs for the 3 recommended cards: [short, medium, long] */
  recommended: [string, string, string];
  quickActions: QuickAction[];
  subcategories: Subcategory[];
}

// ─── Audio Catalog ────────────────────────────────────────────────────────────

const CATALOG: Record<WellnessCategory, CategoryConfig> = {
  meditate: {
    label: 'Meditate',
    color: '#FF8C42',
    description: 'Guided meditation and calming music to center your mind.',
    tracks: [
      { id: 'med-1', title: 'Meditation', artist: 'FreeMusicForVideo', duration: '1:27', durationSec: 87,
        outcome: 'Quick 1-min reset', subcategory: 'Beginners',
        url: 'https://cdn.pixabay.com/download/audio/2026/03/05/audio_37d75d2b63.mp3?filename=freemusicforvideo-meditation-495611.mp3' },
      { id: 'med-2', title: 'Peaceful Zen Garden', artist: 'Ambient Sounds', duration: '3:00', durationSec: 180,
        outcome: 'Stop overthinking', subcategory: 'Stress & Anxiety',
        url: 'https://cdn.pixabay.com/download/audio/2022/02/22/audio_d1718ab41b.mp3?filename=please-calm-my-mind-125566.mp3' },
      { id: 'med-3', title: 'Deep Calm', artist: 'Relaxation Music', duration: '2:30', durationSec: 150,
        outcome: 'Clear mental fog', subcategory: 'Focus & Clarity',
        url: 'https://cdn.pixabay.com/download/audio/2024/11/04/audio_4956b4edd1.mp3?filename=meditation-music-432hz-deep-calm-mind-relaxation-276988.mp3' },
      { id: 'med-4', title: 'Morning Mindset', artist: 'Mindful Start', duration: '5:00', durationSec: 300,
        outcome: 'Start your day right', subcategory: 'Energy & Mood',
        url: 'https://cdn.pixabay.com/download/audio/2022/02/22/audio_d1718ab41b.mp3?filename=please-calm-my-mind-125566.mp3' },
      { id: 'med-5', title: 'Anxiety Release', artist: 'Calm Mind', duration: '8:00', durationSec: 480,
        outcome: 'Calm anxiety fast', subcategory: 'Stress & Anxiety',
        url: 'https://cdn.pixabay.com/download/audio/2024/11/04/audio_4956b4edd1.mp3?filename=meditation-music-432hz-deep-calm-mind-relaxation-276988.mp3' },
      { id: 'med-6', title: 'Body Scan', artist: 'Deep Rest', duration: '15:00', durationSec: 900,
        outcome: 'Full body relaxation', subcategory: 'Sleep Prep',
        url: 'https://cdn.pixabay.com/download/audio/2022/02/22/audio_d1718ab41b.mp3?filename=please-calm-my-mind-125566.mp3' },
      { id: 'med-7', title: 'Confidence Builder', artist: 'Inner Power', duration: '6:00', durationSec: 360,
        outcome: 'Build confidence', subcategory: 'Energy & Mood',
        url: 'https://cdn.pixabay.com/download/audio/2026/03/05/audio_37d75d2b63.mp3?filename=freemusicforvideo-meditation-495611.mp3' },
      { id: 'med-8', title: 'Anger Cooldown', artist: 'Emotional Balance', duration: '4:00', durationSec: 240,
        outcome: 'Release anger', subcategory: 'Emotional Regulation',
        url: 'https://cdn.pixabay.com/download/audio/2024/11/04/audio_4956b4edd1.mp3?filename=meditation-music-432hz-deep-calm-mind-relaxation-276988.mp3' },
    ],
    recommended: ['med-1', 'med-5', 'med-6'],
    quickActions: [
      { id: 'qa-med-1', label: '1-min reset', trackId: 'med-1' },
      { id: 'qa-med-2', label: 'Calm anxiety fast', trackId: 'med-5' },
      { id: 'qa-med-3', label: 'Body scan', trackId: 'med-6' },
      { id: 'qa-med-4', label: 'Stop overthinking', trackId: 'med-2' },
    ],
    subcategories: [
      { id: 'sc-med-1', title: 'Stress & Anxiety', trackIds: ['med-2', 'med-5'] },
      { id: 'sc-med-2', title: 'Focus & Clarity', trackIds: ['med-3', 'med-4'] },
      { id: 'sc-med-3', title: 'Sleep Prep', trackIds: ['med-6'] },
      { id: 'sc-med-4', title: 'Emotional Regulation', trackIds: ['med-7', 'med-8'] },
      { id: 'sc-med-5', title: 'Beginners', trackIds: ['med-1', 'med-2'] },
    ],
  },

  sleep: {
    label: 'Sleep',
    color: '#B07FD0',
    description: 'Ambient sounds and white noise for restful sleep.',
    tracks: [
      { id: 'slp-1', title: 'Gentle Midday Rain', artist: 'DRAGON-STUDIO', duration: '0:57', durationSec: 57,
        outcome: 'Drift off fast', subcategory: 'Soundscapes',
        url: 'https://cdn.pixabay.com/download/audio/2026/03/10/audio_feb4530766.mp3?filename=dragon-studio-gentle-midday-rain-499668.mp3' },
      { id: 'slp-2', title: 'Ocean Waves at Night', artist: 'Nature Sounds', duration: '2:00', durationSec: 120,
        outcome: 'Deep relaxation', subcategory: 'Soundscapes',
        url: 'https://cdn.pixabay.com/download/audio/2022/03/24/audio_1c85b2b1e1.mp3?filename=ocean-waves-112906.mp3' },
      { id: 'slp-3', title: 'White Noise', artist: 'Sleep Aid', duration: '3:00', durationSec: 180,
        outcome: 'Block distractions', subcategory: 'Soundscapes',
        url: 'https://cdn.pixabay.com/download/audio/2024/02/14/audio_8e8c0db72a.mp3?filename=white-noise-200408.mp3' },
      { id: 'slp-4', title: 'Fall Asleep Fast', artist: 'Guided Sleep', duration: '8:00', durationSec: 480,
        outcome: 'Fall asleep in 8 min', subcategory: 'Fall Asleep',
        url: 'https://cdn.pixabay.com/download/audio/2022/02/22/audio_d1718ab41b.mp3?filename=please-calm-my-mind-125566.mp3' },
      { id: 'slp-5', title: 'Back to Sleep', artist: 'Night Reset', duration: '5:00', durationSec: 300,
        outcome: 'Back to sleep fast', subcategory: 'Night Wakeups',
        url: 'https://cdn.pixabay.com/download/audio/2024/11/04/audio_4956b4edd1.mp3?filename=meditation-music-432hz-deep-calm-mind-relaxation-276988.mp3' },
      { id: 'slp-6', title: 'Yoga Nidra', artist: 'Deep Rest', duration: '20:00', durationSec: 1200,
        outcome: 'Nervous system reset', subcategory: 'Deep Relaxation',
        url: 'https://cdn.pixabay.com/download/audio/2026/03/10/audio_feb4530766.mp3?filename=dragon-studio-gentle-midday-rain-499668.mp3' },
      { id: 'slp-7', title: 'Evening Wind Down', artist: 'Night Ritual', duration: '10:00', durationSec: 600,
        outcome: 'Transition to sleep', subcategory: 'Wind Down',
        url: 'https://cdn.pixabay.com/download/audio/2022/03/24/audio_1c85b2b1e1.mp3?filename=ocean-waves-112906.mp3' },
      { id: 'slp-8', title: 'Forest Night', artist: 'Nature Sounds', duration: '3:00', durationSec: 180,
        outcome: 'Peaceful nature escape', subcategory: 'Soundscapes',
        url: 'https://cdn.pixabay.com/download/audio/2024/02/14/audio_8e8c0db72a.mp3?filename=white-noise-200408.mp3' },
    ],
    recommended: ['slp-1', 'slp-7', 'slp-6'],
    quickActions: [
      { id: 'qa-slp-1', label: "Can't sleep", trackId: 'slp-4' },
      { id: 'qa-slp-2', label: 'Back to sleep', trackId: 'slp-5' },
      { id: 'qa-slp-3', label: 'Rain sounds', trackId: 'slp-1' },
      { id: 'qa-slp-4', label: 'Turn brain off', trackId: 'slp-7' },
    ],
    subcategories: [
      { id: 'sc-slp-1', title: 'Fall Asleep', trackIds: ['slp-4', 'slp-1'] },
      { id: 'sc-slp-2', title: 'Night Wakeups', trackIds: ['slp-5', 'slp-3'] },
      { id: 'sc-slp-3', title: 'Soundscapes', trackIds: ['slp-1', 'slp-2', 'slp-3', 'slp-8'] },
      { id: 'sc-slp-4', title: 'Wind Down', trackIds: ['slp-7', 'slp-5'] },
      { id: 'sc-slp-5', title: 'Deep Relaxation', trackIds: ['slp-6', 'slp-4'] },
    ],
  },

  move: {
    label: 'Move',
    color: '#22C55E',
    description: 'High-energy tracks to power your workout.',
    tracks: [
      { id: 'mov-1', title: 'Bouncy Workout', artist: 'MomotMusic', duration: '1:44', durationSec: 104,
        outcome: 'Wake up body', subcategory: 'Quick Movement',
        url: 'https://cdn.pixabay.com/download/audio/2023/10/22/audio_135339dfbf.mp3?filename=momotmusic-bouncy-workout-172772.mp3' },
      { id: 'mov-2', title: 'Energy Boost', artist: 'Fitness Beats', duration: '2:10', durationSec: 130,
        outcome: 'Beat the slump', subcategory: 'Energy Boost',
        url: 'https://cdn.pixabay.com/download/audio/2022/10/25/audio_946bc3e303.mp3?filename=energetic-hip-hop-124775.mp3' },
      { id: 'mov-3', title: 'Power Run', artist: 'Workout Mix', duration: '1:50', durationSec: 110,
        outcome: 'Pre-workout activation', subcategory: 'Energy Boost',
        url: 'https://cdn.pixabay.com/download/audio/2023/07/30/audio_e0908e4237.mp3?filename=powerful-beat-121791.mp3' },
      { id: 'mov-4', title: '3-Min Full Stretch', artist: 'Mobility Coach', duration: '3:00', durationSec: 180,
        outcome: 'Loosen up fast', subcategory: 'Stretching',
        url: 'https://cdn.pixabay.com/download/audio/2023/10/22/audio_135339dfbf.mp3?filename=momotmusic-bouncy-workout-172772.mp3' },
      { id: 'mov-5', title: 'Desk Break Reset', artist: 'Office Wellness', duration: '2:00', durationSec: 120,
        outcome: 'Desk break', subcategory: 'Quick Movement',
        url: 'https://cdn.pixabay.com/download/audio/2022/10/25/audio_946bc3e303.mp3?filename=energetic-hip-hop-124775.mp3' },
      { id: 'mov-6', title: 'Recovery Flow', artist: 'Cool Down', duration: '8:00', durationSec: 480,
        outcome: 'Muscle soreness relief', subcategory: 'Recovery',
        url: 'https://cdn.pixabay.com/download/audio/2023/07/30/audio_e0908e4237.mp3?filename=powerful-beat-121791.mp3' },
      { id: 'mov-7', title: 'Neck & Shoulders', artist: 'Mobility Coach', duration: '5:00', durationSec: 300,
        outcome: 'Release neck tension', subcategory: 'Stretching',
        url: 'https://cdn.pixabay.com/download/audio/2023/10/22/audio_135339dfbf.mp3?filename=momotmusic-bouncy-workout-172772.mp3' },
      { id: 'mov-8', title: 'Shake Out Tension', artist: 'Somatic Reset', duration: '4:00', durationSec: 240,
        outcome: 'Release body tension', subcategory: 'Somatic',
        url: 'https://cdn.pixabay.com/download/audio/2022/10/25/audio_946bc3e303.mp3?filename=energetic-hip-hop-124775.mp3' },
    ],
    recommended: ['mov-5', 'mov-4', 'mov-6'],
    quickActions: [
      { id: 'qa-mov-1', label: '2-min stretch', trackId: 'mov-4' },
      { id: 'qa-mov-2', label: 'Wake up body', trackId: 'mov-1' },
      { id: 'qa-mov-3', label: 'Desk reset', trackId: 'mov-5' },
      { id: 'qa-mov-4', label: 'Shake off fatigue', trackId: 'mov-2' },
    ],
    subcategories: [
      { id: 'sc-mov-1', title: 'Quick Movement', trackIds: ['mov-1', 'mov-5'] },
      { id: 'sc-mov-2', title: 'Stretching', trackIds: ['mov-4', 'mov-7'] },
      { id: 'sc-mov-3', title: 'Energy Boost', trackIds: ['mov-2', 'mov-3'] },
      { id: 'sc-mov-4', title: 'Recovery', trackIds: ['mov-6', 'mov-8'] },
      { id: 'sc-mov-5', title: 'Somatic', trackIds: ['mov-8', 'mov-7'] },
    ],
  },

  focus: {
    label: 'Focus',
    color: '#3B82F6',
    description: 'Lo-fi beats and ambient music for deep concentration.',
    tracks: [
      { id: 'foc-1', title: 'Chill Study Desk', artist: 'DesiFreeMusic', duration: '2:24', durationSec: 144,
        outcome: 'Just start', subcategory: 'Background Audio',
        url: 'https://cdn.pixabay.com/download/audio/2025/12/14/audio_de38cecd46.mp3?filename=desifreemusic-chill-study-desk-focus-amp-concentration-lofi-451181.mp3' },
      { id: 'foc-2', title: 'Lo-fi Beats', artist: 'Study Music', duration: '2:00', durationSec: 120,
        outcome: 'Steady focus flow', subcategory: 'Background Audio',
        url: 'https://cdn.pixabay.com/download/audio/2023/07/19/audio_d16137e570.mp3?filename=lofi-study-112191.mp3' },
      { id: 'foc-3', title: 'Deep Focus', artist: 'Concentration', duration: '3:00', durationSec: 180,
        outcome: 'Block distractions', subcategory: 'Deep Work',
        url: 'https://cdn.pixabay.com/download/audio/2024/09/10/audio_6e5d7d1bab.mp3?filename=deep-meditation-192828.mp3' },
      { id: 'foc-4', title: 'Beat Procrastination', artist: 'Start Now', duration: '5:00', durationSec: 300,
        outcome: 'Overwhelm → action', subcategory: 'Start Work',
        url: 'https://cdn.pixabay.com/download/audio/2025/12/14/audio_de38cecd46.mp3?filename=desifreemusic-chill-study-desk-focus-amp-concentration-lofi-451181.mp3' },
      { id: 'foc-5', title: 'Pomodoro 25', artist: 'Work Timer', duration: '2:00', durationSec: 120,
        outcome: '25-min deep work', subcategory: 'Deep Work',
        url: 'https://cdn.pixabay.com/download/audio/2023/07/19/audio_d16137e570.mp3?filename=lofi-study-112191.mp3' },
      { id: 'foc-6', title: 'ADHD Sprint', artist: 'Short Burst', duration: '8:00', durationSec: 480,
        outcome: 'Stay on track', subcategory: 'ADHD-Friendly',
        url: 'https://cdn.pixabay.com/download/audio/2024/09/10/audio_6e5d7d1bab.mp3?filename=deep-meditation-192828.mp3' },
      { id: 'foc-7', title: '5-Min Reset', artist: 'Cognitive Reset', duration: '5:00', durationSec: 300,
        outcome: 'Re-focus quickly', subcategory: 'Breaks',
        url: 'https://cdn.pixabay.com/download/audio/2025/12/14/audio_de38cecd46.mp3?filename=desifreemusic-chill-study-desk-focus-amp-concentration-lofi-451181.mp3' },
      { id: 'foc-8', title: 'Binaural Focus', artist: 'Brain Waves', duration: '3:00', durationSec: 180,
        outcome: 'Sharpen attention', subcategory: 'Background Audio',
        url: 'https://cdn.pixabay.com/download/audio/2023/07/19/audio_d16137e570.mp3?filename=lofi-study-112191.mp3' },
    ],
    recommended: ['foc-1', 'foc-4', 'foc-5'],
    quickActions: [
      { id: 'qa-foc-1', label: 'Just start', trackId: 'foc-1' },
      { id: 'qa-foc-2', label: 'Beat procrastination', trackId: 'foc-4' },
      { id: 'qa-foc-3', label: '10-min sprint', trackId: 'foc-6' },
      { id: 'qa-foc-4', label: 'Re-focus fast', trackId: 'foc-7' },
    ],
    subcategories: [
      { id: 'sc-foc-1', title: 'Start Work', trackIds: ['foc-1', 'foc-4'] },
      { id: 'sc-foc-2', title: 'Deep Work', trackIds: ['foc-3', 'foc-5'] },
      { id: 'sc-foc-3', title: 'Background Audio', trackIds: ['foc-1', 'foc-2', 'foc-8'] },
      { id: 'sc-foc-4', title: 'ADHD-Friendly', trackIds: ['foc-6', 'foc-7'] },
      { id: 'sc-foc-5', title: 'Breaks', trackIds: ['foc-7', 'foc-2'] },
    ],
  },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function favKey(cat: WellnessCategory) { return `wellness_favorites_${cat}`; }

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function getContextualCue(cat: WellnessCategory): { headline: string; sub: string } {
  const h = new Date().getHours();
  if (cat === 'sleep' || h >= 21 || h < 5) {
    return { headline: 'Wind down', sub: 'Prepare your mind and body for rest.' };
  }
  if (h >= 5 && h < 12) {
    return { headline: 'Start your day', sub: 'Set the tone for a great morning.' };
  }
  if (h >= 12 && h < 17) {
    return { headline: 'Midday reset', sub: 'Recharge and stay sharp.' };
  }
  return { headline: 'Evening wind-down', sub: 'Slow down and recover.' };
}

const { width: SCREEN_W } = Dimensions.get('window');

// ─── Full-Screen Player Modal ─────────────────────────────────────────────────

interface PlayerModalProps {
  visible: boolean;
  track: AudioTrack | null;
  trackIndex: number;
  allTracks: AudioTrack[];
  isPlaying: boolean;
  isLoading: boolean;
  progress: number;
  currentTime: number;
  color: string;
  category: WellnessCategory;
  favoriteIds: string[];
  onClose: () => void;
  onPlayPause: () => void;
  onPrev: () => void;
  onNext: () => void;
  onToggleFavorite: (id: string) => void;
}

function PlayerModal({
  visible, track, trackIndex, allTracks, isPlaying, isLoading, progress, currentTime,
  color, category, favoriteIds, onClose, onPlayPause, onPrev, onNext, onToggleFavorite,
}: PlayerModalProps) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === 'web' ? Math.max(insets.top, 50) : insets.top;
  const botPad = Platform.OS === 'web' ? Math.max(insets.bottom, 20) : insets.bottom;

  if (!track) return null;
  const isFav = favoriteIds.includes(track.id);
  const hasPrev = trackIndex > 0;
  const hasNext = trackIndex < allTracks.length - 1;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" statusBarTranslucent>
      <View style={[pm.container, { backgroundColor: colors.background, paddingTop: topPad + 8, paddingBottom: botPad + 16 }]}>

        {/* Top bar */}
        <View style={pm.topBar}>
          <Pressable onPress={onClose} style={({ pressed }) => [pm.iconBtn, { opacity: pressed ? 0.6 : 1 }]}>
            <IconSymbol name="chevron.down" size={28} color={colors.foreground} />
          </Pressable>
          <Text style={[pm.nowPlaying, { color: colors.muted }]}>Now Playing</Text>
          <Pressable
            onPress={() => { if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); onToggleFavorite(track.id); }}
            style={({ pressed }) => [pm.iconBtn, { opacity: pressed ? 0.6 : 1 }]}
          >
            <Text style={{ fontSize: 26, color: isFav ? '#FF3B6B' : colors.muted }}>{isFav ? '♥' : '♡'}</Text>
          </Pressable>
        </View>

        {/* Artwork */}
        <View style={[pm.artworkWrap, { backgroundColor: color + '18' }]}>
          <WellnessIcon category={category} size={120} color={color} />
        </View>

        {/* Track info */}
        <View style={pm.trackInfo}>
          <Text style={[pm.trackTitle, { color: colors.foreground }]} numberOfLines={1}>{track.title}</Text>
          <Text style={[pm.trackArtist, { color: colors.muted }]} numberOfLines={1}>{track.artist}</Text>
          {track.outcome && (
            <View style={[pm.outcomePill, { backgroundColor: color + '22' }]}>
              <Text style={[pm.outcomeText, { color }]}>{track.outcome}</Text>
            </View>
          )}
        </View>

        {/* Progress */}
        <View style={pm.progressSection}>
          <View style={[pm.progressTrack, { backgroundColor: colors.border }]}>
            <View style={[pm.progressFill, { width: `${Math.min(progress * 100, 100)}%`, backgroundColor: color }]} />
            <View style={[pm.progressThumb, { left: `${Math.min(progress * 100, 100)}%`, backgroundColor: color }]} />
          </View>
          <View style={pm.timeRow}>
            <Text style={[pm.timeLabel, { color: colors.muted }]}>{formatTime(currentTime)}</Text>
            <Text style={[pm.timeLabel, { color: colors.muted }]}>{formatTime(track.durationSec)}</Text>
          </View>
        </View>

        {/* Controls */}
        <View style={pm.controls}>
          <Pressable onPress={() => { if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onPrev(); }}
            style={({ pressed }) => [pm.skipBtn, { opacity: hasPrev ? (pressed ? 0.6 : 1) : 0.3 }]} disabled={!hasPrev}>
            <IconSymbol name="backward.end.fill" size={36} color={colors.foreground} />
          </Pressable>
          <Pressable onPress={() => { if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); onPlayPause(); }}
            style={({ pressed }) => [pm.playPauseBtn, { backgroundColor: color, transform: [{ scale: pressed ? 0.95 : 1 }] }]}>
            {isLoading ? <ActivityIndicator size="large" color="#fff" /> : <IconSymbol name={isPlaying ? 'pause.fill' : 'play.fill'} size={44} color="#fff" />}
          </Pressable>
          <Pressable onPress={() => { if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onNext(); }}
            style={({ pressed }) => [pm.skipBtn, { opacity: hasNext ? (pressed ? 0.6 : 1) : 0.3 }]} disabled={!hasNext}>
            <IconSymbol name="forward.end.fill" size={36} color={colors.foreground} />
          </Pressable>
        </View>

        <Text style={[pm.trackCounter, { color: colors.muted }]}>{trackIndex + 1} of {allTracks.length}</Text>
      </View>
    </Modal>
  );
}

const pm = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', paddingHorizontal: 24 },
  topBar: { width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 },
  iconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  nowPlaying: { fontSize: 14, fontWeight: '600', letterSpacing: 0.5, textTransform: 'uppercase' },
  artworkWrap: {
    width: Math.min(SCREEN_W - 80, 320), height: Math.min(SCREEN_W - 80, 320),
    borderRadius: 28, alignItems: 'center', justifyContent: 'center', marginBottom: 32,
  },
  trackInfo: { width: '100%', alignItems: 'center', marginBottom: 28 },
  trackTitle: { fontSize: 24, fontWeight: '800', textAlign: 'center', marginBottom: 6 },
  trackArtist: { fontSize: 16, textAlign: 'center', marginBottom: 8 },
  outcomePill: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 20 },
  outcomeText: { fontSize: 13, fontWeight: '600' },
  progressSection: { width: '100%', marginBottom: 32 },
  progressTrack: { width: '100%', height: 5, borderRadius: 3, overflow: 'visible', position: 'relative' },
  progressFill: { height: '100%', borderRadius: 3 },
  progressThumb: { position: 'absolute', top: -5, width: 14, height: 14, borderRadius: 7, marginLeft: -7 },
  timeRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 },
  timeLabel: { fontSize: 13, fontVariant: ['tabular-nums'] },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 32, marginBottom: 20 },
  skipBtn: { width: 52, height: 52, alignItems: 'center', justifyContent: 'center' },
  playPauseBtn: {
    width: 80, height: 80, borderRadius: 40, alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 8, elevation: 6,
  },
  trackCounter: { fontSize: 13 },
});

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function WellnessAudioScreen() {
  const { category } = useLocalSearchParams<{ category: string }>();
  const cat = (category || 'meditate') as WellnessCategory;
  const config = CATALOG[cat] || CATALOG.meditate;
  const { label, color, tracks, recommended, quickActions, subcategories } = config;

  const router = useRouter();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === 'web' ? Math.max(insets.top, 50) : insets.top;

  const [activeTab, setActiveTab] = useState<TabKey>('explore');
  const [favoriteIds, setFavoriteIds] = useState<string[]>([]);

  useEffect(() => {
    AsyncStorage.getItem(favKey(cat)).then((raw) => {
      if (raw) { try { setFavoriteIds(JSON.parse(raw)); } catch {} }
    });
  }, [cat]);

  const toggleFavorite = useCallback(async (trackId: string) => {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setFavoriteIds((prev) => {
      const next = prev.includes(trackId) ? prev.filter((id) => id !== trackId) : [...prev, trackId];
      AsyncStorage.setItem(favKey(cat), JSON.stringify(next));
      return next;
    });
  }, [cat]);

  // ── Audio ────────────────────────────────────────────────────────────────────
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const playerRef = useRef<ReturnType<typeof createAudioPlayer> | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [playerVisible, setPlayerVisible] = useState(false);
  const [playerTrackIndex, setPlayerTrackIndex] = useState(0);

  useKeepAwake();

  useEffect(() => { setAudioModeAsync({ playsInSilentMode: true }); }, []);

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
    setPlayingId(null); setProgress(0); setCurrentTime(0);
  }, []);

  const startTrack = useCallback(async (track: AudioTrack) => {
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
    } catch { setIsLoading(false); stopCurrent(); }
  }, [stopCurrent]);

  const openPlayer = useCallback((track: AudioTrack, indexInAll: number) => {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setPlayerTrackIndex(indexInAll);
    setPlayerVisible(true);
    if (playingId !== track.id) startTrack(track);
  }, [playingId, startTrack]);

  const handlePlayPause = useCallback(() => {
    const track = tracks[playerTrackIndex];
    if (!track) return;
    if (playingId === track.id && playerRef.current) {
      try { playerRef.current.pause(); } catch {}
      if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
      setPlayingId(null);
    } else { startTrack(track); }
  }, [tracks, playerTrackIndex, playingId, startTrack]);

  const handlePrev = useCallback(() => {
    if (playerTrackIndex <= 0) return;
    const ni = playerTrackIndex - 1;
    setPlayerTrackIndex(ni);
    startTrack(tracks[ni]);
  }, [playerTrackIndex, tracks, startTrack]);

  const handleNext = useCallback(() => {
    if (playerTrackIndex >= tracks.length - 1) return;
    const ni = playerTrackIndex + 1;
    setPlayerTrackIndex(ni);
    startTrack(tracks[ni]);
  }, [playerTrackIndex, tracks, startTrack]);

  // ── Derived ───────────────────────────────────────────────────────────────────
  const pinnedId = favoriteIds[0] ?? null;
  const favoritesList = favoriteIds.map((id) => tracks.find((t) => t.id === id)).filter(Boolean) as AudioTrack[];
  const recommendedTracks = recommended.map((id) => tracks.find((t) => t.id === id)).filter(Boolean) as AudioTrack[];
  const cue = getContextualCue(cat);

  // ── Track card (compact row) ───────────────────────────────────────────────────
  const TrackRow = useCallback(({ item, indexInAll }: { item: AudioTrack; indexInAll: number }) => {
    const isActive = playingId === item.id;
    const isFav = favoriteIds.includes(item.id);
    return (
      <Pressable
        onPress={() => openPlayer(item, indexInAll)}
        style={({ pressed }) => [
          s.trackCard,
          { backgroundColor: isActive ? color + '18' : colors.surface, borderColor: isActive ? color + '55' : colors.border, opacity: pressed ? 0.85 : 1 },
        ]}
      >
        <View style={[s.playBtn, { backgroundColor: isActive ? color : color + '22' }]}>
          {isActive && isLoading ? <ActivityIndicator size="small" color="#fff" /> :
            isActive ? <IconSymbol name="waveform" size={18} color="#fff" /> :
              <IconSymbol name="play.fill" size={18} color={color} />}
        </View>
        <View style={{ flex: 1, marginLeft: 10 }}>
          <Text style={[s.trackTitle, { color: colors.foreground }]} numberOfLines={1}>{item.title}</Text>
          <Text style={[s.trackArtist, { color: colors.muted }]} numberOfLines={1}>{item.artist}</Text>
        </View>
        <Text style={[s.durationText, { color: colors.muted }]}>{item.duration}</Text>
        <Pressable onPress={() => toggleFavorite(item.id)} style={({ pressed }) => [s.heartBtn, { opacity: pressed ? 0.6 : 1 }]} hitSlop={8}>
          <Text style={{ fontSize: 16, color: isFav ? '#FF3B6B' : colors.muted }}>{isFav ? '♥' : '♡'}</Text>
        </Pressable>
      </Pressable>
    );
  }, [playingId, isLoading, colors, color, favoriteIds, openPlayer, toggleFavorite]);

  // ── Explore content ───────────────────────────────────────────────────────────
  const ExploreContent = () => (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}>

      {/* Layer 1: Contextual cue */}
      <View style={[s.cueStrip, { backgroundColor: color + '15' }]}>
        <Text style={[s.cueHeadline, { color }]}>{cue.headline}</Text>
        <Text style={[s.cueSub, { color: colors.muted }]}>{cue.sub}</Text>
      </View>

      {/* Pinned Favorite — shown above Recommended when set */}
      {pinnedId && (() => {
        const t = tracks.find((x) => x.id === pinnedId);
        if (!t) return null;
        const idx = tracks.findIndex((x) => x.id === pinnedId);
        return (
          <View style={s.subSection}>
            <Text style={[s.subTitle, { color: colors.foreground }]}>⭐ Pinned Favorite</Text>
            <TrackRow item={t} indexInAll={idx} />
          </View>
        );
      })()}

      {/* Layer 2: Recommended */}
      <View style={s.sectionHeader}>
        <Text style={[s.sectionTitle, { color: colors.foreground }]}>Recommended</Text>
        <Text style={[s.sectionSub, { color: colors.muted }]}>Short · Medium · Long</Text>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.recRow}>
        {recommendedTracks.map((track) => {
          const idx = tracks.findIndex((t) => t.id === track.id);
          const isActive = playingId === track.id;
          return (
            <Pressable
              key={track.id}
              onPress={() => openPlayer(track, idx)}
              style={({ pressed }) => [
                s.recCard,
                { backgroundColor: isActive ? color + '25' : colors.surface, borderColor: isActive ? color : colors.border, transform: [{ scale: pressed ? 0.97 : 1 }] },
              ]}
            >
              <View style={[s.recIcon, { backgroundColor: color + '20' }]}>
                {isActive ? <IconSymbol name="waveform" size={22} color={color} /> : <IconSymbol name="play.fill" size={22} color={color} />}
              </View>
              <Text style={[s.recTitle, { color: colors.foreground }]} numberOfLines={2}>{track.title}</Text>
              {track.outcome && <Text style={[s.recOutcome, { color }]} numberOfLines={1}>{track.outcome}</Text>}
              <Text style={[s.recDuration, { color: colors.muted }]}>{track.duration}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* Layer 3: Quick Actions */}
      <View style={s.sectionHeader}>
        <Text style={[s.sectionTitle, { color: colors.foreground }]}>Quick Actions</Text>
        <Text style={[s.sectionSub, { color: colors.muted }]}>Tap to start immediately</Text>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.qaRow}>
        {quickActions.map((qa) => {
          const track = tracks.find((t) => t.id === qa.trackId);
          if (!track) return null;
          const idx = tracks.findIndex((t) => t.id === qa.trackId);
          const isActive = playingId === qa.trackId;
          return (
            <Pressable
              key={qa.id}
              onPress={() => openPlayer(track, idx)}
              style={({ pressed }) => [
                s.qaPill,
                { backgroundColor: isActive ? color : color + '20', borderColor: color + '55', transform: [{ scale: pressed ? 0.96 : 1 }] },
              ]}
            >
              <Text style={[s.qaLabel, { color: isActive ? '#fff' : color }]}>{qa.label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* Layer 4: Explore subcategories */}
      <View style={[s.sectionHeader, { marginTop: 8 }]}>
        <Text style={[s.sectionTitle, { color: colors.foreground }]}>Explore</Text>
      </View>

      {subcategories.map((sub) => {
        const subTracks = sub.trackIds.map((id) => tracks.find((t) => t.id === id)).filter(Boolean) as AudioTrack[];
        if (subTracks.length === 0) return null;
        return (
          <View key={sub.id} style={s.subSection}>
            <Text style={[s.subTitle, { color: colors.foreground }]}>{sub.title}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.subRow}>
              {subTracks.map((track) => {
                const idx = tracks.findIndex((t) => t.id === track.id);
                const isActive = playingId === track.id;
                const isFav = favoriteIds.includes(track.id);
                return (
                  <Pressable
                    key={track.id}
                    onPress={() => openPlayer(track, idx)}
                    style={({ pressed }) => [
                      s.subCard,
                      { backgroundColor: isActive ? color + '20' : colors.surface, borderColor: isActive ? color + '55' : colors.border, transform: [{ scale: pressed ? 0.97 : 1 }] },
                    ]}
                  >
                    <View style={[s.subPlayBtn, { backgroundColor: isActive ? color : color + '20' }]}>
                      {isActive ? <IconSymbol name="waveform" size={14} color="#fff" /> : <IconSymbol name="play.fill" size={14} color={color} />}
                    </View>
                    <Text style={[s.subCardTitle, { color: colors.foreground }]} numberOfLines={2}>{track.title}</Text>
                    <View style={s.subCardBottom}>
                      <Text style={[s.subCardDur, { color: colors.muted }]}>{track.duration}</Text>
                      <Pressable onPress={() => toggleFavorite(track.id)} hitSlop={6}>
                        <Text style={{ fontSize: 13, color: isFav ? '#FF3B6B' : colors.muted }}>{isFav ? '♥' : '♡'}</Text>
                      </Pressable>
                    </View>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        );
      })}


    </ScrollView>
  );

  // ── Favorites tab ─────────────────────────────────────────────────────────────
  const FavoritesContent = () =>
    favoritesList.length === 0 ? (
      <View style={s.emptyWrap}>
        <Text style={s.emptyIcon}>♡</Text>
        <Text style={[s.emptyTitle, { color: colors.foreground }]}>No favorites yet</Text>
        <Text style={[s.emptyDesc, { color: colors.muted }]}>Tap the heart on any track to save it here.</Text>
      </View>
    ) : (
      <FlatList
        data={favoritesList}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => {
          const idx = tracks.findIndex((t) => t.id === item.id);
          return <TrackRow item={item} indexInAll={idx} />;
        }}
        contentContainerStyle={[s.listContent, { paddingBottom: insets.bottom + 24 }]}
        showsVerticalScrollIndicator={false}
      />
    );

  return (
    <View style={[s.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[s.header, { paddingTop: topPad + 8 }]}>
        <Pressable onPress={() => { stopCurrent(); router.back(); }} style={({ pressed }) => [s.backBtn, { opacity: pressed ? 0.6 : 1 }]}>
          <IconSymbol name="chevron.left" size={24} color={colors.foreground} />
        </Pressable>
        <Text style={[s.headerTitle, { color: colors.foreground }]}>{label}</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Pill tabs */}
      <View style={[s.pillWrap, { backgroundColor: colors.surface, marginHorizontal: 16, marginBottom: 8 }]}>
        {(['explore', 'favorites'] as TabKey[]).map((tab) => {
          const active = activeTab === tab;
          return (
            <Pressable
              key={tab}
              onPress={() => { if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setActiveTab(tab); }}
              style={[s.pillTab, active && { backgroundColor: color }]}
            >
              <Text style={[s.pillLabel, { color: active ? '#fff' : colors.muted }]}>
                {tab === 'explore' ? 'Explore' : `Favorites${favoriteIds.length > 0 ? ` (${favoriteIds.length})` : ''}`}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {activeTab === 'explore' ? <ExploreContent /> : <FavoritesContent />}

      {/* Full-screen player */}
      <PlayerModal
        visible={playerVisible}
        track={tracks[playerTrackIndex] ?? null}
        trackIndex={playerTrackIndex}
        allTracks={tracks}
        isPlaying={playingId === tracks[playerTrackIndex]?.id}
        isLoading={isLoading && playingId === tracks[playerTrackIndex]?.id}
        progress={playingId === tracks[playerTrackIndex]?.id ? progress : 0}
        currentTime={playingId === tracks[playerTrackIndex]?.id ? currentTime : 0}
        color={color}
        category={cat}
        favoriteIds={favoriteIds}
        onClose={() => setPlayerVisible(false)}
        onPlayPause={handlePlayPause}
        onPrev={handlePrev}
        onNext={handleNext}
        onToggleFavorite={toggleFavorite}
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 8 },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '700' },
  pillWrap: { flexDirection: 'row', borderRadius: 50, padding: 4 },
  pillTab: { flex: 1, paddingVertical: 8, borderRadius: 50, alignItems: 'center', justifyContent: 'center' },
  pillLabel: { fontSize: 14, fontWeight: '600' },
  // Contextual cue
  cueStrip: { marginHorizontal: 16, borderRadius: 14, padding: 14, marginBottom: 16 },
  cueHeadline: { fontSize: 18, fontWeight: '800', marginBottom: 2 },
  cueSub: { fontSize: 13, lineHeight: 18 },
  // Section headers
  sectionHeader: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', paddingHorizontal: 16, marginBottom: 10 },
  sectionTitle: { fontSize: 17, fontWeight: '700' },
  sectionSub: { fontSize: 12 },
  // Recommended cards
  recRow: { paddingHorizontal: 16, gap: 12, paddingBottom: 4 },
  recCard: {
    width: 160, padding: 14, borderRadius: 16, borderWidth: 1,
    marginBottom: 8,
  },
  recIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  recTitle: { fontSize: 14, fontWeight: '700', marginBottom: 4, lineHeight: 18 },
  recOutcome: { fontSize: 12, fontWeight: '600', marginBottom: 6 },
  recDuration: { fontSize: 12 },
  // Quick actions
  qaRow: { paddingHorizontal: 16, gap: 10, paddingBottom: 4 },
  qaPill: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 50, borderWidth: 1 },
  qaLabel: { fontSize: 14, fontWeight: '600' },
  // Subcategory rows
  subSection: { marginBottom: 20 },
  subTitle: { fontSize: 15, fontWeight: '700', paddingHorizontal: 16, marginBottom: 10 },
  subRow: { paddingHorizontal: 16, gap: 10 },
  subCard: { width: 140, padding: 12, borderRadius: 14, borderWidth: 1 },
  subPlayBtn: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  subCardTitle: { fontSize: 13, fontWeight: '600', lineHeight: 17, marginBottom: 8 },
  subCardBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  subCardDur: { fontSize: 12 },
  // Track rows
  listContent: { paddingHorizontal: 16 },
  trackCard: { flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 14, borderWidth: 1, marginBottom: 8 },
  playBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  trackTitle: { fontSize: 15, fontWeight: '600' },
  trackArtist: { fontSize: 12, marginTop: 2 },
  durationText: { fontSize: 12, fontVariant: ['tabular-nums'], marginRight: 8 },
  heartBtn: { padding: 4 },
  // Empty
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  emptyTitle: { fontSize: 18, fontWeight: '700', marginBottom: 8, textAlign: 'center' },
  emptyDesc: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
});
