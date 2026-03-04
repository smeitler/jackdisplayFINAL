/**
 * ScrollableCalendar
 *
 * Renders multiple months stacked vertically, newest month at the top.
 * Each month uses the existing CategoryCalendar grid.
 * The parent should wrap this in a ScrollView (or it can be used inside one).
 *
 * Props:
 *  - habits: habits to display
 *  - checkIns: all check-in entries
 *  - monthCount: how many months back to show (default 6)
 *  - onDayPress: called with date string when a day is tapped
 *  - containerWidth: available width for the calendar grid
 */
import { View, Text, StyleSheet } from "react-native";
import { useColors } from "@/hooks/use-colors";
import { CategoryCalendar } from "@/components/category-calendar";
import { CheckInEntry, Habit } from "@/lib/storage";

const MONTH_NAMES = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

interface ScrollableCalendarProps {
  habits: Habit[];
  checkIns: CheckInEntry[];
  monthCount?: number;
  onDayPress?: (date: string) => void;
  containerWidth?: number;
}

export function ScrollableCalendar({
  habits,
  checkIns,
  monthCount = 6,
  onDayPress,
  containerWidth,
}: ScrollableCalendarProps) {
  const colors = useColors();

  // Build list of months to show: current month first, going back monthCount months
  const today = new Date();
  const months: { year: number; month: number }[] = [];
  for (let i = 0; i < monthCount; i++) {
    const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
    months.push({ year: d.getFullYear(), month: d.getMonth() });
  }

  return (
    <View style={styles.container}>
      {months.map(({ year, month }, idx) => (
        <View key={`${year}-${month}`} style={[styles.monthBlock, idx > 0 && styles.monthBlockSpacing]}>
          {/* Month label */}
          <View style={[styles.monthHeader, { borderBottomColor: colors.border }]}>
            <Text style={[styles.monthLabel, { color: colors.foreground }]}>
              {MONTH_NAMES[month]}
            </Text>
            <Text style={[styles.yearLabel, { color: colors.muted }]}>
              {year}
            </Text>
          </View>

          {/* Calendar grid */}
          <CategoryCalendar
            year={year}
            month={month}
            habits={habits}
            checkIns={checkIns}
            onDayPress={onDayPress}
            containerWidth={containerWidth}
            selectedHabitId={null}
          />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 0 },
  monthBlock: {},
  monthBlockSpacing: { marginTop: 20 },
  monthHeader: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 6,
    paddingBottom: 8,
    marginBottom: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  monthLabel: { fontSize: 16, fontWeight: "700" },
  yearLabel: { fontSize: 13, fontWeight: "500" },
});
