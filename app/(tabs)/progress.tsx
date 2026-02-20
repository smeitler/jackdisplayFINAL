import { ScrollView, Text, View, Pressable, StyleSheet, Dimensions } from "react-native";
import { useState } from "react";
import { useRouter } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { useApp } from "@/lib/app-context";
import { useColors } from "@/hooks/use-colors";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { toDateString, offsetDateString, Category } from "@/lib/storage";

const SCREEN_WIDTH = Dimensions.get('window').width;

const CATEGORY_META: Record<Category, { label: string; emoji: string; colorKey: string }> = {
  health: { label: 'Health', emoji: '💪', colorKey: 'health' },
  relationships: { label: 'Relationships', emoji: '❤️', colorKey: 'relationships' },
  wealth: { label: 'Wealth', emoji: '💰', colorKey: 'wealth' },
  mindset: { label: 'Mindset', emoji: '🧠', colorKey: 'mindset' },
};

const CATEGORY_ORDER: Category[] = ['health', 'relationships', 'wealth', 'mindset'];

type TimeRange = '7d' | '30d' | '90d';

export default function ProgressScreen() {
  const { getCategoryRate, getCategoryBreakdown, streak, checkIns, activeHabits, isLoaded } = useApp();
  const colors = useColors();
  const router = useRouter();
  const [timeRange, setTimeRange] = useState<TimeRange>('7d');

  const days = timeRange === '7d' ? 7 : timeRange === '30d' ? 30 : 90;

  // Build last 7 days for bar chart
  const last7Days = Array.from({ length: 7 }, (_, i) => offsetDateString(-(6 - i)));

  // Overall weighted score
  const overallRate = CATEGORY_ORDER.reduce((sum, cat) => sum + getCategoryRate(cat, days), 0) / 4;

  // Unique check-in dates
  const checkInDates = new Set(checkIns.map((e) => e.date));
  const totalDaysLogged = checkInDates.size;

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
        {/* Header */}
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.foreground }]}>Your Progress</Text>
          <Pressable
            onPress={() => router.push('/checkin' as never)}
            style={({ pressed }) => [
              styles.historyBtn,
              { backgroundColor: colors.primary + '22', opacity: pressed ? 0.7 : 1 },
            ]}
          >
            <IconSymbol name="calendar" size={16} color={colors.primary} />
            <Text style={[styles.historyBtnText, { color: colors.primary }]}>History</Text>
          </Pressable>
        </View>

        {/* Summary row */}
        <View style={styles.summaryRow}>
          <View style={[styles.summaryCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <IconSymbol name="flame.fill" size={22} color="#FF6B35" />
            <Text style={[styles.summaryValue, { color: colors.foreground }]}>{streak}</Text>
            <Text style={[styles.summaryLabel, { color: colors.muted }]}>Day Streak</Text>
          </View>
          <View style={[styles.summaryCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <IconSymbol name="calendar" size={22} color={colors.primary} />
            <Text style={[styles.summaryValue, { color: colors.foreground }]}>{totalDaysLogged}</Text>
            <Text style={[styles.summaryLabel, { color: colors.muted }]}>Days Logged</Text>
          </View>
          <View style={[styles.summaryCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <IconSymbol name="trophy.fill" size={22} color="#F59E0B" />
            <Text style={[styles.summaryValue, { color: colors.foreground }]}>{Math.round(overallRate * 100)}%</Text>
            <Text style={[styles.summaryLabel, { color: colors.muted }]}>Overall</Text>
          </View>
        </View>

        {/* Time range selector */}
        <View style={[styles.rangeSelector, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {(['7d', '30d', '90d'] as TimeRange[]).map((r) => (
            <Pressable
              key={r}
              onPress={() => setTimeRange(r)}
              style={({ pressed }) => [
                styles.rangeBtn,
                timeRange === r && { backgroundColor: colors.primary },
                { opacity: pressed ? 0.8 : 1 },
              ]}
            >
              <Text style={[styles.rangeBtnText, { color: timeRange === r ? '#fff' : colors.muted }]}>
                {r === '7d' ? '7 Days' : r === '30d' ? '30 Days' : '90 Days'}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* Category cards */}
        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>By Category</Text>
        {CATEGORY_ORDER.map((category) => {
          const meta = CATEGORY_META[category];
          const rate = getCategoryRate(category, days);
          const breakdown = getCategoryBreakdown(category, days);
          const total = breakdown.green + breakdown.yellow + breakdown.red;
          const catColor = (colors as Record<string, string>)[meta.colorKey] ?? colors.primary;
          const catHabits = activeHabits.filter((h) => h.category === category);

          return (
            <Pressable
              key={category}
              onPress={() => router.push('/checkin' as never)}
              style={({ pressed }) => [
                styles.categoryCard,
                { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.85 : 1 },
              ]}
            >
              <View style={styles.categoryCardTop}>
                <View style={[styles.categoryIconWrap, { backgroundColor: catColor + '22' }]}>
                  <Text style={styles.categoryEmoji}>{meta.emoji}</Text>
                </View>
                <View style={styles.categoryInfo}>
                  <Text style={[styles.categoryName, { color: colors.foreground }]}>{meta.label}</Text>
                  <Text style={[styles.categoryHabitCount, { color: colors.muted }]}>
                    {catHabits.length} habit{catHabits.length !== 1 ? 's' : ''}
                  </Text>
                </View>
                <View style={[styles.scoreCircle, { borderColor: rateColor(rate, colors) }]}>
                  <Text style={[styles.scoreText, { color: rateColor(rate, colors) }]}>
                    {Math.round(rate * 100)}%
                  </Text>
                </View>
              </View>

              {/* Stacked progress bar: green | yellow | red */}
              {total > 0 ? (
                <View style={[styles.stackedBarBg, { backgroundColor: colors.border }]}>
                  {breakdown.green > 0 && (
                    <View style={[styles.stackedBarSeg, { flex: breakdown.green, backgroundColor: '#22C55E' }]} />
                  )}
                  {breakdown.yellow > 0 && (
                    <View style={[styles.stackedBarSeg, { flex: breakdown.yellow, backgroundColor: '#F59E0B' }]} />
                  )}
                  {breakdown.red > 0 && (
                    <View style={[styles.stackedBarSeg, { flex: breakdown.red, backgroundColor: '#EF4444' }]} />
                  )}
                </View>
              ) : (
                <View style={[styles.stackedBarBg, { backgroundColor: colors.border }]} />
              )}

              {/* Breakdown pills */}
              {total > 0 && (
                <View style={styles.breakdownRow}>
                  {breakdown.green > 0 && (
                    <View style={[styles.breakdownPill, { backgroundColor: '#DCFCE7' }]}>
                      <Text style={[styles.breakdownPillText, { color: '#15803D' }]}>🟢 {breakdown.green}</Text>
                    </View>
                  )}
                  {breakdown.yellow > 0 && (
                    <View style={[styles.breakdownPill, { backgroundColor: '#FEF3C7' }]}>
                      <Text style={[styles.breakdownPillText, { color: '#92400E' }]}>🟡 {breakdown.yellow}</Text>
                    </View>
                  )}
                  {breakdown.red > 0 && (
                    <View style={[styles.breakdownPill, { backgroundColor: '#FEE2E2' }]}>
                      <Text style={[styles.breakdownPillText, { color: '#991B1B' }]}>🔴 {breakdown.red}</Text>
                    </View>
                  )}
                </View>
              )}

              <Text style={[styles.ratingLabel, { color: colors.muted }]}>
                {getRatingLabel(rate)}
              </Text>
            </Pressable>
          );
        })}

        {/* Weekly bar chart */}
        <Text style={[styles.sectionTitle, { color: colors.foreground, marginTop: 8 }]}>Last 7 Days</Text>
        <View style={[styles.chartCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <WeeklyChart days={last7Days} checkIns={checkIns} activeHabits={activeHabits} colors={colors} />
        </View>

        <View style={{ height: 30 }} />
      </ScrollView>
    </ScreenContainer>
  );
}

function rateColor(rate: number, colors: any): string {
  if (rate >= 0.75) return colors.success ?? '#22C55E';
  if (rate >= 0.4) return colors.warning ?? '#F59E0B';
  return colors.error ?? '#EF4444';
}

function WeeklyChart({
  days, checkIns, activeHabits, colors,
}: {
  days: string[];
  checkIns: any[];
  activeHabits: any[];
  colors: any;
}) {
  const barWidth = (SCREEN_WIDTH - 80) / 7 - 6;
  const maxBarHeight = 100;

  return (
    <View style={styles.chart}>
      {days.map((dateStr) => {
        const entries = checkIns.filter((e: any) => e.date === dateStr);
        const rated = entries.filter((e: any) => e.rating !== 'none');
        const greenCount = rated.filter((e: any) => e.rating === 'green').length;
        const yellowCount = rated.filter((e: any) => e.rating === 'yellow').length;
        const redCount = rated.filter((e: any) => e.rating === 'red').length;
        const total = activeHabits.length;

        // Weighted score for bar height
        const score = rated.length > 0
          ? (greenCount * 1 + yellowCount * 0.5 + redCount * 0) / Math.max(total, 1)
          : 0;
        const barHeight = Math.max(score * maxBarHeight, score > 0 ? 4 : 0);

        const dayLabel = new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short' }).slice(0, 1);
        const isToday = dateStr === toDateString();

        // Bar color based on score
        const barColor = score >= 0.75 ? '#22C55E' : score >= 0.4 ? '#F59E0B' : score > 0 ? '#EF4444' : colors.border;

        return (
          <View key={dateStr} style={[styles.barColumn, { width: barWidth + 6 }]}>
            <View style={[styles.barBg, { height: maxBarHeight, backgroundColor: colors.border }]}>
              <View style={[styles.barFill, { height: barHeight, backgroundColor: barColor }]} />
            </View>
            <Text style={[
              styles.barLabel,
              { color: isToday ? colors.primary : colors.muted, fontWeight: isToday ? '700' : '400' },
            ]}>
              {dayLabel}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

function getRatingLabel(rate: number): string {
  if (rate === 0) return 'No data yet — start reviewing!';
  if (rate >= 0.9) return 'Excellent — absolutely crushing it!';
  if (rate >= 0.75) return 'Great — keep the momentum!';
  if (rate >= 0.5) return 'Good — room to grow';
  if (rate >= 0.25) return 'Getting started — stay consistent';
  return 'Needs attention — try for one green today';
}

const styles = StyleSheet.create({
  scroll: { padding: 20, paddingBottom: 40 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loadingText: { fontSize: 16 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  title: { fontSize: 28, fontWeight: '700', letterSpacing: -0.5 },
  historyBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20,
  },
  historyBtnText: { fontSize: 13, fontWeight: '600' },
  summaryRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  summaryCard: {
    flex: 1, borderRadius: 14, padding: 12,
    alignItems: 'center', gap: 4, borderWidth: 1,
  },
  summaryValue: { fontSize: 22, fontWeight: '700' },
  summaryLabel: { fontSize: 11, fontWeight: '500', textAlign: 'center' },
  rangeSelector: {
    flexDirection: 'row', borderRadius: 12, padding: 4,
    marginBottom: 20, borderWidth: 1, gap: 4,
  },
  rangeBtn: { flex: 1, borderRadius: 9, paddingVertical: 8, alignItems: 'center' },
  rangeBtnText: { fontSize: 13, fontWeight: '600' },
  sectionTitle: { fontSize: 18, fontWeight: '700', marginBottom: 12 },
  categoryCard: {
    borderRadius: 14, padding: 14, marginBottom: 12, borderWidth: 1,
  },
  categoryCardTop: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  categoryIconWrap: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  categoryEmoji: { fontSize: 22 },
  categoryInfo: { flex: 1 },
  categoryName: { fontSize: 16, fontWeight: '700' },
  categoryHabitCount: { fontSize: 12, marginTop: 1 },
  scoreCircle: {
    width: 52, height: 52, borderRadius: 26, borderWidth: 2.5,
    alignItems: 'center', justifyContent: 'center',
  },
  scoreText: { fontSize: 14, fontWeight: '800' },
  stackedBarBg: {
    height: 8, borderRadius: 4, overflow: 'hidden',
    flexDirection: 'row', marginBottom: 8,
  },
  stackedBarSeg: { height: 8 },
  breakdownRow: { flexDirection: 'row', gap: 6, marginBottom: 6 },
  breakdownPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12 },
  breakdownPillText: { fontSize: 12, fontWeight: '700' },
  ratingLabel: { fontSize: 12 },
  chartCard: { borderRadius: 14, padding: 16, borderWidth: 1, marginBottom: 8 },
  chart: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  barColumn: { alignItems: 'center', gap: 6 },
  barBg: { borderRadius: 4, justifyContent: 'flex-end', overflow: 'hidden' },
  barFill: { borderRadius: 4 },
  barLabel: { fontSize: 11 },
});
