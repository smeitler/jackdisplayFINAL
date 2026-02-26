import {
  View, Text, TouchableOpacity, TextInput, Pressable,
  StyleSheet, Alert, Modal, KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import { useState, useMemo } from 'react';
import { useRouter } from 'expo-router';
import Animated, {
  useSharedValue, useAnimatedStyle, withTiming, runOnJS,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { ScreenContainer } from '@/components/screen-container';
import { EmojiPicker } from '@/components/emoji-picker';
import { useApp } from '@/lib/app-context';
import { useColors } from '@/hooks/use-colors';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { CategoryDef, Habit, CheckInEntry, LIFE_AREAS, LifeArea } from '@/lib/storage';
import { trpc } from '@/lib/trpc';


// ─── Inline Date Picker ─────────────────────────────────────────────────────

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];

function InlineDatePicker({
  value, minDate, onChange, colors,
}: {
  value: Date;
  minDate: Date;
  onChange: (d: Date) => void;
  colors: ReturnType<typeof useColors>;
}) {
  const [viewYear, setViewYear] = useState(value.getFullYear());
  const [viewMonth, setViewMonth] = useState(value.getMonth());

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const minDay = new Date(minDate);
  minDay.setHours(0, 0, 0, 0);

  function prevMonth() {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); }
    else setViewMonth(m => m - 1);
  }
  function nextMonth() {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); }
    else setViewMonth(m => m + 1);
  }

  const firstDay = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  return (
    <View>
      <View style={styles.datePickerNav}>
        <TouchableOpacity onPress={prevMonth} style={{ padding: 4 }} activeOpacity={0.7}>
          <IconSymbol name="chevron.left" size={18} color={colors.primary} />
        </TouchableOpacity>
        <Text style={[styles.datePickerNavText, { color: colors.foreground }]}>
          {MONTH_NAMES[viewMonth]} {viewYear}
        </Text>
        <TouchableOpacity onPress={nextMonth} style={{ padding: 4 }} activeOpacity={0.7}>
          <IconSymbol name="chevron.right" size={18} color={colors.primary} />
        </TouchableOpacity>
      </View>
      <View style={styles.datePickerGrid}>
        {cells.map((day, i) => {
          if (!day) return <View key={`e${i}`} style={styles.datePickerDay} />;
          const d = new Date(viewYear, viewMonth, day);
          d.setHours(0, 0, 0, 0);
          const disabled = d < minDay;
          const selected = value.getFullYear() === viewYear && value.getMonth() === viewMonth && value.getDate() === day;
          return (
            <TouchableOpacity
              key={day}
              onPress={() => !disabled && onChange(new Date(viewYear, viewMonth, day))}
              style={[styles.datePickerDay, selected && { backgroundColor: colors.primary }, disabled && { opacity: 0.3 }]}
              activeOpacity={disabled ? 1 : 0.7}
            >
              <Text style={[styles.datePickerDayText, { color: selected ? '#fff' : colors.foreground }]}>{day}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

// ─── Swipeable Habit Row ──────────────────────────────────────────────────────

const SWIPE_THRESHOLD = -80;
const DELETE_BG_W = 80;

interface SwipeableHabitRowProps {
  habit: Habit;
  habitIndex: number;
  isLast: boolean;
  teamName?: string | null;
  onEdit: () => void;
  onToggle: () => void;
  onDelete: () => void;
  colors: ReturnType<typeof import('@/hooks/use-colors').useColors>;
}

function SwipeableHabitRow({ habit, habitIndex, isLast, teamName, onEdit, onToggle, onDelete, colors }: SwipeableHabitRowProps) {
  const translateX = useSharedValue(0);
  const isRevealed = useSharedValue(false);

  function triggerDelete() {
    Alert.alert('Delete Habit', `Remove "${habit.name}"?`, [
      {
        text: 'Cancel', style: 'cancel',
        onPress: () => { translateX.value = withTiming(0); isRevealed.value = false; },
      },
      {
        text: 'Delete', style: 'destructive',
        onPress: () => {
          translateX.value = withTiming(-300, { duration: 200 });
          setTimeout(onDelete, 200);
        },
      },
    ]);
  }

  const panGesture = Gesture.Pan()
    .activeOffsetX([-10, 10])
    .onUpdate((e) => {
      const newX = isRevealed.value
        ? Math.max(-DELETE_BG_W, Math.min(0, e.translationX - DELETE_BG_W))
        : Math.max(-DELETE_BG_W, Math.min(0, e.translationX));
      translateX.value = newX;
    })
    .onEnd((e) => {
      if (e.translationX < SWIPE_THRESHOLD) {
        translateX.value = withTiming(-DELETE_BG_W);
        isRevealed.value = true;
      } else {
        translateX.value = withTiming(0);
        isRevealed.value = false;
      }
    })
    .runOnJS(true);

  const rowStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  return (
    <View style={[styles.swipeContainer, !isLast && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }]}>
      {/* Red delete background */}
      <View style={styles.deleteBackground}>
        <TouchableOpacity
          onPress={() => runOnJS(triggerDelete)()}
          style={styles.deleteAction}
          activeOpacity={0.8}
        >
          <IconSymbol name="trash.fill" size={20} color="#fff" />
          <Text style={styles.deleteActionText}>Delete</Text>
        </TouchableOpacity>
      </View>

      {/* Swipeable row */}
      <GestureDetector gesture={panGesture}>
        <Animated.View style={[styles.habitRow, { backgroundColor: colors.surface }, rowStyle]}>
          {/* Numbered badge */}
          <TouchableOpacity
            onPress={onEdit}
            style={styles.habitEmojiBtn}
            activeOpacity={0.6}
          >
            <View style={[styles.habitNumBadge, { backgroundColor: colors.primary + '22', borderColor: colors.primary + '44' }]}>
              <Text style={[styles.habitNumText, { color: colors.primary }]}>{habitIndex + 1}</Text>
            </View>
          </TouchableOpacity>

          {/* Name + status */}
          <TouchableOpacity onPress={onEdit} style={styles.habitInfo} activeOpacity={0.7}>
            <Text style={[styles.habitName, { color: habit.isActive ? colors.foreground : colors.muted }]}>
              {habit.name}
            </Text>
            {teamName && (
              <View style={[styles.teamBadge, { backgroundColor: colors.primary + '18', borderColor: colors.primary + '40' }]}>
                <Text style={[styles.teamBadgeText, { color: colors.primary }]}>👥 {teamName}</Text>
              </View>
            )}
            {!habit.isActive && (
              <Text style={[styles.habitInactive, { color: colors.muted }]}>Inactive</Text>
            )}
          </TouchableOpacity>

          {/* Actions */}
          <View style={styles.habitActions}>
            {/* Toggle active */}
            <TouchableOpacity onPress={onToggle} style={styles.iconBtn} activeOpacity={0.6}>
              <IconSymbol
                name={habit.isActive ? 'checkmark.circle.fill' : 'circle'}
                size={20}
                color={habit.isActive ? colors.primary : colors.muted}
              />
            </TouchableOpacity>
            {/* Edit */}
            <TouchableOpacity onPress={onEdit} style={styles.iconBtn} activeOpacity={0.6}>
              <IconSymbol name="pencil" size={16} color={colors.muted} />
            </TouchableOpacity>
          </View>
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

// ─── Add/Edit Habit Modal ─────────────────────────────────────────────────────

interface HabitModalProps {
  visible: boolean;
  editHabit?: Habit | null;
  entryCount: number;
  onSave: (name: string, emoji: string, description?: string, weeklyGoal?: number, frequencyType?: import('@/lib/storage').FrequencyType, monthlyGoal?: number) => void;
  onDelete: (habitId: string) => void;
  onDeactivate: (habitId: string) => void;
  onClose: () => void;
}

const NAME_LIMIT = 40;

function HabitModal({ visible, editHabit, entryCount, onSave, onDelete, onDeactivate, onClose }: HabitModalProps) {
  const colors = useColors();
  const [name, setName] = useState(editHabit?.name ?? '');
  const [description, setDescription] = useState(editHabit?.description ?? '');
  const [frequencyType, setFrequencyType] = useState<import('@/lib/storage').FrequencyType>(editHabit?.frequencyType ?? 'weekly');
  const [weeklyGoal, setWeeklyGoal] = useState<number | undefined>(editHabit?.weeklyGoal);
  const [monthlyGoal, setMonthlyGoal] = useState<number | undefined>(editHabit?.monthlyGoal);
  const [confirmDelete, setConfirmDelete] = useState(false);

  function handleSave() {
    if (!name.trim()) return;
    onSave(name.trim(), '', description.trim() || undefined, frequencyType === 'weekly' ? weeklyGoal : undefined, frequencyType, frequencyType === 'monthly' ? monthlyGoal : undefined);
    onClose();
  }

  function handleDeletePress() {
    setConfirmDelete(true);
  }

  function confirmDoDelete() {
    const id = editHabit?.id;
    if (!id) return;
    setConfirmDelete(false);
    onClose();
    onDelete(id);
  }

  function confirmDeactivate() {
    const id = editHabit?.id;
    if (!id) return;
    setConfirmDelete(false);
    onClose();
    onDeactivate(id);
  }

  return (
    <>
      <Modal
        visible={visible}
        transparent
        animationType="slide"
        onRequestClose={onClose}
          onShow={() => {
          setName(editHabit?.name ?? '');
          setDescription(editHabit?.description ?? '');
          setFrequencyType(editHabit?.frequencyType ?? 'weekly');
          setWeeklyGoal(editHabit?.weeklyGoal);
          setMonthlyGoal(editHabit?.monthlyGoal);
          setConfirmDelete(false);
        }}
      >
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }} pointerEvents="box-none">
          <Pressable style={styles.backdrop} onPress={onClose} />
          <View style={[styles.modalSheet, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={[styles.handle, { backgroundColor: colors.border }]} />
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>
              {editHabit ? 'Edit Habit' : 'Add Habit'}
            </Text>

            <View style={styles.inputRow}>
              <View style={{ flex: 1 }}>
                <TextInput
                  style={[styles.nameInput, { backgroundColor: colors.background, borderColor: name.length >= NAME_LIMIT ? '#F59E0B' : colors.border, color: colors.foreground }]}
                  placeholder="Habit name…"
                  placeholderTextColor={colors.muted}
                  value={name}
                  onChangeText={(t) => setName(t.slice(0, NAME_LIMIT))}
                  maxLength={NAME_LIMIT}
                  returnKeyType="done"
                  onSubmitEditing={handleSave}
                  blurOnSubmit={false}
                />
                <Text style={[styles.charCounter, { color: name.length >= NAME_LIMIT ? '#F59E0B' : colors.muted }]}>
                  {name.length}/{NAME_LIMIT}
                </Text>
              </View>
            </View>

            {/* Optional description */}
            <TextInput
              style={[styles.descInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
              placeholder="Description (optional)…"
              placeholderTextColor={colors.muted}
              value={description}
              onChangeText={(t) => setDescription(t.slice(0, 120))}
              maxLength={120}
              multiline
              numberOfLines={2}
              returnKeyType="done"
              blurOnSubmit
            />

            {/* Frequency type toggle */}
            <View style={styles.weeklyGoalRow}>
              <Text style={[styles.weeklyGoalLabel, { color: colors.foreground }]}>Goal frequency</Text>
              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
                {(['weekly', 'monthly'] as const).map((ft) => (
                  <Pressable
                    key={ft}
                    onPress={() => setFrequencyType(ft)}
                    style={({ pressed }) => ([
                      styles.weeklyGoalDay,
                      { flex: 1, height: 36, paddingHorizontal: 12 },
                      {
                        backgroundColor: frequencyType === ft ? colors.primary : colors.background,
                        borderColor: frequencyType === ft ? colors.primary : colors.border,
                        opacity: pressed ? 0.7 : 1,
                      },
                    ])}
                  >
                    <Text style={[styles.weeklyGoalDayText, { color: frequencyType === ft ? '#fff' : colors.muted }]}>
                      {ft === 'weekly' ? 'Weekly' : 'Monthly'}
                    </Text>
                  </Pressable>
                ))}
              </View>

              {frequencyType === 'weekly' ? (
                <>
                  <Text style={[styles.weeklyGoalLabel, { color: colors.foreground }]}>Times per week</Text>
                  <View style={styles.weeklyGoalBtns}>
                    {[1,2,3,4,5,6,7].map((d) => (
                      <Pressable
                        key={d}
                        onPress={() => setWeeklyGoal(weeklyGoal === d ? undefined : d)}
                        style={({ pressed }) => ([
                          styles.weeklyGoalDay,
                          {
                            backgroundColor: weeklyGoal === d ? colors.primary : colors.background,
                            borderColor: weeklyGoal === d ? colors.primary : colors.border,
                            opacity: pressed ? 0.7 : 1,
                          },
                        ])}
                      >
                        <Text style={[styles.weeklyGoalDayText, { color: weeklyGoal === d ? '#fff' : colors.muted }]}>{d}</Text>
                      </Pressable>
                    ))}
                  </View>
                  <Text style={[styles.weeklyGoalHint, { color: colors.muted }]}>
                    {weeklyGoal ? `${weeklyGoal}x per week` : 'No goal set'}
                  </Text>
                </>
              ) : (
                <>
                  <Text style={[styles.weeklyGoalLabel, { color: colors.foreground }]}>Times per month</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingRight: 8 }}>
                    {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                      <Pressable
                        key={d}
                        onPress={() => setMonthlyGoal(monthlyGoal === d ? undefined : d)}
                        style={({ pressed }) => ([
                          styles.weeklyGoalDay,
                          {
                            backgroundColor: monthlyGoal === d ? colors.primary : colors.background,
                            borderColor: monthlyGoal === d ? colors.primary : colors.border,
                            opacity: pressed ? 0.7 : 1,
                          },
                        ])}
                      >
                        <Text style={[styles.weeklyGoalDayText, { color: monthlyGoal === d ? '#fff' : colors.muted }]}>{d}</Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                  <Text style={[styles.weeklyGoalHint, { color: colors.muted }]}>
                    {monthlyGoal ? `${monthlyGoal}x per month` : 'No goal set'}
                  </Text>
                </>
              )}
            </View>

            <View style={styles.modalActions}>

              <TouchableOpacity
                onPress={onClose}
                style={[styles.modalBtn, styles.modalBtnCancel, { borderColor: colors.border }]}
                activeOpacity={0.7}
              >
                <Text style={[styles.modalBtnText, { color: colors.muted }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleSave}
                style={[styles.modalBtn, styles.modalBtnSave, { backgroundColor: colors.primary }]}
                activeOpacity={0.8}
              >
                <Text style={[styles.modalBtnText, { color: '#fff' }]}>Save</Text>
              </TouchableOpacity>
            </View>

            {/* Delete button — only shown when editing */}
            {editHabit && !confirmDelete && (
              <TouchableOpacity
                onPress={handleDeletePress}
                style={[styles.deleteHabitBtn, { borderColor: '#EF444440' }]}
                activeOpacity={0.7}
              >
                <IconSymbol name="trash.fill" size={15} color="#EF4444" />
                <Text style={styles.deleteHabitText}>Delete Habit</Text>
              </TouchableOpacity>
            )}

            {/* Inline confirm panel */}
            {confirmDelete && (
              <View style={[styles.confirmPanel, { backgroundColor: '#EF444415', borderColor: '#EF444440' }]}>
                <Text style={[styles.confirmTitle, { color: colors.foreground }]}>Delete "{editHabit?.name}"?</Text>
                {entryCount > 0 && (
                  <Text style={[styles.confirmSub, { color: colors.muted }]}>
                    This will permanently delete {entryCount} check-in record{entryCount !== 1 ? 's' : ''}.
                  </Text>
                )}
                <View style={styles.confirmBtns}>
                  <TouchableOpacity
                    onPress={() => setConfirmDelete(false)}
                    style={[styles.confirmBtn, { borderColor: colors.border }]}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.confirmBtnText, { color: colors.muted }]}>Cancel</Text>
                  </TouchableOpacity>
                  {entryCount > 0 && (
                    <TouchableOpacity
                      onPress={confirmDeactivate}
                      style={[styles.confirmBtn, { borderColor: colors.primary, backgroundColor: colors.primary + '20' }]}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.confirmBtnText, { color: colors.primary }]}>Deactivate</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity
                    onPress={confirmDoDelete}
                    style={[styles.confirmBtn, { backgroundColor: '#EF4444', borderColor: '#EF4444' }]}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.confirmBtnText, { color: '#fff' }]}>Delete</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>

    </>
  );
}

// ─── Add/Edit Category Modal ──────────────────────────────────────────────────

interface CategoryModalProps {
  visible: boolean;
  editCategory?: CategoryDef | null;
  habitCount: number;
  onSave: (label: string, emoji: string, lifeArea?: LifeArea, deadline?: string) => void;
  onDelete: (catId: string) => void;
  onClose: () => void;
}

function CategoryModal({ visible, editCategory, habitCount, onSave, onDelete, onClose }: CategoryModalProps) {
  const colors = useColors();
  const [label, setLabel] = useState(editCategory?.label ?? '');
  const [emoji, setEmoji] = useState(editCategory?.emoji ?? '🌟');
  const [lifeArea, setLifeArea] = useState<LifeArea | undefined>(editCategory?.lifeArea);
  const [deadline, setDeadline] = useState<string | undefined>(editCategory?.deadline);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  function handleSave() {
    if (!label.trim()) return;
    if (!lifeArea) return; // Life Area is required
    const selectedArea = LIFE_AREAS.find(a => a.id === lifeArea);
    const finalEmoji = selectedArea?.emoji ?? emoji;
    onSave(label.trim(), finalEmoji, lifeArea, deadline);
    onClose();
  }

  function confirmDoDelete() {
    const id = editCategory?.id;
    if (!id) return;
    setConfirmDelete(false);
    onClose();
    onDelete(id);
  }

  return (
    <>
      <Modal
        visible={visible}
        transparent
        animationType="slide"
        onRequestClose={onClose}
        onShow={() => {
          setLabel(editCategory?.label ?? '');
          setEmoji(editCategory?.emoji ?? '🌟');
          setLifeArea(editCategory?.lifeArea);
          setDeadline(editCategory?.deadline);
          setConfirmDelete(false);
          setShowDatePicker(false);
        }}
      >

        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }} pointerEvents="box-none">
          <Pressable style={styles.backdrop} onPress={onClose} />
          <View style={[styles.modalSheet, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={[styles.handle, { backgroundColor: colors.border }]} />
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>
              {editCategory ? 'Edit Goal' : 'New Goal'}
            </Text>

            <View style={styles.inputRow}>
              {/* Show Life Area emoji if selected, else placeholder */}
              <View style={[styles.emojiBtn, { backgroundColor: colors.background, borderColor: lifeArea ? colors.primary + '60' : colors.border }]}>
                <Text style={styles.emojiBtnText}>
                  {lifeArea ? (LIFE_AREAS.find(a => a.id === lifeArea)?.emoji ?? '🌟') : '?'}
                </Text>
              </View>
              <TextInput
                style={[styles.nameInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
                placeholder="Goal name…"
                placeholderTextColor={colors.muted}
                value={label}
                onChangeText={setLabel}
                returnKeyType="done"
                onSubmitEditing={handleSave}
                blurOnSubmit={false}
              />
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity
                onPress={onClose}
                style={[styles.modalBtn, styles.modalBtnCancel, { borderColor: colors.border }]}
                activeOpacity={0.7}
              >
                <Text style={[styles.modalBtnText, { color: colors.muted }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleSave}
                style={[styles.modalBtn, styles.modalBtnSave, { backgroundColor: !lifeArea ? colors.muted : colors.primary, opacity: !lifeArea ? 0.5 : 1 }]}
                activeOpacity={0.8}
                disabled={!lifeArea}
              >
                <Text style={[styles.modalBtnText, { color: '#fff' }]}>Save</Text>
              </TouchableOpacity>
            </View>

            {/* Life area picker — required */}
            <Text style={[styles.fieldLabel, { color: !lifeArea ? colors.error : colors.muted }]}>
              Life Area {!lifeArea ? '(required)' : ''}
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {LIFE_AREAS.map((area) => (
                  <TouchableOpacity
                    key={area.id}
                    onPress={() => setLifeArea(lifeArea === area.id ? undefined : area.id as LifeArea)}
                    style={[
                      styles.lifeAreaChip,
                      { borderColor: lifeArea === area.id ? colors.primary : colors.border,
                        backgroundColor: lifeArea === area.id ? colors.primary + '22' : colors.surface },
                    ]}
                    activeOpacity={0.7}
                  >
                    <Text style={{ fontSize: 14 }}>{area.emoji}</Text>
                    <Text style={[styles.lifeAreaChipText, { color: lifeArea === area.id ? colors.primary : colors.muted }]}>
                      {area.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>

            {/* Deadline picker */}
            <Text style={[styles.fieldLabel, { color: colors.muted }]}>Deadline (optional)</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <TouchableOpacity
                onPress={() => setShowDatePicker(!showDatePicker)}
                style={[styles.deadlineBtn, { backgroundColor: colors.background, borderColor: deadline ? colors.primary : colors.border }]}
                activeOpacity={0.7}
              >
                <IconSymbol name="calendar" size={16} color={deadline ? colors.primary : colors.muted} />
                <Text style={[styles.deadlineBtnText, { color: deadline ? colors.primary : colors.muted }]}>
                  {deadline ? new Date(deadline + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Set deadline…'}
                </Text>
              </TouchableOpacity>
              {deadline && (
                <TouchableOpacity
                  onPress={() => { setDeadline(undefined); setShowDatePicker(false); }}
                  style={[styles.clearDeadlineBtn, { borderColor: colors.border }]}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.clearDeadlineText, { color: colors.muted }]}>Clear</Text>
                </TouchableOpacity>
              )}
            </View>
            {showDatePicker && (
              <View style={[styles.inlineDatePicker, { backgroundColor: colors.background, borderColor: colors.border }]}>
                {/* Simple inline date selector — month/year + day grid */}
                <InlineDatePicker
                  value={deadline ? new Date(deadline + 'T12:00:00') : new Date()}
                  minDate={new Date()}
                  onChange={(d) => {
                    const iso = d.toISOString().split('T')[0];
                    setDeadline(iso);
                    setShowDatePicker(false);
                  }}
                  colors={colors}
                />
              </View>
            )}

            {/* Delete button — only shown when editing an existing goal */}
            {editCategory && !confirmDelete && (
              <TouchableOpacity
                onPress={() => setConfirmDelete(true)}
                style={[styles.deleteHabitBtn, { borderColor: '#EF444440' }]}
                activeOpacity={0.7}
              >
                <IconSymbol name="trash.fill" size={15} color="#EF4444" />
                <Text style={styles.deleteHabitText}>Delete Goal</Text>
              </TouchableOpacity>
            )}

            {/* Inline confirm panel */}
            {confirmDelete && (
              <View style={[styles.confirmPanel, { backgroundColor: '#EF444415', borderColor: '#EF444440' }]}>
                <Text style={[styles.confirmTitle, { color: colors.foreground }]}>Delete "{editCategory?.label}"?</Text>
                {habitCount > 0 && (
                  <Text style={[styles.confirmSub, { color: colors.muted }]}>
                    This will also delete {habitCount} habit{habitCount !== 1 ? 's' : ''} in this goal.
                  </Text>
                )}
                <View style={styles.confirmBtns}>
                  <TouchableOpacity
                    onPress={() => setConfirmDelete(false)}
                    style={[styles.confirmBtn, { borderColor: colors.border }]}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.confirmBtnText, { color: colors.muted }]}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={confirmDoDelete}
                    style={[styles.confirmBtn, { backgroundColor: '#EF4444', borderColor: '#EF4444' }]}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.confirmBtnText, { color: '#fff' }]}>Delete</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>

    </>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function HabitsScreen() {
  const { habits, categories, checkIns, addHabit, updateHabit, deleteHabit, addCategory, updateCategory, deleteCategory, reorderCategories, reorderHabits, reorderAllHabits, activeHabits } = useApp();
  const colors = useColors();
  const router = useRouter();
  const { data: myTeams } = trpc.teams.list.useQuery();
  // Build a map from teamId -> team name for quick lookup
  const teamNameMap = useMemo(() => {
    const map: Record<number, string> = {};
    for (const t of myTeams ?? []) map[t.id] = t.name;
    return map;
  }, [myTeams]);

  const [expandedCat, setExpandedCat] = useState<string | null>(null);
  const [reorderingCat, setReorderingCat] = useState<string | null>(null);
  const [globalReordering, setGlobalReordering] = useState(false);
  const [reorderingGoals, setReorderingGoals] = useState(false);
  const [habitModal, setHabitModal] = useState<{ open: boolean; categoryId: string; edit?: Habit | null }>({ open: false, categoryId: '' });
  const [categoryModal, setCategoryModal] = useState<{ open: boolean; edit?: CategoryDef | null }>({ open: false });

  const sortedCategories = [...categories].sort((a, b) => a.order - b.order);

  function toggleCategory(id: string) {
    setExpandedCat((prev) => (prev === id ? null : id));
  }

  function moveHabit(catId: string, fromIdx: number, toIdx: number) {
    const catHabits = [...habits.filter((h) => h.category === catId)].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    if (toIdx < 0 || toIdx >= catHabits.length) return;
    const moved = [...catHabits];
    const [item] = moved.splice(fromIdx, 1);
    moved.splice(toIdx, 0, item);
    reorderHabits(catId, moved);
  }

  function moveCategory(fromIdx: number, toIdx: number) {
    if (toIdx < 0 || toIdx >= sortedCategories.length) return;
    const moved = [...sortedCategories];
    const [item] = moved.splice(fromIdx, 1);
    moved.splice(toIdx, 0, item);
    reorderCategories(moved);
  }

  function moveGlobalHabit(fromIdx: number, toIdx: number) {
    if (toIdx < 0 || toIdx >= activeHabits.length) return;
    const moved = [...activeHabits];
    const [item] = moved.splice(fromIdx, 1);
    moved.splice(toIdx, 0, item);
    reorderAllHabits(moved);
  }

  function handleSaveHabit(name: string, emoji: string, description?: string, weeklyGoal?: number, frequencyType?: import('@/lib/storage').FrequencyType, monthlyGoal?: number) {
    if (habitModal.edit) {
      updateHabit(habitModal.edit.id, { name, emoji, description, weeklyGoal, frequencyType, monthlyGoal });
    } else {
      addHabit(name, emoji, habitModal.categoryId, description, weeklyGoal, frequencyType, monthlyGoal);
    }
  }

  function handleSaveCategory(label: string, emoji: string, lifeArea?: LifeArea, deadline?: string) {
    if (categoryModal.edit) {
      updateCategory(categoryModal.edit.id, { label, emoji, lifeArea, deadline });
    } else {
      addCategory(label, emoji, lifeArea);
    }
  }

  return (
    <ScreenContainer>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backBtn}
          activeOpacity={0.5}
        >
          <IconSymbol name="chevron.left" size={20} color={colors.primary} />
          <Text style={[styles.backText, { color: colors.primary }]}>Back</Text>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>Manage Goals</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, minWidth: 60, justifyContent: 'flex-end' }}>
          {/* Reorder goals toggle */}
          <TouchableOpacity
            onPress={() => setReorderingGoals((v) => !v)}
            style={[styles.headerIconBtn, reorderingGoals && { backgroundColor: colors.primary + '22', borderRadius: 8 }]}
            activeOpacity={0.6}
          >
            <IconSymbol name="arrow.up.arrow.down" size={18} color={reorderingGoals ? colors.primary : colors.muted} />
          </TouchableOpacity>
          {!reorderingGoals && (
            <TouchableOpacity
              onPress={() => setCategoryModal({ open: true })}
              style={styles.headerIconBtn}
              activeOpacity={0.6}
            >
              <IconSymbol name="plus.circle.fill" size={22} color={colors.primary} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={[styles.hint, { color: colors.muted }]}>
          {reorderingGoals ? 'Use arrows to reorder goals by priority. Tap the sort icon again to finish.' : 'Tap a goal to expand. Swipe a habit left to delete, or tap the pencil to edit.'}
        </Text>

        {sortedCategories.map((cat, catIdx) => {
          const catHabits = [...habits.filter((h) => h.category === cat.id)].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
          const isExpanded = expandedCat === cat.id && !reorderingGoals;
          const isReordering = reorderingCat === cat.id;

          return (
            <View key={cat.id} style={[styles.categoryBlock, { borderColor: reorderingGoals ? colors.primary + '55' : colors.border }]}>
              {/* Category row */}
              <View style={[styles.categoryRow, { backgroundColor: colors.surface }]}>
                {/* Emoji */}
                <TouchableOpacity
                  onPress={() => !reorderingGoals && setCategoryModal({ open: true, edit: cat })}
                  style={styles.catEmojiBtn}
                  activeOpacity={reorderingGoals ? 1 : 0.6}
                >
                  <Text style={styles.catEmoji}>{cat.emoji}</Text>
                </TouchableOpacity>

                {/* Label area */}
                <TouchableOpacity
                  onPress={() => !reorderingGoals && toggleCategory(cat.id)}
                  style={styles.catInfo}
                  activeOpacity={reorderingGoals ? 1 : 0.7}
                >
                  <Text style={[styles.catLabel, { color: colors.foreground }]}>{cat.label}</Text>
                  <Text style={[styles.catCount, { color: colors.muted }]}>
                    {reorderingGoals ? `Priority #${catIdx + 1}` : `${catHabits.length} habit${catHabits.length !== 1 ? 's' : ''} · ${catHabits.filter((h) => h.isActive).length} active`}
                  </Text>
                </TouchableOpacity>

                {reorderingGoals ? (
                  /* Goal reorder arrows */
                  <View style={styles.catActions}>
                    <TouchableOpacity
                      onPress={() => moveCategory(catIdx, catIdx - 1)}
                      style={[styles.iconBtn, { opacity: catIdx === 0 ? 0.3 : 1 }]}
                      activeOpacity={0.5}
                      disabled={catIdx === 0}
                    >
                      <IconSymbol name="chevron.up" size={20} color={colors.primary} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => moveCategory(catIdx, catIdx + 1)}
                      style={[styles.iconBtn, { opacity: catIdx === sortedCategories.length - 1 ? 0.3 : 1 }]}
                      activeOpacity={0.5}
                      disabled={catIdx === sortedCategories.length - 1}
                    >
                      <IconSymbol name="chevron.down" size={20} color={colors.primary} />
                    </TouchableOpacity>
                  </View>
                ) : (
                  <View style={styles.catActions}>
                    {/* Edit (pencil) — delete is inside this modal */}
                    <TouchableOpacity
                      onPress={() => setCategoryModal({ open: true, edit: cat })}
                      style={styles.iconBtn}
                      activeOpacity={0.5}
                    >
                      <IconSymbol name="pencil" size={16} color={colors.muted} />
                    </TouchableOpacity>
                    {/* Reorder toggle (only when expanded and has >1 habit) */}
                    {isExpanded && catHabits.length > 1 && (
                      <TouchableOpacity
                        onPress={() => setReorderingCat(isReordering ? null : cat.id)}
                        style={[styles.iconBtn, isReordering && { backgroundColor: colors.primary + '22', borderRadius: 6 }]}
                        activeOpacity={0.5}
                      >
                        <IconSymbol name="arrow.up.arrow.down" size={14} color={isReordering ? colors.primary : colors.muted} />
                      </TouchableOpacity>
                    )}
                    {/* Expand/collapse chevron */}
                    <TouchableOpacity
                      onPress={() => { toggleCategory(cat.id); if (isReordering) setReorderingCat(null); }}
                      style={styles.iconBtn}
                      activeOpacity={0.5}
                    >
                      <IconSymbol
                        name={isExpanded ? 'chevron.up' : 'chevron.down'}
                        size={14}
                        color={colors.muted}
                      />
                    </TouchableOpacity>
                  </View>
                )}
              </View>

              {/* Habits list */}
              {isExpanded && (
                <View style={[styles.habitsList, { borderTopColor: colors.border }]}>
                  {catHabits.length === 0 && (
                    <Text style={[styles.emptyHint, { color: colors.muted }]}>No habits yet. Add one below.</Text>
                  )}
                  {catHabits.map((habit, idx) => (
                    isReordering ? (
                      <View
                        key={habit.id}
                        style={[styles.reorderRow, { borderBottomColor: colors.border, backgroundColor: colors.surface }, idx === catHabits.length - 1 && { borderBottomWidth: 0 }]}
                      >
                        <IconSymbol name="line.3.horizontal" size={18} color={colors.muted} style={{ marginRight: 10 }} />
                        <Text style={[styles.habitName, { color: habit.isActive ? colors.foreground : colors.muted, flex: 1 }]}>{habit.name}</Text>
                        <View style={{ flexDirection: 'row', gap: 4 }}>
                          <TouchableOpacity
                            onPress={() => moveHabit(cat.id, idx, idx - 1)}
                            style={[styles.iconBtn, { opacity: idx === 0 ? 0.3 : 1 }]}
                            activeOpacity={0.5}
                            disabled={idx === 0}
                          >
                            <IconSymbol name="chevron.up" size={16} color={colors.primary} />
                          </TouchableOpacity>
                          <TouchableOpacity
                            onPress={() => moveHabit(cat.id, idx, idx + 1)}
                            style={[styles.iconBtn, { opacity: idx === catHabits.length - 1 ? 0.3 : 1 }]}
                            activeOpacity={0.5}
                            disabled={idx === catHabits.length - 1}
                          >
                            <IconSymbol name="chevron.down" size={16} color={colors.primary} />
                          </TouchableOpacity>
                        </View>
                      </View>
                    ) : (
                      <SwipeableHabitRow
                        key={habit.id}
                        habit={habit}
                        habitIndex={idx}
                        isLast={idx === catHabits.length - 1}
                        teamName={habit.teamId ? (teamNameMap[habit.teamId] ?? null) : null}
                        colors={colors}
                        onEdit={() => setHabitModal({ open: true, categoryId: cat.id, edit: habit })}
                        onToggle={() => updateHabit(habit.id, { isActive: !habit.isActive })}
                        onDelete={() => deleteHabit(habit.id)}
                      />
                    )
                  ))}

                  {/* Add habit */}
                  <TouchableOpacity
                    onPress={() => setHabitModal({ open: true, categoryId: cat.id })}
                    style={styles.addHabitBtn}
                    activeOpacity={0.7}
                  >
                    <IconSymbol name="plus.circle" size={16} color={colors.primary} />
                    <Text style={[styles.addHabitText, { color: colors.primary }]}>Add Habit</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          );
        })}

        {/* Add Category */}
        <TouchableOpacity
          onPress={() => setCategoryModal({ open: true })}
          style={[styles.addCategoryBlock, { borderColor: colors.border, backgroundColor: colors.surface }]}
          activeOpacity={0.7}
        >
          <IconSymbol name="plus.circle.fill" size={20} color={colors.primary} />
          <Text style={[styles.addCategoryText, { color: colors.primary }]}>Add New Goal</Text>
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Modals */}
      <HabitModal
        visible={habitModal.open}
        editHabit={habitModal.edit}
        entryCount={habitModal.edit ? (checkIns as CheckInEntry[]).filter((e) => e.habitId === habitModal.edit!.id).length : 0}
        onSave={handleSaveHabit}
        onDelete={(id) => deleteHabit(id)}
        onDeactivate={(id) => updateHabit(id, { isActive: false })}
        onClose={() => setHabitModal({ open: false, categoryId: '' })}
      />
      <CategoryModal
        visible={categoryModal.open}
        editCategory={categoryModal.edit}
        habitCount={categoryModal.edit ? habits.filter((h) => h.category === categoryModal.edit!.id).length : 0}
        onSave={handleSaveCategory}
        onDelete={(id) => deleteCategory(id)}
        onClose={() => setCategoryModal({ open: false })}
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, minWidth: 60 },
  backText: { fontSize: 16 },
  headerTitle: { fontSize: 17, fontWeight: '700' },
  addCatBtn: { padding: 4, minWidth: 60, alignItems: 'flex-end' },
  headerIconBtn: { padding: 6 },

  scroll: { padding: 16 },
  hint: { fontSize: 13, marginBottom: 14, lineHeight: 18 },

  // Category block
  categoryBlock: { borderRadius: 14, borderWidth: 1, marginBottom: 12, overflow: 'hidden' },
  categoryRow: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 10 },
  catEmojiBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 10 },
  catEmoji: { fontSize: 26 },
  catInfo: { flex: 1 },
  catLabel: { fontSize: 16, fontWeight: '700' },
  catCount: { fontSize: 12, marginTop: 1 },
  catActions: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  iconBtn: { padding: 6 },

  // Swipeable habit row
  swipeContainer: { overflow: 'hidden', position: 'relative' },
  deleteBackground: {
    position: 'absolute', right: 0, top: 0, bottom: 0,
    width: DELETE_BG_W, backgroundColor: '#EF4444',
    alignItems: 'center', justifyContent: 'center',
  },
  deleteAction: { alignItems: 'center', justifyContent: 'center', flex: 1, width: '100%', gap: 4 },
  deleteActionText: { color: '#fff', fontSize: 11, fontWeight: '600' },

  habitRow: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12, gap: 10,
  },
  habitEmojiBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  habitEmoji: { fontSize: 22 },
  habitInfo: { flex: 1 },
  habitName: { fontSize: 15, fontWeight: '500' },
  habitInactive: { fontSize: 11, marginTop: 1 },
  habitActions: { flexDirection: 'row', alignItems: 'center', gap: 2 },

  habitsList: { borderTopWidth: StyleSheet.hairlineWidth },
  emptyHint: { fontSize: 13, padding: 14 },
  addHabitBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 12,
  },
  addHabitText: { fontSize: 14, fontWeight: '500' },

  addCategoryBlock: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, padding: 16, borderRadius: 14, borderWidth: 1, borderStyle: 'dashed',
  },
  addCategoryText: { fontSize: 15, fontWeight: '600' },
  fieldLabel: { fontSize: 11, fontWeight: '700', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 },
  lifeAreaChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20, borderWidth: 1 },
  lifeAreaChipText: { fontSize: 12, fontWeight: '600' },

  // Modal
  backdrop: { flex: 1 },
  modalSheet: {
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    borderWidth: 1, padding: 20, paddingBottom: 36,
  },
  handle: { width: 36, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  modalTitle: { fontSize: 18, fontWeight: '700', marginBottom: 16 },
  inputRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  emojiBtn: {
    width: 48, height: 48, borderRadius: 10, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
  },
  emojiBtnText: { fontSize: 26 },
  nameInput: {
    flex: 1, height: 48, borderRadius: 10, borderWidth: 1,
    paddingHorizontal: 12, fontSize: 15,
  },
  modalActions: { flexDirection: 'row', gap: 10 },
  modalBtn: { flex: 1, height: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  modalBtnCancel: { borderWidth: 1 },
  modalBtnSave: {},
  modalBtnText: { fontSize: 15, fontWeight: '600' },

  deleteHabitBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, marginTop: 14, paddingVertical: 12,
    borderRadius: 12, borderWidth: 1,
  },
  deleteHabitText: { fontSize: 14, fontWeight: '600', color: '#EF4444' },

  // Inline confirm panel
  confirmPanel: { marginTop: 14, borderRadius: 12, borderWidth: 1, padding: 14, gap: 8 },
  confirmTitle: { fontSize: 15, fontWeight: '700' },
  confirmSub: { fontSize: 13, lineHeight: 18 },
  confirmBtns: { flexDirection: 'row', gap: 8, marginTop: 4 },
  confirmBtn: { flex: 1, paddingVertical: 10, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  confirmBtnText: { fontSize: 13, fontWeight: '600' },

  habitNumBadge: { width: 28, height: 28, borderRadius: 8, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  habitNumText: { fontSize: 13, fontWeight: '700' },
  charCounter: { fontSize: 11, textAlign: 'right', marginTop: 2 },
  descInput: {
    borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10,
    fontSize: 14, marginBottom: 14, minHeight: 60, textAlignVertical: 'top',
  },
  deadlineBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8,
    height: 44, borderRadius: 10, borderWidth: 1, paddingHorizontal: 12,
  },
  deadlineBtnText: { fontSize: 14, flex: 1 },
  clearDeadlineBtn: { height: 44, paddingHorizontal: 14, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  clearDeadlineText: { fontSize: 13, fontWeight: '600' },
  inlineDatePicker: { borderRadius: 12, borderWidth: 1, padding: 12, marginBottom: 16 },
  datePickerNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  datePickerNavText: { fontSize: 15, fontWeight: '700' },
  datePickerGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  datePickerDay: { width: 36, height: 36, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  datePickerDayText: { fontSize: 13, fontWeight: '500' },
  weeklyGoalRow: { marginTop: 12, marginBottom: 4 },
  weeklyGoalLabel: { fontSize: 13, fontWeight: '600', marginBottom: 8 },
  weeklyGoalBtns: { flexDirection: 'row', gap: 6 },
  weeklyGoalDay: { width: 34, height: 34, borderRadius: 8, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  weeklyGoalDayText: { fontSize: 13, fontWeight: '600' },
  weeklyGoalHint: { fontSize: 11, marginTop: 6 },
  reorderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  teamBadge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginTop: 3,
  },
  teamBadgeText: { fontSize: 11, fontWeight: '600' },
  priorityHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 2,
  },
  priorityTitle: { fontSize: 15, fontWeight: '700', marginBottom: 2 },
  prioritySub: { fontSize: 12 },
  priorityDivider: { flexDirection: 'row', alignItems: 'center', marginBottom: 12, gap: 8 },
  priorityDividerLine: { flex: 1, height: StyleSheet.hairlineWidth },
  priorityDividerLabel: { fontSize: 11, fontWeight: '600', letterSpacing: 1 },
});
