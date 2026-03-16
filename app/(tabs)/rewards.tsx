import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  View, Text, ScrollView, Pressable, StyleSheet, FlatList, Alert, Platform,
  Image, Dimensions, Modal, TextInput, KeyboardAvoidingView, TouchableOpacity,
} from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import { useApp } from "@/lib/app-context";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system/legacy";
import * as MediaLibrary from "expo-media-library";
import { CategoryIcon } from "@/components/category-icon";
import { useContentMaxWidth } from "@/hooks/use-is-ipad";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  loadVisionBoard, saveVisionBoard, VisionBoard,
  loadVisionMotivations, saveVisionMotivations, VisionMotivations,
  formatDisplayDate,
} from "@/lib/storage";

const { width: SCREEN_W } = Dimensions.get("window");
const PADDING = 20;
const CARD_W = SCREEN_W - PADDING * 2;
const CAROUSEL_H = Math.floor(CARD_W * 0.62);

// ─── Copy a URI to permanent app storage ─────────────────────────────────────
async function persistUri(uri: string): Promise<string | null> {
  if (Platform.OS === "web") return uri;
  const docDir = FileSystem.documentDirectory ?? "";
  if (uri.startsWith(docDir)) {
    try {
      const info = await FileSystem.getInfoAsync(uri);
      if (info.exists) return uri;
    } catch { /* fall through */ }
    return null;
  }
  let resolvedUri: string | null = null;
  if (Platform.OS === "ios" && uri.startsWith("ph://")) {
    try {
      const assetId = uri.replace("ph://", "").split("/")[0];
      const assetInfo = await MediaLibrary.getAssetInfoAsync(assetId);
      if (assetInfo?.localUri) resolvedUri = assetInfo.localUri;
    } catch { return null; }
    if (!resolvedUri) return null;
  } else {
    resolvedUri = uri;
  }
  try {
    const ext = resolvedUri.split(".").pop()?.split("?")[0] ?? "jpg";
    const dest = `${docDir}vision_${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
    await FileSystem.copyAsync({ from: resolvedUri, to: dest });
    return dest;
  } catch { return null; }
}

// ─── Photo Carousel ───────────────────────────────────────────────────────────
function PhotoCarousel({ uris, height, onPhotoPress }: {
  uris: string[]; height: number; onPhotoPress?: (uri: string, index: number) => void;
}) {
  const [index, setIndex] = useState(0);
  const flatRef = useRef<FlatList>(null);
  if (uris.length === 0) return null;
  return (
    <View style={{ height, borderRadius: 12, overflow: "hidden" }}>
      <FlatList
        ref={flatRef}
        data={uris}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        keyExtractor={(u, i) => `${u}-${i}`}
        onMomentumScrollEnd={(e) => {
          const newIdx = Math.round(e.nativeEvent.contentOffset.x / CARD_W);
          setIndex(newIdx);
        }}
        renderItem={({ item, index: i }) => (
          <Pressable
            onPress={() => onPhotoPress?.(item, i)}
            style={({ pressed }) => [{ width: CARD_W, height, opacity: pressed ? 0.9 : 1 }]}
          >
            <Image source={{ uri: item }} style={{ width: CARD_W, height }} resizeMode="cover" />
          </Pressable>
        )}
      />
      {uris.length > 1 && (
        <View style={vStyles.dotRow}>
          {uris.map((_, i) => (
            <View key={i} style={[vStyles.dot, { backgroundColor: i === index ? "#fff" : "rgba(255,255,255,0.45)", width: i === index ? 16 : 6 }]} />
          ))}
        </View>
      )}
    </View>
  );
}

// ─── Goal Detail Modal ────────────────────────────────────────────────────────
function GoalDetailModal({
  visible, cat, images, motivations, onClose, onAddPhoto, onRemovePhoto,
  onAddMotivation, onEditMotivation, onDeleteMotivation, colors,
}: {
  visible: boolean;
  cat: { id: string; label: string; emoji: string; lifeArea?: string; deadline?: string };
  images: string[];
  motivations: string[];
  onClose: () => void;
  onAddPhoto: () => void;
  onRemovePhoto: (uri: string) => void;
  onAddMotivation: (text: string) => void;
  onEditMotivation: (index: number, text: string) => void;
  onDeleteMotivation: (index: number) => void;
  colors: ReturnType<typeof import("@/hooks/use-colors").useColors>;
}) {
  const [newText, setNewText] = useState("");
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editText, setEditText] = useState("");
  const [photoIndex, setPhotoIndex] = useState(0);
  const flatRef = useRef<FlatList>(null);

  function submitNew() {
    const t = newText.trim();
    if (!t) return;
    onAddMotivation(t);
    setNewText("");
  }
  function startEdit(i: number) { setEditingIndex(i); setEditText(motivations[i]); }
  function submitEdit() {
    if (editingIndex === null) return;
    const t = editText.trim();
    if (t) onEditMotivation(editingIndex, t);
    setEditingIndex(null); setEditText("");
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <View style={[dStyles.header, { borderBottomColor: colors.border }]}>
          <CategoryIcon categoryId={cat.id} lifeArea={cat.lifeArea} size={22} color={colors.primary} bgColor={colors.primary + '22'} bgSize={44} borderRadius={12} />
          <Text style={[dStyles.headerTitle, { color: colors.foreground }]} numberOfLines={1}>{cat.label}</Text>
          <Pressable onPress={onClose} style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1, padding: 4 })}>
            <IconSymbol name="xmark.circle.fill" size={26} color={colors.muted} />
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={dStyles.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          <Text style={[dStyles.sectionLabel, { color: colors.muted }]}>WHY THIS MATTERS</Text>
          {motivations.length === 0 && <Text style={[dStyles.emptyMotive, { color: colors.muted }]}>Add your reasons below — why is this goal important to you?</Text>}
          {motivations.map((m, i) => (
            <View key={i} style={[dStyles.motiveRow, { borderColor: colors.border, backgroundColor: colors.surface }]}>
              {editingIndex === i ? (
                <TextInput style={[dStyles.motiveEditInput, { color: colors.foreground, borderColor: colors.primary }]} value={editText} onChangeText={setEditText} onSubmitEditing={submitEdit} onBlur={submitEdit} returnKeyType="done" autoFocus multiline />
              ) : (
                <Pressable onPress={() => startEdit(i)} style={{ flex: 1, flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
                  <Text style={[dStyles.motiveBullet, { color: colors.primary }]}>•</Text>
                  <Text style={[dStyles.motiveText, { color: colors.foreground }]}>{m}</Text>
                </Pressable>
              )}
              {editingIndex !== i && (
                <Pressable onPress={() => onDeleteMotivation(i)} style={({ pressed }) => [dStyles.deleteBtn, { opacity: pressed ? 0.5 : 1 }]}>
                  <IconSymbol name="trash.fill" size={14} color="#EF4444" />
                </Pressable>
              )}
            </View>
          ))}
          <View style={[dStyles.addMotiveRow, { borderColor: colors.border, backgroundColor: colors.surface }]}>
            <TextInput style={[dStyles.addMotiveInput, { color: colors.foreground }]} placeholder="Add a reason this goal matters..." placeholderTextColor={colors.muted} value={newText} onChangeText={setNewText} returnKeyType="done" onSubmitEditing={submitNew} multiline={false} />
            <Pressable onPress={submitNew} style={({ pressed }) => [dStyles.addMotiveBtn, { backgroundColor: colors.primary, opacity: pressed ? 0.7 : 1 }]}>
              <IconSymbol name="plus" size={16} color="#fff" />
            </Pressable>
          </View>
          <View style={dStyles.photoHeader}>
            <Text style={[dStyles.sectionLabel, { color: colors.muted }]}>PHOTOS</Text>
            <Pressable onPress={onAddPhoto} style={({ pressed }) => [dStyles.addPhotoBtn, { backgroundColor: colors.primary + "18", borderColor: colors.primary + "44", opacity: pressed ? 0.7 : 1 }]}>
              <IconSymbol name="plus" size={13} color={colors.primary} />
              <Text style={[dStyles.addPhotoBtnText, { color: colors.primary }]}>Add Photos</Text>
            </Pressable>
          </View>
          {images.length === 0 ? (
            <Pressable onPress={onAddPhoto} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1, paddingVertical: 8 })}>
              <Text style={[dStyles.emptyMotive, { color: colors.primary }]}>+ Add your first photo</Text>
            </Pressable>
          ) : (
            <>
              <View style={{ borderRadius: 14, overflow: "hidden", marginBottom: 12 }}>
                <FlatList ref={flatRef} data={images} horizontal pagingEnabled showsHorizontalScrollIndicator={false} keyExtractor={(u, i) => `detail-${u}-${i}`}
                  onMomentumScrollEnd={(e) => { const newIdx = Math.round(e.nativeEvent.contentOffset.x / (SCREEN_W - PADDING * 2)); setPhotoIndex(newIdx); }}
                  renderItem={({ item }) => <Image source={{ uri: item }} style={{ width: SCREEN_W - PADDING * 2, height: Math.floor((SCREEN_W - PADDING * 2) * 0.75) }} resizeMode="cover" />}
                />
                {images.length > 1 && (
                  <View style={vStyles.dotRow}>
                    {images.map((_, i) => <View key={i} style={[vStyles.dot, { backgroundColor: i === photoIndex ? "#fff" : "rgba(255,255,255,0.45)", width: i === photoIndex ? 16 : 6 }]} />)}
                  </View>
                )}
              </View>
              <View style={dStyles.thumbStrip}>
                {images.map((uri, i) => (
                  <View key={`thumb-${i}`} style={dStyles.thumbWrap}>
                    <Image source={{ uri }} style={dStyles.thumb} resizeMode="cover" />
                    <Pressable onPress={() => Alert.alert("Remove Photo", "Remove this photo?", [{ text: "Cancel", style: "cancel" }, { text: "Remove", style: "destructive", onPress: () => onRemovePhoto(uri) }])} style={dStyles.thumbDelete}>
                      <IconSymbol name="xmark.circle.fill" size={18} color="#fff" />
                    </Pressable>
                  </View>
                ))}
              </View>
            </>
          )}
          <View style={{ height: 40 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Vision Board Tab ─────────────────────────────────────────────────────────
function VisionBoardTab() {
  const { categories, isDemoMode } = useApp();
  const colors = useColors();
  const maxWidth = useContentMaxWidth();
  const sortedCategories = [...categories].sort((a, b) => a.order - b.order);
  const [board, setBoard] = useState<VisionBoard>({});
  const [motivations, setMotivations] = useState<VisionMotivations>({});
  const [detailCatId, setDetailCatId] = useState<string | null>(null);

  useEffect(() => {
    loadVisionBoard().then(async (loaded) => {
      if (Platform.OS !== "web") {
        const docDir = FileSystem.documentDirectory ?? "";
        let needsSave = false;
        const cleaned: VisionBoard = {};
        for (const [catId, uris] of Object.entries(loaded)) {
          const valid: string[] = [];
          for (const uri of uris) {
            if (uri.startsWith(docDir)) {
              try {
                const info = await FileSystem.getInfoAsync(uri);
                if (info.exists) valid.push(uri); else needsSave = true;
              } catch { needsSave = true; }
            } else { needsSave = true; }
          }
          cleaned[catId] = valid;
        }
        setBoard(cleaned);
        if (needsSave) await saveVisionBoard(cleaned);
      } else { setBoard(loaded); }
    });
    loadVisionMotivations().then(setMotivations);
  }, [isDemoMode]);

  async function updateBoard(newBoard: VisionBoard) { setBoard(newBoard); await saveVisionBoard(newBoard); }
  async function updateMotivations(newMot: VisionMotivations) { setMotivations(newMot); await saveVisionMotivations(newMot); }

  const pickImage = useCallback(async (catId: string) => {
    if (Platform.OS !== "web") {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") { Alert.alert("Permission needed", "Please allow access to your photo library."); return; }
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsMultipleSelection: true, quality: 0.8, selectionLimit: 10 });
    if (!result.canceled && result.assets.length > 0) {
      const results = await Promise.all(result.assets.map((a) => persistUri(a.uri)));
      const persistedUris = results.filter((u): u is string => u !== null);
      if (persistedUris.length === 0) { Alert.alert("Could not save photos", "Unable to copy photos to app storage. Please try again."); return; }
      const existing = board[catId] ?? [];
      const updated = { ...board, [catId]: [...existing, ...persistedUris] };
      await updateBoard(updated);
      if (persistedUris.length < result.assets.length) Alert.alert("Some photos skipped", `${result.assets.length - persistedUris.length} photo(s) could not be saved and were skipped.`);
    }
  }, [board]);

  const removeImage = useCallback(async (catId: string, uri: string) => {
    const existing = board[catId] ?? [];
    const updated = { ...board, [catId]: existing.filter((u) => u !== uri) };
    await updateBoard(updated);
    if (Platform.OS !== "web" && uri.startsWith(FileSystem.documentDirectory ?? "")) {
      try { await FileSystem.deleteAsync(uri, { idempotent: true }); } catch { /* ignore */ }
    }
  }, [board]);

  const detailCat = detailCatId ? sortedCategories.find((c) => c.id === detailCatId) : null;

  return (
    <ScrollView contentContainerStyle={vStyles.scroll} showsVerticalScrollIndicator={false}>
      <View style={maxWidth ? { maxWidth, alignSelf: 'center', width: '100%' } : undefined}>
        <Text style={[vStyles.pageSubtitle, { color: colors.muted }]}>Tap a goal to add photos and reasons. Swipe photos to browse.</Text>
        {sortedCategories.map((cat) => {
          const images = board[cat.id] ?? [];
          const catMotivations = motivations[cat.id] ?? [];
          let deadlineLabel: string | null = null;
          let deadlineColor = colors.muted;
          if (cat.deadline) {
            const dl = new Date(cat.deadline + "T12:00:00");
            const now = new Date(); now.setHours(0, 0, 0, 0);
            const diffDays = Math.ceil((dl.getTime() - now.getTime()) / 86400000);
            deadlineLabel = diffDays < 0 ? "Overdue" : diffDays === 0 ? "Due today" : `${diffDays}d left`;
            deadlineColor = diffDays < 0 ? "#EF4444" : diffDays <= 7 ? "#F59E0B" : colors.muted;
          }
          return (
            <View key={cat.id} style={[vStyles.catSection, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Pressable onPress={() => setDetailCatId(cat.id)} style={({ pressed }) => [vStyles.catHeader, { opacity: pressed ? 0.75 : 1 }]}>
                <CategoryIcon categoryId={cat.id} lifeArea={cat.lifeArea} size={20} color={colors.primary} bgColor={colors.primary + '18'} bgSize={40} borderRadius={10} />
                <View style={{ flex: 1 }}>
                  <Text style={[vStyles.catLabel, { color: colors.foreground }]}>{cat.label}</Text>
                  {deadlineLabel && <Text style={[vStyles.visionDeadline, { color: deadlineColor }]}>{deadlineLabel}</Text>}
                </View>
                <View style={vStyles.headerRight}>
                  <Pressable onPress={() => pickImage(cat.id)} style={({ pressed }) => [vStyles.addBtn, { backgroundColor: colors.primary + "18", borderColor: colors.primary + "44", opacity: pressed ? 0.7 : 1 }]}>
                    <IconSymbol name="plus" size={13} color={colors.primary} />
                    <Text style={[vStyles.addBtnText, { color: colors.primary }]}>Photos</Text>
                  </Pressable>
                  <IconSymbol name="chevron.right" size={16} color={colors.muted} />
                </View>
              </Pressable>
              {catMotivations.length > 0 && (
                <Pressable onPress={() => setDetailCatId(cat.id)} style={[vStyles.motivationsPreview, { borderTopColor: colors.border }]}>
                  <Text style={[vStyles.motiveSectionLabel, { color: colors.muted }]}>WHY THIS MATTERS</Text>
                  {catMotivations.slice(0, 3).map((m, i) => (
                    <View key={i} style={{ flexDirection: "row", alignItems: "flex-start", gap: 8, marginTop: 4 }}>
                      <Text style={[vStyles.motiveBullet, { color: colors.primary }]}>•</Text>
                      <Text style={[vStyles.motiveText, { color: colors.foreground }]} numberOfLines={2}>{m}</Text>
                    </View>
                  ))}
                  {catMotivations.length > 3 && <Text style={[vStyles.moreText, { color: colors.primary }]}>+{catMotivations.length - 3} more reasons →</Text>}
                </Pressable>
              )}
              {images.length > 0 && (
                <View style={{ marginTop: 8 }}>
                  <PhotoCarousel uris={images} height={CAROUSEL_H} onPhotoPress={() => setDetailCatId(cat.id)} />
                </View>
              )}
              {images.length === 0 && catMotivations.length === 0 && (
                <Pressable onPress={() => setDetailCatId(cat.id)} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1, paddingTop: 6, paddingBottom: 4 })}>
                  <Text style={[vStyles.emptyText, { color: colors.primary }]}>Tap to add photos and reasons →</Text>
                </Pressable>
              )}
            </View>
          );
        })}
        <View style={{ height: 40 }} />
      </View>
      {detailCat && (
        <GoalDetailModal
          visible={detailCatId !== null}
          cat={detailCat}
          images={board[detailCat.id] ?? []}
          motivations={motivations[detailCat.id] ?? []}
          onClose={() => setDetailCatId(null)}
          onAddPhoto={() => pickImage(detailCat.id)}
          onRemovePhoto={(uri) => removeImage(detailCat.id, uri)}
          onAddMotivation={(text) => { const catMot = motivations[detailCat.id] ?? []; updateMotivations({ ...motivations, [detailCat.id]: [...catMot, text] }); }}
          onEditMotivation={(index, text) => { const catMot = [...(motivations[detailCat.id] ?? [])]; catMot[index] = text; updateMotivations({ ...motivations, [detailCat.id]: catMot }); }}
          onDeleteMotivation={(index) => { const catMot = (motivations[detailCat.id] ?? []).filter((_, i) => i !== index); updateMotivations({ ...motivations, [detailCat.id]: catMot }); }}
          colors={colors}
        />
      )}
    </ScrollView>
  );
}

// ─── Rewards Tab ──────────────────────────────────────────────────────────────
type HabitReward = {
  habitId: string;
  habitName: string;
  habitEmoji: string;
  rewardName: string;
  rewardEmoji: string;
  rewardDescription?: string;
  frequencyType: "weekly" | "monthly";
  goal: number;
  currentCount: number;
  progress: number;
  isUnlocked: boolean;
  claimedAt?: string;
  periodKey: string;
};

function ProgressBar({ progress, color }: { progress: number; color: string }) {
  const pct = Math.min(Math.max(progress, 0), 1);
  return (
    <View style={rStyles.progressTrack}>
      <View style={[rStyles.progressFill, { width: `${pct * 100}%` as any, backgroundColor: color }]} />
    </View>
  );
}

function HabitRewardCard({ item, onClaim, onUnclaim, colors }: {
  item: HabitReward;
  onClaim: () => void;
  onUnclaim: () => void;
  colors: ReturnType<typeof useColors>;
}) {
  const accent = item.isUnlocked ? "#22C55E" : colors.primary;
  const isClaimed = !!item.claimedAt;
  const remaining = Math.max(0, item.goal - item.currentCount);
  return (
    <View style={[rStyles.card, { backgroundColor: colors.surface, borderColor: isClaimed ? "#22C55E" : item.isUnlocked ? "#22C55E" : colors.border, borderWidth: isClaimed || item.isUnlocked ? 1.5 : 1 }]}>
      <View style={rStyles.cardHeader}>
        <View style={[rStyles.emojiCircle, { backgroundColor: accent + "22" }]}>
          <Text style={rStyles.emojiText}>{item.rewardEmoji}</Text>
        </View>
        <View style={rStyles.cardTitleBlock}>
          <Text style={[rStyles.cardTitle, { color: colors.foreground }]} numberOfLines={1}>{item.rewardName}</Text>
          <Text style={[rStyles.cardHabit, { color: colors.muted }]} numberOfLines={1}>{item.habitName} · {item.frequencyType === "weekly" ? "Weekly" : "Monthly"} goal</Text>
        </View>
        {isClaimed ? (
          <View style={[rStyles.badge, { backgroundColor: "#22C55E22" }]}>
            <Text style={[rStyles.badgeText, { color: "#22C55E" }]}>Claimed ✓</Text>
          </View>
        ) : item.isUnlocked ? (
          <View style={[rStyles.badge, { backgroundColor: "#22C55E22" }]}>
            <Text style={[rStyles.badgeText, { color: "#22C55E" }]}>Unlocked!</Text>
          </View>
        ) : null}
      </View>
      {item.rewardDescription ? <Text style={[rStyles.cardDesc, { color: colors.muted }]}>{item.rewardDescription}</Text> : null}
      {!isClaimed && (
        <View style={rStyles.progressSection}>
          <ProgressBar progress={item.progress} color={accent} />
          <View style={rStyles.progressLabels}>
            <Text style={[rStyles.progressCount, { color: accent }]}>{item.currentCount}/{item.goal} {item.frequencyType === "weekly" ? "days this week" : "days this month"}</Text>
            {!item.isUnlocked && <Text style={[rStyles.progressRemaining, { color: colors.muted }]}>{remaining} to go</Text>}
          </View>
        </View>
      )}
      {isClaimed ? (
        <View style={rStyles.cardActions}>
          <Pressable style={[rStyles.actionBtn, { borderColor: colors.border }]} onPress={onUnclaim}>
            <Text style={[rStyles.actionBtnText, { color: colors.muted }]}>Unclaim</Text>
          </Pressable>
        </View>
      ) : item.isUnlocked ? (
        <View style={rStyles.cardActions}>
          <Pressable style={[rStyles.claimBtn, { backgroundColor: "#22C55E" }]} onPress={onClaim}>
            <Text style={rStyles.claimBtnText}>🎉 Claim Reward</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const CLAIMED_KEY = "habit_reward_claims_v1";
type ClaimRecord = { habitId: string; periodKey: string; claimedAt: string };

function getPeriodKey(frequencyType: "weekly" | "monthly"): string {
  const now = new Date();
  if (frequencyType === "monthly") return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const d = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

function RewardsTab() {
  const colors = useColors();
  const { habits, checkIns } = useApp();
  const [claims, setClaims] = React.useState<ClaimRecord[]>([]);
  const [filter, setFilter] = React.useState<"all" | "unlocked" | "claimed">("all");

  React.useEffect(() => {
    AsyncStorage.getItem(CLAIMED_KEY).then((raw) => {
      if (raw) { try { setClaims(JSON.parse(raw)); } catch { /* ignore */ } }
    });
  }, []);

  async function saveClaims(updated: ClaimRecord[]) {
    setClaims(updated);
    await AsyncStorage.setItem(CLAIMED_KEY, JSON.stringify(updated));
  }

  const rewardItems: HabitReward[] = React.useMemo(() => {
    return habits
      .filter((h) => h.isActive && h.rewardName && (h.weeklyGoal || h.monthlyGoal))
      .map((h) => {
        const freqType = h.frequencyType ?? "weekly";
        const goal = freqType === "monthly" ? (h.monthlyGoal ?? 0) : (h.weeklyGoal ?? 0);
        const periodKey = getPeriodKey(freqType);
        const now = new Date();
        let currentCount = 0;
        if (freqType === "weekly") {
          const startOfWeek = new Date(now);
          startOfWeek.setDate(now.getDate() - ((now.getDay() + 6) % 7));
          startOfWeek.setHours(0, 0, 0, 0);
          currentCount = checkIns.filter((c) => { if (c.habitId !== h.id) return false; const d = new Date(c.date); return d >= startOfWeek && c.rating === "green"; }).length;
        } else {
          currentCount = checkIns.filter((c) => { if (c.habitId !== h.id) return false; const d = new Date(c.date); return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && c.rating === "green"; }).length;
        }
        const isUnlocked = goal > 0 && currentCount >= goal;
        const claimRecord = claims.find((c) => c.habitId === h.id && c.periodKey === periodKey);
        return {
          habitId: h.id, habitName: h.name, habitEmoji: h.emoji ?? "⭐",
          rewardName: h.rewardName!, rewardEmoji: h.rewardEmoji ?? "🎁",
          rewardDescription: h.rewardDescription, frequencyType: freqType,
          goal, currentCount, progress: goal > 0 ? currentCount / goal : 0,
          isUnlocked, claimedAt: claimRecord?.claimedAt, periodKey,
        };
      });
  }, [habits, checkIns, claims]);

  const filtered = React.useMemo(() => {
    if (filter === "unlocked") return rewardItems.filter((r) => r.isUnlocked && !r.claimedAt);
    if (filter === "claimed") return rewardItems.filter((r) => !!r.claimedAt);
    return rewardItems;
  }, [rewardItems, filter]);

  const unlockedCount = rewardItems.filter((r) => r.isUnlocked && !r.claimedAt).length;
  const claimedCount = rewardItems.filter((r) => !!r.claimedAt).length;

  async function handleClaim(item: HabitReward) {
    if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const updated = [...claims.filter((c) => !(c.habitId === item.habitId && c.periodKey === item.periodKey)), { habitId: item.habitId, periodKey: item.periodKey, claimedAt: new Date().toISOString() }];
    await saveClaims(updated);
  }

  async function handleUnclaim(item: HabitReward) {
    Alert.alert("Unclaim Reward", "Are you sure you want to unclaim this reward?", [
      { text: "Cancel", style: "cancel" },
      { text: "Unclaim", style: "destructive", onPress: async () => { const updated = claims.filter((c) => !(c.habitId === item.habitId && c.periodKey === item.periodKey)); await saveClaims(updated); } },
    ]);
  }

  return (
    <View style={{ flex: 1 }}>
      {rewardItems.length > 0 && (
        <View style={[rStyles.filterRow, { borderBottomColor: colors.border }]}>
          {(["all", "unlocked", "claimed"] as const).map((f) => (
            <Pressable key={f} style={[rStyles.filterTab, filter === f && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]} onPress={() => setFilter(f)}>
              <Text style={[rStyles.filterTabText, { color: filter === f ? colors.primary : colors.muted }]}>
                {f === "all" ? `All (${rewardItems.length})` : f === "unlocked" ? `Unlocked (${unlockedCount})` : `Claimed (${claimedCount})`}
              </Text>
            </Pressable>
          ))}
        </View>
      )}
      {rewardItems.length === 0 ? (
        <View style={rStyles.emptyState}>
          <Text style={rStyles.emptyEmoji}>🎁</Text>
          <Text style={[rStyles.emptyTitle, { color: colors.foreground }]}>No rewards yet</Text>
          <Text style={[rStyles.emptyDesc, { color: colors.muted }]}>When you create a habit and set a weekly or monthly goal, your reward will appear here automatically.</Text>
          <Text style={[rStyles.emptyHint, { color: colors.muted }]}>Go to Manage Goals → tap a habit → set a goal to add a reward.</Text>
        </View>
      ) : filtered.length === 0 ? (
        <View style={rStyles.emptyState}>
          <Text style={rStyles.emptyEmoji}>{filter === "claimed" ? "🏆" : "⏳"}</Text>
          <Text style={[rStyles.emptyTitle, { color: colors.foreground }]}>{filter === "claimed" ? "No claimed rewards yet" : "No unlocked rewards yet"}</Text>
          <Text style={[rStyles.emptyDesc, { color: colors.muted }]}>{filter === "claimed" ? "Claim a reward once you've hit your goal." : "Keep going — hit your habit goal to unlock your reward."}</Text>
        </View>
      ) : (
        <FlatList data={filtered} keyExtractor={(item) => `${item.habitId}-${item.periodKey}`} contentContainerStyle={rStyles.list}
          renderItem={({ item }) => <HabitRewardCard item={item} onClaim={() => handleClaim(item)} onUnclaim={() => handleUnclaim(item)} colors={colors} />}
        />
      )}
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function RewardsScreen() {
  const colors = useColors();
  const [activeTab, setActiveTab] = useState<"rewards" | "vision">("rewards");

  return (
    <ScreenContainer>
      {/* Header */}
      <View style={sStyles.header}>
        <Text style={[sStyles.headerTitle, { color: colors.foreground }]}>
          {activeTab === "rewards" ? "Rewards" : "Vision Board"}
        </Text>
      </View>

      {/* Top tab bar */}
      <View style={[sStyles.topTabBar, { borderBottomColor: colors.border }]}>
        {(["rewards", "vision"] as const).map((tab) => (
          <Pressable
            key={tab}
            style={[sStyles.topTab, activeTab === tab && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]}
            onPress={() => setActiveTab(tab)}
          >
            <Text style={[sStyles.topTabText, { color: activeTab === tab ? colors.primary : colors.muted }]}>
              {tab === "rewards" ? "Rewards" : "Vision Board"}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Content */}
      {activeTab === "rewards" ? <RewardsTab /> : <VisionBoardTab />}
    </ScreenContainer>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const sStyles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8, gap: 10 },
  headerTitle: { fontSize: 28, fontWeight: "700" },
  topTabBar: { flexDirection: "row", paddingHorizontal: 20, borderBottomWidth: 1, marginBottom: 4 },
  topTab: { paddingVertical: 10, paddingHorizontal: 4, marginRight: 24, borderBottomWidth: 2, borderBottomColor: "transparent" },
  topTabText: { fontSize: 15, fontWeight: "600" },
});

const rStyles = StyleSheet.create({
  filterRow: { flexDirection: "row", paddingHorizontal: 20, borderBottomWidth: 1, marginBottom: 4 },
  filterTab: { paddingVertical: 10, paddingHorizontal: 4, marginRight: 20, borderBottomWidth: 2, borderBottomColor: "transparent" },
  filterTabText: { fontSize: 14, fontWeight: "500" },
  list: { padding: 16, gap: 12, paddingBottom: 40 },
  card: { borderRadius: 16, padding: 16, borderWidth: 1, gap: 10 },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: 12 },
  emojiCircle: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  emojiText: { fontSize: 22 },
  cardTitleBlock: { flex: 1 },
  cardTitle: { fontSize: 16, fontWeight: "600" },
  cardHabit: { fontSize: 12, marginTop: 2 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  badgeText: { fontSize: 11, fontWeight: "600" },
  cardDesc: { fontSize: 13, lineHeight: 18 },
  progressSection: { gap: 6 },
  progressTrack: { height: 6, borderRadius: 3, backgroundColor: "#E5E7EB", overflow: "hidden" },
  progressFill: { height: "100%", borderRadius: 3 },
  progressLabels: { flexDirection: "row", justifyContent: "space-between" },
  progressCount: { fontSize: 12, fontWeight: "600" },
  progressRemaining: { fontSize: 12 },
  cardActions: { flexDirection: "row", alignItems: "center", gap: 8 },
  claimBtn: { flex: 1, paddingVertical: 10, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  claimBtnText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  actionBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, borderWidth: 1 },
  actionBtnText: { fontSize: 13, fontWeight: "500" },
  emptyState: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 32, gap: 12 },
  emptyEmoji: { fontSize: 52 },
  emptyTitle: { fontSize: 20, fontWeight: "700", textAlign: "center" },
  emptyDesc: { fontSize: 14, textAlign: "center", lineHeight: 20 },
  emptyHint: { fontSize: 13, textAlign: "center", lineHeight: 18, marginTop: 4 },
});

const vStyles = StyleSheet.create({
  scroll: { padding: PADDING, paddingBottom: 40 },
  pageSubtitle: { fontSize: 14, marginBottom: 20 },
  catSection: { borderRadius: 16, borderWidth: 1, marginBottom: 16, overflow: "hidden", paddingHorizontal: 14, paddingTop: 12, paddingBottom: 12 },
  catHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  catLabel: { fontSize: 16, fontWeight: "700" },
  visionDeadline: { fontSize: 12, marginTop: 1 },
  headerRight: { flexDirection: "row", alignItems: "center", gap: 8 },
  addBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, borderWidth: 1 },
  addBtnText: { fontSize: 12, fontWeight: "600" },
  dotRow: { position: "absolute", bottom: 8, left: 0, right: 0, flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 4 },
  dot: { height: 6, borderRadius: 3 },
  motivationsPreview: { marginTop: 10, paddingTop: 10, borderTopWidth: 1, gap: 4 },
  motiveSectionLabel: { fontSize: 10, fontWeight: "700", letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 2 },
  motiveBullet: { fontSize: 14, lineHeight: 20 },
  motiveText: { fontSize: 14, lineHeight: 20, flex: 1 },
  moreText: { fontSize: 12, fontWeight: "600", marginTop: 4 },
  emptyText: { fontSize: 14, fontWeight: "600" },
});

const dStyles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 20, paddingTop: 16, paddingBottom: 14, borderBottomWidth: 1 },
  headerTitle: { flex: 1, fontSize: 18, fontWeight: "700" },
  scroll: { padding: 20, paddingBottom: 60 },
  sectionLabel: { fontSize: 11, fontWeight: "700", letterSpacing: 1.2, marginBottom: 10, marginTop: 6 },
  emptyMotive: { fontSize: 14, fontStyle: "italic", marginBottom: 12 },
  motiveRow: { flexDirection: "row", alignItems: "center", borderRadius: 10, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 8, gap: 6 },
  motiveBullet: { fontSize: 16, lineHeight: 22 },
  motiveText: { fontSize: 15, lineHeight: 22, flex: 1 },
  motiveEditInput: { flex: 1, fontSize: 15, lineHeight: 22, borderWidth: 1.5, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, minHeight: 36 },
  deleteBtn: { padding: 6, borderRadius: 8 },
  addMotiveRow: { flexDirection: "row", alignItems: "center", borderRadius: 12, borderWidth: 1, paddingLeft: 12, paddingRight: 6, paddingVertical: 6, marginBottom: 20, gap: 6 },
  addMotiveInput: { flex: 1, fontSize: 15, minHeight: 36 },
  addMotiveBtn: { width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  photoHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  addPhotoBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, borderWidth: 1 },
  addPhotoBtnText: { fontSize: 12, fontWeight: "600" },
  thumbStrip: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 },
  thumbWrap: { position: "relative" },
  thumb: { width: 80, height: 80, borderRadius: 10 },
  thumbDelete: { position: "absolute", top: -6, right: -6, backgroundColor: "rgba(0,0,0,0.55)", borderRadius: 12 },
});
