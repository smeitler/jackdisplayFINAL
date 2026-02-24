/**
 * Habit Detail Screen
 * Accessed from the Analytics (Progress) tab by tapping a habit chip.
 * Shows: full calendar heatmap for the habit, streak, best streak,
 * monthly breakdown, rating distribution, and goal progress.
 */
import {
  View, Text, ScrollView, Pressable, StyleSheet, LayoutChangeEvent,
} from "react-native";
import { useState, useMemo } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { CategoryCalendar } from "@/components/category-calendar";
import { useApp } from "@/lib/app-context";
import { useColors } from "@/hooks/use-colors";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { toDateString } from "@/lib/storage";

const MONTH_NAMES = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

function ratingColor(r: string) {
  if (r === "green") return "#22C55E";
  if (r === "yellow") return "#F59E0B";
  if (r === "red") return "#EF4444";
  return "#9090B8";
}

export default function HabitDetailScreen() {
  const { habitId } = useLocalSearchParams<{ habitId: string }>();
  const { checkIns, activeHabits, categories } = useApp();
  const colors = useColors();
  const router = useRouter();

  const today = new Date();
  const [calYear, setCalYear] = useState(today.getFullYear());
  const [calMonth, setCalMonth] = useState(today.getMonth());
  const [cardWidth, setCardWidth] = useState(0);

  function onCardLayout(e: LayoutChangeEvent) {
    const w = e.nativeEvent.layout.width - 28;
    if (w > 0) setCardWidth(w);
  }

  const habit = useMemo(() => activeHabits.find((h) => h.id === habitId), [activeHabits, habitId]);
  const category = useMemo(() => habit ? categories.find((c) => c.id === habit.category) : null, [habit, categories]);

  // All check-ins for this habit, sorted by date ascending
  const habitCheckIns = useMemo(
    () => checkIns.filter((e) => e.habitId === habitId && e.rating !== "none").sort((a, b) => a.date.localeCompare(b.date)),
    [checkIns, habitId],
  );

  // Date set for quick lookup
  const ratedDates = useMemo(() => new Set(habitCheckIns.map((e) => e.date)), [habitCheckIns]);
  const ratingByDate = useMemo(() => {
    const m: Record<string, string> = {};
    for (const e of habitCheckIns) m[e.date] = e.rating;
    return m;
  }, [habitCheckIns]);

  // ── Stats ──────────────────────────────────────────────────────────────────

  // Current streak (consecutive days going back from yesterday)
  const { currentStreak, bestStreak } = useMemo(() => {
    const todayStr = toDateString(today);
    const yesterdayD = new Date(today); yesterdayD.setDate(today.getDate() - 1);
    const yesterdayStr = toDateString(yesterdayD);

    // Build a sorted list of all rated dates
    const sorted = [...ratedDates].sort();

    // Current streak: consecutive days ending at yesterday (or today)
    let cur = 0;
    const startCheck = ratedDates.has(todayStr) ? todayStr : yesterdayStr;
    const startD = new Date(startCheck + "T12:00:00");
    for (let i = 0; i < 365; i++) {
      const d = new Date(startD); d.setDate(startD.getDate() - i);
      if (ratedDates.has(toDateString(d))) cur++;
      else break;
    }

    // Best streak: scan all dates
    let best = 0, run = 0;
    let prevD: Date | null = null;
    for (const ds of sorted) {
      const d = new Date(ds + "T12:00:00");
      if (prevD) {
        const diff = Math.round((d.getTime() - prevD.getTime()) / 86400000);
        if (diff === 1) { run++; }
        else run = 1;
      } else {
        run = 1;
      }
      if (run > best) best = run;
      prevD = d;
    }

    return { currentStreak: cur, bestStreak: best };
  }, [ratedDates, today]);

  // Rating distribution totals
  const { green, yellow, red, total } = useMemo(() => {
    let g = 0, y = 0, r = 0;
    for (const e of habitCheckIns) {
      if (e.rating === "green") g++;
      else if (e.rating === "yellow") y++;
      else if (e.rating === "red") r++;
    }
    return { green: g, yellow: y, red: r, total: g + y + r };
  }, [habitCheckIns]);

  // Score (weighted average)
  const score = total > 0 ? (green * 1 + yellow * 0.5) / total : null;

  // Monthly breakdown for the last 6 months
  const monthlyBreakdown = useMemo(() => {
    const months: { year: number; month: number; green: number; yellow: number; red: number; total: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
      const y = d.getFullYear(), m = d.getMonth();
      const prefix = `${y}-${String(m + 1).padStart(2, "0")}`;
      const entries = habitCheckIns.filter((e) => e.date.startsWith(prefix));
      const g = entries.filter((e) => e.rating === "green").length;
      const ye = entries.filter((e) => e.rating === "yellow").length;
      const r = entries.filter((e) => e.rating === "red").length;
      months.push({ year: y, month: m, green: g, yellow: ye, red: r, total: g + ye + r });
    }
    return months;
  }, [habitCheckIns, today]);

  // Goal progress this period
  const goalInfo = useMemo(() => {
    if (!habit) return null;
    const isMonthly = habit.frequencyType === "monthly";
    if (isMonthly && habit.monthlyGoal) {
      const prefix = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
      const done = habitCheckIns.filter((e) => e.date.startsWith(prefix)).length;
      return { done, goal: habit.monthlyGoal, label: "This Month", period: "monthly" };
    }
    if (!isMonthly && habit.weeklyGoal) {
      const dayOfWeek = today.getDay();
      const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
      const monday = new Date(today); monday.setDate(today.getDate() + mondayOffset);
      let done = 0;
      for (let i = 0; i < 7; i++) {
        const d = new Date(monday); d.setDate(monday.getDate() + i);
        if (ratedDates.has(toDateString(d))) done++;
      }
      return { done, goal: habit.weeklyGoal, label: "This Week", period: "weekly" };
    }
    return null;
  }, [habit, habitCheckIns, ratedDates, today]);

  function prevMonth() {
    if (calMonth === 0) { setCalYear(y => y - 1); setCalMonth(11); }
    else setCalMonth(m => m - 1);
  }
  function nextMonth() {
    if (calYear === today.getFullYear() && calMonth >= today.getMonth()) return;
    if (calMonth === 11) { setCalYear(y => y + 1); setCalMonth(0); }
    else setCalMonth(m => m + 1);
  }
  const canGoForward = !(calYear === today.getFullYear() && calMonth >= today.getMonth());

  if (!habit) {
    return (
      <ScreenContainer>
        <View style={styles.center}>
          <Text style={{ color: colors.muted, fontSize: 16 }}>Habit not found.</Text>
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      {/* Back header */}
      <View style={[styles.navBar, { borderBottomColor: colors.border }]}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [styles.backBtn, { opacity: pressed ? 0.5 : 1 }]}
        >
          <IconSymbol name="chevron.left" size={20} color={colors.primary} />
          <Text style={[styles.backText, { color: colors.primary }]}>Analytics</Text>
        </Pressable>
        <Text style={[styles.navTitle, { color: colors.foreground }]} numberOfLines={1}>
          {habit.emoji} {habit.name}
        </Text>
        <View style={{ width: 80 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* ── Hero header ── */}
        <View style={[styles.heroCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={styles.heroEmoji}>{habit.emoji}</Text>
          <View style={styles.heroInfo}>
            <Text style={[styles.heroName, { color: colors.foreground }]}>{habit.name}</Text>
            {category && (
              <Text style={[styles.heroCat, { color: colors.muted }]}>
                {category.emoji} {category.label}
              </Text>
            )}
            {habit.description ? (
              <Text style={[styles.heroDesc, { color: colors.muted }]}>{habit.description}</Text>
            ) : null}
          </View>
          {score !== null && (
            <View style={[styles.scoreChip, { backgroundColor: ratingColor(score >= 0.75 ? "green" : score >= 0.4 ? "yellow" : "red") + "22", borderColor: ratingColor(score >= 0.75 ? "green" : score >= 0.4 ? "yellow" : "red") + "55" }]}>
              <Text style={[styles.scoreChipText, { color: ratingColor(score >= 0.75 ? "green" : score >= 0.4 ? "yellow" : "red") }]}>
                {Math.round(score * 100)}%
              </Text>
            </View>
          )}
        </View>

        {/* ── Stat tiles ── */}
        <View style={styles.statRow}>
          <View style={[styles.statTile, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={styles.statIcon}>🔥</Text>
            <Text style={[styles.statValue, { color: colors.foreground }]}>{currentStreak}</Text>
            <Text style={[styles.statLabel, { color: colors.muted }]}>Streak</Text>
          </View>
          <View style={[styles.statTile, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={styles.statIcon}>🏆</Text>
            <Text style={[styles.statValue, { color: colors.foreground }]}>{bestStreak}</Text>
            <Text style={[styles.statLabel, { color: colors.muted }]}>Best Streak</Text>
          </View>
          <View style={[styles.statTile, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={styles.statIcon}>📅</Text>
            <Text style={[styles.statValue, { color: colors.foreground }]}>{total}</Text>
            <Text style={[styles.statLabel, { color: colors.muted }]}>Total Days</Text>
          </View>
        </View>

        {/* ── Goal progress ── */}
        {goalInfo && (
          <View style={[styles.goalCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.goalHeader}>
              <Text style={[styles.goalLabel, { color: colors.foreground }]}>{goalInfo.label} Goal</Text>
              <Text style={[styles.goalCount, { color: goalInfo.done >= goalInfo.goal ? "#22C55E" : colors.primary }]}>
                {goalInfo.done} / {goalInfo.goal}
              </Text>
            </View>
            <View style={[styles.goalBarBg, { backgroundColor: colors.border }]}>
              <View style={[
                styles.goalBarFill,
                {
                  width: `${Math.min(goalInfo.done / goalInfo.goal, 1) * 100}%` as any,
                  backgroundColor: goalInfo.done >= goalInfo.goal ? "#22C55E" : colors.primary,
                },
              ]} />
            </View>
            {goalInfo.done >= goalInfo.goal && (
              <Text style={styles.goalMet}>✓ Goal met — great work!</Text>
            )}
          </View>
        )}

        {/* ── Rating distribution ── */}
        {total > 0 && (
          <View style={[styles.distCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Rating Breakdown</Text>
            <View style={styles.distRow}>
              {[
                { label: "Crushed", count: green, color: "#22C55E", emoji: "🟢" },
                { label: "Okay",    count: yellow, color: "#F59E0B", emoji: "🟡" },
                { label: "Missed",  count: red,    color: "#EF4444", emoji: "🔴" },
              ].map((item) => (
                <View key={item.label} style={styles.distItem}>
                  <Text style={styles.distEmoji}>{item.emoji}</Text>
                  <Text style={[styles.distCount, { color: item.color }]}>{item.count}</Text>
                  <Text style={[styles.distLabel, { color: colors.muted }]}>{item.label}</Text>
                  <View style={[styles.distBarBg, { backgroundColor: colors.border }]}>
                    <View style={[
                      styles.distBarFill,
                      { height: total > 0 ? `${(item.count / total) * 100}%` as any : "0%", backgroundColor: item.color },
                    ]} />
                  </View>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* ── Monthly trend (last 6 months) ── */}
        <View style={[styles.trendCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Monthly Trend</Text>
          <View style={styles.trendRow}>
            {monthlyBreakdown.map((mb) => {
              const monthTotal = mb.total;
              const monthScore = monthTotal > 0 ? (mb.green * 1 + mb.yellow * 0.5) / monthTotal : null;
              const barColor = monthScore === null ? colors.border : ratingColor(monthScore >= 0.75 ? "green" : monthScore >= 0.4 ? "yellow" : "red");
              const barH = monthScore === null ? 4 : Math.max(8, Math.round(monthScore * 60));
              return (
                <View key={`${mb.year}-${mb.month}`} style={styles.trendCol}>
                  <View style={styles.trendBarWrap}>
                    <View style={[styles.trendBar, { height: barH, backgroundColor: barColor }]} />
                  </View>
                  <Text style={[styles.trendMonthLabel, { color: colors.muted }]}>
                    {MONTH_NAMES[mb.month].slice(0, 3)}
                  </Text>
                  {monthScore !== null && (
                    <Text style={[styles.trendPct, { color: barColor }]}>
                      {Math.round(monthScore * 100)}%
                    </Text>
                  )}
                </View>
              );
            })}
          </View>
        </View>

        {/* ── Full calendar heatmap ── */}
        <View
          style={[styles.calCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
          onLayout={onCardLayout}
        >
          {/* Month nav */}
          <View style={[styles.monthNav, { borderBottomColor: colors.border }]}>
            <Pressable
              onPress={prevMonth}
              style={({ pressed }) => [styles.monthNavBtn, { opacity: pressed ? 0.5 : 1 }]}
            >
              <IconSymbol name="chevron.left" size={16} color={colors.primary} />
            </Pressable>
            <Text style={[styles.monthTitle, { color: colors.foreground }]}>
              {MONTH_NAMES[calMonth]} {calYear}
            </Text>
            <Pressable
              onPress={canGoForward ? nextMonth : undefined}
              style={({ pressed }) => [styles.monthNavBtn, { opacity: canGoForward ? (pressed ? 0.5 : 1) : 0.2 }]}
            >
              <IconSymbol name="chevron.right" size={16} color={colors.primary} />
            </Pressable>
          </View>

          <View style={styles.calendarWrap}>
            <CategoryCalendar
              year={calYear}
              month={calMonth}
              habits={habit ? [habit] : []}
              checkIns={checkIns}
              containerWidth={cardWidth > 0 ? cardWidth : undefined}
              selectedHabitId={habit?.id}
            />
          </View>

          {/* Legend */}
          <View style={styles.legend}>
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

        {/* ── Recent history list ── */}
        <View style={[styles.historyCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Recent History</Text>
          {habitCheckIns.length === 0 ? (
            <Text style={[styles.emptyText, { color: colors.muted }]}>No check-ins yet.</Text>
          ) : (
            [...habitCheckIns].reverse().slice(0, 14).map((entry) => {
              const d = new Date(entry.date + "T12:00:00");
              const label = d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
              const rc = ratingColor(entry.rating);
              const ratingLabel = entry.rating === "green" ? "Crushed it" : entry.rating === "yellow" ? "Okay" : "Missed";
              return (
                <View key={entry.date} style={[styles.historyRow, { borderBottomColor: colors.border }]}>
                  <View style={[styles.historyDot, { backgroundColor: rc }]} />
                  <Text style={[styles.historyDate, { color: colors.foreground }]}>{label}</Text>
                  <Text style={[styles.historyRating, { color: rc }]}>{ratingLabel}</Text>
                </View>
              );
            })
          )}
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  scroll: { padding: 20, paddingBottom: 40 },

  navBar: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 0.5,
  },
  backBtn: { flexDirection: "row", alignItems: "center", gap: 4, width: 80 },
  backText: { fontSize: 15, fontWeight: "600" },
  navTitle: { flex: 1, fontSize: 15, fontWeight: "700", textAlign: "center" },

  heroCard: {
    flexDirection: "row", alignItems: "flex-start", gap: 12,
    borderRadius: 16, padding: 16, borderWidth: 1, marginBottom: 14,
  },
  heroEmoji: { fontSize: 36 },
  heroInfo: { flex: 1, gap: 2 },
  heroName: { fontSize: 20, fontWeight: "700", letterSpacing: -0.3 },
  heroCat: { fontSize: 13 },
  heroDesc: { fontSize: 13, marginTop: 4, lineHeight: 18 },
  scoreChip: {
    paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: 20, borderWidth: 1, alignSelf: "flex-start",
  },
  scoreChipText: { fontSize: 14, fontWeight: "700" },

  statRow: { flexDirection: "row", gap: 10, marginBottom: 14 },
  statTile: {
    flex: 1, borderRadius: 14, padding: 12, borderWidth: 1,
    alignItems: "center", gap: 2,
  },
  statIcon: { fontSize: 20 },
  statValue: { fontSize: 22, fontWeight: "800" },
  statLabel: { fontSize: 10, fontWeight: "500", textAlign: "center" },

  goalCard: {
    borderRadius: 16, padding: 16, borderWidth: 1, marginBottom: 14, gap: 10,
  },
  goalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  goalLabel: { fontSize: 15, fontWeight: "600" },
  goalCount: { fontSize: 15, fontWeight: "800" },
  goalBarBg: { height: 10, borderRadius: 5, overflow: "hidden" },
  goalBarFill: { height: 10, borderRadius: 5 },
  goalMet: { fontSize: 13, fontWeight: "700", color: "#22C55E" },

  distCard: {
    borderRadius: 16, padding: 16, borderWidth: 1, marginBottom: 14,
  },
  sectionTitle: { fontSize: 16, fontWeight: "700", marginBottom: 12 },
  distRow: { flexDirection: "row", gap: 10 },
  distItem: { flex: 1, alignItems: "center", gap: 3 },
  distEmoji: { fontSize: 18 },
  distCount: { fontSize: 20, fontWeight: "800" },
  distLabel: { fontSize: 11, fontWeight: "500" },
  distBarBg: { width: "100%", height: 60, borderRadius: 6, overflow: "hidden", justifyContent: "flex-end" },
  distBarFill: { width: "100%", borderRadius: 6 },

  trendCard: {
    borderRadius: 16, padding: 16, borderWidth: 1, marginBottom: 14,
  },
  trendRow: { flexDirection: "row", alignItems: "flex-end", gap: 6 },
  trendCol: { flex: 1, alignItems: "center", gap: 4 },
  trendBarWrap: { height: 64, justifyContent: "flex-end", width: "100%" },
  trendBar: { width: "100%", borderRadius: 4, minHeight: 4 },
  trendMonthLabel: { fontSize: 10, fontWeight: "600" },
  trendPct: { fontSize: 9, fontWeight: "700" },

  calCard: {
    borderRadius: 16, borderWidth: 1, marginBottom: 14, overflow: "hidden",
  },
  monthNav: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 0.5,
  },
  monthNavBtn: { width: 32, height: 32, alignItems: "center", justifyContent: "center" },
  monthTitle: { fontSize: 15, fontWeight: "700" },
  calendarWrap: { padding: 14 },
  legend: { flexDirection: "row", gap: 12, paddingHorizontal: 14, paddingBottom: 12 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: 11 },

  historyCard: {
    borderRadius: 16, borderWidth: 1, padding: 16, marginBottom: 14,
  },
  emptyText: { fontSize: 14, textAlign: "center", marginTop: 8 },
  historyRow: {
    flexDirection: "row", alignItems: "center", gap: 10,
    paddingVertical: 10, borderBottomWidth: 0.5,
  },
  historyDot: { width: 10, height: 10, borderRadius: 5 },
  historyDate: { flex: 1, fontSize: 14 },
  historyRating: { fontSize: 13, fontWeight: "700" },
});
