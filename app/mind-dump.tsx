import {
  View, Text, TextInput, TouchableOpacity, FlatList,
  StyleSheet, Alert, Platform, KeyboardAvoidingView,
} from 'react-native';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { ScreenContainer } from '@/components/screen-container';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useColors } from '@/hooks/use-colors';
import {
  MindDumpItem, MindDumpCategory,
  loadMindDump, saveMindDump, toDateString,
} from '@/lib/storage';

// ─── Category config ──────────────────────────────────────────────────────────
const CATEGORIES: { id: MindDumpCategory; label: string; emoji: string; color: string }[] = [
  { id: 'task',      label: 'Task',      emoji: '✅', color: '#6366F1' },
  { id: 'idea',      label: 'Idea',      emoji: '💡', color: '#F59E0B' },
  { id: 'reminder',  label: 'Reminder',  emoji: '🔔', color: '#0a7ea4' },
  { id: 'worry',     label: 'Worry',     emoji: '😟', color: '#EF4444' },
  { id: 'gratitude', label: 'Gratitude', emoji: '🙏', color: '#22C55E' },
];

function catConfig(id: MindDumpCategory) {
  return CATEGORIES.find((c) => c.id === id) ?? CATEGORIES[0];
}

// ─── Single item row ──────────────────────────────────────────────────────────
function DumpRow({
  item,
  colors,
  onToggleDone,
  onPromote,
  onDelete,
}: {
  item: MindDumpItem;
  colors: ReturnType<typeof useColors>;
  onToggleDone: () => void;
  onPromote: () => void;
  onDelete: () => void;
}) {
  const cat = catConfig(item.category);
  const isPromoted = !!item.promotedToDate;

  return (
    <View style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      {/* Done checkbox */}
      <TouchableOpacity
        onPress={onToggleDone}
        style={[styles.checkbox, { borderColor: item.done ? cat.color : colors.border, backgroundColor: item.done ? cat.color : 'transparent' }]}
        activeOpacity={0.7}
      >
        {item.done && <IconSymbol name="checkmark" size={12} color="#fff" />}
      </TouchableOpacity>

      {/* Content */}
      <View style={{ flex: 1, gap: 4 }}>
        <Text style={[styles.itemText, { color: item.done ? colors.muted : colors.foreground, textDecorationLine: item.done ? 'line-through' : 'none' }]}>
          {item.text}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <View style={[styles.catBadge, { backgroundColor: cat.color + '22', borderColor: cat.color + '55' }]}>
            <Text style={[styles.catBadgeText, { color: cat.color }]}>{cat.emoji} {cat.label}</Text>
          </View>
          {isPromoted && (
            <View style={[styles.catBadge, { backgroundColor: colors.success + '22', borderColor: colors.success + '55' }]}>
              <Text style={[styles.catBadgeText, { color: colors.success }]}>📋 Added to {item.promotedToDate === toDateString() ? 'Today' : item.promotedToDate}</Text>
            </View>
          )}
        </View>
      </View>

      {/* Actions */}
      <View style={{ gap: 6 }}>
        {!isPromoted && !item.done && (
          <TouchableOpacity
            onPress={onPromote}
            style={[styles.actionBtn, { backgroundColor: colors.primary + '18', borderColor: colors.primary + '44' }]}
            activeOpacity={0.7}
          >
            <Text style={[styles.actionBtnText, { color: colors.primary }]}>+ Today</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          onPress={onDelete}
          style={[styles.actionBtn, { backgroundColor: '#EF444418', borderColor: '#EF444444' }]}
          activeOpacity={0.7}
        >
          <IconSymbol name="trash.fill" size={12} color="#EF4444" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function MindDumpScreen() {
  const colors = useColors();
  const router = useRouter();

  const [items, setItems] = useState<MindDumpItem[]>([]);
  const [text, setText] = useState('');
  const [selectedCat, setSelectedCat] = useState<MindDumpCategory>('task');
  const [filter, setFilter] = useState<MindDumpCategory | 'all'>('all');

  useEffect(() => {
    loadMindDump().then(setItems);
  }, []);

  async function persist(next: MindDumpItem[]) {
    setItems(next);
    await saveMindDump(next);
  }

  const addItem = useCallback(async () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const newItem: MindDumpItem = {
      id: `md_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      text: trimmed,
      category: selectedCat,
      createdAt: new Date().toISOString(),
      done: false,
    };
    await persist([newItem, ...items]);
    setText('');
  }, [text, selectedCat, items]);

  const toggleDone = useCallback(async (id: string) => {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await persist(items.map((i) => i.id === id ? { ...i, done: !i.done } : i));
  }, [items]);

  const promoteToToday = useCallback(async (id: string) => {
    if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const today = toDateString();
    await persist(items.map((i) => i.id === id ? { ...i, promotedToDate: today } : i));
    Alert.alert('Added to Today', 'This item has been marked for today\'s focus. You\'ll see it in your check-in.');
  }, [items]);

  const deleteItem = useCallback(async (id: string) => {
    Alert.alert('Delete item?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          await persist(items.filter((i) => i.id !== id));
        },
      },
    ]);
  }, [items]);

  const clearDone = useCallback(async () => {
    Alert.alert('Clear completed?', 'Remove all checked-off items?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear', style: 'destructive',
        onPress: async () => { await persist(items.filter((i) => !i.done)); },
      },
    ]);
  }, [items]);

  const filtered = filter === 'all' ? items : items.filter((i) => i.category === filter);
  const doneCount = items.filter((i) => i.done).length;

  return (
    <ScreenContainer>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.5}>
          <IconSymbol name="chevron.left" size={20} color={colors.primary} />
          <Text style={[styles.backText, { color: colors.primary }]}>Back</Text>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>Mind Dump</Text>
        <View style={{ minWidth: 60, alignItems: 'flex-end' }}>
          {doneCount > 0 && (
            <TouchableOpacity onPress={clearDone} activeOpacity={0.7}>
              <Text style={[styles.clearBtn, { color: colors.muted }]}>Clear done</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        {/* Input area */}
        <View style={[styles.inputCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {/* Category selector */}
          <View style={styles.catRow}>
            {CATEGORIES.map((cat) => (
              <TouchableOpacity
                key={cat.id}
                onPress={() => setSelectedCat(cat.id)}
                style={[
                  styles.catChip,
                  {
                    backgroundColor: selectedCat === cat.id ? cat.color + '22' : 'transparent',
                    borderColor: selectedCat === cat.id ? cat.color : colors.border,
                  },
                ]}
                activeOpacity={0.7}
              >
                <Text style={styles.catChipEmoji}>{cat.emoji}</Text>
                <Text style={[styles.catChipLabel, { color: selectedCat === cat.id ? cat.color : colors.muted }]}>{cat.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Text input + send */}
          <View style={styles.inputRow}>
            <TextInput
              style={[styles.input, { color: colors.foreground, backgroundColor: colors.background, borderColor: colors.border }]}
              placeholder="What's on your mind…"
              placeholderTextColor={colors.muted}
              value={text}
              onChangeText={setText}
              returnKeyType="done"
              onSubmitEditing={addItem}
              multiline={false}
            />
            <TouchableOpacity
              onPress={addItem}
              style={[styles.sendBtn, { backgroundColor: text.trim() ? colors.primary : colors.border }]}
              activeOpacity={0.8}
              disabled={!text.trim()}
            >
              <IconSymbol name="paperplane.fill" size={16} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Filter tabs */}
        <View style={[styles.filterRow, { borderBottomColor: colors.border }]}>
          <TouchableOpacity
            onPress={() => setFilter('all')}
            style={[styles.filterTab, filter === 'all' && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]}
            activeOpacity={0.7}
          >
            <Text style={[styles.filterTabText, { color: filter === 'all' ? colors.primary : colors.muted }]}>All ({items.length})</Text>
          </TouchableOpacity>
          {CATEGORIES.map((cat) => {
            const count = items.filter((i) => i.category === cat.id).length;
            if (count === 0) return null;
            return (
              <TouchableOpacity
                key={cat.id}
                onPress={() => setFilter(cat.id)}
                style={[styles.filterTab, filter === cat.id && { borderBottomColor: cat.color, borderBottomWidth: 2 }]}
                activeOpacity={0.7}
              >
                <Text style={[styles.filterTabText, { color: filter === cat.id ? cat.color : colors.muted }]}>
                  {cat.emoji} {count}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Items list */}
        <FlatList
          data={filtered}
          keyExtractor={(i) => i.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={[styles.emptyEmoji]}>🧠</Text>
              <Text style={[styles.emptyTitle, { color: colors.foreground }]}>Nothing here yet</Text>
              <Text style={[styles.emptyHint, { color: colors.muted }]}>
                Capture tasks, ideas, reminders, or worries before you sleep. Promote any item to today's check-in when you wake up.
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <DumpRow
              item={item}
              colors={colors}
              onToggleDone={() => toggleDone(item.id)}
              onPromote={() => promoteToToday(item.id)}
              onDelete={() => deleteItem(item.id)}
            />
          )}
        />
      </KeyboardAvoidingView>
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
  clearBtn: { fontSize: 13 },

  inputCard: {
    margin: 16, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth,
    padding: 12, gap: 10,
  },
  catRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  catChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: 20, borderWidth: 1,
  },
  catChipEmoji: { fontSize: 13 },
  catChipLabel: { fontSize: 12, fontWeight: '600' },

  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  input: {
    flex: 1, height: 42, borderRadius: 10, borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12, fontSize: 15,
  },
  sendBtn: {
    width: 42, height: 42, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },

  filterRow: {
    flexDirection: 'row', paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  filterTab: { paddingHorizontal: 8, paddingVertical: 10, marginRight: 4 },
  filterTabText: { fontSize: 13, fontWeight: '600' },

  list: { padding: 16, gap: 10, paddingBottom: 40 },

  row: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    padding: 12, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth,
  },
  checkbox: {
    width: 22, height: 22, borderRadius: 6, borderWidth: 1.5,
    alignItems: 'center', justifyContent: 'center', marginTop: 1,
  },
  itemText: { fontSize: 15, lineHeight: 22 },
  catBadge: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 7, paddingVertical: 2,
    borderRadius: 8, borderWidth: 1,
  },
  catBadgeText: { fontSize: 11, fontWeight: '600' },

  actionBtn: {
    paddingHorizontal: 8, paddingVertical: 4,
    borderRadius: 7, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
  },
  actionBtnText: { fontSize: 11, fontWeight: '700' },

  emptyState: { alignItems: 'center', paddingTop: 60, gap: 10, paddingHorizontal: 32 },
  emptyEmoji: { fontSize: 48 },
  emptyTitle: { fontSize: 18, fontWeight: '700' },
  emptyHint: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
});
