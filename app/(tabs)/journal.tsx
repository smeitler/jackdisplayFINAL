import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  View, Text, ScrollView, Pressable, StyleSheet, Alert, Platform,
  TextInput, KeyboardAvoidingView, Animated, ActivityIndicator,
  Modal, FlatList, Dimensions, Image,
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
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import * as Location from "expo-location";
import * as FileSystem from "expo-file-system/legacy";
import { trpc } from "@/lib/trpc";
import {
  JournalEntry, JournalAttachment, JournalLocation, JournalTemplate,
  JOURNAL_TEMPLATES, generateId, todayDateStr, formatDateLabel, formatTime,
  loadEntries, addEntry, updateEntry as updateEntryInStore, deleteEntry as deleteEntryFromStore,
} from "@/lib/journal-store";
import { getLastUserId, loadHabits, type Habit } from "@/lib/storage";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

// ─── Sub-tab type ────────────────────────────────────────────────────────────
type SubTab = "journal" | "calendar" | "media" | "map";

// ─── Web MediaRecorder Hook ──────────────────────────────────────────────────
function useWebRecorder() {
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const isRecordingRef = useRef(false);
  const [isRecording, setIsRecording] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);

  const start = useCallback(async (): Promise<boolean> => {
    setMicError(null);
    chunksRef.current = [];
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      let mimeType = "";
      if (typeof MediaRecorder.isTypeSupported === "function") {
        if (MediaRecorder.isTypeSupported("audio/webm;codecs=opus")) mimeType = "audio/webm;codecs=opus";
        else if (MediaRecorder.isTypeSupported("audio/webm")) mimeType = "audio/webm";
        else if (MediaRecorder.isTypeSupported("audio/mp4")) mimeType = "audio/mp4";
      }
      const mr = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      mr.ondataavailable = (e) => { if (e.data && e.data.size > 0) chunksRef.current.push(e.data); };
      mr.start(100);
      mediaRecorderRef.current = mr;
      isRecordingRef.current = true;
      setIsRecording(true);
      return true;
    } catch (e: any) {
      const name = e?.name ?? "";
      if (name === "NotFoundError" || name === "DevicesNotFoundError") {
        setMicError("No microphone found. Open this link on your phone to record.");
      } else if (name === "NotAllowedError" || name === "PermissionDeniedError") {
        setMicError("Microphone access denied. Allow mic in browser settings.");
      } else {
        setMicError("Microphone unavailable: " + (e?.message ?? name));
      }
      return false;
    }
  }, []);

  const stop = useCallback((): Promise<Blob | null> => {
    return new Promise((resolve) => {
      const mr = mediaRecorderRef.current;
      if (!mr || mr.state === "inactive") {
        isRecordingRef.current = false;
        setIsRecording(false);
        resolve(null);
        return;
      }
      const recordedMime = mr.mimeType || "audio/webm";
      mr.addEventListener("stop", () => {
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        const blob = new Blob(chunksRef.current, { type: recordedMime });
        isRecordingRef.current = false;
        setIsRecording(false);
        resolve(blob.size === 0 ? null : blob);
      }, { once: true });
      mr.stop();
    });
  }, []);

  return { start, stop, isRecording, isRecordingRef, micError };
}

// ─── Web Audio Helpers ───────────────────────────────────────────────────────
function blobToDataUri(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function parseDataUri(dataUri: string): { base64: string; mimeType: string } {
  const match = dataUri.match(/^data:([^;]+);base64,(.+)$/);
  if (match) return { mimeType: match[1], base64: match[2] };
  return { mimeType: "audio/webm", base64: dataUri.split(",")[1] || "" };
}

async function readUriAsBase64Web(uri: string): Promise<{ base64: string; mimeType: string }> {
  if (uri.startsWith("data:")) return parseDataUri(uri);
  const response = await fetch(uri);
  const blob = await response.blob();
  const dataUri = await blobToDataUri(blob);
  return parseDataUri(dataUri);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function fmtDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function getMonthDays(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

function getFirstDayOfWeek(year: number, month: number): number {
  return new Date(year, month - 1, 1).getDay(); // 0=Sun
}

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DAY_HEADERS = ["S", "M", "T", "W", "T", "F", "S"];

// ─── Audio Playback ──────────────────────────────────────────────────────────
function AudioPlaybackRow({ uri, duration }: { uri: string; duration?: number }) {
  const colors = useColors();
  if (Platform.OS === "web") return <WebAudioPlayer uri={uri} duration={duration} colors={colors} />;
  return <NativeAudioPlayer uri={uri} duration={duration} colors={colors} />;
}

function WebAudioPlayer({ uri, duration, colors }: { uri: string; duration?: number; colors: any }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [pos, setPos] = useState(0);
  const [dur, setDur] = useState(duration ?? 0);

  useEffect(() => {
    const audio = new (window as any).Audio(uri) as HTMLAudioElement;
    audioRef.current = audio;
    audio.addEventListener("timeupdate", () => setPos(audio.currentTime));
    audio.addEventListener("durationchange", () => { if (isFinite(audio.duration)) setDur(audio.duration); });
    audio.addEventListener("ended", () => { setIsPlaying(false); audio.currentTime = 0; setPos(0); });
    audio.addEventListener("pause", () => setIsPlaying(false));
    audio.addEventListener("play", () => setIsPlaying(true));
    return () => { audio.pause(); audio.src = ""; };
  }, [uri]);

  function togglePlay() {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) audio.pause(); else audio.play().catch(() => {});
  }

  const pct = dur > 0 ? pos / dur : 0;
  return (
    <View style={[pbStyles.row, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Pressable onPress={togglePlay} style={[pbStyles.playBtn, { backgroundColor: colors.primary }]}>
        <IconSymbol name={isPlaying ? "pause.fill" : "play.fill"} size={14} color="#fff" />
      </Pressable>
      <View style={pbStyles.progressWrap}>
        <View style={[pbStyles.track, { backgroundColor: colors.border }]}>
          <View style={[pbStyles.fill, { width: `${pct * 100}%` as any, backgroundColor: colors.primary }]} />
        </View>
        <Text style={[pbStyles.time, { color: colors.muted }]}>{fmtDuration(pos)} / {fmtDuration(dur)}</Text>
      </View>
    </View>
  );
}

function NativeAudioPlayer({ uri, duration, colors }: { uri: string; duration?: number; colors: any }) {
  const player = useAudioPlayer({ uri });
  const status = useAudioPlayerStatus(player);
  const isPlaying = status.playing;
  const pos = status.currentTime ?? 0;
  const dur = status.duration ?? duration ?? 0;
  const pct = dur > 0 ? pos / dur : 0;

  function togglePlay() {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (isPlaying) player.pause(); else player.play();
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
        <Text style={[pbStyles.time, { color: colors.muted }]}>{fmtDuration(pos)} / {fmtDuration(dur)}</Text>
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

// ─── MicButton ───────────────────────────────────────────────────────────────
function MicButton({ onRecordingComplete, colors }: {
  onRecordingComplete: (uri: string, duration: number, mimeType: string) => void;
  colors: any;
}) {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder, 100);
  const webRecorder = useWebRecorder();
  const [permGranted, setPermGranted] = useState(Platform.OS === "web");
  const [isProcessing, setIsProcessing] = useState(false);
  const [elapsedSecs, setElapsedSecs] = useState(0);
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const startTime = useRef<number>(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pulseLoopRef = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    if (Platform.OS === "web") return;
    (async () => {
      const status = await requestRecordingPermissionsAsync();
      setPermGranted(status.granted);
      if (status.granted) await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true });
    })();
  }, []);

  function runStartAnimations() {
    startTime.current = Date.now();
    setElapsedSecs(0);
    timerRef.current = setInterval(() => setElapsedSecs(Math.round((Date.now() - startTime.current) / 1000)), 500);
    pulseLoopRef.current = Animated.loop(Animated.sequence([
      Animated.timing(pulseAnim, { toValue: 1.6, duration: 700, useNativeDriver: true }),
      Animated.timing(pulseAnim, { toValue: 1, duration: 700, useNativeDriver: true }),
    ]));
    pulseLoopRef.current.start();
    Animated.spring(scaleAnim, { toValue: 1.15, useNativeDriver: true, speed: 20 }).start();
  }

  function runStopAnimations() {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    pulseLoopRef.current?.stop();
    Animated.spring(pulseAnim, { toValue: 1, useNativeDriver: true, speed: 30 }).start();
    Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, speed: 20 }).start();
  }

  const startRecording = useCallback(async () => {
    if (Platform.OS === "web") {
      const ok = await webRecorder.start();
      if (ok) runStartAnimations();
      return;
    }
    if (!permGranted) {
      const status = await requestRecordingPermissionsAsync();
      if (!status.granted) { Alert.alert("Microphone permission required"); return; }
      setPermGranted(true);
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    runStartAnimations();
    try { await recorder.prepareToRecordAsync(); recorder.record(); }
    catch (e) { console.warn("Recording start error:", e); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [permGranted, recorder, webRecorder]);

  const stopRecording = useCallback(async () => {
    runStopAnimations();
    const duration = Math.max(1, Math.round((Date.now() - startTime.current) / 1000));
    setIsProcessing(true);
    try {
      if (Platform.OS === "web") {
        const blob = await webRecorder.stop();
        if (blob && blob.size > 0) {
          const dataUri = await blobToDataUri(blob);
          onRecordingComplete(dataUri, duration, blob.type || "audio/webm");
        }
      } else {
        if (!recorderState.isRecording) return;
        await recorder.stop();
        const uri = recorder.uri;
        if (uri && duration >= 1) {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          onRecordingComplete(uri, duration, "audio/m4a");
        }
      }
    } catch (e) { console.warn("Recording stop error:", e); }
    finally { setIsProcessing(false); setElapsedSecs(0); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recorderState.isRecording, recorder, webRecorder, onRecordingComplete]);

  const startRef = useRef(startRecording);
  startRef.current = startRecording;
  const stopRef = useRef(stopRecording);
  stopRef.current = stopRecording;

  const isRecording = Platform.OS === "web" ? webRecorder.isRecording : recorderState.isRecording;

  const webTouchProps = Platform.OS === "web" ? {
    onTouchStart: (e: any) => { e.preventDefault(); startRef.current(); },
    onTouchEnd: (e: any) => { e.preventDefault(); stopRef.current(); },
    onTouchCancel: (e: any) => { e.preventDefault(); stopRef.current(); },
    onMouseDown: (e: any) => { e.preventDefault(); startRef.current(); },
    onMouseUp: (e: any) => { e.preventDefault(); stopRef.current(); },
    onMouseLeave: (e: any) => { if (webRecorder.isRecordingRef.current) stopRef.current(); },
  } : {};

  return (
    <View style={{ alignItems: "center", gap: 4 }}>
      {isRecording && (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 2 }}>
          <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: "#EF4444" }} />
          <Text style={{ fontSize: 14, fontWeight: "700", color: "#EF4444", fontVariant: ["tabular-nums"] as any }}>
            {fmtDuration(elapsedSecs)}
          </Text>
        </View>
      )}
      <View style={{ position: "relative", alignItems: "center", justifyContent: "center", width: 64, height: 64 }}>
        {isRecording && (
          <Animated.View
            style={[{
              position: "absolute", width: 48, height: 48, borderRadius: 24, backgroundColor: "#EF4444",
              transform: [{ scale: pulseAnim }],
              opacity: pulseAnim.interpolate({ inputRange: [1, 1.6], outputRange: [0.5, 0] }),
            }]}
          />
        )}
        <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
          {Platform.OS === "web" ? (
            <View
              {...webTouchProps}
              style={[{
                width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center",
                backgroundColor: isRecording ? "#EF4444" : colors.primary, cursor: "pointer",
              } as any]}
            >
              <IconSymbol name="mic.fill" size={22} color="#fff" />
            </View>
          ) : (
            <Pressable
              onPressIn={startRecording}
              onPressOut={stopRecording}
              style={[{
                width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center",
                backgroundColor: isRecording ? "#EF4444" : colors.primary,
              }]}
            >
              <IconSymbol name="mic.fill" size={22} color="#fff" />
            </Pressable>
          )}
        </Animated.View>
      </View>
      {!isRecording && !isProcessing && webRecorder.micError ? (
        <Text style={{ color: colors.error ?? "#EF4444", fontSize: 10, textAlign: "center", maxWidth: 200 }}>{webRecorder.micError}</Text>
      ) : !isRecording && !isProcessing ? (
        <Text style={{ fontSize: 10, color: colors.muted }}>Hold to record</Text>
      ) : isProcessing ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
          <ActivityIndicator size="small" color={colors.primary} />
          <Text style={{ fontSize: 10, color: colors.muted }}>Saving…</Text>
        </View>
      ) : null}
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ─── ENTRY EDITOR (Full-screen modal) ────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════
function EntryEditor({
  visible, entry, initialDate, onSave, onClose, colors, userId,
}: {
  visible: boolean;
  entry: JournalEntry | null; // null = new entry
  initialDate: string;
  onSave: (entry: JournalEntry) => void;
  onClose: () => void;
  colors: any;
  userId: string;
}) {
  const [date, setDate] = useState(initialDate);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [template, setTemplate] = useState<JournalTemplate>("blank");
  const [attachments, setAttachments] = useState<JournalAttachment[]>([]);
  const [location, setLocation] = useState<JournalLocation | undefined>();
  const [mood, setMood] = useState<string>("");
  const [showTemplates, setShowTemplates] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [transcribingIds, setTranscribingIds] = useState<Set<string>>(new Set());
  const [habits, setHabits] = useState<Habit[]>([]);
  const transcribeMutation = trpc.voiceJournal.transcribeAndCategorize.useMutation();

  // Load habits for template
  useEffect(() => {
    loadHabits().then((h) => setHabits(h.filter((x) => x.isActive)));
  }, []);

  // Reset form when opening
  useEffect(() => {
    if (visible) {
      if (entry) {
        setDate(entry.date);
        setTitle(entry.title);
        setBody(entry.body);
        setTemplate(entry.template);
        setAttachments(entry.attachments);
        setLocation(entry.location);
        setMood(entry.mood || "");
      } else {
        setDate(initialDate);
        setTitle("");
        setBody("");
        setTemplate("blank");
        setAttachments([]);
        setLocation(undefined);
        setMood("");
      }
    }
  }, [visible, entry, initialDate]);

  function applyTemplate(t: JournalTemplate) {
    setTemplate(t);
    if (t === "habit-checkin" as any) {
      // Build a habit-based template body
      const lines: string[] = ["Daily Habit Notes", ""];
      for (const h of habits) {
        lines.push(`${h.emoji} ${h.name}`);
        lines.push("Notes: ");
        lines.push("");
      }
      if (!body.trim()) setBody(lines.join("\n"));
    } else {
      const tmpl = JOURNAL_TEMPLATES.find((x) => x.key === t);
      if (tmpl && tmpl.prompt && !body.trim()) setBody(tmpl.prompt);
    }
    setShowTemplates(false);
  }

  async function handleAddLocation() {
    try {
      if (Platform.OS === "web") {
        if (!navigator.geolocation) { alert("Geolocation not supported"); return; }
        navigator.geolocation.getCurrentPosition(
          async (pos) => {
            const loc: JournalLocation = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
            try {
              const resp = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${loc.latitude}&lon=${loc.longitude}&format=json`);
              const data = await resp.json();
              if (data.display_name) loc.address = data.display_name;
            } catch {}
            setLocation(loc);
          },
          (err) => { alert("Could not get location: " + err.message); },
          { enableHighAccuracy: true }
        );
        return;
      }
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") { Alert.alert("Location permission required"); return; }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const locData: JournalLocation = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
      try {
        const [addr] = await Location.reverseGeocodeAsync(loc.coords);
        if (addr) {
          locData.address = [addr.name, addr.street, addr.city, addr.region].filter(Boolean).join(", ");
        }
      } catch {}
      setLocation(locData);
    } catch (e: any) { console.warn("Location error:", e); }
  }

  async function handlePickPhoto() {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images", "videos"],
        allowsMultipleSelection: true,
        quality: 0.8,
      });
      if (result.canceled) return;
      for (const asset of result.assets) {
        const att: JournalAttachment = {
          id: generateId(),
          type: asset.type === "video" ? "video" : "photo",
          uri: asset.uri,
          mimeType: asset.mimeType || (asset.type === "video" ? "video/mp4" : "image/jpeg"),
          durationMs: asset.duration ? asset.duration * 1000 : undefined,
        };
        setAttachments((prev) => [...prev, att]);
      }
    } catch (e) { console.warn("Image picker error:", e); }
  }

  async function handlePickDocument() {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: "application/pdf", multiple: true });
      if (result.canceled) return;
      for (const asset of result.assets) {
        const att: JournalAttachment = {
          id: generateId(),
          type: "pdf",
          uri: asset.uri,
          mimeType: asset.mimeType || "application/pdf",
          name: asset.name,
        };
        setAttachments((prev) => [...prev, att]);
      }
    } catch (e) { console.warn("Document picker error:", e); }
  }

  function handleRecordingComplete(uri: string, duration: number, mimeType: string) {
    const att: JournalAttachment = {
      id: generateId(),
      type: "audio",
      uri,
      mimeType,
      durationMs: duration * 1000,
    };
    setAttachments((prev) => [...prev, att]);
    transcribeAudio(att, uri, mimeType);
  }

  async function transcribeAudio(att: JournalAttachment, uri: string, mimeType: string) {
    setTranscribingIds((prev) => new Set(prev).add(att.id));
    try {
      let audioBase64 = "";
      if (Platform.OS === "web") {
        const result = await readUriAsBase64Web(uri);
        audioBase64 = result.base64;
        mimeType = result.mimeType;
      } else {
        audioBase64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
      }
      if (!audioBase64) return;
      const result = await transcribeMutation.mutateAsync({ audioBase64, mimeType, date });
      const transcript = result.transcript?.trim() || "";
      if (transcript) {
        setBody((prev) => prev ? prev + "\n\n" + transcript : transcript);
      }
    } catch (e) { console.warn("Transcription error:", e); }
    finally {
      setTranscribingIds((prev) => { const n = new Set(prev); n.delete(att.id); return n; });
    }
  }

  function removeAttachment(id: string) {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  }

  async function handleSave() {
    if (!body.trim() && attachments.length === 0) return;
    setIsSaving(true);
    const now = new Date().toISOString();
    const saved: JournalEntry = {
      id: entry?.id || generateId(),
      userId,
      date,
      createdAt: entry?.createdAt || now,
      updatedAt: now,
      title: title.trim(),
      body: body.trim(),
      template,
      attachments,
      location,
      mood,
      tags: [],
    };
    onSave(saved);
    setIsSaving(false);
    onClose();
  }

  // All templates including the new habit-based one
  const allTemplates = useMemo(() => {
    const base = JOURNAL_TEMPLATES.map((t) => ({
      key: t.key,
      label: t.label,
      description: t.prompt ? t.prompt.split("\n")[0] : "Start from scratch",
    }));
    // Insert habit check-in template after "Blank"
    base.splice(1, 0, {
      key: "habit-checkin" as any,
      label: "Habit Notes",
      description: habits.length > 0
        ? `Notes for your ${habits.length} active habits`
        : "Add notes for each of your habits",
    });
    // Add more useful templates
    base.push({
      key: "morning-pages" as any,
      label: "Morning Pages",
      description: "Stream of consciousness writing",
    });
    base.push({
      key: "weekly-review" as any,
      label: "Weekly Review",
      description: "Review your week's progress",
    });
    return base;
  }, [habits]);

  function applyTemplateByKey(key: string) {
    if (key === "habit-checkin") {
      setTemplate("blank");
      const lines: string[] = [];
      for (const h of habits) {
        lines.push(`${h.emoji} ${h.name}`);
        lines.push("");
      }
      if (!body.trim()) setBody(lines.join("\n"));
    } else if (key === "morning-pages") {
      setTemplate("free-write");
      if (!body.trim()) setBody("Just write whatever comes to mind. Don't stop, don't edit, just let it flow...\n\n");
    } else if (key === "weekly-review") {
      setTemplate("goal-review");
      if (!body.trim()) setBody("This week's wins:\n\n\nThis week's challenges:\n\n\nLessons learned:\n\n\nFocus for next week:\n\n");
    } else {
      applyTemplate(key as JournalTemplate);
      return;
    }
    setShowTemplates(false);
  }

  if (!visible) return null;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen">
      <View style={[{ flex: 1, backgroundColor: colors.background }]}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          {/* Header */}
          <View style={[editorStyles.header, { borderBottomColor: colors.border }]}>
            <Pressable onPress={onClose} style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1 }]}>
              <Text style={{ fontSize: 16, color: colors.primary }}>Cancel</Text>
            </Pressable>
            <Pressable onPress={() => setShowDatePicker(!showDatePicker)}>
              <Text style={{ fontSize: 16, fontWeight: "600", color: colors.foreground }}>{formatDateLabel(date)}</Text>
            </Pressable>
            <Pressable
              onPress={handleSave}
              disabled={isSaving || (!body.trim() && attachments.length === 0)}
              style={({ pressed }) => [{
                opacity: (isSaving || (!body.trim() && attachments.length === 0)) ? 0.4 : pressed ? 0.7 : 1,
                backgroundColor: colors.primary, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20,
              }]}
            >
              <Text style={{ color: "#fff", fontWeight: "600", fontSize: 14 }}>{isSaving ? "Saving…" : "Save"}</Text>
            </Pressable>
          </View>

          {/* Date picker */}
          {showDatePicker && (
            <View style={[editorStyles.datePicker, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
              <TextInput
                value={date}
                onChangeText={(t) => { if (/^\d{4}-\d{2}-\d{2}$/.test(t)) setDate(t); }}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={colors.muted}
                style={{ fontSize: 16, color: colors.foreground, textAlign: "center", padding: 12 }}
                returnKeyType="done"
                onSubmitEditing={() => setShowDatePicker(false)}
              />
              <Text style={{ fontSize: 11, color: colors.muted, textAlign: "center", paddingBottom: 8 }}>
                Type a date in YYYY-MM-DD format
              </Text>
            </View>
          )}

          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 120 }} keyboardShouldPersistTaps="handled">
            {/* Template selector — compact pill */}
            <Pressable
              onPress={() => setShowTemplates(!showTemplates)}
              style={[editorStyles.templateToggle, { borderColor: colors.border, backgroundColor: colors.surface }]}
            >
              <IconSymbol name="doc.fill" size={14} color={colors.muted} />
              <Text style={{ fontSize: 13, color: colors.muted, flex: 1 }}>
                {allTemplates.find((t) => t.key === template)?.label || "Choose template"}
              </Text>
              <IconSymbol name={showTemplates ? "chevron.up" : "chevron.down"} size={14} color={colors.muted} />
            </Pressable>

            {showTemplates && (
              <View style={editorStyles.templateGrid}>
                {allTemplates.map((t) => (
                  <Pressable
                    key={t.key}
                    onPress={() => applyTemplateByKey(t.key)}
                    style={({ pressed }) => [{
                      paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, borderWidth: 1.5,
                      borderColor: template === t.key ? colors.primary : colors.border,
                      backgroundColor: pressed ? colors.primary + "10" : colors.surface,
                    }]}
                  >
                    <Text style={{ fontSize: 13, fontWeight: "600", color: colors.foreground }}>{t.label}</Text>
                    <Text style={{ fontSize: 10, color: colors.muted, marginTop: 2 }} numberOfLines={1}>{t.description}</Text>
                  </Pressable>
                ))}
              </View>
            )}

            {/* Title */}
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder="Title (optional)"
              placeholderTextColor={colors.muted}
              style={[editorStyles.titleInput, { color: colors.foreground, borderBottomColor: colors.border }]}
            />

            {/* Body */}
            <TextInput
              value={body}
              onChangeText={setBody}
              placeholder="Write your thoughts…"
              placeholderTextColor={colors.muted}
              multiline
              style={[editorStyles.bodyInput, { color: colors.foreground }]}
              textAlignVertical="top"
            />

            {/* Transcription indicator */}
            {transcribingIds.size > 0 && (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 8 }}>
                <ActivityIndicator size="small" color={colors.primary} />
                <Text style={{ fontSize: 12, color: colors.muted }}>Transcribing audio…</Text>
              </View>
            )}

            {/* Attachments */}
            {attachments.length > 0 && (
              <View style={{ gap: 8, marginTop: 12 }}>
                <Text style={{ fontSize: 11, fontWeight: "700", color: colors.muted, letterSpacing: 0.5 }}>ATTACHMENTS</Text>
                {attachments.map((att) => (
                  <View key={att.id} style={[editorStyles.attachRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <IconSymbol
                      name={att.type === "photo" ? "photo.fill" : att.type === "video" ? "video.fill" : att.type === "audio" ? "mic.fill" : "doc.fill"}
                      size={18} color={colors.primary}
                    />
                    <Text style={{ flex: 1, fontSize: 13, color: colors.foreground }} numberOfLines={1}>
                      {att.name || att.type.charAt(0).toUpperCase() + att.type.slice(1)}
                      {att.durationMs ? ` (${fmtDuration(att.durationMs / 1000)})` : ""}
                    </Text>
                    {att.type === "audio" && <AudioPlaybackRow uri={att.uri} duration={att.durationMs ? att.durationMs / 1000 : undefined} />}
                    <Pressable onPress={() => removeAttachment(att.id)} style={({ pressed }) => [{ opacity: pressed ? 0.5 : 1 }]}>
                      <IconSymbol name="xmark.circle.fill" size={20} color={colors.muted} />
                    </Pressable>
                  </View>
                ))}
              </View>
            )}

            {/* Location */}
            {location && (
              <View style={[editorStyles.locationRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <IconSymbol name="location.fill" size={16} color={colors.primary} />
                <Text style={{ flex: 1, fontSize: 12, color: colors.foreground }} numberOfLines={2}>
                  {location.address || `${location.latitude.toFixed(4)}, ${location.longitude.toFixed(4)}`}
                </Text>
                <Pressable onPress={() => setLocation(undefined)} style={({ pressed }) => [{ opacity: pressed ? 0.5 : 1 }]}>
                  <IconSymbol name="xmark" size={14} color={colors.muted} />
                </Pressable>
              </View>
            )}
          </ScrollView>

          {/* Bottom toolbar — mic CENTERED, actions on right */}
          <View style={[editorStyles.toolbar, { borderTopColor: colors.border, backgroundColor: colors.background }]}>
            <View style={{ flexDirection: "row", gap: 16, alignItems: "center" }}>
              <Pressable onPress={handlePickPhoto} style={({ pressed }) => [{ opacity: pressed ? 0.5 : 1 }]}>
                <IconSymbol name="photo.fill" size={22} color={colors.muted} />
              </Pressable>
              <Pressable onPress={handlePickDocument} style={({ pressed }) => [{ opacity: pressed ? 0.5 : 1 }]}>
                <IconSymbol name="paperclip" size={22} color={colors.muted} />
              </Pressable>
            </View>
            <MicButton onRecordingComplete={handleRecordingComplete} colors={colors} />
            <View style={{ flexDirection: "row", gap: 16, alignItems: "center" }}>
              {!location ? (
                <Pressable onPress={handleAddLocation} style={({ pressed }) => [{ opacity: pressed ? 0.5 : 1 }]}>
                  <IconSymbol name="location.fill" size={22} color={colors.muted} />
                </Pressable>
              ) : (
                <View style={{ width: 22 }} />
              )}
              <View style={{ width: 22 }} />
            </View>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const editorStyles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 0.5, paddingTop: 56 },
  datePicker: { borderBottomWidth: 0.5, paddingVertical: 4 },
  templateToggle: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 10, paddingHorizontal: 12, borderWidth: 1, borderRadius: 10, marginBottom: 12 },
  templateGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 16 },
  titleInput: { fontSize: 22, fontWeight: "700", paddingVertical: 12, borderBottomWidth: 0.5, marginBottom: 8 },
  bodyInput: { fontSize: 16, lineHeight: 24, minHeight: 200, paddingVertical: 8 },
  attachRow: { flexDirection: "row", alignItems: "center", gap: 10, padding: 10, borderRadius: 10, borderWidth: 1 },
  locationRow: { flexDirection: "row", alignItems: "center", gap: 8, padding: 10, borderRadius: 10, borderWidth: 1, marginTop: 12 },
  toolbar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingTop: 6, paddingBottom: 16, borderTopWidth: 0.5 },
});

// ═══════════════════════════════════════════════════════════════════════════════
// ─── JOURNAL LIST TAB ────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════
function JournalListTab({ entries, onDelete, onEdit, colors }: {
  entries: JournalEntry[];
  onDelete: (id: string) => void;
  onEdit: (entry: JournalEntry) => void;
  colors: any;
}) {
  const grouped = useMemo(() => {
    const map = new Map<string, JournalEntry[]>();
    for (const e of entries) {
      const list = map.get(e.date) ?? [];
      list.push(e);
      map.set(e.date, list);
    }
    return Array.from(map.entries())
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([date, items]) => ({ date, items }));
  }, [entries]);

  if (entries.length === 0) {
    return (
      <View style={{ alignItems: "center", paddingVertical: 60, gap: 12 }}>
        <IconSymbol name="book.fill" size={40} color={colors.muted} />
        <Text style={{ fontSize: 18, fontWeight: "700", color: colors.foreground }}>No entries yet</Text>
        <Text style={{ fontSize: 14, color: colors.muted, textAlign: "center", lineHeight: 20 }}>
          Tap the + button to create your first journal entry.
        </Text>
      </View>
    );
  }

  return (
    <View style={{ gap: 16 }}>
      {grouped.map(({ date, items }) => (
        <View key={date}>
          <Text style={{ fontSize: 13, fontWeight: "700", color: colors.muted, marginBottom: 8 }}>
            {formatDateLabel(date)}
          </Text>
          {items.map((entry) => {
            const firstPhoto = entry.attachments.find((a) => a.type === "photo");
            return (
              <Pressable
                key={entry.id}
                onPress={() => onEdit(entry)}
                style={({ pressed }) => [{
                  backgroundColor: colors.surface, borderRadius: 12, padding: 14, marginBottom: 8,
                  borderWidth: 1, borderColor: colors.border, opacity: pressed ? 0.8 : 1,
                }]}
              >
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <View style={{ flex: 1, gap: 4 }}>
                    {entry.title ? (
                      <Text style={{ fontSize: 16, fontWeight: "700", color: colors.foreground }} numberOfLines={1}>{entry.title}</Text>
                    ) : null}
                    <Text style={{ fontSize: 14, color: colors.foreground, lineHeight: 20 }} numberOfLines={3}>
                      {entry.body || "(audio entry)"}
                    </Text>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4 }}>
                      <Text style={{ fontSize: 11, color: colors.muted }}>{formatTime(entry.createdAt)}</Text>
                      {entry.attachments.length > 0 && (
                        <View style={{ flexDirection: "row", gap: 4 }}>
                          {entry.attachments.some((a) => a.type === "photo") && <IconSymbol name="photo.fill" size={12} color={colors.muted} />}
                          {entry.attachments.some((a) => a.type === "audio") && <IconSymbol name="mic.fill" size={12} color={colors.muted} />}
                          {entry.attachments.some((a) => a.type === "video") && <IconSymbol name="video.fill" size={12} color={colors.muted} />}
                          {entry.attachments.some((a) => a.type === "pdf") && <IconSymbol name="doc.fill" size={12} color={colors.muted} />}
                        </View>
                      )}
                      {entry.location && <IconSymbol name="location.fill" size={12} color={colors.muted} />}
                    </View>
                  </View>
                  {firstPhoto && (
                    <Image
                      source={{ uri: firstPhoto.uri }}
                      style={{ width: 56, height: 56, borderRadius: 8, marginLeft: 10 }}
                      resizeMode="cover"
                    />
                  )}
                </View>
                {/* Audio attachments inline */}
                {entry.attachments.filter((a) => a.type === "audio").map((att) => (
                  <AudioPlaybackRow key={att.id} uri={att.uri} duration={att.durationMs ? att.durationMs / 1000 : undefined} />
                ))}
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ─── CALENDAR TAB — Infinite vertical scroll ─────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════

/** Generate an array of { year, month } going back `count` months from a given month */
function generateMonths(endYear: number, endMonth: number, count: number): { year: number; month: number }[] {
  const result: { year: number; month: number }[] = [];
  let y = endYear;
  let m = endMonth;
  for (let i = 0; i < count; i++) {
    result.push({ year: y, month: m });
    m--;
    if (m < 1) { m = 12; y--; }
  }
  return result.reverse(); // oldest first
}

function CalendarTab({ entries, onDayPress, colors }: {
  entries: JournalEntry[];
  onDayPress: (date: string) => void;
  colors: any;
}) {
  const today = new Date();
  const todayStr = todayDateStr();

  // Show 12 months: current + 11 past months
  const months = useMemo(() => generateMonths(today.getFullYear(), today.getMonth() + 1, 12), []);

  // Build a global map of date -> entries
  const entryMap = useMemo(() => {
    const map = new Map<string, JournalEntry[]>();
    for (const e of entries) {
      const list = map.get(e.date) ?? [];
      list.push(e);
      map.set(e.date, list);
    }
    return map;
  }, [entries]);

  // Cell size: edge-to-edge, 1px gap, perfectly square
  const GAP = 1;
  const cellSize = Math.floor((SCREEN_WIDTH - 6 * GAP) / 7);

  const scrollRef = useRef<ScrollView>(null);
  const [didScroll, setDidScroll] = useState(false);

  // Scroll to bottom (current month) on mount
  useEffect(() => {
    if (!didScroll) {
      const timer = setTimeout(() => {
        scrollRef.current?.scrollToEnd({ animated: false });
        setDidScroll(true);
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [didScroll]);

  return (
    <ScrollView
      ref={scrollRef}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ paddingBottom: 80 }}
    >
      {/* Day-of-week headers */}
      <View style={{ flexDirection: "row", marginBottom: 4, paddingVertical: 8, backgroundColor: colors.background }}>
        {DAY_HEADERS.map((d, i) => (
          <View key={i} style={{ width: cellSize, alignItems: "center", marginRight: i < 6 ? GAP : 0 }}>
            <Text style={{ fontSize: 12, fontWeight: "700", color: colors.muted }}>{d}</Text>
          </View>
        ))}
      </View>

      {months.map(({ year, month }) => {
        const daysInMonth = getMonthDays(year, month);
        const firstDay = getFirstDayOfWeek(year, month);

        // Build rows of 7 cells
        const cells: (number | null)[] = [];
        for (let i = 0; i < firstDay; i++) cells.push(null);
        for (let d = 1; d <= daysInMonth; d++) cells.push(d);
        // Pad last row to 7
        while (cells.length % 7 !== 0) cells.push(null);
        const rows: (number | null)[][] = [];
        for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));

        return (
          <View key={`${year}-${month}`} style={{ marginBottom: 16 }}>
            {/* Month label */}
            <Text style={{
              fontSize: 20, fontWeight: "800", color: colors.foreground,
              marginBottom: 6, marginTop: 8, paddingHorizontal: 12,
            }}>
              {MONTH_NAMES[month - 1]} {year}
            </Text>

            {/* Week rows */}
            {rows.map((row, rowIdx) => (
              <View key={rowIdx} style={{ flexDirection: "row", marginBottom: GAP }}>
                {row.map((day, colIdx) => {
                  if (day === null) {
                    return <View key={`e-${colIdx}`} style={{ width: cellSize, height: cellSize, marginRight: colIdx < 6 ? GAP : 0 }} />;
                  }

                  const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                  const dayEntries = entryMap.get(dateStr) || [];
                  const isToday = dateStr === todayStr;
                  const hasEntries = dayEntries.length > 0;

                  // Find first photo
                  let photoUri: string | null = null;
                  for (const de of dayEntries) {
                    const photo = de.attachments.find((a) => a.type === "photo");
                    if (photo) { photoUri = photo.uri; break; }
                  }

                  // Text preview only when no photo
                  const textPreview = !photoUri && hasEntries
                    ? (dayEntries[0]?.body?.slice(0, 60) || "")
                    : "";

                  return (
                    <Pressable
                      key={day}
                      onPress={() => onDayPress(dateStr)}
                      style={({ pressed }) => [{
                        width: cellSize, height: cellSize,
                        marginRight: colIdx < 6 ? GAP : 0,
                        overflow: "hidden",
                        backgroundColor: isToday ? colors.primary + "15" : hasEntries ? colors.surface : colors.background,
                        borderWidth: isToday ? 2 : hasEntries ? 0.5 : 0,
                        borderColor: isToday ? colors.primary : colors.border,
                        opacity: pressed ? 0.7 : 1,
                      }]}
                    >
                      {/* Photo fills entire cell */}
                      {photoUri && (
                        <Image
                          source={{ uri: photoUri }}
                          style={StyleSheet.absoluteFill}
                          resizeMode="cover"
                        />
                      )}
                      {/* Dark overlay for text readability on photos */}
                      {photoUri && (
                        <View style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(0,0,0,0.15)" }]} />
                      )}

                      {/* Content layer */}
                      <View style={{ flex: 1, padding: 4, justifyContent: "space-between" }}>
                        {/* Day number — top left */}
                        <Text style={{
                          fontSize: 13, fontWeight: isToday ? "900" : hasEntries ? "700" : "500",
                          color: photoUri ? "#fff" : isToday ? colors.primary : colors.foreground,
                          textShadowColor: photoUri ? "rgba(0,0,0,0.7)" : "transparent",
                          textShadowOffset: { width: 0, height: 1 },
                          textShadowRadius: photoUri ? 3 : 0,
                        }}>
                          {day}
                        </Text>

                        {/* Text preview — fills remaining space (no photo) */}
                        {textPreview ? (
                          <Text style={{
                            fontSize: 8, lineHeight: 10, color: colors.muted,
                            marginTop: 2,
                          }} numberOfLines={4}>
                            {textPreview}
                          </Text>
                        ) : null}

                        {/* Dot indicator for entries without photo */}
                        {hasEntries && !photoUri && !textPreview && (
                          <View style={{
                            width: 6, height: 6, borderRadius: 3,
                            backgroundColor: colors.primary, alignSelf: "center",
                          }} />
                        )}
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            ))}
          </View>
        );
      })}
    </ScrollView>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ─── MEDIA TAB ───────────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════
type MediaFilter = "all" | "photo" | "video" | "audio" | "pdf";

function MediaTab({ entries, colors }: { entries: JournalEntry[]; colors: any }) {
  const [filter, setFilter] = useState<MediaFilter>("all");

  const allAttachments = useMemo(() => {
    const list: (JournalAttachment & { entryDate: string })[] = [];
    for (const e of entries) {
      for (const att of e.attachments) {
        list.push({ ...att, entryDate: e.date });
      }
    }
    return list.sort((a, b) => b.entryDate.localeCompare(a.entryDate));
  }, [entries]);

  const filtered = filter === "all" ? allAttachments : allAttachments.filter((a) => a.type === filter);

  const FILTERS: { key: MediaFilter; label: string }[] = [
    { key: "all", label: "All" },
    { key: "photo", label: "Photos" },
    { key: "audio", label: "Audio" },
    { key: "video", label: "Video" },
  ];

  // Photo grid for photo items
  const photoItems = filtered.filter((a) => a.type === "photo");
  const otherItems = filtered.filter((a) => a.type !== "photo");
  const photoSize = Math.floor((SCREEN_WIDTH - 32 - 8) / 3);

  return (
    <View>
      {/* Filter tabs */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
        <View style={{ flexDirection: "row", gap: 8, paddingVertical: 4 }}>
          {FILTERS.map((f) => (
            <Pressable
              key={f.key}
              onPress={() => setFilter(f.key)}
              style={[{
                paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20,
                backgroundColor: filter === f.key ? colors.primary : colors.surface,
                borderWidth: 1, borderColor: filter === f.key ? colors.primary : colors.border,
              }]}
            >
              <Text style={{ fontSize: 13, fontWeight: "600", color: filter === f.key ? "#fff" : colors.foreground }}>
                {f.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>

      {filtered.length === 0 ? (
        <View style={{ alignItems: "center", paddingVertical: 40, gap: 8 }}>
          <IconSymbol name="photo.stack.fill" size={40} color={colors.muted} />
          <Text style={{ fontSize: 14, color: colors.muted }}>No media yet</Text>
        </View>
      ) : (
        <View>
          {/* Photo grid */}
          {photoItems.length > 0 && (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 4, marginBottom: 12 }}>
              {photoItems.map((att) => (
                <Image
                  key={att.id}
                  source={{ uri: att.uri }}
                  style={{ width: photoSize, height: photoSize, borderRadius: 6 }}
                  resizeMode="cover"
                />
              ))}
            </View>
          )}
          {/* Other items (audio, video, pdf) */}
          {otherItems.length > 0 && (
            <View style={{ gap: 8 }}>
              {otherItems.map((att) => (
                <View key={att.id} style={[{
                  flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderRadius: 12,
                  backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
                }]}>
                  <IconSymbol
                    name={att.type === "video" ? "video.fill" : att.type === "audio" ? "mic.fill" : "doc.fill"}
                    size={20} color={colors.primary}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: "600", color: colors.foreground }} numberOfLines={1}>
                      {att.name || att.type.charAt(0).toUpperCase() + att.type.slice(1)}
                    </Text>
                    <Text style={{ fontSize: 11, color: colors.muted }}>{att.entryDate}</Text>
                  </View>
                  {att.type === "audio" && att.durationMs && (
                    <Text style={{ fontSize: 12, color: colors.muted }}>{fmtDuration(att.durationMs / 1000)}</Text>
                  )}
                </View>
              ))}
            </View>
          )}
        </View>
      )}
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ─── MAP TAB ─────────────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════
function MapTab({ entries, colors }: { entries: JournalEntry[]; colors: any }) {
  const locEntries = useMemo(() => entries.filter((e) => e.location), [entries]);

  if (locEntries.length === 0) {
    return (
      <View style={{ alignItems: "center", paddingVertical: 40, gap: 8 }}>
        <IconSymbol name="map.fill" size={40} color={colors.muted} />
        <Text style={{ fontSize: 14, color: colors.muted, textAlign: "center", lineHeight: 20 }}>
          No locations yet.{"\n"}Add a location when creating a journal entry.
        </Text>
      </View>
    );
  }

  return (
    <View style={{ gap: 8 }}>
      <Text style={{ fontSize: 13, fontWeight: "700", color: colors.muted, marginBottom: 4 }}>
        {locEntries.length} ENTRIES WITH LOCATION
      </Text>
      {locEntries.map((entry) => (
        <View key={entry.id} style={[{
          padding: 12, borderRadius: 12, backgroundColor: colors.surface,
          borderWidth: 1, borderColor: colors.border, gap: 4,
        }]}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <IconSymbol name="location.fill" size={16} color={colors.primary} />
            <Text style={{ fontSize: 13, fontWeight: "600", color: colors.foreground }} numberOfLines={1}>
              {entry.location?.address || `${entry.location?.latitude.toFixed(4)}, ${entry.location?.longitude.toFixed(4)}`}
            </Text>
          </View>
          <Text style={{ fontSize: 12, color: colors.muted }}>{formatDateLabel(entry.date)}</Text>
          {entry.body ? (
            <Text style={{ fontSize: 12, color: colors.foreground, lineHeight: 16 }} numberOfLines={2}>{entry.body}</Text>
          ) : null}
        </View>
      ))}
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ─── MAIN JOURNAL SCREEN ─────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════
export default function JournalScreen() {
  const colors = useColors();
  const [activeTab, setActiveTab] = useState<SubTab>("journal");
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [userId, setUserId] = useState("");
  const [loading, setLoading] = useState(true);
  const [editorVisible, setEditorVisible] = useState(false);
  const [editingEntry, setEditingEntry] = useState<JournalEntry | null>(null);
  const [editorDate, setEditorDate] = useState(todayDateStr());

  useEffect(() => {
    (async () => {
      const uid = await getLastUserId();
      setUserId(uid || "default");
      const loaded = await loadEntries(uid || "default");
      loaded.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setEntries(loaded);
      setLoading(false);
    })();
  }, []);

  async function handleSaveEntry(entry: JournalEntry) {
    const isNew = !entries.find((e) => e.id === entry.id);
    if (isNew) {
      const updated = await addEntry(userId, entry);
      updated.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setEntries(updated);
    } else {
      const updated = await updateEntryInStore(userId, entry.id, entry);
      updated.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setEntries(updated);
    }
  }

  async function handleDeleteEntry(id: string) {
    const updated = await deleteEntryFromStore(userId, id);
    updated.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    setEntries(updated);
  }

  function openNewEntry(date?: string) {
    setEditingEntry(null);
    setEditorDate(date || todayDateStr());
    setEditorVisible(true);
  }

  function openEditEntry(entry: JournalEntry) {
    setEditingEntry(entry);
    setEditorDate(entry.date);
    setEditorVisible(true);
  }

  function handleCalendarDayPress(date: string) {
    const dayEntries = entries.filter((e) => e.date === date);
    if (dayEntries.length > 0) {
      // Open the first entry for editing
      openEditEntry(dayEntries[0]);
    } else {
      openNewEntry(date);
    }
  }

  const SUB_TABS: { key: SubTab; label: string; icon: string }[] = [
    { key: "journal", label: "Journal", icon: "book.fill" },
    { key: "calendar", label: "Calendar", icon: "calendar" },
    { key: "media", label: "Media", icon: "photo.stack.fill" },
    { key: "map", label: "Map", icon: "map.fill" },
  ];

  return (
    <ScreenContainer>
      {/* Header */}
      <View style={styles.header}>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>Journal</Text>
      </View>

      {/* Sub-tab bar */}
      <View style={[styles.tabBar, { borderBottomColor: colors.border }]}>
        {SUB_TABS.map((tab) => (
          <Pressable
            key={tab.key}
            onPress={() => setActiveTab(tab.key)}
            style={[
              styles.tabItem,
              activeTab === tab.key && { borderBottomColor: colors.primary, borderBottomWidth: 2 },
            ]}
          >
            <IconSymbol name={tab.icon as any} size={18} color={activeTab === tab.key ? colors.primary : colors.muted} />
            <Text style={{
              fontSize: 12, fontWeight: activeTab === tab.key ? "700" : "500",
              color: activeTab === tab.key ? colors.primary : colors.muted,
            }}>
              {tab.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Content */}
      {loading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : activeTab === "calendar" ? (
        // Calendar gets its own scroll — no outer ScrollView wrapper
        <View style={{ flex: 1 }}>
          <CalendarTab entries={entries} onDayPress={handleCalendarDayPress} colors={colors} />
        </View>
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {activeTab === "journal" && (
            <JournalListTab entries={entries} onDelete={handleDeleteEntry} onEdit={openEditEntry} colors={colors} />
          )}
          {activeTab === "media" && (
            <MediaTab entries={entries} colors={colors} />
          )}
          {activeTab === "map" && (
            <MapTab entries={entries} colors={colors} />
          )}
        </ScrollView>
      )}

      {/* FAB — lower position, smaller shadow */}
      <Pressable
        onPress={() => openNewEntry()}
        style={({ pressed }) => [{
          position: "absolute", bottom: 24, right: 20,
          width: 56, height: 56, borderRadius: 28,
          backgroundColor: colors.primary,
          alignItems: "center", justifyContent: "center",
          shadowColor: "#000", shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.25, shadowRadius: 6, elevation: 6,
          opacity: pressed ? 0.8 : 1,
        }]}
      >
        <IconSymbol name="plus" size={28} color="#fff" />
      </Pressable>

      {/* Entry Editor Modal */}
      <EntryEditor
        visible={editorVisible}
        entry={editingEntry}
        initialDate={editorDate}
        onSave={handleSaveEntry}
        onClose={() => setEditorVisible(false)}
        colors={colors}
        userId={userId}
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8 },
  headerTitle: { fontSize: 28, fontWeight: "700" },
  tabBar: { flexDirection: "row", borderBottomWidth: 0.5, paddingHorizontal: 8 },
  tabItem: { flex: 1, alignItems: "center", paddingVertical: 10, gap: 2 },
});
