/**
 * CategoryCalendar
 *
 * A full-month heatmap calendar for a category/goal.
 *
 * All-habits mode (selectedHabitId = null):
 *  - Each day cell shows one horizontal strip per habit in the goal
 *  - Strip color = that habit's individual rating (green/amber/red)
 *  - Unrated strips = very dim surface placeholder
 *  - Future days = all strips very dim
 *  - Today = subtle primary-color border ring
 *
 * Filter mode (selectedHabitId set):
 *  - Entire cell fills with that specific habit's rating color (single solid box)
 */
import { View, Text, Pressable, StyleSheet } from "react-native";
import { useMemo } from "react";
import { useColors } from "@/hooks/use-colors";
import { toDateString, CheckInEntry, Habit } from "@/lib/storage";

const CELL_GAP = 3;
const STRIP_GAP = 2;
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
  /** When set, only show this habit's rating color as a single solid fill. */
  selectedHabitId?: string | null;
}

function ratingColor(rating: string): string {
  if (rating === "green")  return "#22C55E";
  if (rating === "yellow") return "#F59E0B";
  if (rating === "red")    return "#EF4444";
  return "transparent";
}

export function CategoryCalendar({
  year, month, habits, checkIns, onDayPress,
  containerWidth, selectedHabitId,
}: CategoryCalendarProps) {
  const colors = useColors();
  const today = toDateString();

  const availableWidth = containerWidth ?? 320;
  const CELL_SIZE = Math.floor((availableWidth - CELL_GAP * (COLS - 1)) / COLS);

  // In all-habits mode, compute strip height so all strips + gaps fit in CELL_SIZE
  const n = habits.length || 1;
  const STRIP_H = Math.max(4, Math.floor((CELL_SIZE - STRIP_GAP * (n - 1)) / n));

  const habitIds = useMemo(() => habits.map((h) => h.id), [habits]);

  // Map: date → habitId → rating string
  const dayHabitRatings = useMemo(() => {
    const map: Record<string, Record<string, string>> = {};
    for (const entry of checkIns) {
      if (!habitIds.includes(entry.habitId)) continue;
      if (entry.rating === "none") continue;
      if (!map[entry.date]) map[entry.date] = {};
      map[entry.date][entry.habitId] = entry.rating;
    }
    return map;
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

            if (selectedHabitId) {
              // ── Filter mode: single solid fill ──
              const filterRating = ratingMap[selectedHabitId] ?? null;
              let bg: string;
              let opacity: number;
              if (isFuture) {
                bg = colors.surface; opacity = 0.18;
              } else if (!filterRating) {
                bg = "#EF4444"; opacity = isPast ? 0.30 : 0;
              } else {
                bg = ratingColor(filterRating); opacity = 0.85;
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
            }

            // ── All-habits mode: one strip per habit ──
            return (
              <Pressable
                key={dateStr}
                onPress={() => (isPast || isToday) && onDayPress?.(dateStr)}
                style={({ pressed }) => ({
                  width: CELL_SIZE,
                  height: CELL_SIZE,
                  borderRadius: 4,
                  overflow: "hidden",
                  opacity: pressed ? 0.7 : isFuture ? 0.18 : 1,
                  borderWidth: isToday ? 1.5 : 0,
                  borderColor: isToday ? colors.primary : "transparent",
                  flexDirection: "column",
                  gap: STRIP_GAP,
                  backgroundColor: colors.surface,
                  padding: 1,
                })}
              >
                {habits.map((h) => {
                  const rating = ratingMap[h.id] ?? null;
                  const stripColor = rating && (isPast || isToday)
                    ? ratingColor(rating)
                    : colors.surface;
                  const stripOpacity = rating && (isPast || isToday) ? 0.85 : 0.25;

                  return (
                    <View
                      key={h.id}
                      style={{
                        flex: 1,
                        borderRadius: 2,
                        backgroundColor: stripColor,
                        opacity: stripOpacity,
                      }}
                    />
                  );
                })}
              </Pressable>
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
