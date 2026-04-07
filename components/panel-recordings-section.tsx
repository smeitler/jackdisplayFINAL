import React, { useState, useRef, useCallback } from "react";
import {
  View, Text, Pressable, StyleSheet, Alert, ActivityIndicator,
  FlatList, Platform,
} from "react-native";
import { useAudioPlayer, useAudioPlayerStatus, setAudioModeAsync } from "expo-audio";
import * as FileSystem from "expo-file-system/legacy";
import { trpc } from "@/lib/trpc";
import { getApiBaseUrl } from "@/constants/oauth";
import * as Auth from "@/lib/_core/auth";
import type { ThemeColorPalette } from "@/constants/theme";

// ─── Types ─────────────────────────────────────────────────────────────────
type Recording = {
  id: number;
  filename: string;
  category: string;
  sizeBytes: number;
  contentType: string;
  transcription: string | null;
  createdAt: Date | string;
};

// ─── Helpers ────────────────────────────────────────────────────────────────
function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(d: Date | string): string {
  const dt = typeof d === "string" ? new Date(d) : d;
  return dt.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) +
    " " + dt.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

function categoryLabel(cat: string): string {
  if (cat === "journal") return "Journal";
  if (cat === "gratitude") return "Gratitude";
  if (cat === "minddump") return "Mind Dump";
  return cat.charAt(0).toUpperCase() + cat.slice(1);
}

function categoryColor(cat: string, colors: ThemeColorPalette): string {
  if (cat === "journal") return colors.primary;
  if (cat === "gratitude") return colors.success;
  if (cat === "minddump") return colors.warning;
  return colors.muted;
}

// ─── Single recording row ───────────────────────────────────────────────────
function RecordingRow({
  rec,
  colors,
  onDelete,
}: {
  rec: Recording;
  colors: ThemeColorPalette;
  onDelete: (id: number) => void;
}) {
  const [localUri, setLocalUri] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const player = useAudioPlayer(localUri ?? "");
  const status = useAudioPlayerStatus(player);
  const isPlaying = status.playing;

  const fetchAndPlay = useCallback(async () => {
    try {
      if (Platform.OS !== "web") {
        await setAudioModeAsync({ playsInSilentModeIOS: true });
      }

      // If we already have the file cached, just play/pause
      if (localUri) {
        if (isPlaying) {
          player.pause();
        } else {
          player.play();
        }
        return;
      }

      setLoading(true);
      const token = await Auth.getSessionToken();
      const url = `${getApiBaseUrl()}/api/device/recording/${rec.id}`;

      if (Platform.OS === "web") {
        // Web: play directly from URL
        setLocalUri(url);
        setLoading(false);
        return;
      }

      // Native: download to cache first
      const dest = `${FileSystem.cacheDirectory}panel_rec_${rec.id}.wav`;
      const existing = await FileSystem.getInfoAsync(dest);
      if (!existing.exists) {
        await FileSystem.downloadAsync(url, dest, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
      }
      setLocalUri(dest);
      setLoading(false);
    } catch (err: any) {
      setLoading(false);
      Alert.alert("Playback error", err?.message ?? "Could not load recording");
    }
  }, [localUri, isPlaying, player, rec.id]);

  // Auto-play once localUri is set
  React.useEffect(() => {
    if (localUri && !isPlaying) {
      player.play();
    }
  }, [localUri]);

  const confirmDelete = () => {
    Alert.alert(
      "Delete Recording",
      "Remove this recording permanently?",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: () => onDelete(rec.id) },
      ]
    );
  };

  const accent = categoryColor(rec.category, colors);

  return (
    <View style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      {/* Category badge */}
      <View style={[styles.badge, { backgroundColor: accent + "22" }]}>
        <Text style={[styles.badgeText, { color: accent }]}>
          {categoryLabel(rec.category)}
        </Text>
      </View>

      {/* Meta */}
      <View style={styles.meta}>
        <Text style={[styles.filename, { color: colors.foreground }]} numberOfLines={1}>
          {rec.filename.split("/").pop()}
        </Text>
        <Text style={[styles.sub, { color: colors.muted }]}>
          {formatDate(rec.createdAt)} · {formatBytes(rec.sizeBytes)}
        </Text>
        {rec.transcription ? (
          <Text style={[styles.transcript, { color: colors.muted }]} numberOfLines={2}>
            {rec.transcription}
          </Text>
        ) : null}
      </View>

      {/* Controls */}
      <View style={styles.controls}>
        <Pressable
          onPress={fetchAndPlay}
          style={({ pressed }) => [
            styles.playBtn,
            { backgroundColor: accent, opacity: pressed ? 0.7 : 1 },
          ]}
        >
          {loading ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.playIcon}>{isPlaying ? "⏸" : "▶"}</Text>
          )}
        </Pressable>

        <Pressable
          onPress={confirmDelete}
          style={({ pressed }) => [styles.delBtn, { opacity: pressed ? 0.5 : 1 }]}
        >
          <Text style={[styles.delIcon, { color: colors.error }]}>🗑</Text>
        </Pressable>
      </View>
    </View>
  );
}

// ─── Main section component ─────────────────────────────────────────────────
export function PanelRecordingsSection({ colors }: { colors: ThemeColorPalette }) {
  const { data: recordings, isLoading, refetch } = trpc.devices.getRecordings.useQuery({}, {
    staleTime: 30_000,
  });

  const deleteMutation = trpc.devices.deleteRecording.useMutation({
    onSuccess: () => refetch(),
    onError: (err) => Alert.alert("Error", err.message),
  });

  const handleDelete = useCallback((id: number) => {
    deleteMutation.mutate({ id });
  }, [deleteMutation]);

  if (isLoading) {
    return (
      <View style={styles.emptyBox}>
        <ActivityIndicator size="small" color={colors.muted} />
      </View>
    );
  }

  if (!recordings || recordings.length === 0) {
    return null; // Hide section entirely when no recordings
  }

  return (
    <View style={styles.section}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>
          Panel Recordings
        </Text>
        <Text style={[styles.headerCount, { color: colors.muted }]}>
          {recordings.length} {recordings.length === 1 ? "recording" : "recordings"}
        </Text>
      </View>

      {/* List */}
      {recordings.map((rec) => (
        <RecordingRow
          key={rec.id}
          rec={rec as Recording}
          colors={colors}
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
    paddingHorizontal: 0,
  },
  header: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    marginBottom: 10,
    paddingHorizontal: 2,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  headerCount: {
    fontSize: 12,
  },
  row: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    marginBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  badge: {
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 3,
    alignSelf: "flex-start",
  },
  badgeText: {
    fontSize: 10,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  meta: {
    flex: 1,
    gap: 2,
  },
  filename: {
    fontSize: 13,
    fontWeight: "600",
  },
  sub: {
    fontSize: 11,
  },
  transcript: {
    fontSize: 11,
    fontStyle: "italic",
    marginTop: 2,
  },
  controls: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
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
