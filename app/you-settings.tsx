import { ScrollView, Text, View, Pressable, StyleSheet, Switch, Platform, ActivityIndicator, TextInput, Share, Alert } from "react-native";
import { WheelTimePicker } from "@/components/wheel-time-picker";
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

import * as WebBrowser from "expo-web-browser";
import { VoicePickerSection } from "@/components/voice-picker-section";
import { useIsCalm } from "@/components/calm-effects";


// ─── Jack Alarm Device Pairing Section ─────────────────────────────────────
function DevicePairingSection({ colors }: { colors: ReturnType<typeof import('@/hooks/use-colors').useColors> }) {
  const router = useRouter();
  const devicesQuery = trpc.devices.list.useQuery();
  const createTokenMutation = trpc.devices.createPairingToken.useMutation();
  const removeDeviceMutation = trpc.devices.remove.useMutation({
    onSuccess: () => devicesQuery.refetch(),
  });
  const [pairingToken, setPairingToken] = useState<string | null>(null);
  const [tokenExpiry, setTokenExpiry] = useState<Date | null>(null);
  const [showPairingFlow, setShowPairingFlow] = useState(false);
  const [copied, setCopied] = useState(false);

  async function handleGenerateToken() {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const result = await createTokenMutation.mutateAsync();
      setPairingToken(result.token);
      setTokenExpiry(new Date(result.expiresAt));
      setShowPairingFlow(true);
    } catch (err) {
      Alert.alert('Error', 'Could not generate pairing token. Please try again.');
    }
  }

  async function handleCopyToken() {
    if (!pairingToken) return;
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      await Share.share({ message: pairingToken, title: 'Jack Alarm Pairing Token' });
    } catch { /* user cancelled share */ }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleRemoveDevice(deviceId: number) {
    if (Platform.OS === 'web') {
      // Alert.alert callbacks are unreliable on web — use native confirm instead
      if (window.confirm('Unlink this Jack Alarm from your account? The display will stop receiving your alarms.')) {
        removeDeviceMutation.mutate({ deviceId });
      }
      return;
    }
    Alert.alert(
      'Remove Device',
      'Unlink this Jack Alarm from your account? The display will stop receiving your alarms.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => removeDeviceMutation.mutate({ deviceId }),
        },
      ]
    );
  }

  const devices = devicesQuery.data ?? [];

  return (
    <View style={[{ borderRadius: 16, borderWidth: 1, overflow: 'hidden', marginBottom: 12, marginTop: 20, backgroundColor: colors.surface, borderColor: colors.border }]}>
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 16 }}>
        <View style={{ width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary + '22' }}>
          <IconSymbol name="desktopcomputer" size={18} color={colors.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 16, fontWeight: '700', color: colors.foreground }}>Jack Alarm</Text>
          <Text style={{ fontSize: 12, color: colors.muted, marginTop: 1 }}>Connect your Jack Alarm display</Text>
        </View>
        {devicesQuery.isLoading && <ActivityIndicator size="small" color={colors.muted} />}
      </View>

      {/* Linked devices list */}
      {devices.length > 0 && (
        <View style={{ borderTopWidth: 1, borderTopColor: colors.border }}>
          {devices.map((device, idx) => (
            <View
              key={device.id}
              style={[{
                flexDirection: 'row', alignItems: 'center', gap: 12,
                paddingHorizontal: 16, paddingVertical: 12,
                borderTopWidth: idx > 0 ? 1 : 0, borderTopColor: colors.border,
              }]}
            >
              <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: device.lastSeenAt && (Date.now() - new Date(device.lastSeenAt).getTime()) < 10 * 60 * 1000 ? '#22C55E' : colors.muted }} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontWeight: '600', color: colors.foreground }}>Jack Alarm</Text>
                <Text style={{ fontSize: 11, color: colors.muted, marginTop: 1 }}>
                  {device.lastSeenAt ? `Last seen ${new Date(device.lastSeenAt).toLocaleString()}` : 'Never connected'}
                </Text>
              </View>
              <Pressable
                onPress={() => handleRemoveDevice(device.id)}
                style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1, padding: 6 })}
              >
                <IconSymbol name="xmark.circle.fill" size={20} color={colors.error ?? '#EF4444'} />
              </Pressable>
            </View>
          ))}
        </View>
      )}

      {/* Single-device note */}
      {devices.length > 0 && !showPairingFlow && (
        <View style={{ borderTopWidth: 1, borderTopColor: colors.border, paddingHorizontal: 16, paddingVertical: 10 }}>
          <Text style={{ fontSize: 12, color: colors.muted, textAlign: 'center' }}>
            Only one Jack Alarm can be connected at a time. Remove the current device to pair a new one.
          </Text>
        </View>
      )}
      {/* Pairing flow */}
      {showPairingFlow && pairingToken ? (
        <View style={{ borderTopWidth: 1, borderTopColor: colors.border, padding: 16, gap: 12 }}>
          <Text style={{ fontSize: 14, fontWeight: '700', color: colors.foreground }}>Step 1 — Copy this token:</Text>
          <Pressable
            onPress={handleCopyToken}
            style={({ pressed }) => [{
              flexDirection: 'row', alignItems: 'center', gap: 10,
              backgroundColor: colors.background, borderRadius: 10,
              borderWidth: 1, borderColor: colors.border,
              padding: 12, opacity: pressed ? 0.7 : 1,
            }]}
          >
            <Text style={{ flex: 1, fontSize: 15, fontWeight: '700', color: colors.primary, fontVariant: ['tabular-nums'], letterSpacing: 1 }}>
              {pairingToken}
            </Text>
            <IconSymbol name={copied ? 'checkmark.circle.fill' : 'doc.on.doc'} size={20} color={copied ? '#22C55E' : colors.muted} />
          </Pressable>
          <Text style={{ fontSize: 13, color: colors.muted, lineHeight: 18 }}>
            Step 2 — On your Jack Alarm, go to <Text style={{ fontWeight: '700', color: colors.foreground }}>Settings → Pair with App</Text> and enter this token.
          </Text>
          {tokenExpiry && (
            <Text style={{ fontSize: 11, color: colors.muted }}>
              Token expires at {tokenExpiry.toLocaleTimeString()}
            </Text>
          )}
          <Pressable
            onPress={() => { setShowPairingFlow(false); setPairingToken(null); devicesQuery.refetch(); }}
            style={({ pressed }) => [{
              alignItems: 'center', paddingVertical: 10, borderRadius: 10,
              backgroundColor: colors.primary + '18', opacity: pressed ? 0.7 : 1,
            }]}
          >
            <Text style={{ fontSize: 14, fontWeight: '600', color: colors.primary }}>Done — Close</Text>
          </Pressable>
        </View>
      ) : devices.length === 0 ? (
        <Pressable
          onPress={handleGenerateToken}
          disabled={createTokenMutation.isPending}
          style={({ pressed }) => [{
            flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
            borderTopWidth: 1, borderTopColor: colors.border,
            paddingVertical: 14, paddingHorizontal: 16,
            opacity: pressed ? 0.7 : 1,
          }]}
        >
          {createTokenMutation.isPending
            ? <ActivityIndicator size="small" color={colors.primary} />
            : <IconSymbol name="antenna.radiowaves.left.and.right" size={18} color={colors.primary} />
          }
          <Text style={{ fontSize: 15, fontWeight: '600', color: colors.primary }}>Pair Jack Alarm</Text>
        </Pressable>
      ) : null}
      {/* Preview Jack Alarm display button */}
      <Pressable
        onPress={() => router.push('/crowpanel-preview' as never)}
        style={({ pressed }) => [{
          flexDirection: 'row', alignItems: 'center', gap: 10,
          borderTopWidth: 1, borderTopColor: colors.border,
          paddingHorizontal: 16, paddingVertical: 13,
          opacity: pressed ? 0.7 : 1,
        }]}
      >
        <View style={{ width: 32, height: 32, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary + '18' }}>
          <IconSymbol name="desktopcomputer" size={16} color={colors.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 14, fontWeight: '700', color: colors.foreground }}>Preview Display UI</Text>
          <Text style={{ fontSize: 11, color: colors.muted, marginTop: 1 }}>See the 800×480 alarm &amp; check-in screens</Text>
        </View>
        <IconSymbol name="chevron.right" size={14} color={colors.muted} />
      </Pressable>
    </View>
  );
}

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
    id: "dark",
    label: "Dark",
    preview: "#000000",
    description: "True black",
  },
  {
    id: "light",
    label: "Light",
    preview: "#FFFFFF",
    description: "Pure white",
  },
  {
    id: "airy",
    label: "Airy",
    preview: "#F5F0F7",
    description: "Dreamy",
  },
];

export default function YouSettingsScreen() {
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
  const [dangerZoneExpanded, setDangerZoneExpanded] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [soundId, setSoundId] = useState(alarm.soundId ?? 'classic');
  const [meditationId, setMeditationId] = useState<string | undefined>(alarm.meditationId);
  const [requireCheckin, setRequireCheckin] = useState(alarm.requireCheckin ?? false);
  const [snoozeMinutes, setSnoozeMinutes] = useState(alarm.snoozeMinutes ?? 10);
  const [previewingId, setPreviewingId] = useState<string | null>(null);
  const [practiceDurations, setPracticeDurations] = useState<Record<string, number>>(
    alarm.practiceDurations ?? { priming: 15, meditation: 10, breathwork: 10, visualization: 10, journaling: 10 }
  );


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
    setPracticeDurations(alarm.practiceDurations ?? { priming: 15, meditation: 10, breathwork: 10, visualization: 10, journaling: 10 });
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
    await updateAlarm({ ...alarm, hour, minute, days, isEnabled: enabled, soundId, meditationId, practiceDurations, requireCheckin, snoozeMinutes });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <ScreenContainer>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={maxWidth ? { maxWidth, alignSelf: 'center', width: '100%' } : undefined}>
        {/* Header */}
        <View style={[styles.header, { flexDirection: 'row', alignItems: 'center', gap: 12 }]}>
          <Pressable
            onPress={() => router.back()}
            style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1, padding: 4 })}
          >
            <IconSymbol name="chevron.left" size={24} color={colors.foreground} />
          </Pressable>
          <Text style={[styles.title, { color: colors.foreground, flex: 1 }]}>Settings</Text>
        </View>


        {/* Appearance — condensed inline color dots */}
        <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border, marginTop: 20 }]}>
          <View style={[styles.sectionHeader, { paddingVertical: 14 }]}>
            <View style={[styles.sectionIconWrap, { backgroundColor: colors.primary + '22' }]}>
              <IconSymbol name="sparkles" size={18} color={colors.primary} />
            </View>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Appearance</Text>
            <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
              {THEMES.map((theme) => {
                const isActive = appTheme === theme.id;
                return (
                  <Pressable
                    key={theme.id}
                    onPress={() => {
                      if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setAppTheme(theme.id);
                    }}
                    style={({ pressed }) => [{ alignItems: 'center', gap: 3, opacity: pressed ? 0.7 : 1 }]}
                  >
                    <View style={[{
                      width: 26,
                      height: 26,
                      borderRadius: 13,
                      backgroundColor: theme.preview,
                      borderWidth: isActive ? 2.5 : 1.5,
                      borderColor: isActive ? colors.primary : colors.border,
                    }]} />
                    <Text style={{ fontSize: 10, fontWeight: isActive ? '700' : '500', color: isActive ? colors.primary : colors.muted }}>
                      {theme.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
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
              onPress={() => {
                if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                router.push('/settings/blocked-users');
              }}
              style={({ pressed }) => [
                styles.manageHabitsBtn,
                { borderTopColor: colors.border, opacity: pressed ? 0.7 : 1 },
              ]}
            >
              <Text style={[styles.manageHabitsBtnText, { color: colors.foreground }]}>Blocked Users</Text>
              <IconSymbol name="chevron.right" size={16} color={colors.muted} />
            </Pressable>
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

        {/* Danger Zone — hidden by default, required by Apple App Store guidelines */}
        {user && (
          <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border, marginTop: 12 }]}>
            <Pressable
              onPress={() => setDangerZoneExpanded(v => !v)}
              style={({ pressed }) => [styles.sectionHeader, { opacity: pressed ? 0.7 : 1 }]}
            >
              <Text style={{ fontSize: 13, color: '#EF4444', fontWeight: '600' }}>
                {dangerZoneExpanded ? '▲ Hide danger zone' : '▼ Danger zone'}
              </Text>
            </Pressable>
            {dangerZoneExpanded && (
              <View style={[styles.section, { backgroundColor: '#FEF2F2', borderColor: '#FCA5A5', marginTop: 0 }]}>
                <View style={[styles.sectionHeader, { backgroundColor: '#FEE2E2' }]}>
                  <Text style={{ fontSize: 18 }}>⚠️</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 15, fontWeight: '700', color: '#991B1B' }}>Delete Account & All Data</Text>
                    <Text style={{ fontSize: 12, color: '#B91C1C', marginTop: 2, lineHeight: 17 }}>
                      This permanently deletes your account, all habits, goals, check-ins, and progress. This action cannot be undone.
                    </Text>
                  </View>
                </View>
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
                      borderColor: deleteConfirmText.trim().toUpperCase() === 'DELETE' ? '#EF4444' : '#FCA5A5',
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
                <Pressable
                  disabled={deleteConfirmText.trim().toUpperCase() !== 'DELETE' || isDeleting}
                  onPress={async () => {
                    if (deleteConfirmText.trim().toUpperCase() !== 'DELETE') return;
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
                    backgroundColor: deleteConfirmText.trim().toUpperCase() === 'DELETE' ? '#EF4444' : '#FCA5A5',
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

        {/* Global Voice Picker */}
        <VoicePickerSection />

        {/* Jack Alarm Device Pairing */}
        {isAuthenticated && (
          <DevicePairingSection colors={colors} />
        )}

        {/* Panel Settings */}
        {isAuthenticated && (
          <Pressable
            onPress={() => router.push('/panel-settings' as never)}
            style={({ pressed }) => [{
              flexDirection: 'row', alignItems: 'center', gap: 12,
              backgroundColor: colors.surface,
              borderRadius: 16, borderWidth: 1, borderColor: colors.border,
              padding: 16, marginBottom: 12, opacity: pressed ? 0.8 : 1,
            }]}
          >
            <View style={{ width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary + '22' }}>
              <IconSymbol name="gearshape.fill" size={18} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 15, fontWeight: '700', color: colors.foreground }}>Panel Settings</Text>
              <Text style={{ fontSize: 12, color: colors.muted, marginTop: 1 }}>Audio, voice, Low EMF mode</Text>
            </View>
            <IconSymbol name="chevron.right" size={18} color={colors.muted} />
          </Pressable>
        )}

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
  wheelPickerSection: { paddingVertical: 16, paddingHorizontal: 16, borderTopWidth: 1, alignItems: 'center' },
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
  previewBtn: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, borderWidth: 1, minWidth: 64, alignItems: 'center', justifyContent: 'center' },
  durationChipRow: { paddingHorizontal: 16, paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth, gap: 8 },
  durationChipLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5, marginBottom: 4 },
  durationChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
