import { ScrollView, Text, View, Pressable, StyleSheet, Switch, Platform } from "react-native";
import { useContentMaxWidth } from "@/hooks/use-is-ipad";
import { useState, useEffect, useRef } from "react";
import { useAudioPlayer, setAudioModeAsync } from "expo-audio";
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

const ALARM_SOUNDS: { id: string; label: string; emoji: string; source: ReturnType<typeof require> }[] = [
  { id: 'classic',  label: 'Classic',  emoji: '⏰', source: require('@/assets/audio/alarm_classic.mp3') },
  { id: 'buzzer',   label: 'Buzzer',   emoji: '📢', source: require('@/assets/audio/alarm_buzzer.wav') },
  { id: 'digital',  label: 'Digital',  emoji: '📱', source: require('@/assets/audio/alarm_digital.wav') },
  { id: 'gentle',   label: 'Gentle',   emoji: '🔔', source: require('@/assets/audio/alarm_gentle.wav') },
  { id: 'urgent',   label: 'Urgent',   emoji: '🚨', source: require('@/assets/audio/alarm_urgent.wav') },
];

const MEDITATION_OPTIONS: { id: string; label: string; emoji: string; description: string; source: string | ReturnType<typeof require> }[] = [
  { id: 'bowl',      label: 'Singing Bowl',   emoji: '🎵', description: '432 Hz tone, 30 sec',           source: 'https://d2xsxph8kpxj0f.cloudfront.net/310519663287248938/bFcyWdAL5JXed3bpyDvBEf/meditation_bowl_c8bd7151.wav' },
  { id: 'breathing', label: 'Box Breathing',  emoji: '🌬️', description: 'Inhale · Hold · Exhale, 30 sec', source: 'https://d2xsxph8kpxj0f.cloudfront.net/310519663287248938/bFcyWdAL5JXed3bpyDvBEf/meditation_breathing_fd1069a2.wav' },
  { id: 'focus',     label: 'Focus Tones',    emoji: '🧠', description: 'Binaural beats, 30 sec',          source: 'https://d2xsxph8kpxj0f.cloudfront.net/310519663287248938/bFcyWdAL5JXed3bpyDvBEf/meditation_focus_782acd2b.wav' },
];

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
  const { alarm, updateAlarm, activeHabits, isDemoMode, exitDemo } = useApp();
  const colors = useColors();
  const router = useRouter();
  const { user, isAuthenticated, logout } = useAuth();
  const { appTheme, setAppTheme } = useThemeContext();
  const maxWidth = useContentMaxWidth();

  const [hour, setHour] = useState(alarm.hour);
  const [minute, setMinute] = useState(alarm.minute);
  const [days, setDays] = useState<number[]>(alarm.days);
  const [enabled, setEnabled] = useState(alarm.isEnabled);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [appearanceExpanded, setAppearanceExpanded] = useState(false);
  const [soundId, setSoundId] = useState(alarm.soundId ?? 'classic');
  const [meditationId, setMeditationId] = useState<string | undefined>(alarm.meditationId);
  const [previewingId, setPreviewingId] = useState<string | null>(null);

  // Determine which source to preview
  const previewSource = previewingId
    ? (ALARM_SOUNDS.find(s => s.id === previewingId)?.source ??
       MEDITATION_OPTIONS.find(m => m.id === previewingId)?.source ?? null)
    : null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const previewPlayer = useAudioPlayer((previewSource ?? ALARM_SOUNDS[0].source) as any);

  // Stop preview after 3 seconds
  const previewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function playPreview(id: string, source: ReturnType<typeof require>) {
    if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
    if (previewingId === id) {
      // Toggle off
      previewPlayer.pause();
      setPreviewingId(null);
      return;
    }
    setPreviewingId(id);
    setAudioModeAsync({ playsInSilentMode: true }).catch(() => {});
    previewPlayer.seekTo(0);
    previewPlayer.play();
    previewTimerRef.current = setTimeout(() => {
      previewPlayer.pause();
      setPreviewingId(null);
    }, 4000);
  }

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
      previewPlayer.pause();
    };
  }, []);

  // Sync if alarm changes externally
  useEffect(() => {
    setHour(alarm.hour);
    setMinute(alarm.minute);
    setDays(alarm.days);
    setEnabled(alarm.isEnabled);
    setSoundId(alarm.soundId ?? 'classic');
    setMeditationId(alarm.meditationId);
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
    await updateAlarm({ ...alarm, hour, minute, days, isEnabled: enabled, soundId, meditationId });
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
        <View style={maxWidth ? { maxWidth, alignSelf: 'center', width: '100%' } : undefined}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.foreground }]}>More</Text>
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

              {/* Alarm Sound Picker */}
              <View style={[styles.pickerSection, { borderTopColor: colors.border }]}>
                <View style={styles.soundPickerHeader}>
                  <IconSymbol name="music.note" size={14} color={colors.muted} />
                  <Text style={[styles.pickerLabel, { color: colors.muted, marginBottom: 0 }]}>Alarm Sound</Text>
                </View>
                <View style={[styles.soundGrid, { marginTop: 10 }]}>
                  {ALARM_SOUNDS.map((sound) => {
                    const isSelected = soundId === sound.id;
                    const isPreviewing = previewingId === sound.id;
                    return (
                      <Pressable
                        key={sound.id}
                        onPress={() => {
                          if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                          setSoundId(sound.id);
                          playPreview(sound.id, sound.source);
                        }}
                        style={({ pressed }) => [
                          styles.soundOption,
                          isSelected && { borderColor: colors.primary, backgroundColor: colors.primary + '18' },
                          !isSelected && { borderColor: colors.border, backgroundColor: colors.surface },
                          { opacity: pressed ? 0.7 : 1 },
                        ]}
                      >
                        <Text style={styles.soundEmoji}>{isPreviewing ? '🔊' : sound.emoji}</Text>
                        <Text style={[styles.soundLabel, { color: isSelected ? colors.primary : colors.foreground }]}>
                          {sound.label}
                        </Text>
                        {isSelected && <IconSymbol name="checkmark" size={12} color={colors.primary} />}
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              {/* Guided Meditation Picker */}
              <View style={[styles.pickerSection, { borderTopColor: colors.border }]}>
                <View style={styles.soundPickerHeader}>
                  <IconSymbol name="moon.stars.fill" size={14} color={colors.muted} />
                  <Text style={[styles.pickerLabel, { color: colors.muted, marginBottom: 0 }]}>After Alarm Meditation</Text>
                </View>
                <Text style={[styles.meditationSubtitle, { color: colors.muted }]}>
                  Plays after you open the app and submit your check-in
                </Text>
                {/* None option */}
                <Pressable
                  onPress={() => {
                    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setMeditationId(undefined);
                  }}
                  style={({ pressed }) => [
                    styles.meditationOption,
                    { borderColor: !meditationId ? colors.primary : colors.border,
                      backgroundColor: !meditationId ? colors.primary + '18' : colors.surface,
                      opacity: pressed ? 0.7 : 1,
                      marginTop: 10,
                    },
                  ]}
                >
                  <Text style={styles.soundEmoji}>🚫</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.meditationLabel, { color: !meditationId ? colors.primary : colors.foreground }]}>None</Text>
                    <Text style={[styles.meditationDesc, { color: colors.muted }]}>Skip meditation</Text>
                  </View>
                  {!meditationId && <IconSymbol name="checkmark" size={14} color={colors.primary} />}
                </Pressable>
                {MEDITATION_OPTIONS.map((med) => {
                  const isSelected = meditationId === med.id;
                  const isPreviewing = previewingId === med.id;
                  return (
                    <Pressable
                      key={med.id}
                      onPress={() => {
                        if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        setMeditationId(med.id);
                        playPreview(med.id, med.source);
                      }}
                      style={({ pressed }) => [
                        styles.meditationOption,
                        isSelected && { borderColor: colors.primary, backgroundColor: colors.primary + '18' },
                        !isSelected && { borderColor: colors.border, backgroundColor: colors.surface },
                        { opacity: pressed ? 0.7 : 1, marginTop: 8 },
                      ]}
                    >
                      <Text style={styles.soundEmoji}>{isPreviewing ? '🔊' : med.emoji}</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.meditationLabel, { color: isSelected ? colors.primary : colors.foreground }]}>
                          {med.label}
                        </Text>
                        <Text style={[styles.meditationDesc, { color: colors.muted }]}>{med.description}</Text>
                      </View>
                      {isSelected && <IconSymbol name="checkmark" size={14} color={colors.primary} />}
                    </Pressable>
                  );
                })}
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

        {/* Appearance section — collapsible */}
        <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border, marginTop: 20 }]}>
          <Pressable
            onPress={() => {
              if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setAppearanceExpanded((v) => !v);
            }}
            style={({ pressed }) => [styles.sectionHeader, { opacity: pressed ? 0.7 : 1 }]}
          >
            <View style={[styles.sectionIconWrap, { backgroundColor: colors.primary + '22' }]}>
              <IconSymbol name="sparkles" size={18} color={colors.primary} />
            </View>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Appearance</Text>
            {/* Active theme preview swatch */}
            <View style={[styles.activeSwatchSmall, { backgroundColor: THEMES.find(t => t.id === appTheme)?.preview ?? colors.primary, borderColor: colors.border }]} />
            <Text style={[{ fontSize: 13, color: colors.muted, marginRight: 4 }]}>
              {THEMES.find(t => t.id === appTheme)?.label ?? ''}
            </Text>
            <IconSymbol name={appearanceExpanded ? 'chevron.up' : 'chevron.down'} size={16} color={colors.muted} />
          </Pressable>
          {appearanceExpanded && (
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
          )}
        </View>

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

        {/* Demo Mode banner + Exit button */}
        {isDemoMode && (
          <View style={[styles.demoCard, { backgroundColor: '#F59E0B18', borderColor: '#F59E0B' }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <Text style={{ fontSize: 18 }}>🎭</Text>
              <Text style={[styles.sectionTitle, { color: '#F59E0B', flex: 1 }]}>Demo Mode</Text>
            </View>
            <Text style={[{ fontSize: 13, color: colors.muted, lineHeight: 18, marginBottom: 14 }]}>
              You're exploring a demo with sample data. Sign in to save your own goals and habits.
            </Text>
            <Pressable
              onPress={async () => {
                if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                await exitDemo();
                router.replace('/login');
              }}
              style={({ pressed }) => [{
                backgroundColor: '#F59E0B',
                borderRadius: 12,
                paddingVertical: 12,
                alignItems: 'center' as const,
                opacity: pressed ? 0.8 : 1,
              }]}
            >
              <Text style={{ color: '#fff', fontSize: 15, fontWeight: '700' }}>Exit Demo & Sign In</Text>
            </Pressable>
          </View>
        )}

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
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: 20, paddingBottom: 40 },
  demoCard: { borderRadius: 16, borderWidth: 1.5, padding: 16, marginTop: 20 },
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
    flexDirection: 'row', flexWrap: 'wrap', gap: 10, padding: 16, borderTopWidth: 1,
  },
  themeOption: {
    width: '47%', alignItems: 'center', gap: 8,
    paddingVertical: 14, paddingHorizontal: 10,
    borderRadius: 14, borderWidth: 1.5,
  },
  themeSwatch: {
    width: 36, height: 36, borderRadius: 18, borderWidth: 1,
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
  activeSwatchSmall: { width: 16, height: 16, borderRadius: 8, borderWidth: 1, marginRight: 4 },
  // Sound picker
  soundPickerHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 },
  soundGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  soundOption: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 9,
    borderRadius: 12, borderWidth: 1.5,
    minWidth: '30%',
  },
  soundEmoji: { fontSize: 16 },
  soundLabel: { fontSize: 13, fontWeight: '600', flex: 1 },
  // Meditation picker
  meditationSubtitle: { fontSize: 12, lineHeight: 16, marginTop: 4, marginBottom: 2 },
  meditationOption: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    padding: 12, borderRadius: 12, borderWidth: 1.5,
  },
  meditationLabel: { fontSize: 14, fontWeight: '600' },
  meditationDesc: { fontSize: 12, marginTop: 1 },
});
