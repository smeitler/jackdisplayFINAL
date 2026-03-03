import { ScrollView, View, Text, Pressable, StyleSheet, Platform, TouchableOpacity } from "react-native";
import { useState } from "react";
import { useRouter } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { useApp } from "@/lib/app-context";
import { useColors } from "@/hooks/use-colors";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { yesterdayString, formatDisplayDate, LIFE_AREAS, Habit } from "@/lib/storage";
import * as Haptics from "expo-haptics";
import { useContentMaxWidth } from "@/hooks/use-is-ipad";
import { CategoryIcon } from "@/components/category-icon";

// Period toggle options — what the goal section header shows
type PeriodView = 'week' | 'month';

const LIFE_AREA_MAP = Object.fromEntries(LIFE_AREAS.map((a) => [a.id, a]));

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

// ── Helpers: days remaining in current week / month ─────────────────────────

function getDaysLeftInWeek(): number {
  const now = new Date();
  // Week ends Sunday (day 0). Days left = days until end of Sunday
  const day = now.getDay(); // 0=Sun, 1=Mon ... 6=Sat
  return day === 0 ? 0 : 7 - day; // 0 means today is the last day
}

function getDaysLeftInMonth(): number {
  const now = new Date();
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  return lastDay - now.getDate(); // 0 means today is the last day
}

function daysLeftLabel(daysLeft: number, period: PeriodView): string {
  if (daysLeft === 0) return period === 'week' ? 'Last day of week!' : 'Last day of month!';
  if (daysLeft === 1) return '1 day left';
  return `${daysLeft} days left`;
}

// ── Period Chip (This Week / Last Week / This Month / Last Month) ─────────────

function PeriodGoalChip({
  currentDone,
  currentGoal,
  lastDone,
  lastGoal,
  period,
  colors,
}: {
  currentDone: number;
  currentGoal: number;
  lastDone: number;
  lastGoal: number;
  period: PeriodView;
  colors: ReturnType<typeof import('@/hooks/use-colors').useColors>;
}) {
  const hitCurrent = currentDone >= currentGoal;
  const hitLast = lastGoal > 0 && lastDone >= lastGoal;

  const pct = currentGoal > 0 ? currentDone / currentGoal : 0;
  const currentColor = hitCurrent ? '#22C55E' : pct >= 0.6 ? '#F59E0B' : '#EF4444';

  const thisLabel = period === 'week' ? 'This Week' : 'This Month';
  const lastLabel = period === 'week' ? 'Last Week' : 'Last Month';

  const daysLeft = period === 'week' ? getDaysLeftInWeek() : getDaysLeftInMonth();
  const needMore = currentGoal - currentDone; // how many more days needed
  const canStillHit = !hitCurrent && needMore > 0 && needMore <= daysLeft + 1;
  const motivationLabel = hitCurrent
    ? null
    : canStillHit
    ? daysLeftLabel(daysLeft, period)
    : daysLeft === 0
    ? (period === 'week' ? 'Last day of week!' : 'Last day of month!')
    : null;

  return (
    <View style={styles.periodChipGroup}>
      {/* This period */}
      <View style={styles.periodChipBlock}>
        <Text style={[styles.periodChipPeriodLabel, { color: colors.muted }]}>{thisLabel}</Text>
        <View style={[styles.periodChip, { backgroundColor: currentColor + '18', borderColor: currentColor + '55' }]}>
          <Text style={[styles.periodChipValue, { color: currentColor }]}>
            {hitCurrent ? `✓ ${currentDone}/${currentGoal}` : `${currentDone}/${currentGoal}`}
          </Text>
        </View>
        {motivationLabel && (
          <Text style={[styles.periodChipMotivation, { color: canStillHit ? '#F59E0B' : colors.muted }]}>
            {motivationLabel}
          </Text>
        )}
      </View>

      {/* Divider */}
      <View style={[styles.periodChipDivider, { backgroundColor: colors.border }]} />

      {/* Last period */}
      <View style={styles.periodChipBlock}>
        <Text style={[styles.periodChipPeriodLabel, { color: colors.muted }]}>{lastLabel}</Text>
        {lastGoal > 0 ? (
          <View style={[
            styles.periodChip,
            hitLast
              ? { backgroundColor: '#FFD70022', borderColor: '#FFD70066' }
              : { backgroundColor: colors.surface, borderColor: colors.border },
          ]}>
            <Text style={[styles.periodChipValue, { color: hitLast ? '#FFD700' : colors.muted }]}>
              {hitLast ? `👑 ${lastDone}/${lastGoal}` : `${lastDone}/${lastGoal}`}
            </Text>
          </View>
        ) : (
          <Text style={[styles.periodChipNoGoal, { color: colors.muted }]}>—</Text>
        )}
      </View>
    </View>
  );
}

// ── Habit Row ─────────────────────────────────────────────────────────────────

function HabitGoalRow({
  habit,
  period,
  colors,
  onPress,
}: {
  habit: Habit;
  period: PeriodView;
  colors: ReturnType<typeof import('@/hooks/use-colors').useColors>;
  onPress: () => void;
}) {
  const {
    getHabitWeeklyDone, getHabitMonthlyDone,
    getHabitLastWeekDone, getHabitLastMonthDone,
  } = useApp();

  const hasWeeklyGoal = (habit.weeklyGoal ?? 0) > 0 && (!habit.frequencyType || habit.frequencyType === 'weekly');
  const hasMonthlyGoal = (habit.monthlyGoal ?? 0) > 0 && habit.frequencyType === 'monthly';

  // Show chip only for the active period view
  const showChip = period === 'week' ? hasWeeklyGoal : hasMonthlyGoal;

  const currentDone = period === 'week' ? getHabitWeeklyDone(habit.id) : getHabitMonthlyDone(habit.id);
  const lastDone = period === 'week' ? getHabitLastWeekDone(habit.id) : getHabitLastMonthDone(habit.id);
  const goal = period === 'week' ? (habit.weeklyGoal ?? 0) : (habit.monthlyGoal ?? 0);

  return (
    <TouchableOpacity
      onPress={onPress}
      style={[styles.habitRow, { borderTopColor: colors.border }]}
      activeOpacity={0.7}
    >
      {/* Habit name */}
      <Text style={[styles.habitName, { color: colors.foreground }]} numberOfLines={1}>
        {habit.name}
      </Text>

      {/* Right side: goal chip or no-goal label */}
      <View style={styles.habitRight}>
        {showChip ? (
          <PeriodGoalChip
            currentDone={currentDone}
            currentGoal={goal}
            lastDone={lastDone}
            lastGoal={goal}
            period={period}
            colors={colors}
          />
        ) : (
          <Text style={[styles.noGoalText, { color: colors.muted }]}>
            {period === 'week' ? 'No weekly goal' : 'No monthly goal'}
          </Text>
        )}
        <IconSymbol name="chevron.right" size={13} color={colors.muted} />
      </View>
    </TouchableOpacity>
  );
}

// ── Goal Card (full-width) ────────────────────────────────────────────────────

function GoalCard({
  cat,
  habits,
  rate,
  period,
  colors,
  onPressGoal,
  onPressHabit,
}: {
  cat: import('@/lib/storage').CategoryDef;
  habits: Habit[];
  rate: number;
  period: PeriodView;
  colors: ReturnType<typeof import('@/hooks/use-colors').useColors>;
  onPressGoal: () => void;
  onPressHabit: (habitId: string) => void;
}) {
  const pct = Math.min(Math.max(rate, 0), 1);
  const isOnTrack = pct >= 0.8;
  const isOkay = pct >= 0.5 && pct < 0.8;
  const isBehind = pct > 0 && pct < 0.5;
  const hasData = pct > 0;

  const accentColor = isOnTrack ? '#22C55E' : isOkay ? '#F59E0B' : isBehind ? '#EF4444' : colors.border;
  const cardBg = isOnTrack ? '#0a1f10' : isOkay ? '#1f1500' : isBehind ? '#1f0808' : colors.surface;
  const pctColor = isOnTrack ? '#4ade80' : isOkay ? '#fbbf24' : isBehind ? '#f87171' : colors.muted;
  const titleColor = isOnTrack ? '#e2fce8' : isOkay ? '#fef3c7' : isBehind ? '#fee2e2' : colors.foreground;

  const lifeAreaDef = cat.lifeArea ? LIFE_AREA_MAP[cat.lifeArea] : null;

  let deadlineLabel = '';
  let deadlineColor = colors.muted;
  if (cat.deadline) {
    const dl = new Date(cat.deadline + 'T12:00:00');
    const now = new Date(); now.setHours(0, 0, 0, 0);
    const days = Math.ceil((dl.getTime() - now.getTime()) / 86400000);
    deadlineLabel = days < 0 ? 'Overdue' : days === 0 ? 'Due today' : `${days}d left`;
    deadlineColor = days < 0 ? '#EF4444' : days <= 7 ? '#F59E0B' : '#6b7280';
  }

  return (
    <View style={[styles.goalCard, { backgroundColor: cardBg, borderColor: accentColor + '40' }]}>
      {/* Goal header */}
      <TouchableOpacity onPress={onPressGoal} style={styles.goalCardHeader} activeOpacity={0.8}>
        <CategoryIcon
          categoryId={cat.id}
          lifeArea={cat.lifeArea}
          size={20}
          color={accentColor}
          bgColor={accentColor + '22'}
          bgSize={38}
          borderRadius={10}
        />
        <View style={{ flex: 1 }}>
          <Text style={[styles.goalCardTitle, { color: titleColor }]} numberOfLines={1}>{cat.label}</Text>
          {lifeAreaDef && (
            <Text style={[styles.goalCardLifeArea, { color: accentColor + 'bb' }]}>{lifeAreaDef.label}</Text>
          )}
        </View>
        <View style={{ alignItems: 'flex-end', gap: 3 }}>
          <Text style={[styles.goalCardPct, { color: pctColor }]}>
            {hasData ? `${Math.round(pct * 100)}%` : '—'}
          </Text>
          {deadlineLabel ? (
            <View style={[styles.deadlineTag, { borderColor: deadlineColor + '55', backgroundColor: deadlineColor + '18' }]}>
              <Text style={[styles.deadlineText, { color: deadlineColor }]}>{deadlineLabel}</Text>
            </View>
          ) : null}
        </View>
        <IconSymbol name="chevron.right" size={14} color={accentColor + '88'} />
      </TouchableOpacity>

      <View style={[styles.goalCardDivider, { backgroundColor: accentColor + '25' }]} />

      {/* Habit rows */}
      {habits.length === 0 ? (
        <Text style={[styles.noHabitsText, { color: colors.muted }]}>No habits yet</Text>
      ) : (
        habits.map((h) => (
          <HabitGoalRow
            key={h.id}
            habit={h}
            period={period}
            colors={colors}
            onPress={() => onPressHabit(h.id)}
          />
        ))
      )}
    </View>
  );
}

// ── Home Screen ───────────────────────────────────────────────────────────────

export default function HomeScreen() {
  const {
    alarm, isPendingCheckIn, getCategoryRate,
    streak, categories, activeHabits,
  } = useApp();
  const colors = useColors();
  const router = useRouter();
  const maxWidth = useContentMaxWidth();
  const [period, setPeriod] = useState<PeriodView>('week');

  const yesterday = yesterdayString();

  function handleCheckIn(date?: string) {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push((`/checkin?date=${date ?? yesterday}`) as never);
  }

  function formatAlarmTime(h: number, m: number): string {
    const ph = h >= 12 ? 'PM' : 'AM';
    const hour = h % 12 === 0 ? 12 : h % 12;
    return `${hour}:${m.toString().padStart(2, '0')} ${ph}`;
  }

  // For the goal card score, use 7 days for week view, 30 days for month view
  const rateRange = period === 'week' ? 7 : 30;

  return (
    <ScreenContainer>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={maxWidth ? { maxWidth, alignSelf: 'center', width: '100%' } : undefined}>

          {/* ── Header ── */}
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.greeting, { color: colors.foreground }]}>{getGreeting()}</Text>
              <Text style={[styles.dateText, { color: colors.muted }]}>
                {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
              </Text>
            </View>
            {streak > 0 && (
              <View style={styles.streakPill}>
                <Text style={styles.streakFire}>🔥</Text>
                <Text style={styles.streakNum}>{streak}</Text>
              </View>
            )}
          </View>

          {/* ── Yesterday's review banner ── */}
          {isPendingCheckIn && (
            <Pressable
              onPress={() => handleCheckIn(yesterday)}
              style={({ pressed }) => [
                styles.checkInBanner,
                { backgroundColor: colors.primary, transform: [{ scale: pressed ? 0.98 : 1 }] },
              ]}
            >
              <View style={styles.checkInLeft}>
                <Text style={styles.checkInTitle}>Yesterday's Review</Text>
                <Text style={styles.checkInSub}>{formatDisplayDate(yesterday)} · Tap to rate 🔴🟡🟢</Text>
              </View>
              <IconSymbol name="chevron.right" size={18} color="rgba(255,255,255,0.8)" />
            </Pressable>
          )}

          {/* ── Alarm strip ── */}
          <Pressable
            onPress={() => router.push('/(tabs)/settings' as never)}
            style={({ pressed }) => [
              styles.alarmStrip,
              { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.8 : 1 },
            ]}
          >
            <View style={[styles.alarmDot, { backgroundColor: alarm.isEnabled ? '#4ade80' : '#334155' }]} />
            <Text style={[styles.alarmLabel, { color: colors.muted }]}>Alarm</Text>
            <Text style={[styles.alarmTime, { color: colors.foreground }]}>
              {alarm.isEnabled ? formatAlarmTime(alarm.hour, alarm.minute) : 'Off'}
            </Text>
            <View style={{ flex: 1 }} />
            <Text style={[styles.alarmEdit, { color: colors.primary }]}>Edit</Text>
            <IconSymbol name="chevron.right" size={14} color={colors.muted} />
          </Pressable>

          {/* ── Period toggle + section title ── */}
          <View style={styles.sectionRow}>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Goals</Text>
            {/* Week / Month toggle */}
            <View style={[styles.periodToggle, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <TouchableOpacity
                onPress={() => {
                  if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setPeriod('week');
                }}
                style={[
                  styles.periodToggleBtn,
                  period === 'week' && { backgroundColor: colors.primary },
                ]}
                activeOpacity={0.8}
              >
                <Text style={[
                  styles.periodToggleBtnText,
                  { color: period === 'week' ? '#fff' : colors.muted },
                ]}>Weekly</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => {
                  if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setPeriod('month');
                }}
                style={[
                  styles.periodToggleBtn,
                  period === 'month' && { backgroundColor: colors.primary },
                ]}
                activeOpacity={0.8}
              >
                <Text style={[
                  styles.periodToggleBtnText,
                  { color: period === 'month' ? '#fff' : colors.muted },
                ]}>Monthly</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* ── Legend ── */}
          <View style={styles.legendRow}>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: '#22C55E' }]} />
              <Text style={[styles.legendText, { color: colors.muted }]}>Hit</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: '#F59E0B' }]} />
              <Text style={[styles.legendText, { color: colors.muted }]}>On Track</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: '#EF4444' }]} />
              <Text style={[styles.legendText, { color: colors.muted }]}>Behind</Text>
            </View>
            <View style={styles.legendItem}>
              <Text style={{ fontSize: 11 }}>👑</Text>
              <Text style={[styles.legendText, { color: colors.muted }]}>Last period hit</Text>
            </View>
          </View>

          {/* ── Goal cards ── */}
          {categories.length === 0 ? (
            <View style={[styles.emptyState, { borderColor: colors.border }]}>
              <Text style={[styles.emptyText, { color: colors.muted }]}>No goals yet — add one in Manage Habits</Text>
            </View>
          ) : (
            <View style={styles.goalList}>
              {categories.map((cat) => {
                const catHabits = activeHabits.filter((h) => h.category === cat.id);
                return (
                  <GoalCard
                    key={cat.id}
                    cat={cat}
                    habits={catHabits}
                    rate={getCategoryRate(cat.id, rateRange)}
                    period={period}
                    colors={colors}
                    onPressGoal={() => {
                      if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      router.push((`/category-detail?categoryId=${cat.id}`) as never);
                    }}
                    onPressHabit={(habitId) => {
                      if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      router.push((`/habit-detail?habitId=${habitId}`) as never);
                    }}
                  />
                );
              })}
            </View>
          )}

          {/* ── Manage habits ── */}
          <Pressable
            onPress={() => router.push('/habits' as never)}
            style={({ pressed }) => [
              styles.manageBtn,
              { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.8 : 1 },
            ]}
          >
            <IconSymbol name="list.bullet" size={18} color={colors.primary} />
            <Text style={[styles.manageBtnText, { color: colors.foreground }]}>Manage Habits & Goals</Text>
            <IconSymbol name="chevron.right" size={16} color={colors.muted} />
          </Pressable>

          <View style={{ height: 32 }} />
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: 20, paddingBottom: 40 },

  // Header
  header: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 20, gap: 12 },
  greeting: { fontSize: 26, fontWeight: '800', letterSpacing: -0.6 },
  dateText: { fontSize: 13, marginTop: 3 },
  streakPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#FF6B3520', borderRadius: 20,
    paddingHorizontal: 12, paddingVertical: 7, marginTop: 2,
  },
  streakFire: { fontSize: 16 },
  streakNum: { fontSize: 17, fontWeight: '800', color: '#FF6B35' },

  // Check-in banner
  checkInBanner: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: 16, padding: 16, marginBottom: 14, gap: 8,
  },
  checkInLeft: { flex: 1, gap: 3 },
  checkInTitle: { color: '#fff', fontSize: 15, fontWeight: '700' },
  checkInSub: { color: 'rgba(255,255,255,0.8)', fontSize: 12 },

  // Alarm strip
  alarmStrip: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11,
    borderWidth: 1, marginBottom: 24,
  },
  alarmDot: { width: 8, height: 8, borderRadius: 4 },
  alarmLabel: { fontSize: 12, fontWeight: '500' },
  alarmTime: { fontSize: 15, fontWeight: '700' },
  alarmEdit: { fontSize: 13, fontWeight: '600' },

  // Section header
  sectionRow: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', marginBottom: 10,
  },
  sectionTitle: { fontSize: 18, fontWeight: '800', letterSpacing: -0.3 },

  // Period toggle
  periodToggle: {
    flexDirection: 'row', borderRadius: 10, borderWidth: 1,
    overflow: 'hidden', padding: 2, gap: 2,
  },
  periodToggleBtn: {
    paddingHorizontal: 14, paddingVertical: 6, borderRadius: 8,
  },
  periodToggleBtnText: { fontSize: 13, fontWeight: '700' },

  // Legend
  legendRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    marginBottom: 14, flexWrap: 'wrap',
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot: { width: 7, height: 7, borderRadius: 4 },
  legendText: { fontSize: 11, fontWeight: '500' },

  // Goal list
  goalList: { gap: 12, marginBottom: 24 },

  // Goal card
  goalCard: { borderRadius: 16, borderWidth: 1, overflow: 'hidden' },
  goalCardHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 14, paddingVertical: 12,
  },
  goalCardTitle: { fontSize: 15, fontWeight: '700', lineHeight: 20 },
  goalCardLifeArea: { fontSize: 11, fontWeight: '500', marginTop: 1 },
  goalCardPct: { fontSize: 20, fontWeight: '900', letterSpacing: -0.5 },
  goalCardDivider: { height: 1 },

  // Deadline
  deadlineTag: {
    borderRadius: 6, borderWidth: 1,
    paddingHorizontal: 6, paddingVertical: 2,
  },
  deadlineText: { fontSize: 10, fontWeight: '700' },

  // Habit row
  habitRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 14, paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  habitName: { flex: 1, fontSize: 13, fontWeight: '600' },
  habitRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  noGoalText: { fontSize: 11, fontStyle: 'italic' },
  noHabitsText: { fontSize: 12, padding: 12, textAlign: 'center' },

  // Period chip group (This Week + Last Week side by side)
  periodChipGroup: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
  },
  periodChipBlock: { alignItems: 'center', gap: 2 },
  periodChipPeriodLabel: { fontSize: 9, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.3 },
  periodChip: {
    borderRadius: 7, borderWidth: 1,
    paddingHorizontal: 7, paddingVertical: 3,
  },
  periodChipValue: { fontSize: 11, fontWeight: '700' },
  periodChipMotivation: { fontSize: 9, fontWeight: '600', textAlign: 'center', marginTop: 1 },
  periodChipDivider: { width: 1, height: 28, borderRadius: 1 },
  periodChipNoGoal: { fontSize: 11 },

  // Empty state
  emptyState: {
    borderRadius: 14, borderWidth: 1, borderStyle: 'dashed',
    padding: 24, alignItems: 'center', marginBottom: 24,
  },
  emptyText: { fontSize: 14, textAlign: 'center' },

  // Manage button
  manageBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderRadius: 14, padding: 16, borderWidth: 1,
  },
  manageBtnText: { flex: 1, fontSize: 15, fontWeight: '600' },
});
