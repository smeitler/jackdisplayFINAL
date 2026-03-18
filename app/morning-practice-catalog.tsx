/**
 * MorningPracticeCatalog Screen
 *
 * Browse and launch any of the 4 morning practice types with a custom duration.
 * Each card shows the practice type, description, duration chips, and a launch button.
 * Tapping "Begin" generates a TTS session via the server and navigates to PracticePlayer.
 */

import { useState, useCallback } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  TextInput,
  Alert,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/use-colors';
import { useApp } from '@/lib/app-context';
import { trpc } from '@/lib/trpc';
import { loadHabits, loadGratitudeEntries, yesterdayString } from '@/lib/storage';
import * as Haptics from 'expo-haptics';

// ─── Types ────────────────────────────────────────────────────────────────────

type PracticeType = 'priming' | 'meditation' | 'breathwork' | 'visualization';
type BreathworkStyle = 'wim_hof' | 'box' | '4_7_8';

interface PracticeCard {
  id: PracticeType;
  emoji: string;
  label: string;
  tagline: string;
  description: string;
  accentColor: string;
  defaultDuration: number;
  showDuration: boolean;
  showBreathwork: boolean;
}

const PRACTICE_CARDS: PracticeCard[] = [
  {
    id: 'priming',
    emoji: '⚡',
    label: 'Morning Priming',
    tagline: 'Tony Robbins-style energy activation',
    description: 'Start with gratitude, move into peak state, then visualize your goals and rewards. Sets a powerful tone for the day.',
    accentColor: '#F59E0B',
    defaultDuration: 15,
    showDuration: true,
    showBreathwork: false,
  },
  {
    id: 'meditation',
    emoji: '🧘',
    label: 'Guided Meditation',
    tagline: 'Calm focus and body scan',
    description: 'A gentle guided session that brings you into the present moment, clears mental noise, and cultivates inner stillness.',
    accentColor: '#60A5FA',
    defaultDuration: 10,
    showDuration: true,
    showBreathwork: false,
  },
  {
    id: 'breathwork',
    emoji: '💨',
    label: 'Breathwork',
    tagline: 'Wim Hof, Box, or 4-7-8 breathing',
    description: 'Harness the power of conscious breathing to energize your body, reduce stress, and sharpen mental clarity.',
    accentColor: '#34D399',
    defaultDuration: 10,
    showDuration: false,
    showBreathwork: true,
  },
  {
    id: 'visualization',
    emoji: '🎯',
    label: 'Visualization',
    tagline: 'See your goals achieved',
    description: 'A vivid guided visualization of your goals and rewards. Train your mind to expect success and feel it before it happens.',
    accentColor: '#A78BFA',
    defaultDuration: 10,
    showDuration: true,
    showBreathwork: false,
  },
];

const DURATION_OPTIONS = [5, 10, 15, 20];

const BREATHWORK_STYLES: { id: BreathworkStyle; label: string; description: string }[] = [
  { id: 'wim_hof', label: 'Wim Hof',  description: 'Power breathing + retention' },
  { id: 'box',     label: 'Box',       description: '4-4-4-4 count, 8 rounds' },
  { id: '4_7_8',   label: '4-7-8',     description: 'Relaxing breath, 6 rounds' },
];

const VOICE_IDS: Record<string, string> = {
  rachel: '21m00Tcm4TlvDq8ikWAM',
  aria:   '9BWtsMINqrJLrRacOk9x',
  adam:   'pNInz6obpgDQGcFmaJgB',
  josh:   'TxGEqnHWrfWFTfGW9XjX',
  bella:  'EXAVITQu4vr4xnSDxMaL',
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function MorningPracticeCatalogScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { alarm, categories } = useApp();
  const generateMutation = trpc.morningPractice.generate.useMutation();

  // Per-card state
  const [durations, setDurations] = useState<Record<PracticeType, number>>({
    priming: 15,
    meditation: 10,
    breathwork: 10,
    visualization: 10,
  });
  const [customDurations, setCustomDurations] = useState<Record<PracticeType, string>>({
    priming: '',
    meditation: '',
    breathwork: '',
    visualization: '',
  });
  const [breathStyle, setBreathStyle] = useState<BreathworkStyle>(
    (alarm?.morningBreathworkStyle as BreathworkStyle) ?? 'box',
  );
  const [generatingId, setGeneratingId] = useState<PracticeType | null>(null);
  const [expandedId, setExpandedId] = useState<PracticeType | null>(null);

  const handleLaunch = useCallback(async (card: PracticeCard) => {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setGeneratingId(card.id);
    try {
      const allHabits = await loadHabits();
      const activeHabitNames = allHabits.filter(h => h.isActive).map(h => h.name).slice(0, 8);
      const goalList = categories.map(c => c.label);
      const gratitudeEntries = await loadGratitudeEntries();
      const yd = yesterdayString();
      const ydEntry = gratitudeEntries.find(e => e.date === yd);
      const gratitudes = ydEntry?.items ?? [];

      const voiceKey = alarm?.elevenLabsVoice ?? 'rachel';
      const voiceId = VOICE_IDS[voiceKey] ?? VOICE_IDS.rachel;

      const customMins = parseInt(customDurations[card.id], 10);
      const durationMins = (!isNaN(customMins) && customMins > 0)
        ? customMins
        : durations[card.id];

      const result = await generateMutation.mutateAsync({
        type: card.id,
        voiceId,
        lengthMinutes: card.showDuration ? durationMins : undefined,
        breathworkStyle: card.showBreathwork ? breathStyle : undefined,
        name: 'Friend',
        goals: goalList,
        rewards: [],
        habits: activeHabitNames,
        gratitudes,
      });

      router.push({
        pathname: '/practice-player',
        params: {
          type: card.id,
          chunkUrls: JSON.stringify(result.chunkUrls),
          pausesBetweenChunks: JSON.stringify(result.pausesBetweenChunks),
          totalDurationMinutes: String(result.totalDurationMinutes),
          breathworkStyle: breathStyle,
        },
      } as never);
    } catch (err: any) {
      Alert.alert(
        'Could not generate session',
        err?.message?.includes('API key')
          ? 'ElevenLabs API key is not configured. Please add it in Settings → Account.'
          : 'Something went wrong. Please try again.',
      );
    } finally {
      setGeneratingId(null);
    }
  }, [alarm, categories, durations, customDurations, breathStyle, generateMutation, router]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8, borderBottomColor: colors.border }]}>
        <Pressable
          style={({ pressed }) => [styles.closeBtn, { opacity: pressed ? 0.5 : 1 }]}
          onPress={() => router.back()}
          hitSlop={12}
        >
          <Text style={[styles.closeTxt, { color: colors.muted }]}>✕</Text>
        </Pressable>
        <View style={styles.headerCenter}>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>Morning Practice</Text>
          <Text style={[styles.headerSub, { color: colors.muted }]}>Choose a session to begin</Text>
        </View>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: insets.bottom + 24 }}
        showsVerticalScrollIndicator={false}
      >
        {PRACTICE_CARDS.map(card => {
          const isExpanded = expandedId === card.id;
          const isGenerating = generatingId === card.id;
          const customVal = customDurations[card.id];
          const selectedDuration = durations[card.id];

          return (
            <View
              key={card.id}
              style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
            >
              {/* Card header */}
              <Pressable
                style={styles.cardHeader}
                onPress={() => setExpandedId(isExpanded ? null : card.id)}
              >
                <View style={[styles.cardIconBadge, { backgroundColor: card.accentColor + '22' }]}>
                  <Text style={styles.cardEmoji}>{card.emoji}</Text>
                </View>
                <View style={styles.cardHeaderText}>
                  <Text style={[styles.cardLabel, { color: colors.foreground }]}>{card.label}</Text>
                  <Text style={[styles.cardTagline, { color: colors.muted }]}>{card.tagline}</Text>
                </View>
                <Text style={[styles.chevron, { color: colors.muted }]}>{isExpanded ? '▲' : '▼'}</Text>
              </Pressable>

              {/* Expanded body */}
              {isExpanded && (
                <View style={[styles.cardBody, { borderTopColor: colors.border }]}>
                  <Text style={[styles.cardDescription, { color: colors.muted }]}>{card.description}</Text>

                  {/* Duration picker */}
                  {card.showDuration && (
                    <View style={styles.pickerSection}>
                      <Text style={[styles.pickerLabel, { color: colors.muted }]}>DURATION</Text>
                      <View style={styles.chipRow}>
                        {DURATION_OPTIONS.map(min => (
                          <Pressable
                            key={min}
                            style={({ pressed }) => [
                              styles.chip,
                              {
                                borderColor: selectedDuration === min && !customVal ? card.accentColor : colors.border,
                                backgroundColor: selectedDuration === min && !customVal ? card.accentColor + '18' : 'transparent',
                                opacity: pressed ? 0.7 : 1,
                              },
                            ]}
                            onPress={() => {
                              setDurations(prev => ({ ...prev, [card.id]: min }));
                              setCustomDurations(prev => ({ ...prev, [card.id]: '' }));
                            }}
                          >
                            <Text style={[
                              styles.chipTxt,
                              { color: selectedDuration === min && !customVal ? card.accentColor : colors.foreground },
                            ]}>
                              {min} min
                            </Text>
                          </Pressable>
                        ))}
                        {/* Custom input */}
                        <View style={[
                          styles.chip,
                          {
                            borderColor: customVal ? card.accentColor : colors.border,
                            backgroundColor: customVal ? card.accentColor + '18' : 'transparent',
                            flexDirection: 'row',
                            alignItems: 'center',
                            paddingHorizontal: 10,
                          },
                        ]}>
                          <TextInput
                            value={customVal}
                            onChangeText={v => setCustomDurations(prev => ({ ...prev, [card.id]: v }))}
                            placeholder="Custom"
                            placeholderTextColor={colors.muted}
                            keyboardType="number-pad"
                            style={[styles.chipTxt, { color: customVal ? card.accentColor : colors.foreground, minWidth: 44, textAlign: 'center' }]}
                            returnKeyType="done"
                          />
                          {customVal ? <Text style={[styles.chipTxt, { color: card.accentColor, marginLeft: 2 }]}>min</Text> : null}
                        </View>
                      </View>
                    </View>
                  )}

                  {/* Breathwork style picker */}
                  {card.showBreathwork && (
                    <View style={styles.pickerSection}>
                      <Text style={[styles.pickerLabel, { color: colors.muted }]}>BREATHING STYLE</Text>
                      {BREATHWORK_STYLES.map(bs => (
                        <Pressable
                          key={bs.id}
                          style={({ pressed }) => [
                            styles.breathRow,
                            {
                              backgroundColor: breathStyle === bs.id ? card.accentColor + '18' : 'transparent',
                              borderColor: breathStyle === bs.id ? card.accentColor : colors.border,
                              opacity: pressed ? 0.7 : 1,
                            },
                          ]}
                          onPress={() => setBreathStyle(bs.id)}
                        >
                          <View style={{ flex: 1 }}>
                            <Text style={[styles.breathLabel, { color: colors.foreground }]}>{bs.label}</Text>
                            <Text style={[styles.breathDesc, { color: colors.muted }]}>{bs.description}</Text>
                          </View>
                          {breathStyle === bs.id && (
                            <Text style={[styles.checkmark, { color: card.accentColor }]}>✓</Text>
                          )}
                        </Pressable>
                      ))}
                    </View>
                  )}

                  {/* Launch button */}
                  <Pressable
                    style={({ pressed }) => [
                      styles.launchBtn,
                      {
                        backgroundColor: isGenerating ? colors.border : card.accentColor,
                        opacity: pressed ? 0.85 : 1,
                      },
                    ]}
                    onPress={() => handleLaunch(card)}
                    disabled={isGenerating}
                  >
                    {isGenerating ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <ActivityIndicator size="small" color="#fff" />
                        <Text style={styles.launchBtnTxt}>Generating session...</Text>
                      </View>
                    ) : (
                      <Text style={styles.launchBtnTxt}>▶  Begin {card.label}</Text>
                    )}
                  </Pressable>
                </View>
              )}

              {/* Collapsed quick-launch */}
              {!isExpanded && (
                <Pressable
                  style={({ pressed }) => [
                    styles.quickLaunchBtn,
                    {
                      backgroundColor: isGenerating ? colors.border : card.accentColor + '18',
                      borderColor: card.accentColor + '44',
                      opacity: pressed ? 0.8 : 1,
                    },
                  ]}
                  onPress={() => handleLaunch(card)}
                  disabled={isGenerating}
                >
                  {isGenerating ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <ActivityIndicator size="small" color={card.accentColor} />
                      <Text style={[styles.quickLaunchTxt, { color: card.accentColor }]}>Generating...</Text>
                    </View>
                  ) : (
                    <Text style={[styles.quickLaunchTxt, { color: card.accentColor }]}>
                      ▶  Quick Start ({card.showDuration ? `${durations[card.id]} min` : breathStyle.replace('_', ' ')})
                    </Text>
                  )}
                </Pressable>
              )}
            </View>
          );
        })}
      </ScrollView>
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
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 0.5,
  },
  closeBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeTxt: {
    fontSize: 18,
    fontWeight: '600',
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  headerSub: {
    fontSize: 12,
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 12,
  },
  cardIconBadge: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardEmoji: {
    fontSize: 22,
  },
  cardHeaderText: {
    flex: 1,
    gap: 2,
  },
  cardLabel: {
    fontSize: 16,
    fontWeight: '700',
  },
  cardTagline: {
    fontSize: 12,
  },
  chevron: {
    fontSize: 12,
  },
  cardBody: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    borderTopWidth: 0.5,
    gap: 14,
    paddingTop: 14,
  },
  cardDescription: {
    fontSize: 13,
    lineHeight: 19,
  },
  pickerSection: {
    gap: 8,
  },
  pickerLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1.5,
  },
  chipTxt: {
    fontSize: 13,
    fontWeight: '600',
  },
  breathRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1.5,
  },
  breathLabel: {
    fontSize: 14,
    fontWeight: '600',
  },
  breathDesc: {
    fontSize: 12,
    marginTop: 1,
  },
  checkmark: {
    fontSize: 16,
    fontWeight: '700',
  },
  launchBtn: {
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
    marginTop: 2,
  },
  launchBtnTxt: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15,
  },
  quickLaunchBtn: {
    marginHorizontal: 16,
    marginBottom: 12,
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
  },
  quickLaunchTxt: {
    fontSize: 13,
    fontWeight: '600',
  },
});
