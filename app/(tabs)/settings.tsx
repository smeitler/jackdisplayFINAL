import { ScrollView, Text, View, Pressable, StyleSheet, Switch, Platform, ActivityIndicator, TextInput } from "react-native";
import { useContentMaxWidth } from "@/hooks/use-is-ipad";
import { useState, useEffect, useRef } from "react";
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from "expo-audio";
import { useRouter } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { useApp } from "@/lib/app-context";
import { useColors } from "@/hooks/use-colors";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { DAY_LABELS, formatAlarmTime } from "@/lib/notifications";
import * as Haptics from "expo-haptics";
import { useAuth } from "@/hooks/use-auth";
import * as Auth from "@/lib/_core/auth";
import { useThemeContext } from "@/lib/theme-provider";
import { type AppTheme } from "@/constants/theme";
import { clearLocalData } from "@/lib/storage";
import { trpc } from "@/lib/trpc";
import { Alert } from "react-native";
import * as WebBrowser from "expo-web-browser";

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const MINUTES = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];

const ALARM_SOUNDS: { id: string; label: string; emoji: string; source: ReturnType<typeof require> }[] = [
  { id: 'classic',  label: 'Classic',  emoji: '⏰', source: require('@/assets/audio/alarm_classic.mp3') },
  { id: 'buzzer',   label: 'Buzzer',   emoji: '📢', source: require('@/assets/audio/alarm_buzzer.wav') },
  { id: 'digital',  label: 'Digital',  emoji: '📱', source: require('@/assets/audio/alarm_digital.wav') },
  { id: 'gentle',   label: 'Gentle',   emoji: '🔔', source: require('@/assets/audio/alarm_gentle.wav') },
  { id: 'urgent',   label: 'Urgent',   emoji: '🚨', source: require('@/assets/audio/alarm_urgent.wav') },
];

const MEDITATION_OPTIONS: { id: string; label: string; emoji: string; description: string; source: string | ReturnType<typeof require> | null }[] = [
  { id: 'priming',      label: 'Priming',           emoji: '🔥', description: 'Gratitude · Goals · Visualize', source: null },
  { id: 'meditation',   label: 'Guided Meditation', emoji: '🧘', description: 'Mindful awareness, 5 min',       source: 'https://d2xsxph8kpxj0f.cloudfront.net/310519663287248938/bFcyWdAL5JXed3bpyDvBEf/meditation_bowl_c8bd7151.wav' },
  { id: 'breathwork',   label: 'Breathwork',        emoji: '🌬️', description: 'Box breathing, 4-4-4-4',         source: 'https://d2xsxph8kpxj0f.cloudfront.net/310519663287248938/bFcyWdAL5JXed3bpyDvBEf/meditation_breathing_fd1069a2.wav' },
  { id: 'visualization',label: 'Visualizations',    emoji: '🎯', description: 'See your goals achieved',        source: 'https://d2xsxph8kpxj0f.cloudfront.net/310519663287248938/bFcyWdAL5JXed3bpyDvBEf/meditation_focus_782acd2b.wav' },
  { id: 'journaling',   label: 'Journaling',        emoji: '📓', description: 'Morning pages, free write',      source: null },
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
  const deleteAccountMutation = trpc.auth.deleteAccount.useMutation();
  const { appTheme, setAppTheme } = useThemeContext();
  const maxWidth = useContentMaxWidth();

  const [hour, setHour] = useState(alarm.hour);
  const [minute, setMinute] = useState(alarm.minute);
  const [days, setDays] = useState<number[]>(alarm.days);
  const [enabled, setEnabled] = useState(alarm.isEnabled);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [appearanceExpanded, setAppearanceExpanded] = useState(false);
  const [soundOpen, setSoundOpen] = useState(false);
  const [meditationOpen, setMeditationOpen] = useState(false);
  const [debugInfo, setDebugInfo] = useState<string | null>(null);
  const [debugLoading, setDebugLoading] = useState(false);
  const [dangerZoneExpanded, setDangerZoneExpanded] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  async function runDiagnostics() {
    setDebugLoading(true);
    setDebugInfo(null);
    try {
      const lines: string[] = [];
      // 1. Session token
      const token = await Auth.getSessionToken();
      lines.push(`Token: ${token ? token.substring(0, 30) + '...' : 'MISSING'}`);
      // 2. Cached user
      const cachedUser = await Auth.getUserInfo();
      lines.push(`Cached user: ${cachedUser ? `id=${cachedUser.id} openId=${cachedUser.openId?.substring(0,20)}` : 'NONE'}`);
      // 3. Ping server
      const apiBase = 'https://api.jackalarm.com';
      try {
        const pingResp = await fetch(`${apiBase}/api/auth/me`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        const pingData = await pingResp.json();
        lines.push(`/api/auth/me status: ${pingResp.status}`);
        lines.push(`Server user: ${pingData?.user ? `id=${pingData.user.id}` : JSON.stringify(pingData).substring(0, 60)}`);
      } catch (e: any) {
        lines.push(`/api/auth/me error: ${e?.message}`);
      }
      // 4. Fetch habits from server
      if (token) {
        try {
          const habitsResp = await fetch(`${apiBase}/api/trpc/habits.list`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          const habitsData = await habitsResp.json();
          const habits = habitsData?.result?.data?.json;
          lines.push(`habits.list status: ${habitsResp.status}`);
          lines.push(`Habits count: ${Array.isArray(habits) ? habits.length : 'error: ' + JSON.stringify(habitsData).substring(0, 80)}`);
          if (Array.isArray(habits) && habits.length > 0) {
            lines.push(`First habit: ${habits[0]?.name}`);
          }
        } catch (e: any) {
          lines.push(`habits.list error: ${e?.message}`);
        }
      }
      setDebugInfo(lines.join('\n'));
    } catch (e: any) {
      setDebugInfo(`Error: ${e?.message}`);
    } finally {
      setDebugLoading(false);
    }
  }
  const [soundId, setSoundId] = useState(alarm.soundId ?? 'classic');
  const [meditationId, setMeditationId] = useState<string | undefined>(alarm.meditationId);
  const [requireCheckin, setRequireCheckin] = useState(alarm.requireCheckin ?? false);
  const [snoozeMinutes, setSnoozeMinutes] = useState(alarm.snoozeMinutes ?? 10);
  const [previewingId, setPreviewingId] = useState<string | null>(null);

  // Imperative player ref — created fresh each time, released when done
  const previewPlayerRef = useRef<AudioPlayer | null>(null);
  const previewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function stopPreview() {
    if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
    if (previewPlayerRef.current) {
      try { previewPlayerRef.current.pause(); } catch { /* ignore */ }
      try { previewPlayerRef.current.remove(); } catch { /* ignore */ }
      previewPlayerRef.current = null;
    }
    setPreviewingId(null);
  }

  function playPreview(id: string, source: string | ReturnType<typeof require> | null) {
    // Stop any existing preview first
    stopPreview();
    // If same id tapped again, just stop (toggle off)
    if (previewingId === id) return;
    // No audio source for this option (e.g. Priming, Journaling)
    if (!source) {
      setPreviewingId(id);
      return;
    }
    setPreviewingId(id);
    setAudioModeAsync({ playsInSilentMode: true }).catch(() => {});
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const player = createAudioPlayer(source as any);
      previewPlayerRef.current = player;
      player.play();
      previewTimerRef.current = setTimeout(() => {
        stopPreview();
      }, 4000);
    } catch (e) {
      console.warn('[Preview] Failed to create player:', e);
      setPreviewingId(null);
    }
  }

  // Cleanup on unmount
  useEffect(() => {
    return () => { stopPreview(); };
  }, []);

  // Sync if alarm changes externally
  useEffect(() => {
    setHour(alarm.hour);
    setMinute(alarm.minute);
    setDays(alarm.days);
    setEnabled(alarm.isEnabled);
    setSoundId(alarm.soundId ?? 'classic');
    setMeditationId(alarm.meditationId);
    setRequireCheckin(alarm.requireCheckin ?? false);
    setSnoozeMinutes(alarm.snoozeMinutes ?? 10);
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
    await updateAlarm({ ...alarm, hour, minute, days, isEnabled: enabled, soundId, meditationId, requireCheckin, snoozeMinutes });
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

              {/* Alarm Sound Picker — collapsible dropdown */}
              <Pressable
                onPress={() => {
                  if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setSoundOpen(v => !v);
                }}
                style={({ pressed }) => [styles.dropdownRow, { borderTopColor: colors.border, opacity: pressed ? 0.7 : 1 }]}
              >
                <IconSymbol name="music.note" size={16} color={colors.muted} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.dropdownRowLabel, { color: colors.muted }]}>Alarm Sound</Text>
                  <Text style={[styles.dropdownRowValue, { color: colors.foreground }]}>
                    {ALARM_SOUNDS.find(s => s.id === soundId)?.emoji ?? '⏰'}{' '}
                    {ALARM_SOUNDS.find(s => s.id === soundId)?.label ?? 'Classic'}
                  </Text>
                </View>
                <IconSymbol name={soundOpen ? 'chevron.up' : 'chevron.down'} size={14} color={colors.muted} />
              </Pressable>
              {soundOpen && (
                <View style={[styles.dropdownContent, { borderTopColor: colors.border }]}>
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
                          styles.dropdownItem,
                          isSelected && { backgroundColor: colors.primary + '18' },
                          { opacity: pressed ? 0.7 : 1 },
                        ]}
                      >
                        <Text style={styles.soundEmoji}>{isPreviewing ? '🔊' : sound.emoji}</Text>
                        <Text style={[styles.dropdownItemText, { color: isSelected ? colors.primary : colors.foreground, flex: 1 }]}>
                          {sound.label}
                        </Text>
                        {isSelected && <IconSymbol name="checkmark" size={14} color={colors.primary} />}
                      </Pressable>
                    );
                  })}
                </View>
              )}

              {/* Guided Meditation Picker — collapsible dropdown */}
              <Pressable
                onPress={() => {
                  if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setMeditationOpen(v => !v);
                }}
                style={({ pressed }) => [styles.dropdownRow, { borderTopColor: colors.border, opacity: pressed ? 0.7 : 1 }]}
              >
                <IconSymbol name="moon.stars.fill" size={16} color={colors.muted} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.dropdownRowLabel, { color: colors.muted }]}>After Alarm</Text>
                  <Text style={[styles.dropdownRowValue, { color: colors.foreground }]}>
                    {meditationId
                      ? `${MEDITATION_OPTIONS.find(m => m.id === meditationId)?.emoji ?? ''} ${MEDITATION_OPTIONS.find(m => m.id === meditationId)?.label ?? ''}`
                      : '🚫 None'}
                  </Text>
                </View>
                <IconSymbol name={meditationOpen ? 'chevron.up' : 'chevron.down'} size={14} color={colors.muted} />
              </Pressable>
              {meditationOpen && (
                <View style={[styles.dropdownContent, { borderTopColor: colors.border }]}>
                  {/* None option */}
                  <Pressable
                    onPress={() => {
                      if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setMeditationId(undefined);
                    }}
                    style={({ pressed }) => [
                      styles.dropdownItem,
                      !meditationId && { backgroundColor: colors.primary + '18' },
                      { opacity: pressed ? 0.7 : 1 },
                    ]}
                  >
                    <Text style={styles.soundEmoji}>🚫</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.dropdownItemText, { color: !meditationId ? colors.primary : colors.foreground }]}>None</Text>
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
                          playPreview(med.id, med.source ?? null);
                        }}
                        style={({ pressed }) => [
                          styles.dropdownItem,
                          isSelected && { backgroundColor: colors.primary + '18' },
                          { opacity: pressed ? 0.7 : 1 },
                        ]}
                      >
                        <Text style={styles.soundEmoji}>{isPreviewing ? '🔊' : med.emoji}</Text>
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.dropdownItemText, { color: isSelected ? colors.primary : colors.foreground }]}>
                            {med.label}
                          </Text>
                          <Text style={[styles.meditationDesc, { color: colors.muted }]}>{med.description}</Text>
                        </View>
                        {isSelected && <IconSymbol name="checkmark" size={14} color={colors.primary} />}
                      </Pressable>
                    );
                  })}
                </View>
              )}
              {/* Snooze interval picker */}
              <View style={[styles.dropdownRow, { borderTopColor: colors.border }]}>
                <IconSymbol name="clock.arrow.circlepath" size={16} color={colors.muted} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.dropdownRowLabel, { color: colors.muted }]}>Snooze Duration</Text>
                  <Text style={[{ fontSize: 11, color: colors.muted, marginTop: 1 }]}>
                    How long to snooze when alarm is dismissed
                  </Text>
                </View>
              </View>
              <View style={[{ borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, paddingHorizontal: 16, paddingVertical: 12 }]}>
                <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                  {[5, 10, 15, 20, 30].map((mins) => (
                    <Pressable
                      key={mins}
                      onPress={() => {
                        if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        setSnoozeMinutes(mins);
                      }}
                      style={({ pressed }) => [{
                        paddingHorizontal: 16,
                        paddingVertical: 8,
                        borderRadius: 20,
                        borderWidth: 1.5,
                        borderColor: snoozeMinutes === mins ? colors.primary : colors.border,
                        backgroundColor: snoozeMinutes === mins ? colors.primary + '18' : 'transparent',
                        opacity: pressed ? 0.7 : 1,
                      }]}
                    >
                      <Text style={[{ fontSize: 14, fontWeight: '700', color: snoozeMinutes === mins ? colors.primary : colors.muted }]}>
                        {mins} min
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>

              {/* Require check-in toggle */}
              <View style={[styles.dropdownRow, { borderTopColor: colors.border }]}>
                <IconSymbol name="lock.fill" size={16} color={colors.muted} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.dropdownRowLabel, { color: colors.muted }]}>Require Check-in to Unlock App</Text>
                  <Text style={[{ fontSize: 11, color: colors.muted, marginTop: 1 }]}>
                    Block app access until yesterday's check-in is complete
                  </Text>
                </View>
                <Switch
                  value={requireCheckin}
                  onValueChange={(v) => {
                    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                    setRequireCheckin(v);
                  }}
                  trackColor={{ false: colors.border, true: colors.primary }}
                  thumbColor="#fff"
                />
              </View>

              {/* Preview check-in button */}
              <Pressable
                onPress={() => router.push('/alarm-preview' as never)}
                style={({ pressed }) => [{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 8,
                  paddingHorizontal: 16,
                  paddingVertical: 12,
                  borderTopWidth: StyleSheet.hairlineWidth,
                  borderTopColor: colors.border,
                  opacity: pressed ? 0.7 : 1,
                }]}
              >
                <IconSymbol name="eye.fill" size={16} color={colors.primary} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.dropdownRowLabel, { color: colors.primary }]}>Preview Check-in Popup</Text>
                  <Text style={[{ fontSize: 11, color: colors.muted, marginTop: 1 }]}>
                    See exactly what appears when your alarm fires
                  </Text>
                </View>
                <IconSymbol name="chevron.right" size={14} color={colors.muted} />
              </Pressable>
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

        {/* Mind Dump */}
        <View style={[styles.section, { borderColor: colors.border }]}>
          <View style={styles.sectionHeader}>
            <View style={[styles.sectionIconWrap, { backgroundColor: '#7B74FF18' }]}>
              <IconSymbol name="brain" size={18} color="#7B74FF" />
            </View>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Mind Dump</Text>
            <Text style={[styles.habitCountBadge, { color: colors.muted }]}>Capture thoughts</Text>
          </View>
          <Pressable
            onPress={() => router.push('/mind-dump' as never)}
            style={({ pressed }) => [
              styles.manageHabitsBtn,
              { borderTopColor: colors.border, opacity: pressed ? 0.7 : 1 },
            ]}
          >
            <Text style={[styles.manageHabitsBtnText, { color: '#7B74FF' }]}>
              Open Mind Dump
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
                {user?.name && (
                  <Text style={{ fontSize: 13, color: colors.foreground, fontWeight: '500', marginBottom: 1 }}>{user.name}</Text>
                )}
                {user?.email && (
                  <Text style={{ fontSize: 12, color: colors.muted }}>{user.email}</Text>
                )}
              </View>
            </View>
            {/* Sign Out */}
            <Pressable
              onPress={async () => {
                if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
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

        {/* Danger Zone — hidden by default, required by Apple App Store guidelines */}
        {isAuthenticated && (
          <View style={{ marginTop: 4, marginBottom: 4 }}>
            <Pressable
              onPress={() => {
                setDangerZoneExpanded(v => !v);
                setDeleteConfirmText('');
              }}
              style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1, alignItems: 'center', paddingVertical: 8 })}
            >
              <Text style={{ fontSize: 11, color: colors.muted, letterSpacing: 0.5 }}>
                {dangerZoneExpanded ? '▲ Hide danger zone' : '▼ Danger zone'}
              </Text>
            </Pressable>

            {dangerZoneExpanded && (
              <View style={[styles.section, { backgroundColor: '#FEF2F2', borderColor: '#FCA5A5', marginTop: 0 }]}>
                {/* Warning header */}
                <View style={[styles.sectionHeader, { backgroundColor: '#FEE2E2' }]}>
                  <Text style={{ fontSize: 18 }}>⚠️</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 15, fontWeight: '700', color: '#991B1B' }}>Delete Account & All Data</Text>
                    <Text style={{ fontSize: 12, color: '#B91C1C', marginTop: 2, lineHeight: 17 }}>
                      This permanently deletes your account, all habits, goals, check-ins, and progress. This action cannot be undone.
                    </Text>
                  </View>
                </View>

                {/* Confirmation input */}
                <View style={{ padding: 16, borderTopWidth: 1, borderTopColor: '#FCA5A5' }}>
                  <Text style={{ fontSize: 13, color: '#7F1D1D', marginBottom: 8, fontWeight: '600' }}>
                    Type DELETE to confirm:
                  </Text>
                  <TextInput
                    value={deleteConfirmText}
                    onChangeText={setDeleteConfirmText}
                    placeholder="DELETE"
                    placeholderTextColor="#FCA5A5"
                    autoCapitalize="characters"
                    autoCorrect={false}
                    returnKeyType="done"
                    style={{
                      borderWidth: 1.5,
                      borderColor: deleteConfirmText === 'DELETE' ? '#EF4444' : '#FCA5A5',
                      borderRadius: 10,
                      paddingHorizontal: 14,
                      paddingVertical: 10,
                      fontSize: 15,
                      fontWeight: '700',
                      color: '#991B1B',
                      backgroundColor: '#FFF',
                      letterSpacing: 2,
                    }}
                  />
                </View>

                {/* Final delete button — only active when DELETE is typed */}
                <Pressable
                  disabled={deleteConfirmText !== 'DELETE' || isDeleting}
                  onPress={async () => {
                    if (deleteConfirmText !== 'DELETE') return;
                    try {
                      setIsDeleting(true);
                      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
                      await deleteAccountMutation.mutateAsync();
                      await Auth.removeSessionToken();
                      await Auth.clearUserInfo();
                      await clearLocalData();
                      router.replace('/login');
                    } catch (err) {
                      console.error('[DeleteAccount] Error:', err);
                      setIsDeleting(false);
                      Alert.alert('Error', 'Failed to delete account. Please try again.');
                    }
                  }}
                  style={({ pressed }) => ({
                    margin: 16,
                    marginTop: 0,
                    paddingVertical: 14,
                    borderRadius: 12,
                    alignItems: 'center',
                    backgroundColor: deleteConfirmText === 'DELETE' ? '#EF4444' : '#FCA5A5',
                    opacity: pressed ? 0.85 : 1,
                  })}
                >
                  {isDeleting ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>Permanently Delete My Account</Text>
                  )}
                </Pressable>
              </View>
            )}
          </View>
        )}

        {/* Debug Diagnostics Panel */}
        <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border, marginTop: 12 }]}>
          <View style={styles.sectionHeader}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>🔧 Diagnostics</Text>
            </View>
          </View>
          <Pressable
            onPress={runDiagnostics}
            disabled={debugLoading}
            style={({ pressed }) => [
              styles.manageHabitsBtn,
              { borderTopColor: colors.border, opacity: pressed || debugLoading ? 0.7 : 1 },
            ]}
          >
            {debugLoading ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <Text style={[styles.manageHabitsBtnText, { color: colors.primary }]}>Run Connection Test</Text>
            )}
            <IconSymbol name="chevron.right" size={16} color={colors.muted} />
          </Pressable>
          {debugInfo && (
            <View style={{ padding: 14, borderTopWidth: 1, borderTopColor: colors.border }}>
              <Text style={{ fontSize: 11, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', color: colors.foreground, lineHeight: 18 }}>
                {debugInfo}
              </Text>
            </View>
          )}
        </View>

        {/* Info */}
        <View style={[styles.infoCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <IconSymbol name="info.circle" size={18} color={colors.muted} />
          <Text style={[styles.infoText, { color: colors.muted }]}>
            When the alarm fires, open the app to check off what you accomplished the previous day.
          </Text>
        </View>

        {/* Privacy & Legal links — required for App Store */}
        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 20, marginTop: 8, marginBottom: 4 }}>
          <Pressable
            onPress={() => WebBrowser.openBrowserAsync('https://jackalarm.com/privacy')}
            style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
          >
            <Text style={{ fontSize: 12, color: colors.muted, textDecorationLine: 'underline' }}>Privacy Policy</Text>
          </Pressable>
          <Pressable
            onPress={() => WebBrowser.openBrowserAsync('https://jackalarm.com/terms')}
            style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
          >
            <Text style={{ fontSize: 12, color: colors.muted, textDecorationLine: 'underline' }}>Terms of Service</Text>
          </Pressable>
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
  // Sound picker (legacy, kept for soundEmoji)
  soundPickerHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 },
  soundGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  soundOption: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 9,
    borderRadius: 12, borderWidth: 1.5,
    minWidth: '30%',
  },
  soundEmoji: { fontSize: 18 },
  soundLabel: { fontSize: 13, fontWeight: '600', flex: 1 },
  // Meditation picker
  meditationSubtitle: { fontSize: 12, lineHeight: 16, marginTop: 4, marginBottom: 2 },
  meditationOption: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    padding: 12, borderRadius: 12, borderWidth: 1.5,
  },
  meditationLabel: { fontSize: 14, fontWeight: '600' },
  meditationDesc: { fontSize: 12, marginTop: 1 },
  // Dropdown rows
  dropdownRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: 1,
  },
  dropdownRowLabel: { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  dropdownRowValue: { fontSize: 15, fontWeight: '600', marginTop: 2 },
  dropdownContent: { borderTopWidth: StyleSheet.hairlineWidth, paddingVertical: 4 },
  dropdownItem: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingVertical: 12, borderRadius: 0,
  },
  dropdownItemText: { fontSize: 15, fontWeight: '500' },
});
