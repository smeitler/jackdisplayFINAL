/**
 * VoiceCheckinScreen — Full-screen voice check-in flow
 *
 * Flow:
 *   IDLE → tap mic → LISTENING (waveform + habit prompt card) → tap send →
 *   ANALYZING (always-spinning dots + cycling status text) →
 *   RESULTS (habit cards + journal block + gratitude) → tap Log → DONE
 *
 * Speed optimization: single combined tRPC call (transcribeAndAnalyze) instead of
 * two sequential calls, cutting latency roughly in half.
 *
 * Recording strategy:
 *   - Web: MediaRecorder API (proven to work in checkin.tsx)
 *   - Native (iOS/Android): expo-audio useAudioRecorder
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  Animated,
  Easing,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from "expo-audio";
import * as FileSystem from "expo-file-system/legacy";
import * as Haptics from "expo-haptics";
import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import { useApp } from "@/lib/app-context";
import { trpc } from "@/lib/trpc";
import { addEntry, generateId, todayDateStr } from "@/lib/journal-store";
import { getLastUserId, submitCheckIn, type Rating } from "@/lib/storage";

// ─── Web MediaRecorder hook ───────────────────────────────────────────────────
function useWebRecorder() {
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const allChunksRef = useRef<Blob[]>([]);
  const mimeTypeRef = useRef<string>("audio/webm");
  const [isRecording, setIsRecording] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);

  const start = useCallback(async (): Promise<boolean> => {
    setMicError(null);
    allChunksRef.current = [];
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      let mimeType = "";
      if (typeof MediaRecorder.isTypeSupported === "function") {
        if (MediaRecorder.isTypeSupported("audio/webm;codecs=opus")) mimeType = "audio/webm;codecs=opus";
        else if (MediaRecorder.isTypeSupported("audio/webm")) mimeType = "audio/webm";
        else if (MediaRecorder.isTypeSupported("audio/mp4")) mimeType = "audio/mp4";
      }
      mimeTypeRef.current = mimeType || "audio/webm";
      const mr = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
      mr.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) allChunksRef.current.push(e.data);
      };
      mr.start(100);
      mediaRecorderRef.current = mr;
      setIsRecording(true);
      return true;
    } catch (e: any) {
      const name = e?.name ?? "";
      if (name === "NotFoundError" || name === "DevicesNotFoundError") {
        setMicError("No microphone found.");
      } else if (name === "NotAllowedError" || name === "PermissionDeniedError") {
        setMicError("Microphone access denied. Please allow microphone in browser settings.");
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
        setIsRecording(false);
        resolve(null);
        return;
      }
      mr.addEventListener(
        "stop",
        () => {
          streamRef.current?.getTracks().forEach((t) => t.stop());
          streamRef.current = null;
          const blob =
            allChunksRef.current.length > 0
              ? new Blob(allChunksRef.current, { type: mimeTypeRef.current })
              : null;
          allChunksRef.current = [];
          setIsRecording(false);
          resolve(blob);
        },
        { once: true }
      );
      mr.stop();
    });
  }, []);

  const getMimeType = useCallback(() => mimeTypeRef.current, []);
  return { start, stop, getMimeType, isRecording, micError };
}

// Convert Blob to base64 string (web only)
function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(",")[1] || "";
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// ─── Types ────────────────────────────────────────────────────────────────────
type Phase = "idle" | "listening" | "analyzing" | "results" | "done";

interface HabitResult {
  habitId: string;
  habitName: string;
  rating: "green" | "yellow" | "red" | null;
  note: string;
}

interface ParsedResults {
  habitResults: HabitResult[];
  journalEntries: string[];
  gratitudeItems: string[];
  transcript: string;
}

// ─── Waveform bars ────────────────────────────────────────────────────────────
function WaveformBars({ isActive, color }: { isActive: boolean; color: string }) {
  const BAR_COUNT = 7;
  const anims = useRef(
    Array.from({ length: BAR_COUNT }, () => new Animated.Value(0.3))
  ).current;

  useEffect(() => {
    if (!isActive) {
      anims.forEach((a) =>
        Animated.timing(a, { toValue: 0.3, duration: 200, useNativeDriver: true }).start()
      );
      return;
    }
    const loops = anims.map((a, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 80),
          Animated.timing(a, {
            toValue: 1,
            duration: 300 + i * 40,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
          Animated.timing(a, {
            toValue: 0.25,
            duration: 300 + i * 40,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
        ])
      )
    );
    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
  }, [isActive]);

  return (
    <View style={waveStyles.container}>
      {anims.map((a, i) => (
        <Animated.View
          key={i}
          style={[
            waveStyles.bar,
            { backgroundColor: color, transform: [{ scaleY: a }] },
          ]}
        />
      ))}
    </View>
  );
}

const waveStyles = StyleSheet.create({
  container: { flexDirection: "row", alignItems: "center", gap: 5, height: 48 },
  bar: { width: 5, height: 40, borderRadius: 3 },
});

// ─── Always-spinning dots (never stops) ──────────────────────────────────────
function SpinningDots({ color }: { color: string }) {
  const rotation = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Start immediately and never stop — loop is infinite
    const loop = Animated.loop(
      Animated.timing(rotation, {
        toValue: 1,
        duration: 1200,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    loop.start();
    return () => loop.stop();
  }, []);

  const spin = rotation.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] });
  const DOT_COUNT = 8;
  const RADIUS = 32;

  return (
    <View
      style={{
        width: RADIUS * 2 + 16,
        height: RADIUS * 2 + 16,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Animated.View
        style={{
          transform: [{ rotate: spin }],
          width: RADIUS * 2 + 16,
          height: RADIUS * 2 + 16,
        }}
      >
        {Array.from({ length: DOT_COUNT }).map((_, i) => {
          const angle = (i / DOT_COUNT) * 2 * Math.PI;
          const x = RADIUS * Math.cos(angle);
          const y = RADIUS * Math.sin(angle);
          const opacity = 0.25 + (i / DOT_COUNT) * 0.75;
          const size = 6 + (i / DOT_COUNT) * 4;
          return (
            <View
              key={i}
              style={{
                position: "absolute",
                width: size,
                height: size,
                borderRadius: size / 2,
                backgroundColor: color,
                opacity,
                left: RADIUS + 8 + x - size / 2,
                top: RADIUS + 8 + y - size / 2,
              }}
            />
          );
        })}
      </Animated.View>
    </View>
  );
}

// ─── Cycling status text ──────────────────────────────────────────────────────
const STATUS_STEPS = [
  "Transcribing your voice...",
  "Reading your words...",
  "Analyzing habits...",
  "Extracting journal notes...",
  "Finding gratitude moments...",
  "Almost there...",
];

function CyclingStatusText({ color }: { color: string }) {
  const [stepIndex, setStepIndex] = useState(0);
  const fadeAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    let current = 0;
    const cycle = () => {
      // Fade out
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }).start(() => {
        current = (current + 1) % STATUS_STEPS.length;
        setStepIndex(current);
        // Fade in
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }).start();
      });
    };
    const interval = setInterval(cycle, 2200);
    return () => clearInterval(interval);
  }, []);

  return (
    <Animated.Text
      style={[statusStyles.text, { color, opacity: fadeAnim }]}
    >
      {STATUS_STEPS[stepIndex]}
    </Animated.Text>
  );
}

const statusStyles = StyleSheet.create({
  text: { fontSize: 15, textAlign: "center", lineHeight: 22 },
});

// ─── Habit prompt card (shown during listening) ───────────────────────────────
function HabitPromptCard({
  habits,
  colors,
}: {
  habits: Array<{ id: string; name: string; emoji?: string }>;
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <View
      style={[
        promptStyles.card,
        { backgroundColor: colors.surface, borderColor: colors.border },
      ]}
    >
      <Text style={[promptStyles.title, { color: colors.foreground }]}>
        What to talk about
      </Text>

      {/* Example phrase */}
      <View style={[promptStyles.exampleRow, { backgroundColor: colors.primary + "18", borderColor: colors.primary + "44" }]}>
        <Text style={[promptStyles.exampleLabel, { color: colors.primary }]}>Example</Text>
        <Text style={[promptStyles.exampleText, { color: colors.foreground }]}>
          "I crushed my workout today — did a full 45-min run. I'm grateful for the sunny weather. Didn't get enough sleep though."
        </Text>
      </View>

      {/* Habits list */}
      {habits.length > 0 && (
        <View style={promptStyles.section}>
          <Text style={[promptStyles.sectionLabel, { color: colors.muted }]}>
            YOUR HABITS
          </Text>
          <View style={promptStyles.habitGrid}>
            {habits.map((h) => (
              <View
                key={h.id}
                style={[promptStyles.habitChip, { borderColor: colors.border, backgroundColor: colors.background }]}
              >
                {h.emoji ? (
                  <Text style={promptStyles.habitEmoji}>{h.emoji}</Text>
                ) : null}
                <Text style={[promptStyles.habitName, { color: colors.foreground }]} numberOfLines={1}>
                  {h.name}
                </Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* Gratitude hint */}
      <View style={[promptStyles.gratitudeRow, { borderTopColor: colors.border }]}>
        <Text style={promptStyles.gratitudeEmoji}>🙏</Text>
        <Text style={[promptStyles.gratitudeText, { color: colors.muted }]}>
          Share 1–3 things you're grateful for today
        </Text>
      </View>
    </View>
  );
}

const promptStyles = StyleSheet.create({
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    gap: 12,
    width: "100%",
  },
  title: { fontSize: 15, fontWeight: "700" },
  exampleRow: {
    borderRadius: 10,
    borderWidth: 1,
    padding: 10,
    gap: 4,
  },
  exampleLabel: { fontSize: 10, fontWeight: "700", letterSpacing: 0.8 },
  exampleText: { fontSize: 13, lineHeight: 19, fontStyle: "italic" },
  section: { gap: 8 },
  sectionLabel: { fontSize: 10, fontWeight: "700", letterSpacing: 0.8 },
  habitGrid: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  habitChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
  },
  habitEmoji: { fontSize: 13 },
  habitName: { fontSize: 13, fontWeight: "500", maxWidth: 120 },
  gratitudeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  gratitudeEmoji: { fontSize: 16 },
  gratitudeText: { fontSize: 13, lineHeight: 18, flex: 1 },
});

// ─── Habit result card ────────────────────────────────────────────────────────
const RATING_COLORS = { green: "#22C55E", yellow: "#F59E0B", red: "#EF4444" } as const;
const RATING_LABELS = { green: "Crushed it", yellow: "Okay", red: "Missed" } as const;

function HabitResultCard({
  item,
  onRatingChange,
  onNoteChange,
  colors,
}: {
  item: HabitResult;
  onRatingChange: (habitId: string, rating: "green" | "yellow" | "red") => void;
  onNoteChange: (habitId: string, note: string) => void;
  colors: ReturnType<typeof useColors>;
}) {
  const ratings: Array<"green" | "yellow" | "red"> = ["green", "yellow", "red"];

  return (
    <View
      style={[
        cardStyles.card,
        { backgroundColor: colors.surface, borderColor: colors.border },
      ]}
    >
      <Text style={[cardStyles.habitName, { color: colors.foreground }]}>
        {item.habitName}
      </Text>
      {item.note ? (
        <TextInput
          style={[
            cardStyles.noteInput,
            { color: colors.muted, borderColor: colors.border },
          ]}
          value={item.note}
          onChangeText={(t) => onNoteChange(item.habitId, t)}
          multiline
          placeholder="AI note..."
          placeholderTextColor={colors.muted + "88"}
        />
      ) : null}
      <View style={cardStyles.ratingRow}>
        {ratings.map((r) => {
          const isSelected = item.rating === r;
          return (
            <TouchableOpacity
              key={r}
              style={[
                cardStyles.ratingBtn,
                {
                  backgroundColor: isSelected ? RATING_COLORS[r] + "22" : "transparent",
                  borderColor: isSelected ? RATING_COLORS[r] : colors.border,
                },
              ]}
              onPress={() => {
                if (Platform.OS !== "web")
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                onRatingChange(item.habitId, r);
              }}
              activeOpacity={0.7}
            >
              <View
                style={[cardStyles.ratingDot, { backgroundColor: RATING_COLORS[r] }]}
              />
              <Text
                style={[
                  cardStyles.ratingLabel,
                  { color: isSelected ? RATING_COLORS[r] : colors.muted },
                ]}
              >
                {RATING_LABELS[r]}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const cardStyles = StyleSheet.create({
  card: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    marginBottom: 10,
    gap: 10,
  },
  habitName: { fontSize: 15, fontWeight: "600" },
  noteInput: {
    fontSize: 13,
    borderWidth: 1,
    borderRadius: 8,
    padding: 8,
    minHeight: 36,
  },
  ratingRow: { flexDirection: "row", gap: 8 },
  ratingBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1.5,
  },
  ratingDot: { width: 8, height: 8, borderRadius: 4 },
  ratingLabel: { fontSize: 12, fontWeight: "600" },
});

// ─── Main screen ──────────────────────────────────────────────────────────────
export default function VoiceCheckinScreen() {
  const colors = useColors();
  const router = useRouter();
  const { habits } = useApp();

  // Start directly in listening phase — idle screen never renders
  const [phase, setPhase] = useState<Phase>("listening");
  const [results, setResults] = useState<ParsedResults | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // ── Web recorder ──────────────────────────────────────────────────────────
  const webRecorder = useWebRecorder();

  // ── Native recorder (expo-audio hooks must be called unconditionally) ─────
  const nativeRecorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const nativeRecorderState = useAudioRecorderState(nativeRecorder);

  // Unified isRecording
  const isRecording =
    Platform.OS === "web" ? webRecorder.isRecording : nativeRecorderState.isRecording;

  // Mic pulse animation for idle state
  const pulseAnim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.08,
          duration: 900,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 900,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);

  // tRPC combined mutation (single call = faster)
  const transcribeAndAnalyze = trpc.voiceCheckin.transcribeAndAnalyze.useMutation();

  // ── Auto-start recording on mount (no delay, no idle flash) ─────────────
  const hasAutoStarted = useRef(false);
  useEffect(() => {
    if (hasAutoStarted.current) return;
    hasAutoStarted.current = true;
    startRecording();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Start recording ──────────────────────────────────────────────────────
  const startRecording = useCallback(async () => {
    setErrorMsg(null);

    if (Platform.OS === "web") {
      const ok = await webRecorder.start();
      if (!ok) {
        const msg = webRecorder.micError ?? "Could not access microphone.";
        setErrorMsg(msg);
        Alert.alert("Microphone Error", msg);
        return;
      }
      setPhase("listening");
      return;
    }

    // Native path
    try {
      const perm = await requestRecordingPermissionsAsync();
      if (!perm.granted) {
        Alert.alert(
          "Microphone Permission",
          "Please allow microphone access to use voice check-in."
        );
        return;
      }
      await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true });
      await nativeRecorder.prepareToRecordAsync();
      nativeRecorder.record();
      setPhase("listening");
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch (err: any) {
      console.error("[VoiceCheckin] native start error:", err);
      Alert.alert("Error", "Could not start recording. Please try again.");
    }
  }, [webRecorder, nativeRecorder]);

  // ── Stop & analyze (single combined API call) ────────────────────────────
  const stopAndAnalyze = useCallback(async () => {
    setPhase("analyzing");
    if (Platform.OS !== "web")
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    try {
      let audioBase64 = "";
      let mimeType = "audio/webm";

      if (Platform.OS === "web") {
        const blob = await webRecorder.stop();
        if (!blob || blob.size === 0) {
          throw new Error("No audio recorded. Please try again.");
        }
        audioBase64 = await blobToBase64(blob);
        mimeType = webRecorder.getMimeType();
      } else {
        await nativeRecorder.stop();
        const uri = nativeRecorder.uri;
        if (!uri) throw new Error("No recording URI.");
        audioBase64 = await FileSystem.readAsStringAsync(uri, {
          encoding: FileSystem.EncodingType.Base64,
        });
        mimeType = "audio/m4a";
      }

      // Single combined call: transcribe + analyze habits + extract journal/gratitude
      const habitList = habits.map((h) => ({ id: h.id, name: h.name }));
      const combined = await transcribeAndAnalyze.mutateAsync({
        audioBase64,
        mimeType,
        habits: habitList,
      });

      // Build habit results from the combined response
      const habitResults: HabitResult[] = Object.entries(combined.habitResults)
        .map(([habitId, data]) => {
          const habit = habits.find((h) => h.id === habitId);
          if (!habit) return null;
          return {
            habitId,
            habitName: habit.name,
            rating: data.rating,
            note: data.note,
          };
        })
        .filter(Boolean) as HabitResult[];

      setResults({
        habitResults,
        journalEntries: combined.journalEntries,
        gratitudeItems: combined.gratitudeItems,
        transcript: combined.transcript,
      });
      setPhase("results");
    } catch (err: any) {
      console.error("[VoiceCheckin] analyze error:", err);
      const msg = err?.message ?? "Could not process your recording. Please try again.";
      setErrorMsg(msg);
      Alert.alert("Error", msg);
      setPhase("idle");
    }
  }, [webRecorder, nativeRecorder, habits, transcribeAndAnalyze]);

  // ── Update habit rating ──────────────────────────────────────────────────
  const handleRatingChange = useCallback(
    (habitId: string, rating: "green" | "yellow" | "red") => {
      setResults((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          habitResults: prev.habitResults.map((r) =>
            r.habitId === habitId ? { ...r, rating } : r
          ),
        };
      });
    },
    []
  );

  const handleNoteChange = useCallback((habitId: string, note: string) => {
    setResults((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        habitResults: prev.habitResults.map((r) =>
          r.habitId === habitId ? { ...r, note } : r
        ),
      };
    });
  }, []);

  // ── Save everything ──────────────────────────────────────────────────────
  const handleLog = useCallback(async () => {
    if (!results) return;
    setIsSaving(true);
    try {
      const today = todayDateStr();
      const allHabitIds = habits.map((h) => h.id);

      // 1. Save habit check-ins
      const ratingsMap: Record<string, Rating> = {};
      for (const r of results.habitResults) {
        if (r.rating) ratingsMap[r.habitId] = r.rating as Rating;
      }
      if (Object.keys(ratingsMap).length > 0) {
        await submitCheckIn(today, ratingsMap, allHabitIds);
      }

      // 2. Save journal entry
      const uid = await getLastUserId();
      const userId = uid || "default";

      let body = results.transcript || results.journalEntries.join("\n\n");
      if (results.gratitudeItems.length > 0) {
        body +=
          "\n\n🙏 Grateful for:\n" +
          results.gratitudeItems.map((g, i) => `${i + 1}. ${g}`).join("\n");
      }

      const entry = {
        id: generateId(),
        userId,
        date: today,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        title: "Voice Check-in",
        body,
        template: "blank" as const,
        attachments: [],
        tags: ["voice"],
        gratitudes: results.gratitudeItems,
        transcriptionStatus: "done" as const,
        transcriptionText: results.transcript,
      };
      await addEntry(userId, entry);

      if (Platform.OS !== "web")
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setPhase("done");
      setTimeout(() => router.back(), 1200);
    } catch (err: any) {
      console.error("[VoiceCheckin] save error:", err);
      Alert.alert("Error", "Could not save your check-in. Please try again.");
    } finally {
      setIsSaving(false);
    }
  }, [results, habits, router]);

  const handleTryAgain = useCallback(() => {
    setPhase("idle");
    setResults(null);
    setErrorMsg(null);
  }, []);

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <ScreenContainer
      edges={["top", "left", "right", "bottom"]}
      containerClassName="bg-background"
    >
      {/* Header */}
      <View style={[headerStyles.row, { borderBottomColor: colors.border }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={headerStyles.closeBtn}
          activeOpacity={0.7}
        >
          <IconSymbol name="xmark" size={20} color={colors.muted} />
        </TouchableOpacity>
        <Text style={[headerStyles.title, { color: colors.foreground }]}>
          {phase === "results" ? "Review Your Check-in" : "Voice Check-in"}
        </Text>
        <View style={{ width: 36 }} />
      </View>

      {/* Error message */}
      {errorMsg && phase === "idle" && (
        <View
          style={[
            errorStyles.box,
            { backgroundColor: "#EF444422", borderColor: "#EF4444" },
          ]}
        >
          <Text style={errorStyles.text}>{errorMsg}</Text>
        </View>
      )}

      {/* IDLE phase */}
      {phase === "idle" && (
        <View style={phaseStyles.center}>
          <Text style={[phaseStyles.subtitle, { color: colors.muted }]}>
            Tap the mic and talk about your habits, gratitude, and how your day went.
          </Text>
          <TouchableOpacity onPress={startRecording} activeOpacity={0.85}>
            <Animated.View
              style={[
                micStyles.outer,
                {
                  borderColor: colors.primary + "44",
                  transform: [{ scale: pulseAnim }],
                },
              ]}
            >
              <View style={[micStyles.inner, { backgroundColor: colors.primary }]}>
                <IconSymbol name="mic.fill" size={36} color="#fff" />
              </View>
            </Animated.View>
          </TouchableOpacity>
          <Text style={[phaseStyles.hint, { color: colors.muted }]}>Tap to start</Text>
        </View>
      )}

      {/* LISTENING phase */}
      {phase === "listening" && (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={listeningStyles.container}
          showsVerticalScrollIndicator={false}
        >
          {/* Waveform + status */}
          <View style={listeningStyles.waveRow}>
            <WaveformBars isActive color={colors.primary} />
            <Text style={[listeningStyles.recordingLabel, { color: colors.primary }]}>
              {isRecording ? "Recording..." : "Starting..."}
            </Text>
          </View>

          {/* Habit prompt card */}
          <HabitPromptCard habits={habits} colors={colors} />

          {/* Send button */}
          <TouchableOpacity
            style={[sendStyles.btn, { backgroundColor: colors.primary }]}
            onPress={stopAndAnalyze}
            activeOpacity={0.85}
          >
            <IconSymbol name="arrow.up" size={22} color="#fff" />
            <Text style={sendStyles.label}>Done — Analyze</Text>
          </TouchableOpacity>
        </ScrollView>
      )}

      {/* ANALYZING phase */}
      {phase === "analyzing" && (
        <View style={phaseStyles.center}>
          <SpinningDots color={colors.primary} />
          <Text style={[phaseStyles.analyzeTitle, { color: colors.foreground }]}>
            Processing...
          </Text>
          <CyclingStatusText color={colors.muted} />
          <Text style={[phaseStyles.analyzeNote, { color: colors.muted + "88" }]}>
            This usually takes 10–20 seconds
          </Text>
        </View>
      )}

      {/* RESULTS phase */}
      {phase === "results" && results && (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={resultsStyles.container}
          showsVerticalScrollIndicator={false}
        >
          {/* Habit cards */}
          {results.habitResults.length > 0 && (
            <View style={resultsStyles.section}>
              <Text style={[resultsStyles.sectionTitle, { color: colors.foreground }]}>
                Habits
              </Text>
              {results.habitResults.map((item) => (
                <HabitResultCard
                  key={item.habitId}
                  item={item}
                  onRatingChange={handleRatingChange}
                  onNoteChange={handleNoteChange}
                  colors={colors}
                />
              ))}
            </View>
          )}

          {/* No habits detected */}
          {results.habitResults.length === 0 && (
            <View
              style={[
                resultsStyles.emptyHabits,
                { backgroundColor: colors.surface, borderColor: colors.border },
              ]}
            >
              <Text style={[resultsStyles.emptyText, { color: colors.muted }]}>
                No specific habits were detected. Your journal entry and gratitude items are saved below.
              </Text>
            </View>
          )}

          {/* Journal block */}
          {(results.journalEntries.length > 0 || results.transcript) && (
            <View style={resultsStyles.section}>
              <Text style={[resultsStyles.sectionTitle, { color: colors.foreground }]}>
                Journal Entry
              </Text>
              <View
                style={[
                  resultsStyles.journalBlock,
                  { backgroundColor: colors.surface, borderColor: colors.border },
                ]}
              >
                <Text style={[resultsStyles.journalText, { color: colors.foreground }]}>
                  {results.journalEntries.length > 0
                    ? results.journalEntries.join("\n\n")
                    : results.transcript}
                </Text>
              </View>
            </View>
          )}

          {/* Gratitude */}
          {results.gratitudeItems.length > 0 && (
            <View style={resultsStyles.section}>
              <Text style={[resultsStyles.sectionTitle, { color: colors.foreground }]}>
                Grateful For
              </Text>
              {results.gratitudeItems.map((g, i) => (
                <View
                  key={i}
                  style={[
                    resultsStyles.gratitudeItem,
                    { backgroundColor: colors.surface, borderColor: colors.border },
                  ]}
                >
                  <Text style={[resultsStyles.gratitudeText, { color: colors.foreground }]}>
                    {g}
                  </Text>
                </View>
              ))}
            </View>
          )}

          {/* Action buttons */}
          <View style={resultsStyles.actions}>
            <TouchableOpacity
              style={[resultsStyles.tryAgainBtn, { borderColor: colors.border }]}
              onPress={handleTryAgain}
              activeOpacity={0.7}
            >
              <Text style={[resultsStyles.tryAgainText, { color: colors.muted }]}>
                Try Again
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                resultsStyles.logBtn,
                { backgroundColor: colors.primary, opacity: isSaving ? 0.6 : 1 },
              ]}
              onPress={handleLog}
              disabled={isSaving}
              activeOpacity={0.85}
            >
              <Text style={resultsStyles.logText}>
                {isSaving ? "Saving..." : "Log"}
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      )}

      {/* DONE phase */}
      {phase === "done" && (
        <View style={phaseStyles.center}>
          <View
            style={[
              doneStyles.circle,
              { backgroundColor: "#22C55E22", borderColor: "#22C55E44" },
            ]}
          >
            <IconSymbol name="checkmark.circle.fill" size={56} color="#22C55E" />
          </View>
          <Text style={[doneStyles.title, { color: colors.foreground }]}>Logged!</Text>
          <Text style={[phaseStyles.hint, { color: colors.muted }]}>
            Your check-in has been saved.
          </Text>
        </View>
      )}
    </ScreenContainer>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const headerStyles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  closeBtn: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { fontSize: 17, fontWeight: "700" },
});

const errorStyles = StyleSheet.create({
  box: {
    marginHorizontal: 16,
    marginTop: 8,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  text: { color: "#EF4444", fontSize: 13, lineHeight: 18 },
});

const phaseStyles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    gap: 20,
  },
  subtitle: { fontSize: 15, textAlign: "center", lineHeight: 22 },
  hint: { fontSize: 13, textAlign: "center" },
  analyzeTitle: { fontSize: 22, fontWeight: "700" },
  analyzeNote: { fontSize: 12, textAlign: "center", marginTop: -8 },
});

const micStyles = StyleSheet.create({
  outer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  inner: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 8,
  },
});

const listeningStyles = StyleSheet.create({
  container: {
    padding: 16,
    paddingBottom: 32,
    gap: 16,
    alignItems: "center",
  },
  waveRow: {
    alignItems: "center",
    gap: 8,
    paddingVertical: 8,
  },
  recordingLabel: { fontSize: 13, fontWeight: "600" },
});

const sendStyles = StyleSheet.create({
  btn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 30,
    width: "100%",
    justifyContent: "center",
  },
  label: { color: "#fff", fontSize: 16, fontWeight: "700" },
});

const resultsStyles = StyleSheet.create({
  container: { padding: 16, paddingBottom: 40 },
  section: { marginBottom: 20 },
  sectionTitle: { fontSize: 16, fontWeight: "700", marginBottom: 10 },
  journalBlock: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
  },
  journalText: { fontSize: 14, lineHeight: 22 },
  gratitudeItem: {
    borderRadius: 10,
    borderWidth: 1,
    padding: 12,
    marginBottom: 6,
  },
  gratitudeText: { fontSize: 14, lineHeight: 20 },
  emptyHabits: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    marginBottom: 20,
  },
  emptyText: { fontSize: 13, lineHeight: 20, textAlign: "center" },
  actions: {
    flexDirection: "row",
    gap: 12,
    marginTop: 8,
  },
  tryAgainBtn: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  tryAgainText: { fontSize: 15, fontWeight: "600" },
  logBtn: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 14,
    borderRadius: 14,
  },
  logText: { color: "#fff", fontSize: 15, fontWeight: "700" },
});

const doneStyles = StyleSheet.create({
  circle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { fontSize: 24, fontWeight: "700" },
});
