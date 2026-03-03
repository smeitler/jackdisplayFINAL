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

const RANGES = [1, 7, 14, 30, 60, 90] as const;
type Range = typeof RANGES[number];

const LIFE_AREA_MAP = Object.fromEntries(LIFE_AREAS.map((a) => [a.id, a]));

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

// ── Goal Progress Chip ────────────────────────────────────────────────────────

function GoalChip({
  label,
  done,
  goal,
  lastDone,
  lastGoal,
  colors,
}: {
  label: string; // "W" or "M"
  done: number;
  goal: number;
  lastDone: number;
  lastGoal: number;
  colors: ReturnType<typeof import('@/hooks/use-colors').useColors>;
}) {
  const hitCurrent = done >= goal;
  const hitLast = lastDone >= lastGoal;

  // Current period status color
  const pct = goal > 0 ? done / goal : 0;
  const chipColor = hitCurrent
    ? '#22C55E'
    : pct >= 0.6
    ? '#F59E0B'
    : '#EF4444';

  return (
    <View style={styles.goalChipWrap}>
      {/* Current period chip */}
      <View style={[
        styles.goalChip,
        { backgroundColor: chipColor + '18', borderColor: chipColor + '55' },
      ]}>
        <Text style={[styles.goalChipLabel, { color: chipColor }]}>{label}</Text>
        <Text style={[styles.goalChipCount, { color: chipColor }]}>
          {hitCurrent ? '✓' : `${done}/${goal}`}
        </Text>
      </View>
      {/* Last period badge — only shown if goal was set */}
      {lastGoal > 0 && (
        <View style={[
          styles.lastBadge,
          hitLast
            ? { backgroundColor: '#FFD700' + '22', borderColor: '#FFD700' + '66' }
            : { backgroundColor: colors.surface, borderColor: colors.border },
        ]}>
          <Text style={[styles.lastBadgeText, { color: hitLast ? '#FFD700' : colors.muted }]}>
            {hitLast ? '👑' : `${lastDone}/${lastGoal}`}
          </Text>
        </View>
      )}
    </View>
  );
}

// ── Habit Row ─────────────────────────────────────────────────────────────────

function HabitGoalRow({
  habit,
  colors,
  onPress,
}: {
  habit: Habit;
  colors: ReturnType<typeof import('@/hooks/use-colors').useColors>;
  onPress: () => void;
}) {
  const {
    getHabitWeeklyDone, getHabitMonthlyDone,
    getHabitLastWeekDone, getHabitLastMonthDone,
  } = useApp();

  const hasWeekly = (habit.weeklyGoal ?? 0) > 0 && (!habit.frequencyType || habit.frequencyType === 'weekly');
  const hasMonthly = (habit.monthlyGoal ?? 0) > 0 && habit.frequencyType === 'monthly';
  const hasAnyGoal = hasWeekly || hasMonthly;

  const weeklyDone = hasWeekly ? getHabitWeeklyDone(habit.id) : 0;
  const monthlyDone = hasMonthly ? getHabitMonthlyDone(habit.id) : 0;
  const lastWeekDone = hasWeekly ? getHabitLastWeekDone(habit.id) : 0;
  const lastMonthDone = hasMonthly ? getHabitLastMonthDone(habit.id) : 0;

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

      {/* Goal chips — right side */}
      <View style={styles.habitChips}>
        {hasWeekly && (
          <GoalChip
            label="W"
            done={weeklyDone}
            goal={habit.weeklyGoal!}
            lastDone={lastWeekDone}
            lastGoal={habit.weeklyGoal!}
            colors={colors}
          />
        )}
        {hasMonthly && (
          <GoalChip
            label="M"
            done={monthlyDone}
            goal={habit.monthlyGoal!}
            lastDone={lastMonthDone}
            lastGoal={habit.monthlyGoal!}
            colors={colors}
          />
        )}
        {!hasAnyGoal && (
          <Text style={[styles.noGoalText, { color: colors.muted }]}>No goal</Text>
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
  colors,
  onPressGoal,
  onPressHabit,
}: {
  cat: import('@/lib/storage').CategoryDef;
  habits: Habit[];
  rate: number;
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

  const lifeAreaDef = cat.lifeArea ? LIFE_AREA_MAP[cat.lifeArea] : null;

  // Deadline
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
      {/* Goal header — tappable */}
      <TouchableOpacity
        onPress={onPressGoal}
        style={styles.goalCardHeader}
        activeOpacity={0.8}
      >
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
          <Text style={[styles.goalCardTitle, { color: isOnTrack ? '#e2fce8' : isOkay ? '#fef3c7' : isBehind ? '#fee2e2' : colors.foreground }]} numberOfLines={1}>
            {cat.label}
          </Text>
          {lifeAreaDef && (
            <Text style={[styles.goalCardLifeArea, { color: accentColor + 'bb' }]}>{lifeAreaDef.label}</Text>
          )}
        </View>
        {/* Score + deadline */}
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

      {/* Divider */}
      <View style={[styles.goalCardDivider, { backgroundColor: accentColor + '25' }]} />

      {/* Habit rows */}
      {habits.length === 0 ? (
        <Text style={[styles.noHabitsText, { color: colors.muted }]}>No habits yet</Text>
      ) : (
        habits.map((h) => (
          <HabitGoalRow
            key={h.id}
            habit={h}
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
    alarm, isPendingCheckIn, getCategoryRate, streak,
    isLoaded, categories, activeHabits,
  } = useApp();
  const colors = useColors();
  const router = useRouter();
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
    router.push((`/checkin?date=${date ?? yesterday}`) as never);
  }

  function formatAlarmTime(h: number, m: number): string {
    const period = h >= 12 ? 'PM' : 'AM';
    const hour = h % 12 === 0 ? 12 : h % 12;
    return `${hour}:${m.toString().padStart(2, '0')} ${period}`;
  }

  const rangeLabel = range === 1 ? "Yesterday's Goals" : `${range}-Day Goals`;

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

          {/* ── Goals section header ── */}
          <View style={[styles.sectionRow, { zIndex: 10 }]}>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{rangeLabel}</Text>
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
                        {r === 1 ? 'Yesterday' : `${r} days`}
                      </Text>
                      {r === range && <IconSymbol name="checkmark" size={13} color={colors.primary} />}
                    </Pressable>
                  ))}
                </View>
              )}
            </View>
          </View>

          {/* ── Goal legend ── */}
          <View style={styles.legendRow}>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: '#22C55E' }]} />
              <Text style={[styles.legendText, { color: colors.muted }]}>On Track</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: '#F59E0B' }]} />
              <Text style={[styles.legendText, { color: colors.muted }]}>Okay</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: '#EF4444' }]} />
              <Text style={[styles.legendText, { color: colors.muted }]}>Behind</Text>
            </View>
            <View style={styles.legendItem}>
              <Text style={[styles.legendText, { color: '#FFD700' }]}>👑</Text>
              <Text style={[styles.legendText, { color: colors.muted }]}>Last period hit</Text>
            </View>
          </View>

          {/* ── Goal cards (full-width, habits inside) ── */}
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
                    rate={getCategoryRate(cat.id, range)}
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
  rangeChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 6,
    borderRadius: 20, borderWidth: 1,
  },
  rangeChipText: { fontSize: 13, fontWeight: '700' },
  rangeDropdown: {
    position: 'absolute', right: 0, top: 36, zIndex: 100,
    borderRadius: 12, borderWidth: 1, minWidth: 130, overflow: 'hidden',
    shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 10, shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  rangeDropdownItem: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 14, paddingVertical: 11,
  },
  rangeDropdownText: { fontSize: 14 },

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

  // Goal card (full-width)
  goalCard: {
    borderRadius: 16, borderWidth: 1,
    overflow: 'hidden',
  },
  goalCardHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 14, paddingVertical: 12,
  },
  goalCardTitle: { fontSize: 15, fontWeight: '700', lineHeight: 20 },
  goalCardLifeArea: { fontSize: 11, fontWeight: '500', marginTop: 1 },
  goalCardPct: { fontSize: 20, fontWeight: '900', letterSpacing: -0.5 },
  goalCardDivider: { height: 1, marginHorizontal: 0 },

  // Deadline tag
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
  habitChips: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  noGoalText: { fontSize: 11, fontStyle: 'italic' },
  noHabitsText: { fontSize: 12, padding: 12, textAlign: 'center' },

  // Goal chip (current period)
  goalChipWrap: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  goalChip: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    borderRadius: 8, borderWidth: 1,
    paddingHorizontal: 6, paddingVertical: 3,
  },
  goalChipLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 0.3 },
  goalChipCount: { fontSize: 11, fontWeight: '700' },

  // Last period badge
  lastBadge: {
    borderRadius: 6, borderWidth: 1,
    paddingHorizontal: 4, paddingVertical: 2,
  },
  lastBadgeText: { fontSize: 10, fontWeight: '700' },

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
