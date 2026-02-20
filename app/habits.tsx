import {
  View, Text, TouchableOpacity, TextInput,
  StyleSheet, Alert, Modal, KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import { useState, useRef, useEffect } from 'react';
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
import { CategoryDef, Habit } from '@/lib/storage';

// Numbered emojis 1–10 then fallback to ⭐
const NUMBER_EMOJIS = ['1️⃣','2️⃣','3️⃣','4️⃣','5️⃣','6️⃣','7️⃣','8️⃣','9️⃣','🔟'];

// ─── Swipeable Habit Row ──────────────────────────────────────────────────────

const SWIPE_THRESHOLD = -80;
const DELETE_BG_W = 80;

interface SwipeableHabitRowProps {
  habit: Habit;
  isLast: boolean;
  onEdit: () => void;
  onToggle: () => void;
  onDelete: () => void;
  colors: ReturnType<typeof import('@/hooks/use-colors').useColors>;
}

function SwipeableHabitRow({ habit, isLast, onEdit, onToggle, onDelete, colors }: SwipeableHabitRowProps) {
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
          {/* Emoji — tap to edit */}
          <TouchableOpacity
            onPress={onEdit}
            style={styles.habitEmojiBtn}
            activeOpacity={0.6}
          >
            <Text style={styles.habitEmoji}>{habit.emoji}</Text>
          </TouchableOpacity>

          <Text
            style={[
              styles.habitName,
              { color: habit.isActive ? colors.foreground : colors.muted },
              !habit.isActive && styles.habitNameInactive,
            ]}
            numberOfLines={2}
          >
            {habit.name}
          </Text>

          <View style={styles.habitActions}>
            {/* Active toggle */}
            <TouchableOpacity
              onPress={onToggle}
              style={[
                styles.toggleBtn,
                { backgroundColor: habit.isActive ? colors.primary + '22' : colors.border },
              ]}
              activeOpacity={0.6}
            >
              <Text style={[styles.toggleText, { color: habit.isActive ? colors.primary : colors.muted }]}>
                {habit.isActive ? 'On' : 'Off'}
              </Text>
            </TouchableOpacity>
            {/* Edit */}
            <TouchableOpacity
              onPress={onEdit}
              style={styles.iconBtn}
              activeOpacity={0.5}
            >
              <IconSymbol name="pencil" size={15} color={colors.muted} />
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
  defaultEmoji?: string;
  onSave: (name: string, emoji: string) => void;
  /** Called when user confirms permanent deletion */
  onDelete?: (habitId: string) => void;
  /** Called when user chooses to deactivate instead of delete */
  onDeactivate?: (habitId: string) => void;
  /** Number of check-in entries associated with this habit */
  entryCount?: number;
  onClose: () => void;
}

function HabitModal({ visible, editHabit, defaultEmoji, onSave, onDelete, onDeactivate, entryCount, onClose }: HabitModalProps) {
  const colors = useColors();
  const [name, setName] = useState(editHabit?.name ?? '');
  const [emoji, setEmoji] = useState(editHabit?.emoji ?? defaultEmoji ?? '1️⃣');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  // Keep a stable ref to the current habit ID so delete always uses the right ID
  const habitIdRef = useRef<string | undefined>(editHabit?.id);
  useEffect(() => {
    if (visible && editHabit?.id) {
      habitIdRef.current = editHabit.id;
    }
  }, [visible, editHabit?.id]);

  function handleSave() {
    if (!name.trim()) return;
    onSave(name.trim(), emoji);
    onClose();
  }

  function handleDelete() {
    const id = habitIdRef.current;
    if (!id) return;
    const hasData = (entryCount ?? 0) > 0;
    const dataWarning = hasData
      ? `\n\nThis will also permanently delete ${entryCount} check-in record${entryCount === 1 ? '' : 's'} associated with this habit.`
      : '';

    const buttons: Parameters<typeof Alert.alert>[2] = [
      { text: 'Cancel', style: 'cancel' },
    ];

    if (hasData) {
      buttons.push({
        text: 'Deactivate Instead',
        style: 'default',
        onPress: () => {
          onClose();
          onDeactivate?.(id);
        },
      });
    }

    buttons.push({
      text: 'Delete Permanently',
      style: 'destructive',
      onPress: () => {
        onClose();
        // Use setTimeout so the modal finishes closing before state updates
        setTimeout(() => onDelete?.(id), 100);
      },
    });

    Alert.alert(
      'Delete Habit',
      `Remove "${editHabit?.name}"?${dataWarning}`,
      buttons,
    );
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
          setEmoji(editHabit?.emoji ?? defaultEmoji ?? '1️⃣');
        }}
      >
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <TouchableOpacity style={styles.backdrop} onPress={onClose} activeOpacity={1} />
          <View style={[styles.modalSheet, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={[styles.handle, { backgroundColor: colors.border }]} />
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>
              {editHabit ? 'Edit Habit' : 'Add Habit'}
            </Text>

            <View style={styles.inputRow}>
              <TouchableOpacity
                onPress={() => setShowEmojiPicker(true)}
                style={[styles.emojiBtn, { backgroundColor: colors.background, borderColor: colors.border }]}
                activeOpacity={0.7}
              >
                <Text style={styles.emojiBtnText}>{emoji}</Text>
              </TouchableOpacity>
              <TextInput
                style={[styles.nameInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
                placeholder="Habit name…"
                placeholderTextColor={colors.muted}
                value={name}
                onChangeText={setName}
                autoFocus
                returnKeyType="done"
                onSubmitEditing={handleSave}
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
                style={[styles.modalBtn, styles.modalBtnSave, { backgroundColor: colors.primary }]}
                activeOpacity={0.8}
              >
                <Text style={[styles.modalBtnText, { color: '#fff' }]}>Save</Text>
              </TouchableOpacity>
            </View>

            {/* Delete button — only shown when editing */}
            {editHabit && onDelete && (
              <TouchableOpacity
                onPress={handleDelete}
                style={[styles.deleteHabitBtn, { borderColor: '#EF444440' }]}
                activeOpacity={0.7}
              >
                <IconSymbol name="trash.fill" size={15} color="#EF4444" />
                <Text style={styles.deleteHabitText}>Delete Habit</Text>
              </TouchableOpacity>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <EmojiPicker
        visible={showEmojiPicker}
        currentEmoji={emoji}
        onSelect={(e) => setEmoji(e)}
        onClose={() => setShowEmojiPicker(false)}
      />
    </>
  );
}

// ─── Add/Edit Category Modal ──────────────────────────────────────────────────

interface CategoryModalProps {
  visible: boolean;
  editCategory?: CategoryDef | null;
  onSave: (label: string, emoji: string) => void;
  onClose: () => void;
}

function CategoryModal({ visible, editCategory, onSave, onClose }: CategoryModalProps) {
  const colors = useColors();
  const [label, setLabel] = useState(editCategory?.label ?? '');
  const [emoji, setEmoji] = useState(editCategory?.emoji ?? '🌟');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  function handleSave() {
    if (!label.trim()) return;
    onSave(label.trim(), emoji);
    onClose();
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
        }}
      >
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <TouchableOpacity style={styles.backdrop} onPress={onClose} activeOpacity={1} />
          <View style={[styles.modalSheet, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={[styles.handle, { backgroundColor: colors.border }]} />
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>
              {editCategory ? 'Edit Category' : 'New Category'}
            </Text>

            <View style={styles.inputRow}>
              <TouchableOpacity
                onPress={() => setShowEmojiPicker(true)}
                style={[styles.emojiBtn, { backgroundColor: colors.background, borderColor: colors.border }]}
                activeOpacity={0.7}
              >
                <Text style={styles.emojiBtnText}>{emoji}</Text>
              </TouchableOpacity>
              <TextInput
                style={[styles.nameInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
                placeholder="Category name…"
                placeholderTextColor={colors.muted}
                value={label}
                onChangeText={setLabel}
                autoFocus
                returnKeyType="done"
                onSubmitEditing={handleSave}
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
                style={[styles.modalBtn, styles.modalBtnSave, { backgroundColor: colors.primary }]}
                activeOpacity={0.8}
              >
                <Text style={[styles.modalBtnText, { color: '#fff' }]}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <EmojiPicker
        visible={showEmojiPicker}
        currentEmoji={emoji}
        onSelect={(e) => setEmoji(e)}
        onClose={() => setShowEmojiPicker(false)}
      />
    </>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function HabitsScreen() {
  const { habits, categories, checkIns, addHabit, updateHabit, deleteHabit, addCategory, updateCategory, deleteCategory } = useApp();
  const colors = useColors();
  const router = useRouter();

  const [expandedCat, setExpandedCat] = useState<string | null>(null);
  const [habitModal, setHabitModal] = useState<{ open: boolean; categoryId: string; edit?: Habit | null }>({ open: false, categoryId: '' });
  const [categoryModal, setCategoryModal] = useState<{ open: boolean; edit?: CategoryDef | null }>({ open: false });

  const sortedCategories = [...categories].sort((a, b) => a.order - b.order);

  function toggleCategory(id: string) {
    setExpandedCat((prev) => (prev === id ? null : id));
  }

  function handleSaveHabit(name: string, emoji: string) {
    if (habitModal.edit) {
      updateHabit(habitModal.edit.id, { name, emoji });
    } else {
      addHabit(name, emoji, habitModal.categoryId);
    }
  }

  function handleDeleteHabit(habitId: string) {
    deleteHabit(habitId);
  }

  function handleDeactivateHabit(habitId: string) {
    updateHabit(habitId, { isActive: false });
  }

  function handleSaveCategory(label: string, emoji: string) {
    if (categoryModal.edit) {
      updateCategory(categoryModal.edit.id, { label, emoji });
    } else {
      addCategory(label, emoji);
    }
  }

  function handleDeleteCategory(cat: CategoryDef) {
    const habitCount = habits.filter((h) => h.category === cat.id).length;
    Alert.alert(
      'Delete Category',
      `Remove "${cat.label}"${habitCount > 0 ? ` and its ${habitCount} habit${habitCount > 1 ? 's' : ''}` : ''}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => deleteCategory(cat.id) },
      ],
    );
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
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>Manage Habits</Text>
        <TouchableOpacity
          onPress={() => setCategoryModal({ open: true })}
          style={styles.addCatBtn}
          activeOpacity={0.6}
        >
          <IconSymbol name="plus.circle.fill" size={22} color={colors.primary} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={[styles.hint, { color: colors.muted }]}>
          Tap a category to expand. Swipe a habit left to delete, or tap the pencil to edit.
        </Text>

        {sortedCategories.map((cat) => {
          const catHabits = habits.filter((h) => h.category === cat.id);
          const isExpanded = expandedCat === cat.id;

          return (
            <View key={cat.id} style={[styles.categoryBlock, { borderColor: colors.border }]}>
              {/* Category row — use View + TouchableOpacity to avoid nested Pressable issues */}
              <View style={[styles.categoryRow, { backgroundColor: colors.surface }]}>
                {/* Tap emoji to edit category */}
                <TouchableOpacity
                  onPress={() => setCategoryModal({ open: true, edit: cat })}
                  style={styles.catEmojiBtn}
                  activeOpacity={0.6}
                >
                  <Text style={styles.catEmoji}>{cat.emoji}</Text>
                </TouchableOpacity>

                {/* Tap label area to expand/collapse */}
                <TouchableOpacity
                  onPress={() => toggleCategory(cat.id)}
                  style={styles.catInfo}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.catLabel, { color: colors.foreground }]}>{cat.label}</Text>
                  <Text style={[styles.catCount, { color: colors.muted }]}>
                    {catHabits.length} habit{catHabits.length !== 1 ? 's' : ''} · {catHabits.filter((h) => h.isActive).length} active
                  </Text>
                </TouchableOpacity>

                <View style={styles.catActions}>
                  <TouchableOpacity
                    onPress={() => setCategoryModal({ open: true, edit: cat })}
                    style={styles.iconBtn}
                    activeOpacity={0.5}
                  >
                    <IconSymbol name="pencil" size={16} color={colors.muted} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => handleDeleteCategory(cat)}
                    style={styles.iconBtn}
                    activeOpacity={0.5}
                  >
                    <IconSymbol name="trash" size={16} color="#EF4444" />
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => toggleCategory(cat.id)}
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
              </View>

              {/* Habits list */}
              {isExpanded && (
                <View style={[styles.habitsList, { borderTopColor: colors.border }]}>
                  {catHabits.length === 0 && (
                    <Text style={[styles.emptyHint, { color: colors.muted }]}>No habits yet. Add one below.</Text>
                  )}
                  {catHabits.map((habit, idx) => (
                    <SwipeableHabitRow
                      key={habit.id}
                      habit={habit}
                      isLast={idx === catHabits.length - 1}
                      colors={colors}
                      onEdit={() => setHabitModal({ open: true, categoryId: cat.id, edit: habit })}
                      onToggle={() => updateHabit(habit.id, { isActive: !habit.isActive })}
                      onDelete={() => handleDeleteHabit(habit.id)}
                    />
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
          <Text style={[styles.addCategoryText, { color: colors.primary }]}>Add New Category</Text>
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Modals */}
      <HabitModal
        visible={habitModal.open}
        editHabit={habitModal.edit}
        defaultEmoji={(() => {
          const catHabits = habits.filter((h) => h.category === habitModal.categoryId);
          return NUMBER_EMOJIS[catHabits.length] ?? '⭐';
        })()}
        onSave={handleSaveHabit}
        onDelete={habitModal.edit ? handleDeleteHabit : undefined}
        onDeactivate={habitModal.edit ? handleDeactivateHabit : undefined}
        entryCount={habitModal.edit ? checkIns.filter((e: { habitId: string }) => e.habitId === habitModal.edit!.id).length : 0}
        onClose={() => setHabitModal({ open: false, categoryId: '' })}
      />
      <CategoryModal
        visible={categoryModal.open}
        editCategory={categoryModal.edit}
        onSave={handleSaveCategory}
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
  deleteAction: { alignItems: 'center', justifyContent: 'center', gap: 2, width: DELETE_BG_W },
  deleteActionText: { color: '#fff', fontSize: 11, fontWeight: '700' },

  // Habits list
  habitsList: { borderTopWidth: StyleSheet.hairlineWidth, paddingBottom: 4 },
  emptyHint: { fontSize: 13, paddingHorizontal: 16, paddingVertical: 12 },
  habitRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 14, paddingVertical: 10, gap: 10,
  },
  habitEmojiBtn: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  habitEmoji: { fontSize: 20 },
  habitName: { flex: 1, fontSize: 14, lineHeight: 18 },
  habitNameInactive: { textDecorationLine: 'line-through' },
  habitActions: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  toggleBtn: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, marginRight: 2 },
  toggleText: { fontSize: 12, fontWeight: '700' },

  // Add habit
  addHabitBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 12 },
  addHabitText: { fontSize: 14, fontWeight: '600' },

  // Add category
  addCategoryBlock: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, borderRadius: 14, borderWidth: 1.5, borderStyle: 'dashed',
    paddingVertical: 16, marginTop: 4,
  },
  addCategoryText: { fontSize: 15, fontWeight: '700' },

  // Modals
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  modalSheet: {
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    borderTopWidth: 1, borderLeftWidth: 1, borderRightWidth: 1,
    padding: 20, paddingBottom: 36,
  },
  handle: { width: 36, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  modalTitle: { fontSize: 18, fontWeight: '700', marginBottom: 16 },
  inputRow: { flexDirection: 'row', gap: 10, marginBottom: 20, alignItems: 'center' },
  emojiBtn: { width: 52, height: 52, borderRadius: 12, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  emojiBtnText: { fontSize: 26 },
  nameInput: { flex: 1, height: 52, borderRadius: 12, borderWidth: 1.5, paddingHorizontal: 14, fontSize: 16 },
  modalActions: { flexDirection: 'row', gap: 10 },
  modalBtn: { flex: 1, height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  modalBtnCancel: { borderWidth: 1.5 },
  modalBtnSave: {},
  modalBtnText: { fontSize: 15, fontWeight: '700' },

  // Delete habit button in modal
  deleteHabitBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, marginTop: 14, paddingVertical: 12,
    borderRadius: 12, borderWidth: 1,
  },
  deleteHabitText: { fontSize: 14, fontWeight: '600', color: '#EF4444' },
});
