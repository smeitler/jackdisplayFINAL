import React from "react";
import { ScrollView, View, Text, Pressable, StyleSheet, Platform, TouchableOpacity, Modal, Image, FlatList, Dimensions } from "react-native";
import { useState, useMemo, useEffect, useRef, useCallback, Fragment } from "react";
import { useWindowDimensions } from "react-native";
import { useRouter } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import { ScreenContainer } from "@/components/screen-container";
import { useApp } from "@/lib/app-context";
import { useColors } from "@/hooks/use-colors";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { yesterdayString, formatDisplayDate, LIFE_AREAS, Habit, toDateString, getLastUserId, loadVisionBoard, saveVisionBoard, VisionBoard, loadVisionMotivations, saveVisionMotivations, VisionMotivations, AlarmEntry, MAX_ALARMS } from "@/lib/storage";
import { JournalEntry, loadEntries, todayDateStr } from "@/lib/journal-store";
import * as Haptics from "expo-haptics";
import { useContentMaxWidth } from "@/hooks/use-is-ipad";
import { CategoryIcon } from "@/components/category-icon";
import Svg, { Circle } from "react-native-svg";
import Animated, { useSharedValue, useAnimatedStyle, withTiming, withSpring, runOnJS } from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import AsyncStorage from "@react-native-async-storage/async-storage";
import { PERMISSIONS_DONE_KEY } from "@/app/permissions-setup";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system/legacy";
import { CalmHeader, useIsCalm } from "@/components/calm-effects";
import { LinearGradient } from "expo-linear-gradient";
import { WellnessIcon } from "@/components/wellness-icon";
import { loadStacks, stepLabel, STEP_TYPE_META, type RitualStack, type StepType } from "@/lib/stacks";

const STEP_ICON_MAP: Record<StepType, string> = {
  timer:        'timer',
  stopwatch:    'stopwatch',
  meditation:   'sparkles',
  breathwork:   'wind',
  journal:      'book.fill',
  affirmations: 'quote.bubble.fill',
  priming:      'flame.fill',
  reminder:     'bell.fill',
  melatonin:    'moon.fill',
  motivational: 'bolt.fill',
  spiritual:    'sparkles',
  custom:       'pencil',
};

const SCREEN_H = Dimensions.get('window').height;

function SwipeSheet({ children, onClose, style }: { children: React.ReactNode; onClose: () => void; style?: object }) {
  const ty = useSharedValue(0);
  const pan = Gesture.Pan()
    .runOnJS(true)
    .onUpdate((e) => { if (e.translationY > 0) ty.value = e.translationY; })
    .onEnd((e) => {
      if (e.translationY > 120 || e.velocityY > 800) {
        ty.value = withTiming(SCREEN_H, { duration: 250 }, () => { runOnJS(onClose)(); ty.value = 0; });
      } else {
        ty.value = withSpring(0, { damping: 20, stiffness: 200 });
      }
    });
  const anim = useAnimatedStyle(() => ({ transform: [{ translateY: ty.value }] }));
  return (
    <GestureDetector gesture={pan}>
      <Animated.View style={[style, anim]}>
        <View style={{ width: '100%', alignItems: 'center', justifyContent: 'center', paddingTop: 10, paddingBottom: 6 }}>
          <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: 'rgba(150,150,170,0.4)' }} />
        </View>
        {children}
      </Animated.View>
    </GestureDetector>
  );
}

const LIFE_AREA_MAP = Object.fromEntries(LIFE_AREAS.map((a) => [a.id, a]));
// Profile pic key is per-user — built dynamically once userId is known
function profilePicKey(userId: string) { return `daycheck:profilePicUri:${userId}`; }

// ── Daily motivational quotes (user-curated, rotates by day of year) ──────────
const DAILY_QUOTES = [
  "Discipline is choosing what you want most over what you want now.",
  "You don't rise to goals—you fall to habits.",
  "The cost of discipline is always cheaper than regret.",
  "Become the person your goals require.",
  "The standard you tolerate becomes your life.",
  "Hard things build easy lives.",
  "Comfort today is debt tomorrow.",
  "Every excuse is a vote against your future.",
  "Greatness is boring repetition done well.",
  "A thousand tiny efforts beat one heroic burst.",
  "Your habits are voting for your future.",
  "Discipline is self-respect in action.",
  "Champions look ordinary most days.",
  "Growth begins where comfort ends.",
  "Consistency turns effort into inevitability.",
  "The work you repeat is the life you build.",
  "Effort compounds faster than talent.",
  "The real opponent is yesterday's version of you.",
  "Momentum is built one unexciting day at a time.",
  "The next level requires the next you.",
  "Quiet progress wins loud battles.",
  "Strength is built in resisted moments.",
  "Time rewards the persistent.",
  "Focus is force.",
  "Most people stop right before it works.",
  "Self-control is strategic advantage.",
  "Discipline is remembering what you're working for.",
  "The long game defeats almost everyone.",
  "Consistency is proof you mean it.",
  "Become the person who finishes.",
];

function getDailyQuote(): string {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 0);
  const dayOfYear = Math.floor((now.getTime() - start.getTime()) / 86400000);
  return DAILY_QUOTES[dayOfYear % DAILY_QUOTES.length];
}

// ── Genre-based motivational quotes ─────────────────────────────────────────

export type MotivationalGenre = 'entrepreneurial' | 'conquering_day' | 'stoic' | 'athletic' | 'mindset' | 'general';

const GENRE_QUOTES: Record<MotivationalGenre, string[]> = {
  entrepreneurial: [
    "Build the business others said was impossible.",
    "Entrepreneurs don't wait for opportunity — they create it.",
    "Every empire started with a single decision.",
    "The market rewards the relentless.",
    "Your idea is worthless without execution.",
    "Revenue is validation. Ship first, perfect later.",
    "The best time to start was yesterday. The next best time is now.",
    "Solve a real problem and the money follows.",
    "Failure is tuition. Pay it and keep going.",
    "Build in silence. Let success make the noise.",
  ],
  conquering_day: [
    "Today is the day you decide who you're becoming.",
    "Attack the morning and the day is yours.",
    "One focused hour beats ten distracted ones.",
    "Win the morning, win the day.",
    "Every task you finish is a vote for your future self.",
    "Conquer the small things and the big things follow.",
    "Your day is a blank canvas — paint it with intention.",
    "Don't manage your time. Protect it.",
    "The version of you that wins today is built right now.",
    "Execution is the only strategy that matters.",
  ],
  stoic: [
    "You have power over your mind, not outside events. Realize this and you will find strength. — Marcus Aurelius",
    "The obstacle is the way.",
    "Waste no more time arguing about what a good person should be. Be one. — Marcus Aurelius",
    "He who is brave is free. — Seneca",
    "Difficulties strengthen the mind as labor does the body. — Seneca",
    "The best revenge is not to be like your enemy. — Marcus Aurelius",
    "You have two ears and one mouth — use them proportionally.",
    "It is not the man who has too little, but the man who craves more, who is poor. — Seneca",
    "First say to yourself what you would be; then do what you have to do. — Epictetus",
    "Seek not that the things which happen should happen as you wish; but wish the things which happen to be as they are. — Epictetus",
  ],
  athletic: [
    "Champions train. Losers complain.",
    "Pain is temporary. Quitting lasts forever.",
    "Your body can handle almost anything. It's your mind you have to convince.",
    "The last rep is the one that counts.",
    "Sweat is just fat crying.",
    "Train like there's someone warming up to take your spot.",
    "Hard work beats talent when talent doesn't work hard.",
    "Your only competition is who you were yesterday.",
    "Champions are made in the moments they want to quit.",
    "Push harder than yesterday if you want a different tomorrow.",
  ],
  mindset: [
    "Your thoughts become your reality. Choose them wisely.",
    "What you focus on expands.",
    "The mind is everything. What you think, you become. — Buddha",
    "Believe you can and you're halfway there.",
    "Whether you think you can or you think you can't — you're right. — Henry Ford",
    "Your mindset is your most powerful asset.",
    "Change your thoughts and you change your world.",
    "A growth mindset turns every obstacle into a lesson.",
    "The strongest force in the human personality is the need to remain consistent with how we define ourselves.",
    "Identity drives behavior. Become the person first.",
  ],
  general: [
    "Discipline is choosing what you want most over what you want now.",
    "You don't rise to goals—you fall to habits.",
    "The cost of discipline is always cheaper than regret.",
    "Become the person your goals require.",
    "The standard you tolerate becomes your life.",
    "Hard things build easy lives.",
    "Comfort today is debt tomorrow.",
    "Every excuse is a vote against your future.",
    "Greatness is boring repetition done well.",
    "Consistency turns effort into inevitability.",
  ],
};

const SPIRITUAL_QUOTES: string[] = [
  "You are not a drop in the ocean. You are the entire ocean in a drop. — Rumi",
  "The present moment is the only moment available to us, and it is the door to all moments. — Thich Nhat Hanh",
  "Be still and know that I am God. — Psalm 46:10",
  "Wherever you are, be all there. — Jim Elliot",
  "The soul that sees beauty may sometimes walk alone. — Goethe",
  "In the middle of difficulty lies opportunity. — Einstein",
  "What lies behind us and what lies before us are tiny matters compared to what lies within us. — Emerson",
  "The kingdom of God is within you. — Luke 17:21",
  "When you realize there is nothing lacking, the whole world belongs to you. — Lao Tzu",
  "Your task is not to seek for love, but merely to seek and find all the barriers within yourself that you have built against it. — Rumi",
  "Do not be conformed to this world, but be transformed by the renewal of your mind. — Romans 12:2",
  "The quieter you become, the more you are able to hear. — Rumi",
  "Gratitude turns what we have into enough.",
  "Peace comes from within. Do not seek it without. — Buddha",
  "You are the universe experiencing itself. — Alan Watts",
];

const GENRE_LABELS: Record<MotivationalGenre, string> = {
  entrepreneurial: 'Entrepreneurial',
  conquering_day:  'Conquering the Day',
  stoic:           'Stoic Wisdom',
  athletic:        'Athletic Drive',
  mindset:         'Mindset',
  general:         'General',
};

const MOTIVATIONAL_GENRE_KEY = 'daycheck:motivationalGenre';

function getGenreQuote(genre: MotivationalGenre): string {
  const list = GENRE_QUOTES[genre];
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 0);
  const dayOfYear = Math.floor((now.getTime() - start.getTime()) / 86400000);
  return list[dayOfYear % list.length];
}

function getSpiritualQuote(): string {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 0);
  const dayOfYear = Math.floor((now.getTime() - start.getTime()) / 86400000);
  return SPIRITUAL_QUOTES[dayOfYear % SPIRITUAL_QUOTES.length];
}

// ── Helpers: days remaining in current week / month ─────────────────────────

function getDaysLeftInWeek(): number {
  const now = new Date();
  const day = now.getDay();
  return day === 0 ? 0 : 7 - day;
}

function getDaysLeftInMonth(): number {
  const now = new Date();
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  return lastDay - now.getDate();
}

function daysLeftLabel(daysLeft: number, period: 'week' | 'month'): string {
  if (daysLeft === 0) return period === 'week' ? 'Last day of week!' : 'Last day of month!';
  if (daysLeft === 1) return '1 day left';
  return `${daysLeft} days left`;
}

// ── Period Chip ───────────────────────────────────────────────────────────────

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
  period: 'week' | 'month';
  colors: ReturnType<typeof import('@/hooks/use-colors').useColors>;
}) {
  const hitCurrent = currentDone >= currentGoal;
  const hitLast = lastGoal > 0 && lastDone >= lastGoal;

  const pct = currentGoal > 0 ? currentDone / currentGoal : 0;
  const currentColor = hitCurrent ? '#22C55E' : pct >= 0.6 ? '#F59E0B' : '#EF4444';

  const thisLabel = period === 'week' ? 'This Week' : 'This Month';
  const lastLabel = period === 'week' ? 'Last Week' : 'Last Month';

  const daysLeft = period === 'week' ? getDaysLeftInWeek() : getDaysLeftInMonth();
  const needMore = currentGoal - currentDone;
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

      <View style={[styles.periodChipDivider, { backgroundColor: colors.border }]} />

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
              {`${lastDone}/${lastGoal}`}
            </Text>
          </View>
        ) : (
          <Text style={[styles.periodChipNoGoal, { color: colors.muted }]}>—</Text>
        )}
      </View>
    </View>
  );
}

// ── Date Range Helpers ──────────────────────────────────────────────────────

const MONTH_ABBR = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function fmtDate(d: Date): string {
  return `${MONTH_ABBR[d.getMonth()]} ${d.getDate()}`;
}

function currentWeekRange(): string {
  const now = new Date();
  const day = now.getDay();
  const diffToMon = (day === 0 ? -6 : 1 - day);
  const mon = new Date(now); mon.setDate(now.getDate() + diffToMon);
  const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
  return `${fmtDate(mon)} – ${fmtDate(sun)}`;
}

function lastWeekRange(): string {
  const now = new Date();
  const day = now.getDay();
  const diffToMon = (day === 0 ? -6 : 1 - day);
  const thisMon = new Date(now); thisMon.setDate(now.getDate() + diffToMon);
  const lastMon = new Date(thisMon); lastMon.setDate(thisMon.getDate() - 7);
  const lastSun = new Date(lastMon); lastSun.setDate(lastMon.getDate() + 6);
  return `${fmtDate(lastMon)} – ${fmtDate(lastSun)}`;
}

function weekBeforeRange(): string {
  const now = new Date();
  const day = now.getDay();
  const diffToMon = (day === 0 ? -6 : 1 - day);
  const thisMon = new Date(now); thisMon.setDate(now.getDate() + diffToMon);
  const wbMon = new Date(thisMon); wbMon.setDate(thisMon.getDate() - 14);
  const wbSun = new Date(wbMon); wbSun.setDate(wbMon.getDate() + 6);
  return `${fmtDate(wbMon)} – ${fmtDate(wbSun)}`;
}

function currentMonthRange(): string {
  const now = new Date();
  return `${MONTH_ABBR[now.getMonth()]} ${now.getFullYear()}`;
}

function lastMonthRange(): string {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return `${MONTH_ABBR[d.getMonth()]} ${d.getFullYear()}`;
}

function monthBeforeRange(): string {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth() - 2, 1);
  return `${MONTH_ABBR[d.getMonth()]} ${d.getFullYear()}`;
}

// ── Circular Progress Ring ───────────────────────────────────────────────────

const RING_SIZE = 60;      // current period ring — large
const RING_SIZE_SM = 48;   // older period rings — medium
const RING_LABEL_HEIGHT = 12;
const RING_CONTAINER_HEIGHT = RING_LABEL_HEIGHT + 3 + RING_SIZE;

// ── Calm Habit Dots (flat solid circles, fraction inside) ───────────────────────
const DOT_SIZE_LG = 44; // current period
const DOT_SIZE_SM = 36; // older periods

function HabitPillBars({
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
  function textColor(done: number, g: number) {
    if (g <= 0 || done <= 0) return '#4A5A7A';
    return '#FFFFFF';
  }

  // Split label into "THIS" prefix and period name
  // e.g. "This Mo" -> topLabel="THIS", bottomLabel="MO"
  // "2 Mo Ago" -> topLabel="2 MO", bottomLabel="AGO"
  // "Last Mo" -> topLabel="LAST", bottomLabel="MO"
  function splitLabel(label: string) {
    const parts = label.toUpperCase().split(' ');
    if (parts.length === 1) return { top: '', bottom: parts[0] };
    if (parts[0] === 'THIS') return { top: 'THIS', bottom: parts[1] };
    if (parts[0] === 'LAST') return { top: 'LAST', bottom: parts[1] };
    // "2 MO AGO" or "2 WKS"
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
        const fg = textColor(done, goal);
        const fraction = goal > 0 ? `${done}/${goal}` : '—';
        const { top, bottom } = splitLabel(label);
        const labelColor = isCurrent ? '#FFFFFF' : '#5A6A8A';
        const labelSize = 7;
        return (
          <View key={i} style={{ alignItems: 'center', gap: 2 }}>
            {/* "THIS" / "LAST" / "2 MO" above circle */}
            <Text style={{
              fontSize: labelSize,
              fontWeight: isCurrent ? '700' : '400',
              color: labelColor,
              textTransform: 'uppercase',
              letterSpacing: 0.5,
              textAlign: 'center',
              width: size + 4,
            }}>{top}</Text>
            {/* solid flat circle with fraction inside */}
            <View style={{
              width: size,
              height: size,
              borderRadius: size / 2,
              backgroundColor: bg,
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <Text style={{
                fontSize: isCurrent ? 11 : 9,
                fontWeight: '700',
                color: fg,
                textAlign: 'center',
              }}>{fraction}</Text>
            </View>
            {/* period name below circle: MO / WK / AGO */}
            <Text style={{
              fontSize: labelSize,
              fontWeight: isCurrent ? '700' : '400',
              color: labelColor,
              textTransform: 'uppercase',
              letterSpacing: 0.5,
              textAlign: 'center',
              width: size + 4,
            }}>{bottom}</Text>
          </View>
        );
      })}
    </View>
  );
}

function CircleRing({
  done,
  goal,
  size = RING_SIZE,
  periodLabel,
}: {
  done: number;
  goal: number;
  size?: number;
  periodLabel?: string;
}) {
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

  const fractionText = goal > 0 ? `${done}/${goal}` : '\u2014';
  const fractionFontSize = size <= 24 ? 7 : size <= 48 ? 12 : 14;

  return (
    <View style={{ alignItems: 'center', gap: 3 }}>
      {periodLabel && (
        <Text style={[styles.ringPeriodLabel, { color: '#9BA1A6', fontSize: size <= 24 ? 8 : size <= 48 ? 10 : 11 }]}>{periodLabel}</Text>
      )}
      <View style={{ width: size, height: size, position: 'relative' }}>
        <Svg width={size} height={size}>
          <Circle
            cx={cx} cy={cy} r={r}
            stroke="#334155" strokeWidth={strokeWidth} fill="none"
          />
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

// ── Habit Goal Row ────────────────────────────────────────────────────────────

function HabitGoalRow({
  habit,
  colors,
  onPress,
  isCalm = false,
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

  // 3 rolling periods: oldest (left/smallest) → current (right/largest)
  const p0Done = isMonthly ? getHabitMonthBeforeDone(habit.id) : getHabitWeekBeforeDone(habit.id);
  const p1Done = isMonthly ? getHabitLastMonthDone(habit.id) : getHabitLastWeekDone(habit.id);
  const p2Done = isMonthly ? getHabitMonthlyDone(habit.id) : getHabitWeeklyDone(habit.id);

  const p0Label = isMonthly ? '2 Mo Ago' : '2 Wks';
  const p1Label = isMonthly ? 'Last Mo' : 'Last Wk';
  const p2Label = isMonthly ? 'This Mo' : 'This Wk';

  return (
    <TouchableOpacity
      onPress={onPress}
      style={[styles.habitRow, { borderTopColor: colors.border }]}
      activeOpacity={0.7}
    >
      {/* Left: habit name */}
      <Text style={[styles.habitName, { color: colors.foreground }]}>
        {habit.name}
      </Text>

            {/* Right side: three rings — current period is largest */}
          <View style={styles.habitRight}>
            {goal > 0 ? (
              isCalm ? (
                <HabitPillBars
                  p0Done={p0Done} p1Done={p1Done} p2Done={p2Done} goal={goal}
                  p0Label={p0Label} p1Label={p1Label} p2Label={p2Label}
                />
              ) : (
                <View style={styles.ringTriple}>
                  <CircleRing done={p0Done} goal={goal} size={RING_SIZE_SM} periodLabel={p0Label} />
                  <View style={[styles.ringDivider, { backgroundColor: colors.border }]} />
                  <CircleRing done={p1Done} goal={goal} size={RING_SIZE_SM} periodLabel={p1Label} />
                  <View style={[styles.ringDivider, { backgroundColor: colors.border }]} />
                  <CircleRing done={p2Done} goal={goal} size={RING_SIZE} periodLabel={p2Label} />
                </View>
              )
        ) : (
          <Text style={[styles.noGoalText, { color: colors.muted }]}>
            {isMonthly ? 'No monthly goal' : 'No weekly goal'}
          </Text>
        )}
        <IconSymbol name="chevron.right" size={13} color={colors.muted} />
      </View>
    </TouchableOpacity>
  );
}

// ── Goal Card ────────────────────────────────────────────────────────────────

function GoalCard({
  cat,
  habits,
  rate,
  colors,
  onPressGoal,
  onPressHabit,
  isCalm = false,
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
  const hasData = pct > 0;

  const accentColor = isOnTrack ? '#22C55E' : isOkay ? '#F59E0B' : isBehind ? '#EF4444' : colors.muted as string;
  const cardBg = colors.surface;
  const pctColor = isOnTrack ? '#22C55E' : isOkay ? '#F59E0B' : isBehind ? '#EF4444' : colors.muted as string;
  const titleColor = colors.foreground;

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
    <View style={[styles.goalCard, { backgroundColor: cardBg, borderColor: colors.border }]}>
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
          {deadlineLabel ? (
            <View style={[styles.deadlineTag, { borderColor: deadlineColor + '55', backgroundColor: deadlineColor + '18' }]}>
              <Text style={[styles.deadlineText, { color: deadlineColor }]}>{deadlineLabel}</Text>
            </View>
          ) : null}
        </View>
        <IconSymbol name="chevron.right" size={14} color={accentColor + '88'} />
      </TouchableOpacity>

      <View style={[styles.goalCardDivider, { backgroundColor: accentColor + '25' }]} />

      {habits.length === 0 ? (
        <Text style={[styles.noHabitsText, { color: colors.muted }]}>No habits yet</Text>
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

// ── Profile Avatar ────────────────────────────────────────────────────────────

function ProfileAvatar({
  uri,
  onPress,
  size = 40,
}: {
  uri: string | null;
  onPress: () => void;
  size?: number;
}) {
  const colors = useColors();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.profileAvatar,
        {
          width: size, height: size, borderRadius: size / 2,
          backgroundColor: colors.surface,
          borderColor: colors.border,
          opacity: pressed ? 0.75 : 1,
        },
      ]}
    >
      {uri ? (
        <Image
          source={{ uri }}
          style={{ width: size, height: size, borderRadius: size / 2 }}
          resizeMode="cover"
        />
      ) : (
        <IconSymbol name="person.fill" size={size * 0.5} color={colors.muted} />
      )}
    </Pressable>
  );
}

// ── Missed Days Modal ─────────────────────────────────────────────────────────

function MissedDaysModal({
  visible,
  missedDates,
  onClose,
  onSelectDate,
  colors,
}: {
  visible: boolean;
  missedDates: string[];
  onClose: () => void;
  onSelectDate: (date: string) => void;
  colors: ReturnType<typeof import('@/hooks/use-colors').useColors>;
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.modalOverlay} onPress={onClose}>
        <View style={[styles.missedDaysSheet, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.missedDaysHandle} />
          <Text style={[styles.missedDaysTitle, { color: colors.foreground }]}>Missed Check-ins</Text>
          {missedDates.length === 0 ? (
            <Text style={[styles.missedDaysEmpty, { color: colors.muted }]}>All caught up! ✓</Text>
          ) : (
            missedDates.map((date) => (
              <Pressable
                key={date}
                onPress={() => { onSelectDate(date); onClose(); }}
                style={({ pressed }) => [
                  styles.missedDayRow,
                  { borderColor: colors.border, backgroundColor: pressed ? colors.border : 'transparent' },
                ]}
              >
                <View style={styles.missedDayLeft}>
                  <IconSymbol name="calendar" size={16} color={colors.primary} />
                  <Text style={[styles.missedDayDate, { color: colors.foreground }]}>
                    {formatDisplayDate(date)}
                  </Text>
                </View>
                <IconSymbol name="chevron.right" size={14} color={colors.muted} />
              </Pressable>
            ))
          )}
          <Pressable
            onPress={onClose}
            style={[styles.missedDaysClose, { backgroundColor: colors.border }]}
          >
            <Text style={[styles.missedDaysCloseText, { color: colors.foreground }]}>Done</Text>
          </Pressable>
        </View>
      </Pressable>
    </Modal>
  );
}

// ── Alarm Card Components ────────────────────────────────────────────────────

type AlarmColors = ReturnType<typeof import('@/hooks/use-colors').useColors>;

/** Full-width alarm card — used when 1 or 2 alarms are present */
function AlarmCardFull({
  alarm, colors, formatAlarmTime, DAY_LABELS, DAY_MAP, onToggle, onPress,
}: {
  alarm: import('@/lib/storage').AlarmEntry;
  colors: AlarmColors;
  formatAlarmTime: (h: number, m: number) => string;
  DAY_LABELS: string[];
  DAY_MAP: number[];
  onToggle: () => void;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.alarmStrip, {
        backgroundColor: colors.surface,
        borderColor: alarm.isEnabled ? colors.primary + '30' : colors.border,
        opacity: pressed ? 0.85 : 1,
        transform: [{ scale: pressed ? 0.985 : 1 }],
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 14,
      }]}
    >
      {/* Left: label + time + day chips */}
      <View style={{ flex: 1 }}>
        <Text style={[styles.alarmLabel, { color: colors.muted, marginBottom: 2 }]} numberOfLines={1}>
          {alarm.label ?? (alarm.isEnabled ? 'Alarm' : 'Alarm off')}
        </Text>
        <Text style={[styles.alarmTimeLarge, { color: alarm.isEnabled ? colors.foreground : colors.muted }]}>
          {formatAlarmTime(alarm.hour, alarm.minute)}
        </Text>
        {alarm.days && alarm.days.length > 0 && (
          <View style={[styles.alarmDayChips, { marginTop: 6 }]}>
            {DAY_LABELS.map((d, i) => {
              const active = alarm.days!.includes(DAY_MAP[i]);
              return (
                <View key={i} style={[styles.alarmDayChip, {
                  backgroundColor: active ? colors.primary + '22' : 'transparent',
                  borderColor: active ? colors.primary + '60' : colors.border,
                }]}>
                  <Text style={[styles.alarmDayChipText, { color: active ? colors.primary : colors.muted }]}>{d}</Text>
                </View>
              );
            })}
          </View>
        )}
      </View>
      {/* Right: toggle */}
      <Pressable
        onPress={(e) => { e.stopPropagation(); onToggle(); }}
        style={({ pressed }) => [{
          width: 44, height: 26, borderRadius: 13,
          backgroundColor: alarm.isEnabled ? '#4ade80' : colors.border,
          justifyContent: 'center', paddingHorizontal: 2,
          opacity: pressed ? 0.8 : 1,
          marginLeft: 12,
        }]}
      >
        <View style={{
          width: 22, height: 22, borderRadius: 11, backgroundColor: '#fff',
          shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 2, shadowOffset: { width: 0, height: 1 },
          alignSelf: alarm.isEnabled ? 'flex-end' : 'flex-start',
        }} />
      </Pressable>
    </Pressable>
  );
}

/** Half-width alarm card — used in 2×2 grid when 3 or 4 alarms are present */
function AlarmCardGrid({
  alarm, colors, formatAlarmTime, DAY_LABELS, DAY_MAP, onToggle, onPress,
}: {
  alarm: import('@/lib/storage').AlarmEntry;
  colors: AlarmColors;
  formatAlarmTime: (h: number, m: number) => string;
  DAY_LABELS: string[];
  DAY_MAP: number[];
  onToggle: () => void;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.alarmGridCard, {
        backgroundColor: colors.surface,
        borderColor: alarm.isEnabled ? colors.primary + '30' : colors.border,
        opacity: pressed ? 0.85 : 1,
        transform: [{ scale: pressed ? 0.97 : 1 }],
      }]}
    >
      {/* Top row: label + toggle */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <Text style={[styles.alarmLabel, { color: colors.muted, fontSize: 11 }]} numberOfLines={1}>
          {alarm.label ?? (alarm.isEnabled ? 'Alarm' : 'Alarm off')}
        </Text>
        <Pressable
          onPress={(e) => { e.stopPropagation(); onToggle(); }}
          style={({ pressed }) => [{
            width: 36, height: 22, borderRadius: 11,
            backgroundColor: alarm.isEnabled ? '#4ade80' : colors.border,
            justifyContent: 'center', paddingHorizontal: 2,
            opacity: pressed ? 0.8 : 1,
          }]}
        >
          <View style={{
            width: 18, height: 18, borderRadius: 9, backgroundColor: '#fff',
            shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 2, shadowOffset: { width: 0, height: 1 },
            alignSelf: alarm.isEnabled ? 'flex-end' : 'flex-start',
          }} />
        </Pressable>
      </View>
      {/* Hero time */}
      <Text style={[styles.alarmTimeGrid, { color: alarm.isEnabled ? colors.foreground : colors.muted }]}>
        {formatAlarmTime(alarm.hour, alarm.minute)}
      </Text>
      {/* Day chips */}
      {alarm.days && alarm.days.length > 0 && (
        <View style={{ flexDirection: 'row', gap: 3, marginTop: 6, flexWrap: 'wrap' }}>
          {DAY_LABELS.map((d, i) => {
            const active = alarm.days!.includes(DAY_MAP[i]);
            return (
              <View key={i} style={[styles.alarmDayChipGrid, {
                backgroundColor: active ? colors.primary + '22' : 'transparent',
                borderColor: active ? colors.primary + '60' : colors.border,
              }]}>
                <Text style={{ fontSize: 9, fontWeight: '700', color: active ? colors.primary : colors.muted }}>{d}</Text>
              </View>
            );
          })}
        </View>
      )}
    </Pressable>
  );
}

// ── Alarms Section ─────────────────────────────────────────────────────────────

function AlarmsSection({
  colors,
  router,
  formatAlarmTime,
}: {
  colors: ReturnType<typeof import('@/hooks/use-colors').useColors>;
  router: ReturnType<typeof import('expo-router').useRouter>;
  formatAlarmTime: (h: number, m: number) => string;
}) {
  const { alarms, updateAlarms } = useApp();

  const DAY_LABELS = ['M','T','W','T','F','S','S'];
  const DAY_MAP = [1,2,3,4,5,6,0];

  async function toggleAlarm(id: string) {
    const updated = alarms.map((a) =>
      a.id === id ? { ...a, isEnabled: !a.isEnabled } : a
    );
    await updateAlarms(updated);
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }

  async function addAlarm() {
    if (alarms.length >= MAX_ALARMS) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    }
    router.push('/alarms' as never);
  }

  return (
    <View style={{ marginBottom: 24 }}>
      {/* Section header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Alarms</Text>
        {alarms.length < MAX_ALARMS ? (
          <Pressable
            onPress={addAlarm}
            style={({ pressed }) => [{
              flexDirection: 'row', alignItems: 'center', gap: 4,
              paddingHorizontal: 10, paddingVertical: 5,
              borderRadius: 10, borderWidth: 1,
              borderColor: colors.primary,
              backgroundColor: pressed ? colors.primary + '20' : 'transparent',
            }]}
          >
            <Text style={{ fontSize: 16, color: colors.primary, lineHeight: 18 }}>+</Text>
            <Text style={{ fontSize: 12, fontWeight: '600', color: colors.primary }}>Add</Text>
          </Pressable>
        ) : (
          <Text style={{ fontSize: 11, color: colors.muted }}>Max 4 — disable one to add</Text>
        )}
      </View>

      {/* Alarm cards */}
      {alarms.length === 0 ? (
        <Pressable
          onPress={() => router.push('/alarms' as never)}
          style={({ pressed }) => [styles.alarmStrip, {
            backgroundColor: colors.surface, borderColor: colors.border,
            opacity: pressed ? 0.8 : 1, justifyContent: 'center', alignItems: 'center',
          }]}
        >
          <Text style={{ fontSize: 13, color: colors.muted }}>No alarms set — tap to add one</Text>
        </Pressable>
      ) : alarms.length <= 2 ? (
        /* 1–2 alarms: full-width stacked cards */
        <View style={{ gap: 10 }}>
          {alarms.map((alarm) => (
            <AlarmCardFull
              key={alarm.id}
              alarm={alarm}
              colors={colors}
              formatAlarmTime={formatAlarmTime}
              DAY_LABELS={DAY_LABELS}
              DAY_MAP={DAY_MAP}
              onToggle={() => toggleAlarm(alarm.id)}
              onPress={() => router.push('/alarms' as never)}
            />
          ))}
        </View>
      ) : (
        /* 3–4 alarms: 2×2 grid (square widget layout) */
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          {alarms.map((alarm) => (
            <AlarmCardGrid
              key={alarm.id}
              alarm={alarm}
              colors={colors}
              formatAlarmTime={formatAlarmTime}
              DAY_LABELS={DAY_LABELS}
              DAY_MAP={DAY_MAP}
              onToggle={() => toggleAlarm(alarm.id)}
              onPress={() => router.push('/alarms' as never)}
            />
          ))}
        </View>
      )}
    </View>
  );
}

// ── Home Screen ───────────────────────────────────────────────────────────────

export default function HomeScreen() {
  const {
    alarm, isPendingCheckIn, getCategoryRate,
    streak, categories, activeHabits, checkIns,
  } = useApp();
  const [showLegend, setShowLegend] = useState(false);
  const [showMissedDays, setShowMissedDays] = useState(false);
  const [widgetIds, setWidgetIds] = useState<string[]>([]);
  const [editingWidgets, setEditingWidgets] = useState(false);
  const [widgetLibraryOpen, setWidgetLibraryOpen] = useState(false);
  const [motivationalGenre, setMotivationalGenre] = useState<MotivationalGenre>('general');
  const [showGenrePicker, setShowGenrePicker] = useState(false);

  // Load saved motivational genre preference
  useEffect(() => {
    AsyncStorage.getItem(MOTIVATIONAL_GENRE_KEY).then((v) => {
      if (v) setMotivationalGenre(v as MotivationalGenre);
    });
  }, []);

  const WIDGET_STORAGE_KEY = 'daycheck:dashboard:widgets:v1';
  const DEFAULT_WIDGETS: string[] = [];

  // Load widget layout from storage
  useEffect(() => {
    AsyncStorage.getItem(WIDGET_STORAGE_KEY).then((raw) => {
      if (raw) {
        try { setWidgetIds(JSON.parse(raw)); } catch { setWidgetIds([]); }
      } else {
        setWidgetIds(DEFAULT_WIDGETS);
      }
    });
  }, []);

  async function saveWidgets(ids: string[]) {
    setWidgetIds(ids);
    await AsyncStorage.setItem(WIDGET_STORAGE_KEY, JSON.stringify(ids));
  }

  function removeWidget(id: string) {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    saveWidgets(widgetIds.filter((w) => w !== id));
  }

  function addWidget(id: string) {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    saveWidgets([...widgetIds, id]);
    setWidgetLibraryOpen(false);
  }

  function moveWidget(id: string, dir: 'up' | 'down') {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const idx = widgetIds.indexOf(id);
    if (idx < 0) return;
    const next = [...widgetIds];
    const swap = dir === 'up' ? idx - 1 : idx + 1;
    if (swap < 0 || swap >= next.length) return;
    [next[idx], next[swap]] = [next[swap], next[idx]];
    saveWidgets(next);
  }
  const [profilePicUri, setProfilePicUri] = useState<string | null>(null);
  const [ritualStacks, setRitualStacks] = useState<RitualStack[]>([]);

  useFocusEffect(
    useCallback(() => {
      loadStacks().then(setRitualStacks);
    }, [])
  );

  const totalDaysLogged = useMemo(() => new Set(checkIns.map((e) => e.date)).size, [checkIns]);
  const sortedCategories = useMemo(() => [...categories].sort((a, b) => a.order - b.order), [categories]);

  const colors = useColors();
  const isCalm = useIsCalm();
  const router = useRouter();
  const maxWidth = useContentMaxWidth();
  const yesterday = yesterdayString();

  // AI Coach button — no animation

  // Track whether the user already completed a journal/check-in for yesterday
  const [hasYesterdayEntry, setHasYesterdayEntry] = useState(false);
  const [journalEntryCount, setJournalEntryCount] = useState(0);
  const [journalStreak, setJournalStreak] = useState(0);

  // Reload on every screen focus so it stays fresh after the user does their check-in
  useFocusEffect(
    useCallback(() => {
      (async () => {
        const uid = await getLastUserId();
        const loaded = await loadEntries(uid || 'default');
        const yest = yesterdayString();
        setHasYesterdayEntry(loaded.some((e) => e.date === yest));
        setJournalEntryCount(loaded.length);
        // Compute journal streak (consecutive days with at least one entry)
        const dateSet = new Set(loaded.map((e) => e.date));
        const todayStr = todayDateStr();
        const ystStr = yest;
        let jStreak = 0;
        if (dateSet.has(todayStr) || dateSet.has(ystStr)) {
          const anchor = dateSet.has(todayStr) ? new Date() : new Date(ystStr + 'T12:00:00');
          const check = new Date(anchor);
          while (true) {
            const s = `${check.getFullYear()}-${String(check.getMonth()+1).padStart(2,'0')}-${String(check.getDate()).padStart(2,'0')}`;
            if (!dateSet.has(s)) break;
            jStreak++;
            check.setDate(check.getDate() - 1);
          }
        }
        setJournalStreak(jStreak);
      })();
    }, [])
  );

  // Load profile picture — per-user key so switching accounts shows the right photo
  useEffect(() => {
    (async () => {
      const uid = await getLastUserId();
      const key = profilePicKey(uid || 'default');
      const uri = await AsyncStorage.getItem(key);
      if (uri) setProfilePicUri(uri);
    })();
  }, []);

  // First-launch: show permissions setup screen once on mobile
  useEffect(() => {
    if (Platform.OS === 'web') return;
    AsyncStorage.getItem(PERMISSIONS_DONE_KEY).then((done) => {
      if (!done) {
        router.push('/permissions-setup' as never);
      }
    });
  }, [router]);

  // Calculate missed check-in dates (up to last 30 days, excluding today)
  const missedDates = useMemo(() => {
    if (activeHabits.length === 0) return [];
    const checkedDates = new Set(checkIns.map((e) => e.date));
    const missed: string[] = [];
    // Look back up to 7 days, skip today
    for (let i = 1; i <= 7; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = toDateString(d);
      if (!checkedDates.has(dateStr)) {
        missed.push(dateStr);
      }
    }
    return missed.slice(0, 7); // cap at 7 days shown
  }, [activeHabits, checkIns]);

  // Use 7-day rolling window for goal card score
  const rateRange = 7;

  async function handlePickProfilePic() {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') return;
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.7,
      });
      if (!result.canceled && result.assets[0]?.uri) {
        const uri = result.assets[0].uri;
        setProfilePicUri(uri);
        const uid = await getLastUserId();
        await AsyncStorage.setItem(profilePicKey(uid || 'default'), uri);
        // Also convert to base64 data URI for persistence across app restarts
        try {
          if (Platform.OS === 'web') {
            const resp = await fetch(uri);
            const blob = await resp.blob();
            const dataUri = await new Promise<string>((resolve) => {
              const reader = new FileReader();
              reader.onloadend = () => resolve(reader.result as string);
              reader.readAsDataURL(blob);
            });
            setProfilePicUri(dataUri);
            await AsyncStorage.setItem(profilePicKey(uid || 'default'), dataUri);
          }
        } catch { /* keep original URI if conversion fails */ }
      }
    } catch {
      // ignore
    }
  }

  function handleCheckIn(date?: string) {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push((`/checkin?date=${date ?? yesterday}`) as never);
  }

  function formatAlarmTime(h: number, m: number): string {
    const ph = h >= 12 ? 'PM' : 'AM';
    const hour = h % 12 === 0 ? 12 : h % 12;
    return `${hour}:${m.toString().padStart(2, '0')} ${ph}`;
  }

  return (
    <ScreenContainer containerClassName={isCalm ? 'bg-[#0D1135]' : undefined}>
      {isCalm && <CalmHeader />}
      <ScrollView contentContainerStyle={[styles.scroll, isCalm && { paddingTop: 20 }]} showsVerticalScrollIndicator={false}>
        <View style={maxWidth ? { maxWidth, alignSelf: 'center', width: '100%' } : undefined}>

          {/* ── Header: date + right-side actions (non-Calm) ── */}
          {!isCalm && <View style={styles.header}>
            {/* Left: date — single line, shrinks if needed */}
            <Text
              style={[styles.dateText, { color: colors.foreground, flexShrink: 1 }]}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.75}
            >
              {new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
            </Text>

            {/* Right: streak pill + journal badge + AI coach + profile */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              {/* Habit streak pill */}
              {streak > 0 && (
                <View style={styles.streakPill}>
                  <IconSymbol name="flame.fill" size={18} color="#FF6B35" />
                  <Text style={styles.streakNum}>{streak}</Text>
                </View>
              )}

              {/* Journal fire badge — taps to journal */}
              <Pressable
                onPress={() => router.push('/(tabs)/journal' as never)}
                style={({ pressed }) => ({
                  flexDirection: 'row', alignItems: 'center', gap: 4,
                  backgroundColor: '#F59E0B28', borderRadius: 14,
                  paddingHorizontal: 11, paddingVertical: 7,
                  borderWidth: 1, borderColor: '#F59E0B44',
                  opacity: pressed ? 0.7 : 1,
                })}
              >
                <IconSymbol name="flame.fill" size={17} color="#F59E0B" />
                <Text style={{ fontSize: 16, fontWeight: '800', color: '#F59E0B', letterSpacing: -0.3 }}>
                  {journalStreak > 0 ? journalStreak : journalEntryCount}
                </Text>
              </Pressable>


              {/* Profile avatar */}
              <ProfileAvatar
                uri={profilePicUri}
                onPress={handlePickProfilePic}
                size={36}
              />
            </View>
          </View>}

          {/* ── Stack Widgets: Wake Up + Sleep (side-by-side) ── */}
          <View style={{ flexDirection: 'row', gap: 10, marginBottom: 12 }}>
            {(['wakeup', 'sleep'] as const).map((kind) => {
              const stack = ritualStacks.find((s) => s.id === kind);
              if (!stack) return null;
              const isWakeup = kind === 'wakeup';

              const gradTop    = isWakeup ? '#FFD93D' : '#1A1040';
              const gradMid    = isWakeup ? '#FF8C42' : '#2D1B69';
              const gradBottom = isWakeup ? '#FF4500' : '#0D0820';
              const panelBg    = isWakeup ? '#1C0A00' : '#0D0820';
              const accentColor = isWakeup ? '#FF8C42' : '#A78BFA';

              return (
                <Pressable
                  key={kind}
                  onPress={() => {
                    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    if (stack.steps.length === 0) {
                      router.push(`/stack-editor?id=${stack.id}` as never);
                    } else {
                      router.push(`/stack-player?id=${stack.id}` as never);
                    }
                  }}
                  style={({ pressed }) => ({
                    flex: 1, borderRadius: 20, overflow: 'hidden',
                    opacity: pressed ? 0.88 : 1,
                    transform: [{ scale: pressed ? 0.97 : 1 }],
                  })}
                >
                  {/* Illustrated gradient top */}
                  <LinearGradient
                    colors={[gradTop, gradMid, gradBottom]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 0, y: 1 }}
                    style={{ height: 110, overflow: 'hidden' }}
                  >
                    {isWakeup ? (
                      <Svg width="100%" height="110" viewBox="0 0 180 110" style={{ position: 'absolute', bottom: 0 }}>
                        <Circle cx="90" cy="145" r="90" fill="#FF6B00" opacity={0.5} />
                        <Circle cx="90" cy="58" r="28" fill="#FFE566" opacity={0.95} />
                        <Circle cx="90" cy="58" r="40" fill="#FFD93D" opacity={0.18} />
                        <Circle cx="90" cy="58" r="54" fill="#FFD93D" opacity={0.09} />
                      </Svg>
                    ) : (
                      <Svg width="100%" height="110" viewBox="0 0 180 110" style={{ position: 'absolute', bottom: 0 }}>
                        <Circle cx="30"  cy="22" r="1.5" fill="#fff" opacity={0.8} />
                        <Circle cx="70"  cy="12" r="1.2" fill="#fff" opacity={0.6} />
                        <Circle cx="120" cy="18" r="2"   fill="#fff" opacity={0.9} />
                        <Circle cx="155" cy="30" r="1.5" fill="#fff" opacity={0.6} />
                        <Circle cx="15"  cy="55" r="1.2" fill="#fff" opacity={0.4} />
                        <Circle cx="165" cy="58" r="1.2" fill="#fff" opacity={0.5} />
                        <Circle cx="115" cy="50" r="26" fill="#7C3AED" opacity={0.18} />
                        <Circle cx="115" cy="50" r="18" fill="#C4B5FD" opacity={0.95} />
                        <Circle cx="127" cy="43" r="15" fill={gradMid} />
                        <Circle cx="40"  cy="140" r="80" fill="#1A1040" opacity={0.9} />
                        <Circle cx="145" cy="145" r="85" fill="#12082E" opacity={0.9} />
                      </Svg>
                    )}
                  </LinearGradient>

                  {/* Dark info panel */}
                  <View style={{ backgroundColor: panelBg, paddingHorizontal: 12, paddingTop: 10, paddingBottom: 12 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                      <Text style={{ fontSize: 15, fontWeight: '800', color: '#fff', letterSpacing: -0.3, flexShrink: 1, marginRight: 4 }} numberOfLines={1}>
                        {stack.name}
                      </Text>
                      <Pressable
                        onPress={(e) => {
                          e.stopPropagation();
                          if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                          router.push(`/stack-editor?id=${stack.id}` as never);
                        }}
                        style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}
                      >
                        <Text style={{ fontSize: 12, fontWeight: '600', color: accentColor }}>Edit</Text>
                      </Pressable>
                    </View>
                    {stack.steps.length === 0 ? (
                      <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', lineHeight: 15 }} numberOfLines={2}>
                        Tap Edit to build your ritual
                      </Text>
                    ) : (
                      <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', lineHeight: 15 }} numberOfLines={2}>
                        {stack.steps.map((step) => stepLabel(step)).join(' · ')}
                      </Text>
                    )}
                  </View>
                </Pressable>
              );
            })}
          </View>

          {/* ── Sounds Card ── */}
          <Pressable
            onPress={() => {
              if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push('/sounds' as never);
            }}
            style={({ pressed }) => [
              styles.soundsCard,
              {
                backgroundColor: isCalm ? '#1A2050' : colors.surface,
                borderColor: isCalm ? '#252D6E' : colors.border,
                opacity: pressed ? 0.85 : 1,
                transform: [{ scale: pressed ? 0.98 : 1 }],
              },
            ]}
          >
            <View style={[styles.soundsIconWrap, { backgroundColor: '#10B98122' }]}>
              <IconSymbol name="headphones" size={24} color="#10B981" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.soundsTitle, { color: isCalm ? '#fff' : colors.foreground }]}>Sounds</Text>
              <Text style={[styles.soundsSub, { color: isCalm ? 'rgba(255,255,255,0.6)' : colors.muted }]}>Meditate · Focus · Sleep</Text>
            </View>
            <IconSymbol name="chevron.right" size={16} color={isCalm ? 'rgba(255,255,255,0.4)' : colors.muted} />
          </Pressable>

          {/* ── Alarms section (up to 4) ── */}
          <AlarmsSection colors={colors} router={router} formatAlarmTime={formatAlarmTime} />

          {/* ── Customizable Widgets ── */}
          <WidgetGrid
            widgetIds={widgetIds}
            editing={editingWidgets}
            colors={colors}
            isCalm={isCalm}
            streak={streak}
            totalDaysLogged={totalDaysLogged}
            categories={categories}
            sortedCategories={sortedCategories}
            activeHabits={activeHabits}
            getCategoryRate={getCategoryRate}
            rateRange={rateRange}
            router={router}
            onRemove={removeWidget}
            onMoveUp={(id) => moveWidget(id, 'up')}
            onMoveDown={(id) => moveWidget(id, 'down')}
          />

          {/* ── Edit Dashboard button ── */}
          <View style={styles.editDashRow}>
            {editingWidgets ? (
              <>
                <TouchableOpacity
                  onPress={() => { setWidgetLibraryOpen(true); }}
                  style={[styles.editDashBtn, { backgroundColor: colors.primary + '22', borderColor: colors.primary + '55' }]}
                  activeOpacity={0.8}
                >
                  <IconSymbol name="plus" size={16} color={colors.primary} />
                  <Text style={[styles.editDashBtnText, { color: colors.primary }]}>Add Widget</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setEditingWidgets(false)}
                  style={[styles.editDashBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
                  activeOpacity={0.8}
                >
                  <IconSymbol name="checkmark" size={16} color={colors.foreground} />
                  <Text style={[styles.editDashBtnText, { color: colors.foreground }]}>Done</Text>
                </TouchableOpacity>
              </>
            ) : (
              <TouchableOpacity
                onPress={() => setEditingWidgets(true)}
                style={[styles.editDashBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
                activeOpacity={0.8}
              >
                <IconSymbol name="pencil" size={16} color={colors.muted} />
                <Text style={[styles.editDashBtnText, { color: colors.muted }]}>Edit Dashboard</Text>
              </TouchableOpacity>
            )}
          </View>

          <View style={{ height: 32 }} />

          {/* ── Widget Library Modal ── */}
          <Modal visible={widgetLibraryOpen} transparent animationType="slide" onRequestClose={() => setWidgetLibraryOpen(false)}>
            <Pressable style={styles.widgetLibraryOverlay} onPress={() => setWidgetLibraryOpen(false)} />
            <SwipeSheet onClose={() => setWidgetLibraryOpen(false)} style={[styles.widgetLibrarySheet, { backgroundColor: isCalm ? '#0D1135' : colors.surface, borderColor: colors.border }]}>
              {/* Drag handle */}
              <View style={{ width: 44, height: 5, borderRadius: 3, backgroundColor: colors.muted + '80', alignSelf: 'center', marginBottom: 12 }} />
              <Text style={[styles.widgetLibraryTitle, { color: colors.foreground }]}>Add Widget</Text>
              <ScrollView showsVerticalScrollIndicator={false} style={{ flexShrink: 1 }} contentContainerStyle={{ gap: 0, paddingBottom: 8 }}>
                {ALL_WIDGETS.filter((w) => !widgetIds.includes(w.id)).length === 0 ? (
                  <Text style={[styles.emptyText, { color: colors.muted, textAlign: 'center', paddingVertical: 24 }]}>All widgets are already on your dashboard.</Text>
                ) : (
                  ALL_WIDGETS.filter((w) => !widgetIds.includes(w.id)).map((w) => (
                    <TouchableOpacity
                      key={w.id}
                      onPress={() => addWidget(w.id)}
                      style={[styles.widgetLibraryRow, { borderColor: colors.border }]}
                      activeOpacity={0.8}
                    >
                      <View style={[styles.widgetLibraryIcon, { backgroundColor: colors.primary + '18' }]}>
                        <IconSymbol name={w.icon as any} size={20} color={colors.primary} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.widgetLibraryLabel, { color: colors.foreground }]}>{w.label}</Text>
                        <Text style={[styles.widgetLibraryDesc, { color: colors.muted }]}>{w.desc}</Text>
                      </View>
                      <IconSymbol name="plus.circle.fill" size={24} color={colors.primary} />
                    </TouchableOpacity>
                  ))
                )}
              </ScrollView>
              <TouchableOpacity
                onPress={() => setWidgetLibraryOpen(false)}
                style={[styles.missedDaysClose, { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, marginTop: 8 }]}
                activeOpacity={0.8}
              >
                <Text style={[styles.missedDaysCloseText, { color: colors.foreground }]}>Cancel</Text>
              </TouchableOpacity>
            </SwipeSheet>
          </Modal>
        </View>
      </ScrollView>

      {/* ── Missed Days Modal ── */}
      <MissedDaysModal
        visible={showMissedDays}
        missedDates={missedDates}
        onClose={() => setShowMissedDays(false)}
        onSelectDate={handleCheckIn}
        colors={colors}
      />
    </ScreenContainer>
  );
}

// ─── Calendar helpers (mirrored from journal.tsx) ────────────────────────────
const MONTH_NAMES_CAL = ["January","February","March","April","May","June","July","August","September","October","November","December"];
// ─── Widget System ───────────────────────────────────────────────────────────
const ALL_WIDGETS: { id: string; label: string; desc: string; icon: string }[] = [
  { id: 'alarm',        label: 'Alarm',           desc: 'Your daily alarm time and schedule',    icon: 'alarm.fill' },
  { id: 'goals',        label: 'Goals',           desc: 'Goal cards with habit progress rings',  icon: 'flag.fill' },
  { id: 'manage_habits',label: 'Manage Habits',   desc: 'Quick link to manage habits & goals',   icon: 'list.bullet' },
  { id: 'daily_quote',  label: 'Daily Quote',     desc: 'A motivational quote that rotates daily', icon: 'text.bubble.fill' },
  { id: 'streak',       label: 'Streak Counter',  desc: 'Your current check-in streak',          icon: 'flame.fill' },
  { id: 'days_logged',  label: 'Days Logged',     desc: 'Total days you have logged check-ins',  icon: 'calendar' },
  { id: 'vision_board', label: 'Vision Board',    desc: 'Preview of your vision board images',   icon: 'photo.stack.fill' },
  { id: 'rewards',      label: 'Rewards',         desc: 'Your reward progress and milestones',   icon: 'gift.fill' },
];

function WidgetGrid({
  widgetIds, editing, colors, isCalm, streak, totalDaysLogged,
  categories, sortedCategories, activeHabits, getCategoryRate, rateRange,
  router, onRemove, onMoveUp, onMoveDown,
}: {
  widgetIds: string[];
  editing: boolean;
  colors: any;
  isCalm: boolean;
  streak: number;
  totalDaysLogged: number;
  categories: any[];
  sortedCategories: any[];
  activeHabits: any[];
  getCategoryRate: (id: string, range: number) => number;
  rateRange: number;
  router: any;
  onRemove: (id: string) => void;
  onMoveUp: (id: string) => void;
  onMoveDown: (id: string) => void;
}) {
  if (widgetIds.length === 0 && !editing) {
    return (
      <View style={{ paddingVertical: 24, alignItems: 'center' }}>
        <Text style={{ color: colors.muted, fontSize: 14, textAlign: 'center' }}>Tap Edit Dashboard to customize</Text>
      </View>
    );
  }

  function renderWidget(id: string, idx: number) {
    const wrapStyle = [
      widgetStyles.widget,
      editing && { borderColor: colors.primary + '55', borderWidth: 1.5 },
    ];
    const editControls = editing ? (
      <View style={widgetStyles.editRow}>
        <TouchableOpacity onPress={() => onMoveUp(id)} style={widgetStyles.editBtn} activeOpacity={0.7}>
          <IconSymbol name="chevron.up" size={14} color={colors.muted} />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => onMoveDown(id)} style={widgetStyles.editBtn} activeOpacity={0.7}>
          <IconSymbol name="chevron.down" size={14} color={colors.muted} />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => onRemove(id)} style={[widgetStyles.editBtn, { backgroundColor: '#EF444420' }]} activeOpacity={0.7}>
          <IconSymbol name="xmark" size={14} color="#EF4444" />
        </TouchableOpacity>
      </View>
    ) : null;

    if (id === 'alarm') {
      return null; // alarm is always shown above widgets
    }
    if (id === 'goals') {
      return (
        <View key={id} style={wrapStyle}>
          {editControls}
          <View style={widgetStyles.widgetHeader}>
            <Text style={[widgetStyles.widgetTitle, { color: colors.foreground }]}>Goals</Text>
          </View>
          {categories.length === 0 ? (
            <Text style={[widgetStyles.emptyText, { color: colors.muted }]}>No goals yet — add one in Manage Habits</Text>
          ) : (
            <View style={{ gap: 12 }}>
              {sortedCategories.map((cat: any) => {
                const catHabits = activeHabits.filter((h: any) => h.category === cat.id);
                return (
                  <GoalCard
                    key={cat.id}
                    cat={cat}
                    habits={catHabits}
                    rate={getCategoryRate(cat.id, rateRange)}
                    colors={colors}
                    onPressGoal={() => router.push(`/category-detail?categoryId=${cat.id}` as never)}
                    onPressHabit={(habitId: string) => router.push(`/habit-detail?habitId=${habitId}` as never)}
                    isCalm={isCalm}
                  />
                );
              })}
            </View>
          )}
        </View>
      );
    }
    if (id === 'manage_habits') {
      return (
        <View key={id} style={wrapStyle}>
          {editControls}
          <Pressable
            onPress={() => router.push('/habits' as never)}
            style={({ pressed }) => [widgetStyles.manageRow, { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.8 : 1 }]}
          >
            <IconSymbol name="list.bullet" size={18} color={colors.primary} />
            <Text style={[widgetStyles.manageText, { color: colors.foreground }]}>Manage Habits & Goals</Text>
            <IconSymbol name="chevron.right" size={16} color={colors.muted} />
          </Pressable>
        </View>
      );
    }
    if (id === 'daily_quote') {
      return (
        <View key={id} style={wrapStyle}>
          {editControls}
          <Text style={[widgetStyles.quoteText, { color: colors.muted }]}>"{getDailyQuote()}"</Text>
        </View>
      );
    }
    if (id === 'streak') {
      return (
        <View key={id} style={[wrapStyle, widgetStyles.statWidget, { backgroundColor: isCalm ? '#1A2050' : colors.surface, borderColor: isCalm ? '#252D6E' : colors.border }]}>
          {editControls}
          <IconSymbol name="flame.fill" size={28} color="#FF6B35" />
          <Text style={[widgetStyles.statValue, { color: colors.foreground }]}>{streak}</Text>
          <Text style={[widgetStyles.statLabel, { color: colors.muted }]}>Streak</Text>
        </View>
      );
    }
    if (id === 'days_logged') {
      return (
        <View key={id} style={[wrapStyle, widgetStyles.statWidget, { backgroundColor: isCalm ? '#1A2050' : colors.surface, borderColor: isCalm ? '#252D6E' : colors.border }]}>
          {editControls}
          <IconSymbol name="calendar" size={28} color={isCalm ? '#F5A623' : colors.primary} />
          <Text style={[widgetStyles.statValue, { color: colors.foreground }]}>{totalDaysLogged}</Text>
          <Text style={[widgetStyles.statLabel, { color: colors.muted }]}>Days Logged</Text>
        </View>
      );
    }
    if (id === 'vision_board') {
      return (
        <View key={id} style={wrapStyle}>
          {editControls}
          <View style={widgetStyles.widgetHeader}>
            <Text style={[widgetStyles.widgetTitle, { color: colors.foreground }]}>Vision Board</Text>
            <TouchableOpacity onPress={() => router.push('/(tabs)/settings' as never)} activeOpacity={0.7}>
              <Text style={[widgetStyles.viewAll, { color: colors.primary }]}>View All</Text>
            </TouchableOpacity>
          </View>
          <Text style={[widgetStyles.emptyText, { color: colors.muted }]}>Your vision board images appear here. Manage them in the You tab.</Text>
        </View>
      );
    }
    if (id === 'rewards') {
      return (
        <View key={id} style={wrapStyle}>
          {editControls}
          <View style={widgetStyles.widgetHeader}>
            <Text style={[widgetStyles.widgetTitle, { color: colors.foreground }]}>Rewards</Text>
            <TouchableOpacity onPress={() => router.push('/(tabs)/settings' as never)} activeOpacity={0.7}>
              <Text style={[widgetStyles.viewAll, { color: colors.primary }]}>View All</Text>
            </TouchableOpacity>
          </View>
          <Text style={[widgetStyles.emptyText, { color: colors.muted }]}>Your reward milestones appear here. Manage them in the You tab.</Text>
        </View>
      );
    }
    return null;
  }

  return (
    <View style={{ gap: 14 }}>
      {widgetIds.map((id, idx) => renderWidget(id, idx))}
    </View>
  );
}

const widgetStyles = StyleSheet.create({
  widget: { borderRadius: 0, overflow: 'hidden' },
  editRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: 6, marginBottom: 8 },
  editBtn: { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(128,128,128,0.12)' },
  widgetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  widgetTitle: { fontSize: 17, fontWeight: '800', letterSpacing: -0.3 },
  viewAll: { fontSize: 13, fontWeight: '600' },
  emptyText: { fontSize: 13, textAlign: 'center', paddingVertical: 12 },
  statWidget: { borderRadius: 14, padding: 14, alignItems: 'center', gap: 4, borderWidth: 1 },
  statValue: { fontSize: 28, fontWeight: '700' },
  statLabel: { fontSize: 11, fontWeight: '500' },
  manageRow: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 14, padding: 16, borderWidth: 1 },
  manageText: { flex: 1, fontSize: 15, fontWeight: '600' },
  quoteText: { fontSize: 13, fontStyle: 'italic', textAlign: 'center', lineHeight: 20, paddingVertical: 8 },
});

function calGetMonthDays(year: number, month: number): number { return new Date(year, month, 0).getDate(); }
function calGetFirstDay(year: number, month: number): number { return new Date(year, month - 1, 1).getDay(); }
function calGenerateMonths(sy: number, sm: number, ey: number, em: number): { year: number; month: number }[] {
  const r: { year: number; month: number }[] = []; let y = sy; let m = sm;
  while (y < ey || (y === ey && m <= em)) { r.push({ year: y, month: m }); m++; if (m > 12) { m = 1; y++; } }
  return r;
}

// ─── Inline Calendar Section ──────────────────────────────────────────────────
function InlineCalendar({ colors }: { colors: any }) {
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const { width: winWidth } = useWindowDimensions();

  useEffect(() => {
    (async () => {
      const uid = await getLastUserId();
      const loaded = await loadEntries(uid || 'default');
      setEntries(loaded);
    })();
  }, []);

  const today = new Date();
  const todayStr = todayDateStr();
  const months = useMemo(() => calGenerateMonths(today.getFullYear() - 2, 1, today.getFullYear() + 1, 12), []);
  const todayMonthIndex = useMemo(() => {
    const y = today.getFullYear(); const m = today.getMonth() + 1;
    return months.findIndex((mo) => mo.year === y && mo.month === m);
  }, [months]);

  const entryMap = useMemo(() => {
    const map = new Map<string, JournalEntry[]>();
    for (const e of entries) { const list = map.get(e.date) ?? []; list.push(e); map.set(e.date, list); }
    return map;
  }, [entries]);

  const CELL_GAP = 3;
  const cellWidth = Math.floor(((winWidth > 0 ? winWidth : 390) - 40 - CELL_GAP * 6) / 7);
  const cellHeight = cellWidth;

  const scrollRef = useRef<ScrollView>(null);
  const [didScroll, setDidScroll] = useState(false);
  const monthOffsets = useRef<number[]>([]);

  useEffect(() => {
    if (!didScroll && todayMonthIndex >= 0 && monthOffsets.current[todayMonthIndex] != null) {
      scrollRef.current?.scrollTo({ y: monthOffsets.current[todayMonthIndex], animated: false });
      setDidScroll(true);
    }
  }, [didScroll, todayMonthIndex]);

  return (
    <ScrollView ref={scrollRef} showsVerticalScrollIndicator={false} style={{ maxHeight: 500 }} contentContainerStyle={{ paddingBottom: 20 }}>
      {months.map(({ year, month }, monthIndex) => {
        const daysInMonth = calGetMonthDays(year, month);
        const firstDay = calGetFirstDay(year, month);
        const cells: (number | null)[] = [];
        for (let i = 0; i < firstDay; i++) cells.push(null);
        for (let d = 1; d <= daysInMonth; d++) cells.push(d);
        while (cells.length % 7 !== 0) cells.push(null);
        const rows: (number | null)[][] = [];
        for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));
        return (
          <View key={`${year}-${month}`} onLayout={(e) => {
            monthOffsets.current[monthIndex] = e.nativeEvent.layout.y;
            if (monthIndex === todayMonthIndex && !didScroll) {
              scrollRef.current?.scrollTo({ y: e.nativeEvent.layout.y, animated: false });
              setDidScroll(true);
            }
          }} style={{ marginBottom: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6, paddingHorizontal: 0, paddingTop: 12, paddingBottom: 6 }}>
              <Text style={{ fontSize: 15, fontWeight: '700', color: colors.foreground }}>{MONTH_NAMES_CAL[month - 1]}</Text>
              <Text style={{ fontSize: 12, fontWeight: '500', color: colors.muted }}>{year}</Text>
            </View>
            <View style={{ flexDirection: 'row', gap: CELL_GAP, marginBottom: CELL_GAP }}>
              {['S','M','T','W','T','F','S'].map((d, i) => (
                <View key={i} style={{ width: cellWidth, alignItems: 'center' }}>
                  <Text style={{ fontSize: 9, fontWeight: '600', color: colors.muted }}>{d}</Text>
                </View>
              ))}
            </View>
            {rows.map((row, rowIdx) => (
              <View key={rowIdx} style={{ flexDirection: 'row', gap: CELL_GAP, marginBottom: CELL_GAP }}>
                {row.map((day, colIdx) => {
                  if (day === null) return <View key={`e-${colIdx}`} style={{ width: cellWidth, height: cellHeight }} />;
                  const dateStr = `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
                  const dayEntries = entryMap.get(dateStr) || [];
                  const isToday = dateStr === todayStr;
                  const isFuture = dateStr > todayStr;
                  const hasEntries = dayEntries.length > 0;
                  let photoUri: string | null = null;
                  for (const de of dayEntries) {
                    const photo = de.attachments?.find((a: { type: string }) => a.type === 'photo');
                    if (photo) { photoUri = (photo as { uri: string }).uri; break; }
                  }
                  const bgColor = photoUri ? '#000' : hasEntries ? colors.primary : colors.surface;
                  const cellOpacity = isFuture ? 0.18 : photoUri ? 1 : hasEntries ? 0.75 : 0.22;
                  return (
                    <View key={day} style={{
                      width: cellWidth, height: cellHeight, borderRadius: 4, overflow: 'hidden',
                      backgroundColor: bgColor, opacity: cellOpacity,
                      borderWidth: isToday ? 1.5 : 0, borderColor: isToday ? colors.primary : 'transparent',
                    }}>
                      {photoUri ? <Image source={{ uri: photoUri }} style={StyleSheet.absoluteFill} resizeMode="cover" /> : null}
                      <Text style={{ fontSize: 10, fontWeight: '700', lineHeight: 13, color: photoUri ? '#fff' : isToday ? colors.primary : colors.foreground, opacity: photoUri ? 0.9 : isFuture ? 0.4 : 0.85, paddingLeft: 3, paddingTop: 2 }}>{day}</Text>
                    </View>
                  );
                })}
              </View>
            ))}
          </View>
        );
      })}
    </ScrollView>
  );
}

// ─── Inline Vision Board Section ─────────────────────────────────────────────
function InlineVisionBoard({ colors }: { colors: any }) {
  const { categories, isDemoMode } = useApp();
  const sortedCategories = useMemo(() => [...categories].sort((a, b) => a.order - b.order), [categories]);
  const [board, setBoard] = useState<VisionBoard>({});

  useEffect(() => {
    loadVisionBoard().then(async (loaded) => {
      if (Platform.OS !== 'web') {
        const docDir = FileSystem.documentDirectory ?? '';
        const cleaned: VisionBoard = {};
        for (const [catId, uris] of Object.entries(loaded)) {
          const valid: string[] = [];
          for (const uri of uris) {
            if (uri.startsWith(docDir)) {
              try { const info = await FileSystem.getInfoAsync(uri); if (info.exists) valid.push(uri); } catch { /* skip */ }
            }
          }
          cleaned[catId] = valid;
        }
        setBoard(cleaned);
      } else { setBoard(loaded); }
    });
  }, [isDemoMode]);

  const pickImage = useCallback(async (catId: string) => {
    if (Platform.OS !== 'web') {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsMultipleSelection: true, quality: 0.8, selectionLimit: 10 });
    if (!result.canceled && result.assets.length > 0) {
      const uris = result.assets.map((a) => a.uri);
      const existing = board[catId] ?? [];
      const updated = { ...board, [catId]: [...existing, ...uris] };
      setBoard(updated);
      await saveVisionBoard(updated);
    }
  }, [board]);

  if (sortedCategories.length === 0) {
    return <Text style={{ color: colors.muted, fontSize: 13, textAlign: 'center', padding: 20 }}>No goals yet — add one in Manage Habits</Text>;
  }

  return (
    <View style={{ gap: 12 }}>
      {sortedCategories.map((cat) => {
        const images = board[cat.id] ?? [];
        return (
          <View key={cat.id} style={[pillSectionStyles.vbCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={pillSectionStyles.vbHeader}>
              <CategoryIcon categoryId={cat.id} lifeArea={cat.lifeArea} size={18} color={colors.primary} bgColor={colors.primary + '18'} bgSize={36} borderRadius={9} />
              <Text style={[pillSectionStyles.vbLabel, { color: colors.foreground }]} numberOfLines={1}>{cat.label}</Text>
              <TouchableOpacity onPress={() => pickImage(cat.id)} activeOpacity={0.7} style={[pillSectionStyles.vbAddBtn, { backgroundColor: colors.primary + '18', borderColor: colors.primary + '44' }]}>
                <Text style={[pillSectionStyles.vbAddBtnText, { color: colors.primary }]}>+ Photos</Text>
              </TouchableOpacity>
            </View>
            {images.length > 0 ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }}>
                {images.map((uri, idx) => (
                  <Image key={idx} source={{ uri }} style={{ width: 80, height: 80, borderRadius: 8, marginRight: 6 }} resizeMode="cover" />
                ))}
              </ScrollView>
            ) : (
              <Text style={{ color: colors.primary, fontSize: 12, paddingTop: 6, paddingBottom: 2 }}>Tap + Photos to add images →</Text>
            )}
          </View>
        );
      })}
    </View>
  );
}

// ─── Inline Rewards Section ───────────────────────────────────────────────────
function InlineRewards({ colors }: { colors: any }) {
  const { habits, checkIns } = useApp();
  const [claims, setClaims] = useState<{ habitId: string; periodKey: string; claimedAt: string }[]>([]);

  useEffect(() => {
    AsyncStorage.getItem('habit_reward_claims_v1').then((raw) => {
      if (raw) { try { setClaims(JSON.parse(raw)); } catch { /* ignore */ } }
    });
  }, []);

  function getPeriodKey(freqType: 'weekly' | 'monthly'): string {
    const now = new Date();
    if (freqType === 'monthly') return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const d = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
    const day = d.getUTCDay() || 7; d.setUTCDate(d.getUTCDate() + 4 - day);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
    return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
  }

  const rewardItems = useMemo(() => {
    return habits.filter((h) => h.isActive && h.rewardName && (h.weeklyGoal || h.monthlyGoal)).map((h) => {
      const freqType = h.frequencyType ?? 'weekly';
      const goal = freqType === 'monthly' ? (h.monthlyGoal ?? 0) : (h.weeklyGoal ?? 0);
      const periodKey = getPeriodKey(freqType);
      const now = new Date();
      let currentCount = 0;
      if (freqType === 'weekly') {
        const startOfWeek = new Date(now); startOfWeek.setDate(now.getDate() - ((now.getDay() + 6) % 7)); startOfWeek.setHours(0,0,0,0);
        currentCount = checkIns.filter((c) => c.habitId === h.id && new Date(c.date) >= startOfWeek && c.rating === 'green').length;
      } else {
        currentCount = checkIns.filter((c) => c.habitId === h.id && new Date(c.date).getFullYear() === now.getFullYear() && new Date(c.date).getMonth() === now.getMonth() && c.rating === 'green').length;
      }
      const isUnlocked = goal > 0 && currentCount >= goal;
      const claimRecord = claims.find((c) => c.habitId === h.id && c.periodKey === periodKey);
      return { habitId: h.id, habitName: h.name, rewardName: h.rewardName!, rewardEmoji: h.rewardEmoji ?? '🎁', frequencyType: freqType, goal, currentCount, isUnlocked, claimedAt: claimRecord?.claimedAt };
    });
  }, [habits, checkIns, claims]);

  if (rewardItems.length === 0) {
    return <Text style={{ color: colors.muted, fontSize: 13, textAlign: 'center', padding: 20 }}>No rewards yet — set a goal on a habit to add one.</Text>;
  }

  return (
    <View style={{ gap: 10 }}>
      {rewardItems.map((item) => {
        const accent = item.isUnlocked ? '#22C55E' : colors.primary;
        const pct = item.goal > 0 ? Math.min(item.currentCount / item.goal, 1) : 0;
        return (
          <View key={`${item.habitId}`} style={[pillSectionStyles.rewardCard, { backgroundColor: colors.surface, borderColor: item.isUnlocked ? '#22C55E' : colors.border }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={[pillSectionStyles.rewardEmoji, { backgroundColor: accent + '22' }]}>
                <Text style={{ fontSize: 20 }}>{item.rewardEmoji}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: colors.foreground }} numberOfLines={1}>{item.rewardName}</Text>
                <Text style={{ fontSize: 11, color: colors.muted }}>{item.habitName} · {item.frequencyType === 'weekly' ? 'Weekly' : 'Monthly'}</Text>
              </View>
              {item.isUnlocked && !item.claimedAt && <Text style={{ fontSize: 11, fontWeight: '700', color: '#22C55E' }}>Unlocked!</Text>}
              {item.claimedAt && <Text style={{ fontSize: 11, fontWeight: '700', color: '#22C55E' }}>Claimed ✓</Text>}
            </View>
            {!item.claimedAt && (
              <View style={pillSectionStyles.progressTrack}>
                <View style={[pillSectionStyles.progressFill, { width: `${pct * 100}%` as any, backgroundColor: accent }]} />
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}

// ─── Inline Analytics Section ─────────────────────────────────────────────────
function InlineAnalytics({ colors, isCalm }: { colors: any; isCalm: boolean }) {
  const { categories, activeHabits, getCategoryRate } = useApp();
  const router = useRouter();
  const sortedCategories = useMemo(() => [...categories].sort((a, b) => a.order - b.order), [categories]);
  const [showLegend, setShowLegend] = useState(false);

  if (categories.length === 0) {
    return <Text style={{ color: colors.muted, fontSize: 13, textAlign: 'center', padding: 20 }}>No goals yet — add one in Manage Habits</Text>;
  }

  return (
    <View>
      <View style={[styles.sectionRow, { marginBottom: 10 }]}>
        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Goals</Text>
        <Pressable onPress={() => setShowLegend(true)} style={[styles.legendInfoBtn, { borderColor: colors.border, backgroundColor: colors.surface }]}>
          <Text style={[styles.legendInfoBtnText, { color: colors.muted }]}>?</Text>
        </Pressable>
      </View>
      <Modal visible={showLegend} transparent animationType="fade" onRequestClose={() => setShowLegend(false)}>
        <Pressable style={styles.legendOverlay} onPress={() => setShowLegend(false)}>
          <View style={[styles.legendModal, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.legendModalTitle, { color: colors.foreground }]}>Ring Colors</Text>
            {(['#22C55E','#F59E0B','#EF4444'] as const).map((c, i) => (
              <View key={c} style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: c }]} />
                <Text style={[styles.legendText, { color: colors.muted }]}>{i === 0 ? 'Hit — goal reached' : i === 1 ? 'On Track — ≥60% of goal' : 'Behind — <60% of goal'}</Text>
              </View>
            ))}
          </View>
        </Pressable>
      </Modal>
      <View style={styles.goalList}>
        {sortedCategories.map((cat) => {
          const catHabits = activeHabits.filter((h) => h.category === cat.id);
          return (
            <GoalCard
              key={cat.id}
              cat={cat}
              habits={catHabits}
              rate={getCategoryRate(cat.id, 7)}
              colors={colors}
              onPressGoal={() => { if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push((`/category-detail?categoryId=${cat.id}`) as never); }}
              onPressHabit={(habitId) => { if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push((`/habit-detail?habitId=${habitId}`) as never); }}
              isCalm={isCalm}
            />
          );
        })}
      </View>
    </View>
  );
}

// ─── QuickAccessPills component ─────────────────────────────────────────────
function QuickAccessPills({ isCalm, colors }: { isCalm: boolean; colors: any }) {
   type Section = 'vision' | 'rewards' | 'analytics';
  const [active, setActive] = useState<Section>('vision');
  const PILLS: { label: string; key: Section }[] = [
    { label: 'Vision Board', key: 'vision' },
    { label: 'Rewards',      key: 'rewards' },
    { label: 'Analytics',    key: 'analytics' },
  ];

  const trackBg = isCalm ? '#1A2050' : colors.surface;
  const trackBorder = isCalm ? '#252D6E' : colors.border;
  const pillActiveBg = isCalm ? '#252D6E' : colors.primary + '22';
  const pillActiveText = isCalm ? '#FFFFFF' : colors.primary;
  const pillInactiveText = isCalm ? '#8B9CC8' : colors.muted;

  return (
    <View style={{ marginBottom: 14 }}>
      {/* Pill selector track */}
      <View style={[pillStyles.track, { backgroundColor: trackBg, borderColor: trackBorder }]}>
        {PILLS.map((pill) => (
          <TouchableOpacity
            key={pill.key}
            onPress={() => { if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setActive(pill.key); }}
            style={[pillStyles.pill, { backgroundColor: active === pill.key ? pillActiveBg : 'transparent' }]}
            activeOpacity={0.75}
          >
            <Text style={[pillStyles.pillText, { color: active === pill.key ? pillActiveText : pillInactiveText }]}>
              {pill.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      {/* Inline section content */}
      {active === 'analytics' ? (
        <View style={{ marginHorizontal: -20, marginTop: 4 }}>
          <InlineAnalytics colors={colors} isCalm={isCalm} />
        </View>
      ) : (
        <View style={[pillSectionStyles.sectionBox, { backgroundColor: isCalm ? '#111830' : colors.background }]}>
          {active === 'vision'   && <InlineVisionBoard colors={colors} />}
          {active === 'rewards'  && <InlineRewards colors={colors} />}
        </View>
      )}
    </View>
  );
}

const pillSectionStyles = StyleSheet.create({
  sectionBox: { borderRadius: 14, padding: 14, marginTop: 4 },
  vbCard: { borderRadius: 12, borderWidth: 1, padding: 12 },
  vbHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  vbLabel: { flex: 1, fontSize: 14, fontWeight: '600' },
  vbAddBtn: { borderRadius: 8, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 5 },
  vbAddBtnText: { fontSize: 11, fontWeight: '600' },
  rewardCard: { borderRadius: 12, borderWidth: 1, padding: 12, gap: 8 },
  rewardEmoji: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  progressTrack: { height: 4, borderRadius: 2, backgroundColor: '#33415560', overflow: 'hidden' },
  progressFill: { height: 4, borderRadius: 2 },
});

const pillStyles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    borderRadius: 14,
    borderWidth: 0.5,
    padding: 3,
    marginBottom: 14,
    gap: 2,
  },
  pill: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 11,
  },
  pillText: {
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'center',
  },
});

const styles = StyleSheet.create({
  scroll: { padding: 20, paddingTop: 24, paddingBottom: 40 },

  // Header
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  dateText: { fontSize: 18, fontWeight: '700', letterSpacing: -0.3, flexShrink: 1, marginRight: 8 },
  streakPill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: '#FF6B3528', borderRadius: 14,
    paddingHorizontal: 11, paddingVertical: 7,
    borderWidth: 1, borderColor: '#FF6B3544',
  },
  streakNum: { fontSize: 16, fontWeight: '800', color: '#FF6B35', letterSpacing: -0.3 },

  // Profile avatar
  profileAvatar: {
    borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },

  // Today's Focus Card
  focusCard: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: 16, padding: 16, marginBottom: 14, gap: 8,
    borderWidth: 1,
  },
  focusCardTitle: { fontSize: 15, fontWeight: '700', marginBottom: 2 },
  focusCardSub: { fontSize: 12 },

  // All Caught Up card
  allCaughtUpCard: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderRadius: 16, padding: 14, marginBottom: 14, borderWidth: 1,
  },
  allCaughtUpLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  allCaughtUpIconWrap: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  allCaughtUpTitle: { fontSize: 15, fontWeight: '700' },
  allCaughtUpSub: { fontSize: 12, marginTop: 1 },
  allCaughtUpStreak: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#FF6B3520', borderRadius: 20,
    paddingHorizontal: 10, paddingVertical: 5,
  },
  allCaughtUpStreakNum: { fontSize: 15, fontWeight: '800', color: '#FF6B35' },

  // Alarm strip
  alarmStrip: {
    borderRadius: 16,
    borderWidth: 1,
  },
  alarmIconBadge: {
    width: 48, height: 48, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
  },
  alarmIconBadgeSmall: {
    width: 34, height: 34, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },
  alarmDot: { width: 8, height: 8, borderRadius: 4 },
  alarmLabel: { fontSize: 12, fontWeight: '600', letterSpacing: 0.1 },
  alarmTimeLarge: { fontSize: 34, fontWeight: '800', letterSpacing: -1, lineHeight: 38 },
  alarmDayChips: { flexDirection: 'row', gap: 4, marginTop: 6 },
  alarmDayChip: { width: 22, height: 22, borderRadius: 7, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  alarmDayChipText: { fontSize: 10, fontWeight: '700' },
  alarmEdit: { fontSize: 13, fontWeight: '600' },
  alarmGridCard: {
    flexDirection: 'column',
    borderRadius: 16, borderWidth: 1,
    padding: 14,
    width: '47.5%',
    minHeight: 110,
  },
  alarmTimeGrid: { fontSize: 28, fontWeight: '800', letterSpacing: -1, lineHeight: 32 },
  alarmDayChipGrid: { width: 18, height: 18, borderRadius: 5, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },

  // Section header
  sectionRow: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', marginBottom: 10,
  },
  sectionTitle: { fontSize: 17, fontWeight: '800', letterSpacing: -0.3 },
  legendInfoBtn: { width: 24, height: 24, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  legendInfoBtnText: { fontSize: 12, fontWeight: '700' },
  legendOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center' },
  legendModal: { borderRadius: 16, borderWidth: 1, padding: 20, minWidth: 220, gap: 10 },
  legendModalTitle: { fontSize: 15, fontWeight: '700', marginBottom: 4 },
  legendHint: { fontSize: 11, marginTop: 4, lineHeight: 16 },

  // Legend items
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 7, height: 7, borderRadius: 4 },
  legendText: { fontSize: 11, fontWeight: '500' },

  // Daily quote
  quoteBlock: { paddingHorizontal: 4, paddingVertical: 16, marginBottom: 8 },
  quoteText: { fontSize: 13, fontStyle: 'italic', textAlign: 'center', lineHeight: 20 },

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
  ringWrapper: { position: 'relative', alignItems: 'center', justifyContent: 'center' },
  ringPeriodLabel: { fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.3 },
  ringTriple: { flexDirection: 'row', alignItems: 'flex-end', gap: 10 },
  ringDivider: { width: StyleSheet.hairlineWidth, height: 60, borderRadius: 1 },
  habitRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 14, paddingVertical: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  habitName: { flex: 1, fontSize: 13, fontWeight: '600', flexShrink: 1 },
  habitRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  noGoalText: { fontSize: 11, fontStyle: 'italic' },
  noHabitsText: { fontSize: 12, padding: 12, textAlign: 'center' },

  // Period chip group
  periodChipGroup: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  periodChipBlock: { alignItems: 'center', gap: 2 },
  periodChipPeriodLabel: { fontSize: 9, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.3 },
  periodChip: { borderRadius: 7, borderWidth: 1, paddingHorizontal: 7, paddingVertical: 3 },
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

  // Wellness audio grid (2×2)
  wellnessGrid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 16,
  },
  wellnessRow: {
    flexDirection: 'row', gap: 10, marginBottom: 16,
  },
  wellnessCard: {
    flex: 1,
    borderRadius: 16, padding: 16,
    flexDirection: 'column', alignItems: 'center', gap: 8,
    borderWidth: 1,
  },
  wellnessIconWrap: {
    width: 40, height: 40,
    borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  wellnessLabel: {
    fontSize: 17, fontWeight: '700',
  },

  // Stack widgets (full-width)
  stackWidgetsRow: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  stackWidgetFull: {
    borderRadius: 24, borderWidth: 0,
    paddingHorizontal: 22, paddingVertical: 22, marginBottom: 12,
    gap: 0,
  },
  stackWidgetLeft: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
  },
  stackWidgetTopRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14,
  },
  stackWidgetTitle: { fontSize: 30, fontWeight: '800', letterSpacing: -0.5, lineHeight: 34 },
  stackStepWords: { fontSize: 13, fontWeight: '400', lineHeight: 20, opacity: 0.6, letterSpacing: 0.1 },
  stackEditBtn: {
    paddingHorizontal: 0, paddingVertical: 0,
  },
  stackEditBtnText: { fontSize: 13, fontWeight: '500', opacity: 0.55 },
  stackIconCircle: {
    width: 72, height: 72, borderRadius: 36,
    alignItems: 'center', justifyContent: 'center',
    marginTop: 8,
  },
  stackWidgetName: { fontSize: 13, fontWeight: '800', textAlign: 'center', marginTop: 4 },
  stackNoSteps: { fontSize: 12, marginTop: 2 },
  stackStepsList: { width: '100%', gap: 2, marginTop: 2 },
  stackStepItem: { fontSize: 11, lineHeight: 16 },
  stackStepFlow: {
    flexDirection: 'row', flexWrap: 'wrap',
    alignItems: 'center', gap: 4,
  },
  stackStepChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
  },
  stackStepChipText: { fontSize: 12, fontWeight: '600' },

  // Sounds card
  soundsCard: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: 16, borderWidth: 1,
    padding: 14, gap: 12, marginBottom: 16,
  },
  soundsIconWrap: {
    width: 44, height: 44, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  soundsTitle: { fontSize: 16, fontWeight: '700' },
  soundsSub: { fontSize: 12, marginTop: 2 },

  // Stats row (2 cards now)
  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  statCard: {
    flex: 1, borderRadius: 14, padding: 10,
    alignItems: 'center', gap: 3, borderWidth: 1,
  },
  statValue: { fontSize: 20, fontWeight: '700' },
  statLabel: { fontSize: 10, fontWeight: '500', textAlign: 'center' },

  // Manage button
  manageBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderRadius: 14, padding: 16, borderWidth: 1,
  },
  manageBtnText: { flex: 1, fontSize: 15, fontWeight: '600' },

  // Edit dashboard row
  editDashRow: { flexDirection: 'row', gap: 10, marginTop: 16, justifyContent: 'center' },
  editDashBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    borderRadius: 20, paddingHorizontal: 16, paddingVertical: 9,
    borderWidth: 1,
  },
  editDashBtnText: { fontSize: 13, fontWeight: '600' },

  // Widget library overlay — flex-end so sheet sits at bottom with no grey corner peek
  widgetLibraryOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },

  // Widget library sheet
  widgetLibrarySheet: {
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    borderWidth: 1, borderBottomWidth: 0,
    padding: 24, paddingBottom: 48, gap: 12,
    maxHeight: '80%',
  },
  widgetLibraryTitle: { fontSize: 17, fontWeight: '800', marginBottom: 4 },
  widgetLibraryRow: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  widgetLibraryIcon: {
    width: 44, height: 44, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  widgetLibraryLabel: { fontSize: 15, fontWeight: '600', marginBottom: 2 },
  widgetLibraryDesc: { fontSize: 12 },

  // Modal overlay
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },

  // Missed days sheet
  missedDaysSheet: {
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    borderWidth: 1, borderBottomWidth: 0,
    padding: 24, paddingBottom: 40, gap: 12,
    maxHeight: '80%',
  },
  missedDaysHandle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: '#334155', alignSelf: 'center', marginBottom: 8,
  },
  missedDaysTitle: { fontSize: 17, fontWeight: '800', marginBottom: 4 },
  missedDaysEmpty: { fontSize: 15, textAlign: 'center', paddingVertical: 16 },
  missedDayRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderRadius: 12, borderWidth: 1, padding: 14,
  },
  missedDayLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  missedDayDate: { fontSize: 15, fontWeight: '600' },
  missedDaysClose: {
    borderRadius: 12, padding: 14, alignItems: 'center', marginTop: 8,
  },
  missedDaysCloseText: { fontSize: 15, fontWeight: '700' },
  motivCard: { borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, padding: 16, marginBottom: 12 },
  motivHeader: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, marginBottom: 10 },
  motivLabel: { fontSize: 11, fontWeight: '700' as const, letterSpacing: 0.8, textTransform: 'uppercase' as const },
  motivQuote: { fontSize: 15, fontWeight: '500' as const, lineHeight: 22, fontStyle: 'italic' as const },
  genreBtn: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 4, borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 },
  genreBtnText: { fontSize: 12, fontWeight: '500' as const },
  genreSheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 40 },
});
