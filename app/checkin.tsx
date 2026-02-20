import { ScrollView, Text, View, Pressable, StyleSheet, Platform } from "react-native";
import { useRouter } from "expo-router";
import { useState, useMemo } from "react";
import { ScreenContainer } from "@/components/screen-container";
import { useApp } from "@/lib/app-context";
import { useColors } from "@/hooks/use-colors";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { yesterdayString } from "@/lib/storage";
import { Category } from "@/lib/storage";
import * as Haptics from "expo-haptics";

const CATEGORY_META: Record<Category, { label: string; icon: any; colorKey: string; emoji: string }> = {
  health: { label: 'Health', icon: 'figure.walk', colorKey: 'health', emoji: '💪' },
  relationships: { label: 'Relationships', icon: 'person.2.fill', colorKey: 'relationships', emoji: '❤️' },
  wealth: { label: 'Wealth', icon: 'dollarsign.circle.fill', colorKey: 'wealth', emoji: '💰' },
  mindset: { label: 'Mindset', icon: 'brain.head.profile', colorKey: 'mindset', emoji: '🧠' },
};

const CATEGORY_ORDER: Category[] = ['health', 'relationships', 'wealth', 'mindset'];

export default function CheckInScreen() {
  const { activeHabits, submitCheckIn, getEntriesForDate } = useApp();
  const colors = useColors();
  const router = useRouter();

  const yesterday = yesterdayString();

  // Pre-fill with any existing entries
  const existingEntries = getEntriesForDate(yesterday);
  const existingCompleted = new Set(existingEntries.filter((e) => e.completed).map((e) => e.habitId));

  const [checked, setChecked] = useState<Set<string>>(existingCompleted);
  const [submitted, setSubmitted] = useState(false);

  const habitsByCategory = useMemo(() => {
    const map: Record<Category, typeof activeHabits> = {
      health: [], relationships: [], wealth: [], mindset: [],
    };
    for (const h of activeHabits) {
      map[h.category].push(h);
    }
    return map;
  }, [activeHabits]);

  function toggleHabit(id: string) {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleSubmit() {
    if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await submitCheckIn(yesterday, Array.from(checked));
    setSubmitted(true);
    setTimeout(() => router.back(), 1200);
  }

  const totalHabits = activeHabits.length;
  const checkedCount = checked.size;

  if (submitted) {
    return (
      <ScreenContainer>
        <View style={styles.successContainer}>
          <Text style={styles.successEmoji}>🎉</Text>
          <Text style={[styles.successTitle, { color: colors.foreground }]}>Check-in saved!</Text>
          <Text style={[styles.successSub, { color: colors.muted }]}>
            {checkedCount} of {totalHabits} habits completed
          </Text>
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer edges={["top", "left", "right"]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [styles.closeBtn, { opacity: pressed ? 0.6 : 1 }]}
        >
          <IconSymbol name="xmark" size={18} color={colors.muted} />
        </Pressable>
        <View style={styles.headerCenter}>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>Yesterday's Check-In</Text>
          <Text style={[styles.headerDate, { color: colors.muted }]}>
            {formatDate(new Date(yesterday + 'T12:00:00'))}
          </Text>
        </View>
        <View style={styles.closeBtn} />
      </View>

      {/* Progress indicator */}
      <View style={[styles.progressWrap, { backgroundColor: colors.surface }]}>
        <View style={styles.progressRow}>
          <Text style={[styles.progressLabel, { color: colors.muted }]}>
            {checkedCount} / {totalHabits} completed
          </Text>
          <Text style={[styles.progressPct, { color: colors.primary }]}>
            {totalHabits > 0 ? Math.round((checkedCount / totalHabits) * 100) : 0}%
          </Text>
        </View>
        <View style={[styles.progressBarBg, { backgroundColor: colors.border }]}>
          <View
            style={[
              styles.progressBarFill,
              {
                width: totalHabits > 0 ? `${(checkedCount / totalHabits) * 100}%` as any : '0%',
                backgroundColor: colors.primary,
              },
            ]}
          />
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {CATEGORY_ORDER.map((category) => {
          const habits = habitsByCategory[category];
          if (habits.length === 0) return null;
          const meta = CATEGORY_META[category];
          const catColor = (colors as Record<string, string>)[meta.colorKey] ?? colors.primary;
          const catChecked = habits.filter((h) => checked.has(h.id)).length;

          return (
            <View key={category} style={styles.categorySection}>
              {/* Category header */}
              <View style={styles.categoryHeader}>
                <View style={[styles.categoryIconWrap, { backgroundColor: catColor + '22' }]}>
                  <Text style={styles.categoryEmoji}>{meta.emoji}</Text>
                </View>
                <Text style={[styles.categoryTitle, { color: colors.foreground }]}>{meta.label}</Text>
                <Text style={[styles.categoryCount, { color: colors.muted }]}>
                  {catChecked}/{habits.length}
                </Text>
              </View>

              {/* Habit items */}
              <View style={[styles.habitList, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                {habits.map((habit, idx) => {
                  const isChecked = checked.has(habit.id);
                  const isLast = idx === habits.length - 1;
                  return (
                    <Pressable
                      key={habit.id}
                      onPress={() => toggleHabit(habit.id)}
                      style={({ pressed }) => [
                        styles.habitItem,
                        !isLast && { borderBottomWidth: 1, borderBottomColor: colors.border },
                        { opacity: pressed ? 0.7 : 1 },
                      ]}
                    >
                      <View
                        style={[
                          styles.checkbox,
                          isChecked
                            ? { backgroundColor: catColor, borderColor: catColor }
                            : { backgroundColor: 'transparent', borderColor: colors.border },
                        ]}
                      >
                        {isChecked && (
                          <IconSymbol name="checkmark" size={13} color="#fff" />
                        )}
                      </View>
                      <Text
                        style={[
                          styles.habitName,
                          { color: isChecked ? colors.foreground : colors.foreground },
                          isChecked && styles.habitNameChecked,
                        ]}
                      >
                        {habit.name}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          );
        })}

        <View style={styles.bottomPad} />
      </ScrollView>

      {/* Submit button */}
      <View style={[styles.submitWrap, { backgroundColor: colors.background, borderTopColor: colors.border }]}>
        <Pressable
          onPress={handleSubmit}
          style={({ pressed }) => [
            styles.submitBtn,
            { backgroundColor: colors.primary, transform: [{ scale: pressed ? 0.97 : 1 }] },
          ]}
        >
          <IconSymbol name="checkmark.circle.fill" size={20} color="#fff" />
          <Text style={styles.submitText}>Save Check-In</Text>
        </Pressable>
      </View>
    </ScreenContainer>
  );
}

function formatDate(d: Date): string {
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1,
  },
  closeBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerTitle: { fontSize: 16, fontWeight: '700' },
  headerDate: { fontSize: 12, marginTop: 1 },
  progressWrap: { paddingHorizontal: 20, paddingVertical: 12 },
  progressRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  progressLabel: { fontSize: 13 },
  progressPct: { fontSize: 13, fontWeight: '700' },
  progressBarBg: { height: 6, borderRadius: 3, overflow: 'hidden' },
  progressBarFill: { height: 6, borderRadius: 3 },
  scroll: { padding: 16, paddingBottom: 20 },
  categorySection: { marginBottom: 20 },
  categoryHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  categoryIconWrap: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  categoryEmoji: { fontSize: 18 },
  categoryTitle: { flex: 1, fontSize: 16, fontWeight: '700' },
  categoryCount: { fontSize: 13, fontWeight: '600' },
  habitList: { borderRadius: 14, borderWidth: 1, overflow: 'hidden' },
  habitItem: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingVertical: 14,
  },
  checkbox: {
    width: 24, height: 24, borderRadius: 7, borderWidth: 2,
    alignItems: 'center', justifyContent: 'center',
  },
  habitName: { flex: 1, fontSize: 15 },
  habitNameChecked: { opacity: 0.5 },
  bottomPad: { height: 20 },
  submitWrap: {
    padding: 16, paddingBottom: 24,
    borderTopWidth: 1,
  },
  submitBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    borderRadius: 14, paddingVertical: 16,
  },
  submitText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  successContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  successEmoji: { fontSize: 64 },
  successTitle: { fontSize: 24, fontWeight: '700' },
  successSub: { fontSize: 15 },
});
