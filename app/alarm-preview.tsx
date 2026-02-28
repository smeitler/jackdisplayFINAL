/**
 * Alarm Preview Screen
 *
 * Shows the user exactly what they will see when their alarm fires:
 *  - The alarm banner (red if requireCheckin, primary otherwise)
 *  - The habit list with rating buttons
 *  - The snooze button (if requireCheckin is off)
 *  - The Save Review button
 *
 * This is a read-only preview — tapping rating buttons works visually
 * but nothing is saved. Tapping Save Review or Snooze just closes the screen.
 */
import {
  ScrollView, Text, View, Pressable, StyleSheet, Platform,
} from "react-native";
import { useRouter } from "expo-router";
import { useState, useMemo } from "react";
import { ScreenContainer } from "@/components/screen-container";
import { useApp } from "@/lib/app-context";
import { useColors } from "@/hooks/use-colors";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { yesterdayString, formatDisplayDate, Rating } from "@/lib/storage";
import * as Haptics from "expo-haptics";

type ActiveRating = 'red' | 'yellow' | 'green';
const RATINGS: ActiveRating[] = ['red', 'yellow', 'green'];
const RATING_COLORS: Record<ActiveRating, string> = {
  red:    '#EF4444',
  yellow: '#F59E0B',
  green:  '#22C55E',
};

export default function AlarmPreviewScreen() {
  const { activeHabits, categories, alarm } = useApp();
  const sortedCategories = useMemo(() => [...categories].sort((a, b) => a.order - b.order), [categories]);
  const colors = useColors();
  const router = useRouter();

  const currentDate = yesterdayString();
  const [ratings, setRatings] = useState<Record<string, Rating>>({});

  const requireCheckin = alarm.requireCheckin ?? false;
  const snoozeMinutes = alarm.snoozeMinutes ?? 10;

  const habitsByCategory = useMemo(() => {
    const map: Record<string, typeof activeHabits> = {};
    for (const cat of categories) map[cat.id] = [];
    for (const h of activeHabits) {
      if (!map[h.category]) map[h.category] = [];
      map[h.category].push(h);
    }
    return map;
  }, [activeHabits, categories]);

  const globalRankMap = useMemo(() => {
    const m: Record<string, number> = {};
    activeHabits.forEach((h, i) => { m[h.id] = i + 1; });
    return m;
  }, [activeHabits]);

  function setRating(habitId: string, rating: ActiveRating) {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setRatings((prev) => ({ ...prev, [habitId]: prev[habitId] === rating ? 'none' : rating }));
  }

  function rateCategory(categoryId: string, rating: ActiveRating) {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const habits = habitsByCategory[categoryId] ?? [];
    setRatings((prev) => {
      const next = { ...prev };
      for (const h of habits) next[h.id] = rating;
      return next;
    });
  }

  function rateAll(rating: ActiveRating) {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    setRatings((prev) => {
      const next = { ...prev };
      for (const h of activeHabits) next[h.id] = rating;
      return next;
    });
  }

  const activeHabitIds = new Set(activeHabits.map((h) => h.id));
  const activeRatings = Object.entries(ratings)
    .filter(([id, r]) => activeHabitIds.has(id) && r !== 'none' && r !== undefined)
    .map(([, r]) => r);
  const ratedEntries = activeRatings;
  const greenCount  = ratedEntries.filter((r) => r === 'green').length;
  const yellowCount = ratedEntries.filter((r) => r === 'yellow').length;
  const redCount    = ratedEntries.filter((r) => r === 'red').length;
  const totalActive = activeHabits.length;
  const progress    = totalActive > 0 ? ratedEntries.length / totalActive : 0;
  const allRated    = totalActive > 0 && activeHabits.every((h) => ratings[h.id] && ratings[h.id] !== 'none');

  return (
    <ScreenContainer edges={["top", "left", "right"]}>

      {/* ── Alarm banner ── */}
      <View style={[styles.alarmBanner, { backgroundColor: requireCheckin ? '#DC2626' : colors.primary }]}>
        <Text style={styles.alarmBannerText}>
          {requireCheckin
            ? '🔒 Complete your habits to turn off the alarm'
            : '⏰ Complete your check-in to dismiss the alarm'}
        </Text>
      </View>

      {/* ── Preview label ── */}
      <View style={[styles.previewLabel, { backgroundColor: '#00000040' }]}>
        <Text style={styles.previewLabelText}>👁 PREVIEW — nothing will be saved</Text>
      </View>

      {/* ── Header ── */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [styles.headerBtn, { opacity: pressed ? 0.5 : 1 }]}
        >
          <IconSymbol name="xmark" size={16} color={colors.muted} />
        </Pressable>

        <View style={styles.dateRow}>
          <View style={styles.dateLabelWrap}>
            <Text style={[styles.dateLabel, { color: colors.foreground }]}>
              {formatDisplayDate(currentDate)}
            </Text>
            <Text style={[styles.dateSub, { color: colors.muted }]}>
              {new Date(currentDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
            </Text>
          </View>
        </View>

        <View style={styles.headerBtn} />
      </View>

      {/* ── Progress bar ── */}
      <View style={[styles.progressTrack, { backgroundColor: colors.border }]}>
        <View style={[styles.progressFill, {
          width: `${Math.round(progress * 100)}%` as never,
          backgroundColor: colors.primary,
        }]} />
      </View>

      {/* ── Legend ── */}
      <View style={[styles.legendRow, { borderBottomColor: colors.border }]}>
        {RATINGS.map((r) => (
          <View key={r} style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: RATING_COLORS[r] }]} />
            <Text style={[styles.legendText, { color: colors.muted }]}>
              {r === 'red' ? 'Missed' : r === 'yellow' ? 'Okay' : 'Crushed it'}
            </Text>
          </View>
        ))}
      </View>

      {/* ── Global rate-all row ── */}
      <View style={[styles.rateAllRow, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <Text style={[styles.rateAllLabel, { color: colors.muted }]}>Rate All</Text>
        <View style={[styles.segmentedBtn, { backgroundColor: colors.border }]}>
          {RATINGS.map((r, i) => (
            <Pressable
              key={r}
              onPress={() => rateAll(r)}
              style={({ pressed }) => [
                styles.segment,
                i === 0 && styles.segmentFirst,
                i === RATINGS.length - 1 && styles.segmentLast,
                { backgroundColor: RATING_COLORS[r] + (pressed ? 'CC' : '88'), opacity: pressed ? 0.8 : 1 },
              ]}
            />
          ))}
        </View>
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

          return (
            <View key={cat.id} style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionEmoji}>{cat.emoji}</Text>
                <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{cat.label}</Text>
                <View style={{ flex: 1 }} />
                <View style={[styles.segmentedBtn, { backgroundColor: colors.border }]}>
                  {RATINGS.map((r, i) => (
                    <Pressable
                      key={r}
                      onPress={() => rateCategory(cat.id, r)}
                      style={({ pressed }) => [
                        styles.segment,
                        styles.segmentSmall,
                        i === 0 && styles.segmentFirst,
                        i === RATINGS.length - 1 && styles.segmentLast,
                        { backgroundColor: RATING_COLORS[r] + (pressed ? 'CC' : '88'), opacity: pressed ? 0.8 : 1 },
                      ]}
                    />
                  ))}
                </View>
              </View>

              <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                {habits.map((habit, idx) => {
                  const current: Rating = ratings[habit.id] ?? 'none';
                  const isLast = idx === habits.length - 1;
                  const rank = globalRankMap[habit.id] ?? (idx + 1);

                  return (
                    <View
                      key={habit.id}
                      style={[
                        styles.habitRow,
                        !isLast && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
                      ]}
                    >
                      <View style={styles.habitNameRow}>
                        <View style={[styles.habitNumBadge, {
                          backgroundColor: colors.primary + '22',
                          borderColor: colors.primary + '44',
                        }]}>
                          <Text style={[styles.habitNumText, { color: colors.primary }]}>{rank}</Text>
                        </View>
                        <Text style={[styles.habitName, { color: colors.foreground }]} numberOfLines={2}>
                          {habit.name}
                        </Text>
                      </View>

                      <View style={[styles.segmentedBtn, { backgroundColor: colors.border }]}>
                        {RATINGS.map((rating, i) => {
                          const isSelected = current === rating;
                          const col = RATING_COLORS[rating];
                          return (
                            <Pressable
                              key={rating}
                              onPress={() => setRating(habit.id, rating)}
                              style={({ pressed }) => [
                                styles.segment,
                                i === 0 && styles.segmentFirst,
                                i === RATINGS.length - 1 && styles.segmentLast,
                                {
                                  backgroundColor: isSelected ? col : col + '28',
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
        {ratedEntries.length > 0 && (
          <View style={styles.tally}>
            {greenCount  > 0 && <View style={[styles.tallyPill, { backgroundColor: '#22C55E18' }]}><Text style={[styles.tallyText, { color: '#22C55E' }]}>{greenCount} crushed</Text></View>}
            {yellowCount > 0 && <View style={[styles.tallyPill, { backgroundColor: '#F59E0B18' }]}><Text style={[styles.tallyText, { color: '#F59E0B' }]}>{yellowCount} okay</Text></View>}
            {redCount    > 0 && <View style={[styles.tallyPill, { backgroundColor: '#EF444418' }]}><Text style={[styles.tallyText, { color: '#EF4444' }]}>{redCount} missed</Text></View>}
            <Text style={[styles.tallyOf, { color: colors.muted }]}>{ratedEntries.length}/{totalActive}</Text>
          </View>
        )}

        {/* Snooze button — only shown when requireCheckin is off */}
        {!requireCheckin && (
          <Pressable
            onPress={() => {
              if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              router.back();
            }}
            style={({ pressed }) => [
              styles.snoozeBtn,
              { borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
            ]}
          >
            <IconSymbol name="clock.arrow.circlepath" size={16} color={colors.muted} />
            <Text style={[styles.snoozeBtnText, { color: colors.muted }]}>
              Snooze {snoozeMinutes} min
            </Text>
          </Pressable>
        )}

        <Pressable
          onPress={() => {
            if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            router.back();
          }}
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
            {allRated ? 'Save Review (Preview)' : `Rate all habits (${ratedEntries.length}/${totalActive})`}
          </Text>
        </Pressable>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  alarmBanner: {
    paddingVertical: 10, paddingHorizontal: 16,
    alignItems: 'center', justifyContent: 'center',
  },
  alarmBannerText: {
    color: '#fff', fontSize: 14, fontWeight: '700', textAlign: 'center',
  },
  previewLabel: {
    paddingVertical: 5, paddingHorizontal: 16,
    alignItems: 'center',
  },
  previewLabelText: {
    color: 'rgba(255,255,255,0.7)', fontSize: 11, fontWeight: '600', letterSpacing: 0.5,
  },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 12, paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  dateRow: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  dateLabelWrap: { alignItems: 'center', minWidth: 140 },
  dateLabel: { fontSize: 15, fontWeight: '700' },
  dateSub: { fontSize: 11, marginTop: 1 },

  progressTrack: { height: 2 },
  progressFill: { height: 2, borderRadius: 1 },

  legendRow: {
    flexDirection: 'row', justifyContent: 'center', gap: 20,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 7, height: 7, borderRadius: 4 },
  legendText: { fontSize: 12, fontWeight: '500' },

  scroll: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12 },

  section: { marginBottom: 18 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 8 },
  sectionEmoji: { fontSize: 16 },
  sectionTitle: { fontSize: 13, fontWeight: '700', letterSpacing: 0.3, textTransform: 'uppercase' },

  card: { borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },

  habitRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 14, paddingVertical: 13, gap: 12,
  },
  habitNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  habitNumBadge: {
    width: 26, height: 26, borderRadius: 7, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  habitNumText: { fontSize: 12, fontWeight: '700' },
  habitName: { fontSize: 15, lineHeight: 20, flex: 1 },

  segmentedBtn: {
    flexDirection: 'row',
    borderRadius: 11,
    overflow: 'hidden',
    gap: 2,
    padding: 2,
  },
  segment: { width: 36, height: 34, borderRadius: 8 },
  segmentFirst: { borderTopLeftRadius: 9, borderBottomLeftRadius: 9 },
  segmentLast:  { borderTopRightRadius: 9, borderBottomRightRadius: 9 },
  segmentSmall: { width: 28, height: 26 },

  rateAllRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rateAllLabel: { fontSize: 13, fontWeight: '600', letterSpacing: 0.3, textTransform: 'uppercase' },

  footer: {
    paddingHorizontal: 16, paddingTop: 10, paddingBottom: 28,
    borderTopWidth: StyleSheet.hairlineWidth, gap: 10,
  },
  tally: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  tallyPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 9, paddingVertical: 4, borderRadius: 20,
  },
  tallyText: { fontSize: 13, fontWeight: '700' },
  tallyOf: { fontSize: 12, marginLeft: 4 },

  snoozeBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    borderRadius: 14, paddingVertical: 13,
    borderWidth: 1.5,
  },
  snoozeBtnText: { fontSize: 15, fontWeight: '700' },

  saveBtn: {
    borderRadius: 14, paddingVertical: 15,
    alignItems: 'center', justifyContent: 'center',
  },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '700', letterSpacing: 0.2 },
});
