/**
 * CategoryCalendar
 *
 * A full-month calendar for a single category.
 *
 * Cell states:
 *  - Past, no data (skipped):  transparent bg + red ✕ in center
 *  - Past, logged (all habits): subtle blue tint + vertical emoji+dot rows
 *  - Past, logged (filter mode): full solid rating color background + day number
 *  - Today:           primary-color border
 *  - Future:          dimmed day number only
 *
 * When `selectedHabitId` is set, only that habit's row is shown per cell
 * and the cell background fills with that habit's rating color.
 *
 * Pass `containerWidth` (available width inside the card) for accurate cell sizing.
 */
import { View, Text, Pressable, StyleSheet } from "react-native";
import { useMemo } from "react";
import { useColors } from "@/hooks/use-colors";
import { toDateString, CheckInEntry, Habit } from "@/lib/storage";

const CELL_GAP = 3;
const COLS = 7;
const DAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];

// Each habit row height in pixels
const ROW_H = 13;
// Day number area height
const DAY_NUM_H = 16;
// Cell vertical padding (top + bottom)
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

export function CategoryCalendar({
  year, month, habits, checkIns, onDayPress,
  containerWidth, selectedHabitId,
}: CategoryCalendarProps) {
  const colors = useColors();
  const today = toDateString();

  // Derive cell width from container width
  const availableWidth = containerWidth ?? 320;
  const CELL_W = Math.floor((availableWidth - CELL_GAP * (COLS - 1)) / COLS);

  // Cell height: always based on total habits so calendar size is stable when filtering
  const CELL_H = DAY_NUM_H + habits.length * ROW_H + CELL_PAD;

  const habitIds = useMemo(() => habits.map((h) => h.id), [habits]);

  const { dayHabitColors, datesWithEntries } = useMemo(() => {
    const map: Record<string, Record<string, string>> = {};
    const withEntries = new Set<string>();
    for (const entry of checkIns) {
      if (!habitIds.includes(entry.habitId)) continue;
      if (entry.rating === "none") continue;
      withEntries.add(entry.date);
      if (!map[entry.date]) map[entry.date] = {};
      map[entry.date][entry.habitId] = ratingColor(entry.rating);
    }
    return { dayHabitColors: map, datesWithEntries: withEntries };
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

  const loggedBg = colors.primary + "22"; // subtle blue tint (all-habits mode)

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
            const hasData  = datesWithEntries.has(dateStr);
            const habitColorMap = dayHabitColors[dateStr] ?? {};

            // Which habits to show in this cell
            const habitsToShow = selectedHabitId
              ? habits.filter((h) => h.id === selectedHabitId)
              : habits;

            // Whether this day has data for the habits currently shown
            const hasVisibleData = selectedHabitId
              ? !!habitColorMap[selectedHabitId]
              : hasData;

            // In filter mode, get the single habit's rating color for full-cell fill
            const filterRatingColor = selectedHabitId
              ? (habitColorMap[selectedHabitId] ?? null)
              : null;

            // Background:
            // - future / today: transparent
            // - filter mode + rated: full solid rating color (e.g. solid green/yellow/red)
            // - filter mode + not rated: transparent (X will show)
            // - all-habits mode + has data: blue tint
            // - all-habits mode + no data: transparent (X will show)
            let bgColor = "transparent";
            if (isPast) {
              if (selectedHabitId) {
                bgColor = filterRatingColor ? filterRatingColor + "CC" : "transparent";
              } else {
                bgColor = hasVisibleData ? loggedBg : "transparent";
              }
            }

            // Show red X for skipped days (past, no visible data)
            const showSkippedX = isPast && !hasVisibleData && !isToday;

            // Only show habit rows in all-habits mode (not filter mode — cell bg handles it)
            const ratedHabits = (!selectedHabitId && isPast && hasVisibleData)
              ? habitsToShow.filter((h) => !!habitColorMap[h.id])
              : [];

            // Day number color: white on solid-color cells, normal otherwise
            const dayNumColor = (selectedHabitId && filterRatingColor && isPast)
              ? "rgba(255,255,255,0.9)"
              : (isPast && hasData) ? colors.foreground : colors.muted;

            return (
              <Pressable
                key={dateStr}
                onPress={() => (isPast || isToday || showSkippedX) && onDayPress?.(dateStr)}
                style={({ pressed }) => ({
                  width: CELL_W,
                  height: CELL_H,
                  borderRadius: 8,
                  backgroundColor: bgColor,
                  opacity: isFuture ? 0.2 : pressed ? 0.6 : 1,
                  borderWidth: isToday ? 1.5 : 0,
                  borderColor: isToday ? colors.primary : "transparent",
                  alignItems: "center",
                  justifyContent: "flex-start",
                  paddingTop: 3,
                  overflow: "hidden",
                })}
              >
                {/* Day number — hidden on skipped cells so the X dominates */}
                {!showSkippedX && (
                  <Text
                    style={{
                      fontSize: 10,
                      lineHeight: 14,
                      marginBottom: 1,
                      color: dayNumColor,
                      fontWeight: isToday ? "800" : "500",
                    }}
                  >
                    {day}
                  </Text>
                )}

                {/* Red X for skipped days — fills remaining cell space */}
                {showSkippedX && (
                  <View style={styles.xContainer}>
                    <Text style={[styles.xText, { fontSize: Math.floor(CELL_W * 0.55) }]}>✕</Text>
                  </View>
                )}

                {/* Habit rows (all-habits mode only) */}
                {ratedHabits.map((h) => (
                  <View
                    key={h.id}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 2,
                      height: ROW_H,
                    }}
                  >
                    <Text style={{ fontSize: 7, lineHeight: 10 }}>{h.emoji}</Text>
                    <View
                      style={{
                        width: 5,
                        height: 5,
                        borderRadius: 3,
                        backgroundColor: habitColorMap[h.id] ?? "transparent",
                      }}
                    />
                  </View>
                ))}
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
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  xText: {
    fontWeight: "800",
    color: "#EF4444",
    opacity: 0.55,
    lineHeight: undefined,
  },
});
