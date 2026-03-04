/**
 * Category Goal Detail Screen
 * Accessible from home screen goal cards and analytics page.
 * Shows all habits in the category with stats, progress, and breakdown.
 */
import {
  View, Text, ScrollView, Pressable, StyleSheet, LayoutChangeEvent,
} from "react-native";
import { useMemo, useState, useCallback } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Platform } from "react-native";
import * as Haptics from "expo-haptics";
import { ScreenContainer } from "@/components/screen-container";
import { useApp } from "@/lib/app-context";
import { useColors } from "@/hooks/use-colors";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { toDateString, LIFE_AREAS } from "@/lib/storage";
import { trpc } from "@/lib/trpc";
import { CategoryIcon } from "@/components/category-icon";
import { ScrollableCalendar } from "@/components/scrollable-calendar";
import { DayDetailSheet, CategoryDayScore } from "@/components/day-detail-sheet";

const LIFE_AREA_MAP = Object.fromEntries(LIFE_AREAS.map((a) => [a.id, a]));

function ratingColor(r: "green" | "yellow" | "red" | string) {
  if (r === "green") return "#22C55E";
  if (r === "yellow") return "#F59E0B";
  return "#EF4444";
}

export default function CategoryDetailScreen() {
  const { categoryId } = useLocalSearchParams<{ categoryId: string }>();
  const { categories, activeHabits, checkIns, getHabitWeeklyDone, getHabitMonthlyDone } = useApp();
  const colors = useColors();
  const router = useRouter();
  const { data: myTeams } = trpc.teams.list.useQuery();
  const teamNameMap = useMemo(() => {
    const map: Record<number, string> = {};
    for (const t of myTeams ?? []) map[t.id] = t.name;
    return map;
  }, [myTeams]);

  const category = useMemo(() => categories.find((c) => c.id === categoryId), [categories, categoryId]);
  const lifeArea = category?.lifeArea ? LIFE_AREA_MAP[category.lifeArea] : null;

  const habits = useMemo(
    () => activeHabits.filter((h) => h.category === categoryId),
    [activeHabits, categoryId],
  );

  const today = new Date();
  const todayStr = toDateString(today);

  // Scrollable calendar state
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [cardWidth, setCardWidth] = useState(0);
  const onCardLayout = useCallback((e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width - 32;
    if (w > 0) setCardWidth(w);
  }, []);

  const selectedDayCategoryScores: CategoryDayScore[] = useMemo(() => {
    if (!selectedDate || !category) return [];
    const dateEntries = checkIns.filter((e) => e.date === selectedDate);
    const catHabitIds = new Set(habits.map((h) => h.id));
    const catEntries = dateEntries.filter((e) => catHabitIds.has(e.habitId) && e.rating !== "none");
    const green = catEntries.filter((e) => e.rating === "green").length;
    const yellow = catEntries.filter((e) => e.rating === "yellow").length;
    const red = catEntries.filter((e) => e.rating === "red").length;
    const total = green + yellow + red;
    const score = total === 0 ? null : (green * 1 + yellow * 0.5) / total;
    return [{ category, score, green, yellow, red, total }];
  }, [selectedDate, checkIns, habits, category]);

  // Per-habit stats
  const habitStats = useMemo(() => {
    return habits.map((habit) => {
      const habitCheckIns = checkIns.filter((e) => e.habitId === habit.id && e.rating !== "none");
      const ratedDates = new Set(habitCheckIns.map((e) => e.date));

      // Rating breakdown
      let green = 0, yellow = 0, red = 0;
      for (const e of habitCheckIns) {
        if (e.rating === "green") green++;
        else if (e.rating === "yellow") yellow++;
        else if (e.rating === "red") red++;
      }
      const total = green + yellow + red;
      const score = total > 0 ? (green * 1 + yellow * 0.5) / total : null;

      // Current streak
      const yesterdayD = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
      const yesterdayStr = toDateString(yesterdayD);
      let anchorStr: string | null = null;
      if (ratedDates.has(todayStr)) anchorStr = todayStr;
      else if (ratedDates.has(yesterdayStr)) anchorStr = yesterdayStr;
      let streak = 0;
      if (anchorStr) {
        const anchorD = new Date(anchorStr + "T12:00:00");
        for (let i = 0; i < 365; i++) {
          const d = new Date(anchorD.getFullYear(), anchorD.getMonth(), anchorD.getDate() - i);
          if (ratedDates.has(toDateString(d))) streak++;
          else break;
        }
      }

      // Goal progress
      const isMonthly = habit.frequencyType === "monthly";
      let goalDone = 0, goalTarget = 0;
      if (isMonthly && habit.monthlyGoal) {
        goalDone = getHabitMonthlyDone(habit.id);
        goalTarget = habit.monthlyGoal;
      } else if (!isMonthly && habit.weeklyGoal) {
        goalDone = getHabitWeeklyDone(habit.id);
        goalTarget = habit.weeklyGoal;
      }
      const goalPct = goalTarget > 0 ? Math.min(goalDone / goalTarget, 1) : 0;
      const goalMet = goalTarget > 0 && goalDone >= goalTarget;
      const goalLabel = isMonthly ? "This Month" : "This Week";
      const goalPeriod = isMonthly ? `/mo` : `/wk`;

      return { habit, green, yellow, red, total, score, streak, goalDone, goalTarget, goalPct, goalMet, goalLabel, goalPeriod };
    });
  }, [habits, checkIns, getHabitWeeklyDone, getHabitMonthlyDone, todayStr]);

  // 6-month heatmap: daily weighted score for this category
  const heatmapScores = useMemo(() => {
    const habitIds = new Set(habits.map((h) => h.id));
    // Group check-ins by date
    const byDate: Record<string, { green: number; yellow: number; red: number }> = {};
    for (const e of checkIns) {
      if (!habitIds.has(e.habitId) || e.rating === "none") continue;
      if (!byDate[e.date]) byDate[e.date] = { green: 0, yellow: 0, red: 0 };
      if (e.rating === "green") byDate[e.date].green++;
      else if (e.rating === "yellow") byDate[e.date].yellow++;
      else if (e.rating === "red") byDate[e.date].red++;
    }
    // Convert to weighted score per date
    const scoreByDate: Record<string, number> = {};
    for (const [date, counts] of Object.entries(byDate)) {
      const total = counts.green + counts.yellow + counts.red;
      if (total > 0) {
        scoreByDate[date] = (counts.green * 1 + counts.yellow * 0.5) / total;
      }
    }
    return scoreByDate;
  }, [habits, checkIns]);

  // Category-level stats (last 30 days)
  const categoryStats = useMemo(() => {
    const habitIds = new Set(habits.map((h) => h.id));
    let green = 0, yellow = 0, red = 0;
    for (let i = 1; i <= 30; i++) {
      const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
      const dateStr = toDateString(d);
      for (const e of checkIns.filter((c) => c.date === dateStr && habitIds.has(c.habitId) && c.rating !== "none")) {
        if (e.rating === "green") green++;
        else if (e.rating === "yellow") yellow++;
        else if (e.rating === "red") red++;
      }
    }
    const total = green + yellow + red;
    const score = total > 0 ? (green * 1 + yellow * 0.5) / total : null;
    return { green, yellow, red, total, score };
  }, [habits, checkIns]);

  const scoreColor = categoryStats.score !== null
    ? ratingColor(categoryStats.score >= 0.75 ? "green" : categoryStats.score >= 0.4 ? "yellow" : "red")
    : colors.muted;

  if (!category) {
    return (
      <ScreenContainer>
        <View style={styles.center}>
          <Text style={{ color: colors.muted, fontSize: 16 }}>Category not found.</Text>
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      {/* Nav bar */}
      <View style={[styles.navBar, { borderBottomColor: colors.border }]}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [styles.backBtn, { opacity: pressed ? 0.5 : 1 }]}
        >
          <IconSymbol name="chevron.left" size={20} color={colors.primary} />
          <Text style={[styles.backText, { color: colors.primary }]}>Back</Text>
        </Pressable>
        <Text style={[styles.navTitle, { color: colors.foreground }]} numberOfLines={1}>
          {category.label}
        </Text>
        <View style={{ width: 70 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* ── Hero card ── */}
        <View style={[styles.heroCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <CategoryIcon
            categoryId={category.id}
            lifeArea={category.lifeArea}
            size={26}
            color={colors.primary}
            bgColor={colors.primary + "22"}
            bgSize={52}
            borderRadius={14}
          />
          <View style={styles.heroInfo}>
            <Text style={[styles.heroName, { color: colors.foreground }]}>{category.label}</Text>
            {lifeArea && (
              <Text style={[styles.heroCat, { color: colors.muted }]}>{lifeArea.label}</Text>
            )}

          </View>
          {categoryStats.score !== null && (
            <View style={[styles.scoreChip, { backgroundColor: scoreColor + "22", borderColor: scoreColor + "55" }]}>
              <Text style={[styles.scoreChipText, { color: scoreColor }]}>
                {Math.round(categoryStats.score * 100)}%
              </Text>
            </View>
          )}
        </View>

        {/* ── Scrollable Calendar ── */}
        <View
          onLayout={onCardLayout}
          style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
        >
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Calendar</Text>

          {habits.length > 0 ? (
            <ScrollView
              style={styles.calendarScroll}
              nestedScrollEnabled
              showsVerticalScrollIndicator={false}
            >
              <ScrollableCalendar
                habits={habits}
                checkIns={checkIns}
                monthCount={6}
                onDayPress={(date) => {
                  const hasEntry = checkIns.some((e) => e.date === date && e.rating !== "none");
                  if (!hasEntry) {
                    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    router.push(`/checkin?date=${date}` as never);
                  } else {
                    setSelectedDate(date);
                  }
                }}
                containerWidth={cardWidth > 0 ? cardWidth : undefined}
              />
            </ScrollView>
          ) : (
            <Text style={[styles.emptyText, { color: colors.muted }]}>No habits yet.</Text>
          )}

          {/* Habit key — number badge + name */}
          {habits.length > 0 && (
            <View style={styles.habitKeySection}>
              <View style={[styles.habitKeyDivider, { backgroundColor: colors.border }]} />
              <Text style={[styles.habitKeyTitle, { color: colors.muted }]}>Habits in this goal</Text>
              {habits.map((h, idx) => (
                <Pressable
                  key={h.id}
                  onPress={() => {
                    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    router.push(`/habit-detail?habitId=${h.id}` as never);
                  }}
                  style={({ pressed }) => [styles.habitKeyRow, { opacity: pressed ? 0.7 : 1 }]}
                >
                  <View style={[styles.habitKeyBadge, { backgroundColor: colors.primary + '22', borderColor: colors.primary + '44' }]}>
                    <Text style={[styles.habitKeyBadgeNum, { color: colors.primary }]}>{idx + 1}</Text>
                  </View>
                  <Text style={[styles.habitKeyName, { color: colors.foreground }]} numberOfLines={1}>{h.name}</Text>
                  <IconSymbol name="chevron.right" size={12} color={colors.muted} />
                </Pressable>
              ))}
            </View>
          )}

          {/* Rating legend */}
          <View style={styles.inlineLegend}>
            {[
              { color: "#22C55E", label: "Crushed" },
              { color: "#F59E0B", label: "Okay" },
              { color: "#EF4444", label: "Missed" },
            ].map((item) => (
              <View key={item.label} style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: item.color }]} />
                <Text style={[styles.legendText, { color: colors.muted }]}>{item.label}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* ── Category rating breakdown ── */}
        {categoryStats.total > 0 && (
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>30-Day Breakdown</Text>
            <View style={styles.breakdownRow}>
              <View style={styles.breakdownItem}>
                <View style={[styles.breakdownDot, { backgroundColor: "#22C55E" }]} />
                <Text style={[styles.breakdownNum, { color: "#22C55E" }]}>{categoryStats.green}</Text>
                <Text style={[styles.breakdownLabel, { color: colors.muted }]}>Crushed</Text>
              </View>
              <View style={styles.breakdownItem}>
                <View style={[styles.breakdownDot, { backgroundColor: "#F59E0B" }]} />
                <Text style={[styles.breakdownNum, { color: "#F59E0B" }]}>{categoryStats.yellow}</Text>
                <Text style={[styles.breakdownLabel, { color: colors.muted }]}>Okay</Text>
              </View>
              <View style={styles.breakdownItem}>
                <View style={[styles.breakdownDot, { backgroundColor: "#EF4444" }]} />
                <Text style={[styles.breakdownNum, { color: "#EF4444" }]}>{categoryStats.red}</Text>
                <Text style={[styles.breakdownLabel, { color: colors.muted }]}>Missed</Text>
              </View>
            </View>
            {/* Stacked bar */}
            <View style={[styles.stackedBar, { backgroundColor: colors.border }]}>
              {categoryStats.green > 0 && (
                <View style={[styles.stackedSeg, { flex: categoryStats.green, backgroundColor: "#22C55E" }]} />
              )}
              {categoryStats.yellow > 0 && (
                <View style={[styles.stackedSeg, { flex: categoryStats.yellow, backgroundColor: "#F59E0B" }]} />
              )}
              {categoryStats.red > 0 && (
                <View style={[styles.stackedSeg, { flex: categoryStats.red, backgroundColor: "#EF4444" }]} />
              )}
            </View>
          </View>
        )}

        {/* ── Habits ── */}
        <Text style={[styles.sectionHeader, { color: colors.foreground }]}>Habits</Text>

        {habitStats.length === 0 && (
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.emptyText, { color: colors.muted }]}>No habits in this category yet.</Text>
          </View>
        )}

        {habitStats.map(({ habit, green, yellow, red, total, score, streak, goalDone, goalTarget, goalPct, goalMet, goalLabel, goalPeriod }, habitIndex) => {
          const hScoreColor = score !== null
            ? ratingColor(score >= 0.75 ? "green" : score >= 0.4 ? "yellow" : "red")
            : colors.muted;

          return (
            <Pressable
              key={habit.id}
              onPress={() => {
                if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.push((`/habit-detail?habitId=${habit.id}`) as never);
              }}
              style={({ pressed }) => [
                styles.habitCard,
                {
                  backgroundColor: colors.surface,
                  borderColor: goalMet ? "#22C55E55" : colors.border,
                  borderWidth: goalMet ? 1.5 : 1,
                  opacity: pressed ? 0.85 : 1,
                },
              ]}
            >
              {/* Habit header */}
              <View style={styles.habitHeader}>
                <View style={[styles.habitIconWrap, { backgroundColor: colors.primary + "22", borderWidth: 1, borderColor: colors.primary + "44" }]}>
                  <Text style={[styles.habitEmoji, { color: colors.primary, fontWeight: '700', fontSize: 15 }]}>
                    #{habitIndex + 1}
                  </Text>
                </View>
                <View style={styles.habitInfo}>
                  <Text style={[styles.habitName, { color: colors.foreground }]} numberOfLines={1}>{habit.name}</Text>
                  {habit.teamId && teamNameMap[habit.teamId] && (
                    <View style={[styles.teamBadge, { backgroundColor: colors.primary + '18', borderColor: colors.primary + '40' }]}>
                      <Text style={[styles.teamBadgeText, { color: colors.primary }]}>👥 {teamNameMap[habit.teamId]}</Text>
                    </View>
                  )}
                  {streak > 0 && (
                    <Text style={[styles.habitStreak, { color: colors.muted }]}>🔥 {streak} day streak</Text>
                  )}
                </View>
                <View style={styles.habitRight}>
                  {score !== null && (
                    <Text style={[styles.habitScore, { color: hScoreColor }]}>{Math.round(score * 100)}%</Text>
                  )}
                  <IconSymbol name="chevron.right" size={14} color={colors.muted} />
                </View>
              </View>

              {/* Goal progress */}
              {goalTarget > 0 && (
                <View style={styles.goalSection}>
                  <View style={styles.goalLabelRow}>
                    <Text style={[styles.goalLabel, { color: colors.muted }]}>{goalLabel} Goal</Text>
                    <Text style={[styles.goalCount, { color: goalMet ? "#22C55E" : colors.primary }]}>
                      {goalDone}/{goalTarget}{goalPeriod}
                    </Text>
                  </View>
                  <View style={[styles.goalBarBg, { backgroundColor: goalMet ? "#22C55E22" : colors.border, borderColor: goalMet ? "#22C55E44" : "transparent", borderWidth: goalMet ? 1 : 0 }]}>
                    <View style={[
                      styles.goalBarFill,
                      {
                        width: `${goalPct * 100}%`,
                        backgroundColor: goalMet ? "#22C55E" : colors.primary,
                        ...(goalMet ? { shadowColor: "#22C55E", shadowOpacity: 0.5, shadowRadius: 4, shadowOffset: { width: 0, height: 0 } } : {}),
                      },
                    ]} />
                  </View>
                </View>
              )}

              {/* Mini rating breakdown */}
              {total > 0 && (
                <View style={styles.miniBreakdown}>
                  <View style={styles.miniBreakdownItem}>
                    <View style={[styles.miniDot, { backgroundColor: "#22C55E" }]} />
                    <Text style={[styles.miniNum, { color: "#22C55E" }]}>{green}</Text>
                  </View>
                  <View style={styles.miniBreakdownItem}>
                    <View style={[styles.miniDot, { backgroundColor: "#F59E0B" }]} />
                    <Text style={[styles.miniNum, { color: "#F59E0B" }]}>{yellow}</Text>
                  </View>
                  <View style={styles.miniBreakdownItem}>
                    <View style={[styles.miniDot, { backgroundColor: "#EF4444" }]} />
                    <Text style={[styles.miniNum, { color: "#EF4444" }]}>{red}</Text>
                  </View>
                  <Text style={[styles.miniTotal, { color: colors.muted }]}>{total} total</Text>
                </View>
              )}
            </Pressable>
          );
        })}

        <View style={{ height: 40 }} />
      </ScrollView>

      <DayDetailSheet
        visible={selectedDate !== null}
        date={selectedDate ?? ""}
        displayDate={selectedDate ?? ""}
        categoryScores={selectedDayCategoryScores}
        onClose={() => setSelectedDate(null)}
        onEdit={() => {
          const d = selectedDate;
          setSelectedDate(null);
          setTimeout(() => router.push(`/checkin?date=${d}` as never), 100);
        }}
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  navBar: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 0.5,
  },
  backBtn: { flexDirection: "row", alignItems: "center", gap: 4, minWidth: 70 },
  backText: { fontSize: 16 },
  navTitle: { fontSize: 16, fontWeight: "700", flex: 1, textAlign: "center" },
  scroll: { padding: 16, paddingBottom: 40 },

  heroCard: {
    flexDirection: "row", alignItems: "flex-start", gap: 14,
    borderRadius: 16, padding: 16, marginBottom: 14, borderWidth: 1,
  },
  heroIconWrap: { width: 52, height: 52, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  heroEmoji: { fontSize: 26 },
  heroInfo: { flex: 1, gap: 3 },
  heroName: { fontSize: 18, fontWeight: "700", letterSpacing: -0.3 },
  heroCat: { fontSize: 13 },
  heroDesc: { fontSize: 13, marginTop: 2, lineHeight: 18 },
  scoreChip: {
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, borderWidth: 1,
    alignSelf: "flex-start",
  },
  scoreChipText: { fontSize: 14, fontWeight: "800" },

  card: { borderRadius: 16, padding: 16, marginBottom: 14, borderWidth: 1 },
  sectionTitle: { fontSize: 15, fontWeight: "700", marginBottom: 12 },
  sectionHeader: { fontSize: 17, fontWeight: "700", marginBottom: 10, marginTop: 4 },

  breakdownRow: { flexDirection: "row", gap: 20, marginBottom: 12 },
  breakdownItem: { alignItems: "center", gap: 4 },
  breakdownDot: { width: 10, height: 10, borderRadius: 5 },
  breakdownNum: { fontSize: 22, fontWeight: "800" },
  breakdownLabel: { fontSize: 12 },

  stackedBar: { height: 8, borderRadius: 4, flexDirection: "row", overflow: "hidden" },
  stackedSeg: { borderRadius: 0 },

  emptyText: { fontSize: 14, textAlign: "center", paddingVertical: 8 },

  habitCard: { borderRadius: 16, padding: 14, marginBottom: 12, borderWidth: 1, gap: 10 },
  habitHeader: { flexDirection: "row", alignItems: "center", gap: 12 },
  habitIconWrap: { width: 42, height: 42, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  habitEmoji: { fontSize: 20 },
  habitInfo: { flex: 1, gap: 2 },
  habitName: { fontSize: 15, fontWeight: "700" },
  habitStreak: { fontSize: 12 },
  habitRight: { flexDirection: "row", alignItems: "center", gap: 6 },
  habitScore: { fontSize: 15, fontWeight: "800" },

  goalSection: { gap: 6 },
  goalLabelRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  goalLabel: { fontSize: 12 },
  goalCount: { fontSize: 13, fontWeight: "700" },
  goalBarBg: { height: 8, borderRadius: 4, overflow: "hidden" },
  goalBarFill: { height: "100%", borderRadius: 4 },

  miniBreakdown: { flexDirection: "row", alignItems: "center", gap: 12 },
  miniBreakdownItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  miniDot: { width: 8, height: 8, borderRadius: 4 },
  miniNum: { fontSize: 13, fontWeight: "700" },
  miniTotal: { fontSize: 12, marginLeft: "auto" },
  teamBadge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginTop: 2,
    marginBottom: 2,
  },
  teamBadgeText: { fontSize: 11, fontWeight: '600' },

  calendarScroll: { maxHeight: 420 },

  // Habit key legend
  habitKeySection: { marginTop: 12, gap: 6 },
  habitKeyDivider: { height: StyleSheet.hairlineWidth, marginBottom: 8 },
  habitKeyTitle: { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 },
  habitKeyRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
  habitKeyBadge: { width: 22, height: 22, borderRadius: 6, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  habitKeyBadgeNum: { fontSize: 11, fontWeight: '800' },
  habitKeyName: { flex: 1, fontSize: 13, fontWeight: '500' },

  // Month calendar
  monthNav: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  monthNavBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  monthTitle: { fontSize: 15, fontWeight: '700' },
  inlineLegend: {
    flexDirection: 'row', justifyContent: 'center',
    gap: 12, marginTop: 10, flexWrap: 'wrap',
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot: { width: 7, height: 7, borderRadius: 4 },
  legendText: { fontSize: 10 },
});
