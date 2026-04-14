/**
 * TasksPanel — shared task list component used in both the "You" screen
 * and the Journal tab's Tasks modal.
 */
import React from "react";
import {
  View, Text, Pressable, StyleSheet, FlatList, Modal,
  TextInput, KeyboardAvoidingView, ScrollView, Platform,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";

export const TASKS_KEY = "@you_tasks_v1";

export interface Task {
  id: string;
  title: string;
  notes: string;
  dueDate: string | null;
  priority: "high" | "medium" | "low";
  completed: boolean;
  createdAt: string;
}

const PRIORITY_COLORS: Record<Task["priority"], string> = {
  high: "#EF4444",
  medium: "#F59E0B",
  low: "#22C55E",
};

const PRIORITY_LABELS: Record<Task["priority"], string> = {
  high: "High",
  medium: "Medium",
  low: "Low",
};

function generateTaskId() {
  return `task_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

export function TasksPanel() {
  const colors = useColors();
  const [tasks, setTasks] = React.useState<Task[]>([]);
  const [showAdd, setShowAdd] = React.useState(false);
  const [editingTask, setEditingTask] = React.useState<Task | null>(null);
  const [filter, setFilter] = React.useState<"all" | "active" | "done">("active");
  const upsertTaskMutation = trpc.tasks.upsert.useMutation();
  const deleteTaskMutation = trpc.tasks.delete.useMutation();

  // Form state
  const [formTitle, setFormTitle] = React.useState("");
  const [formNotes, setFormNotes] = React.useState("");
  const [formPriority, setFormPriority] = React.useState<Task["priority"]>("medium");
  const [formDue, setFormDue] = React.useState("");

  React.useEffect(() => {
    AsyncStorage.getItem(TASKS_KEY).then((raw) => {
      if (raw) {
        try {
          setTasks(JSON.parse(raw));
        } catch {}
      }
    });
  }, []);

  async function saveTasks(updated: Task[]) {
    setTasks(updated);
    await AsyncStorage.setItem(TASKS_KEY, JSON.stringify(updated));
  }

  function openAdd() {
    setEditingTask(null);
    setFormTitle("");
    setFormNotes("");
    setFormPriority("medium");
    setFormDue("");
    setShowAdd(true);
  }

  function openEdit(task: Task) {
    setEditingTask(task);
    setFormTitle(task.title);
    setFormNotes(task.notes);
    setFormPriority(task.priority);
    setFormDue(task.dueDate ?? "");
    setShowAdd(true);
  }

  async function handleSave() {
    if (!formTitle.trim()) return;
    if (editingTask) {
      const updated = tasks.map((t) =>
        t.id === editingTask.id
          ? { ...t, title: formTitle.trim(), notes: formNotes.trim(), priority: formPriority, dueDate: formDue.trim() || null }
          : t
      );
      await saveTasks(updated);
      const saved = updated.find((t) => t.id === editingTask.id)!;
      upsertTaskMutation.mutate({
        clientId: saved.id, title: saved.title, notes: saved.notes,
        priority: saved.priority, dueDate: saved.dueDate, completed: saved.completed, createdAt: saved.createdAt,
      });
    } else {
      const newTask: Task = {
        id: generateTaskId(), title: formTitle.trim(), notes: formNotes.trim(),
        priority: formPriority, dueDate: formDue.trim() || null,
        completed: false, createdAt: new Date().toISOString(),
      };
      const updated = [newTask, ...tasks];
      await saveTasks(updated);
      upsertTaskMutation.mutate({
        clientId: newTask.id, title: newTask.title, notes: newTask.notes,
        priority: newTask.priority, dueDate: newTask.dueDate, completed: newTask.completed, createdAt: newTask.createdAt,
      });
    }
    setShowAdd(false);
  }

  async function handleToggle(task: Task) {
    const updated = tasks.map((t) =>
      t.id === task.id ? { ...t, completed: !t.completed } : t
    );
    await saveTasks(updated);
    const toggled = updated.find((t) => t.id === task.id)!;
    upsertTaskMutation.mutate({
      clientId: toggled.id, title: toggled.title, notes: toggled.notes,
      priority: toggled.priority, dueDate: toggled.dueDate, completed: toggled.completed, createdAt: toggled.createdAt,
    });
  }

  async function handleDelete(task: Task) {
    const updated = tasks.filter((t) => t.id !== task.id);
    await saveTasks(updated);
    deleteTaskMutation.mutate({ clientId: task.id });
  }

  const filtered = tasks.filter((t) =>
    filter === "all" ? true : filter === "active" ? !t.completed : t.completed
  );
  const activeCount = tasks.filter((t) => !t.completed).length;
  const doneCount = tasks.filter((t) => t.completed).length;

  return (
    <View style={{ flex: 1 }}>
      {/* Filter row */}
      <View style={[tStyles.filterRow, { borderBottomColor: colors.border }]}>
        {(["active", "all", "done"] as const).map((f) => (
          <Pressable
            key={f}
            style={[tStyles.filterTab, filter === f && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]}
            onPress={() => setFilter(f)}
          >
            <Text style={[tStyles.filterTabText, { color: filter === f ? colors.primary : colors.muted }]}>
              {f === "active" ? `Active (${activeCount})` : f === "done" ? `Done (${doneCount})` : `All (${tasks.length})`}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Task list */}
      {filtered.length === 0 ? (
        <View style={tStyles.emptyState}>
          <Text style={tStyles.emptyEmoji}>{filter === "done" ? "✅" : "📋"}</Text>
          <Text style={[tStyles.emptyTitle, { color: colors.foreground }]}>
            {filter === "done" ? "No completed tasks yet" : "No tasks yet"}
          </Text>
          <Text style={[tStyles.emptyDesc, { color: colors.muted }]}>
            {filter === "done" ? "Complete a task to see it here." : "Tap + to add your first task."}
          </Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          contentContainerStyle={tStyles.list}
          renderItem={({ item }) => (
            <Pressable
              style={[tStyles.taskCard, { backgroundColor: colors.surface, borderColor: colors.border, opacity: item.completed ? 0.6 : 1 }]}
              onPress={() => openEdit(item)}
            >
              {/* Checkbox */}
              <Pressable
                style={[tStyles.checkbox, { borderColor: PRIORITY_COLORS[item.priority], backgroundColor: item.completed ? PRIORITY_COLORS[item.priority] : "transparent" }]}
                onPress={(e) => { e.stopPropagation(); handleToggle(item); }}
              >
                {item.completed && <Text style={tStyles.checkmark}>✓</Text>}
              </Pressable>
              {/* Content */}
              <View style={{ flex: 1, gap: 3 }}>
                <Text style={[tStyles.taskTitle, { color: colors.foreground, textDecorationLine: item.completed ? "line-through" : "none" }]}>
                  {item.title}
                </Text>
                {item.notes ? (
                  <Text style={[tStyles.taskNotes, { color: colors.muted }]} numberOfLines={2}>{item.notes}</Text>
                ) : null}
                <View style={tStyles.taskMeta}>
                  <View style={[tStyles.priorityBadge, { backgroundColor: PRIORITY_COLORS[item.priority] + "22" }]}>
                    <Text style={[tStyles.priorityText, { color: PRIORITY_COLORS[item.priority] }]}>
                      {PRIORITY_LABELS[item.priority]}
                    </Text>
                  </View>
                  {item.dueDate ? (
                    <Text style={[tStyles.dueText, { color: colors.muted }]}>Due {item.dueDate}</Text>
                  ) : null}
                </View>
              </View>
              {/* Delete */}
              <Pressable
                style={({ pressed }) => [tStyles.deleteBtn, { opacity: pressed ? 0.5 : 0.4 }]}
                onPress={(e) => { e.stopPropagation(); handleDelete(item); }}
              >
                <Text style={{ fontSize: 16, color: colors.muted }}>✕</Text>
              </Pressable>
            </Pressable>
          )}
        />
      )}

      {/* Floating add button */}
      <Pressable
        style={({ pressed }) => [tStyles.fab, { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 }]}
        onPress={openAdd}
      >
        <Text style={tStyles.fabText}>+</Text>
      </Pressable>

      {/* Add/Edit Modal */}
      <Modal visible={showAdd} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowAdd(false)}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
          <View style={[tStyles.modalContainer, { backgroundColor: colors.background }]}>
            {/* Modal header */}
            <View style={[tStyles.modalHeader, { borderBottomColor: colors.border }]}>
              <Pressable onPress={() => setShowAdd(false)} style={({ pressed }) => [{ opacity: pressed ? 0.5 : 1 }]}>
                <Text style={[tStyles.modalCancel, { color: colors.muted }]}>Cancel</Text>
              </Pressable>
              <Text style={[tStyles.modalTitle, { color: colors.foreground }]}>{editingTask ? "Edit Task" : "New Task"}</Text>
              <Pressable onPress={handleSave} style={({ pressed }) => [{ opacity: pressed ? 0.5 : 1 }]}>
                <Text style={[tStyles.modalSave, { color: colors.primary }]}>Save</Text>
              </Pressable>
            </View>
            <ScrollView style={{ flex: 1 }} contentContainerStyle={tStyles.modalBody} keyboardShouldPersistTaps="handled">
              {/* Title */}
              <Text style={[tStyles.fieldLabel, { color: colors.muted }]}>TASK</Text>
              <TextInput
                style={[tStyles.textInput, { color: colors.foreground, backgroundColor: colors.surface, borderColor: colors.border }]}
                value={formTitle}
                onChangeText={setFormTitle}
                placeholder="What needs to be done?"
                placeholderTextColor={colors.muted}
                autoFocus
                returnKeyType="next"
              />
              {/* Notes */}
              <Text style={[tStyles.fieldLabel, { color: colors.muted }]}>NOTES</Text>
              <TextInput
                style={[tStyles.textInput, tStyles.textArea, { color: colors.foreground, backgroundColor: colors.surface, borderColor: colors.border }]}
                value={formNotes}
                onChangeText={setFormNotes}
                placeholder="Add notes (optional)"
                placeholderTextColor={colors.muted}
                multiline
                numberOfLines={3}
                textAlignVertical="top"
              />
              {/* Priority */}
              <Text style={[tStyles.fieldLabel, { color: colors.muted }]}>PRIORITY</Text>
              <View style={tStyles.priorityRow}>
                {(["high", "medium", "low"] as const).map((p) => (
                  <Pressable
                    key={p}
                    style={[tStyles.priorityChip, { borderColor: PRIORITY_COLORS[p], backgroundColor: formPriority === p ? PRIORITY_COLORS[p] + "33" : "transparent" }]}
                    onPress={() => setFormPriority(p)}
                  >
                    <Text style={[tStyles.priorityChipText, { color: PRIORITY_COLORS[p] }]}>{PRIORITY_LABELS[p]}</Text>
                  </Pressable>
                ))}
              </View>
              {/* Due date */}
              <Text style={[tStyles.fieldLabel, { color: colors.muted }]}>DUE DATE (optional)</Text>
              <TextInput
                style={[tStyles.textInput, { color: colors.foreground, backgroundColor: colors.surface, borderColor: colors.border }]}
                value={formDue}
                onChangeText={setFormDue}
                placeholder="e.g. Mar 30, 2026"
                placeholderTextColor={colors.muted}
                returnKeyType="done"
              />
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const tStyles = StyleSheet.create({
  filterRow: { flexDirection: "row", paddingHorizontal: 20, borderBottomWidth: 1 },
  filterTab: { paddingVertical: 10, paddingHorizontal: 4, marginRight: 20, borderBottomWidth: 2, borderBottomColor: "transparent" },
  filterTabText: { fontSize: 14, fontWeight: "500" },
  list: { padding: 16, gap: 10 },
  emptyState: { flex: 1, alignItems: "center", justifyContent: "center", padding: 40, gap: 8 },
  emptyEmoji: { fontSize: 48, marginBottom: 8 },
  emptyTitle: { fontSize: 18, fontWeight: "700", textAlign: "center" },
  emptyDesc: { fontSize: 14, textAlign: "center", lineHeight: 20 },
  taskCard: { flexDirection: "row", alignItems: "flex-start", borderRadius: 14, borderWidth: 1, padding: 14, gap: 12 },
  checkbox: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, alignItems: "center", justifyContent: "center", marginTop: 1 },
  checkmark: { fontSize: 13, color: "#fff", fontWeight: "700" },
  taskTitle: { fontSize: 15, fontWeight: "600", lineHeight: 21 },
  taskNotes: { fontSize: 13, lineHeight: 18 },
  taskMeta: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4 },
  priorityBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  priorityText: { fontSize: 11, fontWeight: "700" },
  dueText: { fontSize: 12 },
  deleteBtn: { padding: 4, alignSelf: "center" },
  fab: { position: "absolute", bottom: 24, right: 20, width: 52, height: 52, borderRadius: 26, alignItems: "center", justifyContent: "center", shadowColor: "#000", shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.2, shadowRadius: 6, elevation: 6 },
  fabText: { fontSize: 28, color: "#fff", fontWeight: "300", lineHeight: 32 },
  modalContainer: { flex: 1 },
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1 },
  modalTitle: { fontSize: 17, fontWeight: "700" },
  modalCancel: { fontSize: 16 },
  modalSave: { fontSize: 16, fontWeight: "700" },
  modalBody: { padding: 20, gap: 6 },
  fieldLabel: { fontSize: 11, fontWeight: "700", letterSpacing: 0.5, marginBottom: 6, marginTop: 12 },
  textInput: { borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15 },
  textArea: { minHeight: 80, paddingTop: 12 },
  priorityRow: { flexDirection: "row", gap: 10 },
  priorityChip: { flex: 1, paddingVertical: 10, borderRadius: 10, borderWidth: 1.5, alignItems: "center" },
  priorityChipText: { fontSize: 13, fontWeight: "700" },
});
