import { View, Text, Pressable, StyleSheet, Dimensions } from "react-native";
import { useColors } from "@/hooks/use-colors";
import { toDateString } from "@/lib/storage";

const SCREEN_WIDTH = Dimensions.get("window").width;
const H_PAD = 32;
const CELL_GAP = 3;
const COLS = 7;
const CELL_SIZE = Math.floor((SCREEN_WIDTH - H_PAD - CELL_GAP * (COLS - 1)) / COLS);

const DAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];

export type DayScore = {
  date: string;
  score: number | null;
};

export type CategoryDot = {
  categoryId: string;
  color: string;
};

interface CalendarHeatmapProps {
  year: number;
  month: number;
  scores: DayScore[];
  categoryDots?: Record<string, CategoryDot[]>;
  onDayPress?: (date: string) => void;
}

export function CalendarHeatmap({ year, month, scores, onDayPress }: CalendarHeatmapProps) {
  const colors = useColors();
  const today = toDateString();

  const scoreMap: Record<string, number | null> = {};
  for (const s of scores) scoreMap[s.date] = s.score;

  const firstDow = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells: Array<{ type: "blank" } | { type: "day"; day: number; dateStr: string }> = [];
  for (let i = 0; i < firstDow; i++) cells.push({ type: "blank" });
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    cells.push({ type: "day", day: d, dateStr });
  }

  // Returns the fill color for a cell. Future days get a very dim surface color.
  // Past days with an entry get a solid score color; past days without an entry get a dim red.
  function cellBg(score: number | null, dateStr: string): string {
    if (dateStr > today) return colors.surface;
    if (score === null) return "#EF4444";   // missed / no entry
    if (score >= 0.75)  return "#22C55E";   // crushed it
    if (score >= 0.4)   return "#F59E0B";   // okay
    return "#EF4444";                        // missed
  }

  function cellOpacity(score: number | null, dateStr: string): number {
    if (dateStr > today) return 0.18;        // future: very dim placeholder
    if (score === null)  return 0.30;        // past no-entry: dim red
    return 0.45 + score * 0.55;             // past with entry: 0.45–1.0 based on score
  }

  const rows: typeof cells[] = [];
  for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));

  return (
    <View style={styles.container}>
      {/* Day-of-week header */}
      <View style={styles.row}>
        {DAY_LABELS.map((d, i) => (
          <View key={i} style={styles.cell}>
            <Text style={[styles.headerText, { color: colors.muted }]}>{d}</Text>
          </View>
        ))}
      </View>

      {/* Day grid */}
      {rows.map((row, ri) => (
        <View key={ri} style={styles.row}>
          {row.map((cell, ci) => {
            if (cell.type === "blank") {
              return <View key={`b-${ci}`} style={styles.cell} />;
            }
            const { dateStr } = cell;
            const score    = scoreMap[dateStr] ?? null;
            const isFuture = dateStr > today;
            const isToday  = dateStr === today;

            return (
              <Pressable
                key={dateStr}
                onPress={() => !isFuture && onDayPress?.(dateStr)}
                style={({ pressed }) => [
                  styles.cell,
                  styles.dayCell,
                  {
                    backgroundColor: cellBg(score, dateStr),
                    opacity: pressed ? 0.7 : cellOpacity(score, dateStr),
                    borderWidth: isToday ? 1.5 : 0,
                    borderColor: isToday ? colors.primary : "transparent",
                    padding: 2,
                  },
                ]}
              >
                <Text style={[
                  styles.dateNum,
                  {
                    color: isToday ? colors.primary : "#fff",
                    opacity: isFuture ? 0.5 : 0.85,
                  },
                ]}>{cell.day}</Text>
              </Pressable>
            );
          })}
          {/* Pad last row to keep grid width consistent */}
          {row.length < 7 &&
            Array.from({ length: 7 - row.length }).map((_, i) => (
              <View key={`t-${i}`} style={styles.cell} />
            ))}
        </View>
      ))}

      {/* Legend */}
      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: "#EF4444", opacity: 0.30 }]} />
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
  row: {
    flexDirection: "row",
    gap: CELL_GAP,
    marginBottom: CELL_GAP,
  },
  cell: {
    width: CELL_SIZE,
    height: CELL_SIZE,
    alignItems: "center",
    justifyContent: "center",
  },
  headerText: {
    fontSize: 10,
    fontWeight: "600",
    textAlign: "center",
  },
  dayCell: {
    borderRadius: 4,
  },
  dateNum: {
    fontSize: 10,
    fontWeight: "700",
    lineHeight: 13,
  },
  legend: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 14,
    marginTop: 10,
  },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  legendDot: { width: 8, height: 8, borderRadius: 2 },
  legendText: { fontSize: 11 },
});
