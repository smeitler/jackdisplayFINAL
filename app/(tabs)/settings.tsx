import { ScrollView, Text, View, Pressable, StyleSheet, Switch, Platform } from "react-native";
import { useState, useEffect } from "react";
import { useRouter } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { useApp } from "@/lib/app-context";
import { useColors } from "@/hooks/use-colors";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { DAY_LABELS, formatAlarmTime } from "@/lib/notifications";
import * as Haptics from "expo-haptics";
import { useAuth } from "@/hooks/use-auth";
import { useThemeContext } from "@/lib/theme-provider";
import { type AppTheme } from "@/constants/theme";
import { clearLocalData } from "@/lib/storage";

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const MINUTES = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];

const THEMES: { id: AppTheme; label: string; preview: string; description: string }[] = [
  {
    id: "purple",
    label: "Purple",
    preview: "#7B74FF",
    description: "Dark navy",
  },
  {
    id: "white",
    label: "White",
    preview: "#FFFFFF",
    description: "Pure white",
  },
  {
    id: "black",
    label: "Black",
    preview: "#000000",
    description: "True black",
  },
  {
    id: "punk",
    label: "Punk",
    preview: "#FF00FF",
    description: "Cyberpunk",
  },
  {
    id: "valley",
    label: "Valley",
    preview: "#4ADE80",
    description: "Momentum",
  },
  {
    id: "airy",
    label: "Airy",
    preview: "#C084A8",
    description: "Dreamy",
  },
  {
    id: "nova",
    label: "Nova ✨",
    preview: "#A855F7",
    description: "Galaxy",
  },
];

export default function SettingsScreen() {
  const { alarm, updateAlarm, activeHabits } = useApp();
  const colors = useColors();
  const router = useRouter();
  const { user, isAuthenticated, logout } = useAuth();
  const { appTheme, setAppTheme } = useThemeContext();

  const [hour, setHour] = useState(alarm.hour);
  const [minute, setMinute] = useState(alarm.minute);
  const [days, setDays] = useState<number[]>(alarm.days);
  const [enabled, setEnabled] = useState(alarm.isEnabled);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Sync if alarm changes externally
  useEffect(() => {
    setHour(alarm.hour);
    setMinute(alarm.minute);
    setDays(alarm.days);
    setEnabled(alarm.isEnabled);
  }, [alarm]);

  function toggleDay(day: number) {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );
  }

  async function handleSave() {
    if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setSaving(true);
    await updateAlarm({ ...alarm, hour, minute, days, isEnabled: enabled });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  function formatHour(h: number): string {
    const period = h >= 12 ? 'PM' : 'AM';
    const display = h % 12 === 0 ? 12 : h % 12;
    return `${display} ${period}`;
  }

  return (
    <ScreenContainer>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.foreground }]}>More</Text>
        </View>

        {/* Appearance section */}
        <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.sectionHeader}>
            <View style={[styles.sectionIconWrap, { backgroundColor: colors.primary + '22' }]}>
              <IconSymbol name="sparkles" size={18} color={colors.primary} />
            </View>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Appearance</Text>
          </View>
          <View style={[styles.themeRow, { borderTopColor: colors.border }]}>
            {THEMES.map((theme) => {
              const isActive = appTheme === theme.id;
              return (
                <Pressable
                  key={theme.id}
                  onPress={() => {
                    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setAppTheme(theme.id);
                  }}
                  style={({ pressed }) => [
                    styles.themeOption,
                    {
                      borderColor: isActive ? colors.primary : colors.border,
                      backgroundColor: isActive ? colors.primary + '15' : colors.background,
                      opacity: pressed ? 0.7 : 1,
                    },
                  ]}
                >
                  {/* Color swatch */}
                  <View
                    style={[
                      styles.themeSwatch,
                      {
                        backgroundColor: theme.preview,
                        borderColor: isActive ? colors.primary : colors.border,
                      },
                    ]}
                  />
                  <Text
                    style={[
                      styles.themeLabel,
                      { color: isActive ? colors.primary : colors.foreground },
                    ]}
                  >
                    {theme.label}
                  </Text>
                  {isActive && (
                    <IconSymbol name="checkmark" size={12} color={colors.primary} />
                  )}
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* Alarm section */}
        <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.sectionHeader}>
            <View style={[styles.sectionIconWrap, { backgroundColor: colors.primary + '22' }]}>
              <IconSymbol name="bell.fill" size={18} color={colors.primary} />
            </View>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Daily Alarm</Text>
            <Switch
              value={enabled}
              onValueChange={(v) => {
                if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                setEnabled(v);
              }}
              trackColor={{ false: colors.border, true: colors.primary }}
              thumbColor="#fff"
            />
          </View>

          {enabled && (
            <>
              {/* Time display */}
              <View style={[styles.timeDisplay, { borderTopColor: colors.border }]}>
                <Text style={[styles.timeDisplayText, { color: colors.foreground }]}>
                  {formatAlarmTime(hour, minute)}
                </Text>
              </View>

              {/* Hour picker */}
              <View style={[styles.pickerSection, { borderTopColor: colors.border }]}>
                <Text style={[styles.pickerLabel, { color: colors.muted }]}>Hour</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.pickerRow}
                >
                  {HOURS.map((h) => (
                    <Pressable
                      key={h}
                      onPress={() => setHour(h)}
                      style={({ pressed }) => [
                        styles.pickerItem,
                        hour === h && { backgroundColor: colors.primary },
                        { opacity: pressed ? 0.7 : 1 },
                      ]}
                    >
                      <Text style={[
                        styles.pickerItemText,
                        { color: hour === h ? '#fff' : colors.foreground },
                      ]}>
                        {formatHour(h)}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>

              {/* Minute picker */}
              <View style={[styles.pickerSection, { borderTopColor: colors.border }]}>
                <Text style={[styles.pickerLabel, { color: colors.muted }]}>Minute</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.pickerRow}
                >
                  {MINUTES.map((m) => (
                    <Pressable
                      key={m}
                      onPress={() => setMinute(m)}
                      style={({ pressed }) => [
                        styles.pickerItem,
                        minute === m && { backgroundColor: colors.primary },
                        { opacity: pressed ? 0.7 : 1 },
                      ]}
                    >
                      <Text style={[
                        styles.pickerItemText,
                        { color: minute === m ? '#fff' : colors.foreground },
                      ]}>
                        :{m.toString().padStart(2, '0')}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>

              {/* Day picker */}
              <View style={[styles.pickerSection, { borderTopColor: colors.border }]}>
                <Text style={[styles.pickerLabel, { color: colors.muted }]}>Days</Text>
                <View style={styles.daysRow}>
                  {DAY_LABELS.map((label, idx) => {
                    const isSelected = days.includes(idx);
                    return (
                      <Pressable
                        key={idx}
                        onPress={() => toggleDay(idx)}
                        style={({ pressed }) => [
                          styles.dayBtn,
                          isSelected && { backgroundColor: colors.primary },
                          !isSelected && { borderColor: colors.border, borderWidth: 1 },
                          { opacity: pressed ? 0.7 : 1 },
                        ]}
                      >
                        <Text style={[
                          styles.dayBtnText,
                          { color: isSelected ? '#fff' : colors.muted },
                        ]}>
                          {label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            </>
          )}
        </View>

        {/* Save button */}
        <Pressable
          onPress={handleSave}
          disabled={saving}
          style={({ pressed }) => [
            styles.saveBtn,
            { backgroundColor: saved ? colors.success : colors.primary, transform: [{ scale: pressed ? 0.97 : 1 }] },
          ]}
        >
          <IconSymbol
            name={saved ? "checkmark.circle.fill" : "bell.fill"}
            size={18}
            color="#fff"
          />
          <Text style={styles.saveBtnText}>
            {saving ? 'Saving…' : saved ? 'Alarm Saved!' : 'Save Alarm'}
          </Text>
        </Pressable>

        {/* Habits section */}
        <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border, marginTop: 20 }]}>
          <View style={styles.sectionHeader}>
            <View style={[styles.sectionIconWrap, { backgroundColor: colors.primary + '22' }]}>
              <IconSymbol name="list.bullet" size={18} color={colors.primary} />
            </View>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Habits</Text>
            <Text style={[styles.habitCountBadge, { color: colors.muted }]}>
              {activeHabits.length} active
            </Text>
          </View>
          <Pressable
            onPress={() => router.push('/habits' as never)}
            style={({ pressed }) => [
              styles.manageHabitsBtn,
              { borderTopColor: colors.border, opacity: pressed ? 0.7 : 1 },
            ]}
          >
            <Text style={[styles.manageHabitsBtnText, { color: colors.primary }]}>
              Manage Habits
            </Text>
            <IconSymbol name="chevron.right" size={16} color={colors.muted} />
          </Pressable>
        </View>

        {/* Account section */}
        {isAuthenticated && (
          <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border, marginTop: 20 }]}>
            <View style={styles.sectionHeader}>
              <View style={[styles.sectionIconWrap, { backgroundColor: colors.primary + '22' }]}>
                <IconSymbol name="person.fill" size={18} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Account</Text>
                {user?.email && (
                  <Text style={[{ fontSize: 12, color: colors.muted }]}>{user.email}</Text>
                )}
              </View>
            </View>
            <Pressable
              onPress={async () => {
                if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                // Clear all local user data so the next account starts fresh
                await clearLocalData();
                await logout();
                router.replace('/login');
              }}
              style={({ pressed }) => [
                styles.manageHabitsBtn,
                { borderTopColor: colors.border, opacity: pressed ? 0.7 : 1 },
              ]}
            >
              <Text style={[styles.manageHabitsBtnText, { color: '#EF4444' }]}>Sign Out</Text>
              <IconSymbol name="chevron.right" size={16} color={colors.muted} />
            </Pressable>
          </View>
        )}

        {/* Info */}
        <View style={[styles.infoCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <IconSymbol name="info.circle" size={18} color={colors.muted} />
          <Text style={[styles.infoText, { color: colors.muted }]}>
            When the alarm fires, open the app to check off what you accomplished the previous day.
          </Text>
        </View>

        <View style={{ height: 30 }} />
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: 20, paddingBottom: 40 },
  header: { marginBottom: 20 },
  title: { fontSize: 28, fontWeight: '700', letterSpacing: -0.5 },
  section: { borderRadius: 16, borderWidth: 1, overflow: 'hidden', marginBottom: 12 },
  sectionHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    padding: 16,
  },
  sectionIconWrap: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  sectionTitle: { flex: 1, fontSize: 16, fontWeight: '700' },
  // Theme selector
  themeRow: {
    flexDirection: 'row', gap: 10, padding: 16, borderTopWidth: 1,
  },
  themeOption: {
    flex: 1, alignItems: 'center', gap: 6,
    paddingVertical: 12, paddingHorizontal: 8,
    borderRadius: 12, borderWidth: 1.5,
  },
  themeSwatch: {
    width: 32, height: 32, borderRadius: 16, borderWidth: 1,
  },
  themeLabel: {
    fontSize: 13, fontWeight: '600',
  },
  // Alarm
  timeDisplay: { alignItems: 'center', paddingVertical: 16, borderTopWidth: 1 },
  timeDisplayText: { fontSize: 42, fontWeight: '700', letterSpacing: -1 },
  pickerSection: { paddingVertical: 12, paddingHorizontal: 16, borderTopWidth: 1 },
  pickerLabel: { fontSize: 12, fontWeight: '600', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  pickerRow: { gap: 8, paddingRight: 8 },
  pickerItem: {
    paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: 10, backgroundColor: 'transparent',
  },
  pickerItemText: { fontSize: 14, fontWeight: '600' },
  daysRow: { flexDirection: 'row', gap: 6 },
  dayBtn: {
    flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center',
  },
  dayBtnText: { fontSize: 12, fontWeight: '700' },
  saveBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    borderRadius: 14, paddingVertical: 16,
  },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  habitCountBadge: { fontSize: 13 },
  manageHabitsBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14, borderTopWidth: 1,
  },
  manageHabitsBtnText: { fontSize: 15, fontWeight: '600' },
  infoCard: {
    flexDirection: 'row', gap: 10, alignItems: 'flex-start',
    borderRadius: 12, padding: 14, borderWidth: 1, marginTop: 8,
  },
  infoText: { flex: 1, fontSize: 13, lineHeight: 19 },
});
