/**
 * CategoryCalendar
 *
 * A full-month heatmap calendar for journal entries.
 *
 * Cell style (matches CalendarHeatmap):
 *  - Clean square filled box, no text, no borders
 *  - Past day with entries: solid color fill based on overall score
 *    (green = mostly crushed, amber = okay, red = mostly missed)
 *  - Past day with no entries: dim red (skipped)
 *  - Future days: very dim surface color placeholder
 *  - Today: subtle primary-color border ring
 *
 * Filter mode (selectedHabitId set):
 *  - Cell fills with that specific habit's rating color
 */
import { View, Text, Pressable, StyleSheet } from "react-native";
import { useMemo } from "react";
import { useColors } from "@/hooks/use-colors";
import { toDateString, CheckInEntry, Habit } from "@/lib/storage";

const CELL_GAP = 3;
const COLS = 7;
const DAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];

interface CategoryCalendarProps {
  year: number;
  month: number; // 0-indexed
  habits: Habit[];
  checkIns: CheckInEntry[];
  onDayPress?: (date: string) => void;
  /** Available width inside the parent card. */
  containerWidth?: number;
  /** When set, only show this habit's rating color. */
  selectedHabitId?: string | null;
}

function ratingColor(rating: string): string {
  if (rating === "green")  return "#22C55E";
  if (rating === "yellow") return "#F59E0B";
  if (rating === "red")    return "#EF4444";
  return "transparent";
}

/** Compute an overall score (0–1) for a day given all habit ratings. */
function dayScore(ratingMap: Record<string, string>, habitIds: string[]): number | null {
  const rated = habitIds.filter((id) => ratingMap[id]);
  if (rated.length === 0) return null;
  const total = rated.reduce((sum, id) => {
    const r = ratingMap[id];
    if (r === "green")  return sum + 1;
    if (r === "yellow") return sum + 0.5;
    return sum;
  }, 0);
  return total / rated.length;
}

function scoreColor(score: number | null): string {
  if (score === null) return "#EF4444";
  if (score >= 0.75)  return "#22C55E";
  if (score >= 0.4)   return "#F59E0B";
  return "#EF4444";
}

function scoreOpacity(score: number | null, isPast: boolean): number {
  if (!isPast) return 0.18;
  if (score === null) return 0.30;
  return 0.45 + score * 0.55;
}

export function CategoryCalendar({
  year, month, habits, checkIns, onDayPress,
  containerWidth, selectedHabitId,
}: CategoryCalendarProps) {
  const colors = useColors();
  const today = toDateString();

  const availableWidth = containerWidth ?? 320;
  const CELL_SIZE = Math.floor((availableWidth - CELL_GAP * (COLS - 1)) / COLS);

  const habitIds = useMemo(() => habits.map((h) => h.id), [habits]);

  // Map: date → habitId → rating string
  const { dayHabitRatings, datesWithEntries } = useMemo(() => {
    const map: Record<string, Record<string, string>> = {};
    const withEntries = new Set<string>();
    for (const entry of checkIns) {
      if (!habitIds.includes(entry.habitId)) continue;
      if (entry.rating === "none") continue;
      withEntries.add(entry.date);
      if (!map[entry.date]) map[entry.date] = {};
      map[entry.date][entry.habitId] = entry.rating;
    }
    return { dayHabitRatings: map, datesWithEntries: withEntries };
  }, [checkIns, habitIds]);

  const firstDow = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells: Array<{ type: "blank" } | { type: "day"; day: number; dateStr: string }> = [];
  for (let i = 0; i < firstDow; i++) cells.push({ type: "blank" });
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    cells.push({ type: "day", day: d, dateStr });
  }

  const rows: typeof cells[] = [];
  for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));

  return (
    <View style={{ width: "100%" }}>
      {/* Day-of-week header */}
      <View style={[styles.headerRow, { gap: CELL_GAP }]}>
        {DAY_LABELS.map((d, i) => (
          <View key={i} style={{ width: CELL_SIZE, height: 16, alignItems: "center", justifyContent: "center" }}>
            <Text style={[styles.headerText, { color: colors.muted }]}>{d}</Text>
          </View>
        ))}
      </View>

      {rows.map((row, ri) => (
        <View key={ri} style={[styles.row, { gap: CELL_GAP }]}>
          {row.map((cell, ci) => {
            if (cell.type === "blank") {
              return <View key={`b-${ci}`} style={{ width: CELL_SIZE, height: CELL_SIZE }} />;
            }

            const { dateStr } = cell;
            const isToday  = dateStr === today;
            const isFuture = dateStr > today;
            const isPast   = dateStr < today;
            const ratingMap = dayHabitRatings[dateStr] ?? {};

            // Determine fill color and opacity
            let bg: string;
            let opacity: number;

            if (selectedHabitId) {
              // Filter mode: show only the selected habit's rating
              const filterRating = ratingMap[selectedHabitId] ?? null;
              if (isFuture) {
                bg = colors.surface;
                opacity = 0.18;
              } else if (!filterRating) {
                bg = "#EF4444";
                opacity = isPast ? 0.30 : 0;
              } else {
                bg = ratingColor(filterRating);
                opacity = 0.85;
              }
            } else {
              // All-habits mode: overall score color
              if (isFuture) {
                bg = colors.surface;
                opacity = 0.18;
              } else {
                const score = datesWithEntries.has(dateStr)
                  ? dayScore(ratingMap, habitIds)
                  : null;
                bg = scoreColor(score);
                opacity = scoreOpacity(score, isPast || isToday);
              }
            }

            return (
              <Pressable
                key={dateStr}
                onPress={() => (isPast || isToday) && onDayPress?.(dateStr)}
                style={({ pressed }) => ({
                  width: CELL_SIZE,
                  height: CELL_SIZE,
                  borderRadius: 4,
                  backgroundColor: bg,
                  opacity: pressed ? 0.7 : opacity,
                  borderWidth: isToday ? 1.5 : 0,
                  borderColor: isToday ? colors.primary : "transparent",
                })}
              />
            );
          })}
          {/* Fill trailing empty cells */}
          {row.length < 7 &&
            Array.from({ length: 7 - row.length }).map((_, i) => (
              <View key={`t-${i}`} style={{ width: CELL_SIZE, height: CELL_SIZE }} />
            ))}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: "row", marginBottom: CELL_GAP },
  headerText: { fontSize: 9, fontWeight: "600" },
  row: { flexDirection: "row", marginBottom: CELL_GAP },
});
