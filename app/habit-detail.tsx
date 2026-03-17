/**
 * Habit Detail Screen
 * Accessed from the Analytics (Progress) tab by tapping a habit chip.
 * Shows: full calendar heatmap, streak, best streak, monthly breakdown,
 * rating distribution, goal progress, and per-day notes.
 */
import {
  View, Text, ScrollView, Pressable, StyleSheet, LayoutChangeEvent,
  Modal, TextInput, KeyboardAvoidingView, Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useState, useMemo, useEffect, useCallback } from "react";
import { useLocalSearchParams, useRouter, useFocusEffect } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { CategoryCalendar } from "@/components/category-calendar";
import { SixMonthHeatmap } from "@/components/six-month-heatmap";
import { CategoryIcon } from "@/components/category-icon";
import { useApp } from "@/lib/app-context";
import { useColors } from "@/hooks/use-colors";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { toDateString, loadDayNotes, saveDayNotes, type DayNotes } from "@/lib/storage";

const MONTH_NAMES = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

function ratingColor(r: string) {
  if (r === "green") return "#22C55E";
  if (r === "yellow") return "#F59E0B";
  if (r === "red") return "#EF4444";
  return "#9090B8";
}

// ─── Day Note Modal ───────────────────────────────────────────────────────────
function DayNoteModal({
  visible,
  dateLabel,
  initialNote,
  onSave,
  onClose,
  colors,
}: {
  visible: boolean;
  dateLabel: string;
  initialNote: string;
  onSave: (text: string) => void;
  onClose: () => void;
  colors: ReturnType<typeof import("@/hooks/use-colors").useColors>;
}) {
  const [text, setText] = useState(initialNote);

  // Sync when modal opens with a new date
  useEffect(() => { if (visible) setText(initialNote); }, [visible, initialNote]);

  function handleSave() {
    onSave(text.trim());
    onClose();
  }

  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="formSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: colors.background }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        {/* Header — padded for Dynamic Island / notch */}
        <View style={[noteStyles.header, { borderBottomColor: colors.border, paddingTop: Math.max(insets.top, 16) }]}>
          <Pressable onPress={onClose} style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1, padding: 4 })}>
            <Text style={[noteStyles.cancelBtn, { color: colors.muted }]}>Cancel</Text>
          </Pressable>
          <Text style={[noteStyles.headerTitle, { color: colors.foreground }]}>{dateLabel}</Text>
          <Pressable onPress={handleSave} style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1, padding: 4 })}>
            <Text style={[noteStyles.saveBtn, { color: colors.primary }]}>Save</Text>
          </Pressable>
        </View>

        <View style={noteStyles.body}>
          <Text style={[noteStyles.prompt, { color: colors.muted }]}>What did you do today?</Text>
          <TextInput
            style={[noteStyles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.surface }]}
            value={text}
            onChangeText={setText}
            placeholder="e.g. 20 min box breathing before bed..."
            placeholderTextColor={colors.muted}
            multiline
            autoFocus
            returnKeyType="default"
          />
          {text.trim().length > 0 && (
            <Pressable
              onPress={() => setText("")}
              style={({ pressed }) => [noteStyles.clearBtn, { opacity: pressed ? 0.5 : 1, borderColor: colors.border }]}
            >
              <IconSymbol name="trash" size={14} color="#EF4444" />
              <Text style={noteStyles.clearBtnText}>Clear note</Text>
            </Pressable>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function HabitDetailScreen() {
  const { habitId } = useLocalSearchParams<{ habitId: string }>();
  const { checkIns, activeHabits, categories } = useApp();
  const colors = useColors();
  const router = useRouter();

  const today = new Date();
  const [calYear, setCalYear] = useState(today.getFullYear());
  const [calMonth, setCalMonth] = useState(today.getMonth());
  const [cardWidth, setCardWidth] = useState(0);

  // Day notes state
  const [dayNotes, setDayNotes] = useState<DayNotes>({});
  const [noteModalDate, setNoteModalDate] = useState<string | null>(null);
  const [noteModalLabel, setNoteModalLabel] = useState("");

  // Reload day notes every time this screen comes into focus so journal-written notes appear immediately
  useFocusEffect(
    useCallback(() => {
      loadDayNotes().then(setDayNotes);
    }, [])
  );

  const saveNote = useCallback(async (date: string, text: string) => {
    const key = `${habitId}:${date}`;
    const updated = { ...dayNotes };
    if (text) {
      updated[key] = text;
    } else {
      delete updated[key];
    }
    setDayNotes(updated);
    await saveDayNotes(updated);
  }, [dayNotes, habitId]);

  function onCardLayout(e: LayoutChangeEvent) {
    const w = e.nativeEvent.layout.width - 28;
    if (w > 0) setCardWidth(w);
  }

  const habit = useMemo(() => activeHabits.find((h) => h.id === habitId), [activeHabits, habitId]);
  const category = useMemo(() => habit ? categories.find((c) => c.id === habit.category) : null, [habit, categories]);
  // Global rank badge: 1-based index in the sorted activeHabits list
  const globalRank = useMemo(() => {
    const idx = activeHabits.findIndex((h) => h.id === habitId);
    return idx >= 0 ? idx + 1 : null;
  }, [activeHabits, habitId]);

  const habitCheckIns = useMemo(
    () => checkIns.filter((e) => e.habitId === habitId && e.rating !== "none").sort((a, b) => a.date.localeCompare(b.date)),
    [checkIns, habitId],
  );

  const ratedDates = useMemo(() => new Set(habitCheckIns.map((e) => e.date)), [habitCheckIns]);
  const ratingByDate = useMemo(() => {
    const m: Record<string, string> = {};
    for (const e of habitCheckIns) m[e.date] = e.rating;
    return m;
  }, [habitCheckIns]);

  const { currentStreak, bestStreak } = useMemo(() => {
    const todayStr = toDateString(today);
    const yesterdayD = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
    const yesterdayStr = toDateString(yesterdayD);
    // Current streak: consecutive rated days going back from today/yesterday
    let cur = 0;
    let anchorStr: string | null = null;
    if (ratedDates.has(todayStr)) anchorStr = todayStr;
    else if (ratedDates.has(yesterdayStr)) anchorStr = yesterdayStr;
    if (anchorStr) {
      const anchorD = new Date(anchorStr + "T12:00:00");
      for (let i = 0; i < 365; i++) {
        const d = new Date(anchorD.getFullYear(), anchorD.getMonth(), anchorD.getDate() - i);
        if (ratedDates.has(toDateString(d))) cur++;
        else break;
      }
    }

    // Best streak: longest consecutive run of GREEN days only
    const greenDates = new Set(
      habitCheckIns.filter((e) => e.rating === "green").map((e) => e.date)
    );
    const sortedGreen = [...greenDates].sort();
    let best = 0, run = 0;
    let prevD: Date | null = null;
    for (const ds of sortedGreen) {
      const d = new Date(ds + "T12:00:00");
      if (prevD) {
        const prevLocal = new Date(prevD.getFullYear(), prevD.getMonth(), prevD.getDate());
        const curLocal = new Date(d.getFullYear(), d.getMonth(), d.getDate());
        const diff = Math.round((curLocal.getTime() - prevLocal.getTime()) / 86400000);
        if (diff === 1) { run++; } else { run = 1; }
      } else { run = 1; }
      if (run > best) best = run;
      prevD = d;
    }
    return { currentStreak: cur, bestStreak: best };
  }, [ratedDates, habitCheckIns, today]);

  const { green, yellow, red, total } = useMemo(() => {
    let g = 0, y = 0, r = 0;
    for (const e of habitCheckIns) {
      if (e.rating === "green") g++;
      else if (e.rating === "yellow") y++;
      else if (e.rating === "red") r++;
    }
    return { green: g, yellow: y, red: r, total: g + y + r };
  }, [habitCheckIns]);

  const score = total > 0 ? (green * 1 + yellow * 0.5) / total : null;

  const monthlyBreakdown = useMemo(() => {
    const months: { year: number; month: number; green: number; yellow: number; red: number; total: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
      const y = d.getFullYear(), m = d.getMonth();
      const prefix = `${y}-${String(m + 1).padStart(2, "0")}`;
      const entries = habitCheckIns.filter((e) => e.date.startsWith(prefix));
      const g = entries.filter((e) => e.rating === "green").length;
      const ye = entries.filter((e) => e.rating === "yellow").length;
      const r = entries.filter((e) => e.rating === "red").length;
      months.push({ year: y, month: m, green: g, yellow: ye, red: r, total: g + ye + r });
    }
    return months;
  }, [habitCheckIns, today]);

  // Build scoreByDate for this habit: green=1, yellow=0.5, red=0
  const habitScoreByDate = useMemo(() => {
    const m: Record<string, number> = {};
    for (const e of habitCheckIns) {
      if (e.rating === "green") m[e.date] = 1;
      else if (e.rating === "yellow") m[e.date] = 0.5;
      else if (e.rating === "red") m[e.date] = 0;
    }
    return m;
  }, [habitCheckIns]);

  const goalInfo = useMemo(() => {
    if (!habit) return null;
    const isMonthly = habit.frequencyType === "monthly";
    if (isMonthly && habit.monthlyGoal) {
      const prefix = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
      const done = habitCheckIns.filter((e) => e.date.startsWith(prefix)).length;
      return { done, goal: habit.monthlyGoal, label: "This Month", period: "monthly" };
    }
    if (!isMonthly && habit.weeklyGoal) {
      const dayOfWeek = today.getDay();
      const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
      const monday = new Date(today); monday.setDate(today.getDate() + mondayOffset);
      let done = 0;
      for (let i = 0; i < 7; i++) {
        const d = new Date(monday); d.setDate(monday.getDate() + i);
        if (ratedDates.has(toDateString(d))) done++;
      }
      return { done, goal: habit.weeklyGoal, label: "This Week", period: "weekly" };
    }
    return null;
  }, [habit, habitCheckIns, ratedDates, today]);

  function prevMonth() {
    if (calMonth === 0) { setCalYear(y => y - 1); setCalMonth(11); }
    else setCalMonth(m => m - 1);
  }
  function nextMonth() {
    if (calYear === today.getFullYear() && calMonth >= today.getMonth()) return;
    if (calMonth === 11) { setCalYear(y => y + 1); setCalMonth(0); }
    else setCalMonth(m => m + 1);
  }
  const canGoForward = !(calYear === today.getFullYear() && calMonth >= today.getMonth());

  if (!habit) {
    return (
      <ScreenContainer>
        <View style={styles.center}>
          <Text style={{ color: colors.muted, fontSize: 16 }}>Habit not found.</Text>
        </View>
      </ScreenContainer>
    );
  }

  // Build recentEntries: include check-in dates PLUS any dates that have a journal note for this habit
  const recentEntries = useMemo(() => {
    const checkinDates = new Set(habitCheckIns.map((e) => e.date));
    // Find dates that have a journal note for this habit but no check-in
    const journalOnlyDates = Object.keys(dayNotes)
      .filter((key) => key.startsWith(habitId + ":"))
      .map((key) => key.replace(habitId + ":", ""))
      .filter((d) => !checkinDates.has(d));
    // Combine: real check-ins + journal-only dates (as synthetic entries with rating 'none')
    const journalEntries = journalOnlyDates.map((d) => ({ date: d, habitId, rating: "none" as const, loggedAt: d }));
    const combined = [...habitCheckIns, ...journalEntries];
    combined.sort((a, b) => b.date.localeCompare(a.date));
    return combined.slice(0, 20);
  }, [habitCheckIns, dayNotes, habitId]);

  return (
    <ScreenContainer>
      {/* Back header */}
      <View style={[styles.navBar, { borderBottomColor: colors.border }]}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [styles.backBtn, { opacity: pressed ? 0.5 : 1 }]}
        >
          <IconSymbol name="chevron.left" size={20} color={colors.primary} />
          <Text style={[styles.backText, { color: colors.primary }]}>Analytics</Text>
        </Pressable>
        <Text style={[styles.navTitle, { color: colors.foreground }]} numberOfLines={1}>
          {globalRank != null ? `#${globalRank} ` : ''}{habit.name}
        </Text>
        <View style={{ width: 80 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* ── Hero header ── */}
        <View style={[styles.heroCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {globalRank != null && (
            <View style={[styles.heroRankBadge, { backgroundColor: colors.primary + '22', borderColor: colors.primary + '55' }]}>
              <Text style={[styles.heroRankText, { color: colors.primary }]}>#{globalRank}</Text>
            </View>
          )}
          <View style={styles.heroInfo}>
            <Text style={[styles.heroName, { color: colors.foreground }]}>{habit.name}</Text>
            {category && (
              <Text style={[styles.heroCat, { color: colors.muted }]}>
                {category.label}
              </Text>
            )}
            {habit.description ? (
              <Text style={[styles.heroDesc, { color: colors.muted }]}>{habit.description}</Text>
            ) : null}
          </View>
          {score !== null && (
            <View style={[styles.scoreChip, { backgroundColor: ratingColor(score >= 0.75 ? "green" : score >= 0.4 ? "yellow" : "red") + "22", borderColor: ratingColor(score >= 0.75 ? "green" : score >= 0.4 ? "yellow" : "red") + "55" }]}>
              <Text style={[styles.scoreChipText, { color: ratingColor(score >= 0.75 ? "green" : score >= 0.4 ? "yellow" : "red") }]}>
                {Math.round(score * 100)}%
              </Text>
            </View>
          )}
        </View>

        {/* ── Long-range heatmap ── */}
        <View style={[styles.heatmapCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <SixMonthHeatmap scoreByDate={habitScoreByDate} />
        </View>

        {/* ── Stat tiles ── */}
        <View style={styles.statRow}>
          <View style={[styles.statTile, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <IconSymbol name="flame.fill" size={22} color="#FF6B35" />
            <Text style={[styles.statValue, { color: colors.foreground }]}>{currentStreak}</Text>
            <Text style={[styles.statLabel, { color: colors.muted }]}>Streak</Text>
          </View>
          <View style={[styles.statTile, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <IconSymbol name="trophy.fill" size={22} color="#22C55E" />
            <Text style={[styles.statValue, { color: '#22C55E' }]}>{bestStreak}</Text>
            <Text style={[styles.statLabel, { color: colors.muted }]}>Best Streak</Text>
          </View>
          <View style={[styles.statTile, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <IconSymbol name="calendar" size={22} color={colors.primary} />
            <Text style={[styles.statValue, { color: colors.foreground }]}>{total}</Text>
            <Text style={[styles.statLabel, { color: colors.muted }]}>Total Days</Text>
          </View>
        </View>

        {/* ── Goal progress ── */}
        {goalInfo && (
          <View style={[styles.goalCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.goalHeader}>
              <Text style={[styles.goalLabel, { color: colors.foreground }]}>{goalInfo.label} Goal</Text>
              <Text style={[styles.goalCount, { color: goalInfo.done >= goalInfo.goal ? "#22C55E" : colors.primary }]}>
                {goalInfo.done} / {goalInfo.goal}
              </Text>
            </View>
            <View style={[styles.goalBarBg, { backgroundColor: colors.border }]}>
              <View style={[
                styles.goalBarFill,
                {
                  width: `${Math.min(goalInfo.done / goalInfo.goal, 1) * 100}%` as any,
                  backgroundColor: goalInfo.done >= goalInfo.goal ? "#22C55E" : colors.primary,
                },
              ]} />
            </View>
            {goalInfo.done >= goalInfo.goal && (
              <Text style={styles.goalMet}>✓ Goal met — great work!</Text>
            )}
          </View>
        )}

        {/* ── Rating distribution ── */}
        {total > 0 && (
          <View style={[styles.distCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Rating Breakdown</Text>
            <View style={styles.distRow}>
              {[
                { label: "Crushed", count: green, color: "#22C55E" },
                { label: "Okay",    count: yellow, color: "#F59E0B" },
                { label: "Missed",  count: red,    color: "#EF4444" },
              ].map((item) => (
                <View key={item.label} style={styles.distItem}>
                  <View style={[styles.distDot, { backgroundColor: item.color }]} />
                  <Text style={[styles.distCount, { color: item.color }]}>{item.count}</Text>
                  <Text style={[styles.distLabel, { color: colors.muted }]}>{item.label}</Text>
                  <View style={[styles.distBarBg, { backgroundColor: colors.border }]}>
                    <View style={[
                      styles.distBarFill,
                      { height: total > 0 ? `${(item.count / total) * 100}%` as any : "0%", backgroundColor: item.color },
                    ]} />
                  </View>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* ── Monthly trend (last 6 months) ── */}
        <View style={[styles.trendCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Monthly Trend</Text>
          <View style={styles.trendRow}>
            {monthlyBreakdown.map((mb) => {
              const monthTotal = mb.total;
              const monthScore = monthTotal > 0 ? (mb.green * 1 + mb.yellow * 0.5) / monthTotal : null;
              const barColor = monthScore === null ? colors.border : ratingColor(monthScore >= 0.75 ? "green" : monthScore >= 0.4 ? "yellow" : "red");
              const barH = monthScore === null ? 4 : Math.max(8, Math.round(monthScore * 60));
              return (
                <View key={`${mb.year}-${mb.month}`} style={styles.trendCol}>
                  <View style={styles.trendBarWrap}>
                    <View style={[styles.trendBar, { height: barH, backgroundColor: barColor }]} />
                  </View>
                  <Text style={[styles.trendMonthLabel, { color: colors.muted }]}>
                    {MONTH_NAMES[mb.month].slice(0, 3)}
                  </Text>
                  {monthScore !== null && (
                    <Text style={[styles.trendPct, { color: barColor }]}>
                      {Math.round(monthScore * 100)}%
                    </Text>
                  )}
                </View>
              );
            })}
          </View>
        </View>

        {/* ── Full calendar heatmap ── */}
        <View
          style={[styles.calCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
          onLayout={onCardLayout}
        >
          <View style={[styles.monthNav, { borderBottomColor: colors.border }]}>
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

          <View style={styles.calendarWrap}>
            <CategoryCalendar
              year={calYear}
              month={calMonth}
              habits={habit ? [habit] : []}
              checkIns={checkIns}
              containerWidth={cardWidth > 0 ? cardWidth : undefined}
              selectedHabitId={habit?.id}
            />
          </View>

          <View style={styles.legend}>
            {[
              { color: "#22C55E", label: "Crushed" },
              { color: "#F59E0B", label: "Okay" },
              { color: "#EF4444", label: "Missed" },
            ].map((item) => (
              <View key={item.label} style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: item.color }]} />
                <Text style={[styles.legendText, { color: colors.muted }]}>{item.label}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* ── Recent history list with notes ── */}
        <View style={[styles.historyCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.historyHeader}>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Recent History</Text>
            <Text style={[styles.historyHint, { color: colors.muted }]}>Tap a day to add a note</Text>
          </View>
          {habitCheckIns.length === 0 ? (
            <Text style={[styles.emptyText, { color: colors.muted }]}>No check-ins yet.</Text>
          ) : (
            recentEntries.map((entry) => {
              const d = new Date(entry.date + "T12:00:00");
              const label = d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
              const isJournalOnly = entry.rating === "none";
              const rc = isJournalOnly ? colors.primary : ratingColor(entry.rating);
              const ratingLabel = isJournalOnly ? "Journal note" : entry.rating === "green" ? "Crushed it" : entry.rating === "yellow" ? "Okay" : "Missed";
              const noteKey = `${habitId}:${entry.date}`;
              const note = dayNotes[noteKey];

              return (
                <Pressable
                  key={entry.date}
                  onPress={() => {
                    setNoteModalDate(entry.date);
                    setNoteModalLabel(label);
                  }}
                  style={({ pressed }) => [
                    styles.historyRow,
                    { borderBottomColor: colors.border, backgroundColor: pressed ? colors.border + "40" : "transparent" },
                  ]}
                >
                  <View style={[styles.historyDot, { backgroundColor: rc }]} />
                  <View style={styles.historyContent}>
                    <View style={styles.historyTopRow}>
                      <Text style={[styles.historyDate, { color: colors.foreground }]}>{label}</Text>
                      <Text style={[styles.historyRating, { color: rc }]}>{ratingLabel}</Text>
                    </View>
                    {note ? (
                      <Text style={[styles.historyNote, { color: colors.muted }]} numberOfLines={2}>{note}</Text>
                    ) : (
                      <Text style={[styles.historyNoteEmpty, { color: colors.border }]}>+ Add note</Text>
                    )}
                  </View>
                  <IconSymbol name="chevron.right" size={14} color={colors.border} />
                </Pressable>
              );
            })
          )}
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Day Note Modal */}
      {noteModalDate && (
        <DayNoteModal
          visible={noteModalDate !== null}
          dateLabel={noteModalLabel}
          initialNote={dayNotes[`${habitId}:${noteModalDate}`] ?? ""}
          onSave={(text) => saveNote(noteModalDate, text)}
          onClose={() => setNoteModalDate(null)}
          colors={colors}
        />
      )}
    </ScreenContainer>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  scroll: { padding: 20, paddingBottom: 40 },

  navBar: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 0.5,
  },
  backBtn: { flexDirection: "row", alignItems: "center", gap: 4, width: 80 },
  backText: { fontSize: 15, fontWeight: "600" },
  navTitle: { flex: 1, fontSize: 15, fontWeight: "700", textAlign: "center" },

  heroCard: {
    flexDirection: "row", alignItems: "flex-start", gap: 12,
    borderRadius: 16, padding: 16, borderWidth: 1, marginBottom: 14,
  },
  heroRankBadge: { width: 48, height: 48, borderRadius: 12, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  heroRankText: { fontSize: 18, fontWeight: '800' },
  heroInfo: { flex: 1, gap: 2 },
  heroName: { fontSize: 20, fontWeight: "700", letterSpacing: -0.3 },
  heroCat: { fontSize: 13 },
  heroDesc: { fontSize: 13, marginTop: 4, lineHeight: 18 },
  scoreChip: {
    paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: 20, borderWidth: 1, alignSelf: "flex-start",
  },
  scoreChipText: { fontSize: 14, fontWeight: "700" },

  statRow: { flexDirection: "row", gap: 10, marginBottom: 14 },
  statTile: {
    flex: 1, borderRadius: 14, padding: 12, borderWidth: 1,
    alignItems: "center", gap: 2,
  },
  statIcon: { fontSize: 20 },
  statValue: { fontSize: 22, fontWeight: "800" },
  statLabel: { fontSize: 10, fontWeight: "500", textAlign: "center" },

  goalCard: {
    borderRadius: 16, padding: 16, borderWidth: 1, marginBottom: 14, gap: 10,
  },
  goalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  goalLabel: { fontSize: 15, fontWeight: "600" },
  goalCount: { fontSize: 15, fontWeight: "800" },
  goalBarBg: { height: 10, borderRadius: 5, overflow: "hidden" },
  goalBarFill: { height: 10, borderRadius: 5 },
  goalMet: { fontSize: 13, fontWeight: "700", color: "#22C55E" },

  distCard: {
    borderRadius: 16, padding: 16, borderWidth: 1, marginBottom: 14,
  },
  distRow: { flexDirection: "row", justifyContent: "space-around", marginTop: 12 },
  distItem: { alignItems: "center", gap: 4, flex: 1 },
  distDot: { width: 10, height: 10, borderRadius: 5, marginBottom: 2 },
  distCount: { fontSize: 20, fontWeight: "800" },
  distLabel: { fontSize: 11, fontWeight: "500" },
  distBarBg: { width: 8, height: 60, borderRadius: 4, overflow: "hidden", justifyContent: "flex-end" },
  distBarFill: { width: 8, borderRadius: 4 },

  trendCard: {
    borderRadius: 16, padding: 16, borderWidth: 1, marginBottom: 14,
  },
  trendRow: { flexDirection: "row", justifyContent: "space-around", alignItems: "flex-end", marginTop: 12, height: 80 },
  trendCol: { alignItems: "center", gap: 4, flex: 1 },
  trendBarWrap: { height: 60, justifyContent: "flex-end" },
  trendBar: { width: 24, borderRadius: 4 },
  trendMonthLabel: { fontSize: 10, fontWeight: "600" },
  trendPct: { fontSize: 9, fontWeight: "700" },

  heatmapCard: {
    borderRadius: 16, padding: 16, borderWidth: 1, marginBottom: 14,
  },
  calCard: {
    borderRadius: 16, borderWidth: 1, marginBottom: 14, overflow: "hidden",
  },
  monthNav: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 0.5,
  },
  monthNavBtn: { padding: 4 },
  monthTitle: { fontSize: 16, fontWeight: "700" },
  calendarWrap: { padding: 14 },
  legend: {
    flexDirection: "row", gap: 16, paddingHorizontal: 16, paddingBottom: 14,
  },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: 12 },

  historyCard: {
    borderRadius: 16, borderWidth: 1, marginBottom: 14, overflow: "hidden",
  },
  historyHeader: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingTop: 16, paddingBottom: 4,
  },
  historyHint: { fontSize: 11 },
  historyRow: {
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 0.5,
  },
  historyDot: { width: 10, height: 10, borderRadius: 5, flexShrink: 0 },
  historyContent: { flex: 1, gap: 2 },
  historyTopRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  historyDate: { fontSize: 15, fontWeight: "500" },
  historyRating: { fontSize: 14, fontWeight: "700" },
  historyNote: { fontSize: 13, lineHeight: 18 },
  historyNoteEmpty: { fontSize: 12, fontStyle: "italic" },

  sectionTitle: { fontSize: 16, fontWeight: "700", marginBottom: 4 },
  emptyText: { fontSize: 14, padding: 16 },
});

const noteStyles = StyleSheet.create({
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 20, paddingTop: 16, paddingBottom: 14,
    borderBottomWidth: 1,
  },
  headerTitle: { fontSize: 16, fontWeight: "700" },
  cancelBtn: { fontSize: 16 },
  saveBtn: { fontSize: 16, fontWeight: "700" },
  body: { padding: 20, gap: 12 },
  prompt: { fontSize: 13, fontWeight: "600", letterSpacing: 0.5, textTransform: "uppercase" },
  input: {
    fontSize: 16, lineHeight: 24,
    borderWidth: 1, borderRadius: 12,
    padding: 14, minHeight: 140,
    textAlignVertical: "top",
  },
  clearBtn: {
    flexDirection: "row", alignItems: "center", gap: 6,
    alignSelf: "flex-start",
    paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: 10, borderWidth: 1,
  },
  clearBtnText: { fontSize: 13, color: "#EF4444", fontWeight: "600" },
});
