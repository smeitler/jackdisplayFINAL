/**
 * TasksPanel — full-featured task list.
 * Features: due dates (overdue/today color), priority levels, swipe-to-complete/delete,
 * drag-to-reorder, categories (life areas), subtasks, recurring tasks, today view,
 * task count badge, completion streak.
 */
import React, { useCallback, useMemo } from "react";
import {
  View, Text, Pressable, StyleSheet, Modal, Platform,
  TextInput, KeyboardAvoidingView, ScrollView, TouchableOpacity, Alert,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";
import * as Haptics from "expo-haptics";
import DraggableFlatList, { RenderItemParams, ScaleDecorator } from "react-native-draggable-flatlist";
import { GestureHandlerRootView, Swipeable } from "react-native-gesture-handler";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";

export const TASKS_KEY = "@you_tasks_v2";

export interface Subtask {
  id: string;
  title: string;
  completed: boolean;
}

export interface Task {
  id: string;
  title: string;
  notes: string;
  dueDate: string | null;
  priority: "high" | "medium" | "low";
  completed: boolean;
  createdAt: string;
  category: string | null;
  subtasks: Subtask[];
  recurring: "daily" | "weekly" | null;
  sortOrder: number;
  completedAt: string | null;
}

const LIFE_AREAS: { id: string; label: string; icon: React.ComponentProps<typeof MaterialIcons>["name"] }[] = [
  { id: "body",          label: "Body",         icon: "fitness-center" },
  { id: "mind",          label: "Mind",         icon: "psychology" },
  { id: "relationships", label: "Relationships", icon: "favorite" },
  { id: "focus",         label: "Focus",        icon: "my-location" },
  { id: "career",        label: "Career",       icon: "work" },
  { id: "money",         label: "Money",        icon: "payments" },
  { id: "contribution",  label: "Contribution", icon: "volunteer-activism" },
  { id: "spirituality",  label: "Spirituality", icon: "wb-sunny" },
];

const PRIORITY_COLORS = { high: "#EF4444", medium: "#F59E0B", low: "#22C55E" };
const PRIORITY_LABELS = { high: "High", medium: "Medium", low: "Low" };

function todayStr() {
  const d = new Date();
  return (
    d.getFullYear() +
    "-" +
    String(d.getMonth() + 1).padStart(2, "0") +
    "-" +
    String(d.getDate()).padStart(2, "0")
  );
}

function generateId() {
  return "task_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7);
}

function dueDateColor(dueDate: string | null, completed: boolean): string | null {
  if (!dueDate || completed) return null;
  const today = todayStr();
  if (dueDate < today) return "#EF4444";
  if (dueDate === today) return "#F59E0B";
  return null;
}

function formatDue(dueDate: string): string {
  const today = todayStr();
  if (dueDate === today) return "Due today";
  if (dueDate < today) {
    const diff = Math.round(
      (new Date(today).getTime() - new Date(dueDate).getTime()) / 86400000
    );
    return diff + "d overdue";
  }
  const parts = dueDate.split("-");
  const m = parseInt(parts[1], 10);
  const day = parseInt(parts[2], 10);
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return "Due " + months[m - 1] + " " + day;
}

function computeStreak(tasks: Task[]): number {
  const completedDates = new Set<string>();
  for (const t of tasks) {
    if (t.completedAt) completedDates.add(t.completedAt);
  }
  if (completedDates.size === 0) return 0;
  const today = todayStr();
  const d0 = new Date(today);
  d0.setDate(d0.getDate() - 1);
  const yesterday: string = d0.toISOString().slice(0, 10);
  let cursor: string | null = completedDates.has(today)
    ? today
    : completedDates.has(yesterday)
    ? yesterday
    : null;
  if (!cursor) return 0;
  let streak = 0;
  while (completedDates.has(cursor!)) {
    streak++;
    const d: Date = new Date(cursor!);
    d.setDate(d.getDate() - 1);
    cursor = d.toISOString().slice(0, 10);
  }
  return streak;
}

/** Exported: count of active (non-completed) tasks for badge display. */
export function useTaskCount(): number {
  const [count, setCount] = React.useState(0);
  React.useEffect(() => {
    AsyncStorage.getItem(TASKS_KEY).then((raw) => {
      if (!raw) return;
      try {
        const tasks: Task[] = JSON.parse(raw);
        setCount(tasks.filter((t) => !t.completed).length);
      } catch {}
    });
  }, []);
  return count;
}

// ─── Main Component ───────────────────────────────────────────────────────────
export function TasksPanel() {
  const colors = useColors();
  const [tasks, setTasks] = React.useState<Task[]>([]);
  const [filter, setFilter] = React.useState<"today" | "active" | "all" | "done">("today");
  const [showAdd, setShowAdd] = React.useState(false);
  const [editingTask, setEditingTask] = React.useState<Task | null>(null);

  // Form state
  const [formTitle, setFormTitle] = React.useState("");
  const [formNotes, setFormNotes] = React.useState("");
  const [formPriority, setFormPriority] = React.useState<Task["priority"]>("medium");
  const [formDue, setFormDue] = React.useState("");
  const [formCategory, setFormCategory] = React.useState<string | null>(null);
  const [formRecurring, setFormRecurring] = React.useState<Task["recurring"]>(null);
  const [formSubtasks, setFormSubtasks] = React.useState<Subtask[]>([]);
  const [newSubtaskTitle, setNewSubtaskTitle] = React.useState("");

  const upsertTaskMutation = trpc.tasks.upsert.useMutation();
  const deleteTaskMutation = trpc.tasks.delete.useMutation();

  React.useEffect(() => {
    AsyncStorage.getItem(TASKS_KEY).then((raw) => {
      if (!raw) return;
      try {
        const parsed: Task[] = JSON.parse(raw);
        const migrated = parsed.map((t, i) => ({
          ...t,
          category: t.category ?? null,
          subtasks: Array.isArray(t.subtasks) ? t.subtasks : [],
          recurring: t.recurring ?? null,
          sortOrder: t.sortOrder ?? i,
          completedAt: t.completedAt ?? null,
        }));
        setTasks(migrated);
      } catch {}
    });
  }, []);

  async function saveTasks(updated: Task[]) {
    setTasks(updated);
    await AsyncStorage.setItem(TASKS_KEY, JSON.stringify(updated));
  }

  function openAdd() {
    setEditingTask(null);
    setFormTitle(""); setFormNotes(""); setFormPriority("medium");
    setFormDue(""); setFormCategory(null); setFormRecurring(null);
    setFormSubtasks([]); setNewSubtaskTitle("");
    setShowAdd(true);
  }

  function openEdit(task: Task) {
    setEditingTask(task);
    setFormTitle(task.title);
    setFormNotes(task.notes);
    setFormPriority(task.priority);
    setFormDue(task.dueDate ?? "");
    setFormCategory(task.category);
    setFormRecurring(task.recurring);
    setFormSubtasks([...task.subtasks]);
    setNewSubtaskTitle("");
    setShowAdd(true);
  }

  async function handleSave() {
    if (!formTitle.trim()) return;
    if (editingTask) {
      const updated = tasks.map((t) =>
        t.id === editingTask.id
          ? {
              ...t,
              title: formTitle.trim(),
              notes: formNotes.trim(),
              priority: formPriority,
              dueDate: formDue.trim() || null,
              category: formCategory,
              recurring: formRecurring,
              subtasks: formSubtasks,
            }
          : t
      );
      await saveTasks(updated);
      const saved = updated.find((t) => t.id === editingTask.id)!;
      upsertTaskMutation.mutate({ ...saved, clientId: saved.id, subtasks: JSON.stringify(saved.subtasks) });
    } else {
      const newTask: Task = {
        id: generateId(),
        title: formTitle.trim(),
        notes: formNotes.trim(),
        priority: formPriority,
        dueDate: formDue.trim() || null,
        completed: false,
        createdAt: new Date().toISOString(),
        category: formCategory,
        subtasks: formSubtasks,
        recurring: formRecurring,
        sortOrder: 0,
        completedAt: null,
      };
      const updated = [newTask, ...tasks].map((t, i) => ({ ...t, sortOrder: i }));
      await saveTasks(updated);
      upsertTaskMutation.mutate({ ...newTask, clientId: newTask.id, subtasks: JSON.stringify(newTask.subtasks) });
    }
    if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setShowAdd(false);
  }

  async function handleToggle(task: Task) {
    const today = todayStr();
    const nowCompleted = !task.completed;
    let updated: Task[];
    // Recurring tasks: mark completedAt but keep active
    if (task.recurring && nowCompleted) {
      updated = tasks.map((t) =>
        t.id === task.id ? { ...t, completed: false, completedAt: today } : t
      );
    } else {
      updated = tasks.map((t) =>
        t.id === task.id
          ? { ...t, completed: nowCompleted, completedAt: nowCompleted ? today : t.completedAt }
          : t
      );
    }
    await saveTasks(updated);
    const toggled = updated.find((t) => t.id === task.id)!;
    upsertTaskMutation.mutate({ ...toggled, clientId: toggled.id, subtasks: JSON.stringify(toggled.subtasks) });
    if (Platform.OS !== "web") {
      if (nowCompleted) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      else Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  }

  async function handleDelete(task: Task) {
    const updated = tasks.filter((t) => t.id !== task.id);
    await saveTasks(updated);
    deleteTaskMutation.mutate({ clientId: task.id });
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  }

  async function handleReorder(newOrder: Task[]) {
    const reordered = newOrder.map((t, i) => ({ ...t, sortOrder: i }));
    await saveTasks(reordered);
  }

  const today = todayStr();
  const activeCount = tasks.filter((t) => !t.completed).length;
  const doneCount = tasks.filter((t) => t.completed).length;
  const todayCount = tasks.filter((t) => !t.completed && (t.dueDate === today || !!t.recurring)).length;
  const streak = useMemo(() => computeStreak(tasks), [tasks]);

  const filtered = useMemo(() => {
    let list = [...tasks];
    if (filter === "today") list = list.filter((t) => !t.completed && (t.dueDate === today || !!t.recurring));
    else if (filter === "active") list = list.filter((t) => !t.completed);
    else if (filter === "done") list = list.filter((t) => t.completed);
    list.sort((a, b) => {
      if (filter !== "done") {
        const aOv = a.dueDate && a.dueDate < today ? -1 : 0;
        const bOv = b.dueDate && b.dueDate < today ? -1 : 0;
        if (aOv !== bOv) return aOv - bOv;
      }
      return (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
    });
    return list;
  }, [tasks, filter, today]);

  const renderRightActions = useCallback(
    (task: Task) => (
      <View style={tStyles.swipeRight}>
        <TouchableOpacity
          style={[tStyles.swipeBtn, { backgroundColor: "#EF4444" }]}
          onPress={() => handleDelete(task)}
        >
          <Text style={tStyles.swipeBtnText}>Delete</Text>
        </TouchableOpacity>
      </View>
    ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tasks]
  );

  const renderLeftActions = useCallback(
    (task: Task) => (
      <View style={tStyles.swipeLeft}>
        <TouchableOpacity
          style={[tStyles.swipeBtn, { backgroundColor: "#22C55E" }]}
          onPress={() => handleToggle(task)}
        >
          <Text style={tStyles.swipeBtnText}>{task.completed ? "Undo" : "Done"}</Text>
        </TouchableOpacity>
      </View>
    ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tasks]
  );

  const renderItem = useCallback(
    ({ item, drag, isActive }: RenderItemParams<Task>) => {
      const dueColor = dueDateColor(item.dueDate, item.completed);
      const lifeArea = LIFE_AREAS.find((a) => a.id === item.category);
      const subtasksDone = item.subtasks.filter((s) => s.completed).length;
      return (
        <ScaleDecorator>
          <Swipeable
            renderRightActions={() => renderRightActions(item)}
            renderLeftActions={() => renderLeftActions(item)}
            overshootLeft={false}
            overshootRight={false}
          >
            <TouchableOpacity
              onPress={() => openEdit(item)}
              onLongPress={drag}
              delayLongPress={200}
              activeOpacity={0.85}
              style={[
                tStyles.taskCard,
                {
                  backgroundColor: isActive ? colors.surface + "EE" : colors.surface,
                  borderColor: isActive ? colors.primary : colors.border,
                  opacity: item.completed ? 0.55 : 1,
                },
              ]}
            >
              <View
                style={[
                  tStyles.priorityStripe,
                  { backgroundColor: PRIORITY_COLORS[item.priority] },
                ]}
              />
              <TouchableOpacity
                style={[
                  tStyles.checkbox,
                  {
                    borderColor: PRIORITY_COLORS[item.priority],
                    backgroundColor: item.completed
                      ? PRIORITY_COLORS[item.priority]
                      : "transparent",
                  },
                ]}
                onPress={() => handleToggle(item)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                {item.completed && <MaterialIcons name="check" size={14} color="#fff" />}
              </TouchableOpacity>

              <View style={{ flex: 1, gap: 3 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <Text
                    style={[
                      tStyles.taskTitle,
                      {
                        color: colors.foreground,
                        textDecorationLine: item.completed ? "line-through" : "none",
                        flex: 1,
                      },
                    ]}
                    numberOfLines={2}
                  >
                    {item.title}
                  </Text>
                  {item.recurring && (
                    <View style={tStyles.recurringBadge}>
                      <MaterialIcons name="sync" size={11} color="#0a7ea4" />
                      <Text style={tStyles.recurringBadgeText}>
                        {item.recurring === "daily" ? "D" : "W"}
                      </Text>
                    </View>
                  )}
                </View>

                {item.notes ? (
                  <Text
                    style={[tStyles.taskNotes, { color: colors.muted }]}
                    numberOfLines={1}
                  >
                    {item.notes}
                  </Text>
                ) : null}

                {item.subtasks.length > 0 && (
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 6,
                      marginTop: 2,
                    }}
                  >
                    <View
                      style={[tStyles.subtaskBar, { backgroundColor: colors.border }]}
                    >
                      <View
                        style={[
                          tStyles.subtaskFill,
                          {
                            backgroundColor:
                              subtasksDone === item.subtasks.length
                                ? "#22C55E"
                                : colors.primary,
                            width: `${(subtasksDone / item.subtasks.length) * 100}%` as any,
                          },
                        ]}
                      />
                    </View>
                    <Text style={[tStyles.subtaskCount, { color: colors.muted }]}>
                      {subtasksDone}/{item.subtasks.length}
                    </Text>
                  </View>
                )}

                <View style={tStyles.taskMeta}>
                  {lifeArea && (
                    <View
                      style={[tStyles.categoryBadge, { backgroundColor: colors.border }]}
                    >
                      <MaterialIcons name={lifeArea.icon} size={10} color={colors.muted} />
                      <Text style={[tStyles.categoryText, { color: colors.muted }]}>
                        {lifeArea.label}
                      </Text>
                    </View>
                  )}
                  {item.dueDate && (
                    <Text
                      style={[tStyles.dueText, { color: dueColor ?? colors.muted }]}
                    >
                      {formatDue(item.dueDate)}
                    </Text>
                  )}
                </View>
              </View>

              <View style={tStyles.dragHandle}>
                <MaterialIcons name="drag-handle" size={20} color={colors.muted} />
              </View>
            </TouchableOpacity>
          </Swipeable>
        </ScaleDecorator>
      );
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tasks, colors]
  );

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      {streak > 0 && (
        <View
          style={[
            tStyles.streakBar,
            { backgroundColor: colors.surface, borderBottomColor: colors.border },
          ]}
        >
          <MaterialIcons name="local-fire-department" size={18} color="#F59E0B" />
          <Text style={[tStyles.streakText, { color: colors.foreground }]}>
            {streak}-day streak
          </Text>
          <Text style={[tStyles.streakSub, { color: colors.muted }]}>
            · {doneCount} completed
          </Text>
        </View>
      )}

      <View style={[tStyles.filterRow, { borderBottomColor: colors.border }]}>
        {(
          [
            { key: "today",  label: `Today (${todayCount})` },
            { key: "active", label: `Active (${activeCount})` },
            { key: "all",    label: `All (${tasks.length})` },
            { key: "done",   label: `Done (${doneCount})` },
          ] as const
        ).map(({ key, label }) => (
          <Pressable
            key={key}
            style={[
              tStyles.filterTab,
              filter === key && {
                borderBottomColor: colors.primary,
                borderBottomWidth: 2,
              },
            ]}
            onPress={() => setFilter(key)}
          >
            <Text
              style={[
                tStyles.filterTabText,
                {
                  color: filter === key ? colors.primary : colors.muted,
                  fontWeight: filter === key ? "700" : "500",
                },
              ]}
            >
              {label}
            </Text>
          </Pressable>
        ))}
      </View>

      {filtered.length === 0 ? (
        <View style={tStyles.emptyState}>
          <MaterialIcons
            name={filter === "done" ? "check-circle" : filter === "today" ? "wb-sunny" : "assignment"}
            size={48}
            color={colors.muted}
            style={{ marginBottom: 8 }}
          />
          <Text style={[tStyles.emptyTitle, { color: colors.foreground }]}>
            {filter === "done"
              ? "No completed tasks"
              : filter === "today"
              ? "Nothing due today"
              : "No tasks yet"}
          </Text>
          <Text style={[tStyles.emptyDesc, { color: colors.muted }]}>
            {filter === "done"
              ? "Complete a task to see it here."
              : filter === "today"
              ? "Add a task with today's due date or make it recurring."
              : "Tap + to add your first task."}
          </Text>
        </View>
      ) : (
        <DraggableFlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          onDragEnd={({ data }) => handleReorder(data)}
          renderItem={renderItem}
          contentContainerStyle={tStyles.list}
          activationDistance={10}
        />
      )}

      <Pressable
        style={({ pressed }) => [
          tStyles.fab,
          { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 },
        ]}
        onPress={openAdd}
      >
        <MaterialIcons name="add" size={28} color="#fff" />
      </Pressable>

      <Modal
        visible={showAdd}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowAdd(false)}
      >
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
          <View
            style={[tStyles.modalContainer, { backgroundColor: colors.background }]}
          >
            <View
              style={[
                tStyles.modalHeader,
                { borderBottomColor: colors.border },
              ]}
            >
              <Pressable
                onPress={() => setShowAdd(false)}
                style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}
              >
                <Text style={[tStyles.modalCancel, { color: colors.muted }]}>
                  Cancel
                </Text>
              </Pressable>
              <Text style={[tStyles.modalTitle, { color: colors.foreground }]}>
                {editingTask ? "Edit Task" : "New Task"}
              </Text>
              <Pressable
                onPress={handleSave}
                style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}
              >
                <Text style={[tStyles.modalSave, { color: colors.primary }]}>
                  Save
                </Text>
              </Pressable>
            </View>

            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={tStyles.modalBody}
              keyboardShouldPersistTaps="handled"
            >
              <Text style={[tStyles.fieldLabel, { color: colors.muted }]}>TASK</Text>
              <TextInput
                style={[
                  tStyles.textInput,
                  {
                    color: colors.foreground,
                    backgroundColor: colors.surface,
                    borderColor: colors.border,
                  },
                ]}
                value={formTitle}
                onChangeText={setFormTitle}
                placeholder="What needs to be done?"
                placeholderTextColor={colors.muted}
                autoFocus
                returnKeyType="next"
              />

              <Text style={[tStyles.fieldLabel, { color: colors.muted }]}>NOTES</Text>
              <TextInput
                style={[
                  tStyles.textInput,
                  tStyles.textArea,
                  {
                    color: colors.foreground,
                    backgroundColor: colors.surface,
                    borderColor: colors.border,
                  },
                ]}
                value={formNotes}
                onChangeText={setFormNotes}
                placeholder="Add notes (optional)"
                placeholderTextColor={colors.muted}
                multiline
                numberOfLines={3}
                textAlignVertical="top"
              />

              <Text style={[tStyles.fieldLabel, { color: colors.muted }]}>PRIORITY</Text>
              <View style={tStyles.chipRow}>
                {(["high", "medium", "low"] as const).map((p) => (
                  <Pressable
                    key={p}
                    style={[
                      tStyles.chip,
                      {
                        borderColor: PRIORITY_COLORS[p],
                        backgroundColor:
                          formPriority === p
                            ? PRIORITY_COLORS[p] + "33"
                            : "transparent",
                      },
                    ]}
                    onPress={() => setFormPriority(p)}
                  >
                    <Text
                      style={[tStyles.chipText, { color: PRIORITY_COLORS[p] }]}
                    >
                      {PRIORITY_LABELS[p]}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <Text style={[tStyles.fieldLabel, { color: colors.muted }]}>
                DUE DATE (YYYY-MM-DD)
              </Text>
              <TextInput
                style={[
                  tStyles.textInput,
                  {
                    color: colors.foreground,
                    backgroundColor: colors.surface,
                    borderColor: colors.border,
                  },
                ]}
                value={formDue}
                onChangeText={setFormDue}
                placeholder={todayStr()}
                placeholderTextColor={colors.muted}
                returnKeyType="done"
              />

              <Text style={[tStyles.fieldLabel, { color: colors.muted }]}>
                LIFE AREA (optional)
              </Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={{ marginBottom: 4 }}
              >
                <View style={{ flexDirection: "row", gap: 8, paddingVertical: 4 }}>
                  <Pressable
                    style={[
                      tStyles.chip,
                      {
                        borderColor: colors.border,
                        backgroundColor:
                          formCategory === null
                            ? colors.primary + "33"
                            : "transparent",
                      },
                    ]}
                    onPress={() => setFormCategory(null)}
                  >
                    <Text
                      style={[
                        tStyles.chipText,
                        {
                          color:
                            formCategory === null ? colors.primary : colors.muted,
                        },
                      ]}
                    >
                      None
                    </Text>
                  </Pressable>
                  {LIFE_AREAS.map((a) => (
                    <Pressable
                      key={a.id}
                      style={[
                        tStyles.chip,
                        {
                          borderColor: colors.border,
                          backgroundColor:
                            formCategory === a.id
                              ? colors.primary + "33"
                              : "transparent",
                        },
                      ]}
                      onPress={() => setFormCategory(a.id)}
                    >
                      <Text
                        style={[
                          tStyles.chipText,
                          {
                            color:
                              formCategory === a.id
                                ? colors.primary
                                : colors.muted,
                          },
                        ]}
                      >
                        {a.label}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </ScrollView>

              <Text style={[tStyles.fieldLabel, { color: colors.muted }]}>
                RECURRING
              </Text>
              <View style={tStyles.chipRow}>
                {([null, "daily", "weekly"] as const).map((r) => (
                  <Pressable
                    key={String(r)}
                    style={[
                      tStyles.chip,
                      {
                        borderColor: colors.border,
                        backgroundColor:
                          formRecurring === r
                            ? colors.primary + "33"
                            : "transparent",
                      },
                    ]}
                    onPress={() => setFormRecurring(r)}
                  >
                    <Text
                      style={[
                        tStyles.chipText,
                        {
                          color:
                            formRecurring === r ? colors.primary : colors.muted,
                        },
                      ]}
                    >
                      {r === null ? "None" : r === "daily" ? "Daily" : "Weekly"}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <Text style={[tStyles.fieldLabel, { color: colors.muted }]}>
                SUBTASKS
              </Text>
              {formSubtasks.map((s) => (
                <View
                  key={s.id}
                  style={[tStyles.subtaskRow, { borderColor: colors.border }]}
                >
                  <Pressable
                    style={[
                      tStyles.subtaskCheck,
                      {
                        borderColor: colors.primary,
                        backgroundColor: s.completed ? colors.primary : "transparent",
                      },
                    ]}
                    onPress={() =>
                      setFormSubtasks((prev) =>
                        prev.map((x) =>
                          x.id === s.id ? { ...x, completed: !x.completed } : x
                        )
                      )
                    }
                  >
                    {s.completed && (
                      <MaterialIcons name="check" size={10} color="#fff" />
                    )}
                  </Pressable>
                  <Text
                    style={{
                      flex: 1,
                      fontSize: 14,
                      color: colors.foreground,
                      textDecorationLine: s.completed ? "line-through" : "none",
                    }}
                  >
                    {s.title}
                  </Text>
                  <Pressable
                    onPress={() =>
                      setFormSubtasks((prev) => prev.filter((x) => x.id !== s.id))
                    }
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <MaterialIcons name="close" size={18} color={colors.muted} style={{ paddingHorizontal: 6 }} />
                  </Pressable>
                </View>
              ))}
              <View
                style={[
                  tStyles.subtaskAddRow,
                  {
                    borderColor: colors.border,
                    backgroundColor: colors.surface,
                  },
                ]}
              >
                <TextInput
                  style={{
                    flex: 1,
                    fontSize: 14,
                    color: colors.foreground,
                    paddingVertical: 10,
                    paddingHorizontal: 12,
                  }}
                  value={newSubtaskTitle}
                  onChangeText={setNewSubtaskTitle}
                  placeholder="Add subtask…"
                  placeholderTextColor={colors.muted}
                  returnKeyType="done"
                  onSubmitEditing={() => {
                    if (!newSubtaskTitle.trim()) return;
                    setFormSubtasks((prev) => [
                      ...prev,
                      {
                        id: generateId(),
                        title: newSubtaskTitle.trim(),
                        completed: false,
                      },
                    ]);
                    setNewSubtaskTitle("");
                  }}
                />
                <Pressable
                  style={({ pressed }) => [
                    tStyles.subtaskAddBtn,
                    { backgroundColor: colors.primary, opacity: pressed ? 0.7 : 1 },
                  ]}
                  onPress={() => {
                    if (!newSubtaskTitle.trim()) return;
                    setFormSubtasks((prev) => [
                      ...prev,
                      {
                        id: generateId(),
                        title: newSubtaskTitle.trim(),
                        completed: false,
                      },
                    ]);
                    setNewSubtaskTitle("");
                  }}
                >
                  <MaterialIcons name="add" size={22} color="#fff" />
                </Pressable>
              </View>

              {editingTask && (
                <Pressable
                  style={[tStyles.deleteTaskBtn, { borderColor: "#EF4444" }]}
                  onPress={() => {
                    Alert.alert("Delete Task", "Are you sure?", [
                      { text: "Cancel", style: "cancel" },
                      {
                        text: "Delete",
                        style: "destructive",
                        onPress: () => {
                          handleDelete(editingTask);
                          setShowAdd(false);
                        },
                      },
                    ]);
                  }}
                >
                  <Text
                    style={{ color: "#EF4444", fontWeight: "700", fontSize: 15 }}
                  >
                    Delete Task
                  </Text>
                </Pressable>
              )}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </GestureHandlerRootView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const tStyles = StyleSheet.create({
  streakBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    gap: 4,
  },
  streakText: { fontSize: 14, fontWeight: "700" },
  streakSub: { fontSize: 13 },
  filterRow: { flexDirection: "row", paddingHorizontal: 8, borderBottomWidth: 1 },
  filterTab: {
    paddingVertical: 10,
    paddingHorizontal: 6,
    marginRight: 2,
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  filterTabText: { fontSize: 12 },
  list: { padding: 12, gap: 8, paddingBottom: 100 },
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 40,
    gap: 8,
  },
  emptyEmoji: { fontSize: 48, marginBottom: 8 },
  emptyTitle: { fontSize: 18, fontWeight: "700", textAlign: "center" },
  emptyDesc: { fontSize: 14, textAlign: "center", lineHeight: 20 },
  taskCard: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 14,
    borderWidth: 1,
    padding: 12,
    gap: 10,
    overflow: "hidden",
  },
  priorityStripe: {
    width: 3,
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    borderRadius: 2,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 6,
  },
  checkmark: { fontSize: 12, color: "#fff", fontWeight: "700" },
  taskTitle: { fontSize: 15, fontWeight: "600", lineHeight: 21 },
  taskNotes: { fontSize: 12, lineHeight: 17 },
  taskMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 3,
    flexWrap: "wrap",
  },
  categoryBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  categoryText: { fontSize: 10, fontWeight: "600" },
  dueText: { fontSize: 11, fontWeight: "600" },
  recurringBadge: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 2,
    backgroundColor: "#0a7ea422",
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
  },
  recurringBadgeText: {
    fontSize: 10,
    fontWeight: "700" as const,
    color: "#0a7ea4",
  },
  subtaskBar: { flex: 1, height: 4, borderRadius: 2, overflow: "hidden", maxWidth: 80 },
  subtaskFill: { height: 4, borderRadius: 2 },
  subtaskCount: { fontSize: 11 },
  dragHandle: { paddingLeft: 4, opacity: 0.4 },
  swipeRight: { justifyContent: "center", alignItems: "flex-end" },
  swipeLeft: { justifyContent: "center", alignItems: "flex-start" },
  swipeBtn: {
    justifyContent: "center",
    alignItems: "center",
    width: 80,
    height: "100%",
    borderRadius: 12,
  },
  swipeBtnText: { color: "#fff", fontWeight: "700", fontSize: 13 },
  fab: {
    position: "absolute",
    bottom: 24,
    right: 20,
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 6,
  },
  fabText: { fontSize: 28, color: "#fff", fontWeight: "300", lineHeight: 32 },
  modalContainer: { flex: 1 },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  modalTitle: { fontSize: 17, fontWeight: "700" },
  modalCancel: { fontSize: 16 },
  modalSave: { fontSize: 16, fontWeight: "700" },
  modalBody: { padding: 20, gap: 6, paddingBottom: 40 },
  fieldLabel: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.5,
    marginBottom: 6,
    marginTop: 14,
  },
  textInput: {
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
  },
  textArea: { minHeight: 80, paddingTop: 12 },
  chipRow: { flexDirection: "row", gap: 10 },
  chip: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
  },
  chipText: { fontSize: 12, fontWeight: "700" },
  subtaskRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 8,
    borderBottomWidth: 1,
  },
  subtaskCheck: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  subtaskAddRow: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 8,
    overflow: "hidden",
  },
  subtaskAddBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  deleteTaskBtn: {
    marginTop: 24,
    borderWidth: 1.5,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
});
