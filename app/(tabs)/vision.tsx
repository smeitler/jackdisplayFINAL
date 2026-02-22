import {
  View, Text, ScrollView, Pressable, Image, StyleSheet,
  Alert, Dimensions, Modal, Platform,
} from "react-native";
import { useState, useEffect, useCallback } from "react";
import * as ImagePicker from "expo-image-picker";
import { ScreenContainer } from "@/components/screen-container";
import { useApp } from "@/lib/app-context";
import { useColors } from "@/hooks/use-colors";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { loadVisionBoard, saveVisionBoard, VisionBoard } from "@/lib/storage";

const SCREEN_W = Dimensions.get("window").width;
// 3-column grid with gaps
const GAP = 4;
const PADDING = 20;
const COLS = 3;
const IMG_SIZE = Math.floor((SCREEN_W - PADDING * 2 - GAP * (COLS - 1)) / COLS);

export default function VisionBoardScreen() {
  const { categories, activeHabits, getHabitWeeklyDone } = useApp();
  const colors = useColors();
  const sortedCategories = [...categories].sort((a, b) => a.order - b.order);

  const [board, setBoard] = useState<VisionBoard>({});
  const [previewUri, setPreviewUri] = useState<string | null>(null);
  const [previewCatId, setPreviewCatId] = useState<string | null>(null);

  useEffect(() => {
    loadVisionBoard().then(setBoard);
  }, []);

  async function updateBoard(newBoard: VisionBoard) {
    setBoard(newBoard);
    await saveVisionBoard(newBoard);
  }

  const pickImage = useCallback(async (catId: string) => {
    // Ask permission
    if (Platform.OS !== "web") {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") {
        Alert.alert(
          "Permission needed",
          "Please allow access to your photo library to add images to your vision board.",
        );
        return;
      }
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsMultipleSelection: true,
      quality: 0.8,
      selectionLimit: 10,
    });

    if (!result.canceled && result.assets.length > 0) {
      const newUris = result.assets.map((a) => a.uri);
      const existing = board[catId] ?? [];
      const updated = { ...board, [catId]: [...existing, ...newUris] };
      await updateBoard(updated);
    }
  }, [board]);

  const removeImage = useCallback(async (catId: string, uri: string) => {
    const existing = board[catId] ?? [];
    const updated = { ...board, [catId]: existing.filter((u) => u !== uri) };
    await updateBoard(updated);
    setPreviewUri(null);
    setPreviewCatId(null);
  }, [board]);

  return (
    <ScreenContainer>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <Text style={[styles.pageTitle, { color: colors.foreground }]}>Vision Board</Text>
        <Text style={[styles.pageSubtitle, { color: colors.muted }]}>
          Add photos that represent what you want to achieve in each area of your life.
        </Text>

        {sortedCategories.map((cat) => {
          const images = board[cat.id] ?? [];
          const habitsWithGoal = activeHabits.filter((h) => h.category === cat.id && h.weeklyGoal);
          // Deadline calculation
          let deadlineLabel: string | null = null;
          let deadlineColor = colors.muted;
          if (cat.deadline) {
            const dl = new Date(cat.deadline + 'T12:00:00');
            const now = new Date(); now.setHours(0, 0, 0, 0);
            const diffDays = Math.ceil((dl.getTime() - now.getTime()) / 86400000);
            deadlineLabel = diffDays < 0 ? 'Overdue' : diffDays === 0 ? 'Due today' : `${diffDays}d left`;
            deadlineColor = diffDays < 0 ? '#EF4444' : diffDays <= 7 ? '#F59E0B' : colors.muted;
          }
          return (
            <View
              key={cat.id}
              style={[styles.catSection, { backgroundColor: colors.surface, borderColor: colors.border }]}
            >
              {/* Category header */}
              <View style={styles.catHeader}>
                <Text style={styles.catEmoji}>{cat.emoji}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.catLabel, { color: colors.foreground }]}>{cat.label}</Text>
                  {deadlineLabel && (
                    <Text style={[styles.visionDeadline, { color: deadlineColor }]}>{deadlineLabel}</Text>
                  )}
                </View>
                <Pressable
                  onPress={() => pickImage(cat.id)}
                  style={({ pressed }) => [
                    styles.addBtn,
                    { backgroundColor: colors.primary + "18", borderColor: colors.primary + "44", opacity: pressed ? 0.7 : 1 },
                  ]}
                >
                  <IconSymbol name="plus" size={14} color={colors.primary} />
                  <Text style={[styles.addBtnText, { color: colors.primary }]}>Add Photos</Text>
                </Pressable>
              </View>

              {/* Image grid */}
              {images.length === 0 ? (
                <Pressable
                  onPress={() => pickImage(cat.id)}
                  style={({ pressed }) => [
                    styles.emptyGrid,
                    { borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
                  ]}
                >
                  <IconSymbol name="plus.circle.fill" size={32} color={colors.muted} />
                  <Text style={[styles.emptyText, { color: colors.muted }]}>
                    Tap to add your first photo
                  </Text>
                </Pressable>
              ) : (
                <View style={styles.grid}>
                  {images.map((uri, idx) => (
                    <Pressable
                      key={`${uri}-${idx}`}
                      onPress={() => { setPreviewUri(uri); setPreviewCatId(cat.id); }}
                      style={({ pressed }) => [styles.imgWrap, { opacity: pressed ? 0.85 : 1 }]}
                    >
                      <Image source={{ uri }} style={styles.img} resizeMode="cover" />
                    </Pressable>
                  ))}
                  {/* Add more tile */}
                  <Pressable
                    onPress={() => pickImage(cat.id)}
                    style={({ pressed }) => [
                      styles.addTile,
                      { backgroundColor: colors.background, borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
                    ]}
                  >
                    <IconSymbol name="plus" size={22} color={colors.muted} />
                  </Pressable>
                </View>
              )}

              {/* Weekly habit goals */}
              {habitsWithGoal.length > 0 && (
                <View style={[styles.visionWeeklyList, { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 10, marginTop: 4 }]}>
                  {habitsWithGoal.map((h) => {
                    const done = getHabitWeeklyDone(h.id);
                    const goal = h.weeklyGoal!;
                    const met = done >= goal;
                    const pct = Math.min(done / goal, 1);
                    return (
                      <View key={h.id} style={styles.visionWeeklyItem}>
                        <Text style={[styles.visionWeeklyName, { color: colors.muted }]} numberOfLines={1}>{h.emoji} {h.name}</Text>
                        <View style={styles.visionWeeklyBarWrap}>
                          <View style={[styles.visionWeeklyBarBg, { backgroundColor: colors.border }]}>
                            <View style={[styles.visionWeeklyBarFill, { flex: pct, backgroundColor: met ? '#22C55E' : colors.primary }]} />
                            {pct < 1 && <View style={{ flex: 1 - pct }} />}
                          </View>
                          <Text style={[styles.visionWeeklyCount, { color: met ? '#22C55E' : colors.primary }]}>{done}/{goal}</Text>
                        </View>
                      </View>
                    );
                  })}
                </View>
              )}
            </View>
          );
        })}

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Full-screen image preview modal */}
      <Modal
        visible={previewUri !== null}
        transparent
        animationType="fade"
        onRequestClose={() => { setPreviewUri(null); setPreviewCatId(null); }}
      >
        <View style={styles.previewBackdrop}>
          <Pressable
            style={styles.previewClose}
            onPress={() => { setPreviewUri(null); setPreviewCatId(null); }}
          >
            <IconSymbol name="xmark.circle.fill" size={32} color="#fff" />
          </Pressable>

          {previewUri && (
            <Image
              source={{ uri: previewUri }}
              style={styles.previewImage}
              resizeMode="contain"
            />
          )}

          {/* Delete button */}
          {previewUri && previewCatId && (
            <Pressable
              onPress={() => {
                Alert.alert("Remove Photo", "Remove this photo from your vision board?", [
                  { text: "Cancel", style: "cancel" },
                  {
                    text: "Remove",
                    style: "destructive",
                    onPress: () => removeImage(previewCatId, previewUri),
                  },
                ]);
              }}
              style={({ pressed }) => [styles.previewDelete, { opacity: pressed ? 0.7 : 1 }]}
            >
              <IconSymbol name="trash.fill" size={18} color="#fff" />
              <Text style={styles.previewDeleteText}>Remove</Text>
            </Pressable>
          )}
        </View>
      </Modal>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: PADDING, paddingBottom: 40 },

  pageTitle: { fontSize: 28, fontWeight: "700", letterSpacing: -0.5, marginBottom: 4 },
  pageSubtitle: { fontSize: 14, lineHeight: 20, marginBottom: 20 },

  catSection: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 14,
    marginBottom: 16,
  },
  catHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
  },
  catEmoji: { fontSize: 22 },
  catLabel: { fontSize: 17, fontWeight: "700", flex: 1 },
  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
  },
  addBtnText: { fontSize: 12, fontWeight: "600" },

  emptyGrid: {
    height: 100,
    borderRadius: 12,
    borderWidth: 1.5,
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  emptyText: { fontSize: 13 },

  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: GAP,
  },
  imgWrap: {
    width: IMG_SIZE,
    height: IMG_SIZE,
    borderRadius: 10,
    overflow: "hidden",
  },
  img: {
    width: IMG_SIZE,
    height: IMG_SIZE,
  },
  addTile: {
    width: IMG_SIZE,
    height: IMG_SIZE,
    borderRadius: 10,
    borderWidth: 1.5,
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
  },

  // Preview modal
  previewBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.92)",
    alignItems: "center",
    justifyContent: "center",
  },
  previewClose: {
    position: "absolute",
    top: 56,
    right: 20,
    zIndex: 10,
  },
  previewImage: {
    width: SCREEN_W,
    height: SCREEN_W * 1.2,
  },
  previewDelete: {
    position: "absolute",
    bottom: 60,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#EF4444CC",
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 24,
  },
  previewDeleteText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "600",
  },
  visionDeadline: { fontSize: 11, fontWeight: '600', marginTop: 1 },
  visionWeeklyList: { marginTop: 10, gap: 6 },
  visionWeeklyItem: { gap: 2 },
  visionWeeklyName: { fontSize: 11, fontWeight: '500' },
  visionWeeklyBarWrap: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  visionWeeklyBarBg: { flex: 1, height: 5, borderRadius: 3, flexDirection: 'row', overflow: 'hidden' },
  visionWeeklyBarFill: { borderRadius: 3 },
  visionWeeklyCount: { fontSize: 11, fontWeight: '700', minWidth: 24, textAlign: 'right' },
});
