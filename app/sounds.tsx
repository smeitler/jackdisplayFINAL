/**
 * Sounds Screen
 * Hub for all audio wellness content — Meditate, Focus, Sleep.
 * Tapping a category opens the existing wellness-audio screen with that category pre-selected.
 */
import React, { useState } from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';

import { IconSymbol } from '@/components/ui/icon-symbol';
import { WellnessIcon } from '@/components/wellness-icon';
import { useColors } from '@/hooks/use-colors';

// ─── Category definitions ─────────────────────────────────────────────────────

const SOUND_CATEGORIES = [
  {
    key: 'meditate',
    label: 'Meditate',
    emoji: '🧘',
    color: '#FF8C42',
    description: 'Guided meditations for calm, clarity, and focus',
    tags: ['Morning', 'Anxiety', 'Sleep', 'Focus'],
  },
  {
    key: 'focus',
    label: 'Focus',
    emoji: '🎯',
    color: '#3B82F6',
    description: 'Deep work soundscapes and concentration sessions',
    tags: ['Deep Work', 'Study', 'Flow State', 'Binaural'],
  },
  {
    key: 'sleep',
    label: 'Sleep',
    emoji: '🌙',
    color: '#8B5CF6',
    description: 'Wind-down sessions and sleep-inducing audio',
    tags: ['Wind Down', 'Body Scan', 'Delta Waves', 'NSDR'],
  },
] as const;

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function SoundsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = useColors();

  function openCategory(key: string) {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(`/wellness-audio?category=${key}` as never);
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [styles.backBtn, { opacity: pressed ? 0.6 : 1 }]}
        >
          <IconSymbol name="chevron.left" size={24} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>Sounds</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 32 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero */}
        <View style={[styles.heroCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={{ fontSize: 40, marginBottom: 8 }}>🎧</Text>
          <Text style={[styles.heroTitle, { color: colors.foreground }]}>Audio Wellness</Text>
          <Text style={[styles.heroSub, { color: colors.muted }]}>
            Meditate, sharpen your focus, or drift into deep sleep — choose your session below.
          </Text>
        </View>

        {/* Category cards */}
        {SOUND_CATEGORIES.map((cat) => (
          <Pressable
            key={cat.key}
            onPress={() => openCategory(cat.key)}
            style={({ pressed }) => [
              styles.catCard,
              {
                backgroundColor: colors.surface,
                borderColor: colors.border,
                opacity: pressed ? 0.85 : 1,
                transform: [{ scale: pressed ? 0.98 : 1 }],
              },
            ]}
          >
            {/* Color accent bar */}
            <View style={[styles.accentBar, { backgroundColor: cat.color }]} />

            <View style={styles.catCardInner}>
              {/* Icon + title row */}
              <View style={styles.catTopRow}>
                <View style={[styles.catIconWrap, { backgroundColor: cat.color + '22' }]}>
                  <WellnessIcon category={cat.key as any} size={28} color={cat.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.catLabel, { color: colors.foreground }]}>{cat.label}</Text>
                  <Text style={[styles.catDesc, { color: colors.muted }]}>{cat.description}</Text>
                </View>
                <IconSymbol name="chevron.right" size={18} color={colors.muted} />
              </View>

              {/* Tags */}
              <View style={styles.tagsRow}>
                {cat.tags.map((tag) => (
                  <View key={tag} style={[styles.tag, { backgroundColor: cat.color + '18' }]}>
                    <Text style={[styles.tagText, { color: cat.color }]}>{tag}</Text>
                  </View>
                ))}
              </View>
            </View>
          </Pressable>
        ))}

        {/* Tip */}
        <View style={[styles.tipBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.tipTitle, { color: colors.foreground }]}>💡 Pro tip</Text>
          <Text style={[styles.tipBody, { color: colors.muted }]}>
            Add a Meditation or Focus step directly inside your Wake Up or Sleep Stack to play audio as part of your ritual sequence.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: { padding: 4, width: 40 },
  headerTitle: { flex: 1, fontSize: 20, fontWeight: '700', textAlign: 'center' },

  heroCard: {
    borderRadius: 16, borderWidth: 1,
    padding: 24, alignItems: 'center',
    marginBottom: 16,
  },
  heroTitle: { fontSize: 22, fontWeight: '800', marginBottom: 6 },
  heroSub: { fontSize: 14, textAlign: 'center', lineHeight: 20 },

  catCard: {
    borderRadius: 16, borderWidth: 1,
    marginBottom: 12, overflow: 'hidden',
    flexDirection: 'row',
  },
  accentBar: { width: 5 },
  catCardInner: { flex: 1, padding: 16, gap: 12 },
  catTopRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  catIconWrap: {
    width: 48, height: 48, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
  },
  catLabel: { fontSize: 18, fontWeight: '700', marginBottom: 2 },
  catDesc: { fontSize: 13, lineHeight: 18 },

  tagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tag: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  tagText: { fontSize: 11, fontWeight: '600' },

  tipBox: {
    borderRadius: 14, borderWidth: 1,
    padding: 16, marginTop: 4,
  },
  tipTitle: { fontSize: 14, fontWeight: '700', marginBottom: 6 },
  tipBody: { fontSize: 13, lineHeight: 20 },
});
