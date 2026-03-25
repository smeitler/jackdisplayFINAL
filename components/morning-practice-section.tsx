/**
 * MorningPracticeSection
 *
 * Settings section in the More tab that lets the user:
 * 1. Enable/disable morning practice after alarm
 * 2. Pick which practice type (Priming, Meditation, Breathwork, Visualization)
 * 3. Set duration (for Meditation / Visualization)
 * 4. Set breathwork style (for Breathwork)
 * 5. Launch a practice session on demand (generates TTS via server)
 */

import { useState, useCallback } from 'react';
import {
  View,
  Text,
  Pressable,
  Switch,
  StyleSheet,
  Alert,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useColors } from '@/hooks/use-colors';
import { useApp } from '@/lib/app-context';
import { trpc } from '@/lib/trpc';
import * as Haptics from 'expo-haptics';
import {
  loadHabits,
  loadGratitudeEntries,
  yesterdayString,
} from '@/lib/storage';

// ─── Types ────────────────────────────────────────────────────────────────────

type PracticeType = 'priming' | 'meditation' | 'breathwork' | 'visualization';
type BreathworkStyle = 'wim_hof' | 'box' | '4_7_8';
type LengthOption = 5 | 10 | 20;

const PRACTICE_OPTIONS: { id: PracticeType; label: string; emoji: string; description: string }[] = [
  { id: 'priming',       label: 'Priming',            emoji: '⚡', description: 'Tony Robbins-style energy activation (~15 min)' },
  { id: 'meditation',    label: 'Guided Meditation',  emoji: '🧘', description: 'Calm focus and body scan' },
  { id: 'breathwork',    label: 'Breathwork',         emoji: '💨', description: 'Wim Hof, Box, or 4-7-8 breathing' },
  { id: 'visualization', label: 'Visualization',      emoji: '🎯', description: 'Goal and reward visualization' },
];

const LENGTH_OPTIONS: LengthOption[] = [5, 10, 20];

const BREATHWORK_STYLES: { id: BreathworkStyle; label: string; description: string }[] = [
  { id: 'wim_hof', label: 'Wim Hof',    description: '3 rounds of power breathing + retention' },
  { id: 'box',     label: 'Box',        description: '4-4-4-4 count, 8 rounds' },
  { id: '4_7_8',   label: '4-7-8',      description: 'Relaxing breath pattern, 6 rounds' },
];

// ─── Component ────────────────────────────────────────────────────────────────

export function MorningPracticeSection() {
  const colors = useColors();
  const router = useRouter();
  const { alarm, updateAlarm: ctxUpdateAlarm, categories } = useApp();
  const [isExpanded, setIsExpanded] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

  const generateMutation = trpc.morningPractice.generate.useMutation();

  const practiceEnabled = alarm?.morningPracticeEnabled ?? false;
  const practiceType: PracticeType = (alarm?.morningPracticeType as PracticeType) ?? 'priming';
  const practiceLength: LengthOption = (alarm?.morningPracticeLength as LengthOption) ?? 10;
  const breathworkStyle: BreathworkStyle = (alarm?.morningBreathworkStyle as BreathworkStyle) ?? 'wim_hof';

  const showLength = practiceType === 'meditation' || practiceType === 'visualization';
  const showBreathworkStyle = practiceType === 'breathwork';

  // ─── Helpers ────────────────────────────────────────────────────────────────

  async function updateAlarm(patch: Partial<NonNullable<typeof alarm>>) {
    if (!alarm) return;
    const updated = { ...alarm, ...patch };
    await ctxUpdateAlarm(updated);
  }

  async function handleToggleEnabled(val: boolean) {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await updateAlarm({ morningPracticeEnabled: val });
  }

  async function handleSelectType(type: PracticeType) {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await updateAlarm({ morningPracticeType: type });
  }

  async function handleSelectLength(len: LengthOption) {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await updateAlarm({ morningPracticeLength: len });
  }

  async function handleSelectBreathworkStyle(style: BreathworkStyle) {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await updateAlarm({ morningBreathworkStyle: style });
  }

  // ─── Launch practice ────────────────────────────────────────────────────────

  const handleLaunch = useCallback(async () => {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setIsGenerating(true);

    try {
      // Collect personalization data
      const allHabits = await loadHabits();
      const activeHabits = allHabits.filter(h => h.isActive).map(h => h.name).slice(0, 8);
      const goalList = categories.map(c => c.label);
      const rewardList: string[] = []; // rewards aren't loaded in app-context; use empty for now

      // Yesterday's gratitudes
      const gratitudeEntries = await loadGratitudeEntries();
      const yesterday = yesterdayString();
      const yesterdayEntry = gratitudeEntries.find(e => e.date === yesterday);
      const gratitudes = yesterdayEntry?.items ?? [];

      // Voice ID from alarm config
      const voiceKey = alarm?.elevenLabsVoice ?? 'rachel';
      // Map voice key to ElevenLabs voice ID
      const VOICE_IDS: Record<string, string> = {
        rachel: '21m00Tcm4TlvDq8ikWAM',
        aria:   '9BWtsMINqrJLrRacOk9x',
        adam:   'pNInz6obpgDQGcFmaJgB',
        josh:   'TxGEqnHWrfWFTfGW9XjX',
        bella:  'EXAVITQu4vr4xnSDxMaL',
      };
      const voiceId = VOICE_IDS[voiceKey] ?? VOICE_IDS.rachel;

      const result = await generateMutation.mutateAsync({
        type: practiceType,
        voiceId,
        lengthMinutes: showLength ? practiceLength : undefined,
        breathworkStyle: showBreathworkStyle ? breathworkStyle : undefined,
        name: 'Friend', // TODO: pull from user profile when available
        goals: goalList,
        rewards: rewardList,
        habits: activeHabits,
        gratitudes,
      });

      // Navigate to player screen
      router.push({
        pathname: '/practice-player',
        params: {
          type: result.type,
          chunkUrls: JSON.stringify(result.chunkUrls),
          pausesBetweenChunks: JSON.stringify(result.pausesBetweenChunks),
          totalDurationMinutes: String(result.totalDurationMinutes),
          breathworkStyle: breathworkStyle,
        },
      } as never);
    } catch (err: any) {
      Alert.alert(
        'Could not generate session',
        err?.message?.includes('API key')
          ? 'ElevenLabs API key is not configured. Please add it in your account settings.'
          : 'Something went wrong. Please try again.',
      );
    } finally {
      setIsGenerating(false);
    }
  }, [alarm, practiceType, practiceLength, breathworkStyle, categories, generateMutation, router, showLength, showBreathworkStyle]);

  // ─── Render ─────────────────────────────────────────────────────────────────

  const selectedPractice = PRACTICE_OPTIONS.find(p => p.id === practiceType);

  return (
    <View style={[styles.container, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      {/* Header row */}
      <Pressable
        style={styles.header}
        onPress={() => setIsExpanded(v => !v)}
      >
        <View style={[styles.iconBadge, { backgroundColor: '#6366F122' }]}>
          <Text style={styles.iconEmoji}>🌅</Text>
        </View>
        <View style={styles.headerText}>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>Morning Practice</Text>
          <Text style={[styles.headerSub, { color: colors.muted }]}>
            {practiceEnabled
              ? `${selectedPractice?.label ?? 'Priming'} after alarm`
              : 'Tap to configure'}
          </Text>
        </View>
        <Text style={[styles.chevron, { color: colors.muted }]}>{isExpanded ? '▲' : '▼'}</Text>
      </Pressable>

      {isExpanded && (
        <View style={styles.body}>
          {/* Enable toggle */}
          <View style={[styles.row, { borderTopWidth: 1, borderTopColor: colors.border }]}>
            <Text style={[styles.rowLabel, { color: colors.foreground }]}>Auto-launch after alarm</Text>
            <Switch
              value={practiceEnabled}
              onValueChange={handleToggleEnabled}
              trackColor={{ false: colors.border, true: '#6366F1' }}
              thumbColor="#fff"
            />
          </View>

          {/* Practice type picker */}
          <View style={[styles.section, { borderTopWidth: 1, borderTopColor: colors.border }]}>
            <Text style={[styles.sectionLabel, { color: colors.muted }]}>PRACTICE TYPE</Text>
            {PRACTICE_OPTIONS.map(opt => (
              <Pressable
                key={opt.id}
                style={({ pressed }) => [
                  styles.optionRow,
                  { backgroundColor: practiceType === opt.id ? '#6366F118' : 'transparent', opacity: pressed ? 0.7 : 1 },
                ]}
                onPress={() => handleSelectType(opt.id)}
              >
                <Text style={styles.optionEmoji}>{opt.emoji}</Text>
                <View style={styles.optionText}>
                  <Text style={[styles.optionLabel, { color: colors.foreground }]}>{opt.label}</Text>
                  <Text style={[styles.optionDesc, { color: colors.muted }]}>{opt.description}</Text>
                </View>
                {practiceType === opt.id && (
                  <Text style={styles.checkmark}>✓</Text>
                )}
              </Pressable>
            ))}
          </View>

          {/* Duration picker (meditation / visualization) */}
          {showLength && (
            <View style={[styles.section, { borderTopWidth: 1, borderTopColor: colors.border }]}>
              <Text style={[styles.sectionLabel, { color: colors.muted }]}>DURATION</Text>
              <View style={styles.chipRow}>
                {LENGTH_OPTIONS.map(len => (
                  <Pressable
                    key={len}
                    style={[
                      styles.chip,
                      {
                        backgroundColor: practiceLength === len ? '#6366F1' : colors.background,
                        borderColor: practiceLength === len ? '#6366F1' : colors.border,
                      },
                    ]}
                    onPress={() => handleSelectLength(len)}
                  >
                    <Text style={[styles.chipTxt, { color: practiceLength === len ? '#fff' : colors.foreground }]}>
                      {len} min
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          )}

          {/* Breathwork style picker */}
          {showBreathworkStyle && (
            <View style={[styles.section, { borderTopWidth: 1, borderTopColor: colors.border }]}>
              <Text style={[styles.sectionLabel, { color: colors.muted }]}>BREATHWORK STYLE</Text>
              {BREATHWORK_STYLES.map(s => (
                <Pressable
                  key={s.id}
                  style={({ pressed }) => [
                    styles.optionRow,
                    { backgroundColor: breathworkStyle === s.id ? '#6366F118' : 'transparent', opacity: pressed ? 0.7 : 1 },
                  ]}
                  onPress={() => handleSelectBreathworkStyle(s.id)}
                >
                  <View style={styles.optionText}>
                    <Text style={[styles.optionLabel, { color: colors.foreground }]}>{s.label}</Text>
                    <Text style={[styles.optionDesc, { color: colors.muted }]}>{s.description}</Text>
                  </View>
                  {breathworkStyle === s.id && (
                    <Text style={styles.checkmark}>✓</Text>
                  )}
                </Pressable>
              ))}
            </View>
          )}

          {/* Launch button */}
          <View style={[styles.launchArea, { borderTopWidth: 1, borderTopColor: colors.border }]}>
            <Pressable
              style={({ pressed }) => [
                styles.launchBtn,
                { opacity: pressed || isGenerating ? 0.75 : 1 },
              ]}
              onPress={handleLaunch}
              disabled={isGenerating}
            >
              {isGenerating ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.launchBtnTxt}>
                  {selectedPractice?.emoji} Start {selectedPractice?.label}
                </Text>
              )}
            </Pressable>
            {isGenerating && (
              <Text style={[styles.generatingNote, { color: colors.muted }]}>
                Generating your personalized session with your voice...
              </Text>
            )}
            <Pressable
              style={({ pressed }) => [styles.catalogBtn, { borderColor: colors.border, opacity: pressed ? 0.7 : 1 }]}
              onPress={() => router.push('/morning-practice-catalog' as never)}
            >
              <Text style={[styles.catalogBtnTxt, { color: colors.muted }]}>Browse All Sessions →</Text>
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
    marginBottom: 12,
    marginTop: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
  },
  iconBadge: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconEmoji: {
    fontSize: 18,
  },
  headerText: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  headerSub: {
    fontSize: 12,
    marginTop: 1,
  },
  chevron: {
    fontSize: 12,
  },
  body: {
    paddingBottom: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  rowLabel: {
    fontSize: 14,
    fontWeight: '500',
  },
  section: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 4,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 10,
    marginBottom: 2,
  },
  optionEmoji: {
    fontSize: 20,
    width: 28,
    textAlign: 'center',
  },
  optionText: {
    flex: 1,
  },
  optionLabel: {
    fontSize: 14,
    fontWeight: '600',
  },
  optionDesc: {
    fontSize: 12,
    marginTop: 1,
  },
  checkmark: {
    color: '#6366F1',
    fontSize: 16,
    fontWeight: '700',
  },
  chipRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  chipTxt: {
    fontSize: 13,
    fontWeight: '600',
  },
  launchArea: {
    padding: 16,
    gap: 8,
    alignItems: 'center',
  },
  launchBtn: {
    backgroundColor: '#6366F1',
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 220,
    minHeight: 48,
  },
  launchBtnTxt: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  generatingNote: {
    fontSize: 12,
    textAlign: 'center',
  },
  catalogBtn: {
    marginTop: 10,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
  },
  catalogBtnTxt: {
    fontSize: 13,
    fontWeight: '600',
  },
});
