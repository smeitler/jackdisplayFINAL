import {
  ScrollView, Text, View, Pressable, StyleSheet,
  TextInput, Platform, KeyboardAvoidingView, Alert,
} from "react-native";
import { useRouter } from "expo-router";
import { useState } from "react";
import { ScreenContainer } from "@/components/screen-container";
import { useApp } from "@/lib/app-context";
import { useColors } from "@/hooks/use-colors";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { Category } from "@/lib/storage";
import * as Haptics from "expo-haptics";

const CATEGORY_META: Record<Category, { label: string; emoji: string; colorKey: string }> = {
  health: { label: 'Health', emoji: '💪', colorKey: 'health' },
  relationships: { label: 'Relationships', emoji: '❤️', colorKey: 'relationships' },
  wealth: { label: 'Wealth', emoji: '💰', colorKey: 'wealth' },
  mindset: { label: 'Mindset', emoji: '🧠', colorKey: 'mindset' },
};

const CATEGORY_ORDER: Category[] = ['health', 'relationships', 'wealth', 'mindset'];

export default function HabitsScreen() {
  const { habits, addHabit, updateHabit, deleteHabit } = useApp();
  const colors = useColors();
  const router = useRouter();

  const [addingCategory, setAddingCategory] = useState<Category | null>(null);
  const [newHabitName, setNewHabitName] = useState('');

  async function handleAdd() {
    if (!addingCategory || !newHabitName.trim()) return;
    if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await addHabit(newHabitName.trim(), addingCategory);
    setNewHabitName('');
    setAddingCategory(null);
  }

  async function handleToggleActive(id: string, current: boolean) {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await updateHabit(id, { isActive: !current });
  }

  function handleDelete(id: string, name: string) {
    if (Platform.OS === 'web') {
      if (window.confirm(`Delete "${name}"?`)) {
        deleteHabit(id);
      }
    } else {
      Alert.alert('Delete Habit', `Delete "${name}"?`, [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete', style: 'destructive',
          onPress: () => {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            deleteHabit(id);
          },
        },
      ]);
    }
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScreenContainer edges={["top", "left", "right"]}>
        {/* Header */}
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <Pressable
            onPress={() => router.back()}
            style={({ pressed }) => [styles.closeBtn, { opacity: pressed ? 0.6 : 1 }]}
          >
            <IconSymbol name="xmark" size={18} color={colors.muted} />
          </Pressable>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>Manage Habits</Text>
          <View style={styles.closeBtn} />
        </View>

        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {CATEGORY_ORDER.map((category) => {
            const meta = CATEGORY_META[category];
            const catColor = (colors as Record<string, string>)[meta.colorKey] ?? colors.primary;
            const catHabits = habits.filter((h) => h.category === category);
            const isAdding = addingCategory === category;

            return (
              <View key={category} style={styles.categorySection}>
                {/* Category header */}
                <View style={styles.categoryHeader}>
                  <View style={[styles.categoryIconWrap, { backgroundColor: catColor + '22' }]}>
                    <Text style={styles.categoryEmoji}>{meta.emoji}</Text>
                  </View>
                  <Text style={[styles.categoryTitle, { color: colors.foreground }]}>{meta.label}</Text>
                  <Pressable
                    onPress={() => {
                      setAddingCategory(isAdding ? null : category);
                      setNewHabitName('');
                    }}
                    style={({ pressed }) => [
                      styles.addBtn,
                      { backgroundColor: catColor + '22', opacity: pressed ? 0.7 : 1 },
                    ]}
                  >
                    <IconSymbol name={isAdding ? "xmark" : "plus"} size={16} color={catColor} />
                  </Pressable>
                </View>

                {/* Add habit input */}
                {isAdding && (
                  <View style={[styles.addInputRow, { backgroundColor: colors.surface, borderColor: catColor }]}>
                    <TextInput
                      style={[styles.addInput, { color: colors.foreground }]}
                      placeholder="New habit name…"
                      placeholderTextColor={colors.muted}
                      value={newHabitName}
                      onChangeText={setNewHabitName}
                      autoFocus
                      returnKeyType="done"
                      onSubmitEditing={handleAdd}
                    />
                    <Pressable
                      onPress={handleAdd}
                      style={({ pressed }) => [
                        styles.addConfirmBtn,
                        { backgroundColor: catColor, opacity: pressed ? 0.8 : 1 },
                      ]}
                    >
                      <IconSymbol name="checkmark" size={16} color="#fff" />
                    </Pressable>
                  </View>
                )}

                {/* Habit list */}
                {catHabits.length > 0 ? (
                  <View style={[styles.habitList, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    {catHabits.map((habit, idx) => {
                      const isLast = idx === catHabits.length - 1;
                      return (
                        <View
                          key={habit.id}
                          style={[
                            styles.habitItem,
                            !isLast && { borderBottomWidth: 1, borderBottomColor: colors.border },
                          ]}
                        >
                          <Pressable
                            onPress={() => handleToggleActive(habit.id, habit.isActive)}
                            style={({ pressed }) => [styles.habitToggle, { opacity: pressed ? 0.7 : 1 }]}
                          >
                            <View
                              style={[
                                styles.toggleDot,
                                habit.isActive
                                  ? { backgroundColor: catColor }
                                  : { backgroundColor: colors.border },
                              ]}
                            />
                          </Pressable>
                          <Text
                            style={[
                              styles.habitName,
                              { color: habit.isActive ? colors.foreground : colors.muted },
                              !habit.isActive && styles.habitNameInactive,
                            ]}
                          >
                            {habit.name}
                          </Text>
                          <Pressable
                            onPress={() => handleDelete(habit.id, habit.name)}
                            style={({ pressed }) => [styles.deleteBtn, { opacity: pressed ? 0.6 : 1 }]}
                          >
                            <IconSymbol name="trash.fill" size={16} color={colors.error} />
                          </Pressable>
                        </View>
                      );
                    })}
                  </View>
                ) : (
                  <View style={[styles.emptyHabits, { borderColor: colors.border }]}>
                    <Text style={[styles.emptyText, { color: colors.muted }]}>
                      No habits yet — tap + to add one
                    </Text>
                  </View>
                )}
              </View>
            );
          })}

          <View style={{ height: 40 }} />
        </ScrollView>
      </ScreenContainer>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1,
  },
  closeBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 16, fontWeight: '700' },
  scroll: { padding: 16, paddingBottom: 20 },
  categorySection: { marginBottom: 20 },
  categoryHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  categoryIconWrap: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  categoryEmoji: { fontSize: 18 },
  categoryTitle: { flex: 1, fontSize: 16, fontWeight: '700' },
  addBtn: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  addInputRow: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: 12, borderWidth: 1.5, overflow: 'hidden',
    marginBottom: 8,
  },
  addInput: { flex: 1, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15 },
  addConfirmBtn: { paddingHorizontal: 16, paddingVertical: 12, alignItems: 'center', justifyContent: 'center' },
  habitList: { borderRadius: 14, borderWidth: 1, overflow: 'hidden' },
  habitItem: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 14, paddingVertical: 13,
  },
  habitToggle: { padding: 4 },
  toggleDot: { width: 12, height: 12, borderRadius: 6 },
  habitName: { flex: 1, fontSize: 15 },
  habitNameInactive: { textDecorationLine: 'line-through' },
  deleteBtn: { padding: 6 },
  emptyHabits: {
    borderRadius: 14, borderWidth: 1, borderStyle: 'dashed',
    padding: 20, alignItems: 'center',
  },
  emptyText: { fontSize: 13 },
});
