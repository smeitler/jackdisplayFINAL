/**
 * Alarms Screen — Dedicated full-screen alarm manager
 *
 * - Lists all alarms (up to 4) with toggle, time, days, label
 * - Add / Edit bottom sheet with scroll-wheel time picker + day toggles + label input
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
  FlatList,
  Platform,
  Animated,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/use-colors';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useApp } from '@/lib/app-context';
import { AlarmEntry, MAX_ALARMS, DEFAULT_ALARM } from '@/lib/storage';
import { scheduleAlarm, cancelAlarm, requestNotificationPermissions, formatAlarmTime } from '@/lib/notifications';
import * as Haptics from 'expo-haptics';

// ─── Constants ────────────────────────────────────────────────────────────────

const HOURS = Array.from({ length: 12 }, (_, i) => i + 1);   // 1–12
const MINUTES = Array.from({ length: 60 }, (_, i) => i);      // 0–59
const PERIODS = ['AM', 'PM'];
const DAY_SHORT = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const DAY_FULL  = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY_MAP   = [0, 1, 2, 3, 4, 5, 6]; // index → day number (0=Sun)

const ITEM_H = 48;

// ─── Scroll Picker ────────────────────────────────────────────────────────────

function ScrollPicker({
  items,
  selectedIndex,
  onSelect,
  color,
  width = 64,
  formatItem,
}: {
  items: (string | number)[];
  selectedIndex: number;
  onSelect: (index: number) => void;
  color: string;
  width?: number;
  formatItem?: (item: string | number) => string;
}) {
  const colors = useColors();
  const scrollRef = useRef<ScrollView>(null);
  const VISIBLE = 3;
  const PAD = ITEM_H * Math.floor(VISIBLE / 2);

  useEffect(() => {
    scrollRef.current?.scrollTo({ y: selectedIndex * ITEM_H, animated: false });
  }, [selectedIndex]);

  return (
    <View style={{ width, height: ITEM_H * VISIBLE, overflow: 'hidden' }}>
      {/* Selection highlight */}
      <View style={[sp.highlight, { top: PAD, borderColor: color + '60', backgroundColor: color + '12' }]} />
      <ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        snapToInterval={ITEM_H}
        decelerationRate="fast"
        contentContainerStyle={{ paddingVertical: PAD }}
        onMomentumScrollEnd={(e) => {
          const idx = Math.round(e.nativeEvent.contentOffset.y / ITEM_H);
          const clamped = Math.max(0, Math.min(items.length - 1, idx));
          onSelect(clamped);
        }}
      >
        {items.map((item, i) => (
          <Pressable key={i} onPress={() => {
            onSelect(i);
            scrollRef.current?.scrollTo({ y: i * ITEM_H, animated: true });
          }}>
            <View style={sp.item}>
              <Text style={[sp.itemText, {
                color: i === selectedIndex ? color : colors.muted,
                fontWeight: i === selectedIndex ? '700' : '400',
                fontSize: i === selectedIndex ? 22 : 17,
              }]}>
                {formatItem ? formatItem(item) : String(item).padStart(2, '0')}
              </Text>
            </View>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const sp = StyleSheet.create({
  highlight: {
    position: 'absolute', left: 0, right: 0, height: ITEM_H,
    borderRadius: 10, borderWidth: 1.5, zIndex: 1, pointerEvents: 'none',
  } as any,
  item: { height: ITEM_H, alignItems: 'center', justifyContent: 'center' },
  itemText: { letterSpacing: 0.5 },
});

// ─── Add/Edit Sheet ───────────────────────────────────────────────────────────

function AlarmEditSheet({
  visible,
  alarm,
  onSave,
  onDelete,
  onClose,
  color,
}: {
  visible: boolean;
  alarm: AlarmEntry | null;
  onSave: (entry: AlarmEntry) => void;
  onDelete?: (id: string) => void;
  onClose: () => void;
  color: string;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const isNew = !alarm;

  // Convert 24h to 12h for picker
  function to12h(h: number) {
    const period = h >= 12 ? 1 : 0;
    const hour12 = h % 12 === 0 ? 12 : h % 12;
    return { hourIdx: HOURS.indexOf(hour12), minuteIdx: h % 1 === 0 ? (alarm?.minute ?? 0) : 0, periodIdx: period };
  }

  const init = alarm ?? { ...DEFAULT_ALARM, id: `alarm_${Date.now()}`, label: '' };
  const init12 = to12h(init.hour);

  const [hourIdx, setHourIdx]     = useState(init12.hourIdx < 0 ? 0 : init12.hourIdx);
  const [minuteIdx, setMinuteIdx] = useState(init.minute);
  const [periodIdx, setPeriodIdx] = useState(init12.periodIdx);
  const [days, setDays]           = useState<number[]>(init.days);
  const [label, setLabel]         = useState(init.label ?? '');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Re-sync when alarm changes
  useEffect(() => {
    if (!visible) return;
    const src = alarm ?? { ...DEFAULT_ALARM, id: `alarm_${Date.now()}`, label: '' };
    const s12 = to12h(src.hour);
    setHourIdx(s12.hourIdx < 0 ? 0 : s12.hourIdx);
    setMinuteIdx(src.minute);
    setPeriodIdx(s12.periodIdx);
    setDays(src.days);
    setLabel(src.label ?? '');
    setShowDeleteConfirm(false);
  }, [visible, alarm?.id]);

  function get24h() {
    const h12 = HOURS[hourIdx];
    const period = PERIODS[periodIdx];
    if (period === 'AM') return h12 === 12 ? 0 : h12;
    return h12 === 12 ? 12 : h12 + 12;
  }

  function toggleDay(day: number) {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );
  }

  function handleSave() {
    if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const entry: AlarmEntry = {
      ...(alarm ?? { ...DEFAULT_ALARM }),
      id: alarm?.id ?? `alarm_${Date.now()}`,
      hour: get24h(),
      minute: minuteIdx,
      days,
      label: label.trim() || undefined,
      isEnabled: true,
      notificationIds: alarm?.notificationIds ?? [],
    };
    onSave(entry);
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={es.overlay} onPress={onClose}>
        <Pressable style={[es.sheet, { backgroundColor: colors.surface, paddingBottom: insets.bottom + 16 }]}>
          {/* Handle */}
          <View style={[es.handle, { backgroundColor: colors.border }]} />

          {/* Title */}
          <Text style={[es.title, { color: colors.foreground }]}>
            {isNew ? 'New Alarm' : 'Edit Alarm'}
          </Text>

          {/* Time Picker */}
          <View style={es.pickerRow}>
            <ScrollPicker
              items={HOURS}
              selectedIndex={hourIdx}
              onSelect={setHourIdx}
              color={color}
              width={72}
              formatItem={(v) => String(v)}
            />
            <Text style={[es.colon, { color: colors.foreground }]}>:</Text>
            <ScrollPicker
              items={MINUTES}
              selectedIndex={minuteIdx}
              onSelect={setMinuteIdx}
              color={color}
              width={72}
              formatItem={(v) => String(v).padStart(2, '0')}
            />
            <ScrollPicker
              items={PERIODS}
              selectedIndex={periodIdx}
              onSelect={setPeriodIdx}
              color={color}
              width={64}
              formatItem={(v) => String(v)}
            />
          </View>

          {/* Day Toggles */}
          <Text style={[es.sectionLabel, { color: colors.muted }]}>REPEAT</Text>
          <View style={es.daysRow}>
            {DAY_SHORT.map((d, i) => {
              const dayNum = DAY_MAP[i];
              const active = days.includes(dayNum);
              return (
                <Pressable
                  key={i}
                  onPress={() => toggleDay(dayNum)}
                  style={[es.dayBtn, {
                    backgroundColor: active ? color : colors.background,
                    borderColor: active ? color : colors.border,
                  }]}
                >
                  <Text style={[es.dayBtnText, { color: active ? '#fff' : colors.muted }]}>{d}</Text>
                </Pressable>
              );
            })}
          </View>

          {/* Label */}
          <Text style={[es.sectionLabel, { color: colors.muted }]}>LABEL (OPTIONAL)</Text>
          <TextInput
            value={label}
            onChangeText={setLabel}
            placeholder="e.g. Morning, Gym, Evening"
            placeholderTextColor={colors.muted}
            maxLength={24}
            returnKeyType="done"
            style={[es.labelInput, { color: colors.foreground, backgroundColor: colors.background, borderColor: colors.border }]}
          />

          {/* Save */}
          <Pressable
            onPress={handleSave}
            style={({ pressed }) => [es.saveBtn, { backgroundColor: color, opacity: pressed ? 0.85 : 1 }]}
          >
            <Text style={es.saveBtnText}>{isNew ? 'Add Alarm' : 'Save Changes'}</Text>
          </Pressable>

          {/* Delete (edit only) */}
          {!isNew && !showDeleteConfirm && (
            <Pressable
              onPress={() => setShowDeleteConfirm(true)}
              style={({ pressed }) => [es.deleteBtn, { opacity: pressed ? 0.7 : 1 }]}
            >
              <Text style={[es.deleteBtnText, { color: colors.error ?? '#EF4444' }]}>Delete Alarm</Text>
            </Pressable>
          )}
          {!isNew && showDeleteConfirm && (
            <View style={es.confirmRow}>
              <Text style={[es.confirmText, { color: colors.muted }]}>Delete this alarm?</Text>
              <Pressable
                onPress={() => { onDelete?.(alarm!.id); onClose(); }}
                style={({ pressed }) => [es.confirmYes, { backgroundColor: '#EF444420', opacity: pressed ? 0.7 : 1 }]}
              >
                <Text style={{ color: '#EF4444', fontWeight: '700', fontSize: 14 }}>Delete</Text>
              </Pressable>
              <Pressable
                onPress={() => setShowDeleteConfirm(false)}
                style={({ pressed }) => [es.confirmNo, { backgroundColor: colors.border, opacity: pressed ? 0.7 : 1 }]}
              >
                <Text style={{ color: colors.foreground, fontWeight: '600', fontSize: 14 }}>Cancel</Text>
              </Pressable>
            </View>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const es = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 24, paddingTop: 12 },
  handle: { width: 36, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  title: { fontSize: 20, fontWeight: '700', textAlign: 'center', marginBottom: 20 },
  pickerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, marginBottom: 24 },
  colon: { fontSize: 28, fontWeight: '700', marginHorizontal: 2, marginBottom: 4 },
  sectionLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.8, marginBottom: 10 },
  daysRow: { flexDirection: 'row', gap: 8, marginBottom: 20 },
  dayBtn: { flex: 1, height: 38, borderRadius: 10, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  dayBtnText: { fontSize: 13, fontWeight: '700' },
  labelInput: {
    height: 44, borderRadius: 10, borderWidth: 1, paddingHorizontal: 12,
    fontSize: 15, marginBottom: 20,
  },
  saveBtn: { height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  deleteBtn: { alignItems: 'center', paddingVertical: 12 },
  deleteBtnText: { fontSize: 15, fontWeight: '600' },
  confirmRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 },
  confirmText: { flex: 1, fontSize: 14 },
  confirmYes: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 10 },
  confirmNo:  { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 10 },
});

// ─── Alarm Card ───────────────────────────────────────────────────────────────

function AlarmCard({
  alarm,
  onToggle,
  onEdit,
  color,
}: {
  alarm: AlarmEntry;
  onToggle: () => void;
  onEdit: () => void;
  color: string;
}) {
  const colors = useColors();
  const sortedDays = [...alarm.days].sort((a, b) => a - b);

  return (
    <Pressable
      onPress={onEdit}
      style={({ pressed }) => [ac.card, {
        backgroundColor: colors.surface,
        borderColor: alarm.isEnabled ? color + '55' : colors.border,
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
                  backgroundColor: active ? color + '22' : 'transparent',
                  borderColor: active ? color : colors.border,
                }]}>
                  <Text style={[ac.dayChipText, { color: active ? color : colors.muted }]}>{d}</Text>
                </View>
              );
            })}
          </View>
        )}
      </View>
      {/* Toggle */}
      <Pressable
        onPress={(e) => { e.stopPropagation(); onToggle(); }}
        style={[ac.toggle, { backgroundColor: alarm.isEnabled ? color : colors.border }]}
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
  toggle: { width: 48, height: 28, borderRadius: 14, padding: 3, justifyContent: 'center' },
  toggleThumb: { width: 22, height: 22, borderRadius: 11, backgroundColor: '#fff', shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 2, shadowOffset: { width: 0, height: 1 } },
});

// ─── Main Screen ──────────────────────────────────────────────────────────────

const ALARM_COLOR = '#6C63FF';

export default function AlarmsScreen() {
  const router = useRouter();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === 'web' ? Math.max(insets.top, 50) : insets.top;

  const { alarms, updateAlarms } = useApp();
  const [sheetVisible, setSheetVisible] = useState(false);
  const [editingAlarm, setEditingAlarm] = useState<AlarmEntry | null>(null);

  function openAdd() {
    if (alarms.length >= MAX_ALARMS) {
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      return;
    }
    setEditingAlarm(null);
    setSheetVisible(true);
  }

  function openEdit(alarm: AlarmEntry) {
    setEditingAlarm(alarm);
    setSheetVisible(true);
  }

  async function handleSave(entry: AlarmEntry) {
    setSheetVisible(false);
    // Schedule notifications
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
        {/* Add button */}
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
            <Text style={[s.emptyIcon]}>⏰</Text>
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
                color={ALARM_COLOR}
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

      {/* Add/Edit Sheet */}
      <AlarmEditSheet
        visible={sheetVisible}
        alarm={editingAlarm}
        onSave={handleSave}
        onDelete={handleDelete}
        onClose={() => setSheetVisible(false)}
        color={ALARM_COLOR}
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
  maxBanner: {
    borderRadius: 12, borderWidth: 1, padding: 14,
  },
  maxBannerText: { fontSize: 13, textAlign: 'center', lineHeight: 18 },
  emptyState: { alignItems: 'center', paddingTop: 60, gap: 8 },
  emptyIcon: { fontSize: 56 },
  emptyTitle: { fontSize: 22, fontWeight: '700', marginTop: 8 },
  emptySub: { fontSize: 14, textAlign: 'center', lineHeight: 20, maxWidth: 260 },
  emptyAddBtn: { marginTop: 16, paddingHorizontal: 28, paddingVertical: 14, borderRadius: 14 },
  emptyAddBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
