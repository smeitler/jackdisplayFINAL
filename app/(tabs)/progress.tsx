import {
  View, Text, ScrollView, Pressable, StyleSheet, LayoutChangeEvent, Platform,
} from "react-native";
import { useContentMaxWidth } from "@/hooks/use-is-ipad";
import { useState, useMemo } from "react";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { ScreenContainer } from "@/components/screen-container";
import { CategoryCalendar } from "@/components/category-calendar";
import { DayDetailSheet, CategoryDayScore } from "@/components/day-detail-sheet";
import { useApp } from "@/lib/app-context";
import { useColors } from "@/hooks/use-colors";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { toDateString, formatDisplayDate } from "@/lib/storage";
import { CategoryIcon } from "@/components/category-icon";

const MONTH_NAMES = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

export default function ProgressScreen() {
  const {
    getCategoryRate, streak, checkIns, activeHabits, categories, isLoaded,
  } = useApp();
  const sortedCategories = [...categories].sort((a, b) => a.order - b.order);
  const colors = useColors();
  const router = useRouter();
  const maxWidth = useContentMaxWidth();

  const today = new Date();
  const [calYear,  setCalYear]  = useState(today.getFullYear());
  const [calMonth, setCalMonth] = useState(today.getMonth());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [cardWidth, setCardWidth] = useState(0);
  function onCardLayout(e: LayoutChangeEvent) {
    // card padding is 14px each side = 28px total
    const w = e.nativeEvent.layout.width - 28;
    if (w > 0) setCardWidth(w);
  }

  const totalDaysLogged = new Set(checkIns.map((e) => e.date)).size;
  const overallRate = sortedCategories.length > 0
    ? sortedCategories.reduce((s, c) => s + getCategoryRate(c.id, 30), 0) / sortedCategories.length
    : 0;

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
        <View style={maxWidth ? { maxWidth, alignSelf: 'center', width: '100%' } : undefined}>

        {/* ── Page title ── */}
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

        {/* ── Month navigation ── */}
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

        {/* ── One category card per category ── */}
        {sortedCategories.map((cat) => {
          const catHabits = activeHabits.filter((h) => h.category === cat.id);
          const rate = getCategoryRate(cat.id, 30);
          const rateColor = rate >= 0.75 ? "#22C55E" : rate >= 0.4 ? "#F59E0B" : rate > 0 ? "#EF4444" : colors.muted as string;

          return (
            <View
              key={cat.id}
              onLayout={onCardLayout}
              style={[styles.catCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
            >
              {/* ── Category header row — tap to view detail ── */}
              <Pressable
                onPress={() => {
                  if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  router.push(`/category-detail?categoryId=${cat.id}` as never);
                }}
                style={({ pressed }) => [styles.catHeader, { opacity: pressed ? 0.75 : 1 }]}
              >
                <CategoryIcon
                  categoryId={cat.id}
                  lifeArea={cat.lifeArea}
                  size={20}
                  color={rateColor}
                  bgColor={rateColor + '18'}
                  bgSize={40}
                  borderRadius={10}
                />
                <View style={styles.catInfo}>
                  <Text style={[styles.catName, { color: colors.foreground }]}>{cat.label}</Text>
                  <Text style={[styles.catSub, { color: colors.muted }]}>
                    {catHabits.length} habit{catHabits.length !== 1 ? "s" : ""}
                  </Text>
                </View>
                <View style={styles.catHeaderRight}>
                  <View style={[styles.rateChip, { borderColor: rateColor + "55", backgroundColor: rateColor + "18" }]}>
                    <Text style={[styles.rateText, { color: rateColor }]}>
                      {Math.round(rate * 100)}%
                    </Text>
                  </View>
                  <IconSymbol name="chevron.right" size={14} color={colors.muted} />
                </View>
              </Pressable>

              {/* ── Full calendar grid ── */}
              {catHabits.length > 0 ? (
                <View style={styles.calendarWrap}>
                  <CategoryCalendar
                    year={calYear}
                    month={calMonth}
                    habits={catHabits}
                    checkIns={checkIns}
                    onDayPress={(date) => {
                      // If the day has no check-in data, go straight to check-in
                      const hasEntry = checkIns.some((e) => e.date === date && e.rating !== "none");
                      if (!hasEntry) {
                        router.push(`/checkin?date=${date}` as never);
                      } else {
                        setSelectedDate(date);
                      }
                    }}
                    containerWidth={cardWidth > 0 ? cardWidth : undefined}
                    selectedHabitId={null}
                  />
                </View>
              ) : (
                <View style={styles.emptyState}>
                  <Text style={[styles.emptyText, { color: colors.muted }]}>
                    No active habits in this goal yet.
                  </Text>
                </View>
              )}

              {/* ── Habit list — tap to view detail ── */}
              {catHabits.length > 0 && (
                <View>
                  <Text style={[styles.legendHeaderLabel, { color: colors.muted, marginBottom: 8 }]}>Habits</Text>
                  <View style={styles.habitLegend}>
                    {catHabits.map((h, hIdx) => (
                      <Pressable
                        key={h.id}
                        onPress={() => {
                          if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                          router.push(`/habit-detail?habitId=${h.id}` as never);
                        }}
                        style={({ pressed }) => ([
                          styles.habitLegendChip,
                          {
                            backgroundColor: colors.background,
                            borderColor: colors.border,
                            opacity: pressed ? 0.7 : 1,
                          },
                        ])}
                      >
                        <View style={[styles.habitLegendBadge, { backgroundColor: colors.primary + "33" }]}>
                          <Text style={[styles.habitLegendBadgeText, { color: colors.primary }]}>{hIdx + 1}</Text>
                        </View>
                        <Text style={[styles.habitLegendName, { color: colors.foreground }]}>
                          {h.name}
                        </Text>
                        <IconSymbol name="chevron.right" size={11} color={colors.muted} />
                      </Pressable>
                    ))}
                  </View>
                </View>
              )}

              {/* ── Dot legend inline ── */}
              <View style={styles.inlineLegend}>
                {[
                  { color: "#22C55E", label: "Crushed" },
                  { color: "#F59E0B", label: "Okay" },
                  { color: "#EF4444", label: "Missed" },
                  { color: "#EF444422", label: "Skipped" },
                ].map((item) => (
                  <View key={item.label} style={styles.legendItem}>
                    <View style={[styles.legendDot, { backgroundColor: item.color }]} />
                    <Text style={[styles.legendText, { color: colors.muted }]}>{item.label}</Text>
                  </View>
                ))}
              </View>
            </View>
          );
        })}

        <View style={{ height: 40 }} />
        </View>
      </ScrollView>

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

  monthNav: {
    flexDirection: "row", alignItems: "center",
    justifyContent: "space-between",
    borderRadius: 14, borderWidth: 1,
    paddingHorizontal: 12, paddingVertical: 10,
    marginBottom: 16,
  },
  monthNavBtn: { width: 32, height: 32, alignItems: "center", justifyContent: "center" },
  monthTitle: { fontSize: 16, fontWeight: "700" },

  // Category card
  catCard: {
    borderRadius: 18, borderWidth: 1,
    padding: 14, marginBottom: 20,
  },
  catHeader: {
    flexDirection: "row", alignItems: "center",
    gap: 10, marginBottom: 10,
  },
  catHeaderRight: {
    flexDirection: "row", alignItems: "center", gap: 6, marginLeft: "auto",
  },
  catEmoji: { fontSize: 28 },
  catInfo: { flex: 1 },
  catName: { fontSize: 18, fontWeight: "700" },
  catSub: { fontSize: 12, marginTop: 1 },
  rateChip: {
    paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: 20, borderWidth: 1,
  },
  rateText: { fontSize: 13, fontWeight: "700" },

  // Habit key — compact horizontal wrapping chips
  habitKey: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginBottom: 12,
  },
  habitKeyChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 20,
  },
  habitKeyEmoji: { fontSize: 12 },
  habitKeyName: { fontSize: 11, maxWidth: 100 },

  // Calendar wrapper — no height restriction, let it expand naturally
  calendarWrap: {
    width: "100%",
  },

  // Inline legend below calendar
  inlineLegend: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 12,
    marginTop: 10,
    flexWrap: "wrap",
  },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  legendDot: { width: 7, height: 7, borderRadius: 4 },
  legendText: { fontSize: 10 },

  emptyState: { paddingVertical: 20, alignItems: "center" },
  emptyText: { fontSize: 13 },
  legendHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 10, marginBottom: 4 },
  legendHeaderLabel: { fontSize: 11, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.5 },
  selectAllBtn: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 12, borderWidth: 1 },
  selectAllText: { fontSize: 11, fontWeight: "600" },
  habitLegend: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 4 },
  habitLegendChip: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 20, borderWidth: 1 },
  habitLegendBadge: { width: 18, height: 18, borderRadius: 5, alignItems: 'center', justifyContent: 'center' },
  habitLegendBadgeText: { fontSize: 10, fontWeight: '700' },
  habitLegendName: { fontSize: 11, fontWeight: "500", flexShrink: 1 },
});
