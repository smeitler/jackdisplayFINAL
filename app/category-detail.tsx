/**
 * Category Goal Detail Screen
 * Accessible from home screen goal cards and analytics page.
 * Shows all habits in the category with stats, progress, and breakdown.
 */
import {
  View, Text, ScrollView, Pressable, StyleSheet,
} from "react-native";
import { useMemo } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Platform } from "react-native";
import * as Haptics from "expo-haptics";
import { ScreenContainer } from "@/components/screen-container";
import { useApp } from "@/lib/app-context";
import { useColors } from "@/hooks/use-colors";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { toDateString, LIFE_AREAS } from "@/lib/storage";

const LIFE_AREA_MAP = Object.fromEntries(LIFE_AREAS.map((a) => [a.id, a]));

const RANGES = [7, 14, 30] as const;
type Range = typeof RANGES[number];

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

  const category = useMemo(() => categories.find((c) => c.id === categoryId), [categories, categoryId]);
  const lifeArea = category?.lifeArea ? LIFE_AREA_MAP[category.lifeArea] : null;

  const habits = useMemo(
    () => activeHabits.filter((h) => h.category === categoryId),
    [activeHabits, categoryId],
  );

  const today = new Date();
  const todayStr = toDateString(today);

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
          {category.emoji} {category.label}
        </Text>
        <View style={{ width: 70 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* ── Hero card ── */}
        <View style={[styles.heroCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={[styles.heroIconWrap, { backgroundColor: colors.primary + "22" }]}>
            <Text style={styles.heroEmoji}>{category.emoji}</Text>
          </View>
          <View style={styles.heroInfo}>
            <Text style={[styles.heroName, { color: colors.foreground }]}>{category.label}</Text>
            {lifeArea && (
              <Text style={[styles.heroCat, { color: colors.muted }]}>{lifeArea.emoji} {lifeArea.label}</Text>
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

        {habitStats.map(({ habit, green, yellow, red, total, score, streak, goalDone, goalTarget, goalPct, goalMet, goalLabel, goalPeriod }) => {
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
                <View style={[styles.habitIconWrap, { backgroundColor: colors.primary + "22" }]}>
                  <Text style={styles.habitEmoji}>{habit.emoji}</Text>
                </View>
                <View style={styles.habitInfo}>
                  <Text style={[styles.habitName, { color: colors.foreground }]} numberOfLines={1}>{habit.name}</Text>
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
});
