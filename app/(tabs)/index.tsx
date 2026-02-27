import { ScrollView, View, Text, Pressable, StyleSheet, Platform, useWindowDimensions } from "react-native";
import { useState } from "react";
import { useRouter } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { useApp } from "@/lib/app-context";
import { useColors } from "@/hooks/use-colors";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { yesterdayString, formatDisplayDate, LIFE_AREAS } from "@/lib/storage";
import * as Haptics from "expo-haptics";
import { useContentMaxWidth } from "@/hooks/use-is-ipad";
import Svg, { Circle, Rect } from "react-native-svg";

const RANGES = [1, 7, 14, 30, 60, 90] as const;
type Range = typeof RANGES[number];

const LIFE_AREA_MAP = Object.fromEntries(LIFE_AREAS.map((a) => [a.id, a]));

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

/** Card with a rounded-rect SVG border that fills clockwise based on pct */
function GoalCard({
  rate, emoji, label, lifeArea, deadline, breakdown, onPress, colors,
}: {
  rate: number;
  emoji: string;
  label: string;
  lifeArea?: string;
  deadline?: string;
  breakdown: { green: number; yellow: number; red: number; none: number };
  onPress: () => void;
  colors: ReturnType<typeof import('@/hooks/use-colors').useColors>;
}) {
  const { width } = useWindowDimensions();
  // 2 per row: 20px padding each side, 12px gap
  const cardW = Math.floor((width - 40 - 12) / 2);
  const cardH = cardW + 20; // slightly taller than wide

  const pct = Math.min(Math.max(rate, 0), 1);
  const strokeW = 3;
  const r = 16; // border-radius of card
  // Perimeter of rounded rect
  const perimeter = 2 * (cardW - 2 * r) + 2 * (cardH - 2 * r) + 2 * Math.PI * r;
  const dashOffset = perimeter * (1 - pct);

  // Colors
  const isOnTrack = pct >= 0.8;
  const isOkay = pct >= 0.5 && pct < 0.8;
  const isBehind = pct > 0 && pct < 0.5;
  const hasData = pct > 0;

  const accentColor = isOnTrack ? '#22C55E' : isOkay ? '#F59E0B' : isBehind ? '#EF4444' : colors.border;
  const cardBg = isOnTrack ? '#0a1f10' : isOkay ? '#1f1500' : isBehind ? '#1f0808' : colors.surface;
  const badgeLabel = isOnTrack ? '✓ On Track' : isOkay ? '~ Doing Okay' : isBehind ? '✗ Behind' : null;
  const pctColor = isOnTrack ? '#4ade80' : isOkay ? '#fbbf24' : isBehind ? '#f87171' : colors.muted;
  const labelColor = isOnTrack ? '#e2fce8' : isOkay ? '#fef3c7' : isBehind ? '#fee2e2' : colors.foreground;

  // Deadline
  let deadlineLabel = '';
  let deadlineColor = colors.muted;
  if (deadline) {
    const dl = new Date(deadline + 'T12:00:00');
    const now = new Date(); now.setHours(0, 0, 0, 0);
    const days = Math.ceil((dl.getTime() - now.getTime()) / 86400000);
    deadlineLabel = days < 0 ? 'Overdue' : days === 0 ? 'Due today' : `${days}d left`;
    deadlineColor = days < 0 ? '#EF4444' : days <= 7 ? '#F59E0B' : '#6b7280';
  }

  // Progress bar totals
  const total = breakdown.green + breakdown.yellow + breakdown.red + breakdown.none;
  const greenW = total > 0 ? (breakdown.green / total) : 0;
  const yellowW = total > 0 ? (breakdown.yellow / total) : 0;
  const redW = total > 0 ? (breakdown.red / total) : 0;

  const lifeAreaDef = lifeArea ? LIFE_AREA_MAP[lifeArea] : null;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.cardOuter, { width: cardW, height: cardH, opacity: pressed ? 0.82 : 1 }]}
    >
      {/* SVG arc border — drawn on top of card */}
      <Svg
        width={cardW}
        height={cardH}
        style={StyleSheet.absoluteFillObject}
        pointerEvents="none"
      >
        {/* Track (full border, dim) */}
        <Rect
          x={strokeW / 2}
          y={strokeW / 2}
          width={cardW - strokeW}
          height={cardH - strokeW}
          rx={r}
          ry={r}
          fill={cardBg}
          stroke={accentColor + '30'}
          strokeWidth={strokeW}
        />
        {/* Progress arc */}
        {hasData && (
          <Rect
            x={strokeW / 2}
            y={strokeW / 2}
            width={cardW - strokeW}
            height={cardH - strokeW}
            rx={r}
            ry={r}
            fill="none"
            stroke={accentColor}
            strokeWidth={strokeW}
            strokeDasharray={`${perimeter} ${perimeter}`}
            strokeDashoffset={dashOffset}
            strokeLinecap="round"
          />
        )}
      </Svg>

      {/* Card content */}
      <View style={[styles.cardContent, { padding: 12 }]}>
        {/* Status badge */}
        {badgeLabel && (
          <View style={[styles.badge, { borderColor: accentColor, backgroundColor: accentColor + '18' }]}>
            <Text style={[styles.badgeText, { color: accentColor }]}>{badgeLabel}</Text>
          </View>
        )}

        {/* Emoji icon */}
        <View style={[styles.emojiBox, { backgroundColor: accentColor + '22' }]}>
          <Text style={styles.emojiText}>{emoji}</Text>
        </View>

        {/* Goal name */}
        <Text style={[styles.cardLabel, { color: labelColor }]} numberOfLines={2}>{label}</Text>

        {/* Life area tag */}
        {lifeAreaDef && (
          <Text style={[styles.cardLifeArea, { color: accentColor + 'cc' }]}>
            {lifeAreaDef.emoji} {lifeAreaDef.label}
          </Text>
        )}

        {/* Percentage + deadline */}
        <View style={styles.cardScoreRow}>
          <Text style={[styles.cardPct, { color: pctColor }]}>
            {hasData ? `${Math.round(pct * 100)}%` : '—'}
          </Text>
          {deadlineLabel ? (
            <View style={[styles.deadlineTag, { borderColor: deadlineColor + '55', backgroundColor: deadlineColor + '18' }]}>
              <Text style={[styles.deadlineText, { color: deadlineColor }]}>{deadlineLabel}</Text>
            </View>
          ) : null}
        </View>

        {/* Progress bars */}
        {total > 0 && (
          <View style={styles.barsWrap}>
            <View style={styles.bar}>
              <View style={[styles.barSeg, { flex: greenW, backgroundColor: '#22C55E' }]} />
              <View style={[styles.barSeg, { flex: yellowW, backgroundColor: '#F59E0B' }]} />
              <View style={[styles.barSeg, { flex: redW, backgroundColor: '#EF4444' }]} />
              <View style={[styles.barSeg, { flex: Math.max(1 - greenW - yellowW - redW, 0), backgroundColor: '#1e2a3a' }]} />
            </View>
          </View>
        )}
      </View>
    </Pressable>
  );
}

export default function HomeScreen() {
  const { alarm, isPendingCheckIn, getCategoryRate, getCategoryBreakdown, streak, isLoaded, categories } = useApp();
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

  const rangeLabel = range === 1 ? "Yesterday's Goals" : `${range}-Day Goals`;

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
                <Text style={styles.checkInTitle}>Yesterday's Review</Text>
                <Text style={styles.checkInSub}>{formatDisplayDate(yesterday)} · Tap to rate 🔴🟡🟢</Text>
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
            <Text style={[styles.alarmLabel, { color: colors.muted }]}>Alarm</Text>
            <Text style={[styles.alarmTime, { color: colors.foreground }]}>
              {alarm.isEnabled ? formatAlarmTime(alarm.hour, alarm.minute) : 'Off'}
            </Text>
            <View style={{ flex: 1 }} />
            <Text style={[styles.alarmEdit, { color: colors.primary }]}>Edit</Text>
            <IconSymbol name="chevron.right" size={14} color={colors.muted} />
          </Pressable>

          {/* ── Goals section header ── */}
          <View style={[styles.sectionRow, { zIndex: 10 }]}>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{rangeLabel}</Text>
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

          {/* ── 2-column goal cards ── */}
          {categories.length === 0 ? (
            <View style={[styles.emptyState, { borderColor: colors.border }]}>
              <Text style={[styles.emptyText, { color: colors.muted }]}>No goals yet — add one in Manage Habits</Text>
            </View>
          ) : (
            <View style={styles.cardGrid}>
              {categories.map((cat) => (
                <GoalCard
                  key={cat.id}
                  rate={getCategoryRate(cat.id, range)}
                  emoji={cat.emoji}
                  label={cat.label}
                  lifeArea={cat.lifeArea}
                  deadline={cat.deadline}
                  breakdown={getCategoryBreakdown(cat.id, range)}
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
  greeting: { fontSize: 26, fontWeight: '800', letterSpacing: -0.6 },
  dateText: { fontSize: 13, marginTop: 3 },
  streakPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#FF6B3520', borderRadius: 20,
    paddingHorizontal: 12, paddingVertical: 7, marginTop: 2,
  },
  streakFire: { fontSize: 16 },
  streakNum: { fontSize: 17, fontWeight: '800', color: '#FF6B35' },

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
  alarmLabel: { fontSize: 12, fontWeight: '500' },
  alarmTime: { fontSize: 15, fontWeight: '700' },
  alarmEdit: { fontSize: 13, fontWeight: '600' },

  // Section header
  sectionRow: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', marginBottom: 14,
  },
  sectionTitle: { fontSize: 18, fontWeight: '800', letterSpacing: -0.3 },
  rangeChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 6,
    borderRadius: 20, borderWidth: 1,
  },
  rangeChipText: { fontSize: 13, fontWeight: '700' },
  rangeDropdown: {
    position: 'absolute', right: 0, top: 36, zIndex: 100,
    borderRadius: 12, borderWidth: 1, minWidth: 130, overflow: 'hidden',
    shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 10, shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  rangeDropdownItem: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 14, paddingVertical: 11,
  },
  rangeDropdownText: { fontSize: 14 },

  // Card grid
  cardGrid: {
    flexDirection: 'row', flexWrap: 'wrap',
    gap: 12, marginBottom: 24,
    justifyContent: 'space-between',
  },
  cardOuter: {
    borderRadius: 16,
    overflow: 'hidden',
  },
  cardContent: {
    flex: 1, gap: 6,
  },

  // Badge
  badge: {
    alignSelf: 'flex-start',
    borderRadius: 20, borderWidth: 1.5,
    paddingHorizontal: 10, paddingVertical: 4,
    marginBottom: 2,
  },
  badgeText: { fontSize: 11, fontWeight: '700', letterSpacing: 0.2 },

  // Emoji icon box
  emojiBox: {
    width: 44, height: 44, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  emojiText: { fontSize: 22 },

  // Card text
  cardLabel: { fontSize: 14, fontWeight: '700', lineHeight: 19 },
  cardLifeArea: { fontSize: 11, fontWeight: '500', marginTop: -2 },
  cardScoreRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 },
  cardPct: { fontSize: 26, fontWeight: '900', letterSpacing: -1 },

  // Deadline tag
  deadlineTag: {
    borderRadius: 6, borderWidth: 1,
    paddingHorizontal: 7, paddingVertical: 2,
  },
  deadlineText: { fontSize: 11, fontWeight: '700' },

  // Progress bars
  barsWrap: { gap: 4, marginTop: 2 },
  bar: {
    height: 5, borderRadius: 3, overflow: 'hidden',
    flexDirection: 'row', backgroundColor: '#1e2a3a',
  },
  barSeg: { height: 5 },

  // Empty state
  emptyState: {
    borderRadius: 14, borderWidth: 1, borderStyle: 'dashed',
    padding: 24, alignItems: 'center', marginBottom: 24,
  },
  emptyText: { fontSize: 14, textAlign: 'center' },

  // Manage button
  manageBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderRadius: 14, padding: 16, borderWidth: 1,
  },
  manageBtnText: { flex: 1, fontSize: 15, fontWeight: '600' },
});
