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
  yesterdayString, formatDisplayDate, toDateString,
  Rating, Category,
} from "@/lib/storage";
import * as Haptics from "expo-haptics";

// Modern, minimal rating config — no emoji circles, just clean color + label
const RATINGS: Rating[] = ['red', 'yellow', 'green'];

const RATING_CONFIG: Record<Rating, {
  label: string;
  activeColor: string;      // solid fill when selected
  activeLabelColor: string; // text when selected
  dotColor: string;         // small dot indicator
}> = {
  none:   { label: '–',          activeColor: '#E5E7EB', activeLabelColor: '#6B7280', dotColor: '#9CA3AF' },
  red:    { label: 'Missed',     activeColor: '#EF4444', activeLabelColor: '#fff',    dotColor: '#EF4444' },
  yellow: { label: 'Okay',       activeColor: '#F59E0B', activeLabelColor: '#fff',    dotColor: '#F59E0B' },
  green:  { label: 'Crushed it', activeColor: '#22C55E', activeLabelColor: '#fff',    dotColor: '#22C55E' },
};

export default function CheckInScreen() {
  const { activeHabits, categories, submitCheckIn, getRatingsForDate } = useApp();
  const sortedCategories = [...categories].sort((a, b) => a.order - b.order);
  const colors = useColors();
  const router = useRouter();
  const params = useLocalSearchParams<{ date?: string }>();

  const [currentDate, setCurrentDate] = useState(params.date ?? yesterdayString());
  const [ratings, setRatings] = useState<Record<string, Rating>>(() => getRatingsForDate(currentDate));
  const [submitted, setSubmitted] = useState(false);

  const today = toDateString();
  const canGoForward = currentDate < yesterdayString();

  function navigateDate(direction: -1 | 1) {
    const d = new Date(currentDate + 'T12:00:00');
    d.setDate(d.getDate() + direction);
    const newDate = toDateString(d);
    if (newDate >= today) return;
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setCurrentDate(newDate);
    setRatings(getRatingsForDate(newDate));
    setSubmitted(false);
  }

  const habitsByCategory = useMemo(() => {
    const map: Record<string, typeof activeHabits> = {};
    for (const cat of categories) map[cat.id] = [];
    for (const h of activeHabits) {
      if (!map[h.category]) map[h.category] = [];
      map[h.category].push(h);
    }
    return map;
  }, [activeHabits, categories]);

  function setRating(habitId: string, rating: Rating) {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    // Tap same rating to deselect
    setRatings((prev) => ({ ...prev, [habitId]: prev[habitId] === rating ? 'none' : rating }));
  }

  async function handleSubmit() {
    if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await submitCheckIn(currentDate, ratings);
    setSubmitted(true);
    setTimeout(() => router.back(), 1600);
  }

  // All active habits must be rated before saving
  const allRated = activeHabits.length > 0 &&
    activeHabits.every((h) => ratings[h.id] && ratings[h.id] !== 'none');

  const ratedEntries = Object.values(ratings).filter((r) => r !== 'none' && r !== undefined);
  const greenCount  = ratedEntries.filter((r) => r === 'green').length;
  const yellowCount = ratedEntries.filter((r) => r === 'yellow').length;
  const redCount    = ratedEntries.filter((r) => r === 'red').length;
  const totalActive = activeHabits.length;
  const progress    = totalActive > 0 ? ratedEntries.length / totalActive : 0;

  if (submitted) {
    return (
      <ScreenContainer>
        <View style={styles.successContainer}>
          <View style={[styles.successIconWrap, { backgroundColor: colors.surface }]}>
            <Text style={styles.successIcon}>✓</Text>
          </View>
          <Text style={[styles.successTitle, { color: colors.foreground }]}>Saved</Text>
          <Text style={[styles.successSub, { color: colors.muted }]}>
            {formatDisplayDate(currentDate)} reviewed
          </Text>
          <View style={styles.successPills}>
            {greenCount  > 0 && <View style={[styles.successPill, { backgroundColor: '#22C55E' }]}><Text style={styles.successPillText}>{greenCount} crushed</Text></View>}
            {yellowCount > 0 && <View style={[styles.successPill, { backgroundColor: '#F59E0B' }]}><Text style={styles.successPillText}>{yellowCount} okay</Text></View>}
            {redCount    > 0 && <View style={[styles.successPill, { backgroundColor: '#EF4444' }]}><Text style={styles.successPillText}>{redCount} missed</Text></View>}
          </View>
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer edges={["top", "left", "right"]}>

      {/* ── Header ── */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [styles.headerBtn, { opacity: pressed ? 0.5 : 1 }]}
        >
          <IconSymbol name="xmark" size={16} color={colors.muted} />
        </Pressable>

        {/* Date nav */}
        <View style={styles.dateRow}>
          <Pressable
            onPress={() => navigateDate(-1)}
            style={({ pressed }) => [styles.arrowBtn, { opacity: pressed ? 0.5 : 1 }]}
          >
            <IconSymbol name="chevron.left" size={16} color={colors.primary} />
          </Pressable>
          <View style={styles.dateLabelWrap}>
            <Text style={[styles.dateLabel, { color: colors.foreground }]}>
              {formatDisplayDate(currentDate)}
            </Text>
            <Text style={[styles.dateSub, { color: colors.muted }]}>
              {new Date(currentDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
            </Text>
          </View>
          <Pressable
            onPress={() => canGoForward ? navigateDate(1) : undefined}
            style={({ pressed }) => [styles.arrowBtn, { opacity: canGoForward ? (pressed ? 0.5 : 1) : 0.2 }]}
          >
            <IconSymbol name="chevron.right" size={16} color={colors.primary} />
          </Pressable>
        </View>

        <View style={styles.headerBtn} />
      </View>

      {/* ── Progress bar ── */}
      <View style={[styles.progressTrack, { backgroundColor: colors.border }]}>
        <View style={[styles.progressFill, { width: `${Math.round(progress * 100)}%` as any, backgroundColor: colors.primary }]} />
      </View>

      {/* ── Rating legend ── */}
      <View style={[styles.legendRow, { borderBottomColor: colors.border }]}>
        {RATINGS.map((r) => {
          const cfg = RATING_CONFIG[r];
          return (
            <View key={r} style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: cfg.dotColor }]} />
              <Text style={[styles.legendText, { color: colors.muted }]}>{cfg.label}</Text>
            </View>
          );
        })}
      </View>

      {/* ── Habit list ── */}
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {sortedCategories.map((cat) => {
          const habits = habitsByCategory[cat.id] ?? [];
          if (habits.length === 0) return null;
          const catColor = colors.primary;

          return (
            <View key={cat.id} style={styles.section}>
              {/* Category label */}
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionEmoji}>{cat.emoji}</Text>
                <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{cat.label}</Text>
              </View>

              {/* Habits */}
              <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                {habits.map((habit, idx) => {
                  const current: Rating = ratings[habit.id] ?? 'none';
                  const isLast = idx === habits.length - 1;

                  return (
                    <View
                      key={habit.id}
                      style={[
                        styles.habitRow,
                        !isLast && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
                      ]}
                    >
                      {/* Habit name */}
                      <Text style={[styles.habitName, { color: colors.foreground }]} numberOfLines={2}>
                        {habit.name}
                      </Text>

                      {/* Segmented color button */}
                      <View style={[styles.segmentedBtn, { backgroundColor: colors.border }]}>
                        {RATINGS.map((rating, idx) => {
                          const cfg = RATING_CONFIG[rating];
                          const isSelected = current === rating;
                          const isFirst = idx === 0;
                          const isLast = idx === RATINGS.length - 1;

                          return (
                            <Pressable
                              key={rating}
                              onPress={() => setRating(habit.id, rating)}
                              style={({ pressed }) => [
                                styles.segment,
                                isFirst && styles.segmentFirst,
                                isLast && styles.segmentLast,
                                {
                                  backgroundColor: isSelected
                                    ? cfg.activeColor
                                    : cfg.dotColor + '28',
                                  opacity: pressed ? 0.75 : 1,
                                },
                              ]}
                            />
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

        <View style={{ height: 16 }} />
      </ScrollView>

      {/* ── Footer ── */}
      <View style={[styles.footer, { backgroundColor: colors.background, borderTopColor: colors.border }]}>
        {/* Mini tally */}
        {ratedEntries.length > 0 && (
          <View style={styles.tally}>
            {greenCount  > 0 && <View style={[styles.tallyPill, { backgroundColor: '#22C55E18' }]}><View style={[styles.tallyDot, { backgroundColor: '#22C55E' }]} /><Text style={[styles.tallyText, { color: '#22C55E' }]}>{greenCount}</Text></View>}
            {yellowCount > 0 && <View style={[styles.tallyPill, { backgroundColor: '#F59E0B18' }]}><View style={[styles.tallyDot, { backgroundColor: '#F59E0B' }]} /><Text style={[styles.tallyText, { color: '#F59E0B' }]}>{yellowCount}</Text></View>}
            {redCount    > 0 && <View style={[styles.tallyPill, { backgroundColor: '#EF444418' }]}><View style={[styles.tallyDot, { backgroundColor: '#EF4444' }]} /><Text style={[styles.tallyText, { color: '#EF4444' }]}>{redCount}</Text></View>}
            <Text style={[styles.tallyOf, { color: colors.muted }]}>{ratedEntries.length}/{totalActive} rated</Text>
          </View>
        )}

        <Pressable
          onPress={allRated ? handleSubmit : undefined}
          style={({ pressed }) => [
            styles.saveBtn,
            {
              backgroundColor: allRated ? colors.primary : colors.border,
              transform: [{ scale: allRated && pressed ? 0.97 : 1 }],
              opacity: allRated ? 1 : 0.55,
            },
          ]}
        >
          <Text style={[styles.saveBtnText, { color: allRated ? '#fff' : colors.muted }]}>
            {allRated ? 'Save Review' : `Rate all habits (${ratedEntries.length}/${totalActive})`}
          </Text>
        </Pressable>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  // Header
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 12, paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  dateRow: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  arrowBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  dateLabelWrap: { alignItems: 'center', minWidth: 140 },
  dateLabel: { fontSize: 15, fontWeight: '700' },
  dateSub: { fontSize: 11, marginTop: 1 },

  // Progress
  progressTrack: { height: 2 },
  progressFill: { height: 2, borderRadius: 1 },

  // Legend
  legendRow: {
    flexDirection: 'row', justifyContent: 'center', gap: 20,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 7, height: 7, borderRadius: 4 },
  legendText: { fontSize: 12, fontWeight: '500' },

  // Scroll
  scroll: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12 },

  // Section
  section: { marginBottom: 18 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 8 },
  sectionDot: { width: 8, height: 8, borderRadius: 4 },
  sectionEmoji: { fontSize: 16 },
  sectionTitle: { fontSize: 13, fontWeight: '700', letterSpacing: 0.3, textTransform: 'uppercase' },

  // Card
  card: { borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },

  // Habit row
  habitRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 14, paddingVertical: 13, gap: 12,
  },
  habitName: { flex: 1, fontSize: 15, lineHeight: 20 },

  // Segmented color button
  segmentedBtn: {
    flexDirection: 'row',
    borderRadius: 11,
    overflow: 'hidden',
    gap: 2,
    padding: 2,
  },
  segment: {
    width: 36,
    height: 34,
    borderRadius: 8,
  },
  segmentFirst: { borderTopLeftRadius: 9, borderBottomLeftRadius: 9 },
  segmentLast:  { borderTopRightRadius: 9, borderBottomRightRadius: 9 },

  // Footer
  footer: {
    paddingHorizontal: 16, paddingTop: 10, paddingBottom: 28,
    borderTopWidth: StyleSheet.hairlineWidth, gap: 10,
  },
  tally: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  tallyPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 9, paddingVertical: 4, borderRadius: 20,
  },
  tallyDot: { width: 6, height: 6, borderRadius: 3 },
  tallyText: { fontSize: 13, fontWeight: '700' },
  tallyOf: { fontSize: 12, marginLeft: 4 },
  saveBtn: {
    borderRadius: 14, paddingVertical: 15,
    alignItems: 'center', justifyContent: 'center',
  },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '700', letterSpacing: 0.2 },

  // Success
  successContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 32 },
  successIconWrap: {
    width: 72, height: 72, borderRadius: 36,
    alignItems: 'center', justifyContent: 'center', marginBottom: 4,
  },
  successIcon: { fontSize: 32, color: '#22C55E' },
  successTitle: { fontSize: 26, fontWeight: '700' },
  successSub: { fontSize: 14 },
  successPills: { flexDirection: 'row', gap: 8, marginTop: 8 },
  successPill: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20 },
  successPillText: { color: '#fff', fontSize: 13, fontWeight: '700' },
});
