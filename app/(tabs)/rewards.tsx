import React, { useState, useEffect, useCallback } from "react";
import {
  View, Text, ScrollView, Pressable, StyleSheet, TextInput,
  Modal, FlatList, Alert, Platform,
} from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import { useApp } from "@/lib/app-context";
import * as Haptics from "expo-haptics";
import {
  Reward, loadRewards, saveRewards, countGreenCheckIns,
} from "@/lib/storage";
import { DEMO_REWARDS } from "@/lib/demo-data";

// ─── Emoji picker options ─────────────────────────────────────────────────────
const REWARD_EMOJIS = [
  "🎁","🏆","👟","👜","💎","🍕","🎮","🎬","📚","✈️",
  "🛁","🍾","🎸","🏖️","💸","🚗","⌚","💻","🎯","🌟",
  "🍣","🎂","🏋️","🧘","🎨","🎤","🏄","🧳","🌺","💐",
];

// ─── Accent colors ────────────────────────────────────────────────────────────
const ACCENT_COLORS = [
  "#22C55E","#6C63FF","#F59E0B","#EC4899","#3B82F6",
  "#EF4444","#14B8A6","#F97316","#8B5CF6","#06B6D4",
];

// ─── Progress bar ─────────────────────────────────────────────────────────────
function ProgressBar({ progress, color }: { progress: number; color: string }) {
  const pct = Math.min(progress, 1);
  return (
    <View style={styles.progressTrack}>
      <View style={[styles.progressFill, { width: `${pct * 100}%` as any, backgroundColor: color }]} />
    </View>
  );
}

// ─── Reward card ─────────────────────────────────────────────────────────────
function RewardCard({
  reward,
  currentCount,
  habitName,
  onEdit,
  onClaim,
  onUnclaim,
  onDelete,
  colors,
}: {
  reward: Reward;
  currentCount: number;
  habitName: string;
  onEdit: () => void;
  onClaim: () => void;
  onUnclaim: () => void;
  onDelete: () => void;
  colors: ReturnType<typeof useColors>;
}) {
  const accent = reward.color ?? "#6C63FF";
  const isClaimed = !!reward.claimedAt;
  const progress = reward.milestoneCount > 0 ? currentCount / reward.milestoneCount : 0;
  const isUnlocked = currentCount >= reward.milestoneCount;
  const remaining = Math.max(0, reward.milestoneCount - currentCount);

  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: isClaimed ? accent : colors.border, borderWidth: isClaimed ? 1.5 : 1 }]}>
      {/* Header row */}
      <View style={styles.cardHeader}>
        <View style={[styles.emojiCircle, { backgroundColor: accent + "22" }]}>
          <Text style={styles.emojiText}>{reward.emoji}</Text>
        </View>
        <View style={styles.cardTitleBlock}>
          <Text style={[styles.cardTitle, { color: colors.foreground }]} numberOfLines={1}>
            {reward.name}
          </Text>
          <Text style={[styles.cardHabit, { color: colors.muted }]} numberOfLines={1}>
            {habitName}
          </Text>
        </View>
        {isClaimed ? (
          <View style={[styles.claimedBadge, { backgroundColor: accent + "22" }]}>
            <Text style={[styles.claimedBadgeText, { color: accent }]}>Claimed</Text>
          </View>
        ) : isUnlocked ? (
          <View style={[styles.unlockedBadge, { backgroundColor: "#22C55E22" }]}>
            <Text style={[styles.unlockedBadgeText, { color: "#22C55E" }]}>Unlocked!</Text>
          </View>
        ) : null}
      </View>

      {/* Description */}
      {reward.description ? (
        <Text style={[styles.cardDesc, { color: colors.muted }]} numberOfLines={2}>
          {reward.description}
        </Text>
      ) : null}

      {/* Progress */}
      {!isClaimed && (
        <View style={styles.progressSection}>
          <ProgressBar progress={progress} color={isUnlocked ? "#22C55E" : accent} />
          <View style={styles.progressLabels}>
            <Text style={[styles.progressCount, { color: isUnlocked ? "#22C55E" : accent }]}>
              {currentCount} / {reward.milestoneCount} completions
            </Text>
            {!isUnlocked && (
              <Text style={[styles.progressRemaining, { color: colors.muted }]}>
                {remaining} to go
              </Text>
            )}
          </View>
        </View>
      )}

      {/* Actions */}
      <View style={styles.cardActions}>
        {isClaimed ? (
          <Pressable
            style={[styles.actionBtn, { borderColor: colors.border }]}
            onPress={onUnclaim}
          >
            <Text style={[styles.actionBtnText, { color: colors.muted }]}>Unclaim</Text>
          </Pressable>
        ) : isUnlocked ? (
          <Pressable
            style={[styles.claimBtn, { backgroundColor: "#22C55E" }]}
            onPress={onClaim}
          >
            <IconSymbol name="gift.fill" size={14} color="#fff" />
            <Text style={styles.claimBtnText}>Claim Reward</Text>
          </Pressable>
        ) : null}
        <View style={styles.actionSpacer} />
        <Pressable style={styles.iconBtn} onPress={onEdit}>
          <IconSymbol name="pencil" size={16} color={colors.muted} />
        </Pressable>
        <Pressable style={styles.iconBtn} onPress={onDelete}>
          <IconSymbol name="trash" size={16} color="#EF4444" />
        </Pressable>
      </View>
    </View>
  );
}

// ─── Add / Edit modal ─────────────────────────────────────────────────────────
function RewardModal({
  visible,
  initial,
  habits,
  onSave,
  onClose,
  colors,
}: {
  visible: boolean;
  initial: Partial<Reward> | null;
  habits: { id: string; name: string; emoji: string }[];
  onSave: (r: Omit<Reward, "id" | "createdAt">) => void;
  onClose: () => void;
  colors: ReturnType<typeof useColors>;
}) {
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [emoji, setEmoji] = useState("🎁");
  const [habitId, setHabitId] = useState("any");
  const [milestone, setMilestone] = useState("20");
  const [color, setColor] = useState(ACCENT_COLORS[0]);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  useEffect(() => {
    if (visible) {
      setName(initial?.name ?? "");
      setDesc(initial?.description ?? "");
      setEmoji(initial?.emoji ?? "🎁");
      setHabitId(initial?.habitId ?? "any");
      setMilestone(String(initial?.milestoneCount ?? 20));
      setColor(initial?.color ?? ACCENT_COLORS[0]);
      setShowEmojiPicker(false);
    }
  }, [visible, initial]);

  function handleSave() {
    const trimmed = name.trim();
    if (!trimmed) return;
    const count = parseInt(milestone, 10);
    if (!count || count < 1) return;
    onSave({
      name: trimmed,
      description: desc.trim() || undefined,
      emoji,
      habitId,
      milestoneCount: count,
      color,
      claimedAt: initial?.claimedAt,
    });
  }

  const isEdit = !!initial?.id;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[styles.modalContainer, { backgroundColor: colors.background }]}>
        {/* Header */}
        <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
          <Pressable onPress={onClose} style={styles.modalClose}>
            <Text style={[styles.modalCloseText, { color: colors.muted }]}>Cancel</Text>
          </Pressable>
          <Text style={[styles.modalTitle, { color: colors.foreground }]}>
            {isEdit ? "Edit Reward" : "New Reward"}
          </Text>
          <Pressable onPress={handleSave} style={styles.modalSave}>
            <Text style={[styles.modalSaveText, { color: "#6C63FF" }]}>Save</Text>
          </Pressable>
        </View>

        <ScrollView style={styles.modalBody} keyboardShouldPersistTaps="handled">
          {/* Emoji + Name row */}
          <View style={styles.fieldRow}>
            <Pressable
              style={[styles.emojiPickerBtn, { backgroundColor: color + "22", borderColor: color }]}
              onPress={() => setShowEmojiPicker(!showEmojiPicker)}
            >
              <Text style={{ fontSize: 28 }}>{emoji}</Text>
            </Pressable>
            <TextInput
              style={[styles.nameInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.surface, flex: 1 }]}
              placeholder="Reward name (e.g. New Shoes)"
              placeholderTextColor={colors.muted}
              value={name}
              onChangeText={setName}
              returnKeyType="done"
            />
          </View>

          {/* Emoji picker */}
          {showEmojiPicker && (
            <View style={[styles.emojiGrid, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              {REWARD_EMOJIS.map((e) => (
                <Pressable
                  key={e}
                  style={[styles.emojiOption, emoji === e && { backgroundColor: color + "33" }]}
                  onPress={() => { setEmoji(e); setShowEmojiPicker(false); }}
                >
                  <Text style={{ fontSize: 22 }}>{e}</Text>
                </Pressable>
              ))}
            </View>
          )}

          {/* Description */}
          <Text style={[styles.fieldLabel, { color: colors.muted }]}>Description (optional)</Text>
          <TextInput
            style={[styles.descInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.surface }]}
            placeholder="What will you do to celebrate?"
            placeholderTextColor={colors.muted}
            value={desc}
            onChangeText={setDesc}
            multiline
            numberOfLines={2}
            returnKeyType="done"
          />

          {/* Habit selector */}
          <Text style={[styles.fieldLabel, { color: colors.muted }]}>Linked Habit</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.habitScroll}>
            {[{ id: "any", name: "Any habit", emoji: "⭐" }, ...habits].map((h) => (
              <Pressable
                key={h.id}
                style={[
                  styles.habitChip,
                  { borderColor: habitId === h.id ? color : colors.border, backgroundColor: habitId === h.id ? color + "22" : colors.surface },
                ]}
                onPress={() => setHabitId(h.id)}
              >
                <Text style={{ fontSize: 14 }}>{h.emoji}</Text>
                <Text style={[styles.habitChipText, { color: habitId === h.id ? color : colors.foreground }]} numberOfLines={1}>
                  {h.name}
                </Text>
              </Pressable>
            ))}
          </ScrollView>

          {/* Milestone count */}
          <Text style={[styles.fieldLabel, { color: colors.muted }]}>Completions needed</Text>
          <View style={styles.milestoneRow}>
            {[10, 20, 30, 50, 100].map((n) => (
              <Pressable
                key={n}
                style={[
                  styles.milestoneChip,
                  { borderColor: milestone === String(n) ? color : colors.border, backgroundColor: milestone === String(n) ? color + "22" : colors.surface },
                ]}
                onPress={() => setMilestone(String(n))}
              >
                <Text style={[styles.milestoneChipText, { color: milestone === String(n) ? color : colors.foreground }]}>{n}</Text>
              </Pressable>
            ))}
            <TextInput
              style={[styles.milestoneInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.surface }]}
              placeholder="Custom"
              placeholderTextColor={colors.muted}
              value={[10,20,30,50,100].map(String).includes(milestone) ? "" : milestone}
              onChangeText={setMilestone}
              keyboardType="number-pad"
              returnKeyType="done"
            />
          </View>

          {/* Color picker */}
          <Text style={[styles.fieldLabel, { color: colors.muted }]}>Accent color</Text>
          <View style={styles.colorRow}>
            {ACCENT_COLORS.map((c) => (
              <Pressable
                key={c}
                style={[styles.colorSwatch, { backgroundColor: c, borderWidth: color === c ? 3 : 0, borderColor: colors.foreground }]}
                onPress={() => setColor(c)}
              />
            ))}
          </View>

          <View style={{ height: 40 }} />
        </ScrollView>
      </View>
    </Modal>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────
export default function RewardsScreen() {
  const colors = useColors();
  const { checkIns, activeHabits, isDemoMode } = useApp();

  const [rewards, setRewards] = useState<Reward[]>([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [editing, setEditing] = useState<Reward | null>(null);
  const [filter, setFilter] = useState<"all" | "active" | "claimed">("all");

  // Load rewards from storage (or demo data)
  const loadData = useCallback(async () => {
    if (isDemoMode) {
      setRewards(DEMO_REWARDS);
    } else {
      const r = await loadRewards();
      setRewards(r);
    }
  }, [isDemoMode]);

  useEffect(() => { loadData(); }, [loadData]);

  // Persist to storage (skip in demo mode)
  const persist = useCallback(async (updated: Reward[]) => {
    setRewards(updated);
    if (!isDemoMode) await saveRewards(updated);
  }, [isDemoMode]);

  function getCount(habitId: string) {
    return countGreenCheckIns(checkIns, habitId);
  }

  function getHabitName(habitId: string) {
    if (habitId === "any") return "All habits";
    const h = activeHabits.find((h) => h.id === habitId);
    return h ? `${h.emoji} ${h.name}` : "Deleted habit";
  }

  function handleAdd() {
    setEditing(null);
    setModalVisible(true);
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }

  function handleEdit(r: Reward) {
    setEditing(r);
    setModalVisible(true);
  }

  async function handleSave(data: Omit<Reward, "id" | "createdAt">) {
    if (editing) {
      const updated = rewards.map((r) =>
        r.id === editing.id ? { ...r, ...data } : r
      );
      await persist(updated);
    } else {
      const newReward: Reward = {
        ...data,
        id: `reward_${Date.now()}`,
        createdAt: new Date().toISOString(),
      };
      await persist([...rewards, newReward]);
    }
    setModalVisible(false);
    if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }

  async function handleClaim(id: string) {
    const updated = rewards.map((r) =>
      r.id === id ? { ...r, claimedAt: new Date().toISOString() } : r
    );
    await persist(updated);
    if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }

  async function handleUnclaim(id: string) {
    const updated = rewards.map((r) =>
      r.id === id ? { ...r, claimedAt: undefined } : r
    );
    await persist(updated);
  }

  async function handleDelete(id: string) {
    Alert.alert("Delete Reward", "Are you sure you want to delete this reward?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete", style: "destructive",
        onPress: async () => {
          await persist(rewards.filter((r) => r.id !== id));
          if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        },
      },
    ]);
  }

  const filtered = rewards.filter((r) => {
    if (filter === "active") return !r.claimedAt;
    if (filter === "claimed") return !!r.claimedAt;
    return true;
  });

  const claimedCount = rewards.filter((r) => !!r.claimedAt).length;
  const unlockedCount = rewards.filter((r) => !r.claimedAt && getCount(r.habitId) >= r.milestoneCount).length;

  return (
    <ScreenContainer>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={[styles.headerTitle, { color: colors.foreground }]}>Rewards</Text>
            <Text style={[styles.headerSub, { color: colors.muted }]}>
              {claimedCount} claimed · {unlockedCount} ready to claim
            </Text>
          </View>
          <Pressable
            style={[styles.addBtn, { backgroundColor: "#6C63FF" }]}
            onPress={handleAdd}
          >
            <IconSymbol name="plus" size={18} color="#fff" />
          </Pressable>
        </View>

        {/* Filter chips */}
        <View style={styles.filterRow}>
          {(["all", "active", "claimed"] as const).map((f) => (
            <Pressable
              key={f}
              style={[
                styles.filterChip,
                { borderColor: filter === f ? "#6C63FF" : colors.border, backgroundColor: filter === f ? "#6C63FF22" : colors.surface },
              ]}
              onPress={() => setFilter(f)}
            >
              <Text style={[styles.filterChipText, { color: filter === f ? "#6C63FF" : colors.muted }]}>
                {f === "all" ? "All" : f === "active" ? "In Progress" : "Claimed"}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* Empty state */}
        {filtered.length === 0 && (
          <View style={styles.emptyState}>
            <Text style={{ fontSize: 48, marginBottom: 12 }}>🎁</Text>
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
              {filter === "claimed" ? "No claimed rewards yet" : "No rewards yet"}
            </Text>
            <Text style={[styles.emptyDesc, { color: colors.muted }]}>
              {filter === "claimed"
                ? "Keep working on your habits to unlock rewards."
                : "Tap + to create your first reward milestone."}
            </Text>
            {filter === "all" && (
              <Pressable style={[styles.emptyAddBtn, { backgroundColor: "#6C63FF" }]} onPress={handleAdd}>
                <Text style={styles.emptyAddBtnText}>Create a Reward</Text>
              </Pressable>
            )}
          </View>
        )}

        {/* Reward cards */}
        {filtered.map((reward) => (
          <RewardCard
            key={reward.id}
            reward={reward}
            currentCount={getCount(reward.habitId)}
            habitName={getHabitName(reward.habitId)}
            onEdit={() => handleEdit(reward)}
            onClaim={() => handleClaim(reward.id)}
            onUnclaim={() => handleUnclaim(reward.id)}
            onDelete={() => handleDelete(reward.id)}
            colors={colors}
          />
        ))}

        <View style={{ height: 32 }} />
      </ScrollView>

      <RewardModal
        visible={modalVisible}
        initial={editing}
        habits={activeHabits.map((h) => ({ id: h.id, name: h.name, emoji: h.emoji }))}
        onSave={handleSave}
        onClose={() => setModalVisible(false)}
        colors={colors}
      />
    </ScreenContainer>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  scrollContent: { padding: 16, paddingBottom: 32 },

  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  headerTitle: { fontSize: 28, fontWeight: "800", letterSpacing: -0.5 },
  headerSub: { fontSize: 13, marginTop: 2 },
  addBtn: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },

  filterRow: { flexDirection: "row", gap: 8, marginBottom: 16 },
  filterChip: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, borderWidth: 1 },
  filterChipText: { fontSize: 13, fontWeight: "600" },

  card: { borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1 },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 8 },
  emojiCircle: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  emojiText: { fontSize: 22 },
  cardTitleBlock: { flex: 1 },
  cardTitle: { fontSize: 16, fontWeight: "700" },
  cardHabit: { fontSize: 12, marginTop: 2 },
  claimedBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  claimedBadgeText: { fontSize: 11, fontWeight: "700" },
  unlockedBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  unlockedBadgeText: { fontSize: 11, fontWeight: "700", color: "#22C55E" },
  cardDesc: { fontSize: 13, lineHeight: 18, marginBottom: 10 },

  progressSection: { marginBottom: 10 },
  progressTrack: { height: 6, borderRadius: 3, backgroundColor: "#2E2D45", overflow: "hidden" },
  progressFill: { height: 6, borderRadius: 3 },
  progressLabels: { flexDirection: "row", justifyContent: "space-between", marginTop: 5 },
  progressCount: { fontSize: 12, fontWeight: "600" },
  progressRemaining: { fontSize: 12 },

  cardActions: { flexDirection: "row", alignItems: "center", marginTop: 4 },
  actionBtn: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 10, borderWidth: 1 },
  actionBtnText: { fontSize: 13, fontWeight: "600" },
  claimBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 12 },
  claimBtnText: { color: "#fff", fontSize: 14, fontWeight: "700" },
  actionSpacer: { flex: 1 },
  iconBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },

  emptyState: { alignItems: "center", paddingVertical: 60 },
  emptyTitle: { fontSize: 18, fontWeight: "700", marginBottom: 8 },
  emptyDesc: { fontSize: 14, textAlign: "center", lineHeight: 20, paddingHorizontal: 24 },
  emptyAddBtn: { marginTop: 20, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 24 },
  emptyAddBtnText: { color: "#fff", fontSize: 15, fontWeight: "700" },

  // Modal
  modalContainer: { flex: 1 },
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 16, borderBottomWidth: StyleSheet.hairlineWidth },
  modalClose: { padding: 4 },
  modalCloseText: { fontSize: 16 },
  modalTitle: { fontSize: 17, fontWeight: "700" },
  modalSave: { padding: 4 },
  modalSaveText: { fontSize: 16, fontWeight: "700" },
  modalBody: { flex: 1, padding: 16 },

  fieldRow: { flexDirection: "row", gap: 12, alignItems: "center", marginBottom: 16 },
  emojiPickerBtn: { width: 60, height: 60, borderRadius: 16, alignItems: "center", justifyContent: "center", borderWidth: 2 },
  nameInput: { height: 52, borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, fontSize: 16 },

  emojiGrid: { flexDirection: "row", flexWrap: "wrap", borderRadius: 12, borderWidth: 1, padding: 8, marginBottom: 16, gap: 4 },
  emojiOption: { width: 44, height: 44, alignItems: "center", justifyContent: "center", borderRadius: 10 },

  fieldLabel: { fontSize: 12, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8, marginTop: 4 },
  descInput: { borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15, minHeight: 64, textAlignVertical: "top", marginBottom: 16 },

  habitScroll: { marginBottom: 16 },
  habitChip: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, borderWidth: 1, marginRight: 8 },
  habitChipText: { fontSize: 13, fontWeight: "600", maxWidth: 120 },

  milestoneRow: { flexDirection: "row", gap: 8, flexWrap: "wrap", marginBottom: 16 },
  milestoneChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12, borderWidth: 1 },
  milestoneChipText: { fontSize: 14, fontWeight: "700" },
  milestoneInput: { width: 72, height: 38, borderRadius: 12, borderWidth: 1, paddingHorizontal: 10, fontSize: 14, textAlign: "center" },

  colorRow: { flexDirection: "row", gap: 10, flexWrap: "wrap", marginBottom: 16 },
  colorSwatch: { width: 32, height: 32, borderRadius: 16 },
});
