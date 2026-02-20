/**
 * CategoryCalendar
 *
 * A full-month heatmap calendar for a single category.
 *
 * Cell layout (all-habits mode):
 *  - Day number at top-center (small, muted)
 *  - Stacked color bars below — one per rated habit, each bar fills the
 *    available width and shows just the habit's position number (1, 2, 3…)
 *    in white. Unrated habits are shown as a very faint bar.
 *
 * Cell layout (single-habit filter mode):
 *  - Entire cell fills with that habit's rating color
 *  - Day number in white, centered
 *
 * Skipped days (past, no data): red ✕ fills the cell
 * Future days: dimmed day number only
 */
import { View, Text, Pressable, StyleSheet } from "react-native";
import { useMemo } from "react";
import { useColors } from "@/hooks/use-colors";
import { toDateString, CheckInEntry, Habit } from "@/lib/storage";

const CELL_GAP = 3;
const COLS = 7;
const DAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];

// Day number area height
const DAY_NUM_H = 14;
// Height of each habit color bar
const BAR_H = 11;
// Gap between bars
const BAR_GAP = 2;
// Cell vertical padding
const CELL_PAD = 6;

interface CategoryCalendarProps {
  year: number;
  month: number; // 0-indexed
  habits: Habit[];
  checkIns: CheckInEntry[];
  onDayPress?: (date: string) => void;
  /** Available width inside the parent card. */
  containerWidth?: number;
  /** When set, only show this habit's row in each cell. */
  selectedHabitId?: string | null;
}

function ratingColor(rating: string): string {
  if (rating === "green")  return "#22C55E";
  if (rating === "yellow") return "#F59E0B";
  if (rating === "red")    return "#EF4444";
  return "transparent";
}

function ratingColorFaint(rating: string): string {
  if (rating === "green")  return "#22C55E30";
  if (rating === "yellow") return "#F59E0B30";
  if (rating === "red")    return "#EF444430";
  return "#ffffff10";
}

export function CategoryCalendar({
  year, month, habits, checkIns, onDayPress,
  containerWidth, selectedHabitId,
}: CategoryCalendarProps) {
  const colors = useColors();
  const today = toDateString();

  const availableWidth = containerWidth ?? 320;
  const CELL_W = Math.floor((availableWidth - CELL_GAP * (COLS - 1)) / COLS);

  // Cell height always based on total habits so size is stable when filtering
  const CELL_H = DAY_NUM_H + habits.length * (BAR_H + BAR_GAP) + CELL_PAD;

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
          <View key={i} style={{ width: CELL_W, height: 16, alignItems: "center", justifyContent: "center" }}>
            <Text style={[styles.headerText, { color: colors.muted }]}>{d}</Text>
          </View>
        ))}
      </View>

      {rows.map((row, ri) => (
        <View key={ri} style={[styles.row, { gap: CELL_GAP }]}>
          {row.map((cell, ci) => {
            if (cell.type === "blank") {
              return <View key={`b-${ci}`} style={{ width: CELL_W, height: CELL_H }} />;
            }

            const { day, dateStr } = cell;
            const isToday  = dateStr === today;
            const isFuture = dateStr > today;
            const isPast   = dateStr < today;
            const ratingMap = dayHabitRatings[dateStr] ?? {};
            const hasData   = datesWithEntries.has(dateStr);

            // In filter mode, get the selected habit's rating
            const filterRating = selectedHabitId ? (ratingMap[selectedHabitId] ?? null) : null;
            const hasVisibleData = selectedHabitId ? !!filterRating : hasData;

            // Skipped: past day with no visible data
            const showSkippedX = isPast && !hasVisibleData && !isToday;

            // Filter mode: full-cell color fill
            const filterBg = selectedHabitId && filterRating && isPast
              ? ratingColor(filterRating)
              : "transparent";

            return (
              <Pressable
                key={dateStr}
                onPress={() => (isPast || isToday) && onDayPress?.(dateStr)}
                style={({ pressed }) => ({
                  width: CELL_W,
                  height: CELL_H,
                  borderRadius: 7,
                  backgroundColor: selectedHabitId ? filterBg : "transparent",
                  opacity: isFuture ? 0.2 : pressed ? 0.65 : 1,
                  borderWidth: isToday ? 1.5 : 0,
                  borderColor: isToday ? colors.primary : "transparent",
                  overflow: "hidden",
                  alignItems: "center",
                  justifyContent: "flex-start",
                  paddingTop: 2,
                })}
              >
                {/* ── Skipped X ── */}
                {showSkippedX && (
                  <View style={styles.xContainer}>
                    <Text style={[styles.xText, { fontSize: Math.floor(CELL_W * 0.55) }]}>✕</Text>
                  </View>
                )}

                {/* ── Filter mode: day number centered ── */}
                {selectedHabitId && !showSkippedX && (
                  <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
                    <Text
                      style={{
                        fontSize: 13,
                        fontWeight: "700",
                        color: filterRating && isPast ? "rgba(255,255,255,0.95)" : colors.muted,
                      }}
                    >
                      {day}
                    </Text>
                  </View>
                )}

                {/* ── All-habits mode: day number + color bars ── */}
                {!selectedHabitId && !showSkippedX && (
                  <>
                    {/* Day number */}
                    <Text
                      style={{
                        fontSize: 9,
                        lineHeight: DAY_NUM_H,
                        fontWeight: isToday ? "800" : "500",
                        color: hasData && isPast ? colors.foreground : colors.muted,
                      }}
                    >
                      {day}
                    </Text>

                    {/* One color bar per habit */}
                    {habits.map((h, idx) => {
                      const rating = ratingMap[h.id] ?? null;
                      const barColor = isPast
                        ? (rating ? ratingColor(rating) : ratingColorFaint(rating ?? ""))
                        : "transparent";
                      const numColor = rating && isPast ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.25)";

                      return (
                        <View
                          key={h.id}
                          style={{
                            width: CELL_W,
                            height: BAR_H,
                            marginBottom: idx < habits.length - 1 ? BAR_GAP : 0,
                            backgroundColor: barColor,
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          {isPast && (
                            <Text style={{ fontSize: 7, fontWeight: "700", color: numColor, lineHeight: BAR_H }}>
                              {idx + 1}
                            </Text>
                          )}
                        </View>
                      );
                    })}
                  </>
                )}
              </Pressable>
            );
          })}
          {/* Fill trailing empty cells */}
          {row.length < 7 &&
            Array.from({ length: 7 - row.length }).map((_, i) => (
              <View key={`t-${i}`} style={{ width: CELL_W, height: CELL_H }} />
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
  xContainer: {
    position: "absolute",
    top: 0, left: 0, right: 0, bottom: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  xText: {
    fontWeight: "800",
    color: "#EF4444",
    opacity: 0.5,
  },
});
