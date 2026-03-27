/**
 * AlarmMeditationScreen — Post-journal meditation duration picker
 *
 * Shown after the alarm journal entry.
 * Lets the user confirm or adjust the meditation duration, then launches practice-player.
 *
 * Params:
 *   meditationId       — 'priming' | 'meditation' | 'breathwork' | 'visualization'
 *   practiceDuration   — default duration in minutes from alarm settings
 */

import { useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { trpc } from '@/lib/trpc';
import { useApp } from '@/lib/app-context';

const PRACTICE_META: Record<string, { emoji: string; label: string; description: string }> = {
  priming:       { emoji: '⚡', label: 'Morning Priming',    description: 'Gratitude · Goals · Visualization' },
  meditation:    { emoji: '🧘', label: 'Guided Meditation',  description: 'Mindful awareness & calm' },
  breathwork:    { emoji: '💨', label: 'Breathwork',         description: 'Box breathing 4-4-4-4' },
  visualization: { emoji: '🎯', label: 'Visualization',      description: 'See your goals achieved' },
};

const DURATION_OPTIONS = [5, 10, 15, 20];

const PRIMING_5MIN_URL = "https://files.manuscdn.com/user_upload_by_module/session_file/310519663287248938/lYxzlZcwkYrgInjh.mp3";

export default function AlarmMeditationScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ meditationId?: string; practiceDuration?: string }>();
  const { alarm } = useApp();

  const meditationId = params.meditationId ?? 'priming';
  const defaultDuration = parseInt(params.practiceDuration ?? '10', 10);

  const [selectedDuration, setSelectedDuration] = useState(
    DURATION_OPTIONS.includes(defaultDuration) ? defaultDuration : 10
  );
  const [generating, setGenerating] = useState(false);

  const meta = PRACTICE_META[meditationId] ?? PRACTICE_META.priming;
  const generatePracticeMutation = trpc.morningPractice.generate.useMutation();

  function haptic() {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }

  function handleSkip() {
    haptic();
    router.replace('/(tabs)' as never);
  }

  async function handleStart() {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    // Shortcut: Priming 5-min uses pre-recorded MP3
    if (meditationId === 'priming' && selectedDuration === 5) {
      router.replace({
        pathname: '/practice-player',
        params: {
          type: 'priming',
          chunkUrls: JSON.stringify([PRIMING_5MIN_URL]),
          pausesBetweenChunks: JSON.stringify([0]),
          totalDurationMinutes: '5',
          breathworkStyle: 'box',
        },
      } as never);
      return;
    }

    setGenerating(true);
    try {
      const result = await generatePracticeMutation.mutateAsync({
        type: meditationId as 'priming' | 'meditation' | 'breathwork' | 'visualization',
        voiceId: alarm.elevenLabsVoice ?? '21m00Tcm4TlvDq8ikWAM',
        lengthMinutes: selectedDuration,
        name: 'Friend',
        goals: [],
        rewards: [],
        habits: [],
        gratitudes: [],
      });
      router.replace({
        pathname: '/practice-player',
        params: {
          type: meditationId,
          chunkUrls: JSON.stringify(result.chunkUrls),
          pausesBetweenChunks: JSON.stringify(result.pausesBetweenChunks ?? []),
          totalDurationMinutes: String(selectedDuration),
          breathworkStyle: 'box',
        },
      } as never);
    } catch (e) {
      console.warn('[AlarmMeditation] Generate error:', e);
      setGenerating(false);
    }
  }

  return (
    <View style={styles.container}>
      <View style={[styles.inner, { paddingTop: insets.top + 32, paddingBottom: insets.bottom + 32 }]}>

        {/* Practice type header */}
        <View style={styles.headerBlock}>
          <Text style={styles.practiceEmoji}>{meta.emoji}</Text>
          <Text style={styles.practiceLabel}>{meta.label}</Text>
          <Text style={styles.practiceDesc}>{meta.description}</Text>
        </View>

        {/* Duration picker */}
        <View style={styles.durationBlock}>
          <Text style={styles.durationTitle}>Choose duration</Text>
          <View style={styles.durationRow}>
            {DURATION_OPTIONS.map((min) => {
              const isSelected = selectedDuration === min;
              return (
                <Pressable
                  key={min}
                  style={({ pressed }) => [
                    styles.durationChip,
                    isSelected && styles.durationChipSelected,
                    pressed && { opacity: 0.7 },
                  ]}
                  onPress={() => { haptic(); setSelectedDuration(min); }}
                >
                  <Text style={[styles.durationChipText, isSelected && styles.durationChipTextSelected]}>
                    {min} min
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* Buttons */}
        <View style={styles.btnGroup}>
          <Pressable
            style={({ pressed }) => [styles.startBtn, pressed && { opacity: 0.85, transform: [{ scale: 0.97 }] }, generating && styles.disabledBtn]}
            onPress={handleStart}
            disabled={generating}
          >
            {generating ? (
              <View style={styles.loadingRow}>
                <ActivityIndicator color="#fff" size="small" />
                <Text style={styles.startBtnText}>  Preparing...</Text>
              </View>
            ) : (
              <Text style={styles.startBtnText}>Start {selectedDuration}-min {meta.label}</Text>
            )}
          </Pressable>

          <Pressable
            style={({ pressed }) => [styles.skipBtn, pressed && { opacity: 0.5 }]}
            onPress={handleSkip}
          >
            <Text style={styles.skipBtnText}>Skip meditation</Text>
          </Pressable>
        </View>

      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0d0d1f',
  },
  inner: {
    flex: 1,
    paddingHorizontal: 28,
    justifyContent: 'space-between',
  },
  headerBlock: {
    alignItems: 'center',
    gap: 8,
    marginTop: 24,
  },
  practiceEmoji: {
    fontSize: 64,
    marginBottom: 8,
  },
  practiceLabel: {
    fontSize: 28,
    fontWeight: '700',
    color: '#ffffff',
    textAlign: 'center',
  },
  practiceDesc: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.5)',
    textAlign: 'center',
  },
  durationBlock: {
    alignItems: 'center',
    gap: 16,
  },
  durationTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.4)',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  durationRow: {
    flexDirection: 'row',
    gap: 12,
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  durationChip: {
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 50,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.2)',
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  durationChipSelected: {
    borderColor: '#3B82F6',
    backgroundColor: 'rgba(59,130,246,0.18)',
  },
  durationChipText: {
    fontSize: 16,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.6)',
  },
  durationChipTextSelected: {
    color: '#60A5FA',
  },
  btnGroup: {
    gap: 14,
    alignItems: 'center',
  },
  startBtn: {
    width: '100%',
    backgroundColor: '#3B82F6',
    borderRadius: 18,
    paddingVertical: 20,
    alignItems: 'center',
    shadowColor: '#3B82F6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.45,
    shadowRadius: 14,
    elevation: 8,
  },
  startBtnText: {
    fontSize: 17,
    fontWeight: '700',
    color: '#ffffff',
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  skipBtn: {
    paddingVertical: 12,
  },
  skipBtnText: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.35)',
    fontWeight: '500',
  },
  disabledBtn: {
    opacity: 0.6,
  },
});
