import { ScrollView, Text, View, Pressable, StyleSheet, Dimensions } from "react-native";
import { useState, useMemo } from "react";
import { useRouter } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { CalendarHeatmap, DayScore } from "@/components/calendar-heatmap";
import { useApp } from "@/lib/app-context";
import { useColors } from "@/hooks/use-colors";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { toDateString, Category } from "@/lib/storage";

const SCREEN_WIDTH = Dimensions.get("window").width;

const CATEGORY_META: Record<Category, { label: string; emoji: string; colorKey: string }> = {
  health:        { label: "Health",        emoji: "💪", colorKey: "health" },
  relationships: { label: "Relationships", emoji: "❤️", colorKey: "relationships" },
  wealth:        { label: "Wealth",        emoji: "💰", colorKey: "wealth" },
  mindset:       { label: "Mindset",       emoji: "🧠", colorKey: "mindset" },
};
const CATEGORY_ORDER: Category[] = ["health", "relationships", "wealth", "mindset"];

type TimeRange = "7d" | "30d" | "90d";

const MONTH_NAMES = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

export default function ProgressScreen() {
  const { getCategoryRate, getCategoryBreakdown, streak, checkIns, activeHabits, isLoaded } = useApp();
  const colors = useColors();
  const router = useRouter();

  const today = new Date();
  const [calYear,  setCalYear]  = useState(today.getFullYear());
  const [calMonth, setCalMonth] = useState(today.getMonth());
  const [timeRange, setTimeRange] = useState<TimeRange>("7d");

  const days = timeRange === "7d" ? 7 : timeRange === "30d" ? 30 : 90;
  const overallRate = CATEGORY_ORDER.reduce((s, c) => s + getCategoryRate(c, days), 0) / 4;
  const totalDaysLogged = new Set(checkIns.map((e) => e.date)).size;

  // Build per-day scores for the calendar
  const calendarScores: DayScore[] = useMemo(() => {
    // Collect all unique dates that have check-ins
    const allDates = new Set(checkIns.map((e) => e.date));
    return Array.from(allDates).map((date) => {
      const entries = checkIns.filter((e) => e.date === date);
      const rated   = entries.filter((e) => e.rating !== "none");
      if (rated.length === 0) return { date, score: null };
      const score =
        rated.reduce((sum, e) =>
          sum + (e.rating === "green" ? 1 : e.rating === "yellow" ? 0.5 : 0), 0
        ) / Math.max(activeHabits.length, 1);
      return { date, score };
    });
  }, [checkIns, activeHabits]);

  function prevMonth() {
    if (calMonth === 0) { setCalYear(y => y - 1); setCalMonth(11); }
    else setCalMonth(m => m - 1);
  }
  function nextMonth() {
    const now = new Date();
    if (calYear > now.getFullYear() || (calYear === now.getFullYear() && calMonth >= now.getMonth())) return;
    if (calMonth === 11) { setCalYear(y => y + 1); setCalMonth(0); }
    else setCalMonth(m => m + 1);
  }
  const canGoForward = !(calYear === today.getFullYear() && calMonth >= today.getMonth());

  if (!isLoaded) {
    return (
      <ScreenContainer>
        <View style={styles.center}>
          <Text style={[styles.loadingText, { color: colors.muted }]}>Loading…</Text>
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* ── Header ── */}
        <Text style={[styles.pageTitle, { color: colors.foreground }]}>Analytics</Text>

        {/* ── Summary row ── */}
        <View style={styles.summaryRow}>
          <View style={[styles.summaryCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <IconSymbol name="flame.fill" size={20} color="#FF6B35" />
            <Text style={[styles.summaryValue, { color: colors.foreground }]}>{streak}</Text>
            <Text style={[styles.summaryLabel, { color: colors.muted }]}>Streak</Text>
          </View>
          <View style={[styles.summaryCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <IconSymbol name="calendar" size={20} color={colors.primary} />
            <Text style={[styles.summaryValue, { color: colors.foreground }]}>{totalDaysLogged}</Text>
            <Text style={[styles.summaryLabel, { color: colors.muted }]}>Days Logged</Text>
          </View>
          <View style={[styles.summaryCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <IconSymbol name="trophy.fill" size={20} color="#F59E0B" />
            <Text style={[styles.summaryValue, { color: colors.foreground }]}>{Math.round(overallRate * 100)}%</Text>
            <Text style={[styles.summaryLabel, { color: colors.muted }]}>Overall</Text>
          </View>
        </View>

        {/* ── Calendar Heatmap ── */}
        <View style={[styles.calendarCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {/* Month nav */}
          <View style={styles.calendarHeader}>
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

          <CalendarHeatmap
            year={calYear}
            month={calMonth}
            scores={calendarScores}
            onDayPress={(date) => router.push(`/checkin?date=${date}` as never)}
          />
        </View>

        {/* ── Time range selector ── */}
        <View style={[styles.rangeSelector, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {(["7d", "30d", "90d"] as TimeRange[]).map((r) => (
            <Pressable
              key={r}
              onPress={() => setTimeRange(r)}
              style={({ pressed }) => [
                styles.rangeBtn,
                timeRange === r && { backgroundColor: colors.primary },
                { opacity: pressed ? 0.8 : 1 },
              ]}
            >
              <Text style={[styles.rangeBtnText, { color: timeRange === r ? "#fff" : colors.muted }]}>
                {r === "7d" ? "7 Days" : r === "30d" ? "30 Days" : "90 Days"}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* ── Category cards ── */}
        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>By Category</Text>
        {CATEGORY_ORDER.map((category) => {
          const meta      = CATEGORY_META[category];
          const rate      = getCategoryRate(category, days);
          const breakdown = getCategoryBreakdown(category, days);
          const total     = breakdown.green + breakdown.yellow + breakdown.red;
          const catColor  = (colors as Record<string, string>)[meta.colorKey] ?? colors.primary;
          const catHabits = activeHabits.filter((h) => h.category === category);

          return (
            <Pressable
              key={category}
              onPress={() => router.push("/checkin" as never)}
              style={({ pressed }) => [
                styles.categoryCard,
                { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.85 : 1 },
              ]}
            >
              <View style={styles.categoryCardTop}>
                <View style={[styles.categoryIconWrap, { backgroundColor: catColor + "22" }]}>
                  <Text style={styles.categoryEmoji}>{meta.emoji}</Text>
                </View>
                <View style={styles.categoryInfo}>
                  <Text style={[styles.categoryName, { color: colors.foreground }]}>{meta.label}</Text>
                  <Text style={[styles.categoryHabitCount, { color: colors.muted }]}>
                    {catHabits.length} habit{catHabits.length !== 1 ? "s" : ""}
                  </Text>
                </View>
                <View style={[styles.scoreCircle, { borderColor: rateColor(rate, colors) }]}>
                  <Text style={[styles.scoreText, { color: rateColor(rate, colors) }]}>
                    {Math.round(rate * 100)}%
                  </Text>
                </View>
              </View>

              {/* Stacked bar */}
              {total > 0 ? (
                <View style={[styles.stackedBarBg, { backgroundColor: colors.border }]}>
                  {breakdown.green  > 0 && <View style={[styles.stackedBarSeg, { flex: breakdown.green,  backgroundColor: "#22C55E" }]} />}
                  {breakdown.yellow > 0 && <View style={[styles.stackedBarSeg, { flex: breakdown.yellow, backgroundColor: "#F59E0B" }]} />}
                  {breakdown.red    > 0 && <View style={[styles.stackedBarSeg, { flex: breakdown.red,    backgroundColor: "#EF4444" }]} />}
                </View>
              ) : (
                <View style={[styles.stackedBarBg, { backgroundColor: colors.border }]} />
              )}

              {/* Breakdown pills */}
              {total > 0 && (
                <View style={styles.breakdownRow}>
                  {breakdown.green  > 0 && <View style={[styles.breakdownPill, { backgroundColor: "#DCFCE7" }]}><Text style={[styles.breakdownPillText, { color: "#15803D" }]}>🟢 {breakdown.green}</Text></View>}
                  {breakdown.yellow > 0 && <View style={[styles.breakdownPill, { backgroundColor: "#FEF3C7" }]}><Text style={[styles.breakdownPillText, { color: "#92400E" }]}>🟡 {breakdown.yellow}</Text></View>}
                  {breakdown.red    > 0 && <View style={[styles.breakdownPill, { backgroundColor: "#FEE2E2" }]}><Text style={[styles.breakdownPillText, { color: "#991B1B" }]}>🔴 {breakdown.red}</Text></View>}
                </View>
              )}

              <Text style={[styles.ratingLabel, { color: colors.muted }]}>{getRatingLabel(rate)}</Text>
            </Pressable>
          );
        })}

        <View style={{ height: 30 }} />
      </ScrollView>
    </ScreenContainer>
  );
}

function rateColor(rate: number, colors: any): string {
  if (rate >= 0.75) return colors.success ?? "#22C55E";
  if (rate >= 0.4)  return colors.warning ?? "#F59E0B";
  return colors.error ?? "#EF4444";
}

function getRatingLabel(rate: number): string {
  if (rate === 0)    return "No data yet — start reviewing!";
  if (rate >= 0.9)   return "Excellent — absolutely crushing it!";
  if (rate >= 0.75)  return "Great — keep the momentum!";
  if (rate >= 0.5)   return "Good — room to grow";
  if (rate >= 0.25)  return "Getting started — stay consistent";
  return "Needs attention — try for one green today";
}

const styles = StyleSheet.create({
  scroll: { padding: 20, paddingBottom: 40 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  loadingText: { fontSize: 16 },
  pageTitle: { fontSize: 28, fontWeight: "700", letterSpacing: -0.5, marginBottom: 16 },

  summaryRow: { flexDirection: "row", gap: 10, marginBottom: 16 },
  summaryCard: {
    flex: 1, borderRadius: 14, padding: 12,
    alignItems: "center", gap: 4, borderWidth: 1,
  },
  summaryValue: { fontSize: 22, fontWeight: "700" },
  summaryLabel: { fontSize: 11, fontWeight: "500", textAlign: "center" },

  // Calendar
  calendarCard: {
    borderRadius: 16, borderWidth: 1,
    padding: 14, marginBottom: 16,
  },
  calendarHeader: {
    flexDirection: "row", alignItems: "center",
    justifyContent: "space-between", marginBottom: 14,
  },
  monthNavBtn: { width: 32, height: 32, alignItems: "center", justifyContent: "center" },
  monthTitle: { fontSize: 16, fontWeight: "700" },

  // Range selector
  rangeSelector: {
    flexDirection: "row", borderRadius: 12, padding: 4,
    marginBottom: 20, borderWidth: 1, gap: 4,
  },
  rangeBtn: { flex: 1, borderRadius: 9, paddingVertical: 8, alignItems: "center" },
  rangeBtnText: { fontSize: 13, fontWeight: "600" },

  sectionTitle: { fontSize: 18, fontWeight: "700", marginBottom: 12 },

  // Category cards
  categoryCard: { borderRadius: 14, padding: 14, marginBottom: 12, borderWidth: 1 },
  categoryCardTop: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 12 },
  categoryIconWrap: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  categoryEmoji: { fontSize: 22 },
  categoryInfo: { flex: 1 },
  categoryName: { fontSize: 16, fontWeight: "700" },
  categoryHabitCount: { fontSize: 12, marginTop: 1 },
  scoreCircle: {
    width: 52, height: 52, borderRadius: 26, borderWidth: 2.5,
    alignItems: "center", justifyContent: "center",
  },
  scoreText: { fontSize: 14, fontWeight: "800" },
  stackedBarBg: {
    height: 8, borderRadius: 4, overflow: "hidden",
    flexDirection: "row", marginBottom: 8,
  },
  stackedBarSeg: { height: 8 },
  breakdownRow: { flexDirection: "row", gap: 6, marginBottom: 6 },
  breakdownPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12 },
  breakdownPillText: { fontSize: 12, fontWeight: "700" },
  ratingLabel: { fontSize: 12 },
});
