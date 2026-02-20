import {
  View, Text, ScrollView, Pressable, StyleSheet,
} from "react-native";
import { useState, useMemo } from "react";
import { useRouter } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { CategoryCalendar } from "@/components/category-calendar";
import { DayDetailSheet, CategoryDayScore } from "@/components/day-detail-sheet";
import { useApp } from "@/lib/app-context";
import { useColors } from "@/hooks/use-colors";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { toDateString } from "@/lib/storage";

const MONTH_NAMES = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

function formatDisplayDate(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  const today = new Date();
  const yesterday = new Date(); yesterday.setDate(today.getDate() - 1);
  if (dateStr === toDateString(today)) return "Today";
  if (dateStr === toDateString(yesterday)) return "Yesterday";
  return d.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
}

export default function ProgressScreen() {
  const {
    getCategoryRate, streak, checkIns, activeHabits, categories, isLoaded,
  } = useApp();
  const sortedCategories = [...categories].sort((a, b) => a.order - b.order);
  const colors = useColors();
  const router = useRouter();

  const today = new Date();
  const [calYear,  setCalYear]  = useState(today.getFullYear());
  const [calMonth, setCalMonth] = useState(today.getMonth());

  // Day detail sheet
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const totalDaysLogged = new Set(checkIns.map((e) => e.date)).size;
  const overallRate = sortedCategories.length > 0
    ? sortedCategories.reduce((s, c) => s + getCategoryRate(c.id, 30), 0) / sortedCategories.length
    : 0;

  // Per-category scores for the selected day (for the detail sheet)
  const selectedDayCategoryScores: CategoryDayScore[] = useMemo(() => {
    if (!selectedDate) return [];
    const dateEntries = checkIns.filter((e) => e.date === selectedDate);
    return sortedCategories.map((cat) => {
      const catHabitIds = new Set(
        activeHabits.filter((h) => h.category === cat.id).map((h) => h.id)
      );
      const catEntries = dateEntries.filter(
        (e) => catHabitIds.has(e.habitId) && e.rating !== "none"
      );
      const green  = catEntries.filter((e) => e.rating === "green").length;
      const yellow = catEntries.filter((e) => e.rating === "yellow").length;
      const red    = catEntries.filter((e) => e.rating === "red").length;
      const total  = green + yellow + red;
      const score  = total === 0 ? null : (green * 1 + yellow * 0.5) / total;
      return { category: cat, score, green, yellow, red, total };
    });
  }, [selectedDate, checkIns, sortedCategories, activeHabits]);

  function prevMonth() {
    if (calMonth === 0) { setCalYear(y => y - 1); setCalMonth(11); }
    else setCalMonth(m => m - 1);
  }
  function nextMonth() {
    if (calYear > today.getFullYear() || (calYear === today.getFullYear() && calMonth >= today.getMonth())) return;
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
            <IconSymbol name="flame.fill" size={18} color="#FF6B35" />
            <Text style={[styles.summaryValue, { color: colors.foreground }]}>{streak}</Text>
            <Text style={[styles.summaryLabel, { color: colors.muted }]}>Streak</Text>
          </View>
          <View style={[styles.summaryCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <IconSymbol name="calendar" size={18} color={colors.primary} />
            <Text style={[styles.summaryValue, { color: colors.foreground }]}>{totalDaysLogged}</Text>
            <Text style={[styles.summaryLabel, { color: colors.muted }]}>Days Logged</Text>
          </View>
          <View style={[styles.summaryCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <IconSymbol name="trophy.fill" size={18} color="#F59E0B" />
            <Text style={[styles.summaryValue, { color: colors.foreground }]}>{Math.round(overallRate * 100)}%</Text>
            <Text style={[styles.summaryLabel, { color: colors.muted }]}>30-Day Avg</Text>
          </View>
        </View>

        {/* ── Month navigation (shared across all calendars) ── */}
        <View style={[styles.monthNav, { backgroundColor: colors.surface, borderColor: colors.border }]}>
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

        {/* ── Dot legend ── */}
        <View style={[styles.dotLegend, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: "#22C55E" }]} />
            <Text style={[styles.legendText, { color: colors.muted }]}>Crushed</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: "#F59E0B" }]} />
            <Text style={[styles.legendText, { color: colors.muted }]}>Okay</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: "#EF4444" }]} />
            <Text style={[styles.legendText, { color: colors.muted }]}>Missed</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: "rgba(150,150,150,0.3)" }]} />
            <Text style={[styles.legendText, { color: colors.muted }]}>Not rated</Text>
          </View>
        </View>

        {/* ── One calendar card per category ── */}
        {sortedCategories.map((cat) => {
          const catHabits = activeHabits.filter((h) => h.category === cat.id);
          const rate = getCategoryRate(cat.id, 30);
          const rateColor = rate >= 0.75 ? "#22C55E" : rate >= 0.4 ? "#F59E0B" : rate > 0 ? "#EF4444" : colors.muted;

          return (
            <View
              key={cat.id}
              style={[styles.catCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
            >
              {/* Category header */}
              <View style={styles.catHeader}>
                <Text style={styles.catEmoji}>{cat.emoji}</Text>
                <View style={styles.catInfo}>
                  <Text style={[styles.catName, { color: colors.foreground }]}>{cat.label}</Text>
                  <Text style={[styles.catSub, { color: colors.muted }]}>
                    {catHabits.length} habit{catHabits.length !== 1 ? "s" : ""}
                  </Text>
                </View>
                <View style={[styles.rateChip, { borderColor: rateColor + "55", backgroundColor: rateColor + "18" }]}>
                  <Text style={[styles.rateText, { color: rateColor }]}>
                    {Math.round(rate * 100)}%
                  </Text>
                </View>
              </View>

              {/* Habit dot key */}
              {catHabits.length > 0 && (
                <View style={styles.habitKey}>
                  {catHabits.map((h) => (
                    <View key={h.id} style={styles.habitKeyItem}>
                      <View style={[styles.habitKeyDot, { backgroundColor: colors.primary }]} />
                      <Text style={[styles.habitKeyText, { color: colors.muted }]} numberOfLines={1}>
                        {h.emoji} {h.name}
                      </Text>
                    </View>
                  ))}
                </View>
              )}

              {/* Calendar */}
              {catHabits.length > 0 ? (
                <CategoryCalendar
                  year={calYear}
                  month={calMonth}
                  habits={catHabits}
                  checkIns={checkIns}
                  onDayPress={(date) => setSelectedDate(date)}
                />
              ) : (
                <View style={styles.emptyState}>
                  <Text style={[styles.emptyText, { color: colors.muted }]}>
                    No active habits in this category yet.
                  </Text>
                </View>
              )}
            </View>
          );
        })}

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* ── Day Detail Sheet ── */}
      <DayDetailSheet
        visible={selectedDate !== null}
        date={selectedDate ?? ""}
        displayDate={selectedDate ? formatDisplayDate(selectedDate) : ""}
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
  scroll: { padding: 20, paddingBottom: 40 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  loadingText: { fontSize: 16 },
  pageTitle: { fontSize: 28, fontWeight: "700", letterSpacing: -0.5, marginBottom: 16 },

  summaryRow: { flexDirection: "row", gap: 10, marginBottom: 14 },
  summaryCard: {
    flex: 1, borderRadius: 14, padding: 10,
    alignItems: "center", gap: 3, borderWidth: 1,
  },
  summaryValue: { fontSize: 20, fontWeight: "700" },
  summaryLabel: { fontSize: 10, fontWeight: "500", textAlign: "center" },

  // Month nav bar
  monthNav: {
    flexDirection: "row", alignItems: "center",
    justifyContent: "space-between",
    borderRadius: 14, borderWidth: 1,
    paddingHorizontal: 12, paddingVertical: 10,
    marginBottom: 10,
  },
  monthNavBtn: { width: 32, height: 32, alignItems: "center", justifyContent: "center" },
  monthTitle: { fontSize: 16, fontWeight: "700" },

  // Dot legend
  dotLegend: {
    flexDirection: "row", justifyContent: "center", gap: 14,
    borderRadius: 12, borderWidth: 1,
    paddingVertical: 8, marginBottom: 16,
  },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: 11 },

  // Category card
  catCard: {
    borderRadius: 18, borderWidth: 1,
    padding: 14, marginBottom: 16,
  },
  catHeader: {
    flexDirection: "row", alignItems: "center",
    gap: 10, marginBottom: 10,
  },
  catEmoji: { fontSize: 26 },
  catInfo: { flex: 1 },
  catName: { fontSize: 17, fontWeight: "700" },
  catSub: { fontSize: 12, marginTop: 1 },
  rateChip: {
    paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: 20, borderWidth: 1,
  },
  rateText: { fontSize: 13, fontWeight: "700" },

  // Habit key
  habitKey: {
    flexDirection: "row", flexWrap: "wrap",
    gap: 6, marginBottom: 12,
  },
  habitKeyItem: {
    flexDirection: "row", alignItems: "center",
    gap: 4, backgroundColor: "rgba(128,128,128,0.08)",
    paddingHorizontal: 7, paddingVertical: 3,
    borderRadius: 10,
  },
  habitKeyDot: { width: 5, height: 5, borderRadius: 3 },
  habitKeyText: { fontSize: 11, maxWidth: 100 },

  emptyState: { paddingVertical: 20, alignItems: "center" },
  emptyText: { fontSize: 13 },
});
