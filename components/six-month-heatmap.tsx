/**
 * SixMonthHeatmap
 * Clean grid — no labels, no scrolling.
 * - Oldest week on the LEFT, newest week on the RIGHT
 * - Columns = weeks, rows = days of week (Sun top → Sat bottom)
 * - Green / yellow / red by weighted score
 * - × for past days with no check-in
 * - Future days are dimmed
 */
import React, { useMemo, useState } from "react";
import { View, Text, StyleSheet, LayoutChangeEvent } from "react-native";
import { useColors } from "@/hooks/use-colors";
import { toDateString } from "@/lib/storage";

const GAP = 2;
const WEEKS = 26;

interface DayData {
  dateStr: string;
  score: number | null;
  hasData: boolean;
  isFuture: boolean;
}

interface Props {
  scoreByDate: Record<string, number>;
}

export function SixMonthHeatmap({ scoreByDate }: Props) {
  const colors = useColors();
  const [containerWidth, setContainerWidth] = useState(0);

  // Cell size fills the full container width across all 26 columns + gaps
  const cellSize = containerWidth > 0
    ? Math.floor((containerWidth - (WEEKS - 1) * GAP) / WEEKS)
    : 10;

  const grid = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = toDateString(today);

    // Sunday that starts the current week
    const currentWeekStart = new Date(today);
    currentWeekStart.setDate(today.getDate() - today.getDay());

    // Build columns oldest → newest (w=WEEKS-1 is oldest, w=0 is current week)
    const cols: DayData[][] = [];
    for (let w = WEEKS - 1; w >= 0; w--) {
      const weekStart = new Date(currentWeekStart);
      weekStart.setDate(currentWeekStart.getDate() - w * 7);

      const col: DayData[] = [];
      for (let d = 0; d < 7; d++) {
        const day = new Date(weekStart);
        day.setDate(weekStart.getDate() + d);
        const dateStr = toDateString(day);
        const isFuture = dateStr > todayStr;
        const hasData = !isFuture && dateStr in scoreByDate;
        const score = hasData ? scoreByDate[dateStr] : null;
        col.push({ dateStr, score, hasData, isFuture });
      }
      cols.push(col);
    }
    return cols;
  }, [scoreByDate]);

  function cellBg(day: DayData): string {
    if (day.isFuture) return colors.border + "33";
    if (!day.hasData) return colors.border + "55";
    const s = day.score ?? 0;
    if (s >= 0.75) return "#22C55E";
    if (s >= 0.4) return "#F59E0B";
    return "#EF4444";
  }

  const handleLayout = (e: LayoutChangeEvent) => {
    setContainerWidth(e.nativeEvent.layout.width);
  };

  return (
    <View onLayout={handleLayout} style={styles.container}>
      {containerWidth > 0 && (
        <>
          {/* Grid */}
          <View style={{ flexDirection: "row", gap: GAP }}>
            {grid.map((col, colIdx) => (
              <View key={colIdx} style={{ flexDirection: "column", gap: GAP }}>
                {col.map((day, rowIdx) => {
                  const isPastNoData = !day.isFuture && !day.hasData;
                  return (
                    <View
                      key={rowIdx}
                      style={{
                        width: cellSize,
                        height: cellSize,
                        borderRadius: Math.max(2, cellSize * 0.2),
                        backgroundColor: cellBg(day),
                        opacity: day.isFuture ? 0.3 : 1,
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      {isPastNoData && (
                        <Text
                          style={{
                            fontSize: Math.max(6, cellSize * 0.6),
                            fontWeight: "900",
                            color: "#EF4444",
                            lineHeight: cellSize,
                            textAlign: "center",
                          }}
                        >
                          ×
                        </Text>
                      )}
                    </View>
                  );
                })}
              </View>
            ))}
          </View>

          {/* Minimal legend */}
          <View style={styles.legend}>
            <Text style={[styles.legendText, { color: colors.muted }]}>Less</Text>
            {[colors.border + "55", "#EF4444", "#F59E0B", "#22C55E"].map((c, i) => (
              <View key={i} style={[styles.legendCell, { backgroundColor: c, borderRadius: 2 }]} />
            ))}
            <Text style={[styles.legendText, { color: colors.muted }]}>More</Text>
            <View style={[styles.legendCell, { backgroundColor: colors.border + "55", borderRadius: 2, alignItems: "center", justifyContent: "center" }]}>
              <Text style={{ fontSize: 7, fontWeight: "900", color: "#EF4444", lineHeight: 10 }}>×</Text>
            </View>
            <Text style={[styles.legendText, { color: colors.muted }]}>Skipped</Text>
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { width: "100%", gap: 8 },
  legend: { flexDirection: "row", alignItems: "center", gap: 4, flexWrap: "wrap" },
  legendCell: { width: 10, height: 10 },
  legendText: { fontSize: 10 },
});
