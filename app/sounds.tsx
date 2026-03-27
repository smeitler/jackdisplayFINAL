/**
 * Sounds Screen — hub for Meditate, Focus, Sleep audio categories.
 */
import React from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';

import { IconSymbol } from '@/components/ui/icon-symbol';
import { WellnessIcon } from '@/components/wellness-icon';
import { useColors } from '@/hooks/use-colors';

const CATEGORIES = [
  { key: 'meditate', label: 'Meditate', color: '#FF8C42', description: 'Guided meditations for calm, clarity, and focus', tags: ['Morning', 'Anxiety', 'Sleep', 'Focus'] },
  { key: 'focus',    label: 'Focus',    color: '#3B82F6', description: 'Deep work soundscapes and concentration sessions', tags: ['Deep Work', 'Study', 'Flow State', 'Binaural'] },
  { key: 'sleep',    label: 'Sleep',    color: '#8B5CF6', description: 'Wind-down sessions and sleep-inducing audio', tags: ['Wind Down', 'Body Scan', 'Delta Waves', 'NSDR'] },
] as const;

export default function SoundsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = useColors();

  return (
    <View style={[styles.root, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} style={({ pressed }) => [styles.backBtn, { opacity: pressed ? 0.6 : 1 }]}>
          <IconSymbol name="chevron.left" size={24} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>Sounds</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 32 }} showsVerticalScrollIndicator={false}>
        {CATEGORIES.map((cat) => (
          <Pressable
            key={cat.key}
            onPress={() => {
              if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push(`/wellness-audio?category=${cat.key}` as never);
            }}
            style={({ pressed }) => [styles.catCard, { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.85 : 1, transform: [{ scale: pressed ? 0.98 : 1 }] }]}
          >
            <View style={[styles.accentBar, { backgroundColor: cat.color }]} />
            <View style={styles.catInner}>
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
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  backBtn: { padding: 4, width: 40 },
  headerTitle: { flex: 1, fontSize: 20, fontWeight: '700', textAlign: 'center' },
  catCard: { borderRadius: 16, borderWidth: 1, marginBottom: 12, overflow: 'hidden', flexDirection: 'row' },
  accentBar: { width: 5 },
  catInner: { flex: 1, padding: 16, gap: 12 },
  catTopRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  catIconWrap: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  catLabel: { fontSize: 18, fontWeight: '700', marginBottom: 2 },
  catDesc: { fontSize: 13, lineHeight: 18 },
  tagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tag: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  tagText: { fontSize: 11, fontWeight: '600' },
});
