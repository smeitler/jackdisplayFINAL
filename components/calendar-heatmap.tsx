import { View, Text, Pressable, StyleSheet, Dimensions } from "react-native";
import { useColors } from "@/hooks/use-colors";
import { toDateString } from "@/lib/storage";

const SCREEN_WIDTH = Dimensions.get("window").width;
const H_PAD = 32; // horizontal padding on both sides
const CELL_GAP = 4;
const COLS = 7;
// Make cells a bit taller to fit the day number + dot grid
const CELL_W = Math.floor((SCREEN_WIDTH - H_PAD - CELL_GAP * (COLS - 1)) / COLS);
const CELL_H = CELL_W + 8; // slightly taller than wide

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export type DayScore = {
  date: string;        // YYYY-MM-DD
  score: number | null; // 0–1 weighted, null = no data
};

/** One dot per category for a given day */
export type CategoryDot = {
  categoryId: string;
  color: string; // "#22C55E" | "#F59E0B" | "#EF4444" | null (no entries)
};

interface CalendarHeatmapProps {
  year: number;
  month: number; // 0-indexed
  scores: DayScore[];
  /** Map of date -> array of category dots (in display order) */
  categoryDots?: Record<string, CategoryDot[]>;
  onDayPress?: (date: string) => void;
}

export function CalendarHeatmap({
  year, month, scores, categoryDots = {}, onDayPress,
}: CalendarHeatmapProps) {
  const colors = useColors();
  const today = toDateString();

  // Build score lookup
  const scoreMap: Record<string, number | null> = {};
  for (const s of scores) scoreMap[s.date] = s.score;

  // First day of month (0 = Sun)
  const firstDow = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  // Build grid cells
  const cells: Array<{ type: "blank" } | { type: "day"; day: number; dateStr: string }> = [];
  for (let i = 0; i < firstDow; i++) cells.push({ type: "blank" });
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    cells.push({ type: "day", day: d, dateStr });
  }

  function cellBg(score: number | null, dateStr: string): string {
    if (dateStr >= today) return "transparent";
    if (score === null)   return "#EF4444"; // skipped
    if (score >= 0.75)    return "#22C55E";
    if (score >= 0.4)     return "#F59E0B";
    return "#EF4444";
  }

  function cellOpacity(score: number | null, dateStr: string): number {
    if (dateStr >= today) return 0;
    if (score === null)   return 0.35; // softer for skipped
    return 0.4 + score * 0.6;
  }

  const rows: typeof cells[] = [];
  for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));

  return (
    <View style={styles.container}>
      {/* Day-of-week header */}
      <View style={styles.headerRow}>
        {DAY_LABELS.map((d) => (
          <View key={d} style={styles.headerCell}>
            <Text style={[styles.headerText, { color: colors.muted }]}>{d}</Text>
          </View>
        ))}
      </View>

      {/* Weeks */}
      {rows.map((row, ri) => (
        <View key={ri} style={styles.row}>
          {row.map((cell, ci) => {
            if (cell.type === "blank") {
              return <View key={`b-${ci}`} style={styles.cell} />;
            }
            const { day, dateStr } = cell;
            const score   = scoreMap[dateStr] ?? null;
            const bg      = cellBg(score, dateStr);
            const opacity = cellOpacity(score, dateStr);
            const isToday  = dateStr === today;
            const isFuture = dateStr > today;
            const isPast   = dateStr < today;
            const dots     = isPast && score !== null ? (categoryDots[dateStr] ?? []) : [];

            return (
              <Pressable
                key={dateStr}
                onPress={() => !isFuture && onDayPress?.(dateStr)}
                style={({ pressed }) => [
                  styles.cell,
                  styles.dayCell,
                  {
                    backgroundColor: bg,
                    opacity: isFuture ? 0.12 : pressed ? 0.65 : opacity,
                    borderWidth: isToday ? 2 : 0,
                    borderColor: isToday ? colors.primary : "transparent",
                  },
                ]}
              >
                {/* Day number */}
                <Text
                  style={[
                    styles.dayText,
                    {
                      color: isPast ? "#fff" : colors.muted,
                      fontWeight: isToday ? "800" : "500",
                      opacity: isFuture ? 0.35 : 1,
                    },
                  ]}
                >
                  {day}
                </Text>

                {/* Category dot grid — only on logged past days */}
                {dots.length > 0 && (
                  <View style={styles.dotGrid}>
                    {dots.slice(0, 4).map((dot, di) => (
                      <View
                        key={dot.categoryId}
                        style={[
                          styles.catDot,
                          { backgroundColor: dot.color },
                        ]}
                      />
                    ))}
                  </View>
                )}
              </Pressable>
            );
          })}
          {/* Trailing blanks */}
          {row.length < 7 &&
            Array.from({ length: 7 - row.length }).map((_, i) => (
              <View key={`t-${i}`} style={styles.cell} />
            ))}
        </View>
      ))}

      {/* Legend */}
      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: "#EF4444", opacity: 0.35 }]} />
          <Text style={[styles.legendText, { color: colors.muted }]}>Skipped</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: "#EF4444" }]} />
          <Text style={[styles.legendText, { color: colors.muted }]}>Missed</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: "#F59E0B" }]} />
          <Text style={[styles.legendText, { color: colors.muted }]}>Okay</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: "#22C55E" }]} />
          <Text style={[styles.legendText, { color: colors.muted }]}>Crushed</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { width: "100%" },
  headerRow: {
    flexDirection: "row",
    gap: CELL_GAP,
    marginBottom: CELL_GAP,
  },
  headerCell: {
    width: CELL_W,
    height: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  headerText: { fontSize: 10, fontWeight: "600" },
  row: {
    flexDirection: "row",
    gap: CELL_GAP,
    marginBottom: CELL_GAP,
  },
  cell: {
    width: CELL_W,
    height: CELL_H,
  },
  dayCell: {
    borderRadius: CELL_W * 0.2,
    alignItems: "center",
    justifyContent: "flex-start",
    paddingTop: 5,
    overflow: "hidden",
  },
  dayText: { fontSize: 11, lineHeight: 14 },

  // 2×2 dot grid at the bottom of the cell
  dotGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    width: 14,
    gap: 2,
    marginTop: 3,
    justifyContent: "center",
  },
  catDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },

  legend: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 14,
    marginTop: 10,
  },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: 11 },
});
