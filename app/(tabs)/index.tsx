import { ScrollView, View, Text, Pressable, StyleSheet, Platform, TouchableOpacity, Modal, Image } from "react-native";
import { useState, useMemo, useEffect } from "react";
import { useRouter } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { useApp } from "@/lib/app-context";
import { useColors } from "@/hooks/use-colors";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { yesterdayString, formatDisplayDate, LIFE_AREAS, Habit, toDateString, getLastUserId } from "@/lib/storage";
import * as Haptics from "expo-haptics";
import { useContentMaxWidth } from "@/hooks/use-is-ipad";
import { CategoryIcon } from "@/components/category-icon";
import Svg, { Circle } from "react-native-svg";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { PERMISSIONS_DONE_KEY } from "@/app/permissions-setup";
import * as ImagePicker from "expo-image-picker";

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
}: {
  habit: Habit;
  colors: ReturnType<typeof import('@/hooks/use-colors').useColors>;
  onPress: () => void;
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
      <Text style={[styles.habitName, { color: colors.foreground }]} numberOfLines={1}>
        {habit.name}
      </Text>

            {/* Right side: three rings — current period is largest */}
          <View style={styles.habitRight}>
            {goal > 0 ? (
              <View style={styles.ringTriple}>
                <CircleRing done={p0Done} goal={goal} size={RING_SIZE_SM} periodLabel={p0Label} />
                <View style={[styles.ringDivider, { backgroundColor: colors.border }]} />
                <CircleRing done={p1Done} goal={goal} size={RING_SIZE_SM} periodLabel={p1Label} />
                <View style={[styles.ringDivider, { backgroundColor: colors.border }]} />
                <CircleRing done={p2Done} goal={goal} size={RING_SIZE} periodLabel={p2Label} />
              </View>
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
    <View style={[styles.goalCard, { backgroundColor: cardBg, borderColor: colors.border, borderLeftColor: accentColor, borderLeftWidth: 3 }]}>
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

// ── Home Screen ───────────────────────────────────────────────────────────────

export default function HomeScreen() {
  const {
    alarm, isPendingCheckIn, getCategoryRate,
    streak, categories, activeHabits, checkIns,
  } = useApp();
  const [showLegend, setShowLegend] = useState(false);
  const [showMissedDays, setShowMissedDays] = useState(false);
  const [profilePicUri, setProfilePicUri] = useState<string | null>(null);

  const totalDaysLogged = useMemo(() => new Set(checkIns.map((e) => e.date)).size, [checkIns]);
  const sortedCategories = useMemo(() => [...categories].sort((a, b) => a.order - b.order), [categories]);
  const colors = useColors();
  const router = useRouter();
  const maxWidth = useContentMaxWidth();
  const yesterday = yesterdayString();

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
    <ScreenContainer>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={maxWidth ? { maxWidth, alignSelf: 'center', width: '100%' } : undefined}>

          {/* ── Header: date + streak pill + profile pic ── */}
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.dateText, { color: colors.foreground }]}>
                {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
              </Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              {streak > 0 && (
                <View style={styles.streakPill}>
                  <IconSymbol name="flame.fill" size={16} color="#FF6B35" />
                  <Text style={styles.streakNum}>{streak}</Text>
                </View>
              )}
              <ProfileAvatar
                uri={profilePicUri}
                onPress={handlePickProfilePic}
                size={40}
              />
            </View>
          </View>

          {/* ── Stats row: Streak + Days Logged (removed 30-day avg) ── */}
          <View style={styles.statsRow}>
            <View style={[styles.statCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <IconSymbol name="flame.fill" size={16} color="#FF6B35" />
              <Text style={[styles.statValue, { color: colors.foreground }]}>{streak}</Text>
              <Text style={[styles.statLabel, { color: colors.muted }]}>Streak</Text>
            </View>
            <View style={[styles.statCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <IconSymbol name="calendar" size={16} color={colors.primary} />
              <Text style={[styles.statValue, { color: colors.foreground }]}>{totalDaysLogged}</Text>
              <Text style={[styles.statLabel, { color: colors.muted }]}>Days Logged</Text>
            </View>
          </View>

          {/* ── Today's Focus Card ── */}
          {(isPendingCheckIn || missedDates.length > 0) ? (
            <Pressable
              onPress={() => {
                if (missedDates.length > 0) {
                  setShowMissedDays(true);
                } else {
                  handleCheckIn(yesterday);
                }
              }}
              style={({ pressed }) => [
                styles.focusCard,
                {
                  backgroundColor: isPendingCheckIn ? colors.primary : colors.surface,
                  borderColor: isPendingCheckIn ? colors.primary : '#F59E0B',
                  opacity: pressed ? 0.9 : 1,
                  transform: [{ scale: pressed ? 0.98 : 1 }],
                },
              ]}
            >
              <View style={{ flex: 1 }}>
                <Text style={[styles.focusCardTitle, { color: isPendingCheckIn ? '#fff' : colors.foreground }]}>
                  {isPendingCheckIn
                    ? `${activeHabits.length} habit${activeHabits.length !== 1 ? 's' : ''} to review`
                    : `${missedDates.length} day${missedDates.length !== 1 ? 's' : ''} to catch up`}
                </Text>
                <Text style={[styles.focusCardSub, { color: isPendingCheckIn ? 'rgba(255,255,255,0.75)' : colors.muted }]}>
                  {isPendingCheckIn
                    ? `${formatDisplayDate(yesterday)} · Tap to rate`
                    : 'Tap to review missed days'}
                </Text>
              </View>
              <IconSymbol
                name="chevron.right"
                size={18}
                color={isPendingCheckIn ? 'rgba(255,255,255,0.8)' : '#F59E0B'}
              />
            </Pressable>
          ) : (
            <View style={[styles.allCaughtUpCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={styles.allCaughtUpLeft}>
                <View style={[styles.allCaughtUpIconWrap, { backgroundColor: '#22C55E20' }]}>
                  <IconSymbol name="checkmark.circle.fill" size={22} color="#22C55E" />
                </View>
                <View>
                  <Text style={[styles.allCaughtUpTitle, { color: colors.foreground }]}>All caught up</Text>
                  <Text style={[styles.allCaughtUpSub, { color: colors.muted }]}>You're on top of your habits</Text>
                </View>
              </View>
              {streak > 0 && (
                <View style={styles.allCaughtUpStreak}>
                  <IconSymbol name="flame.fill" size={14} color="#FF6B35" />
                  <Text style={styles.allCaughtUpStreakNum}>{streak}</Text>
                </View>
              )}
            </View>
          )}

          {/* ── Alarm strip ── */}
          <Pressable
            onPress={() => router.push('/(tabs)/settings' as never)}
            style={({ pressed }) => [
              styles.alarmStrip,
              { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.8 : 1 },
            ]}
          >
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <View style={[styles.alarmDot, { backgroundColor: alarm.isEnabled ? '#4ade80' : '#334155' }]} />
                <Text style={[styles.alarmLabel, { color: colors.muted }]}>
                  {alarm.isEnabled ? 'Alarm set' : 'Alarm off'}
                </Text>
              </View>
              <Text style={[styles.alarmTimeLarge, { color: alarm.isEnabled ? colors.foreground : colors.muted }]}>
                {alarm.isEnabled ? formatAlarmTime(alarm.hour, alarm.minute) : '—'}
              </Text>
              {alarm.isEnabled && alarm.days && alarm.days.length > 0 && (
                <View style={styles.alarmDayChips}>
                  {['M','T','W','T','F','S','S'].map((d, i) => {
                    const dayMap = [1,2,3,4,5,6,0];
                    const active = alarm.days!.includes(dayMap[i]);
                    return (
                      <View key={i} style={[
                        styles.alarmDayChip,
                        { backgroundColor: active ? colors.primary + '25' : 'transparent',
                          borderColor: active ? colors.primary : colors.border },
                      ]}>
                        <Text style={[styles.alarmDayChipText, { color: active ? colors.primary : colors.muted }]}>{d}</Text>
                      </View>
                    );
                  })}
                </View>
              )}
            </View>
            <View style={{ alignItems: 'flex-end', gap: 4 }}>
              <Text style={[styles.alarmEdit, { color: colors.primary }]}>Edit</Text>
              <IconSymbol name="chevron.right" size={14} color={colors.muted} />
            </View>
          </Pressable>

          {/* ── Section title ── */}
          <View style={styles.sectionRow}>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Goals</Text>
            <Pressable
              onPress={() => setShowLegend(true)}
              style={[styles.legendInfoBtn, { borderColor: colors.border, backgroundColor: colors.surface }]}
            >
              <Text style={[styles.legendInfoBtnText, { color: colors.muted }]}>?</Text>
            </Pressable>
          </View>

          {/* ── Legend modal ── */}
          <Modal visible={showLegend} transparent animationType="fade" onRequestClose={() => setShowLegend(false)}>
            <Pressable style={styles.legendOverlay} onPress={() => setShowLegend(false)}>
              <View style={[styles.legendModal, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[styles.legendModalTitle, { color: colors.foreground }]}>Ring Colors</Text>
                {(['#22C55E', '#F59E0B', '#EF4444'] as const).map((c, i) => (
                  <View key={c} style={styles.legendItem}>
                    <View style={[styles.legendDot, { backgroundColor: c }]} />
                    <Text style={[styles.legendText, { color: colors.muted }]}>
                      {i === 0 ? 'Hit — goal reached' : i === 1 ? 'On Track — ≥60% of goal' : 'Behind — <60% of goal'}
                    </Text>
                  </View>
                ))}
                <View style={styles.legendItem}>
                  <IconSymbol name="crown.fill" size={11} color="#FFD700" />
                  <Text style={[styles.legendText, { color: colors.muted }]}>Last period hit</Text>
                </View>
                <Text style={[styles.legendHint, { color: colors.muted }]}>
                  Rings: left = 2 periods ago, middle = last period, right = current period
                </Text>
              </View>
            </Pressable>
          </Modal>

          {/* ── Goal cards ── */}
          {categories.length === 0 ? (
            <View style={[styles.emptyState, { borderColor: colors.border }]}>
              <Text style={[styles.emptyText, { color: colors.muted }]}>No goals yet — add one in Manage Habits</Text>
            </View>
          ) : (
            <View style={styles.goalList}>
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
                  />
                );
              })}
            </View>
          )}

          {/* ── Daily quote ── */}
          {categories.length > 0 && (
            <View style={styles.quoteBlock}>
              <Text style={[styles.quoteText, { color: colors.muted }]}>"{getDailyQuote()}"</Text>
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

const styles = StyleSheet.create({
  scroll: { padding: 20, paddingBottom: 40 },

  // Header
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 16, gap: 12 },
  dateText: { fontSize: 20, fontWeight: '700', letterSpacing: -0.3 },
  streakPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#FF6B3520', borderRadius: 20,
    paddingHorizontal: 12, paddingVertical: 7,
  },
  streakNum: { fontSize: 17, fontWeight: '800', color: '#FF6B35' },

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
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11,
    borderWidth: 1, marginBottom: 24,
  },
  alarmDot: { width: 8, height: 8, borderRadius: 4 },
  alarmLabel: { fontSize: 12, fontWeight: '500' },
  alarmTimeLarge: { fontSize: 32, fontWeight: '800', letterSpacing: -1, lineHeight: 36 },
  alarmDayChips: { flexDirection: 'row', gap: 4, marginTop: 6 },
  alarmDayChip: { width: 22, height: 22, borderRadius: 11, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  alarmDayChipText: { fontSize: 10, fontWeight: '700' },
  alarmEdit: { fontSize: 13, fontWeight: '600' },

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
});
