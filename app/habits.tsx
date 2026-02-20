import {
  View, Text, Pressable, TextInput, FlatList,
  StyleSheet, Alert, Modal, KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import { useState } from 'react';
import { useRouter } from 'expo-router';
import { ScreenContainer } from '@/components/screen-container';
import { EmojiPicker } from '@/components/emoji-picker';
import { useApp } from '@/lib/app-context';
import { useColors } from '@/hooks/use-colors';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { CategoryDef, Habit } from '@/lib/storage';

// ─── Add/Edit Habit Modal ─────────────────────────────────────────────────────

interface HabitModalProps {
  visible: boolean;
  editHabit?: Habit | null;
  onSave: (name: string, emoji: string) => void;
  onClose: () => void;
}

function HabitModal({ visible, editHabit, onSave, onClose }: HabitModalProps) {
  const colors = useColors();
  const [name, setName] = useState(editHabit?.name ?? '');
  const [emoji, setEmoji] = useState(editHabit?.emoji ?? '⭐');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  function handleSave() {
    if (!name.trim()) return;
    onSave(name.trim(), emoji);
    onClose();
  }

  return (
    <>
      <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <Pressable style={styles.backdrop} onPress={onClose} />
          <View style={[styles.modalSheet, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={[styles.handle, { backgroundColor: colors.border }]} />
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>
              {editHabit ? 'Edit Habit' : 'Add Habit'}
            </Text>

            <View style={styles.inputRow}>
              <Pressable
                onPress={() => setShowEmojiPicker(true)}
                style={({ pressed }) => [
                  styles.emojiBtn,
                  { backgroundColor: colors.background, borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
                ]}
              >
                <Text style={styles.emojiBtnText}>{emoji}</Text>
              </Pressable>
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
              <Pressable
                onPress={onClose}
                style={({ pressed }) => [styles.modalBtn, styles.modalBtnCancel, { borderColor: colors.border, opacity: pressed ? 0.7 : 1 }]}
              >
                <Text style={[styles.modalBtnText, { color: colors.muted }]}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={handleSave}
                style={({ pressed }) => [styles.modalBtn, styles.modalBtnSave, { backgroundColor: colors.primary, opacity: pressed ? 0.8 : 1 }]}
              >
                <Text style={[styles.modalBtnText, { color: '#fff' }]}>Save</Text>
              </Pressable>
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
      <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <Pressable style={styles.backdrop} onPress={onClose} />
          <View style={[styles.modalSheet, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={[styles.handle, { backgroundColor: colors.border }]} />
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>
              {editCategory ? 'Edit Category' : 'New Category'}
            </Text>

            <View style={styles.inputRow}>
              <Pressable
                onPress={() => setShowEmojiPicker(true)}
                style={({ pressed }) => [
                  styles.emojiBtn,
                  { backgroundColor: colors.background, borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
                ]}
              >
                <Text style={styles.emojiBtnText}>{emoji}</Text>
              </Pressable>
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
              <Pressable
                onPress={onClose}
                style={({ pressed }) => [styles.modalBtn, styles.modalBtnCancel, { borderColor: colors.border, opacity: pressed ? 0.7 : 1 }]}
              >
                <Text style={[styles.modalBtnText, { color: colors.muted }]}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={handleSave}
                style={({ pressed }) => [styles.modalBtn, styles.modalBtnSave, { backgroundColor: colors.primary, opacity: pressed ? 0.8 : 1 }]}
              >
                <Text style={[styles.modalBtnText, { color: '#fff' }]}>Save</Text>
              </Pressable>
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
  const { habits, categories, addHabit, updateHabit, deleteHabit, addCategory, updateCategory, deleteCategory } = useApp();
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

  function handleDeleteHabit(habit: Habit) {
    Alert.alert('Delete Habit', `Remove "${habit.name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteHabit(habit.id) },
    ]);
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
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [styles.backBtn, { opacity: pressed ? 0.5 : 1 }]}
        >
          <IconSymbol name="chevron.left" size={20} color={colors.primary} />
          <Text style={[styles.backText, { color: colors.primary }]}>Back</Text>
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>Manage Habits</Text>
        <Pressable
          onPress={() => setCategoryModal({ open: true })}
          style={({ pressed }) => [styles.addCatBtn, { opacity: pressed ? 0.6 : 1 }]}
        >
          <IconSymbol name="plus.circle.fill" size={22} color={colors.primary} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={[styles.hint, { color: colors.muted }]}>
          Tap a category to expand its habits. Tap the emoji on any category or habit to change it.
        </Text>

        {sortedCategories.map((cat) => {
          const catHabits = habits.filter((h) => h.category === cat.id);
          const isExpanded = expandedCat === cat.id;

          return (
            <View key={cat.id} style={[styles.categoryBlock, { borderColor: colors.border }]}>
              {/* Category row */}
              <Pressable
                onPress={() => toggleCategory(cat.id)}
                style={({ pressed }) => [
                  styles.categoryRow,
                  { backgroundColor: colors.surface, opacity: pressed ? 0.85 : 1 },
                ]}
              >
                {/* Emoji — tap to change */}
                <Pressable
                  onPress={() => setCategoryModal({ open: true, edit: cat })}
                  style={({ pressed }) => [styles.catEmojiBtn, { opacity: pressed ? 0.6 : 1 }]}
                >
                  <Text style={styles.catEmoji}>{cat.emoji}</Text>
                </Pressable>

                <View style={styles.catInfo}>
                  <Text style={[styles.catLabel, { color: colors.foreground }]}>{cat.label}</Text>
                  <Text style={[styles.catCount, { color: colors.muted }]}>
                    {catHabits.length} habit{catHabits.length !== 1 ? 's' : ''} · {catHabits.filter((h) => h.isActive).length} active
                  </Text>
                </View>

                <View style={styles.catActions}>
                  <Pressable
                    onPress={() => setCategoryModal({ open: true, edit: cat })}
                    style={({ pressed }) => [styles.iconBtn, { opacity: pressed ? 0.5 : 1 }]}
                  >
                    <IconSymbol name="pencil" size={16} color={colors.muted} />
                  </Pressable>
                  <Pressable
                    onPress={() => handleDeleteCategory(cat)}
                    style={({ pressed }) => [styles.iconBtn, { opacity: pressed ? 0.5 : 1 }]}
                  >
                    <IconSymbol name="trash" size={16} color="#EF4444" />
                  </Pressable>
                  <IconSymbol
                    name={isExpanded ? 'chevron.up' : 'chevron.down'}
                    size={14}
                    color={colors.muted}
                  />
                </View>
              </Pressable>

              {/* Habits list */}
              {isExpanded && (
                <View style={[styles.habitsList, { borderTopColor: colors.border }]}>
                  {catHabits.length === 0 && (
                    <Text style={[styles.emptyHint, { color: colors.muted }]}>No habits yet. Add one below.</Text>
                  )}
                  {catHabits.map((habit, idx) => (
                    <View
                      key={habit.id}
                      style={[
                        styles.habitRow,
                        { borderBottomColor: colors.border },
                        idx === catHabits.length - 1 && { borderBottomWidth: 0 },
                      ]}
                    >
                      {/* Habit emoji — tap to edit */}
                      <Pressable
                        onPress={() => setHabitModal({ open: true, categoryId: cat.id, edit: habit })}
                        style={({ pressed }) => [styles.habitEmojiBtn, { opacity: pressed ? 0.6 : 1 }]}
                      >
                        <Text style={styles.habitEmoji}>{habit.emoji}</Text>
                      </Pressable>

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
                        <Pressable
                          onPress={() => updateHabit(habit.id, { isActive: !habit.isActive })}
                          style={({ pressed }) => [
                            styles.toggleBtn,
                            { backgroundColor: habit.isActive ? colors.primary + '22' : colors.border, opacity: pressed ? 0.6 : 1 },
                          ]}
                        >
                          <Text style={[styles.toggleText, { color: habit.isActive ? colors.primary : colors.muted }]}>
                            {habit.isActive ? 'On' : 'Off'}
                          </Text>
                        </Pressable>
                        {/* Edit */}
                        <Pressable
                          onPress={() => setHabitModal({ open: true, categoryId: cat.id, edit: habit })}
                          style={({ pressed }) => [styles.iconBtn, { opacity: pressed ? 0.5 : 1 }]}
                        >
                          <IconSymbol name="pencil" size={15} color={colors.muted} />
                        </Pressable>
                        {/* Delete */}
                        <Pressable
                          onPress={() => handleDeleteHabit(habit)}
                          style={({ pressed }) => [styles.iconBtn, { opacity: pressed ? 0.5 : 1 }]}
                        >
                          <IconSymbol name="trash" size={15} color="#EF4444" />
                        </Pressable>
                      </View>
                    </View>
                  ))}

                  {/* Add habit */}
                  <Pressable
                    onPress={() => setHabitModal({ open: true, categoryId: cat.id })}
                    style={({ pressed }) => [styles.addHabitBtn, { opacity: pressed ? 0.7 : 1 }]}
                  >
                    <IconSymbol name="plus.circle" size={16} color={colors.primary} />
                    <Text style={[styles.addHabitText, { color: colors.primary }]}>Add Habit</Text>
                  </Pressable>
                </View>
              )}
            </View>
          );
        })}

        {/* Add Category */}
        <Pressable
          onPress={() => setCategoryModal({ open: true })}
          style={({ pressed }) => [
            styles.addCategoryBlock,
            { borderColor: colors.border, backgroundColor: colors.surface, opacity: pressed ? 0.7 : 1 },
          ]}
        >
          <IconSymbol name="plus.circle.fill" size={20} color={colors.primary} />
          <Text style={[styles.addCategoryText, { color: colors.primary }]}>Add New Category</Text>
        </Pressable>

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Modals */}
      <HabitModal
        visible={habitModal.open}
        editHabit={habitModal.edit}
        onSave={handleSaveHabit}
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

  // Habits list
  habitsList: { borderTopWidth: StyleSheet.hairlineWidth, paddingBottom: 4 },
  emptyHint: { fontSize: 13, paddingHorizontal: 16, paddingVertical: 12 },
  habitRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 14, paddingVertical: 10, gap: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
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
});
