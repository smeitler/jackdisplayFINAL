import { ScrollView, View, Text, Pressable, StyleSheet, Platform, useWindowDimensions } from "react-native";
import { NovaCard, useIsNova } from "@/components/nova-effects";
import { useState } from "react";
import { useRouter } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { useApp } from "@/lib/app-context";
import { useColors } from "@/hooks/use-colors";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { yesterdayString, formatDisplayDate, toDateString, offsetDateString, LIFE_AREAS } from "@/lib/storage";
import * as Haptics from "expo-haptics";
import { useIsIPad, useContentMaxWidth } from "@/hooks/use-is-ipad";
import Svg, { Circle } from "react-native-svg";

const RANGES = [1, 7, 14, 30, 60, 90] as const;
type Range = typeof RANGES[number];

const LIFE_AREA_MAP = Object.fromEntries(LIFE_AREAS.map((a) => [a.id, a]));

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

// Returns a 0–1 progress and whether the goal is met, for any frequency type
function getHabitProgress(
  habit: { id: string; weeklyGoal?: number; monthlyGoal?: number; frequencyType?: string },
  getWeeklyDone: (id: string) => number,
  getMonthlyDone: (id: string) => number,
): { done: number; goal: number; pct: number; met: boolean; label: string } | null {
  const isMonthly = habit.frequencyType === 'monthly';
  if (isMonthly && habit.monthlyGoal) {
    const done = getMonthlyDone(habit.id);
    const goal = habit.monthlyGoal;
    const pct = Math.min(done / goal, 1);
    return { done, goal, pct, met: done >= goal, label: `${done}/${goal}/mo` };
  }
  if (!isMonthly && habit.weeklyGoal) {
    const done = getWeeklyDone(habit.id);
    const goal = habit.weeklyGoal;
    const pct = Math.min(done / goal, 1);
    return { done, goal, pct, met: done >= goal, label: `${done}/${goal}/wk` };
  }
  return null;
}

function GoalRing({ rate, emoji, label, deadline, onPress, colors }: {
  rate: number; emoji: string; label: string; deadline?: string;
  onPress: () => void; colors: ReturnType<typeof import('@/hooks/use-colors').useColors>;
}) {
  const { width } = useWindowDimensions();
  // 2 per row with 20px padding each side and 12px gap
  const ringSize = Math.floor((width - 40 - 12) / 2);
  const strokeWidth = 10;
  const radius = (ringSize - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const pct = Math.min(Math.max(rate, 0), 1);
  const strokeDashoffset = circumference * (1 - pct);

  // Color based on rate
  const ringColor = pct >= 0.8 ? '#4ade80' : pct >= 0.5 ? '#fbbf24' : pct > 0 ? '#f87171' : colors.border;
  const pctText = Math.round(pct * 100);

  // Deadline
  let deadlineLabel = '';
  let deadlineColor = colors.muted;
  if (deadline) {
    const dl = new Date(deadline + 'T12:00:00');
    const now = new Date(); now.setHours(0,0,0,0);
    const days = Math.ceil((dl.getTime() - now.getTime()) / 86400000);
    deadlineLabel = days < 0 ? 'Overdue' : days === 0 ? 'Due today' : `${days}d left`;
    deadlineColor = days < 0 ? '#EF4444' : days <= 7 ? '#F59E0B' : colors.muted;
  }

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.ringCell, { width: ringSize, opacity: pressed ? 0.8 : 1 }]}
    >
      <Svg width={ringSize} height={ringSize} style={{ transform: [{ rotate: '-90deg' }] }}>
        {/* Track */}
        <Circle
          cx={ringSize / 2}
          cy={ringSize / 2}
          r={radius}
          stroke={colors.border}
          strokeWidth={strokeWidth}
          fill="none"
        />
        {/* Progress */}
        {pct > 0 && (
          <Circle
            cx={ringSize / 2}
            cy={ringSize / 2}
            r={radius}
            stroke={ringColor}
            strokeWidth={strokeWidth}
            fill="none"
            strokeDasharray={`${circumference} ${circumference}`}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
          />
        )}
      </Svg>
      {/* Center content — percentage only */}
      <View style={styles.ringCenter} pointerEvents="none">
        <Text style={[styles.ringPct, { color: pct > 0 ? ringColor : colors.muted }]}>
          {pct > 0 ? `${pctText}%` : '—'}
        </Text>
      </View>
      {/* Emoji + label below ring */}
      <View style={styles.ringLabelRow}>
        <Text style={styles.ringEmoji}>{emoji}</Text>
        <Text style={[styles.ringLabel, { color: colors.foreground }]} numberOfLines={2}>{label}</Text>
      </View>
      {deadlineLabel ? <Text style={[styles.ringDeadline, { color: deadlineColor }]}>{deadlineLabel}</Text> : null}
    </Pressable>
  );
}

export default function HomeScreen() {
  const { alarm, isPendingCheckIn, getCategoryRate, getCategoryBreakdown, getHabitWeeklyDone, getHabitMonthlyDone, streak, isLoaded, categories, activeHabits } = useApp();
  const colors = useColors();
  const router = useRouter();
  const isNova = useIsNova();
  const isIPad = useIsIPad();
  const maxWidth = useContentMaxWidth();
  const [range, setRange] = useState<Range>(1);
  const [rangeOpen, setRangeOpen] = useState(false);

  function handleRangeSelect(r: Range) {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setRange(r);
    setRangeOpen(false);
  }

  const yesterday = yesterdayString();

  function handleCheckIn(date?: string) {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const target = date ?? yesterday;
    router.push((`/checkin?date=${target}`) as never);
  }

  function formatAlarmTime(h: number, m: number): string {
    const period = h >= 12 ? 'PM' : 'AM';
    const hour = h % 12 === 0 ? 12 : h % 12;
    const min = m.toString().padStart(2, '0');
    return `${hour}:${min} ${period}`;
  }

  return (
    <ScreenContainer>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={maxWidth ? { maxWidth, alignSelf: 'center', width: '100%' } : undefined}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={[styles.greeting, { color: colors.foreground }]}>{getGreeting()}</Text>
            <Text style={[styles.dateText, { color: colors.muted }]}>
              {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
            </Text>
          </View>
          {streak > 0 && (
            <View style={[styles.streakBadge, { backgroundColor: '#FF6B3522' }]}>
              <Text style={styles.streakFire}>🔥</Text>
              <Text style={[styles.streakText, { color: '#FF6B35' }]}>{streak}</Text>
            </View>
          )}
        </View>

        {/* Pending check-in banner */}
        {isPendingCheckIn && (
          <Pressable
            onPress={() => handleCheckIn(yesterday)}
            style={({ pressed }) => [
              styles.checkInBanner,
              { backgroundColor: colors.primary, transform: [{ scale: pressed ? 0.98 : 1 }] },
            ]}
          >
            <View style={styles.checkInBannerLeft}>
              <Text style={styles.checkInBannerTitle}>Yesterday's Review</Text>
              <Text style={styles.checkInBannerSub}>
                How did {formatDisplayDate(yesterday)} go? Tap to rate 🔴🟡🟢
              </Text>
            </View>
            <IconSymbol name="chevron.right" size={20} color="#fff" />
          </Pressable>
        )}

        {/* Alarm status card */}
        <View style={[styles.alarmCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={[styles.alarmIconWrap, { backgroundColor: colors.primary + '22' }]}>
            <IconSymbol name="alarm.fill" size={22} color={colors.primary} />
          </View>
          <View style={styles.alarmInfo}>
            <Text style={[styles.alarmLabel, { color: colors.muted }]}>Daily Alarm</Text>
            <Text style={[styles.alarmTime, { color: colors.foreground }]}>
              {alarm.isEnabled ? formatAlarmTime(alarm.hour, alarm.minute) : 'Not set'}
            </Text>
          </View>
          <Pressable
            onPress={() => router.push('/(tabs)/settings' as never)}
            style={({ pressed }) => [styles.alarmEditBtn, { opacity: pressed ? 0.6 : 1 }]}
          >
            <Text style={[styles.alarmEditText, { color: colors.primary }]}>Edit</Text>
          </Pressable>
        </View>

        {/* Range selector + goals progress */}
        <View style={[styles.sectionHeader, { zIndex: 10 }]}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
            {range === 1 ? "Yesterday's Goals" : `${range}-Day Goals`}
          </Text>
          <View>
            <Pressable
              onPress={() => setRangeOpen((o) => !o)}
              style={({ pressed }) => [
                styles.rangeChip,
                { backgroundColor: colors.primary + '18', borderColor: colors.primary + '44', opacity: pressed ? 0.7 : 1 },
              ]}
            >
              <Text style={[styles.rangeChipText, { color: colors.primary }]}>{range}d</Text>
              <IconSymbol name={rangeOpen ? 'chevron.up' : 'chevron.down'} size={11} color={colors.primary} />
            </Pressable>
            {rangeOpen && (
              <View style={[styles.rangeDropdown, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                {RANGES.map((r) => (
                  <Pressable
                    key={r}
                    onPress={() => handleRangeSelect(r)}
                    style={({ pressed }) => [
                      styles.rangeDropdownItem,
                      r === range && { backgroundColor: colors.primary + '18' },
                      { opacity: pressed ? 0.7 : 1 },
                    ]}
                  >
                    <Text style={[
                      styles.rangeDropdownText,
                      { color: r === range ? colors.primary : colors.foreground, fontWeight: r === range ? '700' : '500' },
                    ]}>
                      {r} days
                    </Text>
                    {r === range && <IconSymbol name="checkmark" size={13} color={colors.primary} />}
                  </Pressable>
                ))}
              </View>
            )}
          </View>
        </View>

        {/* Goal rings grid — 2 per row */}
        <View style={styles.ringGrid}>
          {categories.map((cat) => {
            const rate = getCategoryRate(cat.id, range);
            return (
              <GoalRing
                key={cat.id}
                rate={rate}
                emoji={cat.emoji}
                label={cat.label}
                deadline={cat.deadline}
                colors={colors}
                onPress={() => {
                  if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  router.push((`/category-detail?categoryId=${cat.id}`) as never);
                }}
              />
            );
          })}
        </View>



        {/* Manage habits */}
        <Pressable
          onPress={() => router.push('/habits' as never)}
          style={({ pressed }) => [
            styles.manageBtn,
            { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.8 : 1 },
          ]}
        >
          <IconSymbol name="list.bullet" size={18} color={colors.primary} />
          <Text style={[styles.manageBtnText, { color: colors.foreground }]}>Manage Habits</Text>
          <IconSymbol name="chevron.right" size={16} color={colors.muted} />
        </Pressable>

        <View style={{ height: 30 }} />
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: 20, paddingBottom: 40 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  greeting: { fontSize: 26, fontWeight: '700', letterSpacing: -0.5 },
  dateText: { fontSize: 14, marginTop: 2 },
  streakBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20,
  },
  streakFire: { fontSize: 18 },
  streakText: { fontSize: 18, fontWeight: '800' },
  checkInBanner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderRadius: 16, padding: 16, marginBottom: 16,
  },
  checkInBannerLeft: { flex: 1, gap: 3 },
  checkInBannerTitle: { color: '#fff', fontSize: 16, fontWeight: '700' },
  checkInBannerSub: { color: 'rgba(255,255,255,0.85)', fontSize: 13 },
  alarmCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderRadius: 14, padding: 14, marginBottom: 20, borderWidth: 1,
  },
  alarmIconWrap: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  alarmInfo: { flex: 1 },
  alarmLabel: { fontSize: 12 },
  alarmTime: { fontSize: 18, fontWeight: '700' },
  alarmEditBtn: { paddingHorizontal: 8, paddingVertical: 4 },
  alarmEditText: { fontSize: 14, fontWeight: '600' },
  sectionTitle: { fontSize: 18, fontWeight: '700' },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, zIndex: 10 },
  rangeChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: 20, borderWidth: 1,
  },
  rangeChipText: { fontSize: 13, fontWeight: '700' },
  rangeDropdown: {
    position: 'absolute', right: 0, top: 34, zIndex: 100,
    borderRadius: 12, borderWidth: 1,
    minWidth: 120, overflow: 'hidden',
    shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 8, shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  rangeDropdownItem: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 14, paddingVertical: 11,
  },
  rangeDropdownText: { fontSize: 14 },
  ringGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 20,
    justifyContent: 'space-between',
  },
  ringCell: {
    alignItems: 'center',
    marginBottom: 4,
  },
  ringCenter: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  ringEmoji: { fontSize: 18 },
  ringPct: { fontSize: 26, fontWeight: '800', letterSpacing: -1 },
  ringLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 8, paddingHorizontal: 4 },
  ringLabel: { fontSize: 13, fontWeight: '600', flex: 1, lineHeight: 18 },
  ringDeadline: { fontSize: 11, fontWeight: '600', marginTop: 2, textAlign: 'center' },
  historyCard: { borderRadius: 14, borderWidth: 1, overflow: 'hidden', marginBottom: 16 },
  historyRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1,
  },
  historyDate: { fontSize: 15 },
  manageBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderRadius: 14, padding: 16, borderWidth: 1,
  },
  manageBtnText: { flex: 1, fontSize: 15, fontWeight: '600' },
  catScoreRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 },
  deadlineTag: { fontSize: 11, fontWeight: '700', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6, borderWidth: 1, overflow: 'hidden' },
  weeklyGoalList: { marginTop: 8, gap: 5 },
  weeklyGoalItem: { gap: 2 },
  weeklyGoalName: { fontSize: 11, fontWeight: '500' },
  weeklyGoalBarWrap: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  weeklyGoalBarBg: { flex: 1, height: 6, borderRadius: 3, flexDirection: 'row', overflow: 'hidden' },
  weeklyGoalBarFill: { borderRadius: 3 },
  weeklyGoalCountWrap: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  weeklyGoalCheckmark: { fontSize: 10, color: '#22C55E', fontWeight: '800' },
  weeklyGoalCount: { fontSize: 11, minWidth: 28, textAlign: 'right' },
});
