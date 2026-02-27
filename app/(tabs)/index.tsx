import { ScrollView, View, Text, Pressable, StyleSheet, Platform, useWindowDimensions } from "react-native";
import { useState } from "react";
import { useRouter } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { useApp } from "@/lib/app-context";
import { useColors } from "@/hooks/use-colors";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { yesterdayString, formatDisplayDate } from "@/lib/storage";
import * as Haptics from "expo-haptics";
import { useContentMaxWidth } from "@/hooks/use-is-ipad";
import Svg, { Circle } from "react-native-svg";

const RANGES = [1, 7, 14, 30, 60, 90] as const;
type Range = typeof RANGES[number];

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function GoalRing({ rate, emoji, label, deadline, onPress, colors }: {
  rate: number; emoji: string; label: string; deadline?: string;
  onPress: () => void; colors: ReturnType<typeof import('@/hooks/use-colors').useColors>;
}) {
  const { width } = useWindowDimensions();
  // 2 per row: 20px padding each side, 16px gap between
  const ringSize = Math.floor((width - 40 - 16) / 2);
  const strokeWidth = 12;
  const radius = (ringSize - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const pct = Math.min(Math.max(rate, 0), 1);
  const strokeDashoffset = circumference * (1 - pct);

  // Color based on rate
  const ringColor = pct >= 0.8 ? '#4ade80' : pct >= 0.5 ? '#fbbf24' : pct > 0 ? '#f87171' : '#334155';
  const glowColor = pct >= 0.8 ? '#4ade8055' : pct >= 0.5 ? '#fbbf2455' : pct > 0 ? '#f8717155' : 'transparent';

  // Deadline
  let deadlineLabel = '';
  let deadlineColor = colors.muted;
  if (deadline) {
    const dl = new Date(deadline + 'T12:00:00');
    const now = new Date(); now.setHours(0, 0, 0, 0);
    const days = Math.ceil((dl.getTime() - now.getTime()) / 86400000);
    deadlineLabel = days < 0 ? 'Overdue' : days === 0 ? 'Due today' : `${days}d`;
    deadlineColor = days < 0 ? '#EF4444' : days <= 7 ? '#F59E0B' : colors.muted;
  }

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.ringCell, { width: ringSize, opacity: pressed ? 0.75 : 1 }]}
    >
      {/* Glow behind ring */}
      <View style={[styles.ringGlow, { width: ringSize, height: ringSize, shadowColor: glowColor, shadowOpacity: pct > 0 ? 1 : 0, shadowRadius: 18, shadowOffset: { width: 0, height: 0 } }]} />

      <View style={{ width: ringSize, height: ringSize }}>
        <Svg width={ringSize} height={ringSize} style={{ transform: [{ rotate: '-90deg' }] }}>
          {/* Dark fill inside ring */}
          <Circle
            cx={ringSize / 2}
            cy={ringSize / 2}
            r={radius}
            fill="#0d1117"
          />
          {/* Track */}
          <Circle
            cx={ringSize / 2}
            cy={ringSize / 2}
            r={radius}
            stroke="#1e2a3a"
            strokeWidth={strokeWidth}
            fill="none"
          />
          {/* Progress arc */}
          {pct > 0 && (
            <Circle
              cx={ringSize / 2}
              cy={ringSize / 2}
              r={radius}
              stroke={ringColor}
              strokeWidth={strokeWidth}
              fill="none"
              strokeDasharray={`${circumference} ${circumference}`}
              strokeDashoffset={strokeDashoffset}
              strokeLinecap="round"
            />
          )}
        </Svg>

        {/* Centered percentage */}
        <View style={[styles.ringCenter, { width: ringSize, height: ringSize }]} pointerEvents="none">
          <Text style={styles.ringPct}>
            {pct > 0 ? `${Math.round(pct * 100)}%` : '—'}
          </Text>
        </View>
      </View>

      {/* Emoji + label below */}
      <View style={styles.ringLabelRow}>
        <Text style={styles.ringEmoji}>{emoji}</Text>
        <Text style={[styles.ringLabel, { color: colors.foreground }]} numberOfLines={2}>{label}</Text>
      </View>
      {deadlineLabel ? (
        <Text style={[styles.ringDeadline, { color: deadlineColor }]}>{deadlineLabel}</Text>
      ) : null}
    </Pressable>
  );
}

export default function HomeScreen() {
  const { alarm, isPendingCheckIn, getCategoryRate, streak, isLoaded, categories } = useApp();
  const colors = useColors();
  const router = useRouter();
  const maxWidth = useContentMaxWidth();
  const [range, setRange] = useState<Range>(1);
  const [rangeOpen, setRangeOpen] = useState(false);

  function handleRangeSelect(r: Range) {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setRange(r);
    setRangeOpen(false);
  }

  const yesterday = yesterdayString();

  function handleCheckIn(date?: string) {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push((`/checkin?date=${date ?? yesterday}`) as never);
  }

  function formatAlarmTime(h: number, m: number): string {
    const period = h >= 12 ? 'PM' : 'AM';
    const hour = h % 12 === 0 ? 12 : h % 12;
    return `${hour}:${m.toString().padStart(2, '0')} ${period}`;
  }

  // Overall score across all categories
  const allRates = categories.map((c) => getCategoryRate(c.id, range));
  const overallPct = allRates.length > 0
    ? Math.round(allRates.reduce((a, b) => a + b, 0) / allRates.length * 100)
    : null;

  const rangeLabel = range === 1 ? 'Yesterday' : `${range}-Day`;

  return (
    <ScreenContainer>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={maxWidth ? { maxWidth, alignSelf: 'center', width: '100%' } : undefined}>

          {/* ── Header ── */}
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.greeting, { color: colors.foreground }]}>{getGreeting()}</Text>
              <Text style={[styles.dateText, { color: colors.muted }]}>
                {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
              </Text>
            </View>
            {streak > 0 && (
              <View style={styles.streakPill}>
                <Text style={styles.streakFire}>🔥</Text>
                <Text style={styles.streakNum}>{streak}</Text>
                <Text style={styles.streakDay}>day{streak !== 1 ? 's' : ''}</Text>
              </View>
            )}
          </View>

          {/* ── Yesterday's review banner ── */}
          {isPendingCheckIn && (
            <Pressable
              onPress={() => handleCheckIn(yesterday)}
              style={({ pressed }) => [
                styles.checkInBanner,
                { backgroundColor: colors.primary, transform: [{ scale: pressed ? 0.98 : 1 }] },
              ]}
            >
              <View style={styles.checkInLeft}>
                <Text style={styles.checkInTitle}>Rate Yesterday</Text>
                <Text style={styles.checkInSub}>{formatDisplayDate(yesterday)} · Tap to review 🔴🟡🟢</Text>
              </View>
              <IconSymbol name="chevron.right" size={18} color="rgba(255,255,255,0.8)" />
            </Pressable>
          )}

          {/* ── Alarm strip ── */}
          <Pressable
            onPress={() => router.push('/(tabs)/settings' as never)}
            style={({ pressed }) => [
              styles.alarmStrip,
              { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.8 : 1 },
            ]}
          >
            <View style={[styles.alarmDot, { backgroundColor: alarm.isEnabled ? '#4ade80' : '#334155' }]} />
            <Text style={[styles.alarmStripLabel, { color: colors.muted }]}>Alarm</Text>
            <Text style={[styles.alarmStripTime, { color: colors.foreground }]}>
              {alarm.isEnabled ? formatAlarmTime(alarm.hour, alarm.minute) : 'Off'}
            </Text>
            <View style={{ flex: 1 }} />
            <Text style={[styles.alarmStripEdit, { color: colors.primary }]}>Edit</Text>
            <IconSymbol name="chevron.right" size={14} color={colors.muted} />
          </Pressable>

          {/* ── Goals section header ── */}
          <View style={[styles.sectionRow, { zIndex: 10 }]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{rangeLabel} Goals</Text>
              {overallPct !== null && (
                <Text style={[styles.sectionSub, { color: colors.muted }]}>
                  Overall {overallPct}% across {categories.length} goal{categories.length !== 1 ? 's' : ''}
                </Text>
              )}
            </View>
            <View>
              <Pressable
                onPress={() => setRangeOpen((o) => !o)}
                style={({ pressed }) => [
                  styles.rangeChip,
                  { backgroundColor: colors.primary + '18', borderColor: colors.primary + '44', opacity: pressed ? 0.7 : 1 },
                ]}
              >
                <Text style={[styles.rangeChipText, { color: colors.primary }]}>{range}d</Text>
                <IconSymbol name={rangeOpen ? 'chevron.up' : 'chevron.down'} size={11} color={colors.primary} />
              </Pressable>
              {rangeOpen && (
                <View style={[styles.rangeDropdown, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  {RANGES.map((r) => (
                    <Pressable
                      key={r}
                      onPress={() => handleRangeSelect(r)}
                      style={({ pressed }) => [
                        styles.rangeDropdownItem,
                        r === range && { backgroundColor: colors.primary + '18' },
                        { opacity: pressed ? 0.7 : 1 },
                      ]}
                    >
                      <Text style={[
                        styles.rangeDropdownText,
                        { color: r === range ? colors.primary : colors.foreground, fontWeight: r === range ? '700' : '500' },
                      ]}>
                        {r === 1 ? 'Yesterday' : `${r} days`}
                      </Text>
                      {r === range && <IconSymbol name="checkmark" size={13} color={colors.primary} />}
                    </Pressable>
                  ))}
                </View>
              )}
            </View>
          </View>

          {/* ── Goal rings 2-per-row ── */}
          {categories.length === 0 ? (
            <View style={[styles.emptyState, { borderColor: colors.border }]}>
              <Text style={[styles.emptyStateText, { color: colors.muted }]}>No goals yet — add one in Manage Habits</Text>
            </View>
          ) : (
            <View style={styles.ringGrid}>
              {categories.map((cat) => (
                <GoalRing
                  key={cat.id}
                  rate={getCategoryRate(cat.id, range)}
                  emoji={cat.emoji}
                  label={cat.label}
                  deadline={cat.deadline}
                  colors={colors}
                  onPress={() => {
                    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    router.push((`/category-detail?categoryId=${cat.id}`) as never);
                  }}
                />
              ))}
            </View>
          )}

          {/* ── Manage habits ── */}
          <Pressable
            onPress={() => router.push('/habits' as never)}
            style={({ pressed }) => [
              styles.manageBtn,
              { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.8 : 1 },
            ]}
          >
            <IconSymbol name="list.bullet" size={18} color={colors.primary} />
            <Text style={[styles.manageBtnText, { color: colors.foreground }]}>Manage Habits & Goals</Text>
            <IconSymbol name="chevron.right" size={16} color={colors.muted} />
          </Pressable>

          <View style={{ height: 32 }} />
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: 20, paddingBottom: 40 },

  // Header
  header: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 20, gap: 12 },
  greeting: { fontSize: 28, fontWeight: '800', letterSpacing: -0.8 },
  dateText: { fontSize: 13, marginTop: 3, letterSpacing: 0.1 },
  streakPill: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: '#FF6B3520', borderRadius: 20,
    paddingHorizontal: 12, paddingVertical: 7,
    marginTop: 2,
  },
  streakFire: { fontSize: 16 },
  streakNum: { fontSize: 17, fontWeight: '800', color: '#FF6B35' },
  streakDay: { fontSize: 11, fontWeight: '600', color: '#FF6B3599', marginTop: 1 },

  // Check-in banner
  checkInBanner: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: 16, padding: 16, marginBottom: 14, gap: 8,
  },
  checkInLeft: { flex: 1, gap: 3 },
  checkInTitle: { color: '#fff', fontSize: 15, fontWeight: '700' },
  checkInSub: { color: 'rgba(255,255,255,0.8)', fontSize: 12 },

  // Alarm strip
  alarmStrip: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11,
    borderWidth: 1, marginBottom: 24,
  },
  alarmDot: { width: 8, height: 8, borderRadius: 4 },
  alarmStripLabel: { fontSize: 12, fontWeight: '500' },
  alarmStripTime: { fontSize: 15, fontWeight: '700' },
  alarmStripEdit: { fontSize: 13, fontWeight: '600' },

  // Section header
  sectionRow: {
    flexDirection: 'row', alignItems: 'flex-start',
    justifyContent: 'space-between', marginBottom: 16,
  },
  sectionTitle: { fontSize: 20, fontWeight: '800', letterSpacing: -0.4 },
  sectionSub: { fontSize: 12, marginTop: 3 },
  rangeChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 6,
    borderRadius: 20, borderWidth: 1,
  },
  rangeChipText: { fontSize: 13, fontWeight: '700' },
  rangeDropdown: {
    position: 'absolute', right: 0, top: 36, zIndex: 100,
    borderRadius: 12, borderWidth: 1,
    minWidth: 130, overflow: 'hidden',
    shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 10, shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  rangeDropdownItem: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 14, paddingVertical: 11,
  },
  rangeDropdownText: { fontSize: 14 },

  // Rings
  ringGrid: {
    flexDirection: 'row', flexWrap: 'wrap',
    gap: 16, marginBottom: 24,
    justifyContent: 'space-between',
  },
  ringCell: { alignItems: 'center' },
  ringGlow: { position: 'absolute', top: 0, left: 0, borderRadius: 999 },
  ringCenter: {
    position: 'absolute', top: 0, left: 0,
    alignItems: 'center', justifyContent: 'center',
  },
  ringPct: { fontSize: 26, fontWeight: '900', letterSpacing: -1, color: '#ffffff' },
  ringLabelRow: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    marginTop: 10, paddingHorizontal: 2,
  },
  ringEmoji: { fontSize: 16 },
  ringLabel: { fontSize: 13, fontWeight: '600', flex: 1, lineHeight: 17 },
  ringDeadline: { fontSize: 11, fontWeight: '600', marginTop: 3, textAlign: 'center' },

  // Empty state
  emptyState: {
    borderRadius: 14, borderWidth: 1, borderStyle: 'dashed',
    padding: 24, alignItems: 'center', marginBottom: 24,
  },
  emptyStateText: { fontSize: 14, textAlign: 'center' },

  // Manage button
  manageBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderRadius: 14, padding: 16, borderWidth: 1,
  },
  manageBtnText: { flex: 1, fontSize: 15, fontWeight: '600' },
});
