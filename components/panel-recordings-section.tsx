import React, { useState, useCallback, useEffect, useRef } from "react";
import {
  View, Text, Pressable, StyleSheet, Alert, ActivityIndicator,
  Platform,
} from "react-native";
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from "expo-audio";
import * as FileSystem from "expo-file-system/legacy";
import { trpc } from "@/lib/trpc";
import { getApiBaseUrl } from "@/constants/oauth";
import * as Auth from "@/lib/_core/auth";
import { getLastUserId, loadDayNotes, saveDayNotes } from "@/lib/storage";
import {
  addEntry,
  generateId,
  GRATITUDE_HEADER,
  type JournalEntry,
} from "@/lib/journal-store";
import { useApp } from "@/lib/app-context";
import type { ThemeColorPalette } from "@/constants/theme";

// ─── Types ─────────────────────────────────────────────────────────────────
type Recording = {
  id: number;
  filename: string;
  category: string;
  sizeBytes: number;
  contentType: string;
  transcription: string | null;
  status: string;
  journalEntries: string | null;
  gratitudeItems: string | null;
  habitResults: string | null;
  extractedTasks: string | null;
  audioUrl: string | null;
  acked: number;
  createdAt: Date | string;
};

type HabitResult = {
  rating: "green" | "yellow" | "red" | null;
  note: string;
};

type ExtractedTask = {
  title: string;
  notes?: string;
  priority?: string;
};

// ─── Helpers ────────────────────────────────────────────────────────────────
function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(d: Date | string | null | undefined): string {
  if (!d) return "Unknown date";
  const dt = typeof d === "string" ? new Date(d) : d;
  if (isNaN(dt.getTime())) return "Unknown date";
  return (
    dt.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) +
    " " +
    dt.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
  );
}

function categoryLabel(cat: string | null | undefined): string {
  if (!cat) return "Recording";
  if (cat === "journal") return "Journal";
  if (cat === "gratitude") return "Gratitude";
  if (cat === "minddump") return "Mind Dump";
  return cat.charAt(0).toUpperCase() + cat.slice(1);
}

function categoryColor(cat: string | null | undefined, colors: ThemeColorPalette): string {
  if (!cat) return colors.muted;
  if (cat === "journal") return colors.primary;
  if (cat === "gratitude") return colors.success;
  if (cat === "minddump") return colors.warning;
  return colors.muted;
}

function statusLabel(status: string): string {
  if (status === "pending" || status === "processing") return "⏳ Transcribing…";
  if (status === "processed") return "✓ Ready";
  if (status === "failed") return "⚠ Failed";
  return status;
}

function ratingColor(rating: string | null, colors: ThemeColorPalette): string {
  if (rating === "green") return colors.success;
  if (rating === "yellow") return colors.warning;
  if (rating === "red") return colors.error;
  return colors.muted;
}

function ratingEmoji(rating: string | null): string {
  if (rating === "green") return "G";
  if (rating === "yellow") return "Y";
  if (rating === "red") return "R";
  return "-";
}

function buildJournalBody(
  journalEntries: string[],
  gratitudeItems: string[]
): string {
  const parts: string[] = [];
  if (gratitudeItems.length > 0) {
    parts.push(GRATITUDE_HEADER);
    gratitudeItems.forEach((g, i) => parts.push(`${i + 1}. ${g}`));
    parts.push("");
  }
  if (journalEntries.length > 0) {
    parts.push(...journalEntries);
  }
  return parts.join("\n").trim();
}

// ─── Audio player button ───────────────────────────────────────────────────
// Uses createAudioPlayer (not useAudioPlayer) so we can call player.replace()
// when the URI becomes available after download, and release() on unmount.
function AudioPlayButton({
  recId,
  contentType,
  accent,
  disabled: disabledProp,
}: {
  recId: number;
  contentType: string;
  accent: string;
  disabled?: boolean;
}) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  // Stable player ref — created once, source replaced when URI is known
  const playerRef = useRef<AudioPlayer | null>(null);

  // Create player once on mount, release on unmount
  useEffect(() => {
    const p = createAudioPlayer(null);
    playerRef.current = p;
    // Track playing state via event listener
    const sub = p.addListener("playbackStatusUpdate", (status: any) => {
      setIsPlaying(status.playing ?? false);
    });
    return () => {
      sub.remove();
      p.remove();
      playerRef.current = null;
    };
  }, []);

  const handlePress = useCallback(async () => {
    const player = playerRef.current;
    if (!player || disabledProp) return;
    try {
      // Fix: correct key is playsInSilentMode (not playsInSilentModeIOS)
      if (Platform.OS !== "web") {
        await setAudioModeAsync({ playsInSilentMode: true });
      }
      // If already loaded, toggle play/pause
      if (ready) {
        if (isPlaying) {
          player.pause();
        } else {
          player.play();
        }
        return;
      }
      setLoading(true);
      const token = await Auth.getSessionToken();
      const url = `${getApiBaseUrl()}/api/device/recording/${recId}`;

      if (Platform.OS === "web") {
        // On web: fetch with auth header, create blob URL so the Audio element
        // doesn't need to send cookies cross-origin
        const resp = await fetch(url, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          credentials: "include",
        });
        if (!resp.ok) throw new Error(`Server returned ${resp.status}`);
        const blob = await resp.blob();
        const blobUrl = URL.createObjectURL(blob);
        player.replace({ uri: blobUrl });
        player.play();
        setReady(true);
        setLoading(false);
        return;
      }

      // Native: download to cache with auth header
      const ext = contentType.includes("mp3") ? "mp3" : "wav";
      const dest = `${FileSystem.cacheDirectory}panel_rec_${recId}.${ext}`;
      const existing = await FileSystem.getInfoAsync(dest);
      if (!existing.exists) {
        await FileSystem.downloadAsync(url, dest, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
      }
      player.replace({ uri: dest });
      player.play();
      setReady(true);
      setLoading(false);
    } catch (err: any) {
      setLoading(false);
      Alert.alert("Playback error", err?.message ?? "Could not load recording");
    }
  }, [ready, isPlaying, recId, contentType, disabledProp]);

  return (
    <Pressable
      onPress={handlePress}
      style={({ pressed }) => [
        styles.playBtn,
        { backgroundColor: accent, opacity: (pressed || disabledProp) ? 0.4 : 1 },
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color="#fff" />
      ) : (
        <Text style={styles.playIcon}>{isPlaying ? "||" : ">"}</Text>
      )}
    </Pressable>
  );
}

// ─── Single recording card ───────────────────────────────────────────────────
function RecordingCard({
  rec,
  colors,
  onSaved,
  onDelete,
}: {
  rec: Recording;
  colors: ThemeColorPalette;
  onSaved: () => void;
  onDelete: (id: number) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const { submitCheckIn } = useApp();
  const accent = categoryColor(rec.category, colors);
  const isProcessed = rec.status === "processed";
  const isPending = rec.status === "pending" || rec.status === "processing";

  // Parse extracted data
  const journalEntries: string[] = React.useMemo(() => {
    try { return rec.journalEntries ? JSON.parse(rec.journalEntries) : []; } catch { return []; }
  }, [rec.journalEntries]);

  const gratitudeItems: string[] = React.useMemo(() => {
    try { return rec.gratitudeItems ? JSON.parse(rec.gratitudeItems) : []; } catch { return []; }
  }, [rec.gratitudeItems]);

  const habitResults: Record<string, HabitResult> = React.useMemo(() => {
    try { return rec.habitResults ? JSON.parse(rec.habitResults) : {}; } catch { return {}; }
  }, [rec.habitResults]);

  const extractedTasks: ExtractedTask[] = React.useMemo(() => {
    try { return rec.extractedTasks ? JSON.parse(rec.extractedTasks) : []; } catch { return []; }
  }, [rec.extractedTasks]);

  const habitEntries = Object.entries(habitResults).filter(([, v]) => v && v.rating);

  const handleSaveToJournal = useCallback(async () => {
    if (!isProcessed) return;
    setSaving(true);
    try {
      const userId = await getLastUserId();
      if (!userId) throw new Error("Not logged in");

      const finalJournalEntries = journalEntries.length > 0
        ? journalEntries
        : rec.transcription ? [rec.transcription] : [];

      const body = buildJournalBody(finalJournalEntries, gratitudeItems);
      const now = new Date();
      const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

      // 1. Save journal entry
      const entry: JournalEntry = {
        id: generateId(),
        userId,
        date: dateStr,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
        title: `Panel Voice Log — ${categoryLabel(rec.category)}`,
        body,
        template: "blank",
        attachments: [],
        tags: ["panel", rec.category, "voice"],
        transcriptionStatus: "done",
        transcriptionText: rec.transcription ?? undefined,
        gratitudes: gratitudeItems,
      };
      await addEntry(userId, entry);

      // 2. Apply habit ratings to check-ins (same as voice-checkin flow)
      if (habitEntries.length > 0) {
        const ratingsMap: Record<string, "red" | "yellow" | "green"> = {};
        for (const [habitId, result] of habitEntries) {
          if (result.rating) ratingsMap[habitId] = result.rating;
        }
        await submitCheckIn(dateStr, ratingsMap);
      }

      // 3. Save habit notes to day notes
      if (habitEntries.length > 0) {
        const allNotes = await loadDayNotes();
        for (const [habitId, result] of habitEntries) {
          if (result.note?.trim()) {
            allNotes[`${habitId}:${dateStr}`] = result.note.trim();
          }
        }
        await saveDayNotes(allNotes);
      }

      // 4. ACK the recording so the panel can delete the SD file
      const token = await Auth.getSessionToken();
      await fetch(`${getApiBaseUrl()}/api/device/recording/${rec.id}/ack`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });

      setSaving(false);
      onSaved();
      Alert.alert("Saved!", "Recording saved to your journal.");
    } catch (err: any) {
      setSaving(false);
      Alert.alert("Error", err?.message ?? "Could not save to journal");
    }
  }, [rec, isProcessed, journalEntries, gratitudeItems, habitEntries, submitCheckIn, onSaved]);

  const confirmDelete = () => {
    Alert.alert(
      "Delete Recording",
      "Remove this recording permanently? It won't be saved to your journal.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: () => onDelete(rec.id) },
      ]
    );
  };

  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      {/* Header row: badge + status + date */}
      <View style={styles.cardHeader}>
        <View style={[styles.badge, { backgroundColor: accent + "22" }]}>
          <Text style={[styles.badgeText, { color: accent }]}>
            {categoryLabel(rec.category)}
          </Text>
        </View>
        <Text style={[
          styles.statusText,
          { color: isPending ? colors.warning : isProcessed ? colors.success : colors.error },
        ]}>
          {statusLabel(rec.status)}
        </Text>
        <Text style={[styles.dateText, { color: colors.muted }]}>
          {formatDate(rec.createdAt)}
        </Text>
      </View>

      {/* Transcription preview / pending state */}
      {rec.transcription ? (
        <Pressable onPress={() => setExpanded((e) => !e)}>
          <Text
            style={[styles.transcript, { color: colors.foreground }]}
            numberOfLines={expanded ? undefined : 3}
          >
            {rec.transcription}
          </Text>
          {rec.transcription.length > 120 && (
            <Text style={[styles.expandToggle, { color: colors.primary }]}>
              {expanded ? "Show less" : "Show more"}
            </Text>
          )}
        </Pressable>
      ) : isPending ? (
        <View style={styles.pendingRow}>
          <ActivityIndicator size="small" color={colors.warning} />
          <Text style={[styles.pendingText, { color: colors.muted }]}>
            Processing your recording…
          </Text>
        </View>
      ) : null}

      {/* Gratitude items */}
      {isProcessed && gratitudeItems.length > 0 && (
        <View style={[styles.extractedBox, { borderColor: colors.success + "44", backgroundColor: colors.success + "11" }]}>
          <Text style={[styles.extractedLabel, { color: colors.success }]}>Gratitude</Text>
          {gratitudeItems.slice(0, 3).map((g, i) => (
            <Text key={`g-${i}-${g.slice(0,10)}`} style={[styles.extractedItem, { color: colors.foreground }]}>• {g}</Text>
          ))}
          {gratitudeItems.length > 3 && (
            <Text style={[styles.extractedMore, { color: colors.muted }]}>+{gratitudeItems.length - 3} more</Text>
          )}
        </View>
      )}

      {/* Habit ratings */}
      {isProcessed && habitEntries.length > 0 && (
        <View style={[styles.extractedBox, { borderColor: colors.primary + "44", backgroundColor: colors.primary + "0D" }]}>
          <Text style={[styles.extractedLabel, { color: colors.primary }]}>Habit Ratings</Text>
          {habitEntries.map(([habitId, result]) => (
            <View key={habitId} style={styles.habitRow}>
              <Text style={styles.ratingEmoji}>{ratingEmoji(result.rating)}</Text>
              <View style={{ flex: 1 }}>
                <Text style={[styles.habitId, { color: ratingColor(result.rating, colors) }]}>
                  {habitId}
                </Text>
                {result.note ? (
                  <Text style={[styles.habitNote, { color: colors.muted }]} numberOfLines={2}>
                    {result.note}
                  </Text>
                ) : null}
              </View>
            </View>
          ))}
        </View>
      )}

      {/* Extracted tasks */}
      {isProcessed && extractedTasks.length > 0 && (
        <View style={[styles.extractedBox, { borderColor: colors.warning + "44", backgroundColor: colors.warning + "11" }]}>
          <Text style={[styles.extractedLabel, { color: colors.warning }]}>Tasks</Text>
          {extractedTasks.slice(0, 3).map((task, i) => (
            <Text key={`t-${i}-${task.title.slice(0,10)}`} style={[styles.extractedItem, { color: colors.foreground }]}>
              • {task.title}
            </Text>
          ))}
          {extractedTasks.length > 3 && (
            <Text style={[styles.extractedMore, { color: colors.muted }]}>+{extractedTasks.length - 3} more</Text>
          )}
        </View>
      )}

      {/* Action row */}
      <View style={styles.actions}>
        <AudioPlayButton
          recId={rec.id}
          contentType={rec.contentType}
          accent={accent}
          disabled={rec.status === "failed"}
        />

        {isProcessed && (
          <Pressable
            onPress={handleSaveToJournal}
            style={({ pressed }) => [
              styles.saveBtn,
              { backgroundColor: colors.primary, opacity: pressed || saving ? 0.7 : 1 },
            ]}
          >
            {saving ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.saveBtnText}>Save to Journal</Text>
            )}
          </Pressable>
        )}

        <View style={{ flex: 1 }} />

        <Text style={[styles.sizeText, { color: colors.muted }]}>
          {formatBytes(rec.sizeBytes)}
        </Text>

        <Pressable
          onPress={confirmDelete}
          style={({ pressed }) => [styles.delBtn, { opacity: pressed ? 0.5 : 1 }]}
        >
          <Text style={[styles.delIcon, { color: colors.error }]}>X</Text>
        </Pressable>
      </View>
    </View>
  );
}

// ─── Main section component ─────────────────────────────────────────────────
export function PanelRecordingsSection({ colors }: { colors: ThemeColorPalette }) {
  const { data: recordings, isLoading, refetch } = trpc.devices.getRecordings.useQuery(
    {},
    { staleTime: 15_000, refetchInterval: 10_000 } // Poll every 10s so pending → processed updates appear
  );

  const deleteMutation = trpc.devices.deleteRecording.useMutation({
    onSuccess: () => refetch(),
    onError: (err) => Alert.alert("Error", err.message),
  });

  const handleDelete = useCallback(
    (id: number) => deleteMutation.mutate({ id }),
    [deleteMutation]
  );

  const handleSaved = useCallback(() => refetch(), [refetch]);

  if (isLoading) {
    return (
      <View style={styles.emptyBox}>
        <ActivityIndicator size="small" color={colors.muted} />
      </View>
    );
  }

  if (!recordings || recordings.length === 0) return null;

  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
          Panel Recordings
        </Text>
        <Text style={[styles.sectionCount, { color: colors.muted }]}>
          {recordings.length} {recordings.length === 1 ? "recording" : "recordings"}
        </Text>
      </View>

      {recordings.map((rec, idx) => (
        <RecordingCard
          key={rec.id != null ? String(rec.id) : `rec-${idx}`}
          rec={rec as Recording}
          colors={colors}
          onSaved={handleSaved}
          onDelete={handleDelete}
        />
      ))}
    </View>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  section: {
    marginTop: 24,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    marginBottom: 10,
    paddingHorizontal: 2,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  sectionCount: {
    fontSize: 12,
  },
  card: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    marginBottom: 12,
    gap: 10,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  badge: {
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  statusText: {
    fontSize: 11,
    fontWeight: "600",
  },
  dateText: {
    fontSize: 11,
    marginLeft: "auto",
  },
  transcript: {
    fontSize: 13,
    lineHeight: 19,
  },
  expandToggle: {
    fontSize: 11,
    fontWeight: "600",
    marginTop: 2,
  },
  pendingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  pendingText: {
    fontSize: 12,
    fontStyle: "italic",
  },
  extractedBox: {
    borderRadius: 8,
    borderWidth: 1,
    padding: 10,
    gap: 3,
  },
  extractedLabel: {
    fontSize: 11,
    fontWeight: "700",
    marginBottom: 2,
  },
  extractedItem: {
    fontSize: 12,
    lineHeight: 17,
  },
  extractedMore: {
    fontSize: 11,
    fontStyle: "italic",
  },
  habitRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
    marginVertical: 2,
  },
  ratingEmoji: {
    fontSize: 13,
    lineHeight: 18,
  },
  habitId: {
    fontSize: 12,
    fontWeight: "600",
    lineHeight: 17,
  },
  habitNote: {
    fontSize: 11,
    lineHeight: 15,
    marginTop: 1,
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 2,
  },
  playBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  playIcon: {
    fontSize: 14,
    color: "#fff",
  },
  saveBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  saveBtnText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#fff",
  },
  sizeText: {
    fontSize: 11,
  },
  delBtn: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  delIcon: {
    fontSize: 16,
  },
  emptyBox: {
    paddingVertical: 16,
    alignItems: "center",
  },
});
