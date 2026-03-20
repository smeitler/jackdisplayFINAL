import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  View, Text, ScrollView, Pressable, StyleSheet, Alert, Platform,
  TextInput, KeyboardAvoidingView, Animated, ActivityIndicator,
  Modal, FlatList, Dimensions, Image, useWindowDimensions,
} from "react-native";
import { useLocalSearchParams } from "expo-router";
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
import { useIsCalm } from "@/components/calm-effects";
import { WheelColumn } from "@/components/wheel-time-picker";

// SCREEN_WIDTH is used as a fallback; CalendarTab uses useWindowDimensions() for reactivity
const { width: SCREEN_WIDTH } = Dimensions.get("window") ?? { width: 390 };

// ─── Sub-tab type ────────────────────────────────────────────────────────────
type SubTab = "habits" | "journal";

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
function MicButton({ onRecordingComplete, colors, templatePrompt }: {
  onRecordingComplete: (uri: string, duration: number, mimeType: string) => void;
  colors: any;
  templatePrompt?: string; // prompts to show while recording
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
      {/* Template prompt overlay — shown while recording */}
      {isRecording && templatePrompt ? (
        <View style={{
          position: "absolute", bottom: 80, left: -140, right: -140,
          backgroundColor: colors.surface,
          borderRadius: 14, padding: 14,
          borderWidth: 1, borderColor: colors.border,
          shadowColor: "#000", shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.15, shadowRadius: 8, elevation: 8,
          zIndex: 100,
        }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 8 }}>
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: "#EF4444" }} />
            <Text style={{ fontSize: 12, fontWeight: "700", color: "#EF4444", fontVariant: ["tabular-nums"] as any }}>
              {fmtDuration(elapsedSecs)}
            </Text>
            <Text style={{ fontSize: 12, color: colors.muted, marginLeft: 4 }}>Recording…</Text>
          </View>
          <Text style={{ fontSize: 13, color: colors.foreground, lineHeight: 20, fontWeight: "600", marginBottom: 4 }}>
            Talking points:
          </Text>
          <Text style={{ fontSize: 13, color: colors.foreground, lineHeight: 20 }}>
            {templatePrompt}
          </Text>
        </View>
      ) : isRecording ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 2 }}>
          <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: "#EF4444" }} />
          <Text style={{ fontSize: 14, fontWeight: "700", color: "#EF4444", fontVariant: ["tabular-nums"] as any }}>
            {fmtDuration(elapsedSecs)}
          </Text>
        </View>
      ) : null}
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
  // Merged editor: first line is title (bold), rest is body
  const [mergedText, setMergedText] = useState("");
  const mergedInputRef = useRef<any>(null);
  const [template, setTemplate] = useState<JournalTemplate>("blank");
  const [attachments, setAttachments] = useState<JournalAttachment[]>([]);
  const [location, setLocation] = useState<JournalLocation | undefined>();
  const [mood, setMood] = useState<string>("");
  const [showTemplates, setShowTemplates] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [transcribingIds, setTranscribingIds] = useState<Set<string>>(new Set());
  const [habits, setHabits] = useState<Habit[]>([]);
  const [habitNotes, setHabitNotes] = useState<Record<string, string>>({});

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
        // Build merged text: title on first line, then body
        const merged = entry.title ? entry.title + (entry.body ? "\n" + entry.body : "") : entry.body;
        setMergedText(merged);
      } else {
        setDate(initialDate);
        setTitle("");
        setBody("");
        setMergedText("");
        setTemplate("blank");
        setAttachments([]);
        setLocation(undefined);
        setMood("");
      }
    }
  }, [visible, entry, initialDate]);

  // applyTemplate is replaced by applyTemplateByKey below — kept as no-op for safety
  function applyTemplate(_t: JournalTemplate) {}

  // Parse merged text: first line = title, rest = body
  function handleMergedChange(text: string) {
    setMergedText(text);
    const newlineIdx = text.indexOf("\n");
    if (newlineIdx === -1) {
      setTitle(text);
      setBody("");
    } else {
      setTitle(text.slice(0, newlineIdx));
      setBody(text.slice(newlineIdx + 1));
    }
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
      const habitList = habits.map((h) => ({ id: h.id, name: h.name }));
      const result = await transcribeMutation.mutateAsync({ audioBase64, mimeType, date, habits: habitList });
      const transcript = result.transcript?.trim() || "";
      if (transcript) {
        setBody((prev) => {
          const newBody = prev ? prev + "\n\n" + transcript : transcript;
          // Also update mergedText so the editor shows the new content
          setMergedText((prevMerged) => {
            const currentTitle = prevMerged.indexOf("\n") === -1 ? prevMerged : prevMerged.slice(0, prevMerged.indexOf("\n"));
            return currentTitle ? currentTitle + "\n" + newBody : newBody;
          });
          return newBody;
        });
      }
      // Apply habit notes from AI
      if (result.habitNotes && Object.keys(result.habitNotes).length > 0) {
        setHabitNotes((prev) => ({ ...prev, ...result.habitNotes }));
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
    try {
      const now = new Date().toISOString();

      // Convert photo/video file URIs to base64 data URIs so they persist across app restarts.
      // Audio URIs are already data URIs from the recorder, so skip those.
      const persistedAttachments: JournalAttachment[] = await Promise.all(
        attachments.map(async (att) => {
          if ((att.type === "photo" || att.type === "video") && att.uri && !att.uri.startsWith("data:")) {
            try {
              if (Platform.OS === "web") {
                // On web, fetch the blob and convert to data URI
                const resp = await fetch(att.uri);
                const blob = await resp.blob();
                const dataUri = await blobToDataUri(blob);
                return { ...att, uri: dataUri };
              } else {
                // On native: ph:// URIs (iOS Photos) cannot be read directly.
                // Copy to a temp file first, then read as base64.
                let readableUri = att.uri;
                if (att.uri.startsWith("ph://") || att.uri.startsWith("assets-library://")) {
                  const dest = (FileSystem.cacheDirectory ?? "") + `journal_photo_${Date.now()}.jpg`;
                  await FileSystem.copyAsync({ from: att.uri, to: dest });
                  readableUri = dest;
                }
                const base64 = await FileSystem.readAsStringAsync(readableUri, { encoding: FileSystem.EncodingType.Base64 });
                const mime = att.mimeType || "image/jpeg";
                // Clean up temp file if we created one
                if (readableUri !== att.uri) {
                  FileSystem.deleteAsync(readableUri, { idempotent: true }).catch(() => {});
                }
                return { ...att, uri: `data:${mime};base64,${base64}` };
              }
            } catch (e) {
              console.warn("[Journal] Failed to persist attachment:", e);
              // If conversion fails, keep original URI (photo still shows in this session)
              return att;
            }
          }
          return att;
        })
      );

      const saved: JournalEntry = {
        id: entry?.id || generateId(),
        userId,
        date,
        createdAt: entry?.createdAt || now,
        updatedAt: now,
        title: title.trim(),
        body: body.trim(),
        template,
        attachments: persistedAttachments,
        location,
        mood,
        tags: [],
        gratitudes: [], // gratitudes now live in body text under 🙏 Grateful for: section
      };
      onSave(saved);
      onClose();
    } finally {
      setIsSaving(false);
    }
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
    // Preserve existing body — append template below transcription if body already has content
    setShowTemplates(false);
    const existingBody = body.trim();
    const separator = existingBody ? "\n\n---\n\n" : "";
    if (key === "habit-checkin") {
      setTemplate("blank" as JournalTemplate);
      const lines: string[] = ["\uD83D\uDCCB Daily Habit Notes", ""];
      if (habits.length > 0) {
        for (const h of habits) {
          lines.push(`${h.emoji} ${h.name}`);
          lines.push("Notes: ");
          lines.push("");
        }
      } else {
        lines.push("No active habits found. Add habits in the Habits tab first.");
      }
      const newBody = lines.join("\n");
      const merged = existingBody + separator + newBody;
      setBody(merged);
      setMergedText(title ? title + "\n" + merged : merged);
    } else if (key === "morning-pages") {
      setTemplate("free-write" as JournalTemplate);
      const templateContent = "🌅 Morning Pages\n\nJust write whatever comes to mind. Don't stop, don't edit, just let it flow...\n\n🙏 Grateful for:\n1. \n2. \n3. \n";
      const merged = existingBody + separator + templateContent;
      setBody(merged);
      setMergedText(title ? title + "\n" + merged : merged);
    } else if (key === "weekly-review") {
      setTemplate("goal-review" as JournalTemplate);
      const templateContent = "📊 Weekly Review\n\n✅ This week's wins:\n\n\n⚠️ This week's challenges:\n\n\n💡 Lessons learned:\n\n\n🎯 Focus for next week:\n\n🙏 Grateful for:\n1. \n2. \n3. \n";
      const merged = existingBody + separator + templateContent;
      setBody(merged);
      setMergedText(title ? title + "\n" + merged : merged);
    } else {
      // Built-in templates
      const tmpl = JOURNAL_TEMPLATES.find((x) => x.key === key);
      if (tmpl) {
        setTemplate(tmpl.key);
        if (tmpl.prompt) {
          const merged = existingBody + separator + tmpl.prompt;
          setBody(merged);
          setMergedText(title ? title + "\n" + merged : merged);
        }
      }
    }
  }

  // Build habit prompt for recording — always show habits if available
  const habitRecordPrompt = useMemo(() => {
    if (habits.length > 0) {
      const habitLines = habits.map((h) => `${h.emoji} ${h.name}`).join("\n");
      return `Your habits to reflect on:\n${habitLines}\n\n\uD83D\uDE4F Gratitude: What are you grateful for today?`;
    }
    return "\uD83D\uDE4F Gratitude: What are you grateful for today?\n\uD83C\uDFAF Goals: What did you work toward?\n\uD83D\uDCA1 Insight: What did you learn?";
  }, [habits]);

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
              disabled={isSaving || (!mergedText.trim() && attachments.length === 0)}
              style={({ pressed }) => [{
                opacity: (isSaving || (!mergedText.trim() && attachments.length === 0)) ? 0.4 : pressed ? 0.7 : 1,
                backgroundColor: colors.primary, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20,
              }]}
            >
              <Text style={{ color: "#fff", fontWeight: "600", fontSize: 14 }}>{isSaving ? "Saving\u2026" : "Save"}</Text>
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

          {/* Template picker dropdown — shown when open */}
          {showTemplates && (
            <View style={[editorStyles.templateGrid, { paddingHorizontal: 16, paddingTop: 12, borderBottomWidth: 0.5, borderBottomColor: colors.border, backgroundColor: colors.surface }]}>
              {allTemplates.map((t) => (
                <Pressable
                  key={t.key}
                  onPress={() => applyTemplateByKey(t.key)}
                  style={({ pressed }) => [{
                    paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, borderWidth: 1.5,
                    borderColor: template === t.key ? colors.primary : colors.border,
                    backgroundColor: pressed ? colors.primary + "10" : colors.background,
                  }]}
                >
                  <Text style={{ fontSize: 13, fontWeight: "600", color: colors.foreground }}>{t.label}</Text>
                  <Text style={{ fontSize: 10, color: colors.muted, marginTop: 2 }} numberOfLines={1}>{t.description}</Text>
                </Pressable>
              ))}
            </View>
          )}

          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 120 }} keyboardShouldPersistTaps="handled">
            {/* Merged title + body input: first line bold = title, rest = body */}
            <TextInput
              ref={mergedInputRef}
              value={mergedText}
              onChangeText={handleMergedChange}
              placeholder="Title your entry, then press Enter to write\u2026"
              placeholderTextColor={colors.muted}
              multiline
              style={[
                editorStyles.mergedInput,
                { color: colors.foreground },
              ]}
              textAlignVertical="top"
            />

            {/* Transcription indicator */}
            {transcribingIds.size > 0 && (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 8 }}>
                <ActivityIndicator size="small" color={colors.primary} />
                <Text style={{ fontSize: 12, color: colors.muted }}>Transcribing audio…</Text>
              </View>
            )}

            {/* Habit Notes from voice recording */}
            {Object.keys(habitNotes).length > 0 && (
              <View style={{ gap: 8, marginTop: 12 }}>
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                  <Text style={{ fontSize: 11, fontWeight: "700", color: colors.primary, letterSpacing: 0.5 }}>HABIT NOTES (from recording)</Text>
                  <Pressable onPress={() => setHabitNotes({})} style={({ pressed }) => [{ opacity: pressed ? 0.5 : 1 }]}>
                    <Text style={{ fontSize: 11, color: colors.muted }}>Clear</Text>
                  </Pressable>
                </View>
                {habits
                  .filter((h) => habitNotes[h.id])
                  .map((h) => (
                    <View key={h.id} style={{ backgroundColor: colors.surface, borderRadius: 10, padding: 10, borderLeftWidth: 3, borderLeftColor: colors.primary, gap: 2 }}>
                      <Text style={{ fontSize: 12, fontWeight: "600", color: colors.foreground }}>{h.name}</Text>
                      <TextInput
                        value={habitNotes[h.id]}
                        onChangeText={(text) => setHabitNotes((prev) => ({ ...prev, [h.id]: text }))}
                        style={{ fontSize: 12, color: colors.muted, lineHeight: 18 }}
                        multiline
                        returnKeyType="done"
                      />
                    </View>
                  ))
                }
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

          {/* Bottom toolbar — photo | paperclip | template | [MIC CENTER] | location | spacer */}
          <View style={[editorStyles.toolbar, { borderTopColor: colors.border, backgroundColor: colors.background }]}>
            <View style={{ flexDirection: "row", gap: 14, alignItems: "center" }}>
              <Pressable onPress={handlePickPhoto} style={({ pressed }) => [{ opacity: pressed ? 0.5 : 1 }]}>
                <IconSymbol name="photo.fill" size={22} color={colors.muted} />
              </Pressable>
              <Pressable onPress={handlePickDocument} style={({ pressed }) => [{ opacity: pressed ? 0.5 : 1 }]}>
                <IconSymbol name="paperclip" size={22} color={colors.muted} />
              </Pressable>
              {/* Template picker button — shows active template name */}
              <Pressable
                onPress={() => setShowTemplates(!showTemplates)}
                style={({ pressed }) => [{
                  flexDirection: "row", alignItems: "center", gap: 4,
                  paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14,
                  backgroundColor: showTemplates ? colors.primary + "20" : colors.surface,
                  borderWidth: 1, borderColor: showTemplates ? colors.primary : colors.border,
                  opacity: pressed ? 0.7 : 1,
                }]}
              >
                <IconSymbol name="doc.fill" size={13} color={showTemplates ? colors.primary : colors.muted} />
                <Text style={{ fontSize: 11, fontWeight: "600", color: showTemplates ? colors.primary : colors.muted }}>
                  {allTemplates.find((t) => t.key === template)?.label || "Template"}
                </Text>
              </Pressable>
            </View>
            {/* MicButton always passes habit prompts so they show on record */}
            <MicButton
              onRecordingComplete={handleRecordingComplete}
              colors={colors}
              templatePrompt={habitRecordPrompt}
            />
            <View style={{ flexDirection: "row", gap: 14, alignItems: "center" }}>
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
  mergedInput: { fontSize: 16, lineHeight: 26, minHeight: 240, paddingVertical: 8 },
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

/** Generate an array of { year, month } from startYear/startMonth to endYear/endMonth inclusive */
function generateMonths(
  startYear: number, startMonth: number,
  endYear: number, endMonth: number
): { year: number; month: number }[] {
  const result: { year: number; month: number }[] = [];
  let y = startYear;
  let m = startMonth;
  while (y < endYear || (y === endYear && m <= endMonth)) {
    result.push({ year: y, month: m });
    m++;
    if (m > 12) { m = 1; y++; }
  }
  return result;
}

function CalendarTab({ entries, onDayPress, colors }: {
  entries: JournalEntry[];
  onDayPress: (date: string) => void;
  colors: any;
}) {
  const today = new Date();
  const todayStr = todayDateStr();

  // Show 10 years back → 5 years forward
  const START_YEARS_BACK = 10;
  const END_YEARS_FORWARD = 5;
  const startYear = today.getFullYear() - START_YEARS_BACK;
  const endYear = today.getFullYear() + END_YEARS_FORWARD;
  const months = useMemo(
    () => generateMonths(startYear, 1, endYear, 12),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );
  // Index of the current month in the months array (used to scroll to it)
  const todayMonthIndex = useMemo(() => {
    const y = today.getFullYear();
    const m = today.getMonth() + 1;
    return months.findIndex((mo) => mo.year === y && mo.month === m);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  // True wall-calendar layout:
  // 7 equal columns, 1px border between cells, cells are perfectly square.
  // Use useWindowDimensions so it reacts to screen size changes.
  const { width: winWidth } = useWindowDimensions();
  const CELL_GAP = 3;
  const cellWidth = Math.floor(((winWidth > 0 ? winWidth : 390) - 32 - CELL_GAP * 6) / 7);
  const cellHeight = cellWidth;

  const scrollRef = useRef<ScrollView>(null);
  const [didScroll, setDidScroll] = useState(false);

  // Scroll to today's month on mount using measured offsets
  const monthOffsets = useRef<number[]>([]);

  useEffect(() => {
    if (!didScroll && todayMonthIndex >= 0 && monthOffsets.current[todayMonthIndex] != null) {
      scrollRef.current?.scrollTo({ y: monthOffsets.current[todayMonthIndex], animated: false });
      setDidScroll(true);
    }
  }, [didScroll, todayMonthIndex]);

  return (
    <ScrollView
      ref={scrollRef}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ paddingBottom: 80 }}
    >
      {months.map(({ year, month }, monthIndex) => {
        const daysInMonth = getMonthDays(year, month);
        const firstDay = getFirstDayOfWeek(year, month);

        // Build rows of 7 cells (null = empty filler)
        const cells: (number | null)[] = [];
        for (let i = 0; i < firstDay; i++) cells.push(null);
        for (let d = 1; d <= daysInMonth; d++) cells.push(d);
        while (cells.length % 7 !== 0) cells.push(null);
        const rows: (number | null)[][] = [];
        for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));

        return (
          <View
            key={`${year}-${month}`}
            onLayout={(e) => {
              monthOffsets.current[monthIndex] = e.nativeEvent.layout.y;
              // Once we have the today month offset, scroll to it
              if (monthIndex === todayMonthIndex && !didScroll) {
                scrollRef.current?.scrollTo({ y: e.nativeEvent.layout.y, animated: false });
                setDidScroll(true);
              }
            }}
            style={{ marginBottom: 8 }}>
            {/* Month header */}
            <View style={{
              flexDirection: "row",
              alignItems: "baseline",
              gap: 6,
              paddingHorizontal: 16,
              paddingTop: 16,
              paddingBottom: 8,
            }}>
              <Text style={{ fontSize: 16, fontWeight: "700", color: colors.foreground }}>
                {MONTH_NAMES[month - 1]}
              </Text>
              <Text style={{ fontSize: 13, fontWeight: "500", color: colors.muted }}>{year}</Text>
            </View>

            {/* Day-of-week header */}
            <View style={{ flexDirection: "row", gap: CELL_GAP, paddingHorizontal: 16, marginBottom: CELL_GAP }}>
              {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
                <View key={i} style={{ width: cellWidth, alignItems: "center" }}>
                  <Text style={{ fontSize: 9, fontWeight: "600", color: colors.muted }}>{d}</Text>
                </View>
              ))}
            </View>

            {/* Week rows — clean square filled boxes */}
            <View style={{ paddingHorizontal: 16 }}>
              {rows.map((row, rowIdx) => (
                <View key={rowIdx} style={{ flexDirection: "row", gap: CELL_GAP, marginBottom: CELL_GAP }}>
                  {row.map((day, colIdx) => {
                    if (day === null) {
                      return <View key={`e-${colIdx}`} style={{ width: cellWidth, height: cellHeight }} />;
                    }

                    const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                    const dayEntries = entryMap.get(dateStr) || [];
                    const isToday = dateStr === todayStr;
                    const isFuture = dateStr > todayStr;
                    const isPast = dateStr < todayStr;
                    const hasEntries = dayEntries.length > 0;

                    // Find first photo across all entries for this day
                    let photoUri: string | null = null;
                    for (const de of dayEntries) {
                      const photo = de.attachments?.find((a: { type: string }) => a.type === "photo");
                      if (photo) { photoUri = (photo as { uri: string }).uri; break; }
                    }

                    // Fill: photo > text entry (darker) > no entry (dim)
                    const bgColor = photoUri ? "#000" : hasEntries ? colors.primary : colors.surface;
                    const cellOpacity = isFuture ? 0.18 : photoUri ? 1 : hasEntries ? 0.75 : 0.22;

                    return (
                      <Pressable
                        key={day}
                        onPress={() => onDayPress(dateStr)}
                        style={({ pressed }) => ({
                          width: cellWidth,
                          height: cellHeight,
                          borderRadius: 4,
                          overflow: "hidden",
                          backgroundColor: bgColor,
                          opacity: pressed ? 0.6 : cellOpacity,
                          borderWidth: isToday ? 1.5 : 0,
                          borderColor: isToday ? colors.primary : "transparent",
                        })}
                      >
                        {/* Photo fills entire cell */}
                        {photoUri ? (
                          <Image
                            source={{ uri: photoUri }}
                            style={StyleSheet.absoluteFill}
                            resizeMode="cover"
                          />
                        ) : null}
                        {/* Date number */}
                        <Text style={{
                          fontSize: 10,
                          fontWeight: "700",
                          lineHeight: 13,
                          color: photoUri ? "#fff" : isToday ? colors.primary : colors.foreground,
                          opacity: photoUri ? 0.9 : isFuture ? 0.4 : 0.85,
                          paddingLeft: 3,
                          paddingTop: 2,
                          textShadowColor: photoUri ? "rgba(0,0,0,0.8)" : "transparent",
                          textShadowOffset: { width: 0, height: 1 },
                          textShadowRadius: photoUri ? 2 : 0,
                        }}>{day}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              ))}
            </View>
          </View>
        );
      })}
    </ScrollView>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ─── MEDIA TAB ─────────────────────────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════
type MediaFilter = "all" | "photo" | "video" | "audio" | "pdf";

type RichMediaItem = JournalAttachment & {
  entryDate: string;
  entryBody: string;
  entryTitle: string;
  entryCreatedAt: string;
  transcriptionText?: string;
};

function MediaTab({ entries, colors }: { entries: JournalEntry[]; colors: any }) {
  const [filter, setFilter] = useState<MediaFilter>("all");
  const [expandedPhoto, setExpandedPhoto] = useState<RichMediaItem | null>(null);
  const { width: screenW } = useWindowDimensions();

  // Build rich items: attachment + parent entry context, sorted newest first
  const allItems = useMemo(() => {
    const list: RichMediaItem[] = [];
    for (const e of entries) {
      for (const att of e.attachments) {
        list.push({
          ...att,
          entryDate: e.date,
          entryBody: e.body || "",
          entryTitle: e.title || "",
          entryCreatedAt: e.createdAt,
          transcriptionText: e.transcriptionText,
        });
      }
    }
    return list.sort((a, b) => b.entryCreatedAt.localeCompare(a.entryCreatedAt));
  }, [entries]);

  const filtered = filter === "all" ? allItems : allItems.filter((a) => a.type === filter);

  const FILTERS: { key: MediaFilter; label: string; icon: string }[] = [
    { key: "all", label: "All", icon: "photo.stack.fill" },
    { key: "photo", label: "Photos", icon: "photo.fill" },
    { key: "audio", label: "Audio", icon: "mic.fill" },
    { key: "video", label: "Video", icon: "video.fill" },
  ];

  const photoSize = Math.floor((screenW - 32 - 4) / 3);

  // Format date nicely
  function niceDate(dateStr: string): string {
    try {
      const d = new Date(dateStr + "T00:00:00");
      return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
    } catch { return dateStr; }
  }

  return (
    <View>
      {/* ─── Photo lightbox modal */}
      <Modal visible={!!expandedPhoto} animationType="fade" transparent>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.92)", justifyContent: "center" }}>
          {/* Close button */}
          <Pressable
            onPress={() => setExpandedPhoto(null)}
            style={({ pressed }) => [{
              position: "absolute", top: 56, right: 20, zIndex: 10,
              width: 36, height: 36, borderRadius: 18,
              backgroundColor: "rgba(255,255,255,0.15)",
              alignItems: "center", justifyContent: "center",
              opacity: pressed ? 0.6 : 1,
            }]}
          >
            <IconSymbol name="xmark" size={18} color="#fff" />
          </Pressable>

          {expandedPhoto && (
            <>
              {/* Full photo */}
              <Image
                source={{ uri: expandedPhoto.uri }}
                style={{ width: screenW, height: screenW, alignSelf: "center" }}
                resizeMode="contain"
              />
              {/* Entry info below photo */}
              <View style={{
                marginTop: 20, marginHorizontal: 24,
                backgroundColor: "rgba(255,255,255,0.08)",
                borderRadius: 14, padding: 16, gap: 6,
              }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <IconSymbol name="calendar" size={14} color="#9BA1A6" />
                  <Text style={{ fontSize: 13, color: "#9BA1A6" }}>{niceDate(expandedPhoto.entryDate)}</Text>
                </View>
                {expandedPhoto.entryTitle ? (
                  <Text style={{ fontSize: 17, fontWeight: "700", color: "#fff" }}>{expandedPhoto.entryTitle}</Text>
                ) : null}
                {expandedPhoto.entryBody ? (
                  <Text style={{ fontSize: 14, color: "#ECEDEE", lineHeight: 20 }} numberOfLines={6}>
                    {expandedPhoto.entryBody}
                  </Text>
                ) : null}
              </View>
            </>
          )}
        </View>
      </Modal>

      {/* Filter pill bar */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
        <View style={{ flexDirection: "row", gap: 8, paddingVertical: 4 }}>
          {FILTERS.map((f) => (
            <Pressable
              key={f.key}
              onPress={() => setFilter(f.key)}
              style={[{
                flexDirection: "row", alignItems: "center", gap: 6,
                paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
                backgroundColor: filter === f.key ? colors.primary : colors.surface,
                borderWidth: 1, borderColor: filter === f.key ? colors.primary : colors.border,
              }]}
            >
              <IconSymbol name={f.icon as any} size={13} color={filter === f.key ? "#fff" : colors.muted} />
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
      ) : filter === "photo" ? (
        // ── Photo grid view — tap to expand
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 2 }}>
          {filtered.map((att) => (
            <Pressable
              key={att.id}
              onPress={() => setExpandedPhoto(att)}
              style={({ pressed }) => [{ width: photoSize, marginBottom: 2, opacity: pressed ? 0.8 : 1 }]}
            >
              <Image
                source={{ uri: att.uri }}
                style={{ width: photoSize, height: photoSize, borderRadius: 4 }}
                resizeMode="cover"
              />
              <Text style={{ fontSize: 9, color: colors.muted, marginTop: 2, textAlign: "center" }} numberOfLines={1}>
                {niceDate(att.entryDate)}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : filter === "audio" ? (
        // ── Audio-only view: player + transcript
        <View style={{ gap: 12 }}>
          {filtered.map((att) => {
            const transcript = (att.transcriptionText || att.entryBody || "").trim();
            return (
              <View
                key={att.id}
                style={{
                  borderRadius: 14, overflow: "hidden",
                  backgroundColor: colors.surface,
                  borderWidth: 1, borderColor: colors.border,
                  padding: 14, gap: 10,
                }}
              >
                {/* Date + label */}
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <IconSymbol name="mic.fill" size={14} color={colors.primary} />
                    <Text style={{ fontSize: 12, fontWeight: "700", color: colors.primary }}>Voice Recording</Text>
                  </View>
                  <Text style={{ fontSize: 12, color: colors.muted }}>{niceDate(att.entryDate)}</Text>
                </View>
                {/* Audio player */}
                <AudioPlaybackRow
                  uri={att.uri}
                  duration={att.durationMs ? att.durationMs / 1000 : undefined}
                />
                {/* Transcript / text preview */}
                {transcript ? (
                  <View style={{
                    backgroundColor: colors.background,
                    borderRadius: 8, padding: 10,
                    borderLeftWidth: 3, borderLeftColor: colors.primary + "80",
                  }}>
                    <Text style={{ fontSize: 11, fontWeight: "600", color: colors.muted, marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.5 }}>
                      Transcript
                    </Text>
                    <Text style={{ fontSize: 13, color: colors.foreground, lineHeight: 19 }} numberOfLines={8}>
                      {transcript}
                    </Text>
                  </View>
                ) : null}
                {/* Entry title */}
                {att.entryTitle ? (
                  <Text style={{ fontSize: 13, color: colors.muted }} numberOfLines={1}>
                    From: “{att.entryTitle}”
                  </Text>
                ) : null}
              </View>
            );
          })}
        </View>
      ) : (
        // ── Rich card list for all / video ───────────────────────────────────────────
        <View style={{ gap: 12 }}>
          {filtered.map((att) => {
            const isPhoto = att.type === "photo";
            const isAudio = att.type === "audio";
            const isVideo = att.type === "video";
            // Text to preview: transcription first, then entry body
            const previewText = (att.transcriptionText || att.entryBody || "").trim();

            return (
              <Pressable
                key={att.id}
                onPress={() => isPhoto ? setExpandedPhoto(att) : undefined}
                style={({ pressed }) => [{
                  borderRadius: 14, overflow: "hidden",
                  backgroundColor: colors.surface,
                  borderWidth: 1, borderColor: colors.border,
                  opacity: (isPhoto && pressed) ? 0.85 : 1,
                }]}
              >
                {/* Photo thumbnail header — tappable */}
                {isPhoto && (
                  <Image
                    source={{ uri: att.uri }}
                    style={{ width: "100%", height: 200 }}
                    resizeMode="cover"
                  />
                )}

                <View style={{ padding: 12, gap: 8 }}>
                  {/* Date + type badge row */}
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                      <IconSymbol
                        name={isPhoto ? "photo.fill" : isAudio ? "mic.fill" : isVideo ? "video.fill" : "doc.fill"}
                        size={14} color={colors.primary}
                      />
                      <Text style={{ fontSize: 12, fontWeight: "700", color: colors.primary }}>
                        {isPhoto ? "Photo" : isAudio ? "Audio" : isVideo ? "Video" : "Document"}
                      </Text>
                    </View>
                    <Text style={{ fontSize: 12, color: colors.muted }}>{niceDate(att.entryDate)}</Text>
                  </View>

                  {/* Entry title if present */}
                  {att.entryTitle ? (
                    <Text style={{ fontSize: 15, fontWeight: "700", color: colors.foreground }} numberOfLines={1}>
                      {att.entryTitle}
                    </Text>
                  ) : null}

                  {/* Audio player */}
                  {isAudio && (
                    <AudioPlaybackRow
                      uri={att.uri}
                      duration={att.durationMs ? att.durationMs / 1000 : undefined}
                    />
                  )}

                  {/* Text preview — for audio: transcription or body; for photos: entry body */}
                  {previewText ? (
                    <View style={{
                      backgroundColor: colors.background,
                      borderRadius: 8, padding: 10,
                      borderLeftWidth: 3, borderLeftColor: colors.primary + "80",
                    }}>
                      <Text style={{ fontSize: 13, color: colors.foreground, lineHeight: 18 }} numberOfLines={4}>
                        {previewText}
                      </Text>
                    </View>
                  ) : null}

                  {/* Duration for audio/video */}
                  {(isAudio || isVideo) && att.durationMs ? (
                    <Text style={{ fontSize: 11, color: colors.muted }}>
                      Duration: {fmtDuration(att.durationMs / 1000)}
                    </Text>
                  ) : null}
                </View>
              </Pressable>
            );
          })}
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
// ─── TODAY'S HABITS SECTION ───────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════
function TodayHabitsSection({ colors, onAddJournalEntry }: { colors: any; onAddJournalEntry: () => void }) {
  const { habits, checkIns } = useApp();
  const todayStr = todayDateStr();

  // Filter habits that are scheduled for today
  const todayHabits = habits.filter((h) => {
    if (!h.isActive) return false;
    // frequencyType: 'weekly' (default) | 'monthly' — all show daily in this view
    return true;
  });

  // completedIds: set of habitIds that have a 'green' check-in today
  const completedIds = new Set(
    checkIns.filter((c) => c.date === todayStr && c.rating === 'green').map((c) => c.habitId)
  );
  const completedCount = todayHabits.filter((h) => completedIds.has(h.id)).length;
  const totalCount = todayHabits.length;

  return (
    <View style={{ gap: 12 }}>
      {/* Section header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <View>
          <Text style={{ fontSize: 20, fontWeight: '700', color: colors.foreground }}>
            {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </Text>
          <Text style={{ fontSize: 13, color: colors.muted, marginTop: 2 }}>
            {totalCount > 0 ? `${completedCount} of ${totalCount} habits done` : 'No habits scheduled today'}
          </Text>
        </View>
        <Pressable
          onPress={onAddJournalEntry}
          style={({ pressed }) => ({
            backgroundColor: colors.primary + '22',
            borderRadius: 10,
            padding: 8,
            opacity: pressed ? 0.7 : 1,
          })}
        >
          <IconSymbol name="pencil" size={18} color={colors.primary} />
        </Pressable>
      </View>

      {/* Progress bar */}
      {totalCount > 0 && (
        <View style={{ height: 6, backgroundColor: colors.border, borderRadius: 3, overflow: 'hidden' }}>
          <View style={{
            height: 6,
            width: `${Math.round((completedCount / totalCount) * 100)}%`,
            backgroundColor: completedCount === totalCount ? '#22C55E' : colors.primary,
            borderRadius: 3,
          }} />
        </View>
      )}

      {/* Habit rows */}
      {todayHabits.length === 0 ? (
        <View style={{ alignItems: 'center', paddingVertical: 32, gap: 8 }}>
          <IconSymbol name="checkmark.circle" size={40} color={colors.muted} />
          <Text style={{ color: colors.muted, fontSize: 15, textAlign: 'center' }}>No habits scheduled for today</Text>
        </View>
      ) : (
        todayHabits.map((habit) => {
          const done = completedIds.has(habit.id);
          return (
            <View
              key={habit.id}
              style={[{
                flexDirection: 'row', alignItems: 'center', gap: 12,
                backgroundColor: colors.surface,
                borderRadius: 14, padding: 14,
                borderWidth: 0.5, borderColor: done ? '#22C55E44' : colors.border,
              }]}
            >
              <View style={[{
                width: 32, height: 32, borderRadius: 16,
                alignItems: 'center', justifyContent: 'center',
                backgroundColor: done ? '#22C55E22' : colors.border + '55',
              }]}>
                <IconSymbol
                  name={done ? 'checkmark.circle.fill' : 'circle'}
                  size={22}
                  color={done ? '#22C55E' : colors.muted}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[
                  { fontSize: 15, fontWeight: '600', color: colors.foreground },
                  done && { textDecorationLine: 'line-through', color: colors.muted },
                ]}>
                  {habit.name}
                </Text>
                {habit.category && (
                  <Text style={{ fontSize: 12, color: colors.muted, marginTop: 2 }}>{habit.category}</Text>
                )}
              </View>
              {done && (
                <View style={{ backgroundColor: '#22C55E22', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: '#22C55E' }}>Done</Text>
                </View>
              )}
            </View>
          );
        })
      )}

      {/* Add journal note button */}
      <Pressable
        onPress={onAddJournalEntry}
        style={({ pressed }) => ({
          flexDirection: 'row', alignItems: 'center', gap: 10,
          backgroundColor: colors.surface,
          borderRadius: 14, padding: 14,
          borderWidth: 1, borderColor: colors.primary + '44',
          borderStyle: 'dashed',
          opacity: pressed ? 0.7 : 1,
          marginTop: 4,
        })}
      >
        <IconSymbol name="pencil" size={20} color={colors.primary} />
        <Text style={{ fontSize: 15, color: colors.primary, fontWeight: '600' }}>Add a journal note for today</Text>
      </Pressable>
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ─── MAIN JOURNAL SCREEN ──────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════
export default function JournalScreen() {
  const colors = useColors();
  const isCalm = useIsCalm();
  const params = useLocalSearchParams<{ tab?: string; action?: string }>();
  const [activeTab, setActiveTab] = useState<SubTab>(
    params.tab === 'calendar' ? 'journal' : 'habits'
  );
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [userId, setUserId] = useState("");
  const [loading, setLoading] = useState(true);
  const [editorVisible, setEditorVisible] = useState(false);
  const [editingEntry, setEditingEntry] = useState<JournalEntry | null>(null);
  const [editorDate, setEditorDate] = useState(todayDateStr());

  // ── Sticky stats bar ──────────────────────────────────────────────────────
  const statsBarAnim = useRef(new Animated.Value(1)).current;
  const lastScrollY = useRef(0);
  const statsBarVisible = useRef(true);

  function handleStatsScroll(e: { nativeEvent: { contentOffset: { y: number } } }) {
    const y = e.nativeEvent.contentOffset.y;
    const delta = y - lastScrollY.current;
    lastScrollY.current = y;
    if (delta > 5 && statsBarVisible.current) {
      statsBarVisible.current = false;
      Animated.timing(statsBarAnim, { toValue: 0, duration: 200, useNativeDriver: true }).start();
    } else if (delta < -5 && !statsBarVisible.current) {
      statsBarVisible.current = true;
      Animated.timing(statsBarAnim, { toValue: 1, duration: 200, useNativeDriver: true }).start();
    }
  }

  // ── Computed stats ────────────────────────────────────────────────────────
  const journalStats = useMemo(() => {
    const totalEntries = entries.length;
    const mediaCount = entries.reduce((n, e) => n + (e.attachments?.filter((a) => a.type === "photo" || a.type === "video").length ?? 0), 0);
    // Streak: consecutive days with at least one entry ending today or yesterday
    const dateSet = new Set(entries.map((e) => e.date));
    let streak = 0;
    const d = new Date();
    // Allow today or yesterday as streak anchor
    const todayStr = todayDateStr();
    const ystStr = (() => { const y = new Date(); y.setDate(y.getDate() - 1); return `${y.getFullYear()}-${String(y.getMonth()+1).padStart(2,"0")}-${String(y.getDate()).padStart(2,"0")}`; })();
    if (!dateSet.has(todayStr) && !dateSet.has(ystStr)) return { totalEntries, mediaCount, streak: 0 };
    const anchor = dateSet.has(todayStr) ? new Date() : new Date(ystStr + "T12:00:00");
    const check = new Date(anchor);
    while (true) {
      const s = `${check.getFullYear()}-${String(check.getMonth()+1).padStart(2,"0")}-${String(check.getDate()).padStart(2,"0")}`;
      if (!dateSet.has(s)) break;
      streak++;
      check.setDate(check.getDate() - 1);
    }
    return { totalEntries, mediaCount, streak };
  }, [entries]);

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

  // ── Day-view state ─────────────────────────────────────────────────────────
  const [selectedDate, setSelectedDate] = useState(todayDateStr());
  const [datePickerVisible, setDatePickerVisible] = useState(false);
  const pickerTempDate = useRef(selectedDate);
  const { habits, checkIns, categories } = useApp();

  const goDay = useCallback((delta: number) => {
    setSelectedDate((prev) => {
      const d = new Date(prev + 'T12:00:00');
      d.setDate(d.getDate() + delta);
      const next = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
      return next <= todayDateStr() ? next : prev;
    });
  }, []);

  const dayLabel = useMemo(() => {
    const today = todayDateStr();
    const yest = new Date(); yest.setDate(yest.getDate() - 1);
    const yesterdayStr = `${yest.getFullYear()}-${String(yest.getMonth()+1).padStart(2,'0')}-${String(yest.getDate()).padStart(2,'0')}`;
    if (selectedDate === today) return 'Today';
    if (selectedDate === yesterdayStr) return 'Yesterday';
    const d = new Date(selectedDate + 'T12:00:00');
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }, [selectedDate]);

  const dayEntries = useMemo(
    () => entries.filter((e) => e.date === selectedDate).sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()),
    [entries, selectedDate]
  );

  const dayCheckIns = useMemo(
    () => checkIns.filter((c) => c.date === selectedDate && c.rating !== 'none'),
    [checkIns, selectedDate]
  );

  const RATING_COLORS_DV: Record<string, string> = { green: '#22C55E', yellow: '#F59E0B', red: '#EF4444' };

  // ── Date wheel picker columns ───────────────────────────────────────────────
  const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const pickerMonthRef = useRef(0);
  const pickerDayRef = useRef(0);
  const pickerYearRef = useRef(0);

  function initPickerRefs(dateStr: string) {
    const d = new Date(dateStr + 'T12:00:00');
    pickerMonthRef.current = d.getMonth();
    pickerDayRef.current = d.getDate() - 1;
    pickerYearRef.current = 0; // only current year for now
  }

  const todayYear = new Date().getFullYear();
  const todayMonth = new Date().getMonth();
  const todayDay = new Date().getDate();

  function buildPickerDate(): string {
    const m = pickerMonthRef.current;
    const day = pickerDayRef.current + 1;
    const y = todayYear;
    return `${y}-${String(m+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
  }

  function getDaysInMonth(month: number): number {
    return new Date(todayYear, month + 1, 0).getDate();
  }

  const [pickerMonth, setPickerMonth] = useState(0);
  const [pickerDayCount, setPickerDayCount] = useState(31);

  return (
    <ScreenContainer containerClassName={isCalm ? 'bg-[#0D1135]' : undefined}>
      {/* ── Day-navigation header ── */}
      <View style={dvStyles.header}>
        <Pressable
          onPress={() => goDay(-1)}
          style={({ pressed }) => [dvStyles.navBtn, { opacity: pressed ? 0.5 : 1 }]}
        >
          <IconSymbol name="chevron.left" size={22} color={colors.foreground} />
        </Pressable>

        <Pressable
          onPress={() => {
            initPickerRefs(selectedDate);
            const d = new Date(selectedDate + 'T12:00:00');
            setPickerMonth(d.getMonth());
            setPickerDayCount(getDaysInMonth(d.getMonth()));
            setDatePickerVisible(true);
          }}
          style={({ pressed }) => [dvStyles.dayLabelBtn, { opacity: pressed ? 0.7 : 1 }]}
        >
          <Text style={[dvStyles.dayLabel, { color: colors.foreground }]}>{dayLabel}</Text>
          <IconSymbol name="chevron.down" size={14} color={colors.muted} style={{ marginLeft: 4, marginTop: 2 }} />
        </Pressable>

        <Pressable
          onPress={() => goDay(1)}
          disabled={selectedDate >= todayDateStr()}
          style={({ pressed }) => [dvStyles.navBtn, {
            opacity: selectedDate >= todayDateStr() ? 0.25 : pressed ? 0.5 : 1,
          }]}
        >
          <IconSymbol name="chevron.right" size={22} color={colors.foreground} />
        </Pressable>
      </View>

      {/* ── Day content ── */}
      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* ── Habit check-in card ── */}
          {dayCheckIns.length > 0 && (() => {
            const sortedCats = [...categories].sort((a, b) => a.order - b.order);
            return (
              <View style={[dvStyles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[dvStyles.cardTitle, { color: colors.muted }]}>HABITS</Text>
                {sortedCats.map((cat) => {
                  const catHabits = habits.filter((h) => h.isActive && h.category === cat.id);
                  const catCIs = dayCheckIns.filter((c) => catHabits.some((h) => h.id === c.habitId));
                  if (catCIs.length === 0) return null;
                  return (
                    <View key={cat.id} style={{ marginBottom: 8 }}>
                      <Text style={[dvStyles.catLabel, { color: colors.muted }]}>{cat.label.toUpperCase()}</Text>
                      {catHabits.map((habit) => {
                        const ci = dayCheckIns.find((c) => c.habitId === habit.id);
                        if (!ci) return null;
                        return (
                          <View key={habit.id} style={dvStyles.habitRow}>
                            <View style={[dvStyles.ratingDot, { backgroundColor: RATING_COLORS_DV[ci.rating] ?? colors.border }]} />
                            <Text style={[dvStyles.habitName, { color: colors.foreground, flex: 1 }]}>{habit.name}</Text>
                            <Text style={[dvStyles.ratingLabel, { color: RATING_COLORS_DV[ci.rating] ?? colors.muted }]}>
                              {ci.rating === 'green' ? 'Crushed' : ci.rating === 'yellow' ? 'Okay' : 'Missed'}
                            </Text>
                          </View>
                        );
                      })}
                    </View>
                  );
                })}
              </View>
            );
          })()}

          {/* ── Journal / voice entries ── */}
          {dayEntries.map((entry) => {
            const isVoice = !!(entry.tags?.includes('voice') || entry.template === 'free-write');
            const bodyText = entry.body || '';
            const gratIdx = bodyText.indexOf('\n\n🙏 Grateful for:');
            const mainBody = gratIdx >= 0 ? bodyText.slice(0, gratIdx).trim() : bodyText.trim();
            const gratSection = gratIdx >= 0 ? bodyText.slice(gratIdx).trim() : '';
            return (
              <Pressable
                key={entry.id}
                onPress={() => openEditEntry(entry)}
                style={({ pressed }) => [dvStyles.card, {
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                  opacity: pressed ? 0.85 : 1,
                }]}
              >
                <View style={dvStyles.entryHeader}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    {isVoice && <IconSymbol name="mic.fill" size={13} color={colors.primary} />}
                    <Text style={[dvStyles.entryTime, { color: colors.muted }]}>{formatTime(entry.createdAt)}</Text>
                  </View>
                  {!!entry.title && (
                    <Text style={[dvStyles.entryTitle, { color: colors.foreground }]}>{entry.title}</Text>
                  )}
                </View>
                {mainBody.length > 0 && (
                  <Text style={[dvStyles.entryBody, { color: colors.foreground }]} numberOfLines={10}>
                    {mainBody}
                  </Text>
                )}
                {gratSection.length > 0 && (
                  <View style={[dvStyles.gratBox, { backgroundColor: colors.background, borderColor: colors.border }]}>
                    <Text style={[dvStyles.gratText, { color: colors.muted }]}>{gratSection}</Text>
                  </View>
                )}
                {entry.attachments && entry.attachments.filter(a => a.type === 'audio').map((att, i) => (
                  <AudioPlaybackRow key={i} uri={att.uri} duration={att.durationMs ? att.durationMs / 1000 : undefined} />
                ))}
              </Pressable>
            );
          })}

          {/* ── Empty state ── */}
          {dayCheckIns.length === 0 && dayEntries.length === 0 && (
            <View style={dvStyles.emptyState}>
              <Text style={{ fontSize: 40, textAlign: 'center' }}>📋</Text>
              <Text style={[dvStyles.emptyTitle, { color: colors.foreground }]}>Nothing logged yet</Text>
              <Text style={[dvStyles.emptySubtitle, { color: colors.muted }]}>
                {selectedDate === todayDateStr()
                  ? 'Use Voice Log or Log Habits from the + button, or tap + to write an entry.'
                  : 'No entries were recorded for this day.'}
              </Text>
            </View>
          )}
        </ScrollView>
      )}

      {/* ── FAB ── */}
      <Pressable
        onPress={() => openNewEntry(selectedDate)}
        style={({ pressed }) => [{
          position: 'absolute', bottom: 24, right: 20,
          width: 56, height: 56, borderRadius: 28,
          backgroundColor: colors.primary,
          alignItems: 'center', justifyContent: 'center',
          shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.25, shadowRadius: 6, elevation: 6,
          opacity: pressed ? 0.8 : 1,
        }]}
      >
        <IconSymbol name="plus" size={28} color="#fff" />
      </Pressable>

      {/* ── Entry Editor Modal ── */}
      <EntryEditor
        visible={editorVisible}
        entry={editingEntry}
        initialDate={editorDate}
        onSave={handleSaveEntry}
        onClose={() => setEditorVisible(false)}
        colors={colors}
        userId={userId}
      />

      {/* ── Date Picker Bottom Sheet ── */}
      <Modal
        visible={datePickerVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setDatePickerVisible(false)}
      >
        <Pressable
          style={{ flex: 1, backgroundColor: '#00000066' }}
          onPress={() => setDatePickerVisible(false)}
        />
        <View style={[dvStyles.pickerSheet, { backgroundColor: colors.surface }]}>
          <View style={[dvStyles.pickerHeader, { borderBottomColor: colors.border }]}>
            <Pressable onPress={() => setDatePickerVisible(false)} style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}>
              <IconSymbol name="xmark" size={20} color={colors.muted} />
            </Pressable>
            <Text style={[dvStyles.pickerTitle, { color: colors.foreground }]}>Change Date</Text>
            <Pressable
              onPress={() => {
                const chosen = buildPickerDate();
                if (chosen <= todayDateStr()) setSelectedDate(chosen);
                setDatePickerVisible(false);
              }}
              style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}
            >
              <Text style={{ color: colors.primary, fontSize: 16, fontWeight: '600' }}>Done</Text>
            </Pressable>
          </View>
          <Pressable
            onPress={() => { setSelectedDate(todayDateStr()); setDatePickerVisible(false); }}
            style={({ pressed }) => [dvStyles.todayBtn, { opacity: pressed ? 0.7 : 1 }]}
          >
            <Text style={{ color: colors.primary, fontSize: 15, fontWeight: '600' }}>Today</Text>
          </Pressable>
          {/* Month / Day columns */}
          <View style={{ flexDirection: 'row', height: 144, paddingHorizontal: 16 }}>
            <WheelColumn
              items={MONTHS}
              initialIndex={new Date(selectedDate + 'T12:00:00').getMonth()}
              onSelect={(idx) => {
                pickerMonthRef.current = idx;
                setPickerMonth(idx);
                setPickerDayCount(getDaysInMonth(idx));
              }}
              width={180}
            />
            <WheelColumn
              key={`day-${pickerDayCount}`}
              items={Array.from({ length: pickerDayCount }, (_, i) => String(i + 1))}
              initialIndex={Math.min(pickerDayRef.current, pickerDayCount - 1)}
              onSelect={(idx) => { pickerDayRef.current = idx; }}
              width={80}
            />
          </View>
        </View>
      </Modal>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8 },
  headerTitle: { fontSize: 28, fontWeight: "700" },
  tabBar: { flexDirection: "row", borderBottomWidth: 0.5, paddingHorizontal: 8 },
  tabItem: { flex: 1, alignItems: "center", paddingVertical: 10, gap: 2 },
});

const journalStatStyles = StyleSheet.create({
  pill: {
    flex: 1, flexDirection: "row", alignItems: "center", gap: 5,
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, borderWidth: 0.5,
  },
  val: { fontSize: 15, fontWeight: "700" },
  lbl: { fontSize: 11, fontWeight: "500" },
});

const dvStyles = StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8,
  },
  navBtn: { padding: 10 },
  dayLabelBtn: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8 },
  dayLabel: { fontSize: 20, fontWeight: '700' },
  card: {
    borderRadius: 14, borderWidth: 0.5, padding: 14, marginBottom: 12,
  },
  cardTitle: { fontSize: 11, fontWeight: '700', letterSpacing: 0.8, marginBottom: 8 },
  catLabel: { fontSize: 10, fontWeight: '600', letterSpacing: 0.6, marginBottom: 4 },
  habitRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, gap: 10 },
  ratingDot: { width: 10, height: 10, borderRadius: 5 },
  habitName: { fontSize: 15, fontWeight: '500' },
  ratingLabel: { fontSize: 12, fontWeight: '600' },
  entryHeader: { marginBottom: 6 },
  entryTime: { fontSize: 12 },
  entryTitle: { fontSize: 16, fontWeight: '600', marginTop: 2 },
  entryBody: { fontSize: 15, lineHeight: 22 },
  gratBox: { borderRadius: 8, borderWidth: 0.5, padding: 10, marginTop: 8 },
  gratText: { fontSize: 13, lineHeight: 19 },
  emptyState: { alignItems: 'center', paddingTop: 60, gap: 12 },
  emptyTitle: { fontSize: 18, fontWeight: '600' },
  emptySubtitle: { fontSize: 14, textAlign: 'center', lineHeight: 20, paddingHorizontal: 24 },
  pickerSheet: {
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingBottom: 40,
  },
  pickerHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 0.5,
  },
  pickerTitle: { fontSize: 17, fontWeight: '600' },
  todayBtn: { alignSelf: 'center', paddingVertical: 10 },
});
