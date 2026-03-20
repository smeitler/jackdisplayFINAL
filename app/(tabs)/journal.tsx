import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  View, Text, ScrollView, Pressable, StyleSheet, Alert, Platform,
  TextInput, KeyboardAvoidingView, Animated, ActivityIndicator,
  Modal, FlatList, Dimensions, Image, useWindowDimensions, Keyboard,
} from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { CategoryIcon } from "@/components/category-icon";
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
import { getLastUserId, loadHabits, loadDayNotes, saveDayNotes, type Habit, type Rating } from "@/lib/storage";
import { useIsCalm } from "@/components/calm-effects";
import { WheelColumn } from "@/components/wheel-time-picker";
import Svg, { Path as SvgPath } from "react-native-svg";

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
  const [showAttachSheet, setShowAttachSheet] = useState(false);
  const [showMoreSheet, setShowMoreSheet] = useState(false);
  const [tagInput, setTagInput] = useState("");
  const [showTagInput, setShowTagInput] = useState(false);
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

  async function handleLaunchCamera() {
    setShowAttachSheet(false);
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== "granted") { Alert.alert("Camera permission required"); return; }
      const result = await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.85 });
      if (result.canceled) return;
      for (const asset of result.assets) {
        setAttachments((prev) => [...prev, { id: generateId(), type: "photo", uri: asset.uri, mimeType: asset.mimeType || "image/jpeg" }]);
      }
    } catch (e) { console.warn("Camera error:", e); }
  }

  async function handleLaunchVideo() {
    setShowAttachSheet(false);
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== "granted") { Alert.alert("Camera permission required"); return; }
      const result = await ImagePicker.launchCameraAsync({ mediaTypes: ["videos"], videoMaxDuration: 120, quality: 0.8 });
      if (result.canceled) return;
      for (const asset of result.assets) {
        setAttachments((prev) => [...prev, { id: generateId(), type: "video", uri: asset.uri, mimeType: asset.mimeType || "video/mp4", durationMs: asset.duration ? asset.duration * 1000 : undefined }]);
      }
    } catch (e) { console.warn("Video error:", e); }
  }

  function handleAddTag() {
    setShowAttachSheet(false);
    setShowTagInput(true);
  }

  function commitTag() {
    const t = tagInput.trim();
    if (!t) { setShowTagInput(false); return; }
    setAttachments((prev) => [...prev, { id: generateId(), type: "tag" as any, uri: "", mimeType: "text/plain", name: t }]);
    setTagInput("");
    setShowTagInput(false);
  }

  function handleScanText() {
    setShowMoreSheet(false);
    Alert.alert("Scan Text", "Point your camera at text to extract it.", [
      { text: "Open Camera", onPress: async () => {
        try {
          const { status } = await ImagePicker.requestCameraPermissionsAsync();
          if (status !== "granted") { Alert.alert("Camera permission required"); return; }
          const result = await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.9 });
          if (result.canceled) return;
          const asset = result.assets[0];
          setAttachments((prev) => [...prev, { id: generateId(), type: "photo", uri: asset.uri, mimeType: asset.mimeType || "image/jpeg", name: "Scanned text" }]);
        } catch {}
      }},
      { text: "Cancel", style: "cancel" },
    ]);
  }

  function handleScanToPDF() {
    setShowMoreSheet(false);
    Alert.alert("Scan to PDF", "Take a photo to attach as a scanned document.", [
      { text: "Open Camera", onPress: async () => {
        try {
          const { status } = await ImagePicker.requestCameraPermissionsAsync();
          if (status !== "granted") { Alert.alert("Camera permission required"); return; }
          const result = await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.95 });
          if (result.canceled) return;
          const asset = result.assets[0];
          setAttachments((prev) => [...prev, { id: generateId(), type: "photo", uri: asset.uri, mimeType: asset.mimeType || "image/jpeg", name: "Scanned document" }]);
        } catch {}
      }},
      { text: "Cancel", style: "cancel" },
    ]);
  }

  function handleDraw() {
    setShowMoreSheet(false);
    Alert.alert("Draw", "Drawing canvas coming soon.");
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

          {/* Tag input row — shown when user taps Tag */}
          {showTagInput && (
            <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 8, borderTopWidth: 0.5, borderTopColor: colors.border, backgroundColor: colors.background, gap: 10 }}>
              <IconSymbol name="tag" size={18} color={colors.primary} />
              <TextInput
                style={{ flex: 1, fontSize: 15, color: colors.foreground }}
                placeholder="Add a tag..."
                placeholderTextColor={colors.muted}
                value={tagInput}
                onChangeText={setTagInput}
                onSubmitEditing={commitTag}
                returnKeyType="done"
                autoFocus
              />
              <Pressable onPress={commitTag} style={({ pressed }) => [{ opacity: pressed ? 0.5 : 1 }]}>
                <Text style={{ color: colors.primary, fontWeight: "600", fontSize: 15 }}>Add</Text>
              </Pressable>
              <Pressable onPress={() => { setShowTagInput(false); setTagInput(""); }} style={({ pressed }) => [{ opacity: pressed ? 0.5 : 1 }]}>
                <IconSymbol name="xmark" size={16} color={colors.muted} />
              </Pressable>
            </View>
          )}

          {/* Bottom toolbar — ↓ dismiss | [MIC CENTER] | photo | paperclip */}
          <View style={[editorStyles.toolbar, { borderTopColor: colors.border, backgroundColor: colors.background }]}>
            {/* Left: keyboard dismiss */}
            <Pressable
              onPress={() => Keyboard.dismiss()}
              style={({ pressed }) => [{ opacity: pressed ? 0.5 : 1, padding: 4 }]}
            >
              <IconSymbol name="chevron.down" size={26} color={colors.muted} />
            </Pressable>

            {/* Center: mic */}
            <MicButton
              onRecordingComplete={handleRecordingComplete}
              colors={colors}
              templatePrompt={habitRecordPrompt}
            />

            {/* Right: photo + paperclip */}
            <View style={{ flexDirection: "row", gap: 18, alignItems: "center" }}>
              <Pressable onPress={handlePickPhoto} style={({ pressed }) => [{ opacity: pressed ? 0.5 : 1 }]}>
                <IconSymbol name="photo.fill" size={24} color={colors.muted} />
              </Pressable>
              <Pressable onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setShowAttachSheet(true); }} style={({ pressed }) => [{ opacity: pressed ? 0.5 : 1 }]}>
                <IconSymbol name="paperclip" size={24} color={colors.muted} />
              </Pressable>
            </View>
          </View>

          {/* Attachment action sheet */}
          <Modal visible={showAttachSheet} transparent animationType="slide" onRequestClose={() => setShowAttachSheet(false)}>
            <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.4)" }} onPress={() => setShowAttachSheet(false)} />
            <View style={{ backgroundColor: colors.background, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 34, paddingTop: 12 }}>
              <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: "center", marginBottom: 16 }} />
              {/* Main options */}
              {([
                { icon: "tag" as const, label: "Tag", onPress: handleAddTag },
                { icon: "mic.fill" as const, label: "Audio", onPress: () => { setShowAttachSheet(false); /* mic handled by MicButton in toolbar */ Alert.alert("Audio", "Use the mic button in the toolbar to record audio."); } },
                { icon: "camera.fill" as const, label: "Camera", onPress: handleLaunchCamera },
                { icon: "video.fill" as const, label: "Video", onPress: handleLaunchVideo },
              ] as const).map((item) => (
                <Pressable
                  key={item.label}
                  onPress={item.onPress}
                  style={({ pressed }) => [{ flexDirection: "row", alignItems: "center", gap: 16, paddingHorizontal: 24, paddingVertical: 16, opacity: pressed ? 0.6 : 1 }]}
                >
                  <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" }}>
                    <IconSymbol name={item.icon} size={20} color={colors.primary} />
                  </View>
                  <Text style={{ fontSize: 16, fontWeight: "500", color: colors.foreground }}>{item.label}</Text>
                </Pressable>
              ))}
              {/* More option */}
              <Pressable
                onPress={() => { setShowAttachSheet(false); setTimeout(() => setShowMoreSheet(true), 200); }}
                style={({ pressed }) => [{ flexDirection: "row", alignItems: "center", gap: 16, paddingHorizontal: 24, paddingVertical: 16, opacity: pressed ? 0.6 : 1 }]}
              >
                <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" }}>
                  <IconSymbol name="ellipsis" size={20} color={colors.primary} />
                </View>
                <Text style={{ fontSize: 16, fontWeight: "500", color: colors.foreground }}>More</Text>
              </Pressable>
            </View>
          </Modal>

          {/* More submenu sheet */}
          <Modal visible={showMoreSheet} transparent animationType="slide" onRequestClose={() => setShowMoreSheet(false)}>
            <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.4)" }} onPress={() => setShowMoreSheet(false)} />
            <View style={{ backgroundColor: colors.background, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 34, paddingTop: 12 }}>
              <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: "center", marginBottom: 16 }} />
              <Text style={{ fontSize: 13, fontWeight: "600", color: colors.muted, paddingHorizontal: 24, marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.8 }}>More Options</Text>
              {([
                { icon: "scribble" as const, label: "Draw", onPress: handleDraw },
                { icon: "doc.text.viewfinder" as const, label: "Scan to PDF", onPress: handleScanToPDF },
                { icon: "text.viewfinder" as const, label: "Scan Text", onPress: handleScanText },
                { icon: "doc.fill" as const, label: "Template", onPress: () => { setShowMoreSheet(false); setShowTemplates(true); } },
              ] as const).map((item) => (
                <Pressable
                  key={item.label}
                  onPress={item.onPress}
                  style={({ pressed }) => [{ flexDirection: "row", alignItems: "center", gap: 16, paddingHorizontal: 24, paddingVertical: 16, opacity: pressed ? 0.6 : 1 }]}
                >
                  <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" }}>
                    <IconSymbol name={item.icon} size={20} color={colors.primary} />
                  </View>
                  <Text style={{ fontSize: 16, fontWeight: "500", color: colors.foreground }}>{item.label}</Text>
                </Pressable>
              ))}
            </View>
          </Modal>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const editorStyles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 0.5 },
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
// ─── Calendar view for the journal calendar modal (matches home screen InlineCalendar) ────────────
const JC_MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
function jcGetMonthDays(year: number, month: number): number { return new Date(year, month, 0).getDate(); }
function jcGetFirstDay(year: number, month: number): number { return new Date(year, month - 1, 1).getDay(); }
function jcGenerateMonths(sy: number, sm: number, ey: number, em: number): { year: number; month: number }[] {
  const r: { year: number; month: number }[] = []; let y = sy; let m = sm;
  while (y < ey || (y === ey && m <= em)) { r.push({ year: y, month: m }); m++; if (m > 12) { m = 1; y++; } }
  return r;
}

function JournalCalendarView({ colors, onDayPress }: { colors: any; onDayPress?: (dateStr: string) => void }) {
  const [calEntries, setCalEntries] = useState<JournalEntry[]>([]);
  const { width: winWidth } = useWindowDimensions();

  useEffect(() => {
    (async () => {
      const uid = await getLastUserId();
      const loaded = await loadEntries(uid || 'default');
      setCalEntries(loaded);
    })();
  }, []);

  const today = new Date();
  const todayStr = todayDateStr();
  const months = useMemo(() => jcGenerateMonths(today.getFullYear() - 2, 1, today.getFullYear() + 1, 12), []);
  const todayMonthIndex = useMemo(() => {
    const y = today.getFullYear(); const m = today.getMonth() + 1;
    return months.findIndex((mo) => mo.year === y && mo.month === m);
  }, [months]);

  const entryMap = useMemo(() => {
    const map = new Map<string, JournalEntry[]>();
    for (const e of calEntries) { const list = map.get(e.date) ?? []; list.push(e); map.set(e.date, list); }
    return map;
  }, [calEntries]);

  const CELL_GAP = 3;
  const cellWidth = Math.floor(((winWidth > 0 ? winWidth : 390) - 40 - CELL_GAP * 6) / 7);
  const cellHeight = cellWidth;

  const scrollRef = useRef<ScrollView>(null);
  const [didScroll, setDidScroll] = useState(false);
  const monthOffsets = useRef<number[]>([]);

  useEffect(() => {
    if (!didScroll && todayMonthIndex >= 0 && monthOffsets.current[todayMonthIndex] != null) {
      scrollRef.current?.scrollTo({ y: monthOffsets.current[todayMonthIndex], animated: false });
      setDidScroll(true);
    }
  }, [didScroll, todayMonthIndex]);

  return (
    <ScrollView ref={scrollRef} showsVerticalScrollIndicator={false} style={{ maxHeight: 500 }} contentContainerStyle={{ paddingBottom: 20, paddingHorizontal: 16 }}>
      {months.map(({ year, month }, monthIndex) => {
        const daysInMonth = jcGetMonthDays(year, month);
        const firstDay = jcGetFirstDay(year, month);
        const cells: (number | null)[] = [];
        for (let i = 0; i < firstDay; i++) cells.push(null);
        for (let d = 1; d <= daysInMonth; d++) cells.push(d);
        while (cells.length % 7 !== 0) cells.push(null);
        const rows: (number | null)[][] = [];
        for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));
        return (
          <View key={`${year}-${month}`} onLayout={(e) => {
            monthOffsets.current[monthIndex] = e.nativeEvent.layout.y;
            if (monthIndex === todayMonthIndex && !didScroll) {
              scrollRef.current?.scrollTo({ y: e.nativeEvent.layout.y, animated: false });
              setDidScroll(true);
            }
          }} style={{ marginBottom: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6, paddingTop: 12, paddingBottom: 6 }}>
              <Text style={{ fontSize: 15, fontWeight: '700', color: colors.foreground }}>{JC_MONTH_NAMES[month - 1]}</Text>
              <Text style={{ fontSize: 12, fontWeight: '500', color: colors.muted }}>{year}</Text>
            </View>
            <View style={{ flexDirection: 'row', gap: CELL_GAP, marginBottom: CELL_GAP }}>
              {['S','M','T','W','T','F','S'].map((d, i) => (
                <View key={i} style={{ width: cellWidth, alignItems: 'center' }}>
                  <Text style={{ fontSize: 9, fontWeight: '600', color: colors.muted }}>{d}</Text>
                </View>
              ))}
            </View>
            {rows.map((row, rowIdx) => (
              <View key={rowIdx} style={{ flexDirection: 'row', gap: CELL_GAP, marginBottom: CELL_GAP }}>
                {row.map((day, colIdx) => {
                  if (day === null) return <View key={`e-${colIdx}`} style={{ width: cellWidth, height: cellHeight }} />;
                  const dateStr = `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
                  const dayEntries = entryMap.get(dateStr) || [];
                  const isToday = dateStr === todayStr;
                  const isFuture = dateStr > todayStr;
                  const hasEntries = dayEntries.length > 0;
                  let photoUri: string | null = null;
                  for (const de of dayEntries) {
                    const photo = de.attachments?.find((a) => a.type === 'photo');
                    if (photo) { photoUri = photo.uri; break; }
                  }
                  const bgColor = photoUri ? '#000' : hasEntries ? colors.primary : colors.surface;
                  const cellOpacity = isFuture ? 0.18 : photoUri ? 1 : hasEntries ? 0.75 : 0.22;
                  return (
                    <Pressable
                      key={day}
                      onPress={() => !isFuture && onDayPress?.(dateStr)}
                      style={({ pressed }) => ({
                        width: cellWidth, height: cellHeight, borderRadius: 4, overflow: 'hidden',
                        backgroundColor: bgColor, opacity: isFuture ? 0.18 : pressed ? 0.6 : cellOpacity,
                        borderWidth: isToday ? 1.5 : 0, borderColor: isToday ? colors.primary : 'transparent',
                      })}
                    >
                      {photoUri ? <Image source={{ uri: photoUri }} style={StyleSheet.absoluteFill} resizeMode="cover" /> : null}
                      <Text style={{ fontSize: 10, fontWeight: '700', lineHeight: 13, color: photoUri ? '#fff' : isToday ? colors.primary : colors.foreground, opacity: photoUri ? 0.9 : isFuture ? 0.4 : 0.85, paddingLeft: 3, paddingTop: 2 }}>{day}</Text>
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
// ─── RichTextEditor ────────────────────────────────────────────────────────────────────────────────────
// Single seamless TextInput — no title/body split.
// When focused: raw text is editable. When blurred: styled preview renders markdown visually.
// The first line is always displayed larger/bolder in preview mode.
// Bold/Italic markers (**text**, *text*) are only visible while editing; they render styled in preview.
function RichTextEditor({
  value,
  onChange,
  onSelectionChange,
  inputRef,
  bodySelection,
  keepFocused,
  colors,
}: {
  value: string;
  onChange: (text: string) => void;
  onSelectionChange: (sel: { start: number; end: number }) => void;
  inputRef: React.RefObject<any>;
  bodySelection?: { start: number; end: number };
  keepFocused?: boolean;
  colors: any;
}) {
  const [isFocused, setIsFocused] = React.useState(false);
  // When keepFocused is true (e.g. font sheet open), stay in edit mode so the
  // TextInput never unmounts and the selection ref is never reset.
  const showEditor = isFocused || keepFocused;

  const handleChangeText = React.useCallback((text: string) => {
    // Auto-continue bullet list when Enter is pressed on a bullet line
    if (text.length > value.length && text[text.length - 1] === '\n') {
      const beforeNewline = text.slice(0, text.length - 1);
      const lastNL = beforeNewline.lastIndexOf('\n');
      const prevLine = beforeNewline.slice(lastNL + 1);
      if (prevLine.startsWith('- ') && prevLine.length > 2) {
        onChange(text + '- ');
        return;
      }
      // Empty bullet line — remove the bullet and stop the list
      if (prevLine === '- ') {
        onChange(beforeNewline.slice(0, lastNL + 1) + '\n');
        return;
      }
    }
    onChange(text);
  }, [value, onChange]);

  // Render all lines with inline markdown styling for the preview
  const renderPreview = () => {
    if (!value) {
      return <Text style={{ fontSize: 17, lineHeight: 26, color: colors.muted }}>Write your entry...</Text>;
    }
    return value.split('\n').map((line, idx) => {
      const isFirstLine = idx === 0;
      const isBullet = line.startsWith('- ');
      const isHeading = line.startsWith('# ');
      const lineContent = isBullet ? line.slice(2) : isHeading ? line.slice(2) : line;
      const segments = parseInlineMarkdown(lineContent, colors);
      return (
        <View key={idx} style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: isFirstLine || isHeading ? 6 : 2 }}>
          {isBullet && (
            <Text style={{ fontSize: 16, lineHeight: 24, color: colors.foreground, marginRight: 6, marginTop: 1 }}>•</Text>
          )}
          <Text
            style={
              isFirstLine
                ? { fontSize: 20, fontWeight: '700', lineHeight: 28, color: colors.foreground, flex: 1 }
                : isHeading
                  ? { fontSize: 17, fontWeight: '700', lineHeight: 26, color: colors.foreground, flex: 1 }
                  : { fontSize: 16, lineHeight: 24, color: colors.foreground, flex: 1 }
            }
          >
            {segments}
          </Text>
        </View>
      );
    });
  };

  return (
    <View>
      {/* Single TextInput — always mounted so ref is always valid.
          In preview mode it is visually hidden (opacity 0, height 0) but NOT unmounted,
          so onChangeText never fires with stale/empty data. */}
      <TextInput
        ref={inputRef}
        value={value}
        onChangeText={handleChangeText}
        onSelectionChange={(e) => onSelectionChange(e.nativeEvent.selection)}
        selection={bodySelection}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        multiline
        placeholder="Write your entry..."
        placeholderTextColor={colors.muted}
        style={showEditor ? {
          fontSize: 16,
          lineHeight: 24,
          minHeight: 80,
          color: colors.foreground,
          textAlignVertical: 'top',
          padding: 0,
        } : {
          position: 'absolute',
          opacity: 0,
          height: 0,
          width: 0,
        }}
      />
      {/* Preview: rendered markdown, tappable to enter edit mode */}
      {!showEditor && (
        <Pressable
          onPress={() => {
            setIsFocused(true);
            setTimeout(() => inputRef.current?.focus(), 20);
          }}
          style={{ minHeight: 40 }}
        >
          {renderPreview()}
        </Pressable>
      )}
    </View>
  );
}

// Parse inline markdown (bold, italic) into React Native Text elements.
// Handles: **bold**, *italic*, ***bold+italic***, and plain text.
function parseInlineMarkdown(text: string, colors: any): React.ReactNode[] {
  if (!text) return [];
  const result: React.ReactNode[] = [];
  // Order matters: match ***text*** before **text** before *text*
  const regex = /\*\*\*([^*]+)\*\*\*|\*\*([^*]+)\*\*|\*([^*]+)\*|([^*]+)/g;
  let match;
  let key = 0;
  while ((match = regex.exec(text)) !== null) {
    if (match[1] !== undefined) {
      // Bold + Italic
      result.push(<Text key={key++} style={{ fontWeight: '700', fontStyle: 'italic', color: colors.foreground }}>{match[1]}</Text>);
    } else if (match[2] !== undefined) {
      // Bold
      result.push(<Text key={key++} style={{ fontWeight: '700', color: colors.foreground }}>{match[2]}</Text>);
    } else if (match[3] !== undefined) {
      // Italic
      result.push(<Text key={key++} style={{ fontStyle: 'italic', color: colors.foreground }}>{match[3]}</Text>);
    } else if (match[4] !== undefined) {
      // Plain
      result.push(<Text key={key++} style={{ color: colors.foreground }}>{match[4]}</Text>);
    }
  }
  return result.length > 0 ? result : [<Text key={0} style={{ color: colors.foreground }}>{text}</Text>];
}

// ─── DrawCanvas ────────────────────────────────────────────────────────────────────────────────────
function DrawCanvas({ colors }: { colors: any }) {
  const [paths, setPaths] = React.useState<{ points: { x: number; y: number }[]; color: string; width: number }[]>([]);
  const [currentPath, setCurrentPath] = React.useState<{ x: number; y: number }[]>([]);
  const [penColor, setPenColor] = React.useState('#000000');
  const [penWidth, setPenWidth] = React.useState(3);
  const isDrawing = React.useRef(false);

  const COLORS = ['#000000', '#EF4444', '#3B82F6', '#22C55E', '#F59E0B', '#8B5CF6', '#EC4899'];

  function pointsToPath(pts: { x: number; y: number }[]): string {
    if (pts.length < 2) return '';
    let d = `M ${pts[0].x} ${pts[0].y}`;
    for (let i = 1; i < pts.length; i++) d += ` L ${pts[i].x} ${pts[i].y}`;
    return d;
  }

  return (
    <View style={{ flex: 1 }}>
      <View
        style={{ flex: 1, backgroundColor: '#FAFAFA' }}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderGrant={(e) => {
          isDrawing.current = true;
          const { locationX: x, locationY: y } = e.nativeEvent;
          setCurrentPath([{ x, y }]);
        }}
        onResponderMove={(e) => {
          if (!isDrawing.current) return;
          const { locationX: x, locationY: y } = e.nativeEvent;
          setCurrentPath((prev) => [...prev, { x, y }]);
        }}
        onResponderRelease={() => {
          isDrawing.current = false;
          if (currentPath.length > 1) {
            setPaths((prev) => [...prev, { points: currentPath, color: penColor, width: penWidth }]);
          }
          setCurrentPath([]);
        }}
      >
        <Svg style={StyleSheet.absoluteFillObject}>
          {paths.map((p, i) => (
            <SvgPath key={i} d={pointsToPath(p.points)} stroke={p.color} strokeWidth={p.width} fill="none" strokeLinecap="round" strokeLinejoin="round" />
          ))}
          {currentPath.length > 1 && (
            <SvgPath d={pointsToPath(currentPath)} stroke={penColor} strokeWidth={penWidth} fill="none" strokeLinecap="round" strokeLinejoin="round" />
          )}
        </Svg>
      </View>
      {/* Toolbar */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, backgroundColor: colors.background }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
            {COLORS.map((c) => (
              <Pressable
                key={c}
                onPress={() => setPenColor(c)}
                style={[{ width: 28, height: 28, borderRadius: 14, backgroundColor: c }, penColor === c && { borderWidth: 3, borderColor: colors.primary }]}
              />
            ))}
          </View>
        </ScrollView>
        <View style={{ flexDirection: 'row', gap: 12, marginLeft: 12 }}>
          {[2, 4, 8].map((w) => (
            <Pressable
              key={w}
              onPress={() => setPenWidth(w)}
              style={[{ width: 36, height: 36, borderRadius: 8, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' }, penWidth === w && { backgroundColor: colors.primary + '33' }]}
            >
              <View style={{ width: w * 2, height: w * 2, borderRadius: w, backgroundColor: penColor }} />
            </Pressable>
          ))}
          <Pressable
            onPress={() => { setPaths([]); setCurrentPath([]); }}
            style={({ pressed }) => [{ width: 36, height: 36, borderRadius: 8, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.6 : 1 }]}
          >
            <IconSymbol name="trash" size={18} color={colors.error} />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

// ─── FullScreenJournalEditor ─────────────────────────────────────────────────────────────────────────────────────────────────────
interface FullScreenJournalEditorProps {
  visible: boolean;
  value: string;
  onChange: (text: string) => void;
  onClose: () => void;
  onPickPhoto: () => void;
  onPickCamera: () => void;
  colors: any;
}
function FullScreenJournalEditor({
  visible, value, onChange, onClose, onPickPhoto, onPickCamera, colors,
}: FullScreenJournalEditorProps) {
  // Read insets fresh INSIDE the modal so they are correct on all platforms
  const modalInsets = useSafeAreaInsets();
  const inputRef = useRef<TextInput>(null);
  const selectionRef = useRef<{ start: number; end: number }>({ start: 0, end: 0 });
  const preFmtSel = useRef<{ start: number; end: number }>({ start: 0, end: 0 });
  const [bodySelection, setBodySelection] = useState<{ start: number; end: number } | undefined>(undefined);
  const [showFmtSheet, setShowFmtSheet] = useState(false);
  const [activeStyle, setActiveStyle] = useState<'title' | 'heading' | 'subheading' | 'body'>('body');
  const fmtSheetAnim = useRef(new Animated.Value(360)).current;

  const openFmtSheet = useCallback(() => {
    // Snapshot selection before any blur can happen
    preFmtSel.current = { ...selectionRef.current };
    setShowFmtSheet(true);
    Animated.timing(fmtSheetAnim, { toValue: 0, duration: 240, useNativeDriver: true }).start();
  }, [fmtSheetAnim]);

  const closeFmtSheet = useCallback(() => {
    Animated.timing(fmtSheetAnim, { toValue: 360, duration: 200, useNativeDriver: true }).start(() =>
      setShowFmtSheet(false)
    );
  }, [fmtSheetAnim]);

  useEffect(() => {
    if (visible) setTimeout(() => inputRef.current?.focus(), 120);
  }, [visible]);

  const applyInlineFormat = useCallback((type: 'bold' | 'italic' | 'underline' | 'strikethrough') => {
    const markers: Record<string, string> = { bold: '**', italic: '*', underline: '__', strikethrough: '~~' };
    const m = markers[type];
    const { start, end } = preFmtSel.current;
    const s = Math.min(start, end);
    const e2 = Math.max(start, end);
    const selected = value.slice(s, e2);
    const before = value.slice(0, s);
    const after = value.slice(e2);
    let newText: string;
    let newCursor: number;
    if (selected.startsWith(m) && selected.endsWith(m) && selected.length > m.length * 2) {
      const inner = selected.slice(m.length, selected.length - m.length);
      newText = before + inner + after;
      newCursor = s + inner.length;
    } else if (s === e2) {
      newText = before + m + m + after;
      newCursor = s + m.length;
    } else {
      newText = before + m + selected + m + after;
      newCursor = s + m.length + selected.length + m.length;
    }
    onChange(newText);
    setBodySelection({ start: newCursor, end: newCursor });
    closeFmtSheet();
    setTimeout(() => { inputRef.current?.focus(); setTimeout(() => setBodySelection(undefined), 80); }, 30);
  }, [value, onChange, closeFmtSheet]);

  const applyParagraphStyle = useCallback((style: 'title' | 'heading' | 'subheading' | 'body') => {
    const pos = preFmtSel.current.start;
    const lineStart = value.lastIndexOf('\n', pos - 1) + 1;
    const lineEnd = value.indexOf('\n', pos);
    const end = lineEnd === -1 ? value.length : lineEnd;
    const line = value.slice(lineStart, end);
    const stripped = line.replace(/^(# |## |### )/, '');
    const prefix: Record<string, string> = { title: '# ', heading: '## ', subheading: '### ', body: '' };
    const newText = value.slice(0, lineStart) + prefix[style] + stripped + value.slice(end);
    onChange(newText);
    setActiveStyle(style);
    closeFmtSheet();
    setTimeout(() => { inputRef.current?.focus(); }, 30);
  }, [value, onChange, closeFmtSheet]);

  const insertBullet = useCallback(() => {
    const pos = preFmtSel.current.start;
    const lineStart = value.lastIndexOf('\n', pos - 1) + 1;
    const line = value.slice(lineStart, pos);
    let newText: string; let newCursor: number;
    if (line.startsWith('- ')) {
      newText = value.slice(0, lineStart) + value.slice(lineStart + 2);
      newCursor = pos - 2;
    } else {
      newText = value.slice(0, lineStart) + '- ' + value.slice(lineStart);
      newCursor = pos + 2;
    }
    onChange(newText);
    setBodySelection({ start: newCursor, end: newCursor });
    closeFmtSheet();
    setTimeout(() => { inputRef.current?.focus(); setTimeout(() => setBodySelection(undefined), 80); }, 30);
  }, [value, onChange, closeFmtSheet]);

  const insertNumbered = useCallback(() => {
    const pos = preFmtSel.current.start;
    const lineStart = value.lastIndexOf('\n', pos - 1) + 1;
    const newText = value.slice(0, lineStart) + '1. ' + value.slice(lineStart);
    const newCursor = pos + 3;
    onChange(newText);
    setBodySelection({ start: newCursor, end: newCursor });
    closeFmtSheet();
    setTimeout(() => { inputRef.current?.focus(); setTimeout(() => setBodySelection(undefined), 80); }, 30);
  }, [value, onChange, closeFmtSheet]);

  const handleChangeText = useCallback((text: string) => {
    if (text.length > value.length && text[text.length - 1] === '\n') {
      const beforeNL = text.slice(0, text.length - 1);
      const lastNL = beforeNL.lastIndexOf('\n');
      const prevLine = beforeNL.slice(lastNL + 1);
      if (prevLine.startsWith('- ') && prevLine.length > 2) { onChange(text + '- '); return; }
      if (prevLine === '- ') { onChange(beforeNL.slice(0, lastNL + 1) + '\n'); return; }
      const nm = prevLine.match(/^(\d+)\. (.+)/);
      if (nm) { onChange(text + `${parseInt(nm[1], 10) + 1}. `); return; }
      if (/^\d+\. $/.test(prevLine)) { onChange(beforeNL.slice(0, lastNL + 1) + '\n'); return; }
    }
    onChange(text);
  }, [value, onChange]);

  // ── Visual rich-text renderer ──────────────────────────────────────────
  // Parses markdown-lite syntax into styled React Native Text spans.
  // Supports: # Heading, ## Heading2, ### Heading3, - bullet, 1. numbered,
  //           **bold**, *italic*, __underline__, ~~strikethrough~~, ☐ checklist
  const renderRichText = useCallback((raw: string) => {
    if (!raw) return null;
    const lines = raw.split('\n');
    return lines.map((line, lineIdx) => {
      // Determine line-level style
      let lineStyle: any = { fontSize: 17, lineHeight: 26, color: '#ffffff', marginBottom: 2 };
      let displayLine = line;
      let prefix: React.ReactNode = null;

      if (/^# /.test(line)) {
        displayLine = line.slice(2);
        lineStyle = { fontSize: 28, lineHeight: 36, fontWeight: '800' as const, color: '#ffffff', marginBottom: 4 };
      } else if (/^## /.test(line)) {
        displayLine = line.slice(3);
        lineStyle = { fontSize: 22, lineHeight: 30, fontWeight: '700' as const, color: '#ffffff', marginBottom: 3 };
      } else if (/^### /.test(line)) {
        displayLine = line.slice(4);
        lineStyle = { fontSize: 18, lineHeight: 26, fontWeight: '600' as const, color: '#ffffff', marginBottom: 2 };
      } else if (/^- /.test(line)) {
        displayLine = line.slice(2);
        prefix = <Text style={{ color: '#ffffff', fontSize: 17 }}>{'•  '}</Text>;
      } else if (/^\d+\. /.test(line)) {
        const m = line.match(/^(\d+)\. (.*)/);
        if (m) { displayLine = m[2]; prefix = <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 17 }}>{m[1] + '.  '}</Text>; }
      } else if (/^☐ /.test(line)) {
        displayLine = line.slice(2);
        prefix = <Text style={{ color: '#F5A623', fontSize: 17 }}>{'☐  '}</Text>;
      } else if (/^☑ /.test(line)) {
        displayLine = line.slice(2);
        prefix = <Text style={{ color: '#22C55E', fontSize: 17 }}>{'☑  '}</Text>;
        lineStyle = { ...lineStyle, textDecorationLine: 'line-through', color: 'rgba(255,255,255,0.4)' };
      }

      // Parse inline spans: **bold**, *italic*, __underline__, ~~strikethrough~~
      const parseInline = (text: string): React.ReactNode[] => {
        const parts: React.ReactNode[] = [];
        // Combined regex for all inline markers
        const regex = /(\*\*[^*]+\*\*|\*[^*]+\*|__[^_]+__|~~[^~]+~~)/g;
        let last = 0;
        let match: RegExpExecArray | null;
        let key = 0;
        while ((match = regex.exec(text)) !== null) {
          if (match.index > last) parts.push(<Text key={key++}>{text.slice(last, match.index)}</Text>);
          const token = match[0];
          if (token.startsWith('**')) {
            parts.push(<Text key={key++} style={{ fontWeight: '800' as const }}>{token.slice(2, -2)}</Text>);
          } else if (token.startsWith('~~')) {
            parts.push(<Text key={key++} style={{ textDecorationLine: 'line-through' as const }}>{token.slice(2, -2)}</Text>);
          } else if (token.startsWith('__')) {
            parts.push(<Text key={key++} style={{ textDecorationLine: 'underline' as const }}>{token.slice(2, -2)}</Text>);
          } else if (token.startsWith('*')) {
            parts.push(<Text key={key++} style={{ fontStyle: 'italic' as const }}>{token.slice(1, -1)}</Text>);
          }
          last = match.index + token.length;
        }
        if (last < text.length) parts.push(<Text key={key++}>{text.slice(last)}</Text>);
        return parts.length > 0 ? parts : [<Text key={0}>{text}</Text>];
      };

      return (
        <Text key={lineIdx} style={[lineStyle, { flexWrap: 'wrap' }]}>
          {prefix}
          {parseInline(displayLine)}
          {lineIdx < lines.length - 1 ? '' : ''}
        </Text>
      );
    });
  }, []);

  if (!visible) return null;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: '#000000' }}>
        {/* Status bar spacer */}
        <View style={{ height: Math.max(modalInsets.top, 44) }} />
        {/* Top navigation bar */}
        <View style={fsStyles.topBar}>
          <Pressable onPress={onClose} style={({ pressed }) => [fsStyles.topBarBtn, { opacity: pressed ? 0.6 : 1 }]}>
            <IconSymbol name="chevron.left" size={22} color="#ffffff" />
          </Pressable>
          <View style={{ flex: 1 }} />
          <Pressable style={({ pressed }) => [fsStyles.topBarBtn, { opacity: pressed ? 0.6 : 1 }]}>
            <IconSymbol name="arrow.uturn.backward" size={20} color="#ffffff" />
          </Pressable>
          <View style={fsStyles.topBarGroup}>
            <Pressable style={({ pressed }) => [fsStyles.topBarGroupBtn, { opacity: pressed ? 0.6 : 1 }]}>
              <IconSymbol name="square.and.arrow.up" size={20} color="#ffffff" />
            </Pressable>
            <View style={fsStyles.topBarDivider} />
            <Pressable style={({ pressed }) => [fsStyles.topBarGroupBtn, { opacity: pressed ? 0.6 : 1 }]}>
              <IconSymbol name="ellipsis" size={20} color="#ffffff" />
            </Pressable>
          </View>
          <Pressable onPress={onClose} style={({ pressed }) => [fsStyles.checkBtn, { opacity: pressed ? 0.8 : 1 }]}>
            <IconSymbol name="checkmark" size={20} color="#000000" />
          </Pressable>
        </View>
        {/* Editor + keyboard toolbar */}
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={0}
        >
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ padding: 20, paddingBottom: 120 }}
            keyboardShouldPersistTaps="handled"
          >
            {/* Rich-text overlay approach:
                - Rendered Text block shows styled output (bold/italic/headings)
                - Transparent TextInput sits on top, captures all input
                Both are absolutely positioned in the same container so they overlap exactly */}
            <View style={{ minHeight: 400 }}>
              {/* Visual render layer — pointerEvents='none' so taps pass through to TextInput */}
              <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0 }}>
                {value ? (
                  <View style={{ gap: 0 }}>{renderRichText(value)}</View>
                ) : (
                  <Text style={{ fontSize: 17, lineHeight: 26, color: 'rgba(255,255,255,0.3)' }}>Start writing...</Text>
                )}
              </View>
              {/* Transparent input layer — captures keystrokes, invisible text */}
              <TextInput
                ref={inputRef}
                value={value}
                onChangeText={handleChangeText}
                onSelectionChange={(e) => { selectionRef.current = e.nativeEvent.selection; }}
                selection={bodySelection}
                multiline
                placeholder=""
                style={[
                  fsStyles.textInput,
                  {
                    color: 'transparent',
                    // On web, also hide the caret color so it doesn't show through
                    ...(Platform.OS === 'web' ? { caretColor: '#ffffff' } as any : {}),
                  }
                ]}
                autoFocus
                textAlignVertical="top"
              />
            </View>
          </ScrollView>

          {/* Format sheet — sits ABOVE the toolbar, inside KeyboardAvoidingView so it moves with keyboard */}
          {showFmtSheet && (
            <View style={fsStyles.fmtSheetContainer}>
              {/* Handle */}
              <View style={{ alignItems: 'center', paddingTop: 10, paddingBottom: 4 }}>
                <View style={fsStyles.handle} />
              </View>
              {/* Header */}
              <View style={fsStyles.fmtHeader}>
                <Text style={fsStyles.fmtTitle}>Format</Text>
                <Pressable onPress={closeFmtSheet} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1, padding: 4 })}>
                  <IconSymbol name="xmark" size={20} color="rgba(255,255,255,0.6)" />
                </Pressable>
              </View>
              {/* Paragraph style pills */}
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 8, paddingBottom: 12 }}>
                {(['title', 'heading', 'subheading', 'body'] as const).map((style) => (
                  <Pressable
                    key={style}
                    onPress={() => applyParagraphStyle(style)}
                    style={({ pressed }) => [fsStyles.stylePill, activeStyle === style && fsStyles.stylePillActive, { opacity: pressed ? 0.7 : 1 }]}
                  >
                    <Text style={[fsStyles.stylePillText, activeStyle === style && fsStyles.stylePillTextActive,
                      style === 'title' ? { fontSize: 18, fontWeight: '700' } :
                      style === 'heading' ? { fontSize: 16, fontWeight: '700' } :
                      style === 'subheading' ? { fontSize: 14, fontWeight: '600' } :
                      { fontSize: 13 }
                    ]}>
                      {style.charAt(0).toUpperCase() + style.slice(1)}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
              {/* Inline format row: B I U S */}
              <View style={fsStyles.fmtRow}>
                {([
                  { type: 'bold' as const, label: 'B', extra: { fontWeight: '900' as const } },
                  { type: 'italic' as const, label: 'I', extra: { fontStyle: 'italic' as const } },
                  { type: 'underline' as const, label: 'U', extra: { textDecorationLine: 'underline' as const } },
                  { type: 'strikethrough' as const, label: 'S', extra: { textDecorationLine: 'line-through' as const } },
                ]).map(({ type, label, extra }) => (
                  <Pressable key={type} onPress={() => applyInlineFormat(type)} style={({ pressed }) => [fsStyles.fmtBtn, { opacity: pressed ? 0.6 : 1 }]}>
                    <Text style={[fsStyles.fmtBtnText, extra]}>{label}</Text>
                  </Pressable>
                ))}
                <Pressable style={({ pressed }) => [fsStyles.fmtBtn, { opacity: pressed ? 0.6 : 1 }]}>
                  <IconSymbol name="pencil" size={20} color="rgba(255,255,255,0.8)" />
                </Pressable>
                <Pressable style={({ pressed }) => [fsStyles.fmtBtn, { opacity: pressed ? 0.6 : 1 }]}>
                  <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: '#F5A623' }} />
                </Pressable>
              </View>
              {/* List / indent row */}
              <View style={[fsStyles.fmtRow, { paddingBottom: 12 }]}>
                <Pressable onPress={insertBullet} style={({ pressed }) => [fsStyles.fmtBtn, { opacity: pressed ? 0.6 : 1 }]}>
                  <IconSymbol name="list.bullet.indent" size={20} color="rgba(255,255,255,0.8)" />
                </Pressable>
                <Pressable onPress={insertNumbered} style={({ pressed }) => [fsStyles.fmtBtn, { opacity: pressed ? 0.6 : 1 }]}>
                  <IconSymbol name="list.number" size={20} color="rgba(255,255,255,0.8)" />
                </Pressable>
                <Pressable style={({ pressed }) => [fsStyles.fmtBtn, { opacity: pressed ? 0.6 : 1 }]}>
                  <IconSymbol name="text.alignleft" size={20} color="rgba(255,255,255,0.8)" />
                </Pressable>
                <Pressable style={({ pressed }) => [fsStyles.fmtBtn, { opacity: pressed ? 0.6 : 1 }]}>
                  <IconSymbol name="increase.indent" size={20} color="rgba(255,255,255,0.8)" />
                </Pressable>
                <Pressable style={({ pressed }) => [fsStyles.fmtBtn, { opacity: pressed ? 0.6 : 1 }]}>
                  <IconSymbol name="decrease.indent" size={20} color="rgba(255,255,255,0.8)" />
                </Pressable>
              </View>
            </View>
          )}

          {/* Keyboard accessory toolbar */}
          <View style={[fsStyles.toolbar, { paddingBottom: 10 + modalInsets.bottom }]}>
            {/* Aa — Toggle format sheet */}
            <Pressable
              onPress={() => {
                preFmtSel.current = { ...selectionRef.current };
                if (showFmtSheet) closeFmtSheet(); else openFmtSheet();
              }}
              style={({ pressed }) => [fsStyles.toolbarBtn, showFmtSheet && fsStyles.toolbarBtnActive, { opacity: pressed ? 0.6 : 1 }]}
            >
              <Text style={fsStyles.aaText}>Aa</Text>
            </Pressable>
            {/* Checklist */}
            <Pressable
              onPress={() => {
                preFmtSel.current = { ...selectionRef.current };
                const pos = preFmtSel.current.start;
                const lineStart = value.lastIndexOf('\n', pos - 1) + 1;
                onChange(value.slice(0, lineStart) + '☐ ' + value.slice(lineStart));
                setTimeout(() => inputRef.current?.focus(), 30);
              }}
              style={({ pressed }) => [fsStyles.toolbarBtn, { opacity: pressed ? 0.6 : 1 }]}
            >
              <IconSymbol name="checklist" size={22} color="rgba(255,255,255,0.8)" />
            </Pressable>
            {/* Table */}
            <Pressable style={({ pressed }) => [fsStyles.toolbarBtn, { opacity: pressed ? 0.6 : 1 }]}>
              <IconSymbol name="table.fill" size={22} color="rgba(255,255,255,0.8)" />
            </Pressable>
            {/* Paperclip — photo library */}
            <Pressable onPress={onPickPhoto} style={({ pressed }) => [fsStyles.toolbarBtn, { opacity: pressed ? 0.6 : 1 }]}>
              <IconSymbol name="paperclip" size={22} color="rgba(255,255,255,0.8)" />
            </Pressable>
            {/* Location */}
            <Pressable style={({ pressed }) => [fsStyles.toolbarBtn, { opacity: pressed ? 0.6 : 1 }]}>
              <IconSymbol name="location.circle.fill" size={22} color="rgba(255,255,255,0.8)" />
            </Pressable>
            {/* Magic / AI */}
            <Pressable style={({ pressed }) => [fsStyles.toolbarBtn, { opacity: pressed ? 0.6 : 1 }]}>
              <IconSymbol name="wand.and.stars" size={22} color="rgba(255,255,255,0.8)" />
            </Pressable>
            <View style={{ flex: 1 }} />
            {/* Camera */}
            <Pressable onPress={onPickCamera} style={({ pressed }) => [fsStyles.toolbarBtn, { opacity: pressed ? 0.6 : 1 }]}>
              <IconSymbol name="camera.fill" size={22} color="rgba(255,255,255,0.8)" />
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const fsStyles = StyleSheet.create({
  topBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, gap: 8 },
  topBarBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' },
  topBarGroup: { flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 20, overflow: 'hidden' },
  topBarGroupBtn: { paddingHorizontal: 12, paddingVertical: 10 },
  topBarDivider: { width: 0.5, backgroundColor: 'rgba(255,255,255,0.2)', marginVertical: 8 },
  checkBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#F5A623', alignItems: 'center', justifyContent: 'center' },
  textInput: { fontSize: 17, lineHeight: 26, color: '#ffffff', textAlignVertical: 'top', minHeight: 400, padding: 0, ...(Platform.OS === 'web' ? { outlineWidth: 0, outlineStyle: 'none' } as any : {}) },
  toolbar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, backgroundColor: 'rgba(28,28,30,0.98)', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(255,255,255,0.15)', gap: 4 },
  toolbarBtn: { width: 44, height: 36, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  toolbarBtnActive: { backgroundColor: 'rgba(255,255,255,0.2)' },
  aaText: { fontSize: 15, fontWeight: '700', color: '#ffffff', letterSpacing: -0.5 },
  fmtSheet: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: '#1c1c1e', borderTopLeftRadius: 16, borderTopRightRadius: 16, shadowColor: '#000', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.4, shadowRadius: 12 },
  fmtSheetContainer: { backgroundColor: '#1c1c1e', borderTopLeftRadius: 16, borderTopRightRadius: 16, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(255,255,255,0.15)', shadowColor: '#000', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.4, shadowRadius: 12 },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.3)' },
  fmtHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8 },
  fmtTitle: { fontSize: 17, fontWeight: '600', color: '#ffffff', flex: 1 },
  stylePill: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.12)' },
  stylePillActive: { backgroundColor: '#F5A623' },
  stylePillText: { color: '#ffffff' },
  stylePillTextActive: { color: '#000000' },
  fmtRow: { flexDirection: 'row', paddingHorizontal: 16, gap: 8, paddingBottom: 12 },
  fmtBtn: { width: 52, height: 44, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' },
  fmtBtnText: { fontSize: 18, color: '#ffffff' },
});

export default function JournalScreen() {
  const colors = useColors();
  const isCalm = useIsCalm();
  const insets = useSafeAreaInsets();
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
  const { habits, checkIns, categories, submitCheckIn, streak } = useApp();
  const [calendarModalVisible, setCalendarModalVisible] = useState(false);
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
  const RATINGS_DV: Array<Rating> = ['red','yellow','green'];
  // Editable ratings map: habitId -> rating (mirrors dayCheckIns but editable)
  const [dvRatings, setDvRatings] = useState<Record<string, Rating>>({});
  // Editable entry bodies: entryId -> body text
  const [dvBodies, setDvBodies] = useState<Record<string, string>>({});
  // Per-habit notes: habitId -> note string (stored in DayNotes as habitId:date)
  const [dvHabitNotes, setDvHabitNotes] = useState<Record<string, string>>({});
  const dvHabitNotesRef = useRef<Record<string, string>>({});
  const habitNoteTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  // Sync dvRatings when dayCheckIns changes
  useEffect(() => {
    const map: Record<string, Rating> = {};
    dayCheckIns.forEach((ci) => { if (ci.rating !== 'none') map[ci.habitId] = ci.rating as Rating; });
    setDvRatings(map);
  }, [dayCheckIns]);
  // Load habit notes for the selected date
  useEffect(() => {
    (async () => {
      const allNotes = await loadDayNotes();
      const dayNotes: Record<string, string> = {};
      Object.keys(allNotes).forEach((key) => {
        const [hId, d] = key.split(':');
        if (d === selectedDate) dayNotes[hId] = allNotes[key];
      });
      dvHabitNotesRef.current = dayNotes;
      setDvHabitNotes(dayNotes);
    })();
  }, [selectedDate]);
  const saveDvHabitNote = useCallback((habitId: string, note: string) => {
    // Update local state immediately
    const updated = { ...dvHabitNotesRef.current, [habitId]: note };
    dvHabitNotesRef.current = updated;
    setDvHabitNotes(updated);
    // Debounce the AsyncStorage write
    if (habitNoteTimers.current[habitId]) clearTimeout(habitNoteTimers.current[habitId]);
    habitNoteTimers.current[habitId] = setTimeout(async () => {
      const allNotes = await loadDayNotes();
      allNotes[`${habitId}:${selectedDate}`] = note;
      await saveDayNotes(allNotes);
    }, 600);
  }, [selectedDate]);
  // Sync dvBodies when dayEntries changes
  useEffect(() => {
    const map: Record<string, string> = {};
    dayEntries.forEach((e) => { map[e.id] = e.body || ''; });
    setDvBodies(map);
  }, [dayEntries]);
  const saveDvRating = useCallback(async (habitId: string, rating: Rating) => {
    const newMap = { ...dvRatings, [habitId]: rating };
    setDvRatings(newMap);
    await submitCheckIn(selectedDate, newMap);
  }, [dvRatings, selectedDate, submitCheckIn]);
  const saveDvBody = useCallback(async (entryId: string, body: string) => {
    if (!userId) return;
    await updateEntryInStore(userId, entryId, { body });
    setEntries((prev) => prev.map((e) => e.id === entryId ? { ...e, body } : e));
  }, [userId]);

  // ── Always-visible journal note + gratitude fields ─────────────────────────
  // These represent the "primary" entry for the day (or a new one to be created)
  const [dvJournalNote, setDvJournalNote] = useState('');
  // TextInput ref and cursor/selection tracking for formatting
  const dvTextInputRef = useRef<any>(null);
  // dvSelection stores the LAST known selection — always updated on onSelectionChange.
  const dvSelection = useRef<{ start: number; end: number }>({ start: 0, end: 0 });
  // dvPreFontSheetSelection is saved in onPressIn of the Aa button, BEFORE the TextInput blurs.
  // This is the authoritative selection used by dvApplyFormat.
  const dvPreFontSheetSelection = useRef<{ start: number; end: number }>({ start: 0, end: 0 });
  // Controlled selection for cursor repositioning after formatting (avoids setNativeProps)
  const [dvBodySelection, setDvBodySelection] = useState<{ start: number; end: number } | undefined>(undefined);
  // Gratitude items as individual strings (shown as separate cards)
  const [dvGratItems, setDvGratItems] = useState<string[]>(['', '', '']);
  const dvPrimaryEntryId = useRef<string | null>(null);
  // Day-view toolbar sheet state
  const [dvShowAttachSheet, setDvShowAttachSheet] = useState(false);
  const [dvShowMoreSheet, setDvShowMoreSheet] = useState(false);
  const [dvTagInput, setDvTagInput] = useState('');
  const [dvShowTagInput, setDvShowTagInput] = useState(false);
  const [dvTags, setDvTags] = useState<string[]>([]);
  // Audio recorder
  const [dvShowAudioRecorder, setDvShowAudioRecorder] = useState(false);
  // Draw canvas
  const [dvShowDraw, setDvShowDraw] = useState(false);
  // Full-screen journal editor
  const [dvShowFullEditor, setDvShowFullEditor] = useState(false);
  // Font style sheet
  const [dvShowFontSheet, setDvShowFontSheet] = useState(false);
  const fontSheetAnim = useRef(new Animated.Value(300)).current;

  const openFontSheet = useCallback(() => {
    // Snapshot the current selection before the TextInput blurs
    dvPreFontSheetSelection.current = { ...dvSelection.current };
    setDvShowFontSheet(true);
    Animated.timing(fontSheetAnim, { toValue: 0, duration: 250, useNativeDriver: true }).start();
  }, [fontSheetAnim]);

  const closeFontSheet = useCallback(() => {
    Animated.timing(fontSheetAnim, { toValue: 300, duration: 200, useNativeDriver: true }).start(() => {
      setDvShowFontSheet(false);
    });
  }, [fontSheetAnim]);
  // Scan text (OCR)
  const [dvScanTextLoading, setDvScanTextLoading] = useState(false);
  const [dvShowScanTextResult, setDvShowScanTextResult] = useState(false);
  const [dvScanTextResult, setDvScanTextResult] = useState('');
  const dvScanTextMutation = trpc.journal.scanText.useMutation();

  // Sync note/gratitude from the first non-voice entry, or fall back to the voice entry body
  useEffect(() => {
    // Prefer a non-voice entry; fall back to voice entry so transcript shows in JOURNAL ENTRY
    const primaryEntry = dayEntries.find((e) => !e.tags?.includes('voice'))
      ?? dayEntries.find((e) => e.tags?.includes('voice'));
    if (primaryEntry) {
      dvPrimaryEntryId.current = primaryEntry.id;
      const body = primaryEntry.body || '';
      const gratIdx = body.indexOf('\n\n🙏 Grateful for:');
      const mainBody = gratIdx >= 0 ? body.slice(0, gratIdx).trim() : body.trim();
      const gratRaw = gratIdx >= 0 ? body.slice(gratIdx + 2).trim() : '';
      // Parse individual gratitude lines (strip numbering like "1. ", "- ")
      const rawLines = gratRaw.replace(/^🙏 Grateful for:\n?/, '').split('\n').filter(Boolean);
      const items = rawLines.map((l) => l.replace(/^\d+\.\s*/, '').replace(/^[-•]\s*/, '').trim());
      // Always show at least 3 slots
      while (items.length < 3) items.push('');
      // Strip legacy '# ' prefix from first line (old format used # for headings)
      const cleanBody = mainBody.replace(/^# /, '');
      setDvJournalNote(cleanBody);
      setDvGratItems(items);
    } else {
      dvPrimaryEntryId.current = null;
      setDvJournalNote('');
      setDvGratItems(['', '', '']);
    }
  }, [dayEntries, selectedDate]);

  const [dvSaving, setDvSaving] = useState(false);

  const saveDvNoteAndGrat = useCallback(async (note: string, gratItems: string[]) => {
    if (!userId) return;
    setDvSaving(true);
    try {
      const nonEmpty = gratItems.filter((g) => g.trim());
      const gratSection = nonEmpty.length > 0
        ? '\n\n🙏 Grateful for:\n' + nonEmpty.map((g, i) => `${i + 1}. ${g.trim()}`).join('\n')
        : '';
      const fullBody = note.trim() + gratSection;
      if (dvPrimaryEntryId.current) {
        await updateEntryInStore(userId, dvPrimaryEntryId.current, { body: fullBody });
        setEntries((prev) => prev.map((e) => e.id === dvPrimaryEntryId.current ? { ...e, body: fullBody } : e));
      } else if (fullBody.trim()) {
        const now = new Date().toISOString();
        const newEntry: JournalEntry = {
          id: generateId(),
          userId,
          date: selectedDate,
          createdAt: now,
          updatedAt: now,
          title: '',
          body: fullBody,
          template: 'blank',
          attachments: [],
          tags: [],
        };
        const updated = await addEntry(userId, newEntry);
        dvPrimaryEntryId.current = newEntry.id;
        setEntries(updated);
      }
    } finally {
      setDvSaving(false);
    }
  }, [userId, selectedDate]);

  // ── Day-view photo picker ────────────────────────────────────────────────
  const dvPickPhoto = useCallback(async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsMultipleSelection: true,
        quality: 0.85,
      });
      if (result.canceled || !userId) return;
      // Ensure there's a primary entry to attach photos to
      let entryId = dvPrimaryEntryId.current;
      if (!entryId) {
        const now = new Date().toISOString();
        const newEntry: JournalEntry = {
          id: generateId(), userId, date: selectedDate,
          createdAt: now, updatedAt: now, title: '', body: '', template: 'blank', attachments: [], tags: [],
        };
        const updated = await addEntry(userId, newEntry);
        dvPrimaryEntryId.current = newEntry.id;
        setEntries(updated);
        entryId = newEntry.id;
      }
      const newAtts: JournalAttachment[] = result.assets.map((asset) => ({
        id: generateId(), type: 'photo' as const,
        uri: asset.uri, mimeType: asset.mimeType || 'image/jpeg',
      }));
      const existingEntry = entries.find((e) => e.id === entryId);
      const merged = [...(existingEntry?.attachments ?? []), ...newAtts];
      await updateEntryInStore(userId, entryId, { attachments: merged });
      setEntries((prev) => prev.map((e) => e.id === entryId ? { ...e, attachments: merged } : e));
    } catch (e) { console.warn('dvPickPhoto error:', e); }
  }, [userId, selectedDate, entries]);

  // ── Day-view camera / video / tag handlers ───────────────────────────────
  const dvPickCamera = useCallback(async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') return;
      const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.85 });
      if (result.canceled || !userId) return;
      let entryId = dvPrimaryEntryId.current;
      if (!entryId) {
        const now = new Date().toISOString();
        const newEntry: JournalEntry = { id: generateId(), userId, date: selectedDate, createdAt: now, updatedAt: now, title: '', body: '', template: 'blank', attachments: [], tags: [] };
        const updated = await addEntry(userId, newEntry);
        dvPrimaryEntryId.current = newEntry.id;
        setEntries(updated);
        entryId = newEntry.id;
      }
      const newAtts: JournalAttachment[] = result.assets.map((a) => ({ id: generateId(), type: 'photo' as const, uri: a.uri, mimeType: a.mimeType || 'image/jpeg' }));
      const existing = entries.find((e) => e.id === entryId);
      const merged = [...(existing?.attachments ?? []), ...newAtts];
      await updateEntryInStore(userId, entryId, { attachments: merged });
      setEntries((prev) => prev.map((e) => e.id === entryId ? { ...e, attachments: merged } : e));
    } catch (e) { console.warn('dvPickCamera error:', e); }
  }, [userId, selectedDate, entries]);

  const dvPickVideo = useCallback(async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') return;
      const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['videos'], videoMaxDuration: 120, quality: 0.8 });
      if (result.canceled || !userId) return;
      let entryId = dvPrimaryEntryId.current;
      if (!entryId) {
        const now = new Date().toISOString();
        const newEntry: JournalEntry = { id: generateId(), userId, date: selectedDate, createdAt: now, updatedAt: now, title: '', body: '', template: 'blank', attachments: [], tags: [] };
        const updated = await addEntry(userId, newEntry);
        dvPrimaryEntryId.current = newEntry.id;
        setEntries(updated);
        entryId = newEntry.id;
      }
      const newAtts: JournalAttachment[] = result.assets.map((a) => ({ id: generateId(), type: 'video' as const, uri: a.uri, mimeType: a.mimeType || 'video/mp4' }));
      const existing = entries.find((e) => e.id === entryId);
      const merged = [...(existing?.attachments ?? []), ...newAtts];
      await updateEntryInStore(userId, entryId, { attachments: merged });
      setEntries((prev) => prev.map((e) => e.id === entryId ? { ...e, attachments: merged } : e));
    } catch (e) { console.warn('dvPickVideo error:', e); }
  }, [userId, selectedDate, entries]);

  const dvAddTag = useCallback(async (tag: string) => {
    const trimmed = tag.trim();
    if (!trimmed || dvTags.includes(trimmed)) return;
    const next = [...dvTags, trimmed];
    setDvTags(next);
    setDvTagInput('');
    setDvShowTagInput(false);
    if (!userId || !dvPrimaryEntryId.current) return;
    const existing = entries.find((e) => e.id === dvPrimaryEntryId.current);
    const merged = [...(existing?.tags ?? []), trimmed];
    await updateEntryInStore(userId, dvPrimaryEntryId.current, { tags: merged });
    setEntries((prev) => prev.map((e) => e.id === dvPrimaryEntryId.current ? { ...e, tags: merged } : e));
  }, [dvTags, userId, entries]);

  // ── Text formatting helper ────────────────────────────────────────────────────────────────────────────────────
  // Operates on the full dvJournalNote text (single unified TextInput model).
  // Bold/Italic toggle: if selection is already wrapped, remove the markers; otherwise add them.
  // Uses dvBodySelection state (not setNativeProps) to reposition the cursor.
  const dvApplyFormat = useCallback((type: 'bold' | 'italic' | 'heading' | 'bullet') => {
    closeFontSheet();
    const text = dvJournalNote;
    // Use the selection snapshot taken at Aa button press (before TextInput blur)
    const { start, end } = dvPreFontSheetSelection.current;
    const hasSelection = start !== end;
    const selectedText = hasSelection ? text.slice(start, end) : '';

    let newText = text;
    let newCursorPos = end;

    if (type === 'bold') {
      if (hasSelection) {
        // Toggle: if selection includes ** markers, remove them; otherwise add them
        if (selectedText.startsWith('**') && selectedText.endsWith('**') && selectedText.length > 4) {
          const inner = selectedText.slice(2, -2);
          newText = text.slice(0, start) + inner + text.slice(end);
          newCursorPos = start + inner.length;
        } else if (text.slice(start - 2, start) === '**' && text.slice(end, end + 2) === '**') {
          newText = text.slice(0, start - 2) + selectedText + text.slice(end + 2);
          newCursorPos = start - 2 + selectedText.length;
        } else {
          newText = text.slice(0, start) + '**' + selectedText + '**' + text.slice(end);
          newCursorPos = end + 4;
        }
      } else {
        // No selection: insert **| ** with cursor between markers so user types bold text
        newText = text.slice(0, start) + '****' + text.slice(end);
        newCursorPos = start + 2;
      }
    } else if (type === 'italic') {
      if (hasSelection) {
        if (selectedText.startsWith('*') && selectedText.endsWith('*') && selectedText.length > 2 && !selectedText.startsWith('**')) {
          const inner = selectedText.slice(1, -1);
          newText = text.slice(0, start) + inner + text.slice(end);
          newCursorPos = start + inner.length;
        } else if (text.slice(start - 1, start) === '*' && text.slice(end, end + 1) === '*' && text.slice(start - 2, start) !== '**') {
          newText = text.slice(0, start - 1) + selectedText + text.slice(end + 1);
          newCursorPos = start - 1 + selectedText.length;
        } else {
          newText = text.slice(0, start) + '*' + selectedText + '*' + text.slice(end);
          newCursorPos = end + 2;
        }
      } else {
        // No selection: insert *| * with cursor between markers so user types italic text
        newText = text.slice(0, start) + '**' + text.slice(end);
        newCursorPos = start + 1;
      }
    } else if (type === 'heading') {
      const lineStart = text.lastIndexOf('\n', start - 1) + 1;
      const lineEnd = text.indexOf('\n', start);
      const lineText = text.slice(lineStart, lineEnd === -1 ? text.length : lineEnd);
      if (lineText.startsWith('# ')) {
        newText = text.slice(0, lineStart) + lineText.slice(2) + text.slice(lineEnd === -1 ? text.length : lineEnd);
        newCursorPos = Math.max(lineStart, start - 2);
      } else {
        newText = text.slice(0, lineStart) + '# ' + lineText + text.slice(lineEnd === -1 ? text.length : lineEnd);
        newCursorPos = start + 2;
      }
    } else if (type === 'bullet') {
      const lineStart = text.lastIndexOf('\n', start - 1) + 1;
      const lineEnd = text.indexOf('\n', start);
      const lineText = text.slice(lineStart, lineEnd === -1 ? text.length : lineEnd);
      if (lineText.startsWith('- ')) {
        newText = text.slice(0, lineStart) + lineText.slice(2) + text.slice(lineEnd === -1 ? text.length : lineEnd);
        newCursorPos = Math.max(lineStart, start - 2);
      } else {
        newText = text.slice(0, lineStart) + '- ' + lineText + text.slice(lineEnd === -1 ? text.length : lineEnd);
        newCursorPos = start + 2;
      }
    }

    setDvJournalNote(newText);
    // Use selection state to reposition cursor (no setNativeProps needed)
    setDvBodySelection({ start: newCursorPos, end: newCursorPos });
    setTimeout(() => {
      dvTextInputRef.current?.focus();
      setTimeout(() => setDvBodySelection(undefined), 100);
    }, 50);
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => saveDvNoteAndGrat(newText, dvGratItems), 800);
  }, [dvJournalNote, dvGratItems, saveDvNoteAndGrat, closeFontSheet]);

  // ── Scan Text (OCR) ───────────────────────────────────────────────────────────────────────────────
  const dvScanText = useCallback(async () => {
    setDvShowMoreSheet(false);
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') { Alert.alert('Permission needed', 'Camera access is required to scan text.'); return; }
      const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.9, base64: true });
      if (result.canceled || !result.assets[0]) return;
      const asset = result.assets[0];
      const imageBase64 = asset.base64;
      if (!imageBase64) { Alert.alert('Error', 'Could not read image data.'); return; }
      setDvScanTextLoading(true);
      const mimeType = asset.mimeType || 'image/jpeg';
      const res = await dvScanTextMutation.mutateAsync({ imageBase64, mimeType });
      setDvScanTextResult(res.text || 'No text found in image.');
      setDvShowScanTextResult(true);
    } catch (e) {
      console.warn('dvScanText error:', e);
      Alert.alert('Scan failed', 'Could not extract text from the image.');
    } finally {
      setDvScanTextLoading(false);
    }
  }, [dvScanTextMutation]);

  const dvInsertScannedText = useCallback((text: string) => {
    setDvShowScanTextResult(false);
    const newNote = dvJournalNote ? dvJournalNote + '\n\n' + text : text;
    setDvJournalNote(newNote);
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => saveDvNoteAndGrat(newNote, dvGratItems), 800);
  }, [dvJournalNote, dvGratItems, saveDvNoteAndGrat]);

  // ── Audio recording handler ────────────────────────────────────────────────────────────────────────────
  const dvHandleAudioRecording = useCallback(async (uri: string, duration: number, mimeType: string) => {
    setDvShowAudioRecorder(false);
    if (!userId) return;
    let entryId = dvPrimaryEntryId.current;
    if (!entryId) {
      const now = new Date().toISOString();
      const newEntry: JournalEntry = {
        id: generateId(), userId, date: selectedDate,
        createdAt: now, updatedAt: now, title: '', body: '', template: 'blank', attachments: [], tags: [],
      };
      const updated = await addEntry(userId, newEntry);
      dvPrimaryEntryId.current = newEntry.id;
      setEntries(updated);
      entryId = newEntry.id;
    }
    const newAtt: JournalAttachment = { id: generateId(), type: 'audio', uri, mimeType, durationMs: duration * 1000 };
    const existing = entries.find((e) => e.id === entryId);
    const merged = [...(existing?.attachments ?? []), newAtt];
    await updateEntryInStore(userId, entryId, { attachments: merged });
    setEntries((prev) => prev.map((e) => e.id === entryId ? { ...e, attachments: merged } : e));
    if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, [userId, selectedDate, entries]);

  // ── Date wheel picker columns ───────────────────────────────────────────────
  const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const pickerMonthRef = useRef(0);
  const pickerDayRef = useRef(0);
  const pickerYearRef = useRef(0);
  const YEARS = Array.from({ length: 5 }, (_, i) => String(new Date().getFullYear() - 2 + i));

  function initPickerRefs(dateStr: string) {
    const d = new Date(dateStr + 'T12:00:00');
    pickerMonthRef.current = d.getMonth();
    pickerDayRef.current = d.getDate() - 1;
    pickerYearRef.current = Math.max(0, d.getFullYear() - (new Date().getFullYear() - 2));
  }

  const todayYear = new Date().getFullYear();
  const todayMonth = new Date().getMonth();
  const todayDay = new Date().getDate();

  function buildPickerDate(): string {
    const m = pickerMonthRef.current;
    const day = pickerDayRef.current + 1;
    const y = new Date().getFullYear() - 2 + pickerYearRef.current;
    return `${y}-${String(m+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
  }
  function getDaysInMonth(month: number): number {
    const y = new Date().getFullYear() - 2 + pickerYearRef.current;
    return new Date(y, month + 1, 0).getDate();
  }

  const [pickerMonth, setPickerMonth] = useState(0);
  const [pickerDayCount, setPickerDayCount] = useState(31);

  return (
    <ScreenContainer containerClassName={isCalm ? 'bg-[#0D1135]' : undefined}>
      {/* ── Day-navigation header ── */}
      <View style={dvStyles.header}>
        {/* Fire streak icon — left */}
        <Pressable
          onPress={() => {}}
          style={({ pressed }) => [dvStyles.navBtn, { flexDirection: 'row', alignItems: 'center', gap: 3, opacity: pressed ? 0.7 : 1 }]}
        >
          <IconSymbol name="flame.fill" size={20} color="#F59E0B" />
          <Text style={{ fontSize: 14, fontWeight: '700', color: '#F59E0B' }}>{streak}</Text>
        </Pressable>

        {/* Day nav: left arrow + label + right arrow */}
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
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

        {/* Calendar icon — right */}
        <Pressable
          onPress={() => setCalendarModalVisible(true)}
          style={({ pressed }) => [dvStyles.navBtn, { opacity: pressed ? 0.7 : 1 }]}
        >
          <IconSymbol name="calendar" size={22} color={colors.primary} />
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
          {/* ── JOURNAL ENTRY — simple preview card, tap to open full-screen editor ── */}
          <Pressable
            onPress={() => setDvShowFullEditor(true)}
            style={({ pressed }) => [dvStyles.card, { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.85 : 1 }]}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <Text style={[dvStyles.cardTitle, { color: colors.muted }]}>JOURNAL ENTRY</Text>
              <Pressable
                onPress={() => setDvShowFullEditor(true)}
                style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1, padding: 4 })}
              >
                <IconSymbol name="square.and.pencil" size={18} color={colors.primary} />
              </Pressable>
            </View>
            {/* Preview: first 2 lines of text */}
            {dvJournalNote ? (
              <Text
                numberOfLines={3}
                style={{ fontSize: 15, lineHeight: 22, color: colors.foreground }}
              >
                {dvJournalNote.replace(/^(# |## |### |- )/gm, '').replace(/\*\*([^*]+)\*\*/g, '$1').replace(/\*([^*]+)\*/g, '$1')}
              </Text>
            ) : (
              <Text style={{ fontSize: 15, lineHeight: 22, color: colors.muted, fontStyle: 'italic' }}>
                Tap to write your entry...
              </Text>
            )}
            {/* Photo thumbnail strip */}
            {dvPrimaryEntryId.current && (() => {
              const photoAtts = (entries.find((e) => e.id === dvPrimaryEntryId.current)?.attachments ?? []).filter((a) => a.type === 'photo');
              if (photoAtts.length === 0) return null;
              return (
                <View style={{ flexDirection: 'row', marginTop: 10, gap: 6 }}>
                  {photoAtts.slice(0, 4).map((att, i) => (
                    <View key={att.id} style={{ position: 'relative' }}>
                      <Image source={{ uri: att.uri }} style={{ width: 56, height: 56, borderRadius: 8 }} />
                      {i === 3 && photoAtts.length > 4 && (
                        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 8, alignItems: 'center', justifyContent: 'center' }}>
                          <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700' }}>+{photoAtts.length - 4}</Text>
                        </View>
                      )}
                    </View>
                  ))}
                </View>
              );
            })()}
            {/* Tag chips */}
            {dvTags.length > 0 && (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                {dvTags.map((tag) => (
                  <View
                    key={tag}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.primary + '22', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 }}
                  >
                    <Text style={{ fontSize: 12, color: colors.primary, fontWeight: '500' }}>#{tag}</Text>
                  </View>
                ))}
              </View>
            )}
          </Pressable>
          {/* ── Full-screen journal editor ── */}
          <FullScreenJournalEditor
            visible={dvShowFullEditor}
            value={dvJournalNote}
            onChange={(text) => {
              setDvJournalNote(text);
              if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
              autoSaveTimer.current = setTimeout(() => saveDvNoteAndGrat(text, dvGratItems), 800);
            }}
            onClose={() => {
              setDvShowFullEditor(false);
              // Final save when closing
              if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
              saveDvNoteAndGrat(dvJournalNote, dvGratItems);
            }}
            onPickPhoto={dvPickPhoto}
            onPickCamera={dvPickCamera}
            colors={colors}
          />

          {/* ── Day-view Attach Sheet ── */}
          <Modal visible={dvShowAttachSheet} transparent animationType="slide" onRequestClose={() => setDvShowAttachSheet(false)}>
            <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' }} onPress={() => setDvShowAttachSheet(false)} />
            <View style={{ backgroundColor: colors.background, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 32 }}>
              <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center', marginTop: 10, marginBottom: 16 }} />
              {([
                { icon: 'tag.fill' as const, label: 'Tag', color: '#8B5CF6', onPress: () => { setDvShowAttachSheet(false); setDvShowTagInput(true); } },
                { icon: 'mic.fill' as const, label: 'Audio', color: '#EF4444', onPress: () => { setDvShowAttachSheet(false); setDvShowAudioRecorder(true); } },
                { icon: 'camera.fill' as const, label: 'Camera', color: '#3B82F6', onPress: () => { setDvShowAttachSheet(false); dvPickCamera(); } },
                { icon: 'video.fill' as const, label: 'Video', color: '#10B981', onPress: () => { setDvShowAttachSheet(false); dvPickVideo(); } },
              ]).map((item) => (
                <Pressable key={item.label} onPress={item.onPress} style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: 16, paddingHorizontal: 24, paddingVertical: 16, opacity: pressed ? 0.6 : 1 }]}>
                  <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: item.color + '22', alignItems: 'center', justifyContent: 'center' }}>
                    <IconSymbol name={item.icon} size={20} color={item.color} />
                  </View>
                  <Text style={{ fontSize: 16, fontWeight: '500', color: colors.foreground }}>{item.label}</Text>
                </Pressable>
              ))}
              <Pressable onPress={() => { setDvShowAttachSheet(false); setDvShowMoreSheet(true); }} style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: 16, paddingHorizontal: 24, paddingVertical: 16, opacity: pressed ? 0.6 : 1 }]}>
                <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' }}>
                  <IconSymbol name="ellipsis" size={20} color={colors.muted} />
                </View>
                <Text style={{ fontSize: 16, fontWeight: '500', color: colors.foreground }}>More</Text>
              </Pressable>
            </View>
          </Modal>

          {/* ── Day-view More Sheet ── */}
          <Modal visible={dvShowMoreSheet} transparent animationType="slide" onRequestClose={() => setDvShowMoreSheet(false)}>
            <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' }} onPress={() => setDvShowMoreSheet(false)} />
            <View style={{ backgroundColor: colors.background, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 32 }}>
              <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center', marginTop: 10, marginBottom: 8 }} />
              <Text style={{ fontSize: 13, fontWeight: '600', color: colors.muted, paddingHorizontal: 24, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.8 }}>More Options</Text>
              {([
                { icon: 'scribble' as const, label: 'Draw', onPress: () => { setDvShowMoreSheet(false); setDvShowDraw(true); } },
                { icon: 'doc.text.viewfinder' as const, label: 'Scan to PDF', onPress: () => { setDvShowMoreSheet(false); dvPickCamera(); } },
                { icon: 'text.viewfinder' as const, label: 'Scan Text', onPress: () => dvScanText() },
                { icon: 'doc.fill' as const, label: 'Template', onPress: () => { setDvShowMoreSheet(false); setEditorVisible(true); } },
              ] as const).map((item) => (
                <Pressable key={item.label} onPress={item.onPress} style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: 16, paddingHorizontal: 24, paddingVertical: 16, opacity: pressed ? 0.6 : 1 }]}>
                  <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' }}>
                    <IconSymbol name={item.icon} size={20} color={colors.primary} />
                  </View>
                  <Text style={{ fontSize: 16, fontWeight: '500', color: colors.foreground }}>{item.label}</Text>
                </Pressable>
              ))}
            </View>
          </Modal>

          {/* ── Legend row ── */}
          {habits.filter((h) => h.isActive).length > 0 && (
            <View style={[dvStyles.legendRow, { borderBottomColor: colors.border }]}>
              {(['red', 'yellow', 'green'] as const).map((r) => (
                <View key={r} style={dvStyles.legendItem}>
                  <View style={[dvStyles.legendDot, { backgroundColor: RATING_COLORS_DV[r] }]} />
                  <Text style={[dvStyles.legendText, { color: colors.muted }]}>
                    {r === 'red' ? 'Missed' : r === 'yellow' ? 'Okay' : 'Crushed it'}
                  </Text>
                </View>
              ))}
            </View>
          )}

          {/* Rate All row removed per user request */}

          {/* ── HABITS grouped by category (check-in review style) ── */}
          {(() => {
            const sortedCats = [...categories].sort((a, b) => a.order - b.order);
            return sortedCats.map((cat) => {
              const catHabits = habits.filter((h) => h.isActive && h.category === cat.id);
              if (catHabits.length === 0) return null;
              return (
                <View key={cat.id} style={dvStyles.ciSection}>
                  {/* Category header */}
                  <View style={dvStyles.ciSectionHeader}>
                    <CategoryIcon categoryId={cat.id} lifeArea={cat.lifeArea} size={18} color={colors.primary} />
                    <Text style={[dvStyles.ciSectionTitle, { color: colors.foreground }]}>{cat.label}</Text>
                    <View style={{ flex: 1 }} />
                    {/* Rate whole category */}
                    <View style={[dvStyles.segmentedBtn, { backgroundColor: colors.border }]}>
                      {(['red', 'yellow', 'green'] as const).map((r, i) => (
                        <Pressable
                          key={r}
                          onPress={() => {
                            if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                            const next = { ...dvRatings };
                            catHabits.forEach((h) => { next[h.id] = r; });
                            setDvRatings(next);
                            submitCheckIn(selectedDate, next);
                          }}
                          style={({ pressed }) => [
                            dvStyles.segment,
                            dvStyles.segmentSmall,
                            i === 0 && dvStyles.segmentFirst,
                            i === 2 && dvStyles.segmentLast,
                            { backgroundColor: RATING_COLORS_DV[r] + (pressed ? 'CC' : '88'), opacity: pressed ? 0.8 : 1 },
                          ]}
                        />
                      ))}
                    </View>
                  </View>

                  {/* Habit rows in rounded card */}
                  <View style={[dvStyles.ciCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    {catHabits.map((habit, idx) => {
                      const current = dvRatings[habit.id] ?? 'none';
                      const isLast = idx === catHabits.length - 1;
                      return (
                        <View
                          key={habit.id}
                          style={[
                            dvStyles.ciHabitRow,
                            !isLast && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
                          ]}
                        >
                          <View style={{ flex: 1 }}>
                            <Text style={[dvStyles.ciHabitName, { color: colors.foreground }]}>{habit.name}</Text>
                            <TextInput
                              style={[dvStyles.ciHabitDesc, { color: colors.muted, padding: 0, margin: 0 }]}
                              value={dvHabitNotes[habit.id] ?? ''}
                              onChangeText={(text) => saveDvHabitNote(habit.id, text)}
                              placeholder={habit.description || 'Add a note...'}
                              placeholderTextColor={colors.muted + '88'}
                              multiline
                              returnKeyType="done"
                              blurOnSubmit
                            />
                          </View>
                          {/* 3-color segmented button */}
                          <View style={[dvStyles.segmentedBtn, { backgroundColor: colors.border }]}>
                            {(['red', 'yellow', 'green'] as const).map((r, i) => {
                              const isSelected = current === r;
                              return (
                                <Pressable
                                  key={r}
                                  onPress={() => {
                                    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                    const newRating: Rating = dvRatings[habit.id] === r ? 'none' : r;
                                    const next = { ...dvRatings, [habit.id]: newRating };
                                    setDvRatings(next);
                                    submitCheckIn(selectedDate, next);
                                  }}
                                  style={({ pressed }) => [
                                    dvStyles.segment,
                                    i === 0 && dvStyles.segmentFirst,
                                    i === 2 && dvStyles.segmentLast,
                                    {
                                      backgroundColor: isSelected ? RATING_COLORS_DV[r] : RATING_COLORS_DV[r] + '44',
                                      opacity: pressed ? 0.75 : 1,
                                    },
                                  ]}
                                />
                              );
                            })}
                          </View>
                        </View>
                      );
                    })}
                  </View>
                </View>
              );
            });
          })()}

          {/* ── Voice transcript entries (read-only header, editable body) ── */}
          {dayEntries.filter((e) => e.tags?.includes('voice')).map((entry) => {
            const bodyText = dvBodies[entry.id] ?? entry.body ?? '';
            const gratIdx = bodyText.indexOf('\n\n🙏 Grateful for:');
            const mainBody = gratIdx >= 0 ? bodyText.slice(0, gratIdx).trim() : bodyText.trim();
            const gratSection = gratIdx >= 0 ? bodyText.slice(gratIdx + 2).trim() : '';
            return (
              <View key={entry.id} style={[dvStyles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <View style={dvStyles.entryHeader}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <IconSymbol name="mic.fill" size={13} color={colors.primary} />
                    <Text style={[dvStyles.cardTitle, { color: colors.muted, marginBottom: 0 }]}>VOICE LOG</Text>
                    <Text style={[dvStyles.entryTime, { color: colors.muted, marginLeft: 4 }]}>{formatTime(entry.createdAt)}</Text>
                  </View>
                </View>
                <TextInput
                  value={mainBody}
                  onChangeText={(text) => {
                    const newBody = gratSection.length > 0 ? text + '\n\n' + gratSection : text;
                    setDvBodies((prev) => ({ ...prev, [entry.id]: newBody }));
                  }}
                  onBlur={() => saveDvBody(entry.id, dvBodies[entry.id] ?? entry.body ?? '')}
                  multiline
                  placeholder="Voice transcript..."
                  placeholderTextColor={colors.muted}
                  style={[dvStyles.entryBodyInput, { color: colors.foreground }]}
                />
                {entry.attachments && entry.attachments.filter(a => a.type === 'audio').map((att, i) => (
                  <AudioPlaybackRow key={i} uri={att.uri} duration={att.durationMs ? att.durationMs / 1000 : undefined} />
                ))}
              </View>
            );
          })}

          {/* ── GRATEFUL FOR — individual cards ── */}
          <Text style={[dvStyles.cardTitle, { color: colors.muted, marginBottom: 6 }]}>GRATEFUL FOR</Text>
          {dvGratItems.map((item, idx) => (
            <View key={idx} style={[dvStyles.gratCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <TextInput
                value={item}
                onChangeText={(text) => {
                  const updated = [...dvGratItems];
                  updated[idx] = text;
                  setDvGratItems(updated);
                  if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
                  autoSaveTimer.current = setTimeout(() => saveDvNoteAndGrat(dvJournalNote, updated), 800);
                }}
                placeholder={`Grateful for...`}
                placeholderTextColor={colors.muted}
                style={[dvStyles.gratInput, { color: colors.foreground }]}
                returnKeyType="done"
              />
            </View>
          ))}

          {/* ── Add more gratitude slot ── */}
          <Pressable
            onPress={() => setDvGratItems((prev) => [...prev, ''])}
            style={({ pressed }) => [dvStyles.addGratBtn, { borderColor: colors.border, opacity: pressed ? 0.6 : 1 }]}
          >
            <Text style={[dvStyles.addGratText, { color: colors.muted }]}>+ Add another</Text>
          </Pressable>

          {/* Save Entry button removed — auto-saves on keystroke */}
        </ScrollView>
      )}

      {/* FAB removed — entry is created inline in the day-view */}

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

      {/* ── Audio Recorder Modal ── */}
      <Modal visible={dvShowAudioRecorder} transparent animationType="slide" onRequestClose={() => setDvShowAudioRecorder(false)}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' }} onPress={() => setDvShowAudioRecorder(false)} />
        <View style={{ backgroundColor: colors.background, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingBottom: 48, paddingTop: 20, alignItems: 'center', gap: 12 }}>
          <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: colors.border, marginBottom: 8 }} />
          <Text style={{ fontSize: 17, fontWeight: '700', color: colors.foreground }}>Record Audio</Text>
          <Text style={{ fontSize: 13, color: colors.muted, textAlign: 'center', paddingHorizontal: 32 }}>Tap the mic to start recording. Tap again to stop and save.</Text>
          <MicButton
            onRecordingComplete={dvHandleAudioRecording}
            colors={colors}
          />
          <Pressable onPress={() => setDvShowAudioRecorder(false)} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1, marginTop: 8 })}>
            <Text style={{ fontSize: 16, color: colors.muted }}>Cancel</Text>
          </Pressable>
        </View>
      </Modal>

      {/* ── Scan Text Loading overlay ── */}
      {dvScanTextLoading && (
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center', zIndex: 999 }}>
          <View style={{ backgroundColor: colors.surface, borderRadius: 20, padding: 32, alignItems: 'center', gap: 16 }}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={{ fontSize: 15, fontWeight: '600', color: colors.foreground }}>Extracting text…</Text>
            <Text style={{ fontSize: 12, color: colors.muted }}>AI is reading your image</Text>
          </View>
        </View>
      )}

      {/* ── Scan Text Result Modal ── */}
      <Modal visible={dvShowScanTextResult} transparent animationType="slide" onRequestClose={() => setDvShowScanTextResult(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: colors.background, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingBottom: 40, maxHeight: '80%' }}>
            <View style={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={{ fontSize: 17, fontWeight: '700', color: colors.foreground }}>Scanned Text</Text>
              <Pressable onPress={() => setDvShowScanTextResult(false)} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
                <IconSymbol name="xmark" size={20} color={colors.muted} />
              </Pressable>
            </View>
            <ScrollView style={{ paddingHorizontal: 20, paddingTop: 12 }} contentContainerStyle={{ paddingBottom: 20 }}>
              <Text style={{ fontSize: 15, color: colors.foreground, lineHeight: 24 }}>{dvScanTextResult}</Text>
            </ScrollView>
            <View style={{ flexDirection: 'row', gap: 12, paddingHorizontal: 20, paddingTop: 12 }}>
              <Pressable
                onPress={() => setDvShowScanTextResult(false)}
                style={({ pressed }) => [{ flex: 1, paddingVertical: 14, borderRadius: 14, borderWidth: 1.5, borderColor: colors.border, alignItems: 'center', opacity: pressed ? 0.7 : 1 }]}
              >
                <Text style={{ fontSize: 15, fontWeight: '600', color: colors.muted }}>Discard</Text>
              </Pressable>
              <Pressable
                onPress={() => dvInsertScannedText(dvScanTextResult)}
                style={({ pressed }) => [{ flex: 1, paddingVertical: 14, borderRadius: 14, backgroundColor: colors.primary, alignItems: 'center', opacity: pressed ? 0.8 : 1 }]}
              >
                <Text style={{ fontSize: 15, fontWeight: '700', color: '#fff' }}>Insert into Entry</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Draw Canvas Modal ── */}
      <Modal visible={dvShowDraw} transparent animationType="slide" onRequestClose={() => setDvShowDraw(false)}>
        <View style={{ flex: 1, backgroundColor: colors.background }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 56, paddingBottom: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }}>
            <Pressable onPress={() => setDvShowDraw(false)} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
              <Text style={{ fontSize: 16, color: colors.muted }}>Cancel</Text>
            </Pressable>
            <Text style={{ fontSize: 17, fontWeight: '700', color: colors.foreground }}>Draw</Text>
            <Pressable
              onPress={() => {
                setDvShowDraw(false);
                Alert.alert('Drawing Saved', 'Your drawing has been noted.');
              }}
              style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
            >
              <Text style={{ fontSize: 16, color: colors.primary, fontWeight: '600' }}>Done</Text>
            </Pressable>
          </View>
          <DrawCanvas colors={colors} />
        </View>
      </Modal>

      {/* ── Font Style Sheet (inline, no Modal so keyboard stays open) ── */}
      {dvShowFontSheet && (
        <>
          {/* Backdrop */}
          <Pressable
            style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 99 }}
            onPress={closeFontSheet}
          />
          {/* Sheet */}
          <Animated.View
            style={{
              position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 100,
              backgroundColor: colors.background,
              borderTopLeftRadius: 24, borderTopRightRadius: 24,
              paddingBottom: 40,
              transform: [{ translateY: fontSheetAnim }],
              shadowColor: '#000', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.15, shadowRadius: 12, elevation: 20,
            }}
          >
            <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center', marginTop: 12, marginBottom: 16 }} />
            <Text style={{ fontSize: 13, fontWeight: '700', color: colors.muted, paddingHorizontal: 24, marginBottom: 12, textTransform: 'uppercase', letterSpacing: 0.8 }}>Text Style</Text>
            {([
              { label: 'Bold', desc: 'Wrap selected text in **bold**', preview: 'B', previewStyle: { fontWeight: '800' as const, fontSize: 20 }, type: 'bold' as const },
              { label: 'Italic', desc: 'Wrap selected text in *italic*', preview: 'I', previewStyle: { fontStyle: 'italic' as const, fontSize: 20 }, type: 'italic' as const },
              { label: 'Heading', desc: 'Format current line as a heading', preview: 'H', previewStyle: { fontWeight: '800' as const, fontSize: 22 }, type: 'heading' as const },
              { label: 'Bullet List', desc: 'Add a bullet point to current line', preview: '•', previewStyle: { fontSize: 22 }, type: 'bullet' as const },
            ]).map((item) => (
              <Pressable
                key={item.label}
                onPress={() => dvApplyFormat(item.type)}
                style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: 16, paddingHorizontal: 24, paddingVertical: 14, opacity: pressed ? 0.6 : 1 }]}
              >
                <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: colors.primary + '18', alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={[{ color: colors.primary }, item.previewStyle]}>{item.preview}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 16, fontWeight: '600', color: colors.foreground }}>{item.label}</Text>
                  <Text style={{ fontSize: 12, color: colors.muted }}>{item.desc}</Text>
                </View>
              </Pressable>
            ))}
          </Animated.View>
        </>
      )}

      {/* ── Calendar Modal ── */}
      <Modal
        visible={calendarModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setCalendarModalVisible(false)}
      >
        <View style={{ flex: 1, backgroundColor: '#00000088', justifyContent: 'flex-end' }}>
          <View style={[dvStyles.pickerSheet, { backgroundColor: colors.surface, maxHeight: '85%' }]}>
            <View style={[dvStyles.pickerHeader, { borderBottomColor: colors.border }]}>
              <Pressable onPress={() => setCalendarModalVisible(false)} style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}>
                <IconSymbol name="xmark" size={20} color={colors.muted} />
              </Pressable>
              <Text style={[dvStyles.pickerTitle, { color: colors.foreground }]}>Calendar</Text>
              <View style={{ width: 40 }} />
            </View>
            <JournalCalendarView
              colors={colors}
              onDayPress={(dateStr) => {
                setSelectedDate(dateStr);
                setCalendarModalVisible(false);
              }}
            />
          </View>
        </View>
      </Modal>

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
          {/* Month / Day / Year columns */}
          <View style={{ flexDirection: 'row', height: 144, paddingHorizontal: 16 }}>
            <WheelColumn
              items={MONTHS}
              initialIndex={new Date(selectedDate + 'T12:00:00').getMonth()}
              onSelect={(idx) => {
                pickerMonthRef.current = idx;
                setPickerMonth(idx);
                setPickerDayCount(getDaysInMonth(idx));
              }}
              width={160}
            />
            <WheelColumn
              key={`day-${pickerDayCount}`}
              items={Array.from({ length: pickerDayCount }, (_, i) => String(i + 1))}
              initialIndex={Math.min(pickerDayRef.current, pickerDayCount - 1)}
              onSelect={(idx) => { pickerDayRef.current = idx; }}
              width={60}
            />
            <WheelColumn
              items={YEARS}
              initialIndex={pickerYearRef.current}
              onSelect={(idx) => {
                pickerYearRef.current = idx;
                setPickerDayCount(getDaysInMonth(pickerMonthRef.current));
              }}
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
  habitName: { fontSize: 14, fontWeight: '500' },
  habitDesc: { fontSize: 11, marginTop: 1 },
  ratingLabel: { fontSize: 12, fontWeight: '600' },
  ratingBtns: { flexDirection: 'row', gap: 4 },
  ratingBtn: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, borderWidth: 1 },
  ratingBtnText: { fontSize: 11, fontWeight: '600' },
  entryHeader: { marginBottom: 6 },
  entryTime: { fontSize: 12 },
  entryTitle: { fontSize: 16, fontWeight: '600', marginTop: 2 },
  entryBody: { fontSize: 15, lineHeight: 22 },
  entryBodyInput: { fontSize: 15, lineHeight: 22, minHeight: 40 },
  gratBox: { borderRadius: 8, borderWidth: 0.5, padding: 10, marginTop: 8 },
  gratText: { fontSize: 13, lineHeight: 19 },
  gratLabel: { fontSize: 12, fontWeight: '600', marginBottom: 4 },
  gratInput: { fontSize: 13, lineHeight: 19, minHeight: 30 },
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
  gratCard: { borderRadius: 12, borderWidth: 0.5, padding: 12, marginBottom: 8 },
  addGratBtn: { borderRadius: 10, borderWidth: 0.5, paddingVertical: 10, alignItems: 'center', marginBottom: 12 },
  addGratText: { fontSize: 13, fontWeight: '500' },
  saveEntryBtn: { borderRadius: 14, paddingVertical: 15, alignItems: 'center', justifyContent: 'center', marginTop: 4, marginBottom: 16 },
  saveEntryText: { color: '#fff', fontSize: 16, fontWeight: '700', letterSpacing: 0.2 },
  // Check-in review style
  legendRow: { flexDirection: 'row', justifyContent: 'center', gap: 20, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, marginBottom: 4 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: 12 },
  rateAllRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 10, marginBottom: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  rateAllLabel: { fontSize: 12, fontWeight: '700', letterSpacing: 0.8 },
  segmentedBtn: { flexDirection: 'row', borderRadius: 10, overflow: 'hidden', gap: 2, padding: 2 },
  segment: { width: 30, height: 30, borderRadius: 8 },
  segmentSmall: { width: 24, height: 24, borderRadius: 6 },
  segmentFirst: { borderTopLeftRadius: 8, borderBottomLeftRadius: 8 },
  segmentLast: { borderTopRightRadius: 8, borderBottomRightRadius: 8 },
  ciSection: { marginBottom: 12 },
  ciSectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 4, paddingVertical: 6 },
  ciSectionTitle: { fontSize: 15, fontWeight: '700' },
  ciCard: { borderRadius: 14, borderWidth: 0.5, overflow: 'hidden' },
  ciHabitRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12, gap: 10 },
  ciHabitName: { fontSize: 15, fontWeight: '500' },
  ciHabitDesc: { fontSize: 12, marginTop: 2 },
});
