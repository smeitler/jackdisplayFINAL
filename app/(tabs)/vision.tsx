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
import { loadVisionBoard, saveVisionBoard, VisionBoard, loadVisionMotivations, saveVisionMotivations, VisionMotivations } from "@/lib/storage";
import { TextInput } from "react-native";

const SCREEN_W = Dimensions.get("window").width;
const GAP = 4;
const PADDING = 20;
// 2-column grid for secondary photos
const COLS = 2;
const THUMB_SIZE = Math.floor((SCREEN_W - PADDING * 2 - GAP) / COLS);
const HERO_HEIGHT = Math.floor(SCREEN_W * 0.55);

export default function VisionBoardScreen() {
  const { categories } = useApp();
  const colors = useColors();
  const sortedCategories = [...categories].sort((a, b) => a.order - b.order);

  const [board, setBoard] = useState<VisionBoard>({});
  const [motivations, setMotivations] = useState<VisionMotivations>({});
  const [previewUri, setPreviewUri] = useState<string | null>(null);
  const [previewCatId, setPreviewCatId] = useState<string | null>(null);
  // Per-category new motivation input text
  const [newMotivation, setNewMotivation] = useState<Record<string, string>>({});

  useEffect(() => {
    loadVisionBoard().then(setBoard);
    loadVisionMotivations().then(setMotivations);
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
          const catMotivations = motivations[cat.id] ?? [];
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
                  style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1, alignSelf: "flex-start", paddingVertical: 4 })}
                >
                  <Text style={[styles.emptyText, { color: colors.primary }]}>+ Add your first photo</Text>
                </Pressable>
              ) : (
                <View style={styles.photoContainer}>
                  {/* Hero — first photo full width */}
                  <Pressable
                    onPress={() => { setPreviewUri(images[0]); setPreviewCatId(cat.id); }}
                    style={({ pressed }) => [styles.heroWrap, { opacity: pressed ? 0.88 : 1 }]}
                  >
                    <Image source={{ uri: images[0] }} style={styles.heroImg} resizeMode="cover" />
                  </Pressable>
                  {/* Secondary photos — 2-column grid */}
                  {images.length > 1 && (
                    <View style={styles.thumbGrid}>
                      {images.slice(1).map((uri, idx) => (
                        <Pressable
                          key={`${uri}-${idx}`}
                          onPress={() => { setPreviewUri(uri); setPreviewCatId(cat.id); }}
                          style={({ pressed }) => [styles.thumbWrap, { opacity: pressed ? 0.85 : 1 }]}
                        >
                          <Image source={{ uri }} style={styles.thumbImg} resizeMode="cover" />
                        </Pressable>
                      ))}
                    </View>
                  )}
                </View>
              )}

              {/* Motivations — why this goal matters */}
              <View style={[styles.motivationsSection, { borderTopWidth: images.length > 0 ? 1 : 0, borderTopColor: colors.border }]}>
                {catMotivations.length > 0 && (
                  <View style={styles.motivationsList}>
                    {catMotivations.map((m, idx) => (
                      <Pressable
                        key={idx}
                        onLongPress={() => {
                          Alert.alert("Remove", `Remove "${m}"?`, [
                            { text: "Cancel", style: "cancel" },
                            {
                              text: "Remove", style: "destructive",
                              onPress: async () => {
                                const updated = { ...motivations, [cat.id]: catMotivations.filter((_, i) => i !== idx) };
                                setMotivations(updated);
                                await saveVisionMotivations(updated);
                              },
                            },
                          ]);
                        }}
                        style={{ flexDirection: "row", alignItems: "flex-start", gap: 6, paddingVertical: 2 }}
                      >
                        <Text style={[styles.motivationBullet, { color: colors.primary }]}>•</Text>
                        <Text style={[styles.motivationText, { color: colors.foreground }]}>{m}</Text>
                      </Pressable>
                    ))}
                  </View>
                )}
                <View style={[styles.motivationInputRow, { borderColor: colors.border }]}>
                  <TextInput
                    style={[styles.motivationInput, { color: colors.foreground }]}
                    placeholder={catMotivations.length === 0 ? "Why does this goal matter to you?" : "Add another reason..."}
                    placeholderTextColor={colors.muted}
                    value={newMotivation[cat.id] ?? ""}
                    onChangeText={(t) => setNewMotivation((prev) => ({ ...prev, [cat.id]: t }))}
                    returnKeyType="done"
                    onSubmitEditing={async () => {
                      const text = (newMotivation[cat.id] ?? "").trim();
                      if (!text) return;
                      const updated = { ...motivations, [cat.id]: [...catMotivations, text] };
                      setMotivations(updated);
                      setNewMotivation((prev) => ({ ...prev, [cat.id]: "" }));
                      await saveVisionMotivations(updated);
                    }}
                  />
                </View>
              </View>
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

  emptyText: { fontSize: 14, fontWeight: "500" },

  photoContainer: {
    gap: GAP,
  },
  heroWrap: {
    width: "100%",
    height: HERO_HEIGHT,
    borderRadius: 12,
    overflow: "hidden",
  },
  heroImg: {
    width: "100%",
    height: HERO_HEIGHT,
  },
  thumbGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: GAP,
  },
  thumbWrap: {
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: 10,
    overflow: "hidden",
  },
  thumbImg: {
    width: THUMB_SIZE,
    height: THUMB_SIZE,
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

  // Motivations section
  motivationsSection: { marginTop: 10, paddingTop: 10, gap: 8 },
  motivationsList: { gap: 4 },
  motivationBullet: { fontSize: 16, lineHeight: 22, fontWeight: '700' },
  motivationText: { fontSize: 14, lineHeight: 22, flex: 1 },
  motivationInputRow: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  motivationInput: { fontSize: 14, lineHeight: 20 },
});
