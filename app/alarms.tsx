/**
 * Alarms Screen — Dedicated full-screen alarm manager
 *
 * - Lists all alarms (up to 4) with toggle, time, days, label
 * - Add / Edit full-screen modal with WheelTimePicker (same as Settings)
 * - Ritual setup: Alarm Sound, After Alarm, Snooze Duration, Require Check-in
 * - Delete with confirmation
 * - Enforces MAX_ALARMS = 4 limit
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  Modal,
  TextInput,
  Switch,
  Platform,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/use-colors';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useApp } from '@/lib/app-context';
import { AlarmEntry, MAX_ALARMS, DEFAULT_ALARM } from '@/lib/storage';
import { scheduleAlarm, cancelAlarm, DAY_LABELS, formatAlarmTime } from '@/lib/notifications';
import { WheelTimePicker } from '@/components/wheel-time-picker';
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import * as Haptics from 'expo-haptics';

// ─── Constants ────────────────────────────────────────────────────────────────

const DAY_SHORT = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const DAY_MAP   = [0, 1, 2, 3, 4, 5, 6];

const ALARM_SOUNDS: { id: string; label: string; emoji: string; source: ReturnType<typeof require> }[] = [
  { id: 'classic',  label: 'Classic',  emoji: '⏰', source: require('@/assets/audio/alarm_classic.mp3') },
  { id: 'buzzer',   label: 'Buzzer',   emoji: '📢', source: require('@/assets/audio/alarm_buzzer.wav') },
  { id: 'digital',  label: 'Digital',  emoji: '📱', source: require('@/assets/audio/alarm_digital.wav') },
  { id: 'gentle',   label: 'Gentle',   emoji: '🔔', source: require('@/assets/audio/alarm_gentle.wav') },
  { id: 'urgent',   label: 'Urgent',   emoji: '🚨', source: require('@/assets/audio/alarm_urgent.wav') },
];

const MEDITATION_OPTIONS: { id: string; label: string; emoji: string; description: string; source: string | ReturnType<typeof require> | null }[] = [
  { id: 'priming',       label: 'Priming',           emoji: '🔥', description: 'Gratitude · Goals · Visualize', source: null },
  { id: 'meditation',    label: 'Guided Meditation',  emoji: '🧘', description: 'Mindful awareness, 5 min',       source: 'https://d2xsxph8kpxj0f.cloudfront.net/310519663287248938/bFcyWdAL5JXed3bpyDvBEf/meditation_bowl_c8bd7151.wav' },
  { id: 'breathwork',    label: 'Breathwork',         emoji: '🌬️', description: 'Box breathing, 4-4-4-4',         source: 'https://d2xsxph8kpxj0f.cloudfront.net/310519663287248938/bFcyWdAL5JXed3bpyDvBEf/meditation_breathing_fd1069a2.wav' },
  { id: 'visualization', label: 'Visualizations',     emoji: '🎯', description: 'See your goals achieved',        source: 'https://d2xsxph8kpxj0f.cloudfront.net/310519663287248938/bFcyWdAL5JXed3bpyDvBEf/meditation_focus_782acd2b.wav' },
  { id: 'journaling',    label: 'Journaling',         emoji: '📓', description: 'Morning pages, free write',      source: null },
];

const ALARM_COLOR = '#3B82F6';

// Meditation tracks from the Meditate catalog (mirrors wellness-audio.tsx)
const MEDITATE_TRACKS: { id: string; title: string; artist: string; duration: string; outcome: string; url: string }[] = [
  { id: 'med-1', title: 'Meditation',         artist: 'FreeMusicForVideo', duration: '1:27', outcome: 'Quick 1-min reset',     url: 'https://cdn.pixabay.com/download/audio/2026/03/05/audio_37d75d2b63.mp3?filename=freemusicforvideo-meditation-495611.mp3' },
  { id: 'med-2', title: 'Peaceful Zen Garden', artist: 'Ambient Sounds',   duration: '3:00', outcome: 'Stop overthinking',      url: 'https://cdn.pixabay.com/download/audio/2022/02/22/audio_d1718ab41b.mp3?filename=please-calm-my-mind-125566.mp3' },
  { id: 'med-3', title: 'Deep Calm',           artist: 'Relaxation Music', duration: '2:30', outcome: 'Clear mental fog',       url: 'https://cdn.pixabay.com/download/audio/2024/11/04/audio_4956b4edd1.mp3?filename=meditation-music-432hz-deep-calm-mind-relaxation-276988.mp3' },
  { id: 'med-4', title: 'Morning Mindset',     artist: 'Mindful Start',    duration: '5:00', outcome: 'Start your day right',   url: 'https://cdn.pixabay.com/download/audio/2022/02/22/audio_d1718ab41b.mp3?filename=please-calm-my-mind-125566.mp3' },
  { id: 'med-5', title: 'Anxiety Release',     artist: 'Calm Mind',        duration: '8:00', outcome: 'Calm anxiety fast',      url: 'https://cdn.pixabay.com/download/audio/2024/11/04/audio_4956b4edd1.mp3?filename=meditation-music-432hz-deep-calm-mind-relaxation-276988.mp3' },
  { id: 'med-6', title: 'Body Scan',           artist: 'Deep Rest',        duration: '15:00', outcome: 'Full body relaxation',  url: 'https://cdn.pixabay.com/download/audio/2022/02/22/audio_d1718ab41b.mp3?filename=please-calm-my-mind-125566.mp3' },
  { id: 'med-7', title: 'Confidence Builder',  artist: 'Inner Power',      duration: '6:00', outcome: 'Build confidence',       url: 'https://cdn.pixabay.com/download/audio/2026/03/05/audio_37d75d2b63.mp3?filename=freemusicforvideo-meditation-495611.mp3' },
  { id: 'med-8', title: 'Anger Cooldown',      artist: 'Emotional Balance', duration: '4:00', outcome: 'Release anger',         url: 'https://cdn.pixabay.com/download/audio/2024/11/04/audio_4956b4edd1.mp3?filename=meditation-music-432hz-deep-calm-mind-relaxation-276988.mp3' },
];

const DEFAULT_MEDITATION_TRACK_ID = 'med-4'; // Morning Mindset

// ─── Add/Edit Full-Screen Modal ───────────────────────────────────────────────

function AlarmEditModal({
  visible,
  alarm,
  onSave,
  onDelete,
  onClose,
}: {
  visible: boolean;
  alarm: AlarmEntry | null;
  onSave: (entry: AlarmEntry) => void;
  onDelete?: (id: string) => void;
  onClose: () => void;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const isNew = !alarm;

  // Time state
  const [hour, setHour]     = useState(alarm?.hour ?? DEFAULT_ALARM.hour);
  const [minute, setMinute] = useState(alarm?.minute ?? DEFAULT_ALARM.minute);

  // Ritual state
  const [days, setDays]                   = useState<number[]>(alarm?.days ?? DEFAULT_ALARM.days);
  const [label, setLabel]                 = useState(alarm?.label ?? '');
  const [soundId, setSoundId]             = useState(alarm?.soundId ?? 'classic');
  const [meditationId, setMeditationId]   = useState<string | undefined>(alarm?.meditationId);
  const [meditationTrackId, setMeditationTrackId] = useState<string>(alarm?.meditationTrackId ?? DEFAULT_MEDITATION_TRACK_ID);
  const [trackPickerOpen, setTrackPickerOpen] = useState(false);
  const [requireCheckin, setRequireCheckin] = useState(alarm?.requireCheckin ?? false);
  const [snoozeMinutes, setSnoozeMinutes] = useState(alarm?.snoozeMinutes ?? 5);
  const [practiceDurations, setPracticeDurations] = useState<Record<string, number>>(
    alarm?.practiceDurations ?? { priming: 15, meditation: 10, breathwork: 10, visualization: 10, journaling: 10 }
  );

  // UI state
  const [soundOpen, setSoundOpen]         = useState(false);
  const [meditationOpen, setMeditationOpen] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [previewingId, setPreviewingId]   = useState<string | null>(null);

  const previewPlayerRef = useRef<AudioPlayer | null>(null);
  const previewTimerRef  = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Scroll lock — disabled while user is touching the time picker
  const [scrollEnabled, setScrollEnabled] = useState(true);
  const scrollViewRef = useRef<ScrollView>(null);

  // Re-sync when alarm changes
  useEffect(() => {
    if (!visible) return;
    setHour(alarm?.hour ?? DEFAULT_ALARM.hour);
    setMinute(alarm?.minute ?? DEFAULT_ALARM.minute);
    setDays(alarm?.days ?? DEFAULT_ALARM.days);
    setLabel(alarm?.label ?? '');
    setSoundId(alarm?.soundId ?? 'classic');
    setMeditationId(alarm?.meditationId);
    setMeditationTrackId(alarm?.meditationTrackId ?? DEFAULT_MEDITATION_TRACK_ID);
    setTrackPickerOpen(false);
    setRequireCheckin(alarm?.requireCheckin ?? false);
    setSnoozeMinutes(alarm?.snoozeMinutes ?? 5);
    setPracticeDurations(alarm?.practiceDurations ?? { priming: 15, meditation: 10, breathwork: 10, visualization: 10, journaling: 10 });
    setSoundOpen(false);
    setMeditationOpen(false);
    setShowDeleteConfirm(false);
    stopPreview();
  }, [visible, alarm?.id]);

  useEffect(() => {
    return () => { stopPreview(); };
  }, []);

  function stopPreview() {
    if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
    if (previewPlayerRef.current) {
      try { previewPlayerRef.current.pause(); } catch {}
      try { previewPlayerRef.current.remove(); } catch {}
      previewPlayerRef.current = null;
    }
    setPreviewingId(null);
  }

  function playPreview(id: string, source: string | ReturnType<typeof require> | null) {
    stopPreview();
    if (previewingId === id) return;
    if (!source) { setPreviewingId(id); return; }
    setPreviewingId(id);
    setAudioModeAsync({ playsInSilentMode: true }).catch(() => {});
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const player = createAudioPlayer(source as any);
      previewPlayerRef.current = player;
      player.play();
      previewTimerRef.current = setTimeout(() => { stopPreview(); }, 4000);
    } catch { setPreviewingId(null); }
  }

  function toggleDay(day: number) {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setDays((prev) => prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]);
  }

  function handleSave() {
    if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const entry: AlarmEntry = {
      ...(alarm ?? { ...DEFAULT_ALARM }),
      id: alarm?.id ?? `alarm_${Date.now()}`,
      hour,
      minute,
      days,
      label: label.trim() || undefined,
      isEnabled: true,
      soundId,
      meditationId,
      meditationTrackId: meditationId === 'meditation' ? meditationTrackId : undefined,
      requireCheckin,
      snoozeMinutes,
      practiceDurations,
      notificationIds: alarm?.notificationIds ?? [],
    };
    onSave(entry);
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[em.container, { backgroundColor: colors.background }]}>
        {/* Header */}
        <View style={[em.header, { paddingTop: Platform.OS === 'ios' ? 8 : insets.top + 8, borderBottomColor: colors.border }]}>
          <Pressable
            onPress={onClose}
            style={({ pressed }) => [em.cancelBtn, { opacity: pressed ? 0.6 : 1 }]}
          >
            <Text style={[em.cancelText, { color: colors.muted }]}>Cancel</Text>
          </Pressable>
          <Text style={[em.title, { color: colors.foreground }]}>
            {isNew ? 'New Alarm' : 'Edit Alarm'}
          </Text>
          <Pressable
            onPress={handleSave}
            style={({ pressed }) => [em.saveBtn, { backgroundColor: ALARM_COLOR, opacity: pressed ? 0.85 : 1 }]}
          >
            <Text style={em.saveBtnText}>{isNew ? 'Add' : 'Save'}</Text>
          </Pressable>
        </View>

        <ScrollView
          ref={scrollViewRef}
          contentContainerStyle={[em.scroll, { paddingBottom: insets.bottom + 40 }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="always"
          scrollEnabled={scrollEnabled}
        >
          {/* ── Time Picker ── */}
          <View style={[em.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View
              style={[em.wheelWrap, { borderBottomColor: colors.border }]}
              onTouchStart={() => setScrollEnabled(false)}
              onTouchEnd={() => setScrollEnabled(true)}
              onTouchCancel={() => setScrollEnabled(true)}
            >
              <WheelTimePicker
                hour={hour}
                minute={minute}
                onChange={(h, m) => { setHour(h); setMinute(m); }}
              />
            </View>

            {/* Day picker */}
            <View style={em.daySection}>
              <Text style={[em.sectionLabel, { color: colors.muted }]}>REPEAT</Text>
              <View style={em.daysRow}>
                {DAY_SHORT.map((d, i) => {
                  const dayNum = DAY_MAP[i];
                  const active = days.includes(dayNum);
                  return (
                    <Pressable
                      key={i}
                      onPress={() => toggleDay(dayNum)}
                      style={[em.dayBtn, {
                        backgroundColor: active ? ALARM_COLOR : colors.background,
                        borderColor: active ? ALARM_COLOR : colors.border,
                      }]}
                    >
                      <Text style={[em.dayBtnText, { color: active ? '#fff' : colors.muted }]}>{d}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {/* Snooze Duration — placed above label for quick access */}
            <View style={[em.labelSection, { borderTopColor: colors.border }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
                <IconSymbol name="clock.arrow.circlepath" size={14} color={colors.muted} />
                <Text style={[em.sectionLabel, { color: colors.muted, marginBottom: 0, marginLeft: 6 }]}>SNOOZE DURATION</Text>
              </View>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {[5, 10, 15, 20].map((mins) => (
                  <Pressable
                    key={mins}
                    onPress={() => {
                      if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setSnoozeMinutes(mins);
                    }}
                    style={({ pressed }) => [{
                      flex: 1, paddingVertical: 9, borderRadius: 10, borderWidth: 1.5, alignItems: 'center',
                      borderColor: snoozeMinutes === mins ? ALARM_COLOR : colors.border,
                      backgroundColor: snoozeMinutes === mins ? ALARM_COLOR + '18' : 'transparent',
                      opacity: pressed ? 0.7 : 1,
                    }]}
                  >
                    <Text style={{ fontSize: 13, fontWeight: '700', color: snoozeMinutes === mins ? ALARM_COLOR : colors.muted }}>
                      {mins} min
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            {/* Label */}
            <View style={[em.labelSection, { borderTopColor: colors.border }]}>
              <Text style={[em.sectionLabel, { color: colors.muted }]}>LABEL (OPTIONAL)</Text>
              <TextInput
                value={label}
                onChangeText={setLabel}
                placeholder="e.g. Morning, Gym, Evening"
                placeholderTextColor={colors.muted}
                maxLength={24}
                returnKeyType="done"
                style={[em.labelInput, { color: colors.foreground, backgroundColor: colors.background, borderColor: colors.border }]}
              />
            </View>
          </View>

          {/* ── Morning Ritual Sequence ── */}
          <Text style={[em.groupLabel, { color: colors.muted }]}>MORNING RITUAL SEQUENCE</Text>
          <Text style={[em.groupSubLabel, { color: colors.muted }]}>
            This is what happens step-by-step when your alarm goes off.
          </Text>

          {/* Step 1 — Alarm */}
          <View style={[em.section, { backgroundColor: colors.surface, borderColor: colors.border, marginBottom: 10 }]}>
            <View style={[em.stepHeader, { borderBottomColor: colors.border }]}>
              <View style={[em.stepBadge, { backgroundColor: ALARM_COLOR + '20' }]}>
                <Text style={[em.stepNum, { color: ALARM_COLOR }]}>1</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[em.stepTitle, { color: colors.foreground }]}>⏰ Alarm Rings</Text>
                <Text style={[em.stepDesc, { color: colors.muted }]}>
                  Your alarm fires at the set time. Hit Snooze to delay by {snoozeMinutes} min, or Wake Up to start your ritual.
                </Text>
              </View>
            </View>
            {/* Alarm Sound inline */}
            <Pressable
              onPress={() => {
                if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setSoundOpen(v => !v);
              }}
              style={({ pressed }) => [em.dropdownRow, { borderBottomColor: colors.border, borderBottomWidth: soundOpen ? StyleSheet.hairlineWidth : 0, opacity: pressed ? 0.7 : 1 }]}
            >
              <IconSymbol name="music.note" size={16} color={colors.muted} />
              <View style={{ flex: 1 }}>
                <Text style={[em.dropdownLabel, { color: colors.muted }]}>Alarm Sound</Text>
                <Text style={[em.dropdownValue, { color: colors.foreground }]}>
                  {ALARM_SOUNDS.find(s => s.id === soundId)?.emoji ?? '⏰'}{' '}
                  {ALARM_SOUNDS.find(s => s.id === soundId)?.label ?? 'Classic'}
                </Text>
              </View>
              <IconSymbol name={soundOpen ? 'chevron.up' : 'chevron.down'} size={14} color={colors.muted} />
            </Pressable>
            {soundOpen && (
              <View style={[em.dropdownContent, { borderBottomColor: colors.border, borderBottomWidth: 0 }]}>
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
                        em.dropdownItem,
                        isSelected && { backgroundColor: ALARM_COLOR + '18' },
                        { opacity: pressed ? 0.7 : 1 },
                      ]}
                    >
                      <Text style={em.itemEmoji}>{isPreviewing ? '🔊' : sound.emoji}</Text>
                      <Text style={[em.dropdownItemText, { color: isSelected ? ALARM_COLOR : colors.foreground, flex: 1 }]}>
                        {sound.label}
                      </Text>
                      {isSelected && <IconSymbol name="checkmark" size={14} color={ALARM_COLOR} />}
                    </Pressable>
                  );
                })}
              </View>
            )}
          </View>

          {/* Step 2 — Journal */}
          <View style={[em.section, { backgroundColor: colors.surface, borderColor: colors.border, marginBottom: 10 }]}>
            <View style={[em.stepHeader, { borderBottomColor: colors.border, borderBottomWidth: 0 }]}>
              <View style={[em.stepBadge, { backgroundColor: '#22C55E20' }]}>
                <Text style={[em.stepNum, { color: '#22C55E' }]}>2</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[em.stepTitle, { color: colors.foreground }]}>📓 Journal Check-in</Text>
                <Text style={[em.stepDesc, { color: colors.muted }]}>
                  If you already completed your journal the night before, this step is automatically skipped — no double entry.
                  {"\n"}If not, you’ll be prompted to do a quick morning entry.
                </Text>
              </View>
            </View>
          </View>

          {/* Step 3 — Ritual */}
          <View style={[em.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={[em.stepHeader, { borderBottomColor: colors.border }]}>
              <View style={[em.stepBadge, { backgroundColor: '#A78BFA20' }]}>
                <Text style={[em.stepNum, { color: '#A78BFA' }]}>3</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[em.stepTitle, { color: colors.foreground }]}>✨ Morning Ritual</Text>
                <Text style={[em.stepDesc, { color: colors.muted }]}>
                  After your journal, the app guides you through your chosen practice below.
                  {"\n"}Pick what you want to do each morning.
                </Text>
              </View>
            </View>
            {/* Ritual picker */}
            <Pressable
              onPress={() => {
                if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setMeditationOpen(v => !v);
              }}
              style={({ pressed }) => [em.dropdownRow, { borderBottomColor: colors.border, borderBottomWidth: meditationOpen ? StyleSheet.hairlineWidth : 0, opacity: pressed ? 0.7 : 1 }]}
            >
              <IconSymbol name="moon.stars.fill" size={16} color={colors.muted} />
              <View style={{ flex: 1 }}>
                <Text style={[em.dropdownLabel, { color: colors.muted }]}>Choose Practice</Text>
                <Text style={[em.dropdownValue, { color: colors.foreground }]}>
                  {meditationId
                    ? `${MEDITATION_OPTIONS.find(m => m.id === meditationId)?.emoji ?? ''} ${MEDITATION_OPTIONS.find(m => m.id === meditationId)?.label ?? ''}`
                    : '🚫 None — skip this step'}
                </Text>
              </View>
              <IconSymbol name={meditationOpen ? 'chevron.up' : 'chevron.down'} size={14} color={colors.muted} />
            </Pressable>
            {meditationOpen && (
              <View style={[em.dropdownContent, { borderBottomColor: colors.border, borderBottomWidth: 0 }]}>
                <Pressable
                  onPress={() => {
                    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setMeditationId(undefined);
                  }}
                  style={({ pressed }) => [
                    em.dropdownItem,
                    !meditationId && { backgroundColor: ALARM_COLOR + '18' },
                    { opacity: pressed ? 0.7 : 1 },
                  ]}
                >
                  <Text style={em.itemEmoji}>🚫</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={[em.dropdownItemText, { color: !meditationId ? ALARM_COLOR : colors.foreground }]}>None</Text>
                    <Text style={[em.meditationDesc, { color: colors.muted }]}>Skip this step entirely</Text>
                  </View>
                  {!meditationId && <IconSymbol name="checkmark" size={14} color={ALARM_COLOR} />}
                </Pressable>
                {MEDITATION_OPTIONS.map((med) => {
                  const isSelected = meditationId === med.id;
                  const isPreviewing = previewingId === med.id;
                  const hasDuration = med.id !== 'journaling' && med.id !== 'none';
                  const currentDuration = practiceDurations[med.id] ?? 10;
                  return (
                    <View key={med.id}>
                      <Pressable
                        onPress={() => {
                          if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                          setMeditationId(med.id);
                          playPreview(med.id, med.source ?? null);
                        }}
                        style={({ pressed }) => [
                          em.dropdownItem,
                          isSelected && { backgroundColor: ALARM_COLOR + '18' },
                          { opacity: pressed ? 0.7 : 1 },
                        ]}
                      >
                        <Text style={em.itemEmoji}>{isPreviewing ? '🔊' : med.emoji}</Text>
                        <View style={{ flex: 1 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <Text style={[em.dropdownItemText, { color: isSelected ? ALARM_COLOR : colors.foreground }]}>
                              {med.label}
                            </Text>
                            {med.id === 'priming' && (
                              <View style={{ backgroundColor: '#F59E0B22', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}>
                                <Text style={{ fontSize: 10, fontWeight: '700', color: '#F59E0B', letterSpacing: 0.4 }}>RECOMMENDED</Text>
                              </View>
                            )}
                          </View>
                          <Text style={[em.meditationDesc, { color: colors.muted }]}>
                            {hasDuration ? `${currentDuration} min · ${med.description.split(',').slice(1).join(',').trim() || med.description}` : med.description}
                          </Text>
                        </View>
                        {isSelected && <IconSymbol name="checkmark" size={14} color={ALARM_COLOR} />}
                      </Pressable>
                      {/* Track picker for Guided Meditation */}
                      {isSelected && med.id === 'meditation' && (
                        <View style={[em.durationChipRow, { borderTopColor: colors.border }]}>
                          <Text style={[em.durationChipLabel, { color: colors.muted }]}>Track</Text>
                          <Pressable
                            onPress={() => {
                              if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                              setTrackPickerOpen(v => !v);
                            }}
                            style={({ pressed }) => [{
                              flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6,
                              paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10,
                              borderWidth: 1.5, borderColor: ALARM_COLOR,
                              backgroundColor: ALARM_COLOR + '12',
                              opacity: pressed ? 0.7 : 1,
                            }]}
                          >
                            <Text style={{ flex: 1, fontSize: 13, fontWeight: '600', color: ALARM_COLOR }}>
                              {MEDITATE_TRACKS.find(t => t.id === meditationTrackId)?.title ?? 'Morning Mindset'}
                            </Text>
                            <Text style={{ fontSize: 11, color: colors.muted }}>
                              {MEDITATE_TRACKS.find(t => t.id === meditationTrackId)?.duration ?? '5:00'}
                            </Text>
                            <IconSymbol name={trackPickerOpen ? 'chevron.up' : 'chevron.down'} size={12} color={ALARM_COLOR} />
                          </Pressable>
                        </View>
                      )}
                      {/* Expanded track list */}
                      {isSelected && med.id === 'meditation' && trackPickerOpen && (
                        <View style={[{ borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}>
                          {MEDITATE_TRACKS.map((track) => {
                            const isTrackSelected = meditationTrackId === track.id;
                            return (
                              <Pressable
                                key={track.id}
                                onPress={() => {
                                  if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                  setMeditationTrackId(track.id);
                                  setTrackPickerOpen(false);
                                  playPreview(track.id, track.url);
                                }}
                                style={({ pressed }) => [{
                                  flexDirection: 'row', alignItems: 'center', gap: 10,
                                  paddingHorizontal: 16, paddingVertical: 10,
                                  backgroundColor: isTrackSelected ? ALARM_COLOR + '12' : 'transparent',
                                  opacity: pressed ? 0.7 : 1,
                                }]}
                              >
                                <Text style={{ fontSize: 13 }}>{previewingId === track.id ? '🔊' : '🎵'}</Text>
                                <View style={{ flex: 1 }}>
                                  <Text style={{ fontSize: 13, fontWeight: '600', color: isTrackSelected ? ALARM_COLOR : colors.foreground }}>
                                    {track.title}
                                  </Text>
                                  <Text style={{ fontSize: 11, color: colors.muted }}>{track.outcome} · {track.duration}</Text>
                                </View>
                                {isTrackSelected && <IconSymbol name="checkmark" size={14} color={ALARM_COLOR} />}
                              </Pressable>
                            );
                          })}
                        </View>
                      )}
                      {isSelected && hasDuration && med.id !== 'meditation' && (
                        <View style={[em.durationChipRow, { borderTopColor: colors.border }]}>
                          <Text style={[em.durationChipLabel, { color: colors.muted }]}>Duration</Text>
                          <View style={em.durationChips}>
                            {[5, 10, 15, 20].map((mins) => (
                              <Pressable
                                key={mins}
                                onPress={() => {
                                  if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                  setPracticeDurations(prev => ({ ...prev, [med.id]: mins }));
                                }}
                                style={({ pressed }) => [{
                                  paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1.5,
                                  borderColor: currentDuration === mins ? ALARM_COLOR : colors.border,
                                  backgroundColor: currentDuration === mins ? ALARM_COLOR + '18' : 'transparent',
                                  opacity: pressed ? 0.7 : 1,
                                }]}
                              >
                                <Text style={{ fontSize: 13, fontWeight: '700', color: currentDuration === mins ? ALARM_COLOR : colors.muted }}>
                                  {mins} min
                                </Text>
                              </Pressable>
                            ))}
                          </View>
                        </View>
                      )}
                    </View>
                  );
                })}
              </View>
            )}
            {/* Require Check-in toggle inside Step 3 */}
            <View style={[em.dropdownRow, { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: 0 }]}>
              <IconSymbol name="lock.fill" size={16} color={colors.muted} />
              <View style={{ flex: 1 }}>
                <Text style={[em.dropdownLabel, { color: colors.muted }]}>Require Check-in to Dismiss</Text>
                <Text style={[{ fontSize: 11, color: colors.muted, marginTop: 1 }]}>
                  Must complete journal before the alarm screen closes
                </Text>
              </View>
              <Switch
                value={requireCheckin}
                onValueChange={(v) => {
                  if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  setRequireCheckin(v);
                }}
                trackColor={{ false: colors.border, true: ALARM_COLOR }}
                thumbColor="#fff"
              />
            </View>
          </View>

          {/* ── Delete ── */}
          {!isNew && (
            <View style={em.deleteSection}>
              {!showDeleteConfirm ? (
                <Pressable
                  onPress={() => setShowDeleteConfirm(true)}
                  style={({ pressed }) => [em.deleteBtn, { opacity: pressed ? 0.7 : 1 }]}
                >
                  <Text style={[em.deleteBtnText, { color: colors.error ?? '#EF4444' }]}>Delete Alarm</Text>
                </Pressable>
              ) : (
                <View style={em.confirmRow}>
                  <Text style={[em.confirmText, { color: colors.muted }]}>Delete this alarm?</Text>
                  <Pressable
                    onPress={() => { onDelete?.(alarm!.id); onClose(); }}
                    style={({ pressed }) => [em.confirmYes, { backgroundColor: '#EF444420', opacity: pressed ? 0.7 : 1 }]}
                  >
                    <Text style={{ color: '#EF4444', fontWeight: '700', fontSize: 14 }}>Delete</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => setShowDeleteConfirm(false)}
                    style={({ pressed }) => [em.confirmNo, { backgroundColor: colors.border, opacity: pressed ? 0.7 : 1 }]}
                  >
                    <Text style={{ color: colors.foreground, fontWeight: '600', fontSize: 14 }}>Cancel</Text>
                  </Pressable>
                </View>
              )}
            </View>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

const em = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  cancelBtn: { paddingVertical: 6, paddingHorizontal: 4, minWidth: 60 },
  cancelText: { fontSize: 16 },
  title: { fontSize: 17, fontWeight: '700' },
  saveBtn: { paddingHorizontal: 16, paddingVertical: 7, borderRadius: 10, minWidth: 60, alignItems: 'center' },
  saveBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  scroll: { paddingHorizontal: 16, paddingTop: 20, gap: 8 },
  section: {
    borderRadius: 16, borderWidth: 1, overflow: 'hidden', marginBottom: 8,
  },
  groupLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.8, marginBottom: 6, marginTop: 4, paddingHorizontal: 4 },
  wheelWrap: { paddingVertical: 16, alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth },
  daySection: { paddingHorizontal: 16, paddingVertical: 14 },
  sectionLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.8, marginBottom: 10 },
  daysRow: { flexDirection: 'row', gap: 8 },
  dayBtn: { flex: 1, height: 38, borderRadius: 10, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  dayBtnText: { fontSize: 13, fontWeight: '700' },
  labelSection: { paddingHorizontal: 16, paddingVertical: 14, borderTopWidth: StyleSheet.hairlineWidth },
  labelInput: {
    height: 44, borderRadius: 10, borderWidth: 1, paddingHorizontal: 12, fontSize: 15,
  },
  dropdownRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  dropdownLabel: { fontSize: 12, fontWeight: '600', marginBottom: 1 },
  dropdownValue: { fontSize: 14, fontWeight: '500' },
  dropdownContent: { borderBottomWidth: StyleSheet.hairlineWidth },
  dropdownItem: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 12 },
  dropdownItemText: { fontSize: 15, fontWeight: '500' },
  itemEmoji: { fontSize: 20, width: 28, textAlign: 'center' },
  meditationDesc: { fontSize: 12, marginTop: 1 },
  durationChipRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 16, paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth,
  },
  durationChipLabel: { fontSize: 12, fontWeight: '600', marginRight: 4 },
  durationChips: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  chipRow: {
    flexDirection: 'row', gap: 8, flexWrap: 'wrap',
    paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  deleteSection: { marginTop: 8 },
  deleteBtn: { alignItems: 'center', paddingVertical: 16 },
  deleteBtnText: { fontSize: 15, fontWeight: '600' },
  confirmRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 },
  confirmText: { flex: 1, fontSize: 14 },
  confirmYes: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 10 },
  confirmNo:  { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 10 },
  groupSubLabel: { fontSize: 12, marginTop: -4, marginBottom: 10, paddingHorizontal: 4, lineHeight: 17 },
  stepHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  stepBadge: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  stepNum: { fontSize: 14, fontWeight: '800' },
  stepTitle: { fontSize: 15, fontWeight: '700', marginBottom: 3 },
  stepDesc: { fontSize: 12, lineHeight: 17 },
});

// ─── Alarm Card ───────────────────────────────────────────────────────────────

function AlarmCard({
  alarm,
  onToggle,
  onEdit,
}: {
  alarm: AlarmEntry;
  onToggle: () => void;
  onEdit: () => void;
}) {
  const colors = useColors();

  return (
    <Pressable
      onPress={onEdit}
      style={({ pressed }) => [ac.card, {
        backgroundColor: colors.surface,
        borderColor: alarm.isEnabled ? ALARM_COLOR + '55' : colors.border,
        opacity: pressed ? 0.85 : 1,
      }]}
    >
      <View style={{ flex: 1 }}>
        {/* Label + status */}
        <View style={ac.labelRow}>
          <View style={[ac.dot, { backgroundColor: alarm.isEnabled ? '#4ade80' : '#334155' }]} />
          <Text style={[ac.label, { color: colors.muted }]}>
            {alarm.label ?? (alarm.isEnabled ? 'Alarm on' : 'Alarm off')}
          </Text>
        </View>
        {/* Time */}
        <Text style={[ac.time, { color: alarm.isEnabled ? colors.foreground : colors.muted }]}>
          {formatAlarmTime(alarm.hour, alarm.minute)}
        </Text>
        {/* Days */}
        {alarm.days.length > 0 && (
          <View style={ac.daysRow}>
            {DAY_SHORT.map((d, i) => {
              const active = alarm.days.includes(DAY_MAP[i]);
              return (
                <View key={i} style={[ac.dayChip, {
                  backgroundColor: active ? ALARM_COLOR + '22' : 'transparent',
                  borderColor: active ? ALARM_COLOR : colors.border,
                }]}>
                  <Text style={[ac.dayChipText, { color: active ? ALARM_COLOR : colors.muted }]}>{d}</Text>
                </View>
              );
            })}
          </View>
        )}
        {/* Ritual badge */}
        {alarm.meditationId && (
          <Text style={[ac.ritualBadge, { color: ALARM_COLOR }]}>
            {MEDITATION_OPTIONS.find(m => m.id === alarm.meditationId)?.emoji}{' '}
            {MEDITATION_OPTIONS.find(m => m.id === alarm.meditationId)?.label}
          </Text>
        )}
      </View>
      {/* Toggle */}
      <Pressable
        onPress={(e) => { e.stopPropagation(); onToggle(); }}
        style={[ac.toggle, { backgroundColor: alarm.isEnabled ? ALARM_COLOR : colors.border }]}
      >
        <View style={[ac.toggleThumb, { alignSelf: alarm.isEnabled ? 'flex-end' : 'flex-start' }]} />
      </Pressable>
    </Pressable>
  );
}

const ac = StyleSheet.create({
  card: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: 16, borderWidth: 1.5,
    padding: 16, gap: 12,
  },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  label: { fontSize: 12, fontWeight: '600', letterSpacing: 0.3 },
  time: { fontSize: 32, fontWeight: '800', letterSpacing: -0.5, marginBottom: 8 },
  daysRow: { flexDirection: 'row', gap: 5 },
  dayChip: { width: 26, height: 26, borderRadius: 8, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  dayChipText: { fontSize: 11, fontWeight: '700' },
  ritualBadge: { fontSize: 12, fontWeight: '600', marginTop: 6 },
  toggle: { width: 48, height: 28, borderRadius: 14, padding: 3, justifyContent: 'center' },
  toggleThumb: { width: 22, height: 22, borderRadius: 11, backgroundColor: '#fff', shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 2, shadowOffset: { width: 0, height: 1 } },
});

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function AlarmsScreen() {
  const router = useRouter();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === 'web' ? Math.max(insets.top, 50) : insets.top;

  const { alarms, updateAlarms } = useApp();
  const [modalVisible, setModalVisible] = useState(false);
  const [editingAlarm, setEditingAlarm] = useState<AlarmEntry | null>(null);

  function openAdd() {
    if (alarms.length >= MAX_ALARMS) {
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      Alert.alert('Max Alarms Reached', 'You can have up to 4 alarms. Disable or delete one to add a new alarm.');
      return;
    }
    setEditingAlarm(null);
    setModalVisible(true);
  }

  function openEdit(alarm: AlarmEntry) {
    setEditingAlarm(alarm);
    setModalVisible(true);
  }

  async function handleSave(entry: AlarmEntry) {
    setModalVisible(false);
    let updated = { ...entry };
    if (Platform.OS !== 'web') {
      try {
        await cancelAlarm(entry);
        if (entry.isEnabled && entry.days.length > 0) {
          const ids = await scheduleAlarm(entry);
          updated = { ...entry, notificationIds: ids };
        } else {
          updated = { ...entry, notificationIds: [] };
        }
      } catch {}
    }
    const isExisting = alarms.some((a) => a.id === entry.id);
    const newList = isExisting
      ? alarms.map((a) => a.id === entry.id ? updated : a)
      : [...alarms, updated];
    await updateAlarms(newList);
  }

  async function handleDelete(id: string) {
    const target = alarms.find((a) => a.id === id);
    if (target && Platform.OS !== 'web') {
      try { await cancelAlarm(target); } catch {}
    }
    await updateAlarms(alarms.filter((a) => a.id !== id));
  }

  async function handleToggle(alarm: AlarmEntry) {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const toggled = { ...alarm, isEnabled: !alarm.isEnabled };
    let updated = toggled;
    if (Platform.OS !== 'web') {
      try {
        await cancelAlarm(alarm);
        if (toggled.isEnabled && toggled.days.length > 0) {
          const ids = await scheduleAlarm(toggled);
          updated = { ...toggled, notificationIds: ids };
        } else {
          updated = { ...toggled, notificationIds: [] };
        }
      } catch {}
    }
    await updateAlarms(alarms.map((a) => a.id === alarm.id ? updated : a));
  }

  const enabledCount = alarms.filter((a) => a.isEnabled).length;

  return (
    <View style={[s.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[s.header, { paddingTop: topPad + 8 }]}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [s.backBtn, { opacity: pressed ? 0.6 : 1 }]}
        >
          <IconSymbol name="chevron.left" size={24} color={colors.foreground} />
        </Pressable>
        <Text style={[s.headerTitle, { color: colors.foreground }]}>Alarms</Text>
        {alarms.length < MAX_ALARMS ? (
          <Pressable
            onPress={openAdd}
            style={({ pressed }) => [s.addBtn, { backgroundColor: ALARM_COLOR + (pressed ? '30' : '18') }]}
          >
            <Text style={[s.addBtnText, { color: ALARM_COLOR }]}>+ Add</Text>
          </Pressable>
        ) : (
          <View style={{ width: 60 }} />
        )}
      </View>

      {/* Summary strip */}
      <View style={[s.summaryStrip, { backgroundColor: ALARM_COLOR + '12', borderColor: ALARM_COLOR + '30' }]}>
        <IconSymbol name="alarm" size={16} color={ALARM_COLOR} />
        <Text style={[s.summaryText, { color: ALARM_COLOR }]}>
          {enabledCount === 0
            ? 'No alarms active'
            : `${enabledCount} alarm${enabledCount > 1 ? 's' : ''} active`}
          {alarms.length >= MAX_ALARMS ? ' · Max 4 reached' : ''}
        </Text>
      </View>

      {/* Alarm list */}
      <ScrollView
        contentContainerStyle={[s.listContent, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
      >
        {alarms.length === 0 ? (
          <View style={s.emptyState}>
            <Text style={s.emptyIcon}>⏰</Text>
            <Text style={[s.emptyTitle, { color: colors.foreground }]}>No alarms yet</Text>
            <Text style={[s.emptySub, { color: colors.muted }]}>
              Tap "+ Add" to set your first alarm
            </Text>
            <Pressable
              onPress={openAdd}
              style={({ pressed }) => [s.emptyAddBtn, { backgroundColor: ALARM_COLOR, opacity: pressed ? 0.85 : 1 }]}
            >
              <Text style={s.emptyAddBtnText}>Add Your First Alarm</Text>
            </Pressable>
          </View>
        ) : (
          <View style={s.alarmList}>
            {alarms.map((alarm) => (
              <AlarmCard
                key={alarm.id}
                alarm={alarm}
                onToggle={() => handleToggle(alarm)}
                onEdit={() => openEdit(alarm)}
              />
            ))}
            {alarms.length < MAX_ALARMS && (
              <Pressable
                onPress={openAdd}
                style={({ pressed }) => [s.addCard, { borderColor: ALARM_COLOR + '40', backgroundColor: ALARM_COLOR + '08', opacity: pressed ? 0.7 : 1 }]}
              >
                <Text style={[s.addCardText, { color: ALARM_COLOR }]}>+ Add Alarm</Text>
                <Text style={[s.addCardSub, { color: colors.muted }]}>{alarms.length} of {MAX_ALARMS} used</Text>
              </Pressable>
            )}
            {alarms.length >= MAX_ALARMS && (
              <View style={[s.maxBanner, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[s.maxBannerText, { color: colors.muted }]}>
                  Maximum 4 alarms reached. Disable or delete one to add a new alarm.
                </Text>
              </View>
            )}
          </View>
        )}
      </ScrollView>

      {/* Add/Edit Modal */}
      <AlarmEditModal
        visible={modalVisible}
        alarm={editingAlarm}
        onSave={handleSave}
        onDelete={handleDelete}
        onClose={() => setModalVisible(false)}
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingBottom: 12,
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 20, fontWeight: '700' },
  addBtn: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 10 },
  addBtnText: { fontSize: 14, fontWeight: '700' },
  summaryStrip: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginHorizontal: 16, marginBottom: 16,
    paddingHorizontal: 14, paddingVertical: 10,
    borderRadius: 12, borderWidth: 1,
  },
  summaryText: { fontSize: 13, fontWeight: '600' },
  listContent: { paddingHorizontal: 16 },
  alarmList: { gap: 12 },
  addCard: {
    borderRadius: 16, borderWidth: 1.5, borderStyle: 'dashed',
    paddingVertical: 20, alignItems: 'center', gap: 4,
  },
  addCardText: { fontSize: 16, fontWeight: '700' },
  addCardSub: { fontSize: 12 },
  maxBanner: { borderRadius: 12, borderWidth: 1, padding: 14 },
  maxBannerText: { fontSize: 13, textAlign: 'center', lineHeight: 18 },
  emptyState: { alignItems: 'center', paddingTop: 60, gap: 8 },
  emptyIcon: { fontSize: 56 },
  emptyTitle: { fontSize: 22, fontWeight: '700', marginTop: 8 },
  emptySub: { fontSize: 14, textAlign: 'center', lineHeight: 20, maxWidth: 260 },
  emptyAddBtn: { marginTop: 16, paddingHorizontal: 28, paddingVertical: 14, borderRadius: 14 },
  emptyAddBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
