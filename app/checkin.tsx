import {
  ScrollView, Text, View, Pressable, StyleSheet, Platform,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useState, useMemo } from "react";
import { ScreenContainer } from "@/components/screen-container";
import { useApp } from "@/lib/app-context";
import { useColors } from "@/hooks/use-colors";
import { IconSymbol } from "@/components/ui/icon-symbol";
import {
  yesterdayString, offsetDateString, formatDisplayDate, toDateString,
  Rating, Category, RATING_META,
} from "@/lib/storage";
import * as Haptics from "expo-haptics";

const CATEGORY_META: Record<Category, { label: string; icon: any; colorKey: string; emoji: string }> = {
  health: { label: 'Health', icon: 'figure.walk', colorKey: 'health', emoji: '💪' },
  relationships: { label: 'Relationships', icon: 'person.2.fill', colorKey: 'relationships', emoji: '❤️' },
  wealth: { label: 'Wealth', icon: 'dollarsign.circle.fill', colorKey: 'wealth', emoji: '💰' },
  mindset: { label: 'Mindset', icon: 'brain.head.profile', colorKey: 'mindset', emoji: '🧠' },
};

const CATEGORY_ORDER: Category[] = ['health', 'relationships', 'wealth', 'mindset'];

const RATINGS: Rating[] = ['red', 'yellow', 'green'];

const RATING_DISPLAY: Record<Rating, { emoji: string; label: string; bg: string; border: string }> = {
  none: { emoji: '–', label: 'Skip', bg: 'transparent', border: '#9090B8' },
  red: { emoji: '🔴', label: 'Failed', bg: '#FEE2E2', border: '#EF4444' },
  yellow: { emoji: '🟡', label: 'Okay', bg: '#FEF3C7', border: '#F59E0B' },
  green: { emoji: '🟢', label: 'Crushed it!', bg: '#DCFCE7', border: '#22C55E' },
};

const RATING_DISPLAY_DARK: Record<Rating, { bg: string; border: string }> = {
  none: { bg: 'transparent', border: '#9090B8' },
  red: { bg: '#450A0A', border: '#EF4444' },
  yellow: { bg: '#451A03', border: '#F59E0B' },
  green: { bg: '#052E16', border: '#22C55E' },
};

export default function CheckInScreen() {
  const { activeHabits, submitCheckIn, getRatingsForDate } = useApp();
  const colors = useColors();
  const router = useRouter();
  const params = useLocalSearchParams<{ date?: string }>();

  // Support navigating to a specific date via query param, default to yesterday
  const [currentDate, setCurrentDate] = useState(params.date ?? yesterdayString());
  const [ratings, setRatings] = useState<Record<string, Rating>>(() => getRatingsForDate(currentDate));
  const [submitted, setSubmitted] = useState(false);

  const today = toDateString();
  const isToday = currentDate === today;
  // Can't go forward past yesterday
  const canGoForward = currentDate < yesterdayString();

  function navigateDate(direction: -1 | 1) {
    const d = new Date(currentDate + 'T12:00:00');
    d.setDate(d.getDate() + direction);
    const newDate = toDateString(d);
    // Don't allow going to today or future
    if (newDate >= today) return;
    setCurrentDate(newDate);
    setRatings(getRatingsForDate(newDate));
    setSubmitted(false);
  }

  const habitsByCategory = useMemo(() => {
    const map: Record<Category, typeof activeHabits> = {
      health: [], relationships: [], wealth: [], mindset: [],
    };
    for (const h of activeHabits) {
      map[h.category].push(h);
    }
    return map;
  }, [activeHabits]);

  function setRating(habitId: string, rating: Rating) {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setRatings((prev) => ({ ...prev, [habitId]: rating }));
  }

  async function handleSubmit() {
    if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await submitCheckIn(currentDate, ratings);
    setSubmitted(true);
    setTimeout(() => router.back(), 1400);
  }

  // Summary counts
  const ratedCount = Object.values(ratings).filter((r) => r !== 'none' && r !== undefined).length;
  const greenCount = Object.values(ratings).filter((r) => r === 'green').length;
  const yellowCount = Object.values(ratings).filter((r) => r === 'yellow').length;
  const redCount = Object.values(ratings).filter((r) => r === 'red').length;

  if (submitted) {
    return (
      <ScreenContainer>
        <View style={styles.successContainer}>
          <Text style={styles.successEmoji}>🎉</Text>
          <Text style={[styles.successTitle, { color: colors.foreground }]}>Saved!</Text>
          <View style={styles.successStats}>
            {greenCount > 0 && <Text style={styles.successStat}>🟢 {greenCount} crushed</Text>}
            {yellowCount > 0 && <Text style={styles.successStat}>🟡 {yellowCount} okay</Text>}
            {redCount > 0 && <Text style={styles.successStat}>🔴 {redCount} missed</Text>}
          </View>
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
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>Daily Review</Text>
        <View style={styles.closeBtn} />
      </View>

      {/* Date navigation */}
      <View style={[styles.dateNav, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <Pressable
          onPress={() => navigateDate(-1)}
          style={({ pressed }) => [styles.dateNavBtn, { opacity: pressed ? 0.6 : 1 }]}
        >
          <IconSymbol name="chevron.left" size={20} color={colors.primary} />
        </Pressable>

        <View style={styles.dateNavCenter}>
          <Text style={[styles.dateNavLabel, { color: colors.foreground }]}>
            {formatDisplayDate(currentDate)}
          </Text>
          <Text style={[styles.dateNavSub, { color: colors.muted }]}>
            {new Date(currentDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
          </Text>
        </View>

        <Pressable
          onPress={() => canGoForward ? navigateDate(1) : undefined}
          style={({ pressed }) => [
            styles.dateNavBtn,
            { opacity: canGoForward ? (pressed ? 0.6 : 1) : 0.2 },
          ]}
        >
          <IconSymbol name="chevron.right" size={20} color={colors.primary} />
        </Pressable>
      </View>

      {/* Rating legend */}
      <View style={[styles.legend, { backgroundColor: colors.background }]}>
        {RATINGS.map((r) => (
          <View key={r} style={styles.legendItem}>
            <Text style={styles.legendEmoji}>{RATING_DISPLAY[r].emoji}</Text>
            <Text style={[styles.legendLabel, { color: colors.muted }]}>{RATING_DISPLAY[r].label}</Text>
          </View>
        ))}
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

          return (
            <View key={category} style={styles.categorySection}>
              {/* Category header */}
              <View style={styles.categoryHeader}>
                <View style={[styles.categoryIconWrap, { backgroundColor: catColor + '22' }]}>
                  <Text style={styles.categoryEmoji}>{meta.emoji}</Text>
                </View>
                <Text style={[styles.categoryTitle, { color: colors.foreground }]}>{meta.label}</Text>
              </View>

              {/* Habit rating rows */}
              <View style={[styles.habitList, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                {habits.map((habit, idx) => {
                  const currentRating: Rating = ratings[habit.id] ?? 'none';
                  const isLast = idx === habits.length - 1;

                  return (
                    <View
                      key={habit.id}
                      style={[
                        styles.habitRow,
                        !isLast && { borderBottomWidth: 1, borderBottomColor: colors.border },
                      ]}
                    >
                      <Text style={[styles.habitName, { color: colors.foreground }]} numberOfLines={2}>
                        {habit.name}
                      </Text>
                      <View style={styles.ratingButtons}>
                        {RATINGS.map((rating) => {
                          const isSelected = currentRating === rating;
                          const display = RATING_DISPLAY[rating];
                          const darkDisplay = RATING_DISPLAY_DARK[rating];
                          const isDark = colors.background === '#0F0E1A';
                          const bgColor = isSelected
                            ? (isDark ? darkDisplay.bg : display.bg)
                            : 'transparent';
                          const borderColor = isSelected ? display.border : colors.border;

                          return (
                            <Pressable
                              key={rating}
                              onPress={() => setRating(habit.id, isSelected ? 'none' : rating)}
                              style={({ pressed }) => [
                                styles.ratingBtn,
                                {
                                  backgroundColor: bgColor,
                                  borderColor,
                                  transform: [{ scale: pressed ? 0.9 : isSelected ? 1.08 : 1 }],
                                },
                              ]}
                            >
                              <Text style={styles.ratingBtnEmoji}>{display.emoji}</Text>
                            </Pressable>
                          );
                        })}
                      </View>
                    </View>
                  );
                })}
              </View>
            </View>
          );
        })}

        <View style={{ height: 20 }} />
      </ScrollView>

      {/* Summary + Submit */}
      <View style={[styles.submitWrap, { backgroundColor: colors.background, borderTopColor: colors.border }]}>
        {ratedCount > 0 && (
          <View style={styles.summaryRow}>
            {greenCount > 0 && (
              <View style={[styles.summaryBadge, { backgroundColor: '#DCFCE7' }]}>
                <Text style={styles.summaryBadgeText}>🟢 {greenCount}</Text>
              </View>
            )}
            {yellowCount > 0 && (
              <View style={[styles.summaryBadge, { backgroundColor: '#FEF3C7' }]}>
                <Text style={styles.summaryBadgeText}>🟡 {yellowCount}</Text>
              </View>
            )}
            {redCount > 0 && (
              <View style={[styles.summaryBadge, { backgroundColor: '#FEE2E2' }]}>
                <Text style={styles.summaryBadgeText}>🔴 {redCount}</Text>
              </View>
            )}
          </View>
        )}
        <Pressable
          onPress={handleSubmit}
          style={({ pressed }) => [
            styles.submitBtn,
            { backgroundColor: colors.primary, transform: [{ scale: pressed ? 0.97 : 1 }] },
          ]}
        >
          <IconSymbol name="checkmark.circle.fill" size={20} color="#fff" />
          <Text style={styles.submitText}>Save Review</Text>
        </Pressable>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1,
  },
  closeBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 16, fontWeight: '700' },

  dateNav: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 12, paddingHorizontal: 8,
    borderBottomWidth: 1,
  },
  dateNavBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  dateNavCenter: { flex: 1, alignItems: 'center' },
  dateNavLabel: { fontSize: 17, fontWeight: '700' },
  dateNavSub: { fontSize: 12, marginTop: 1 },

  legend: {
    flexDirection: 'row', justifyContent: 'center', gap: 20,
    paddingVertical: 8, paddingHorizontal: 16,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendEmoji: { fontSize: 14 },
  legendLabel: { fontSize: 12 },

  scroll: { padding: 16, paddingBottom: 20 },

  categorySection: { marginBottom: 20 },
  categoryHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  categoryIconWrap: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  categoryEmoji: { fontSize: 18 },
  categoryTitle: { fontSize: 16, fontWeight: '700' },

  habitList: { borderRadius: 14, borderWidth: 1, overflow: 'hidden' },
  habitRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 14, paddingVertical: 12, gap: 10,
  },
  habitName: { flex: 1, fontSize: 14, lineHeight: 20 },

  ratingButtons: { flexDirection: 'row', gap: 8 },
  ratingBtn: {
    width: 40, height: 40, borderRadius: 12, borderWidth: 1.5,
    alignItems: 'center', justifyContent: 'center',
  },
  ratingBtnEmoji: { fontSize: 18 },

  submitWrap: {
    padding: 16, paddingBottom: 24,
    borderTopWidth: 1, gap: 10,
  },
  summaryRow: { flexDirection: 'row', gap: 8, justifyContent: 'center' },
  summaryBadge: {
    paddingHorizontal: 12, paddingVertical: 5,
    borderRadius: 20,
  },
  summaryBadgeText: { fontSize: 13, fontWeight: '700' },
  submitBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    borderRadius: 14, paddingVertical: 16,
  },
  submitText: { color: '#fff', fontSize: 16, fontWeight: '700' },

  successContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  successEmoji: { fontSize: 64 },
  successTitle: { fontSize: 24, fontWeight: '700' },
  successStats: { flexDirection: 'row', gap: 12 },
  successStat: { fontSize: 15, fontWeight: '600' },
});
