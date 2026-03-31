/**
 * Habit History Screen
 * Shows all saved habit ratings (Done / Partial / Missed) grouped by date,
 * with color-coded indicators, per-habit streak counters, and a 7-day
 * completion summary at the top.
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, FlatList, Pressable, StyleSheet,
  ActivityIndicator, Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';

import { ScreenContainer } from '@/components/screen-container';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useColors } from '@/hooks/use-colors';
import {
  loadHabitHistory,
  groupByDate,
  type HabitRatingEntry,
  type HabitRating,
} from '@/lib/habit-history';

// ── Rating config ─────────────────────────────────────────────────────────────

const RATING_META: Record<HabitRating, { label: string; color: string; icon: string }> = {
  done:    { label: 'Done',    color: '#22C55E', icon: 'checkmark.circle.fill' },
  partial: { label: 'Partial', color: '#F59E0B', icon: 'minus.circle.fill' },
  missed:  { label: 'Missed',  color: '#EF4444', icon: 'xmark.circle.fill' },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(dateStr: string): string {
  const [yyyy, mm, dd] = dateStr.split('-').map(Number);
  const d = new Date(yyyy, mm - 1, dd);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);

  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const yestStr = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;

  if (dateStr === todayStr) return 'Today';
  if (dateStr === yestStr) return 'Yesterday';

  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
}

function formatTime(isoStr: string): string {
  const d = new Date(isoStr);
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

function getLast7Days(): string[] {
  const days: string[] = [];
  const today = new Date();
  for (let i = 0; i < 7; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    days.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
  }
  return days;
}

// ── Summary bar (7-day overview) ─────────────────────────────────────────────

function SummaryBar({
  entries,
  colors,
}: {
  entries: HabitRatingEntry[];
  colors: ReturnType<typeof import('@/hooks/use-colors').useColors>;
}) {
  const last7 = getLast7Days();
  const byDate = groupByDate(entries);

  const doneCount = last7.filter((d) => (byDate[d] ?? []).some((e) => e.rating === 'done')).length;
  const partialCount = last7.filter((d) => (byDate[d] ?? []).some((e) => e.rating === 'partial')).length;
  const missedCount = last7.filter((d) => (byDate[d] ?? []).some((e) => e.rating === 'missed')).length;
  const totalRatings = entries.length;

  return (
    <View style={[summaryStyles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Text style={[summaryStyles.title, { color: colors.foreground }]}>Last 7 Days</Text>
      <View style={summaryStyles.statsRow}>
        <View style={summaryStyles.stat}>
          <Text style={[summaryStyles.statNum, { color: '#22C55E' }]}>{doneCount}</Text>
          <Text style={[summaryStyles.statLabel, { color: colors.muted }]}>Done</Text>
        </View>
        <View style={[summaryStyles.divider, { backgroundColor: colors.border }]} />
        <View style={summaryStyles.stat}>
          <Text style={[summaryStyles.statNum, { color: '#F59E0B' }]}>{partialCount}</Text>
          <Text style={[summaryStyles.statLabel, { color: colors.muted }]}>Partial</Text>
        </View>
        <View style={[summaryStyles.divider, { backgroundColor: colors.border }]} />
        <View style={summaryStyles.stat}>
          <Text style={[summaryStyles.statNum, { color: '#EF4444' }]}>{missedCount}</Text>
          <Text style={[summaryStyles.statLabel, { color: colors.muted }]}>Missed</Text>
        </View>
        <View style={[summaryStyles.divider, { backgroundColor: colors.border }]} />
        <View style={summaryStyles.stat}>
          <Text style={[summaryStyles.statNum, { color: colors.primary }]}>{totalRatings}</Text>
          <Text style={[summaryStyles.statLabel, { color: colors.muted }]}>Total</Text>
        </View>
      </View>

      {/* 7-day dot row */}
      <View style={summaryStyles.dotRow}>
        {last7.reverse().map((d) => {
          const dayEntries = byDate[d] ?? [];
          const hasDone = dayEntries.some((e) => e.rating === 'done');
          const hasPartial = dayEntries.some((e) => e.rating === 'partial');
          const hasMissed = dayEntries.some((e) => e.rating === 'missed');
          const dotColor = hasDone ? '#22C55E' : hasPartial ? '#F59E0B' : hasMissed ? '#EF4444' : colors.border;
          const dayNum = d.split('-')[2];
          return (
            <View key={d} style={summaryStyles.dotCell}>
              <View style={[summaryStyles.dot, { backgroundColor: dotColor }]} />
              <Text style={[summaryStyles.dotLabel, { color: colors.muted }]}>{parseInt(dayNum, 10)}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const summaryStyles = StyleSheet.create({
  card: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 20,
    gap: 16,
    marginBottom: 8,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  stat: {
    alignItems: 'center',
    gap: 2,
    flex: 1,
  },
  statNum: {
    fontSize: 28,
    fontWeight: '800',
    lineHeight: 32,
  },
  statLabel: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  divider: {
    width: 1,
    height: 36,
  },
  dotRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 4,
  },
  dotCell: {
    alignItems: 'center',
    gap: 4,
    flex: 1,
  },
  dot: {
    width: 28,
    height: 28,
    borderRadius: 14,
  },
  dotLabel: {
    fontSize: 11,
    fontWeight: '600',
  },
});

// ── Entry row ─────────────────────────────────────────────────────────────────

function EntryRow({
  entry,
  colors,
}: {
  entry: HabitRatingEntry;
  colors: ReturnType<typeof import('@/hooks/use-colors').useColors>;
}) {
  const meta = RATING_META[entry.rating];
  return (
    <View style={[entryStyles.row, { borderBottomColor: colors.border }]}>
      <View style={[entryStyles.iconCircle, { backgroundColor: meta.color + '18' }]}>
        <IconSymbol name={meta.icon as any} size={22} color={meta.color} />
      </View>
      <View style={entryStyles.info}>
        <Text style={[entryStyles.habitName, { color: colors.foreground }]} numberOfLines={1}>
          {entry.habitName}
        </Text>
        <Text style={[entryStyles.meta, { color: colors.muted }]}>
          {entry.stackName} · {formatTime(entry.timestamp)}
        </Text>
      </View>
      <View style={[entryStyles.badge, { backgroundColor: meta.color + '18', borderColor: meta.color + '40' }]}>
        <Text style={[entryStyles.badgeText, { color: meta.color }]}>{meta.label}</Text>
      </View>
    </View>
  );
}

const entryStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  info: {
    flex: 1,
    gap: 2,
  },
  habitName: {
    fontSize: 15,
    fontWeight: '600',
  },
  meta: {
    fontSize: 12,
    fontWeight: '500',
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    borderWidth: 1,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '700',
  },
});

// ── Date section header ───────────────────────────────────────────────────────

function DateHeader({
  date,
  entries,
  colors,
}: {
  date: string;
  entries: HabitRatingEntry[];
  colors: ReturnType<typeof import('@/hooks/use-colors').useColors>;
}) {
  const doneCount = entries.filter((e) => e.rating === 'done').length;
  const partialCount = entries.filter((e) => e.rating === 'partial').length;
  const missedCount = entries.filter((e) => e.rating === 'missed').length;

  return (
    <View style={[dateHeaderStyles.container, { borderBottomColor: colors.border }]}>
      <Text style={[dateHeaderStyles.dateText, { color: colors.foreground }]}>
        {formatDate(date)}
      </Text>
      <View style={dateHeaderStyles.pills}>
        {doneCount > 0 && (
          <View style={[dateHeaderStyles.pill, { backgroundColor: '#22C55E20' }]}>
            <Text style={[dateHeaderStyles.pillText, { color: '#22C55E' }]}>{doneCount} done</Text>
          </View>
        )}
        {partialCount > 0 && (
          <View style={[dateHeaderStyles.pill, { backgroundColor: '#F59E0B20' }]}>
            <Text style={[dateHeaderStyles.pillText, { color: '#F59E0B' }]}>{partialCount} partial</Text>
          </View>
        )}
        {missedCount > 0 && (
          <View style={[dateHeaderStyles.pill, { backgroundColor: '#EF444420' }]}>
            <Text style={[dateHeaderStyles.pillText, { color: '#EF4444' }]}>{missedCount} missed</Text>
          </View>
        )}
      </View>
    </View>
  );
}

const dateHeaderStyles = StyleSheet.create({
  container: {
    paddingTop: 20,
    paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 6,
  },
  dateText: {
    fontSize: 18,
    fontWeight: '700',
  },
  pills: {
    flexDirection: 'row',
    gap: 6,
    flexWrap: 'wrap',
  },
  pill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  pillText: {
    fontSize: 12,
    fontWeight: '600',
  },
});

// ── List item types ───────────────────────────────────────────────────────────

type ListItem =
  | { type: 'summary' }
  | { type: 'dateHeader'; date: string; entries: HabitRatingEntry[] }
  | { type: 'entry'; entry: HabitRatingEntry };

// ── Main screen ───────────────────────────────────────────────────────────────

export default function HabitHistoryScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = useColors();

  const [entries, setEntries] = useState<HabitRatingEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const all = await loadHabitHistory();
      setEntries(all);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Build flat list items
  const listItems: ListItem[] = [];
  if (!loading) {
    listItems.push({ type: 'summary' });
    if (entries.length > 0) {
      const byDate = groupByDate(entries);
      const sortedDates = Object.keys(byDate).sort((a, b) => b.localeCompare(a));
      for (const date of sortedDates) {
        const dateEntries = byDate[date].sort((a, b) => b.timestamp.localeCompare(a.timestamp));
        listItems.push({ type: 'dateHeader', date, entries: dateEntries });
        for (const entry of dateEntries) {
          listItems.push({ type: 'entry', entry });
        }
      }
    }
  }

  function renderItem({ item }: { item: ListItem }) {
    if (item.type === 'summary') {
      return <SummaryBar entries={entries} colors={colors} />;
    }
    if (item.type === 'dateHeader') {
      return <DateHeader date={item.date} entries={item.entries} colors={colors} />;
    }
    if (item.type === 'entry') {
      return <EntryRow entry={item.entry} colors={colors} />;
    }
    return null;
  }

  return (
    <ScreenContainer edges={['top', 'left', 'right']}>
      {/* Header */}
      <View style={[headerStyles.row, { borderBottomColor: colors.border }]}>
        <Pressable
          onPress={() => {
            if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.back();
          }}
          style={({ pressed }) => [headerStyles.backBtn, { opacity: pressed ? 0.6 : 1 }]}
        >
          <IconSymbol name="chevron.left" size={24} color={colors.primary} />
          <Text style={[headerStyles.backText, { color: colors.primary }]}>Back</Text>
        </Pressable>
        <Text style={[headerStyles.title, { color: colors.foreground }]}>Habit History</Text>
        <Pressable
          onPress={loadData}
          style={({ pressed }) => [headerStyles.refreshBtn, { opacity: pressed ? 0.6 : 1 }]}
        >
          <IconSymbol name="arrow.counterclockwise" size={20} color={colors.muted} />
        </Pressable>
      </View>

      {loading ? (
        <View style={loadingStyles.container}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[loadingStyles.text, { color: colors.muted }]}>Loading history…</Text>
        </View>
      ) : entries.length === 0 ? (
        <View style={emptyStyles.container}>
          <IconSymbol name="calendar" size={64} color={colors.border} />
          <Text style={[emptyStyles.title, { color: colors.foreground }]}>No ratings yet</Text>
          <Text style={[emptyStyles.subtitle, { color: colors.muted }]}>
            Run a stack with Reminder steps and rate your habits to see history here.
          </Text>
        </View>
      ) : (
        <FlatList
          data={listItems}
          renderItem={renderItem}
          keyExtractor={(item, idx) => {
            if (item.type === 'summary') return 'summary';
            if (item.type === 'dateHeader') return `header_${item.date}`;
            return `entry_${item.entry.id}_${idx}`;
          }}
          contentContainerStyle={listStyles.content}
          showsVerticalScrollIndicator={false}
        />
      )}
    </ScreenContainer>
  );
}

const headerStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    minWidth: 72,
  },
  backText: {
    fontSize: 16,
    fontWeight: '500',
  },
  title: {
    flex: 1,
    textAlign: 'center',
    fontSize: 17,
    fontWeight: '700',
  },
  refreshBtn: {
    minWidth: 72,
    alignItems: 'flex-end',
    paddingRight: 4,
  },
});

const loadingStyles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  text: {
    fontSize: 15,
    fontWeight: '500',
  },
});

const emptyStyles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
    gap: 16,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 15,
    fontWeight: '500',
    textAlign: 'center',
    lineHeight: 22,
  },
});

const listStyles = StyleSheet.create({
  content: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
});
