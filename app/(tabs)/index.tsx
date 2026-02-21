import { ScrollView, Text, View, Pressable, StyleSheet, Platform } from "react-native";
import { useState } from "react";
import { useRouter } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { useApp } from "@/lib/app-context";
import { useColors } from "@/hooks/use-colors";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { yesterdayString, formatDisplayDate, toDateString, offsetDateString, Category } from "@/lib/storage";
import * as Haptics from "expo-haptics";

const RANGES = [7, 14, 30, 60, 90] as const;
type Range = typeof RANGES[number];

const CATEGORY_META: Record<Category, { label: string; emoji: string; colorKey: string }> = {
  health: { label: 'Health', emoji: '💪', colorKey: 'health' },
  relationships: { label: 'Relationships', emoji: '❤️', colorKey: 'relationships' },
  wealth: { label: 'Wealth', emoji: '💰', colorKey: 'wealth' },
  mindset: { label: 'Mindset', emoji: '🧠', colorKey: 'mindset' },
};

const CATEGORY_ORDER: Category[] = ['health', 'relationships', 'wealth', 'mindset'];

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

export default function HomeScreen() {
  const { alarm, isPendingCheckIn, getCategoryRate, getCategoryBreakdown, streak, isLoaded } = useApp();
  const colors = useColors();
  const router = useRouter();
  const [range, setRange] = useState<Range>(7);
  const [rangeOpen, setRangeOpen] = useState(false);

  function handleRangeSelect(r: Range) {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setRange(r);
    setRangeOpen(false);
  }

  const yesterday = yesterdayString();
  const today = toDateString();

  function handleCheckIn(date?: string) {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const target = date ?? yesterday;
    router.push((`/checkin?date=${target}`) as never);
  }

  function formatAlarmTime(h: number, m: number): string {
    const period = h >= 12 ? 'PM' : 'AM';
    const hour = h % 12 === 0 ? 12 : h % 12;
    const min = m.toString().padStart(2, '0');
    return `${hour}:${min} ${period}`;
  }

  return (
    <ScreenContainer>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={[styles.greeting, { color: colors.foreground }]}>{getGreeting()}</Text>
            <Text style={[styles.dateText, { color: colors.muted }]}>
              {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
            </Text>
          </View>
          {streak > 0 && (
            <View style={[styles.streakBadge, { backgroundColor: '#FF6B3522' }]}>
              <Text style={styles.streakFire}>🔥</Text>
              <Text style={[styles.streakText, { color: '#FF6B35' }]}>{streak}</Text>
            </View>
          )}
        </View>

        {/* Pending check-in banner */}
        {isPendingCheckIn && (
          <Pressable
            onPress={() => handleCheckIn(yesterday)}
            style={({ pressed }) => [
              styles.checkInBanner,
              { backgroundColor: colors.primary, transform: [{ scale: pressed ? 0.98 : 1 }] },
            ]}
          >
            <View style={styles.checkInBannerLeft}>
              <Text style={styles.checkInBannerTitle}>Yesterday's Review</Text>
              <Text style={styles.checkInBannerSub}>
                How did {formatDisplayDate(yesterday)} go? Tap to rate 🔴🟡🟢
              </Text>
            </View>
            <IconSymbol name="chevron.right" size={20} color="#fff" />
          </Pressable>
        )}

        {/* Alarm status card */}
        <View style={[styles.alarmCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={[styles.alarmIconWrap, { backgroundColor: colors.primary + '22' }]}>
            <IconSymbol name="alarm.fill" size={22} color={colors.primary} />
          </View>
          <View style={styles.alarmInfo}>
            <Text style={[styles.alarmLabel, { color: colors.muted }]}>Daily Alarm</Text>
            <Text style={[styles.alarmTime, { color: colors.foreground }]}>
              {alarm.isEnabled ? formatAlarmTime(alarm.hour, alarm.minute) : 'Not set'}
            </Text>
          </View>
          <Pressable
            onPress={() => router.push('/(tabs)/settings' as never)}
            style={({ pressed }) => [styles.alarmEditBtn, { opacity: pressed ? 0.6 : 1 }]}
          >
            <Text style={[styles.alarmEditText, { color: colors.primary }]}>Edit</Text>
          </Pressable>
        </View>

        {/* Range selector + category progress */}
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
            {range}-Day Progress
          </Text>
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
                      {r} days
                    </Text>
                    {r === range && <IconSymbol name="checkmark" size={13} color={colors.primary} />}
                  </Pressable>
                ))}
              </View>
            )}
          </View>
        </View>
        <View style={styles.categoryGrid}>
          {CATEGORY_ORDER.map((category) => {
            const meta = CATEGORY_META[category];
            const rate = getCategoryRate(category, range);
            const breakdown = getCategoryBreakdown(category, range);
            const total = breakdown.green + breakdown.yellow + breakdown.red;
            const catColor = (colors as Record<string, string>)[meta.colorKey] ?? colors.primary;

            return (
              <Pressable
                key={category}
                onPress={() => handleCheckIn(yesterday)}
                style={({ pressed }) => [
                  styles.categoryCard,
                  { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.85 : 1 },
                ]}
              >
                <View style={[styles.catIconWrap, { backgroundColor: catColor + '22' }]}>
                  <Text style={styles.catEmoji}>{meta.emoji}</Text>
                </View>
                <Text style={[styles.catLabel, { color: colors.muted }]}>{meta.label}</Text>
                <Text style={[styles.catScore, { color: catColor }]}>{Math.round(rate * 100)}%</Text>

                {/* Stacked bar */}
                {total > 0 ? (
                  <View style={[styles.catBar, { backgroundColor: colors.border }]}>
                    {breakdown.green > 0 && (
                      <View style={[styles.catBarSeg, { flex: breakdown.green, backgroundColor: '#22C55E' }]} />
                    )}
                    {breakdown.yellow > 0 && (
                      <View style={[styles.catBarSeg, { flex: breakdown.yellow, backgroundColor: '#F59E0B' }]} />
                    )}
                    {breakdown.red > 0 && (
                      <View style={[styles.catBarSeg, { flex: breakdown.red, backgroundColor: '#EF4444' }]} />
                    )}
                  </View>
                ) : (
                  <View style={[styles.catBar, { backgroundColor: colors.border }]} />
                )}
              </Pressable>
            );
          })}
        </View>

        {/* History quick access */}
        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Past Reviews</Text>
        <View style={[styles.historyCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {[-1, -2, -3, -4, -5].map((offset) => {
            const dateStr = offsetDateString(offset);
            const label = formatDisplayDate(dateStr);
            return (
              <Pressable
                key={dateStr}
                onPress={() => handleCheckIn(dateStr)}
                style={({ pressed }) => [
                  styles.historyRow,
                  { borderBottomColor: colors.border, opacity: pressed ? 0.7 : 1 },
                ]}
              >
                <Text style={[styles.historyDate, { color: colors.foreground }]}>{label}</Text>
                <IconSymbol name="chevron.right" size={16} color={colors.muted} />
              </Pressable>
            );
          })}
        </View>

        {/* Manage habits */}
        <Pressable
          onPress={() => router.push('/habits' as never)}
          style={({ pressed }) => [
            styles.manageBtn,
            { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.8 : 1 },
          ]}
        >
          <IconSymbol name="list.bullet" size={18} color={colors.primary} />
          <Text style={[styles.manageBtnText, { color: colors.foreground }]}>Manage Habits</Text>
          <IconSymbol name="chevron.right" size={16} color={colors.muted} />
        </Pressable>

        <View style={{ height: 30 }} />
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: 20, paddingBottom: 40 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  greeting: { fontSize: 26, fontWeight: '700', letterSpacing: -0.5 },
  dateText: { fontSize: 14, marginTop: 2 },
  streakBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20,
  },
  streakFire: { fontSize: 18 },
  streakText: { fontSize: 18, fontWeight: '800' },
  checkInBanner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderRadius: 16, padding: 16, marginBottom: 16,
  },
  checkInBannerLeft: { flex: 1, gap: 3 },
  checkInBannerTitle: { color: '#fff', fontSize: 16, fontWeight: '700' },
  checkInBannerSub: { color: 'rgba(255,255,255,0.85)', fontSize: 13 },
  alarmCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderRadius: 14, padding: 14, marginBottom: 20, borderWidth: 1,
  },
  alarmIconWrap: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  alarmInfo: { flex: 1 },
  alarmLabel: { fontSize: 12 },
  alarmTime: { fontSize: 18, fontWeight: '700' },
  alarmEditBtn: { paddingHorizontal: 8, paddingVertical: 4 },
  alarmEditText: { fontSize: 14, fontWeight: '600' },
  sectionTitle: { fontSize: 18, fontWeight: '700' },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  rangeChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: 20, borderWidth: 1,
  },
  rangeChipText: { fontSize: 13, fontWeight: '700' },
  rangeDropdown: {
    position: 'absolute', right: 0, top: 34, zIndex: 100,
    borderRadius: 12, borderWidth: 1,
    minWidth: 120, overflow: 'hidden',
    shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 8, shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  rangeDropdownItem: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 14, paddingVertical: 11,
  },
  rangeDropdownText: { fontSize: 14 },
  categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 20 },
  categoryCard: {
    width: '47.5%', borderRadius: 14, padding: 12, borderWidth: 1, gap: 4,
  },
  catIconWrap: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  catEmoji: { fontSize: 20 },
  catLabel: { fontSize: 12 },
  catScore: { fontSize: 20, fontWeight: '800' },
  catBar: { height: 5, borderRadius: 3, overflow: 'hidden', flexDirection: 'row', marginTop: 4 },
  catBarSeg: { height: 5 },
  historyCard: { borderRadius: 14, borderWidth: 1, overflow: 'hidden', marginBottom: 16 },
  historyRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1,
  },
  historyDate: { fontSize: 15 },
  manageBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderRadius: 14, padding: 16, borderWidth: 1,
  },
  manageBtnText: { flex: 1, fontSize: 15, fontWeight: '600' },
});
