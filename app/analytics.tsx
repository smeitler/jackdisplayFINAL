/**
 * Analytics Screen
 * Houses all goal category cards with per-habit progress rings.
 * Accessible via the Dashboard quick-access pill bar.
 */
import { useState, useMemo } from "react";
import {
  ScrollView, View, Text, TouchableOpacity, Modal,
  Pressable, StyleSheet, Platform,
} from "react-native";
import { useRouter } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { useApp } from "@/lib/app-context";
import { useColors } from "@/hooks/use-colors";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { CategoryIcon } from "@/components/category-icon";
import { useIsCalm } from "@/components/calm-effects";
import { useIsNova } from "@/components/nova-effects";
import { Habit, LIFE_AREAS } from "@/lib/storage";
import Svg, { Circle } from "react-native-svg";
import * as Haptics from "expo-haptics";

const LIFE_AREA_MAP = Object.fromEntries(LIFE_AREAS.map((a) => [a.id, a]));

// ── Ring sizes ────────────────────────────────────────────────────────────────
const RING_SIZE = 60;
const RING_SIZE_SM = 48;

// ── Calm dot sizes ────────────────────────────────────────────────────────────
const DOT_SIZE_LG = 44;
const DOT_SIZE_SM = 36;

// ── CircleRing ────────────────────────────────────────────────────────────────
function CircleRing({
  done, goal, size = RING_SIZE, periodLabel,
}: { done: number; goal: number; size?: number; periodLabel?: string }) {
  const pct = goal > 0 ? Math.min(done / goal, 1) : 0;
  const hit = goal > 0 && done >= goal;
  const ringColor = hit ? '#22C55E' : pct >= 0.6 ? '#F59E0B' : pct > 0 ? '#EF4444' : '#334155';
  const textColor = hit ? '#22C55E' : pct >= 0.6 ? '#F59E0B' : pct > 0 ? '#EF4444' : '#9BA1A6';
  const strokeWidth = size <= 24 ? 2.5 : size <= 48 ? 4 : 5;
  const r = (size - strokeWidth) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = 2 * Math.PI * r;
  const dash = pct * circumference;
  const gap = circumference - dash;
  const fractionText = goal > 0 ? `${done}/${goal}` : '—';
  const fractionFontSize = size <= 24 ? 7 : size <= 48 ? 12 : 14;
  return (
    <View style={{ alignItems: 'center', gap: 3 }}>
      {periodLabel && (
        <Text style={{ fontSize: size <= 48 ? 10 : 11, color: '#9BA1A6', textAlign: 'center' }}>{periodLabel}</Text>
      )}
      <View style={{ width: size, height: size, position: 'relative' }}>
        <Svg width={size} height={size}>
          <Circle cx={cx} cy={cy} r={r} stroke="#334155" strokeWidth={strokeWidth} fill="none" />
          {pct > 0 && (
            <Circle
              cx={cx} cy={cy} r={r}
              stroke={ringColor} strokeWidth={strokeWidth} fill="none"
              strokeDasharray={`${dash} ${gap}`}
              strokeLinecap="round"
              transform={`rotate(-90 ${cx} ${cy})`}
            />
          )}
        </Svg>
        <View style={[StyleSheet.absoluteFillObject, { alignItems: 'center', justifyContent: 'center' }]}>
          <Text style={{ fontSize: fractionFontSize, fontWeight: '700', color: textColor }}>{fractionText}</Text>
        </View>
      </View>
    </View>
  );
}

// ── HabitPillDots (Calm mode) ─────────────────────────────────────────────────
function HabitPillDots({
  p0Done, p1Done, p2Done, goal,
  p0Label, p1Label, p2Label,
}: {
  p0Done: number; p1Done: number; p2Done: number; goal: number;
  p0Label: string; p1Label: string; p2Label: string;
}) {
  function dotColor(done: number, g: number) {
    if (g <= 0 || done <= 0) return '#1E2A4A';
    const pct = done / g;
    if (pct >= 0.8) return '#22C55E';
    if (pct >= 0.5) return '#F59E0B';
    return '#EF4444';
  }
  function splitLabel(label: string) {
    const parts = label.toUpperCase().split(' ');
    if (parts.length === 1) return { top: '', bottom: parts[0] };
    if (parts[0] === 'THIS') return { top: 'THIS', bottom: parts[1] };
    if (parts[0] === 'LAST') return { top: 'LAST', bottom: parts[1] };
    return { top: parts.slice(0, -1).join(' '), bottom: parts[parts.length - 1] };
  }
  const dots = [
    { done: p0Done, label: p0Label, isCurrent: false, size: DOT_SIZE_SM },
    { done: p1Done, label: p1Label, isCurrent: false, size: DOT_SIZE_SM },
    { done: p2Done, label: p2Label, isCurrent: true,  size: DOT_SIZE_LG },
  ];
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      {dots.map(({ done, label, isCurrent, size }, i) => {
        const bg = dotColor(done, goal);
        const fg = goal > 0 && done > 0 ? '#FFFFFF' : '#4A5A7A';
        const fraction = goal > 0 ? `${done}/${goal}` : '—';
        const { top, bottom } = splitLabel(label);
        const labelColor = isCurrent ? '#FFFFFF' : '#5A6A8A';
        const labelSize = 7;
        return (
          <View key={i} style={{ alignItems: 'center', gap: 2 }}>
            <Text style={{ fontSize: labelSize, fontWeight: isCurrent ? '700' : '400', color: labelColor, textTransform: 'uppercase', letterSpacing: 0.5, textAlign: 'center', width: size + 4 }}>{top}</Text>
            <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: isCurrent ? 11 : 9, fontWeight: '700', color: fg, textAlign: 'center' }}>{fraction}</Text>
            </View>
            <Text style={{ fontSize: labelSize, fontWeight: isCurrent ? '700' : '400', color: labelColor, textTransform: 'uppercase', letterSpacing: 0.5, textAlign: 'center', width: size + 4 }}>{bottom}</Text>
          </View>
        );
      })}
    </View>
  );
}

// ── HabitGoalRow ──────────────────────────────────────────────────────────────
function HabitGoalRow({
  habit, colors, onPress, isCalm = false,
}: {
  habit: Habit;
  colors: ReturnType<typeof import('@/hooks/use-colors').useColors>;
  onPress: () => void;
  isCalm?: boolean;
}) {
  const {
    getHabitWeeklyDone, getHabitMonthlyDone,
    getHabitLastWeekDone, getHabitLastMonthDone,
    getHabitWeekBeforeDone, getHabitMonthBeforeDone,
  } = useApp();

  const isMonthly = habit.frequencyType === 'monthly';
  const goal = isMonthly ? (habit.monthlyGoal ?? 0) : (habit.weeklyGoal ?? 0);
  const p0Done = isMonthly ? getHabitMonthBeforeDone(habit.id) : getHabitWeekBeforeDone(habit.id);
  const p1Done = isMonthly ? getHabitLastMonthDone(habit.id) : getHabitLastWeekDone(habit.id);
  const p2Done = isMonthly ? getHabitMonthlyDone(habit.id) : getHabitWeeklyDone(habit.id);
  const p0Label = isMonthly ? '2 Mo Ago' : '2 Wks';
  const p1Label = isMonthly ? 'Last Mo' : 'Last Wk';
  const p2Label = isMonthly ? 'This Mo' : 'This Wk';

  return (
    <TouchableOpacity
      onPress={onPress}
      style={[s.habitRow, { borderTopColor: colors.border }]}
      activeOpacity={0.7}
    >
      <Text style={[s.habitName, { color: colors.foreground }]}>{habit.name}</Text>
      <View style={s.habitRight}>
        {goal > 0 ? (
          isCalm ? (
            <HabitPillDots
              p0Done={p0Done} p1Done={p1Done} p2Done={p2Done} goal={goal}
              p0Label={p0Label} p1Label={p1Label} p2Label={p2Label}
            />
          ) : (
            <View style={s.ringTriple}>
              <CircleRing done={p0Done} goal={goal} size={RING_SIZE_SM} periodLabel={p0Label} />
              <View style={[s.ringDivider, { backgroundColor: colors.border }]} />
              <CircleRing done={p1Done} goal={goal} size={RING_SIZE_SM} periodLabel={p1Label} />
              <View style={[s.ringDivider, { backgroundColor: colors.border }]} />
              <CircleRing done={p2Done} goal={goal} size={RING_SIZE} periodLabel={p2Label} />
            </View>
          )
        ) : (
          <Text style={[s.noGoalText, { color: colors.muted }]}>
            {isMonthly ? 'No monthly goal' : 'No weekly goal'}
          </Text>
        )}
        <IconSymbol name="chevron.right" size={13} color={colors.muted} />
      </View>
    </TouchableOpacity>
  );
}

// ── GoalCard ──────────────────────────────────────────────────────────────────
function GoalCard({
  cat, habits, rate, colors, onPressGoal, onPressHabit, isCalm = false,
}: {
  cat: import('@/lib/storage').CategoryDef;
  habits: Habit[];
  rate: number;
  colors: ReturnType<typeof import('@/hooks/use-colors').useColors>;
  onPressGoal: () => void;
  onPressHabit: (habitId: string) => void;
  isCalm?: boolean;
}) {
  const pct = Math.min(Math.max(rate, 0), 1);
  const isOnTrack = pct >= 0.8;
  const isOkay = pct >= 0.5 && pct < 0.8;
  const isBehind = pct > 0 && pct < 0.5;
  const accentColor = isOnTrack ? '#22C55E' : isOkay ? '#F59E0B' : isBehind ? '#EF4444' : colors.muted as string;
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
    <View style={[s.goalCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <TouchableOpacity onPress={onPressGoal} style={s.goalCardHeader} activeOpacity={0.8}>
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
          <Text style={[s.goalCardTitle, { color: colors.foreground }]} numberOfLines={1}>{cat.label}</Text>
          {lifeAreaDef && (
            <Text style={[s.goalCardLifeArea, { color: accentColor + 'bb' }]}>{lifeAreaDef.label}</Text>
          )}
        </View>
        {deadlineLabel ? (
          <View style={[s.deadlineTag, { borderColor: deadlineColor + '55', backgroundColor: deadlineColor + '18' }]}>
            <Text style={[s.deadlineText, { color: deadlineColor }]}>{deadlineLabel}</Text>
          </View>
        ) : null}
        <IconSymbol name="chevron.right" size={14} color={accentColor + '88'} />
      </TouchableOpacity>

      <View style={[s.goalCardDivider, { backgroundColor: accentColor + '25' }]} />

      {habits.length === 0 ? (
        <Text style={[s.noHabitsText, { color: colors.muted }]}>No habits yet</Text>
      ) : (
        habits.map((h) => (
          <HabitGoalRow
            key={h.id}
            habit={h}
            colors={colors}
            onPress={() => onPressHabit(h.id)}
            isCalm={isCalm}
          />
        ))
      )}
    </View>
  );
}

// ── Analytics Screen ──────────────────────────────────────────────────────────
export default function AnalyticsScreen() {
  const colors = useColors();
  const isCalm = useIsCalm();
  const isNova = useIsNova();
  const router = useRouter();
  const [showLegend, setShowLegend] = useState(false);

  const { categories, activeHabits, getCategoryRate } = useApp();
  const sortedCategories = useMemo(
    () => [...categories].sort((a, b) => a.order - b.order),
    [categories],
  );

  const rateRange = 7;

  const headerBg = isNova ? '#050510' : isCalm ? '#0D1135' : colors.background;
  const titleColor = isCalm ? '#FFFFFF' : isNova ? '#E0D4FF' : colors.foreground;

  return (
    <ScreenContainer containerClassName="flex-1" style={{ backgroundColor: headerBg }}>
      {/* Header */}
      <View style={[s.header, { backgroundColor: headerBg, borderBottomColor: isCalm ? '#252D6E' : colors.border }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={s.backBtn}
          activeOpacity={0.7}
        >
          <IconSymbol name="chevron.left" size={22} color={isCalm ? '#8B9CC8' : colors.muted} />
        </TouchableOpacity>
        <Text style={[s.headerTitle, { color: titleColor }]}>Analytics</Text>
        <Pressable
          onPress={() => setShowLegend(true)}
          style={[s.legendInfoBtn, { borderColor: isCalm ? '#252D6E' : colors.border, backgroundColor: isCalm ? '#1A2050' : colors.surface }]}
        >
          <Text style={[s.legendInfoBtnText, { color: isCalm ? '#8B9CC8' : colors.muted }]}>?</Text>
        </Pressable>
      </View>

      {/* Legend modal */}
      <Modal visible={showLegend} transparent animationType="fade" onRequestClose={() => setShowLegend(false)}>
        <Pressable style={s.legendOverlay} onPress={() => setShowLegend(false)}>
          <View style={[s.legendModal, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[s.legendModalTitle, { color: colors.foreground }]}>Ring Colors</Text>
            {(['#22C55E', '#F59E0B', '#EF4444'] as const).map((c, i) => (
              <View key={c} style={s.legendItem}>
                <View style={[s.legendDot, { backgroundColor: c }]} />
                <Text style={[s.legendText, { color: colors.muted }]}>
                  {i === 0 ? 'Hit — goal reached' : i === 1 ? 'On Track — ≥60% of goal' : 'Behind — <60% of goal'}
                </Text>
              </View>
            ))}
            <View style={s.legendItem}>
              <IconSymbol name="crown.fill" size={11} color="#FFD700" />
              <Text style={[s.legendText, { color: colors.muted }]}>Last period hit</Text>
            </View>
            <Text style={[s.legendHint, { color: colors.muted }]}>
              Rings: left = 2 periods ago, middle = last period, right = current period
            </Text>
          </View>
        </Pressable>
      </Modal>

      {/* Goal cards */}
      <ScrollView
        contentContainerStyle={[s.scroll, { backgroundColor: headerBg }]}
        showsVerticalScrollIndicator={false}
      >
        {sortedCategories.length === 0 ? (
          <View style={[s.emptyState, { borderColor: colors.border }]}>
            <Text style={[s.emptyText, { color: colors.muted }]}>No goals yet — add one in Manage Habits</Text>
          </View>
        ) : (
          <View style={s.goalList}>
            {sortedCategories.map((cat) => {
              const catHabits = activeHabits.filter((h) => h.category === cat.id);
              return (
                <GoalCard
                  key={cat.id}
                  cat={cat}
                  habits={catHabits}
                  rate={getCategoryRate(cat.id, rateRange)}
                  colors={colors}
                  onPressGoal={() => {
                    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    router.push((`/category-detail?categoryId=${cat.id}`) as never);
                  }}
                  onPressHabit={(habitId) => {
                    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    router.push((`/habit-detail?habitId=${habitId}`) as never);
                  }}
                  isCalm={isCalm}
                />
              );
            })}
          </View>
        )}

        {/* Manage habits button */}
        <Pressable
          onPress={() => router.push('/habits' as never)}
          style={({ pressed }) => [
            s.manageBtn,
            { backgroundColor: isCalm ? '#1A2050' : colors.surface, borderColor: isCalm ? '#252D6E' : colors.border, opacity: pressed ? 0.7 : 1 },
          ]}
        >
          <IconSymbol name="plus.circle.fill" size={18} color={isCalm ? '#F5A623' : colors.primary} />
          <Text style={[s.manageBtnText, { color: isCalm ? '#F5A623' : colors.primary }]}>Manage Habits</Text>
        </Pressable>
      </ScrollView>
    </ScreenContainer>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 0.5,
    gap: 10,
  },
  backBtn: {
    padding: 4,
  },
  headerTitle: {
    flex: 1,
    fontSize: 20,
    fontWeight: '700',
  },
  legendInfoBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  legendInfoBtnText: {
    fontSize: 13,
    fontWeight: '600',
  },
  scroll: {
    padding: 16,
    paddingBottom: 48,
    gap: 12,
  },
  goalList: {
    gap: 12,
    marginBottom: 16,
  },
  goalCard: {
    borderRadius: 16,
    borderWidth: 0.5,
    overflow: 'hidden',
  },
  goalCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
  },
  goalCardTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  goalCardLifeArea: {
    fontSize: 12,
    fontWeight: '500',
    marginTop: 1,
  },
  goalCardDivider: {
    height: 1,
    marginHorizontal: 14,
  },
  deadlineTag: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
  },
  deadlineText: {
    fontSize: 11,
    fontWeight: '600',
  },
  noHabitsText: {
    fontSize: 13,
    padding: 14,
    fontStyle: 'italic',
  },
  habitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderTopWidth: 0.5,
    gap: 10,
  },
  habitName: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
    lineHeight: 18,
  },
  habitRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  ringTriple: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  ringDivider: {
    width: 1,
    height: 32,
    opacity: 0.4,
  },
  noGoalText: {
    fontSize: 12,
    fontStyle: 'italic',
  },
  emptyState: {
    borderWidth: 1,
    borderRadius: 14,
    borderStyle: 'dashed',
    padding: 24,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
    textAlign: 'center',
  },
  manageBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 14,
    borderRadius: 14,
    borderWidth: 0.5,
    marginTop: 4,
  },
  manageBtnText: {
    fontSize: 15,
    fontWeight: '600',
  },
  legendOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  legendModal: {
    borderRadius: 16,
    borderWidth: 0.5,
    padding: 20,
    width: '100%',
    gap: 10,
  },
  legendModalTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 4,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  legendText: {
    fontSize: 13,
  },
  legendHint: {
    fontSize: 11,
    marginTop: 4,
    lineHeight: 16,
  },
});
