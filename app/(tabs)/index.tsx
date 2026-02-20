import { ScrollView, Text, View, Pressable, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { useApp } from "@/lib/app-context";
import { useColors } from "@/hooks/use-colors";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { formatAlarmTime } from "@/lib/notifications";
import { yesterdayString, toDateString } from "@/lib/storage";
import * as Haptics from "expo-haptics";
import { Platform } from "react-native";

const CATEGORY_META = {
  health: { label: 'Health', icon: 'figure.walk' as const, colorKey: 'health' },
  relationships: { label: 'Relationships', icon: 'person.2.fill' as const, colorKey: 'relationships' },
  wealth: { label: 'Wealth', icon: 'dollarsign.circle.fill' as const, colorKey: 'wealth' },
  mindset: { label: 'Mindset', icon: 'brain.head.profile' as const, colorKey: 'mindset' },
} as const;

export default function TodayScreen() {
  const { alarm, isPendingCheckIn, getCategoryRate, streak, isLoaded } = useApp();
  const colors = useColors();
  const router = useRouter();

  const yesterday = yesterdayString();
  const today = toDateString();

  const categories = Object.entries(CATEGORY_META) as [keyof typeof CATEGORY_META, typeof CATEGORY_META[keyof typeof CATEGORY_META]][];

  function handleCheckIn() {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push('/checkin' as never);
  }

  if (!isLoaded) {
    return (
      <ScreenContainer>
        <View style={styles.center}>
          <Text style={[styles.loadingText, { color: colors.muted }]}>Loading…</Text>
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={[styles.greeting, { color: colors.foreground }]}>
            {getGreeting()}
          </Text>
          <Text style={[styles.dateText, { color: colors.muted }]}>
            {formatDate(new Date())}
          </Text>
        </View>

        {/* Check-In Banner */}
        {isPendingCheckIn ? (
          <Pressable
            onPress={handleCheckIn}
            style={({ pressed }) => [
              styles.checkInBanner,
              { backgroundColor: colors.primary, opacity: pressed ? 0.88 : 1 },
            ]}
          >
            <View style={styles.checkInBannerInner}>
              <View>
                <Text style={styles.checkInTitle}>Yesterday's Check-In</Text>
                <Text style={styles.checkInSubtitle}>
                  How did {formatShortDate(new Date(yesterday + 'T12:00:00'))} go?
                </Text>
              </View>
              <View style={styles.checkInArrow}>
                <IconSymbol name="arrow.right" size={20} color="#fff" />
              </View>
            </View>
          </Pressable>
        ) : (
          <View style={[styles.doneCard, { backgroundColor: colors.success + '22', borderColor: colors.success + '44' }]}>
            <IconSymbol name="checkmark.circle.fill" size={22} color={colors.success} />
            <Text style={[styles.doneText, { color: colors.success }]}>
              Yesterday's check-in complete!
            </Text>
          </View>
        )}

        {/* Alarm Status */}
        <View style={[styles.alarmCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.alarmRow}>
            <View style={[styles.alarmIconWrap, { backgroundColor: alarm.isEnabled ? colors.primary + '22' : colors.muted + '22' }]}>
              <IconSymbol name="bell.fill" size={20} color={alarm.isEnabled ? colors.primary : colors.muted} />
            </View>
            <View style={styles.alarmInfo}>
              <Text style={[styles.alarmLabel, { color: colors.muted }]}>Daily Alarm</Text>
              <Text style={[styles.alarmTime, { color: colors.foreground }]}>
                {alarm.isEnabled
                  ? formatAlarmTime(alarm.hour, alarm.minute)
                  : 'Not set'}
              </Text>
            </View>
            <Pressable
              onPress={() => router.push('/(tabs)/settings' as never)}
              style={({ pressed }) => [styles.alarmEdit, { opacity: pressed ? 0.6 : 1 }]}
            >
              <Text style={[styles.alarmEditText, { color: colors.primary }]}>Edit</Text>
            </Pressable>
          </View>
        </View>

        {/* Streak */}
        {streak > 0 && (
          <View style={[styles.streakCard, { backgroundColor: '#FF6B3522', borderColor: '#FF6B3544' }]}>
            <IconSymbol name="flame.fill" size={22} color="#FF6B35" />
            <Text style={[styles.streakText, { color: '#FF6B35' }]}>
              {streak} day streak — keep it up!
            </Text>
          </View>
        )}

        {/* Category Scores */}
        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
          7-Day Progress
        </Text>
        <View style={styles.categoryGrid}>
          {categories.map(([key, meta]) => {
            const rate = getCategoryRate(key, 7);
            const catColor = (colors as Record<string, string>)[meta.colorKey] ?? colors.primary;
            return (
              <View
                key={key}
                style={[styles.categoryCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
              >
                <View style={[styles.categoryIconWrap, { backgroundColor: catColor + '22' }]}>
                  <IconSymbol name={meta.icon} size={22} color={catColor} />
                </View>
                <Text style={[styles.categoryLabel, { color: colors.muted }]}>{meta.label}</Text>
                <Text style={[styles.categoryScore, { color: colors.foreground }]}>
                  {Math.round(rate * 100)}%
                </Text>
                {/* Progress bar */}
                <View style={[styles.progressBarBg, { backgroundColor: colors.border }]}>
                  <View
                    style={[
                      styles.progressBarFill,
                      { width: `${Math.round(rate * 100)}%` as any, backgroundColor: catColor },
                    ]}
                  />
                </View>
              </View>
            );
          })}
        </View>

        {/* Quick actions */}
        <View style={styles.quickActions}>
          <Pressable
            onPress={() => router.push('/habits' as never)}
            style={({ pressed }) => [
              styles.quickBtn,
              { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
            ]}
          >
            <IconSymbol name="list.bullet" size={18} color={colors.primary} />
            <Text style={[styles.quickBtnText, { color: colors.foreground }]}>Manage Habits</Text>
          </Pressable>
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function formatDate(d: Date): string {
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

function formatShortDate(d: Date): string {
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

const styles = StyleSheet.create({
  scroll: { padding: 20, paddingBottom: 40 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loadingText: { fontSize: 16 },
  header: { marginBottom: 20 },
  greeting: { fontSize: 28, fontWeight: '700', letterSpacing: -0.5 },
  dateText: { fontSize: 14, marginTop: 2 },
  checkInBanner: {
    borderRadius: 16,
    padding: 18,
    marginBottom: 14,
  },
  checkInBannerInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  checkInTitle: { color: '#fff', fontSize: 17, fontWeight: '700' },
  checkInSubtitle: { color: 'rgba(255,255,255,0.8)', fontSize: 13, marginTop: 2 },
  checkInArrow: {
    width: 36, height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center', justifyContent: 'center',
  },
  doneCard: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderRadius: 12, padding: 14, marginBottom: 14,
    borderWidth: 1,
  },
  doneText: { fontSize: 14, fontWeight: '600' },
  alarmCard: {
    borderRadius: 14, padding: 14, marginBottom: 14,
    borderWidth: 1,
  },
  alarmRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  alarmIconWrap: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  alarmInfo: { flex: 1 },
  alarmLabel: { fontSize: 12, fontWeight: '500' },
  alarmTime: { fontSize: 18, fontWeight: '700', marginTop: 1 },
  alarmEdit: { paddingHorizontal: 8, paddingVertical: 4 },
  alarmEditText: { fontSize: 14, fontWeight: '600' },
  streakCard: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderRadius: 12, padding: 14, marginBottom: 20,
    borderWidth: 1,
  },
  streakText: { fontSize: 14, fontWeight: '600' },
  sectionTitle: { fontSize: 18, fontWeight: '700', marginBottom: 12 },
  categoryGrid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 20,
  },
  categoryCard: {
    width: '47%',
    borderRadius: 14, padding: 14,
    borderWidth: 1,
  },
  categoryIconWrap: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  categoryLabel: { fontSize: 12, fontWeight: '500', marginBottom: 2 },
  categoryScore: { fontSize: 22, fontWeight: '700', marginBottom: 8 },
  progressBarBg: { height: 4, borderRadius: 2, overflow: 'hidden' },
  progressBarFill: { height: 4, borderRadius: 2 },
  quickActions: { gap: 10 },
  quickBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderRadius: 12, padding: 14, borderWidth: 1,
  },
  quickBtnText: { fontSize: 15, fontWeight: '600' },
});
