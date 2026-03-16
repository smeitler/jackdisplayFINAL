import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  View, Text, ScrollView, Pressable, StyleSheet, FlatList, Alert, Platform,
  TextInput, KeyboardAvoidingView, Animated, ActivityIndicator,
} from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import { useApp } from "@/lib/app-context";
import * as Haptics from "expo-haptics";
import {
  useAudioRecorder, useAudioRecorderState, useAudioPlayer, useAudioPlayerStatus,
  RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync,
} from "expo-audio";
import {
  loadJournalEntries, saveJournalEntries, addJournalEntry, deleteJournalEntry,
  JournalEntry, JournalHabitMapping, formatDisplayDate, toDateString,
} from "@/lib/storage";

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmtDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function groupByDate(entries: JournalEntry[]): { date: string; entries: JournalEntry[] }[] {
  const map = new Map<string, JournalEntry[]>();
  for (const e of entries) {
    const list = map.get(e.date) ?? [];
    list.push(e);
    map.set(e.date, list);
  }
  return Array.from(map.entries())
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([date, entries]) => ({ date, entries }));
}

// ─── Audio Playback Row ───────────────────────────────────────────────────────
function AudioPlaybackRow({ uri, duration }: { uri: string; duration?: number }) {
  const colors = useColors();
  const player = useAudioPlayer({ uri });
  const status = useAudioPlayerStatus(player);
  const isPlaying = status.playing;
  const pos = status.currentTime ?? 0;
  const dur = status.duration ?? duration ?? 0;
  const pct = dur > 0 ? pos / dur : 0;

  function togglePlay() {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (isPlaying) { player.pause(); } else { player.play(); }
  }

  return (
    <View style={[pbStyles.row, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Pressable onPress={togglePlay} style={[pbStyles.playBtn, { backgroundColor: colors.primary }]}>
        <IconSymbol name={isPlaying ? "pause.fill" : "play.fill"} size={14} color="#fff" />
      </Pressable>
      <View style={pbStyles.progressWrap}>
        <View style={[pbStyles.track, { backgroundColor: colors.border }]}>
          <View style={[pbStyles.fill, { width: `${pct * 100}%` as any, backgroundColor: colors.primary }]} />
        </View>
        <Text style={[pbStyles.time, { color: colors.muted }]}>
          {fmtDuration(pos)} / {fmtDuration(dur)}
        </Text>
      </View>
    </View>
  );
}

const pbStyles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 10, borderRadius: 10, padding: 10, borderWidth: 1, marginTop: 8 },
  playBtn: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  progressWrap: { flex: 1, gap: 4 },
  track: { height: 4, borderRadius: 2, overflow: "hidden" },
  fill: { height: "100%", borderRadius: 2 },
  time: { fontSize: 11 },
});

// ─── Habit Mapping Card ───────────────────────────────────────────────────────
function HabitMappingCard({
  mapping, onAccept, onEdit, onDismiss, colors,
}: {
  mapping: JournalHabitMapping;
  onAccept: () => void;
  onEdit: (note: string) => void;
  onDismiss: () => void;
  colors: ReturnType<typeof useColors>;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(mapping.suggestedNote);
  const isDismissed = mapping.accepted === false;
  const isAccepted = mapping.accepted === true;

  if (isDismissed) return null;

  return (
    <View style={[hmStyles.card, { borderColor: isAccepted ? colors.success : colors.border, backgroundColor: colors.surface }]}>
      <View style={hmStyles.header}>
        <Text style={[hmStyles.habitName, { color: colors.primary }]}>{mapping.habitName}</Text>
        {isAccepted && <IconSymbol name="checkmark.circle.fill" size={16} color={colors.success} />}
      </View>
      {mapping.excerpt ? (
        <Text style={[hmStyles.excerpt, { color: colors.muted }]}>"{mapping.excerpt}"</Text>
      ) : null}
      {editing ? (
        <TextInput
          style={[hmStyles.input, { color: colors.foreground, borderColor: colors.primary, backgroundColor: colors.background }]}
          value={text}
          onChangeText={setText}
          multiline
          autoFocus
          returnKeyType="done"
          onSubmitEditing={() => { onEdit(text); setEditing(false); }}
          onBlur={() => { onEdit(text); setEditing(false); }}
        />
      ) : (
        <Text style={[hmStyles.note, { color: colors.foreground }]}>{text}</Text>
      )}
      {!isAccepted && (
        <View style={hmStyles.actions}>
          <Pressable style={[hmStyles.btn, { backgroundColor: colors.success + "22", borderColor: colors.success }]} onPress={onAccept}>
            <Text style={[hmStyles.btnText, { color: colors.success }]}>✓ Accept</Text>
          </Pressable>
          <Pressable style={[hmStyles.btn, { backgroundColor: colors.surface, borderColor: colors.border }]} onPress={() => setEditing(true)}>
            <Text style={[hmStyles.btnText, { color: colors.muted }]}>Edit</Text>
          </Pressable>
          <Pressable style={[hmStyles.btn, { backgroundColor: colors.error + "11", borderColor: colors.error + "44" }]} onPress={onDismiss}>
            <Text style={[hmStyles.btnText, { color: colors.error }]}>✕</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const hmStyles = StyleSheet.create({
  card: { borderRadius: 10, borderWidth: 1, padding: 12, gap: 6, marginBottom: 6 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  habitName: { fontSize: 13, fontWeight: "700" },
  excerpt: { fontSize: 12, fontStyle: "italic", lineHeight: 16 },
  note: { fontSize: 14, lineHeight: 20 },
  input: { fontSize: 14, lineHeight: 20, borderWidth: 1.5, borderRadius: 8, padding: 8, minHeight: 60 },
  actions: { flexDirection: "row", gap: 6, marginTop: 4 },
  btn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1 },
  btnText: { fontSize: 13, fontWeight: "600" },
});

// ─── Day Group Row ────────────────────────────────────────────────────────────
function DayGroupRow({
  date, entries, onDelete, onUpdateMappings, colors,
}: {
  date: string;
  entries: JournalEntry[];
  onDelete: (id: string) => void;
  onUpdateMappings: (entryId: string, mappings: JournalHabitMapping[]) => void;
  colors: ReturnType<typeof useColors>;
}) {
  const [expanded, setExpanded] = useState(date === toDateString());
  const totalWords = entries.reduce((acc, e) => acc + (e.text?.split(" ").filter(Boolean).length ?? 0), 0);
  const hasAudio = entries.some((e) => e.audioUri);
  const hasMappings = entries.some((e) => e.habitMappings && e.habitMappings.some((m) => m.accepted === undefined));

  return (
    <View style={[dgStyles.group, { borderColor: colors.border }]}>
      {/* Day header — tap to expand */}
      <Pressable
        style={[dgStyles.dayHeader, { backgroundColor: colors.surface }]}
        onPress={() => {
          if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          setExpanded((v) => !v);
        }}
      >
        <View style={dgStyles.dayLeft}>
          <Text style={[dgStyles.dayLabel, { color: colors.foreground }]}>{formatDisplayDate(date)}</Text>
          <Text style={[dgStyles.daySub, { color: colors.muted }]}>
            {entries.length} {entries.length === 1 ? "entry" : "entries"}
            {totalWords > 0 ? ` · ${totalWords} words` : ""}
            {hasAudio ? " · 🎙️" : ""}
          </Text>
        </View>
        <View style={dgStyles.dayRight}>
          {hasMappings && (
            <View style={[dgStyles.pendingBadge, { backgroundColor: colors.primary + "22" }]}>
              <Text style={[dgStyles.pendingText, { color: colors.primary }]}>AI suggestions</Text>
            </View>
          )}
          <IconSymbol name={expanded ? "chevron.up" : "chevron.down"} size={16} color={colors.muted} />
        </View>
      </Pressable>

      {/* Expanded entries */}
      {expanded && (
        <View style={dgStyles.entriesWrap}>
          {entries.map((entry, idx) => (
            <View key={entry.id} style={[dgStyles.entryCard, { borderColor: colors.border, borderTopWidth: idx === 0 ? 1 : 0 }]}>
              {/* Entry header */}
              <View style={dgStyles.entryHeader}>
                <Text style={[dgStyles.entryTime, { color: colors.muted }]}>
                  {new Date(entry.createdAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                </Text>
                <Pressable
                  onPress={() => Alert.alert("Delete Entry", "Delete this journal entry?", [
                    { text: "Cancel", style: "cancel" },
                    { text: "Delete", style: "destructive", onPress: () => onDelete(entry.id) },
                  ])}
                  style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1, padding: 4 })}
                >
                  <IconSymbol name="trash.fill" size={14} color={colors.muted} />
                </Pressable>
              </View>

              {/* Transcript text */}
              {entry.text ? (
                <Text style={[dgStyles.entryText, { color: colors.foreground }]}>{entry.text}</Text>
              ) : null}

              {/* Audio playback */}
              {entry.audioUri ? (
                <AudioPlaybackRow uri={entry.audioUri} duration={entry.duration} />
              ) : null}

              {/* AI habit mappings */}
              {entry.habitMappings && entry.habitMappings.length > 0 && (
                <View style={dgStyles.mappingsSection}>
                  <Text style={[dgStyles.mappingsLabel, { color: colors.muted }]}>AI HABIT SUGGESTIONS</Text>
                  {entry.habitMappings.map((m, i) => (
                    <HabitMappingCard
                      key={`${entry.id}-${i}`}
                      mapping={m}
                      colors={colors}
                      onAccept={() => {
                        const updated = entry.habitMappings!.map((x, j) => j === i ? { ...x, accepted: true } : x);
                        onUpdateMappings(entry.id, updated);
                      }}
                      onEdit={(note) => {
                        const updated = entry.habitMappings!.map((x, j) => j === i ? { ...x, suggestedNote: note } : x);
                        onUpdateMappings(entry.id, updated);
                      }}
                      onDismiss={() => {
                        const updated = entry.habitMappings!.map((x, j) => j === i ? { ...x, accepted: false } : x);
                        onUpdateMappings(entry.id, updated);
                      }}
                    />
                  ))}
                </View>
              )}
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const dgStyles = StyleSheet.create({
  group: { borderRadius: 14, borderWidth: 1, marginBottom: 12, overflow: "hidden" },
  dayHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 14, gap: 8 },
  dayLeft: { flex: 1 },
  dayLabel: { fontSize: 16, fontWeight: "700" },
  daySub: { fontSize: 12, marginTop: 2 },
  dayRight: { flexDirection: "row", alignItems: "center", gap: 8 },
  pendingBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  pendingText: { fontSize: 11, fontWeight: "600" },
  entriesWrap: {},
  entryCard: { padding: 14, borderTopWidth: 1, gap: 8 },
  entryHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  entryTime: { fontSize: 12, fontWeight: "500" },
  entryText: { fontSize: 15, lineHeight: 22 },
  mappingsSection: { marginTop: 4, gap: 2 },
  mappingsLabel: { fontSize: 10, fontWeight: "700", letterSpacing: 0.8, marginBottom: 4 },
});

// ─── Mic Button ───────────────────────────────────────────────────────────────
function MicButton({ onRecordingComplete, colors }: {
  onRecordingComplete: (uri: string, duration: number) => void;
  colors: ReturnType<typeof useColors>;
}) {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder);
  const [permGranted, setPermGranted] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const startTime = useRef<number>(0);

  useEffect(() => {
    (async () => {
      const status = await requestRecordingPermissionsAsync();
      setPermGranted(status.granted);
      if (status.granted) {
        await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true });
      }
    })();
  }, []);

  const startRecording = useCallback(async () => {
    if (!permGranted) {
      const status = await requestRecordingPermissionsAsync();
      if (!status.granted) { Alert.alert("Microphone permission required", "Please allow microphone access in Settings."); return; }
      setPermGranted(true);
    }
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    startTime.current = Date.now();
    Animated.spring(scaleAnim, { toValue: 1.2, useNativeDriver: true, speed: 20 }).start();
    try {
      await recorder.prepareToRecordAsync();
      recorder.record();
    } catch (e) {
      console.warn("Recording start error:", e);
    }
  }, [permGranted, recorder, scaleAnim]);

  const stopRecording = useCallback(async () => {
    if (!recorderState.isRecording) return;
    Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, speed: 20 }).start();
    setIsProcessing(true);
    try {
      await recorder.stop();
      const uri = recorder.uri;
      const duration = Math.round((Date.now() - startTime.current) / 1000);
      if (uri && duration >= 1) {
        if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        onRecordingComplete(uri, duration);
      }
    } catch (e) {
      console.warn("Recording stop error:", e);
    } finally {
      setIsProcessing(false);
    }
  }, [recorderState.isRecording, recorder, scaleAnim, onRecordingComplete]);

  const isRecording = recorderState.isRecording;
  const elapsed = isRecording ? Math.round((Date.now() - startTime.current) / 1000) : 0;

  return (
    <View style={micStyles.wrap}>
      {isRecording && (
        <View style={micStyles.recordingIndicator}>
          <View style={[micStyles.redDot, { backgroundColor: "#EF4444" }]} />
          <Text style={[micStyles.recordingText, { color: "#EF4444" }]}>Recording…</Text>
        </View>
      )}
      {isProcessing && (
        <View style={micStyles.recordingIndicator}>
          <ActivityIndicator size="small" color={colors.primary} />
          <Text style={[micStyles.recordingText, { color: colors.muted }]}>Saving…</Text>
        </View>
      )}
      <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
        <Pressable
          onPressIn={startRecording}
          onPressOut={stopRecording}
          style={[
            micStyles.micBtn,
            { backgroundColor: isRecording ? "#EF4444" : colors.primary },
          ]}
        >
          <IconSymbol name="mic.fill" size={28} color="#fff" />
        </Pressable>
      </Animated.View>
      <Text style={[micStyles.hint, { color: colors.muted }]}>
        {isRecording ? "Release to stop" : "Hold to record"}
      </Text>
    </View>
  );
}

const micStyles = StyleSheet.create({
  wrap: { alignItems: "center", paddingVertical: 20, gap: 8 },
  micBtn: { width: 72, height: 72, borderRadius: 36, alignItems: "center", justifyContent: "center", shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 6 },
  recordingIndicator: { flexDirection: "row", alignItems: "center", gap: 6 },
  redDot: { width: 8, height: 8, borderRadius: 4 },
  recordingText: { fontSize: 13, fontWeight: "600" },
  hint: { fontSize: 12, marginTop: 2 },
});

// ─── Main Journal Screen ──────────────────────────────────────────────────────
export default function JournalScreen() {
  const colors = useColors();
  const { habits } = useApp();
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [textInput, setTextInput] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  useEffect(() => {
    loadJournalEntries().then(setEntries);
  }, []);

  const grouped = groupByDate(entries);

  // Save a new entry (text or audio)
  async function saveEntry(partial: Partial<JournalEntry> & { text: string }) {
    setIsSaving(true);
    const entry: JournalEntry = {
      id: Date.now().toString(),
      date: toDateString(),
      text: partial.text,
      audioUri: partial.audioUri,
      duration: partial.duration,
      createdAt: new Date().toISOString(),
    };
    await addJournalEntry(entry);
    setEntries((prev) => [entry, ...prev]);
    setIsSaving(false);
    return entry;
  }

  // Handle text save
  async function handleSaveText() {
    const t = textInput.trim();
    if (!t) return;
    await saveEntry({ text: t });
    setTextInput("");
    if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }

  // Handle voice recording complete
  async function handleRecordingComplete(uri: string, duration: number) {
    // Save immediately with empty text (transcription is a future server feature)
    const entry = await saveEntry({ text: "", audioUri: uri, duration });
    // Note: Full Whisper transcription will be added in the server integration phase
    // For now, show a placeholder that transcription is pending
    const updated = { ...entry, text: "[Voice recording saved — transcription coming soon]" };
    const all = await loadJournalEntries();
    const newAll = all.map((e) => e.id === entry.id ? updated : e);
    await saveJournalEntries(newAll);
    setEntries(newAll);
  }

  // Delete an entry
  async function handleDelete(id: string) {
    await deleteJournalEntry(id);
    setEntries((prev) => prev.filter((e) => e.id !== id));
  }

  // Update habit mappings for an entry
  async function handleUpdateMappings(entryId: string, mappings: JournalHabitMapping[]) {
    const all = await loadJournalEntries();
    const updated = all.map((e) => e.id === entryId ? { ...e, habitMappings: mappings } : e);
    await saveJournalEntries(updated);
    setEntries(updated);
  }

  return (
    <ScreenContainer>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>Journal</Text>
        </View>

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* ── Record section ── */}
          <View style={[styles.recordCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.sectionLabel, { color: colors.muted }]}>VOICE ENTRY</Text>
            <MicButton onRecordingComplete={handleRecordingComplete} colors={colors} />
          </View>

          {/* ── Text entry ── */}
          <View style={[styles.textCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.sectionLabel, { color: colors.muted }]}>TEXT ENTRY</Text>
            <TextInput
              value={textInput}
              onChangeText={setTextInput}
              placeholder="Write your thoughts for today…"
              placeholderTextColor={colors.muted}
              multiline
              style={[styles.textInput, { color: colors.foreground, borderColor: colors.border }]}
              returnKeyType="default"
            />
            <Pressable
              style={[styles.saveBtn, { backgroundColor: colors.primary, opacity: (!textInput.trim() || isSaving) ? 0.5 : 1 }]}
              onPress={handleSaveText}
              disabled={!textInput.trim() || isSaving}
            >
              <Text style={styles.saveBtnText}>{isSaving ? "Saving…" : "Save Entry"}</Text>
            </Pressable>
          </View>

          {/* ── Past entries ── */}
          <Text style={[styles.pastLabel, { color: colors.muted }]}>PAST ENTRIES</Text>

          {grouped.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyEmoji}>📔</Text>
              <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No entries yet</Text>
              <Text style={[styles.emptyDesc, { color: colors.muted }]}>Hold the mic button to record your first voice entry, or type below.</Text>
            </View>
          ) : (
            grouped.map((group) => (
              <DayGroupRow
                key={group.date}
                date={group.date}
                entries={group.entries}
                onDelete={handleDelete}
                onUpdateMappings={handleUpdateMappings}
                colors={colors}
              />
            ))
          )}

          <View style={{ height: 40 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8 },
  headerTitle: { fontSize: 28, fontWeight: "700" },
  scroll: { padding: 16, paddingTop: 8 },
  recordCard: { borderRadius: 16, borderWidth: 1, padding: 16, marginBottom: 12 },
  textCard: { borderRadius: 16, borderWidth: 1, padding: 16, marginBottom: 16 },
  sectionLabel: { fontSize: 10, fontWeight: "700", letterSpacing: 0.8, marginBottom: 8 },
  textInput: { borderWidth: 1, borderRadius: 10, padding: 12, fontSize: 15, lineHeight: 22, minHeight: 100, textAlignVertical: "top", marginBottom: 10 },
  saveBtn: { borderRadius: 12, paddingVertical: 12, alignItems: "center" },
  saveBtnText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  pastLabel: { fontSize: 10, fontWeight: "700", letterSpacing: 0.8, marginBottom: 10, marginTop: 4 },
  emptyState: { alignItems: "center", paddingVertical: 40, gap: 10 },
  emptyEmoji: { fontSize: 48 },
  emptyTitle: { fontSize: 18, fontWeight: "700" },
  emptyDesc: { fontSize: 14, textAlign: "center", lineHeight: 20, color: "#9BA1A6" },
});
