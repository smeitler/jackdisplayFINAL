/**
 * SixMonthHeatmap
 * A GitHub-style contribution grid showing 6 months of daily check-in data.
 * - Fits entirely on screen — no horizontal scrolling
 * - Cell size is auto-calculated from available width
 * - Columns = weeks (oldest left → newest right)
 * - Rows = days of week (Sun top → Sat bottom)
 * - Cell colors: green / yellow / red based on weighted score
 * - "×" mark for past days with no check-in
 * - Future days are dimmed empty squares
 */
import React, { useMemo, useState } from "react";
import { View, Text, StyleSheet, LayoutChangeEvent } from "react-native";
import { useColors } from "@/hooks/use-colors";
import { toDateString } from "@/lib/storage";

const DAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];
const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAY_LABEL_WIDTH = 14;
const GAP = 2;
const WEEKS = 26;

interface DayData {
  dateStr: string;
  score: number | null;
  hasData: boolean;
  isFuture: boolean;
  month: number;
  isFirstOfMonth: boolean;
}

interface Props {
  scoreByDate: Record<string, number>;
}

export function SixMonthHeatmap({ scoreByDate }: Props) {
  const colors = useColors();
  const [containerWidth, setContainerWidth] = useState(0);

  // Cell size: fill available width across all 26 columns + gaps
  const cellSize = containerWidth > 0
    ? Math.floor((containerWidth - DAY_LABEL_WIDTH - GAP - WEEKS * GAP) / WEEKS)
    : 10;

  const { grid, monthMarkers } = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = toDateString(today);

    // Find the Sunday that starts the current week
    const currentWeekStart = new Date(today);
    currentWeekStart.setDate(today.getDate() - today.getDay());

    const cols: DayData[][] = [];
    const markers: { colIndex: number; month: number }[] = [];
    let lastMonth = -1;

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
        const month = day.getMonth();
        const isFirstOfMonth = day.getDate() === 1;
        col.push({ dateStr, score, hasData, isFuture, month, isFirstOfMonth });
      }

      // Month label: show when month changes at the start of a week
      const colMonth = weekStart.getMonth();
      if (colMonth !== lastMonth) {
        markers.push({ colIndex: cols.length, month: colMonth });
        lastMonth = colMonth;
      }

      cols.push(col);
    }

    return { grid: cols, monthMarkers: markers };
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
          {/* Month labels */}
          <View style={styles.monthRow}>
            <View style={{ width: DAY_LABEL_WIDTH + GAP }} />
            {grid.map((col, colIdx) => {
              const marker = monthMarkers.find((m) => m.colIndex === colIdx);
              return (
                <View
                  key={colIdx}
                  style={{ width: cellSize, marginRight: GAP }}
                >
                  {marker && (
                    <Text style={[styles.monthLabel, { color: colors.muted }]}>
                      {MONTH_LABELS[marker.month].slice(0, 1)}
                    </Text>
                  )}
                </View>
              );
            })}
          </View>

          {/* Grid rows */}
          <View style={styles.gridArea}>
            {/* Day-of-week labels column */}
            <View style={[styles.dayLabelCol, { width: DAY_LABEL_WIDTH, gap: GAP }]}>
              {DAY_LABELS.map((label, i) => (
                <View key={i} style={{ height: cellSize, justifyContent: "center" }}>
                  <Text style={[styles.dayLabel, { color: colors.muted }]}>
                    {i % 2 === 0 ? label : ""}
                  </Text>
                </View>
              ))}
            </View>

            {/* Week columns */}
            <View style={{ marginLeft: GAP, flexDirection: "row", gap: GAP }}>
              {grid.map((col, colIdx) => (
                <View key={colIdx} style={{ flexDirection: "column", gap: GAP }}>
                  {col.map((day, rowIdx) => {
                    const isPastNoData = !day.isFuture && !day.hasData;
                    return (
                      <View
                        key={rowIdx}
                        style={[
                          {
                            width: cellSize,
                            height: cellSize,
                            borderRadius: Math.max(2, cellSize * 0.2),
                            backgroundColor: cellBg(day),
                            opacity: day.isFuture ? 0.3 : 1,
                            alignItems: "center",
                            justifyContent: "center",
                          },
                        ]}
                      >
                        {isPastNoData && (
                          <Text
                            style={{
                              fontSize: Math.max(6, cellSize * 0.65),
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
          </View>

          {/* Legend */}
          <View style={styles.legend}>
            <Text style={[styles.legendText, { color: colors.muted }]}>Less</Text>
            {[colors.border + "55", "#EF4444", "#F59E0B", "#22C55E"].map((c, i) => (
              <View
                key={i}
                style={{
                  width: 10, height: 10,
                  borderRadius: 2,
                  backgroundColor: c,
                }}
              />
            ))}
            <Text style={[styles.legendText, { color: colors.muted }]}>More</Text>
            <View style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: colors.border + "55", alignItems: "center", justifyContent: "center" }}>
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
  container: { width: "100%", gap: 4 },
  monthRow: { flexDirection: "row", height: 14, alignItems: "flex-end" },
  monthLabel: { fontSize: 9, fontWeight: "700" },
  gridArea: { flexDirection: "row" },
  dayLabelCol: { flexDirection: "column" },
  dayLabel: { fontSize: 9, fontWeight: "600", textAlign: "center" },
  legend: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 6, flexWrap: "wrap" },
  legendText: { fontSize: 10 },
});
