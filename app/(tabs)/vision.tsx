import {
  View, Text, ScrollView, Pressable, Image, StyleSheet,
  Alert, Dimensions, Modal, Platform, FlatList, TextInput,
  KeyboardAvoidingView,
} from "react-native";
import { useContentMaxWidth } from "@/hooks/use-is-ipad";
import { useState, useEffect, useCallback, useRef } from "react";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system/legacy";
import * as MediaLibrary from "expo-media-library";
import { ScreenContainer } from "@/components/screen-container";
import { useApp } from "@/lib/app-context";
import { useColors } from "@/hooks/use-colors";
import { IconSymbol } from "@/components/ui/icon-symbol";
import {
  loadVisionBoard, saveVisionBoard, VisionBoard,
  loadVisionMotivations, saveVisionMotivations, VisionMotivations,
} from "@/lib/storage";

const { width: SCREEN_W } = Dimensions.get("window");
const PADDING = 20;
const CARD_W = SCREEN_W - PADDING * 2;
const CAROUSEL_H = Math.floor(CARD_W * 0.62);

// ─── Copy a URI to permanent app storage ─────────────────────────────────────
// Returns the permanent file:// path on success, or null if the copy failed.
// NEVER returns the original ph:// URI — those are ephemeral and will break on restart.
async function persistUri(uri: string): Promise<string | null> {
  if (Platform.OS === "web") return uri;

  const docDir = FileSystem.documentDirectory ?? "";

  // Already in documentDirectory — verify it still exists
  if (uri.startsWith(docDir)) {
    try {
      const info = await FileSystem.getInfoAsync(uri);
      if (info.exists) return uri;
    } catch { /* fall through to re-copy */ }
    return null; // file was deleted, don't keep a dead reference
  }

  // On iOS, ImagePicker returns ph:// asset URIs which FileSystem.copyAsync cannot read.
  // We MUST resolve them to a real file:// localUri via MediaLibrary first.
  let resolvedUri: string | null = null;

  if (Platform.OS === "ios" && uri.startsWith("ph://")) {
    try {
      // Extract the asset ID — ph://<assetId>/L0/001 or ph://<assetId>
      const assetId = uri.replace("ph://", "").split("/")[0];
      const assetInfo = await MediaLibrary.getAssetInfoAsync(assetId);
      if (assetInfo?.localUri) {
        resolvedUri = assetInfo.localUri;
      }
    } catch {
      // getAssetInfoAsync failed — cannot proceed
    }
    if (!resolvedUri) {
      // Could not resolve ph:// to a real path — do not save this URI
      return null;
    }
  } else {
    resolvedUri = uri;
  }

  // Generate a unique filename in permanent document storage
  const ext = resolvedUri.split(".").pop()?.split("?")[0]?.toLowerCase() ?? "jpg";
  const safeExt = ["jpg", "jpeg", "png", "heic", "heif", "webp", "gif"].includes(ext) ? ext : "jpg";
  const dest = `${docDir}visionboard_${Date.now()}_${Math.random().toString(36).slice(2)}.${safeExt}`;

  try {
    await FileSystem.copyAsync({ from: resolvedUri, to: dest });
    // Verify the copy actually worked and has content
    const info = await FileSystem.getInfoAsync(dest);
    if (info.exists && (info as { size?: number }).size && (info as { size?: number }).size! > 0) {
      return dest;
    }
    // Copy produced an empty file — clean up and report failure
    await FileSystem.deleteAsync(dest, { idempotent: true });
    return null;
  } catch {
    // Copy failed entirely — clean up any partial file
    try { await FileSystem.deleteAsync(dest, { idempotent: true }); } catch { /* ignore */ }
    return null;
  }
}

// ─── Swipeable photo carousel ─────────────────────────────────────────────────
function PhotoCarousel({
  uris,
  height,
  onPhotoPress,
}: {
  uris: string[];
  height: number;
  onPhotoPress?: (uri: string, index: number) => void;
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
      {/* Dot indicators */}
      {uris.length > 1 && (
        <View style={styles.dotRow}>
          {uris.map((_, i) => (
            <View
              key={i}
              style={[
                styles.dot,
                { backgroundColor: i === index ? "#fff" : "rgba(255,255,255,0.45)", width: i === index ? 16 : 6 },
              ]}
            />
          ))}
        </View>
      )}
    </View>
  );
}

// ─── Goal Detail Modal ────────────────────────────────────────────────────────
function GoalDetailModal({
  visible,
  cat,
  images,
  motivations,
  onClose,
  onAddPhoto,
  onRemovePhoto,
  onAddMotivation,
  onEditMotivation,
  onDeleteMotivation,
  colors,
}: {
  visible: boolean;
  cat: { id: string; label: string; emoji: string; deadline?: string };
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

  function startEdit(i: number) {
    setEditingIndex(i);
    setEditText(motivations[i]);
  }

  function submitEdit() {
    if (editingIndex === null) return;
    const t = editText.trim();
    if (t) onEditMotivation(editingIndex, t);
    setEditingIndex(null);
    setEditText("");
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: colors.background }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        {/* Header */}
        <View style={[detailStyles.header, { borderBottomColor: colors.border }]}>
          <Text style={[detailStyles.headerEmoji]}>{cat.emoji}</Text>
          <Text style={[detailStyles.headerTitle, { color: colors.foreground }]} numberOfLines={1}>
            {cat.label}
          </Text>
          <Pressable onPress={onClose} style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1, padding: 4 })}>
            <IconSymbol name="xmark.circle.fill" size={26} color={colors.muted} />
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={detailStyles.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          {/* ── Motivations section ── */}
          <Text style={[detailStyles.sectionLabel, { color: colors.muted }]}>WHY THIS MATTERS</Text>

          {motivations.length === 0 && (
            <Text style={[detailStyles.emptyMotive, { color: colors.muted }]}>
              Add your reasons below — why is this goal important to you?
            </Text>
          )}

          {motivations.map((m, i) => (
            <View key={i} style={[detailStyles.motiveRow, { borderColor: colors.border, backgroundColor: colors.surface }]}>
              {editingIndex === i ? (
                <TextInput
                  style={[detailStyles.motiveEditInput, { color: colors.foreground, borderColor: colors.primary }]}
                  value={editText}
                  onChangeText={setEditText}
                  onSubmitEditing={submitEdit}
                  onBlur={submitEdit}
                  returnKeyType="done"
                  autoFocus
                  multiline
                />
              ) : (
                <Pressable
                  onPress={() => startEdit(i)}
                  style={{ flex: 1, flexDirection: "row", alignItems: "flex-start", gap: 8 }}
                >
                  <Text style={[detailStyles.motiveBullet, { color: colors.primary }]}>•</Text>
                  <Text style={[detailStyles.motiveText, { color: colors.foreground }]}>{m}</Text>
                </Pressable>
              )}
              {editingIndex !== i && (
                <Pressable
                  onPress={() => onDeleteMotivation(i)}
                  style={({ pressed }) => [detailStyles.deleteBtn, { opacity: pressed ? 0.5 : 1 }]}
                >
                  <IconSymbol name="trash.fill" size={14} color="#EF4444" />
                </Pressable>
              )}
            </View>
          ))}

          {/* Add motivation input */}
          <View style={[detailStyles.addMotiveRow, { borderColor: colors.border, backgroundColor: colors.surface }]}>
            <TextInput
              style={[detailStyles.addMotiveInput, { color: colors.foreground }]}
              placeholder="Add a reason this goal matters..."
              placeholderTextColor={colors.muted}
              value={newText}
              onChangeText={setNewText}
              returnKeyType="done"
              onSubmitEditing={submitNew}
              multiline={false}
            />
            <Pressable
              onPress={submitNew}
              style={({ pressed }) => [
                detailStyles.addMotiveBtn,
                { backgroundColor: colors.primary, opacity: pressed ? 0.7 : 1 },
              ]}
            >
              <IconSymbol name="plus" size={16} color="#fff" />
            </Pressable>
          </View>

          {/* ── Photos section ── */}
          <View style={detailStyles.photoHeader}>
            <Text style={[detailStyles.sectionLabel, { color: colors.muted }]}>PHOTOS</Text>
            <Pressable
              onPress={onAddPhoto}
              style={({ pressed }) => [
                detailStyles.addPhotoBtn,
                { backgroundColor: colors.primary + "18", borderColor: colors.primary + "44", opacity: pressed ? 0.7 : 1 },
              ]}
            >
              <IconSymbol name="plus" size={13} color={colors.primary} />
              <Text style={[detailStyles.addPhotoBtnText, { color: colors.primary }]}>Add Photos</Text>
            </Pressable>
          </View>

          {images.length === 0 ? (
            <Pressable
              onPress={onAddPhoto}
              style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1, paddingVertical: 8 })}
            >
              <Text style={[detailStyles.emptyMotive, { color: colors.primary }]}>+ Add your first photo</Text>
            </Pressable>
          ) : (
            <>
              {/* Full-width swipeable carousel */}
              <View style={{ borderRadius: 14, overflow: "hidden", marginBottom: 12 }}>
                <FlatList
                  ref={flatRef}
                  data={images}
                  horizontal
                  pagingEnabled
                  showsHorizontalScrollIndicator={false}
                  keyExtractor={(u, i) => `detail-${u}-${i}`}
                  onMomentumScrollEnd={(e) => {
                    const newIdx = Math.round(e.nativeEvent.contentOffset.x / (SCREEN_W - PADDING * 2));
                    setPhotoIndex(newIdx);
                  }}
                  renderItem={({ item }) => (
                    <Image
                      source={{ uri: item }}
                      style={{ width: SCREEN_W - PADDING * 2, height: Math.floor((SCREEN_W - PADDING * 2) * 0.75) }}
                      resizeMode="cover"
                    />
                  )}
                />
                {images.length > 1 && (
                  <View style={styles.dotRow}>
                    {images.map((_, i) => (
                      <View
                        key={i}
                        style={[styles.dot, { backgroundColor: i === photoIndex ? "#fff" : "rgba(255,255,255,0.45)", width: i === photoIndex ? 16 : 6 }]}
                      />
                    ))}
                  </View>
                )}
              </View>

              {/* Thumbnail strip with delete */}
              <View style={detailStyles.thumbStrip}>
                {images.map((uri, i) => (
                  <View key={`thumb-${i}`} style={detailStyles.thumbWrap}>
                    <Image source={{ uri }} style={detailStyles.thumb} resizeMode="cover" />
                    <Pressable
                      onPress={() => {
                        Alert.alert("Remove Photo", "Remove this photo?", [
                          { text: "Cancel", style: "cancel" },
                          { text: "Remove", style: "destructive", onPress: () => onRemovePhoto(uri) },
                        ]);
                      }}
                      style={detailStyles.thumbDelete}
                    >
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

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function VisionBoardScreen() {
  const { categories } = useApp();
  const colors = useColors();
  const maxWidth = useContentMaxWidth();
  const sortedCategories = [...categories].sort((a, b) => a.order - b.order);

  const [board, setBoard] = useState<VisionBoard>({});
  const [motivations, setMotivations] = useState<VisionMotivations>({});
  const [detailCatId, setDetailCatId] = useState<string | null>(null);

  useEffect(() => {
    // Load board and strip any stale ph:// or non-file:// URIs saved by older app versions.
    // Those URIs are ephemeral iOS asset references that expire after app restart.
    loadVisionBoard().then(async (loaded) => {
      if (Platform.OS !== "web") {
        const docDir = FileSystem.documentDirectory ?? "";
        let needsSave = false;
        const cleaned: VisionBoard = {};
        for (const [catId, uris] of Object.entries(loaded)) {
          const valid: string[] = [];
          for (const uri of uris) {
            // Keep only URIs already in permanent documentDirectory
            if (uri.startsWith(docDir)) {
              try {
                const info = await FileSystem.getInfoAsync(uri);
                if (info.exists) valid.push(uri);
                else needsSave = true; // file was deleted from disk
              } catch {
                needsSave = true;
              }
            } else {
              // ph://, cache://, or other ephemeral URI — discard it
              needsSave = true;
            }
          }
          cleaned[catId] = valid;
        }
        setBoard(cleaned);
        if (needsSave) await saveVisionBoard(cleaned);
      } else {
        setBoard(loaded);
      }
    });
    loadVisionMotivations().then(setMotivations);
  }, []);

  async function updateBoard(newBoard: VisionBoard) {
    setBoard(newBoard);
    await saveVisionBoard(newBoard);
  }

  async function updateMotivations(newMot: VisionMotivations) {
    setMotivations(newMot);
    await saveVisionMotivations(newMot);
  }

  const pickImage = useCallback(async (catId: string) => {
    if (Platform.OS !== "web") {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Permission needed", "Please allow access to your photo library.");
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
      // Copy each photo to permanent storage; filter out any that failed (null)
      const results = await Promise.all(result.assets.map((a) => persistUri(a.uri)));
      const persistedUris = results.filter((u): u is string => u !== null);
      if (persistedUris.length === 0) {
        Alert.alert("Could not save photos", "Unable to copy photos to app storage. Please try again.");
        return;
      }
      const existing = board[catId] ?? [];
      const updated = { ...board, [catId]: [...existing, ...persistedUris] };
      await updateBoard(updated);
      if (persistedUris.length < result.assets.length) {
        Alert.alert("Some photos skipped", `${result.assets.length - persistedUris.length} photo(s) could not be saved and were skipped.`);
      }
    }
  }, [board]);

  const removeImage = useCallback(async (catId: string, uri: string) => {
    const existing = board[catId] ?? [];
    const updated = { ...board, [catId]: existing.filter((u) => u !== uri) };
    await updateBoard(updated);
    // Try to delete the file from permanent storage
    if (Platform.OS !== "web" && uri.startsWith(FileSystem.documentDirectory ?? "")) {
      try { await FileSystem.deleteAsync(uri, { idempotent: true }); } catch { /* ignore */ }
    }
  }, [board]);

  const detailCat = detailCatId ? sortedCategories.find((c) => c.id === detailCatId) : null;

  return (
    <ScreenContainer>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={maxWidth ? { maxWidth, alignSelf: 'center', width: '100%' } : undefined}>
        <Text style={[styles.pageTitle, { color: colors.foreground }]}>Vision Board</Text>
        <Text style={[styles.pageSubtitle, { color: colors.muted }]}>
          Tap a goal to add photos and reasons. Swipe photos to browse.
        </Text>

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
            <View
              key={cat.id}
              style={[styles.catSection, { backgroundColor: colors.surface, borderColor: colors.border }]}
            >
              {/* Tappable goal header → opens detail */}
              <Pressable
                onPress={() => setDetailCatId(cat.id)}
                style={({ pressed }) => [styles.catHeader, { opacity: pressed ? 0.75 : 1 }]}
              >
                <Text style={styles.catEmoji}>{cat.emoji}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.catLabel, { color: colors.foreground }]}>{cat.label}</Text>
                  {deadlineLabel && (
                    <Text style={[styles.visionDeadline, { color: deadlineColor }]}>{deadlineLabel}</Text>
                  )}

                </View>
                <View style={styles.headerRight}>
                  <Pressable
                    onPress={() => pickImage(cat.id)}
                    style={({ pressed }) => [
                      styles.addBtn,
                      { backgroundColor: colors.primary + "18", borderColor: colors.primary + "44", opacity: pressed ? 0.7 : 1 },
                    ]}
                  >
                    <IconSymbol name="plus" size={13} color={colors.primary} />
                    <Text style={[styles.addBtnText, { color: colors.primary }]}>Photos</Text>
                  </Pressable>
                  <IconSymbol name="chevron.right" size={16} color={colors.muted} />
                </View>
              </Pressable>

              {/* Motivations — shown prominently below header, above photos */}
              {catMotivations.length > 0 && (
                <Pressable
                  onPress={() => setDetailCatId(cat.id)}
                  style={[styles.motivationsPreview, { borderTopColor: colors.border }]}
                >
                  <Text style={[styles.motiveSectionLabel, { color: colors.muted }]}>WHY THIS MATTERS</Text>
                  {catMotivations.slice(0, 3).map((m, i) => (
                    <View key={i} style={{ flexDirection: "row", alignItems: "flex-start", gap: 8, marginTop: 4 }}>
                      <Text style={[styles.motiveBullet, { color: colors.primary }]}>•</Text>
                      <Text style={[styles.motiveText, { color: colors.foreground }]} numberOfLines={2}>{m}</Text>
                    </View>
                  ))}
                  {catMotivations.length > 3 && (
                    <Text style={[styles.moreText, { color: colors.primary }]}>
                      +{catMotivations.length - 3} more reasons →
                    </Text>
                  )}
                </Pressable>
              )}

              {/* Swipeable photo carousel */}
              {images.length > 0 && (
                <View style={{ marginTop: 8 }}>
                  <PhotoCarousel
                    uris={images}
                    height={CAROUSEL_H}
                    onPhotoPress={() => setDetailCatId(cat.id)}
                  />
                </View>
              )}

              {/* Empty state */}
              {images.length === 0 && catMotivations.length === 0 && (
                <Pressable
                  onPress={() => setDetailCatId(cat.id)}
                  style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1, paddingTop: 6, paddingBottom: 4 })}
                >
                  <Text style={[styles.emptyText, { color: colors.primary }]}>
                    Tap to add photos and reasons →
                  </Text>
                </Pressable>
              )}
            </View>
          );
        })}

        <View style={{ height: 40 }} />
        </View>
      </ScrollView>

      {/* Goal Detail Modal */}
      {detailCat && (
        <GoalDetailModal
          visible={detailCatId !== null}
          cat={detailCat}
          images={board[detailCat.id] ?? []}
          motivations={motivations[detailCat.id] ?? []}
          onClose={() => setDetailCatId(null)}
          onAddPhoto={() => pickImage(detailCat.id)}
          onRemovePhoto={(uri) => removeImage(detailCat.id, uri)}
          onAddMotivation={(text) => {
            const catMot = motivations[detailCat.id] ?? [];
            updateMotivations({ ...motivations, [detailCat.id]: [...catMot, text] });
          }}
          onEditMotivation={(index, text) => {
            const catMot = [...(motivations[detailCat.id] ?? [])];
            catMot[index] = text;
            updateMotivations({ ...motivations, [detailCat.id]: catMot });
          }}
          onDeleteMotivation={(index) => {
            const catMot = (motivations[detailCat.id] ?? []).filter((_, i) => i !== index);
            updateMotivations({ ...motivations, [detailCat.id]: catMot });
          }}
          colors={colors}
        />
      )}
    </ScreenContainer>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  scroll: { padding: PADDING, paddingBottom: 40 },
  pageTitle: { fontSize: 28, fontWeight: "800", letterSpacing: -0.5, marginBottom: 4 },
  pageSubtitle: { fontSize: 14, marginBottom: 20 },
  catSection: {
    borderRadius: 16, borderWidth: 1,
    marginBottom: 16, overflow: "hidden",
    paddingHorizontal: 14, paddingTop: 12, paddingBottom: 12,
  },
  catHeader: {
    flexDirection: "row", alignItems: "center", gap: 10,
  },
  catEmoji: { fontSize: 26 },
  catLabel: { fontSize: 16, fontWeight: "700" },
  visionDeadline: { fontSize: 12, marginTop: 1 },
  motivePreview: { fontSize: 12, marginTop: 2, fontStyle: "italic" },
  headerRight: { flexDirection: "row", alignItems: "center", gap: 8 },
  addBtn: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: 20, borderWidth: 1,
  },
  addBtnText: { fontSize: 12, fontWeight: "600" },
  dotRow: {
    position: "absolute", bottom: 8, left: 0, right: 0,
    flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 4,
  },
  dot: { height: 6, borderRadius: 3 },
  motivationsPreview: {
    marginTop: 10, paddingTop: 10, borderTopWidth: 1, gap: 4,
  },
  motiveSectionLabel: { fontSize: 10, fontWeight: "700", letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 2 },
  motiveBullet: { fontSize: 14, lineHeight: 20 },
  motiveText: { fontSize: 14, lineHeight: 20, flex: 1 },
  moreText: { fontSize: 12, fontWeight: "600", marginTop: 4 },
  emptyText: { fontSize: 14, fontWeight: "600" },
});

const detailStyles = StyleSheet.create({
  header: {
    flexDirection: "row", alignItems: "center", gap: 10,
    paddingHorizontal: 20, paddingTop: 16, paddingBottom: 14,
    borderBottomWidth: 1,
  },
  headerEmoji: { fontSize: 26 },
  headerTitle: { flex: 1, fontSize: 18, fontWeight: "700" },
  scroll: { padding: 20, paddingBottom: 60 },
  sectionLabel: {
    fontSize: 11, fontWeight: "700", letterSpacing: 1.2,
    marginBottom: 10, marginTop: 6,
  },
  emptyMotive: { fontSize: 14, fontStyle: "italic", marginBottom: 12 },
  motiveRow: {
    flexDirection: "row", alignItems: "center",
    borderRadius: 10, borderWidth: 1,
    paddingHorizontal: 12, paddingVertical: 10,
    marginBottom: 8, gap: 6,
  },
  motiveBullet: { fontSize: 16, lineHeight: 22 },
  motiveText: { fontSize: 15, lineHeight: 22, flex: 1 },
  motiveEditInput: {
    flex: 1, fontSize: 15, lineHeight: 22,
    borderWidth: 1.5, borderRadius: 8,
    paddingHorizontal: 8, paddingVertical: 4,
    minHeight: 36,
  },
  deleteBtn: {
    padding: 6, borderRadius: 8,
  },
  addMotiveRow: {
    flexDirection: "row", alignItems: "center",
    borderRadius: 12, borderWidth: 1,
    paddingLeft: 12, paddingRight: 6, paddingVertical: 6,
    marginBottom: 20, gap: 6,
  },
  addMotiveInput: { flex: 1, fontSize: 15, minHeight: 36 },
  addMotiveBtn: {
    width: 34, height: 34, borderRadius: 10,
    alignItems: "center", justifyContent: "center",
  },
  photoHeader: {
    flexDirection: "row", alignItems: "center",
    justifyContent: "space-between", marginBottom: 10,
  },
  addPhotoBtn: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: 20, borderWidth: 1,
  },
  addPhotoBtnText: { fontSize: 12, fontWeight: "600" },
  thumbStrip: {
    flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8,
  },
  thumbWrap: { position: "relative" },
  thumb: { width: 80, height: 80, borderRadius: 10 },
  thumbDelete: {
    position: "absolute", top: -6, right: -6,
    backgroundColor: "rgba(0,0,0,0.55)", borderRadius: 12,
  },
});
