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
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  Alert,
  Animated,
  Dimensions,
  Easing,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
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
import { CategoryIcon } from "@/components/category-icon";
import { useColors } from "@/hooks/use-colors";
import { useApp } from "@/lib/app-context";
import { trpc } from "@/lib/trpc";
import { addEntry, loadEntries, updateEntry, generateId, todayDateStr } from "@/lib/journal-store";
import { getLastUserId, loadDayNotes, saveDayNotes, type Rating } from "@/lib/storage";

/// ─── Scrolling Waveform (iOS Voice Memos style) ─────────────────────────────
// Renders a horizontal scrolling waveform with bars flowing left.
// On web: uses Web Audio API AnalyserNode for real amplitude.
// On native: uses expo-audio metering (dB → 0-1).
function ScrollingWaveform({
  color,
  isActive,
  nativeMeteringRef,
  containerWidth,
}: {
  color: string;
  isActive: boolean;
  nativeMeteringRef?: React.RefObject<number>;
  containerWidth?: number;
}) {
  const BAR_WIDTH = 3;
  const BAR_GAP = 2;
  const CONTAINER_WIDTH = containerWidth ?? (Dimensions.get('window').width - 32);
  const CONTAINER_HEIGHT = 80;
  const MAX_BAR_HEIGHT = 72;
  const TOTAL_BARS = Math.floor(CONTAINER_WIDTH / (BAR_WIDTH + BAR_GAP)) + 2;

  // Rolling buffer of amplitude values (0–1)
  const bufferRef = useRef<number[]>(Array(TOTAL_BARS).fill(0));
  const [bars, setBars] = useState<number[]>(Array(TOTAL_BARS).fill(0));

  // Web Audio analyser
  const analyserRef = useRef<any>(null);
  const audioCtxRef = useRef<any>(null);
  const dataArrayRef = useRef<Uint8Array | null>(null);

  // Interval ref
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!isActive) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = null;
      // Fade bars to 0 gradually
      let fadeCount = 0;
      const fadeInterval = setInterval(() => {
        fadeCount++;
        bufferRef.current = bufferRef.current.map((v) => Math.max(0, v - 0.08));
        setBars([...bufferRef.current]);
        if (fadeCount > 15) clearInterval(fadeInterval);
      }, 60);
      return () => {
        clearInterval(fadeInterval);
        if (audioCtxRef.current) {
          audioCtxRef.current.close().catch(() => {});
          audioCtxRef.current = null;
          analyserRef.current = null;
        }
      };
    }

    // Set up Web Audio API on web
    if (Platform.OS === "web" && typeof window !== "undefined" && typeof AudioContext !== "undefined") {
      try {
        const ctx = new AudioContext();
        audioCtxRef.current = ctx;
        navigator.mediaDevices
          .getUserMedia({ audio: true })
          .then((stream) => {
            const source = ctx.createMediaStreamSource(stream);
            const analyser = ctx.createAnalyser();
            analyser.fftSize = 256;
            analyser.smoothingTimeConstant = 0.5;
            source.connect(analyser);
            analyserRef.current = analyser;
            dataArrayRef.current = new Uint8Array(analyser.frequencyBinCount);
          })
          .catch(() => {});
      } catch (_) {}
    }

    // Sample amplitude every 80ms and push to rolling buffer
    intervalRef.current = setInterval(() => {
      let amplitude = 0;

      if (Platform.OS === "web" && analyserRef.current && dataArrayRef.current) {
        analyserRef.current.getByteFrequencyData(dataArrayRef.current);
        const sum = dataArrayRef.current.reduce((a, b) => a + b, 0);
        amplitude = Math.min(1, (sum / dataArrayRef.current.length) / 80);
        // Add slight noise floor so bars are never completely flat
        if (amplitude < 0.04) amplitude = 0.02 + Math.random() * 0.03;
      } else if (nativeMeteringRef?.current !== undefined) {
        // Native: dB value from expo-audio metering (-160 to 0)
        const db = nativeMeteringRef.current ?? -60;
        amplitude = Math.max(0, Math.min(1, (db + 60) / 60));
        if (amplitude < 0.04) amplitude = 0.02 + Math.random() * 0.03;
      } else {
        // Fallback: animated random bars
        amplitude = 0.15 + Math.random() * 0.5;
      }

      // Shift buffer left and push new value
      bufferRef.current = [...bufferRef.current.slice(1), amplitude];
      setBars([...bufferRef.current]);
    }, 80);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = null;
    };
  }, [isActive]);

  const midY = CONTAINER_HEIGHT / 2;

  return (
    <View
      style={{
        width: CONTAINER_WIDTH,
        height: CONTAINER_HEIGHT,
        overflow: "hidden",
        alignSelf: "stretch",
      }}
    >
      {/* Horizontal center line */}
      <View
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: midY - 0.5,
          height: 1,
          backgroundColor: color + "33",
        }}
      />
      {/* Bars */}
      <View
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          flexDirection: "row",
          alignItems: "center",
          height: CONTAINER_HEIGHT,
          gap: BAR_GAP,
        }}
      >
        {bars.map((amp, i) => {
          const barH = Math.max(2, amp * MAX_BAR_HEIGHT);
          // Fade older bars (left side)
          const opacity = 0.3 + (i / TOTAL_BARS) * 0.7;
          return (
            <View
              key={i}
              style={{
                width: BAR_WIDTH,
                height: barH,
                borderRadius: BAR_WIDTH / 2,
                backgroundColor: color,
                opacity,
              }}
            />
          );
        })}
      </View>
    </View>
  );
}

// ─── Web MediaRecorder hook ─────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function useWebRecorder() {
  const mediaRecorderRef = useRef<any>(null);
  const streamRef = useRef<any>(null);
  const allChunksRef = useRef<Blob[]>([]);
  const mimeTypeRef = useRef<string>("audio/webm");
  const [isRecording, setIsRecording] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);;

  const start = useCallback(async (): Promise<boolean> => {
    setMicError(null);
    allChunksRef.current = [];
    try {
      if (typeof navigator === 'undefined' || !navigator.mediaDevices) { setMicError('Recording not available on this platform'); return false; }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      let mimeType = "";
      if (typeof MediaRecorder !== 'undefined' && typeof MediaRecorder.isTypeSupported === "function") {
        if (MediaRecorder.isTypeSupported("audio/webm;codecs=opus")) mimeType = "audio/webm;codecs=opus";
        else if (MediaRecorder.isTypeSupported("audio/webm")) mimeType = "audio/webm";
        else if (MediaRecorder.isTypeSupported("audio/mp4")) mimeType = "audio/mp4";
      }
      mimeTypeRef.current = mimeType || "audio/webm";
      if (typeof MediaRecorder === 'undefined') { setMicError('Recording not available on this platform'); return false; }
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
          streamRef.current?.getTracks().forEach((t: any) => t.stop());
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
function blobToBase64(blob: any): Promise<string> {
  return new Promise((resolve, reject) => {
    if (typeof FileReader === 'undefined') { reject(new Error('FileReader not available')); return; }
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
                <Text style={[promptStyles.habitName, { color: colors.foreground }]}>
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
  habitName: { fontSize: 13, fontWeight: "500" },
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
  const { habits, activeHabits, categories, submitCheckIn: appSubmitCheckIn } = useApp();
  const sortedCategories = useMemo(() => [...categories].sort((a, b) => a.order - b.order), [categories]);
  const habitsByCategory = useMemo(() => {
    const map: Record<string, typeof activeHabits> = {};
    for (const cat of categories) map[cat.id] = [];
    for (const h of activeHabits) {
      if (!map[h.category]) map[h.category] = [];
      map[h.category].push(h);
    }
    return map;
  }, [activeHabits, categories]);

  // Safe area insets for proper bottom padding
  const insets = useSafeAreaInsets();

  // Waveform collapse state — collapses when user scrolls down
  const [waveformCollapsed, setWaveformCollapsed] = useState(false);
  const waveformHeight = useRef(new Animated.Value(1)).current; // 1 = expanded, 0 = collapsed
  const lastScrollY = useRef(0);

  const handleListeningScroll = useCallback((e: any) => {
    const y = e.nativeEvent.contentOffset.y;
    const prev = lastScrollY.current;
    lastScrollY.current = y;
    if (y > 40 && prev <= 40) {
      // Scrolled down past threshold — collapse
      setWaveformCollapsed(true);
      Animated.timing(waveformHeight, { toValue: 0, duration: 250, useNativeDriver: false }).start();
    } else if (y < 20 && prev >= 20) {
      // Scrolled back to top — expand
      setWaveformCollapsed(false);
      Animated.timing(waveformHeight, { toValue: 1, duration: 250, useNativeDriver: false }).start();
    }
  }, [waveformHeight]);

  // Start directly in listening phase — idle screen never renders
  const [phase, setPhase] = useState<Phase>("listening");
  const [results, setResults] = useState<ParsedResults | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Flat ratings map for the classic check-in UI (habitId -> rating)
  // Derived from results.habitResults; updated when user taps a segment
  const [vcRatings, setVcRatings] = useState<Record<string, "red" | "yellow" | "green" | "none">>({});

  // Editable transcript (full text shown in Journal Entry)
  const [editedTranscript, setEditedTranscript] = useState("");
  // Date being saved — defaults to today, user can change it
  const [saveDate, setSaveDate] = useState<string>(todayDateStr());
  const [datepickerVisible, setDatepickerVisible] = useState(false);

  // Journal popup — auto-opens when results arrive
  const [journalModalVisible, setJournalModalVisible] = useState(false);

  // Editable habit descriptions (habitId -> description)
  const [editedDescriptions, setEditedDescriptions] = useState<Record<string, string>>({});

  // Sync vcRatings, editedTranscript, editedDescriptions when results arrive
  useEffect(() => {
    if (!results) return;
    const map: Record<string, "red" | "yellow" | "green" | "none"> = {};
    for (const r of results.habitResults) {
      map[r.habitId] = r.rating ?? "none";
    }
    setVcRatings(map);
    // Pre-fill transcript editor with full transcript
    setEditedTranscript(results.transcript || results.journalEntries.join("\n\n"));
    // Pre-fill habit descriptions: AI-extracted note takes priority over stored description
    // The AI returns a 3-8 word punchy note per habit (e.g. "2-hour mountain hike")
    const descMap: Record<string, string> = {};
    for (const h of activeHabits) {
      const aiNote = results.habitResults.find((r) => r.habitId === h.id)?.note;
      // Use AI note if it's meaningful (not empty/generic), otherwise fall back to stored description
      descMap[h.id] = aiNote && aiNote.trim().length > 0 ? aiNote.trim() : (h.description ?? "");
    }
    setEditedDescriptions(descMap);
  }, [results, activeHabits]);

  // ── Web recorder ──────────────────────────────────────────────────────────
  const webRecorder = useWebRecorder();

  // ── Native recorder (expo-audio hooks must be called unconditionally) ─────
  // Enable isMeteringEnabled so RecorderState.metering is populated with dB values
  const nativeRecorder = useAudioRecorder({ ...RecordingPresets.HIGH_QUALITY, isMeteringEnabled: true });
  // Poll at 100ms for smooth waveform updates
  const nativeRecorderState = useAudioRecorderState(nativeRecorder, 100);

  // Ref that ScrollingWaveform reads on each 80ms tick to get the latest dB level
  const nativeMeteringRef = useRef<number>(-60);

  // Unified isRecording
  const isRecording =
    Platform.OS === "web" ? webRecorder.isRecording : nativeRecorderState.isRecording;

  // Keep nativeMeteringRef in sync with the latest metering value from expo-audio
  // nativeRecorderState.metering is a dB value (typically -160 to 0)
  useEffect(() => {
    if (Platform.OS !== "web" && nativeRecorderState.metering !== undefined) {
      nativeMeteringRef.current = nativeRecorderState.metering;
    }
  }, [nativeRecorderState.metering]);

  // ── Live recording timer ──────────────────────────────────────────────────
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  useEffect(() => {
    if (!isRecording) {
      setRecordingSeconds(0);
      return;
    }
    const t = setInterval(() => setRecordingSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [isRecording]);

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

  // tRPC mutations
  const transcribeAndAnalyze = trpc.voiceCheckin.transcribeAndAnalyze.useMutation();
  const transcribeChunk = trpc.voiceCheckin.transcribeChunk.useMutation();
  const analyzeTranscript = trpc.voiceCheckin.analyzeTranscript.useMutation();
  const analyzeTranscriptFull = trpc.voiceCheckin.analyzeTranscriptFull.useMutation();

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

  // ── Stop & analyze (chunked for large recordings, single call for small) ───
  const stopAndAnalyze = useCallback(async () => {
    setPhase("analyzing");
    if (Platform.OS !== "web")
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    try {
      let audioBase64 = "";
      let mimeType = "audio/webm";
      let blobSizeMB = 0;
      let rawBlob: Blob | null = null;

      if (Platform.OS === "web") {
        rawBlob = await webRecorder.stop();
        if (!rawBlob || rawBlob.size === 0) {
          throw new Error("No audio recorded. Please try again.");
        }
        blobSizeMB = rawBlob.size / (1024 * 1024);
        mimeType = webRecorder.getMimeType();
      } else {
        await nativeRecorder.stop();
        const uri = nativeRecorder.uri;
        if (!uri) throw new Error("No recording URI.");
        audioBase64 = await FileSystem.readAsStringAsync(uri, {
          encoding: FileSystem.EncodingType.Base64,
        });
        mimeType = "audio/m4a";
        // Estimate size from base64 length
        blobSizeMB = (audioBase64.length * 0.75) / (1024 * 1024);
      }

      const habitList = habits.map((h) => ({ id: h.id, name: h.name }));

      // ── Small recording (≤10 MB): single combined call ───────────────────
      if (blobSizeMB <= 10) {
        if (rawBlob) audioBase64 = await blobToBase64(rawBlob);
        const combined = await transcribeAndAnalyze.mutateAsync({
          audioBase64,
          mimeType,
          habits: habitList,
        });
        const habitResults: HabitResult[] = Object.entries(combined.habitResults)
          .map(([habitId, data]) => {
            const habit = habits.find((h) => h.id === habitId);
            if (!habit) return null;
            return { habitId, habitName: habit.name, rating: data.rating, note: data.note };
          })
          .filter(Boolean) as HabitResult[];
        setResults({
          habitResults,
          journalEntries: combined.journalEntries,
          gratitudeItems: combined.gratitudeItems,
          transcript: combined.transcript,
        });
        setPhase("results");
        return;
      }

      // ── Large recording (>10 MB): chunk into ~5 MB pieces ───────────────
      // Split the blob into ~5 MB chunks and transcribe sequentially
      const CHUNK_SIZE = 5 * 1024 * 1024; // 5 MB per chunk
      let transcriptParts: string[] = [];
      let prevTranscript = "";

      if (rawBlob) {
        // Web: split Blob directly
        let offset = 0;
        while (offset < rawBlob.size) {
          const chunkBlob = rawBlob.slice(offset, offset + CHUNK_SIZE, mimeType);
          const chunkBase64 = await blobToBase64(chunkBlob);
          const result = await transcribeChunk.mutateAsync({
            audioBase64: chunkBase64,
            mimeType,
            previousTranscript: prevTranscript,
          });
          if (result.error) throw new Error(`Transcription chunk failed: ${result.error}`);
          transcriptParts.push(result.delta);
          prevTranscript = result.delta;
          offset += CHUNK_SIZE;
        }
      } else {
        // Native: split base64 string by character count (~5 MB raw = ~6.67 MB base64)
        const CHUNK_B64 = Math.ceil((CHUNK_SIZE * 4) / 3);
        let pos = 0;
        while (pos < audioBase64.length) {
          const chunkB64 = audioBase64.slice(pos, pos + CHUNK_B64);
          const result = await transcribeChunk.mutateAsync({
            audioBase64: chunkB64,
            mimeType,
            previousTranscript: prevTranscript,
          });
          if (result.error) throw new Error(`Transcription chunk failed: ${result.error}`);
          transcriptParts.push(result.delta);
          prevTranscript = result.delta;
          pos += CHUNK_B64;
        }
      }

      const fullTranscript = transcriptParts.join(" ").trim();

      // Single LLM call: habits + journal + gratitude from merged transcript
      const analysis = await analyzeTranscriptFull.mutateAsync({
        transcript: fullTranscript,
        habits: habitList,
      });

      const habitResults: HabitResult[] = Object.entries(analysis.habitResults)
        .map(([habitId, data]) => {
          const habit = habits.find((h) => h.id === habitId);
          if (!habit) return null;
          return { habitId, habitName: habit.name, rating: data.rating, note: data.note };
        })
        .filter(Boolean) as HabitResult[];

      setResults({
        habitResults,
        journalEntries: analysis.journalEntries,
        gratitudeItems: analysis.gratitudeItems,
        transcript: fullTranscript,
      });
      setPhase("results");
      // Auto-open journal popup after a short delay so the results screen renders first
      setTimeout(() => setJournalModalVisible(true), 400);
    } catch (err: any) {
      console.error("[VoiceCheckin] analyze error:", err);
      const msg = err?.message ?? "Could not process your recording. Please try again.";
      setErrorMsg(msg);
      Alert.alert("Error", msg);
      setPhase("idle");
    }
  }, [webRecorder, nativeRecorder, habits, transcribeAndAnalyze, transcribeChunk, analyzeTranscript]);

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
      const today = saveDate; // use user-selected date (defaults to today)
      const allHabitIds = habits.map((h) => h.id);

      // 1. Save habit check-ins (use vcRatings which reflects user edits)
      const ratingsMap: Record<string, Rating> = {};
      for (const [habitId, rating] of Object.entries(vcRatings)) {
        if (rating && rating !== 'none') ratingsMap[habitId] = rating as Rating;
      }
      if (Object.keys(ratingsMap).length > 0) {
        // Use the app-context submitCheckIn so it dispatches SET_CHECKINS and updates
        // the in-memory state immediately — the journal day-view will see the new ratings
        // without requiring an app restart.
        await appSubmitCheckIn(today, ratingsMap);
      }

      // 2. Save habit notes — use editedDescriptions (user-edited) if available, else fall back to AI results
      const habitNotesToSave: Array<{ habitId: string; note: string }> = [];
      for (const [habitId, note] of Object.entries(editedDescriptions)) {
        if (note && note.trim()) habitNotesToSave.push({ habitId, note: note.trim() });
      }
      // Fall back to original AI notes for any habit not in editedDescriptions
      for (const r of results.habitResults) {
        if (!editedDescriptions[r.habitId] && r.note && r.note.trim()) {
          habitNotesToSave.push({ habitId: r.habitId, note: r.note.trim() });
        }
      }
      if (habitNotesToSave.length > 0) {
        const allNotes = await loadDayNotes();
        for (const { habitId, note } of habitNotesToSave) {
          allNotes[`${habitId}:${today}`] = note;
        }
        await saveDayNotes(allNotes);
      }

      // 3. Save journal entry — append to existing today entry with timestamp separator,
      //    or create a new one if none exists yet.
      const uid = await getLastUserId();
      const userId = uid || "default";

      let newBody = editedTranscript || results.transcript || results.journalEntries.join("\n\n");
      if (results.gratitudeItems.length > 0) {
        newBody +=
          "\n\n🙏 Grateful for:\n" +
          results.gratitudeItems.map((g, i) => `${i + 1}. ${g}`).join("\n");
      }

      // Look for an existing voice check-in entry for today to append to
      const allEntries = await loadEntries(userId);
      const existingToday = allEntries.find(
        (e) => e.date === today && (e.tags?.includes("voice") || e.title === "Voice Check-in")
      );

      if (existingToday) {
        // Append with a clean timestamp separator
        const timeLabel = new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
        const separator = `\n\n── ${timeLabel} ──\n\n`;
        const appendedBody = existingToday.body + separator + newBody;
        // Merge gratitudes (deduplicate)
        const mergedGratitudes = Array.from(
          new Set([...(existingToday.gratitudes ?? []), ...results.gratitudeItems])
        );
        await updateEntry(userId, existingToday.id, {
          body: appendedBody,
          gratitudes: mergedGratitudes,
          transcriptionText: appendedBody,
          updatedAt: new Date().toISOString(),
        });
      } else {
        // First entry of the day — create fresh
        const entry = {
          id: generateId(),
          userId,
          date: today,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          title: "Voice Check-in",
          body: newBody,
          template: "blank" as const,
          attachments: [],
          tags: ["voice"],
          gratitudes: results.gratitudeItems,
          transcriptionStatus: "done" as const,
          transcriptionText: editedTranscript || results.transcript,
        };
        await addEntry(userId, entry);
      }

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
  }, [results, habits, router, vcRatings, editedTranscript, editedDescriptions, appSubmitCheckIn, saveDate]);

  const handleTryAgain = useCallback(() => {
    setResults(null);
    setErrorMsg(null);
    // Go straight back to recording — same as the initial auto-start
    startRecording();
  }, [startRecording]);

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <ScreenContainer
      edges={["top", "left", "right"]}
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
        {phase === 'results' ? (
          <TouchableOpacity
            onPress={() => setDatepickerVisible(true)}
            activeOpacity={0.7}
            style={{ flex: 1, alignItems: 'center' }}
          >
            <Text style={[headerStyles.title, { color: colors.foreground }]}>
              {(() => {
                const [y, m, d] = saveDate.split('-').map(Number);
                return new Date(y, m - 1, d).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
              })()}
            </Text>
            <Text style={{ fontSize: 11, color: colors.primary, marginTop: 1 }}>tap to change date</Text>
          </TouchableOpacity>
        ) : (
          <Text style={[headerStyles.title, { color: colors.foreground, flex: 1, textAlign: 'center' }]}>
            Voice Check-in
          </Text>
        )}
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
        <View style={{ flex: 1 }}>

          {/* Collapsible waveform header — sits above the scroll, animates height */}
          <Animated.View
            style={[
              listeningStyles.waveHeader,
              {
                borderBottomColor: colors.border,
                height: waveformHeight.interpolate({
                  inputRange: [0, 1],
                  outputRange: [44, 130],
                }),
                overflow: 'hidden',
              },
            ]}
          >
            {/* Full waveform — visible when expanded */}
            <Animated.View style={{ opacity: waveformHeight, flex: 1, paddingHorizontal: 16, paddingTop: 8 }}>
              <ScrollingWaveform isActive color={colors.primary} nativeMeteringRef={nativeMeteringRef} />
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
                <Text style={[listeningStyles.recordingLabel, { color: colors.primary }]}>
                  {isRecording ? "Recording..." : "Starting..."}
                </Text>
                <Text style={[listeningStyles.recordingLabel, { color: colors.muted, fontVariant: ['tabular-nums'] }]}>
                  {`${Math.floor(recordingSeconds / 60)}:${String(recordingSeconds % 60).padStart(2, '0')}`}
                </Text>
              </View>
            </Animated.View>

            {/* Mini pill — visible when collapsed */}
            <Animated.View
              style={[
                listeningStyles.miniPill,
                {
                  opacity: waveformHeight.interpolate({ inputRange: [0, 0.4], outputRange: [1, 0] }),
                  backgroundColor: colors.surface,
                },
              ]}
            >
              <View style={[listeningStyles.miniDot, { backgroundColor: colors.primary }]} />
              <Text style={[listeningStyles.miniLabel, { color: colors.primary }]}>
                {isRecording ? "Recording" : "Starting"}
              </Text>
              <Text style={[listeningStyles.miniLabel, { color: colors.muted, fontVariant: ['tabular-nums'] }]}>
                {`${Math.floor(recordingSeconds / 60)}:${String(recordingSeconds % 60).padStart(2, '0')}`}
              </Text>
            </Animated.View>
          </Animated.View>

          {/* Scrollable content */}
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={[listeningStyles.container, { paddingBottom: 24 }]}
            showsVerticalScrollIndicator={false}
            onScroll={handleListeningScroll}
            scrollEventThrottle={16}
          >
            {/* Habit prompt card */}
            <HabitPromptCard habits={habits} colors={colors} />
          </ScrollView>

          {/* Done — Analyze: bulletproof sticky footer */}
          <View
            style={[
              listeningStyles.trueFooter,
              {
                backgroundColor: colors.background,
                borderTopColor: colors.border,
                paddingBottom: insets.bottom > 0 ? insets.bottom + 8 : 16,
              },
            ]}
          >
            <TouchableOpacity
              style={[
                sendStyles.btn,
                {
                  backgroundColor: colors.primary,
                  marginHorizontal: 16,
                  width: undefined,
                  alignSelf: 'stretch',
                },
              ]}
              onPress={stopAndAnalyze}
              activeOpacity={0.85}
            >
              <IconSymbol name="arrow.up" size={22} color="#fff" />
              <Text style={sendStyles.label}>Done — Analyze</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* ANALYZING phase — always mounted so spinner never resets */}
      <View
        style={[
          phaseStyles.center,
          { display: phase === "analyzing" ? "flex" : "none" },
        ]}
        pointerEvents={phase === "analyzing" ? "auto" : "none"}
      >
        <SpinningDots color={colors.primary} />
        <Text style={[phaseStyles.analyzeTitle, { color: colors.foreground }]}>
          Processing...
        </Text>
        <CyclingStatusText color={colors.muted} />
        <Text style={[phaseStyles.analyzeNote, { color: colors.muted + "88" }]}>
          This usually takes 10–20 seconds
        </Text>
      </View>

      {/* RESULTS phase — classic grouped-category layout */}
      {phase === "results" && results && (
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={0}
        >
          {/* Legend row */}
          <View style={[classicStyles.legendRow, { borderBottomColor: colors.border }]}>
            {(['red', 'yellow', 'green'] as const).map((r) => (
              <View key={r} style={classicStyles.legendItem}>
                <View style={[classicStyles.legendDot, { backgroundColor: RATING_COLORS[r] }]} />
                <Text style={[classicStyles.legendText, { color: colors.muted }]}>
                  {r === 'red' ? 'Missed' : r === 'yellow' ? 'Okay' : 'Crushed it'}
                </Text>
              </View>
            ))}
          </View>

          {/* Rate All row */}
          <View style={[classicStyles.rateAllRow, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
            <Text style={[classicStyles.rateAllLabel, { color: colors.muted }]}>Rate All</Text>
            <View style={[classicStyles.segmentedBtn, { backgroundColor: colors.border }]}>
              {(['red', 'yellow', 'green'] as const).map((r, i) => (
                <Pressable
                  key={r}
                  onPress={() => {
                    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
                    const next: Record<string, 'red' | 'yellow' | 'green' | 'none'> = {};
                    for (const h of activeHabits) next[h.id] = r;
                    setVcRatings(next);
                  }}
                  style={({ pressed }) => [
                    classicStyles.segment,
                    i === 0 && classicStyles.segmentFirst,
                    i === 2 && classicStyles.segmentLast,
                    { backgroundColor: RATING_COLORS[r] + (pressed ? 'CC' : '88'), opacity: pressed ? 0.8 : 1 },
                  ]}
                />
              ))}
            </View>
          </View>

          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={classicStyles.scroll}
            showsVerticalScrollIndicator={false}
          >
            {/* Journal block — full transcript, editable — shown at TOP */}
            <View style={classicStyles.journalSection}>
              <Text style={[classicStyles.journalTitle, { color: colors.foreground }]}>Journal Entry</Text>
              <TextInput
                value={editedTranscript}
                onChangeText={setEditedTranscript}
                placeholder="Your voice transcript will appear here..."
                placeholderTextColor={colors.muted + "66"}
                style={[
                  classicStyles.journalBlock,
                  classicStyles.journalTextInput,
                  { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground },
                ]}
                multiline
                scrollEnabled={false}
                textAlignVertical="top"
              />
            </View>

            {/* Grouped habits by category */}
            {sortedCategories.map((cat) => {
              const catHabits = habitsByCategory[cat.id] ?? [];
              if (catHabits.length === 0) return null;
              return (
                <View key={cat.id} style={classicStyles.section}>
                  {/* Category header */}
                  <View style={classicStyles.sectionHeader}>
                    <CategoryIcon categoryId={cat.id} lifeArea={cat.lifeArea} size={18} color={colors.primary} />
                    <Text style={[classicStyles.sectionTitle, { color: colors.foreground }]}>{cat.label}</Text>
                    <View style={{ flex: 1 }} />
                    {/* Rate whole category */}
                    <View style={[classicStyles.segmentedBtn, { backgroundColor: colors.border }]}>
                      {(['red', 'yellow', 'green'] as const).map((r, i) => (
                        <Pressable
                          key={r}
                          onPress={() => {
                            if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                            setVcRatings((prev) => {
                              const next = { ...prev };
                              for (const h of catHabits) next[h.id] = r;
                              return next;
                            });
                          }}
                          style={({ pressed }) => [
                            classicStyles.segment,
                            classicStyles.segmentSmall,
                            i === 0 && classicStyles.segmentFirst,
                            i === 2 && classicStyles.segmentLast,
                            { backgroundColor: RATING_COLORS[r] + (pressed ? 'CC' : '88'), opacity: pressed ? 0.8 : 1 },
                          ]}
                        />
                      ))}
                    </View>
                  </View>

                  {/* Habit rows */}
                  <View style={[classicStyles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    {catHabits.map((habit, idx) => {
                      const current = vcRatings[habit.id] ?? 'none';
                      const isLast = idx === catHabits.length - 1;
                      return (
                        <View
                          key={habit.id}
                          style={[
                            classicStyles.habitRow,
                            !isLast && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
                          ]}
                        >
                          <View style={{ flex: 1 }}>
                            <Text style={[classicStyles.habitName, { color: colors.foreground }]}>{habit.name}</Text>
                            <TextInput
                              value={editedDescriptions[habit.id] ?? ""}
                              onChangeText={(t) =>
                                setEditedDescriptions((prev) => ({ ...prev, [habit.id]: t }))
                              }
                              placeholder="Add a description..."
                              placeholderTextColor={colors.muted + "66"}
                              style={[classicStyles.habitDescInput, { color: colors.muted }]}
                              multiline
                              returnKeyType="done"
                            />
                          </View>
                          {/* 3-color segmented button */}
                          <View style={[classicStyles.segmentedBtn, { backgroundColor: colors.border }]}>
                            {(['red', 'yellow', 'green'] as const).map((r, i) => {
                              const isSelected = current === r;
                              return (
                                <Pressable
                                  key={r}
                                  onPress={() => {
                                    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                    setVcRatings((prev) => ({
                                      ...prev,
                                      [habit.id]: prev[habit.id] === r ? 'none' : r,
                                    }));
                                  }}
                                  style={({ pressed }) => [
                                    classicStyles.segment,
                                    i === 0 && classicStyles.segmentFirst,
                                    i === 2 && classicStyles.segmentLast,
                                    {
                                      backgroundColor: isSelected ? RATING_COLORS[r] : RATING_COLORS[r] + '44',
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
            })}



            {/* Gratitude — editable */}
            {results.gratitudeItems.length > 0 && (
              <View style={classicStyles.journalSection}>
                <Text style={[classicStyles.journalTitle, { color: colors.foreground }]}>Grateful For</Text>
                {results.gratitudeItems.map((g, i) => (
                  <View key={i} style={[classicStyles.gratitudeItem, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <TextInput
                      value={g}
                      onChangeText={(t) =>
                        setResults((prev) => {
                          if (!prev) return prev;
                          const updated = [...prev.gratitudeItems];
                          updated[i] = t;
                          return { ...prev, gratitudeItems: updated };
                        })
                      }
                      style={[classicStyles.journalText, { color: colors.foreground }]}
                      multiline
                      scrollEnabled={false}
                      textAlignVertical="top"
                      placeholderTextColor={colors.muted + "66"}
                      placeholder="What are you grateful for?"
                    />
                  </View>
                ))}
              </View>
            )}

            <View style={{ height: 16 }} />
          </ScrollView>

          {/* Journal Entry Popup */}
          <Modal
            visible={journalModalVisible}
            transparent
            animationType="slide"
            onRequestClose={() => setJournalModalVisible(false)}
          >
            <Pressable
              style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' }}
              onPress={() => setJournalModalVisible(false)}
            />
            <KeyboardAvoidingView
              behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
              style={{ backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingBottom: 40 }}
            >
              {/* Handle */}
              <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: colors.muted + '55', alignSelf: 'center', marginTop: 12, marginBottom: 16 }} />

              {/* Header */}
              <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, marginBottom: 12 }}>
                <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: '#3B82F618', alignItems: 'center', justifyContent: 'center', marginRight: 10 }}>
                  <IconSymbol name="book.fill" size={18} color={colors.primary} />
                </View>
                <Text style={{ fontSize: 17, fontWeight: '700', color: colors.foreground, flex: 1 }}>Journal Entry</Text>
                <Pressable
                  onPress={() => setJournalModalVisible(false)}
                  style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1, padding: 6 })}
                >
                  <Text style={{ fontSize: 14, fontWeight: '600', color: colors.primary }}>Done</Text>
                </Pressable>
              </View>

              {/* Editable transcript */}
              <TextInput
                value={editedTranscript}
                onChangeText={setEditedTranscript}
                placeholder="Your voice transcript will appear here..."
                placeholderTextColor={colors.muted + '66'}
                style={{
                  marginHorizontal: 20,
                  minHeight: 140,
                  maxHeight: 280,
                  backgroundColor: colors.background,
                  borderColor: colors.border,
                  borderWidth: StyleSheet.hairlineWidth,
                  borderRadius: 14,
                  padding: 14,
                  fontSize: 15,
                  lineHeight: 22,
                  color: colors.foreground,
                  textAlignVertical: 'top',
                }}
                multiline
                scrollEnabled
                textAlignVertical="top"
              />

              {/* Gratitude items if any */}
              {results && results.gratitudeItems.length > 0 && (
                <View style={{ marginHorizontal: 20, marginTop: 12 }}>
                  <Text style={{ fontSize: 13, fontWeight: '600', color: colors.muted, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>Grateful For</Text>
                  {results.gratitudeItems.map((g, i) => (
                    <TextInput
                      key={i}
                      value={g}
                      onChangeText={(t) =>
                        setResults((prev) => {
                          if (!prev) return prev;
                          const updated = [...prev.gratitudeItems];
                          updated[i] = t;
                          return { ...prev, gratitudeItems: updated };
                        })
                      }
                      style={{
                        backgroundColor: colors.background,
                        borderColor: colors.border,
                        borderWidth: StyleSheet.hairlineWidth,
                        borderRadius: 12,
                        padding: 12,
                        fontSize: 14,
                        lineHeight: 20,
                        color: colors.foreground,
                        marginBottom: 8,
                        textAlignVertical: 'top',
                      }}
                      multiline
                      scrollEnabled={false}
                      textAlignVertical="top"
                      placeholderTextColor={colors.muted + '66'}
                      placeholder="What are you grateful for?"
                    />
                  ))}
                </View>
              )}
            </KeyboardAvoidingView>
          </Modal>

          {/* Footer: tally + save */}
          <View style={[classicStyles.footer, { backgroundColor: colors.background, borderTopColor: colors.border }]}>
            {(() => {
              const rated = Object.values(vcRatings).filter((r) => r !== 'none');
              const green = rated.filter((r) => r === 'green').length;
              const yellow = rated.filter((r) => r === 'yellow').length;
              const red = rated.filter((r) => r === 'red').length;
              return rated.length > 0 ? (
                <View style={classicStyles.tally}>
                  {green  > 0 && <View style={[classicStyles.tallyPill, { backgroundColor: '#22C55E18' }]}><Text style={[classicStyles.tallyText, { color: '#22C55E' }]}>{green} crushed</Text></View>}
                  {yellow > 0 && <View style={[classicStyles.tallyPill, { backgroundColor: '#F59E0B18' }]}><Text style={[classicStyles.tallyText, { color: '#F59E0B' }]}>{yellow} okay</Text></View>}
                  {red    > 0 && <View style={[classicStyles.tallyPill, { backgroundColor: '#EF444418' }]}><Text style={[classicStyles.tallyText, { color: '#EF4444' }]}>{red} missed</Text></View>}
                  <Text style={[classicStyles.tallyOf, { color: colors.muted }]}>{rated.length}/{activeHabits.length}</Text>
                </View>
              ) : null;
            })()}
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Pressable
                onPress={handleTryAgain}
                style={({ pressed }) => [
                  classicStyles.tryAgainBtn,
                  { borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
                ]}
              >
                <Text style={[classicStyles.tryAgainText, { color: colors.muted }]}>Try Again</Text>
              </Pressable>
              <Pressable
                onPress={handleLog}
                disabled={isSaving}
                style={({ pressed }) => [
                  classicStyles.saveBtn,
                  { flex: 1, backgroundColor: colors.primary, opacity: isSaving ? 0.6 : pressed ? 0.85 : 1, transform: [{ scale: pressed ? 0.97 : 1 }] },
                ]}
              >
                <Text style={classicStyles.saveBtnText}>{isSaving ? 'Saving...' : 'Save Review'}</Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      )}

      {/* Date picker modal for changing the save date */}
      <Modal
        visible={datepickerVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setDatepickerVisible(false)}
      >
        <Pressable
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' }}
          onPress={() => setDatepickerVisible(false)}
        />
        <View style={{
          backgroundColor: colors.surface,
          borderTopLeftRadius: 24,
          borderTopRightRadius: 24,
          paddingBottom: insets.bottom > 0 ? insets.bottom + 16 : 32,
          paddingTop: 16,
        }}>
          <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: colors.muted + '55', alignSelf: 'center', marginBottom: 16 }} />
          <Text style={{ fontSize: 17, fontWeight: '700', color: colors.foreground, textAlign: 'center', marginBottom: 20 }}>Select Date</Text>
          {/* Simple date picker: go back up to 30 days */}
          <ScrollView style={{ maxHeight: 320 }} showsVerticalScrollIndicator={false}>
            {Array.from({ length: 31 }, (_, i) => {
              const d = new Date();
              d.setDate(d.getDate() - i);
              const ds = d.toISOString().slice(0, 10);
              const label = i === 0 ? 'Today' : i === 1 ? 'Yesterday' : d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
              const isSelected = ds === saveDate;
              return (
                <Pressable
                  key={ds}
                  onPress={() => { setSaveDate(ds); setDatepickerVisible(false); }}
                  style={({ pressed }) => ({
                    paddingVertical: 14,
                    paddingHorizontal: 24,
                    backgroundColor: isSelected ? colors.primary + '22' : pressed ? colors.border + '44' : 'transparent',
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  })}
                >
                  <Text style={{ fontSize: 16, color: isSelected ? colors.primary : colors.foreground, fontWeight: isSelected ? '600' : '400' }}>{label}</Text>
                  <Text style={{ fontSize: 13, color: colors.muted }}>{ds}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      </Modal>

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
    paddingBottom: 24,
    gap: 16,
    alignItems: "stretch",
  },
  waveRow: {
    alignItems: "stretch",
    gap: 8,
    paddingVertical: 8,
  },
  recordingLabel: { fontSize: 13, fontWeight: "600" },
  // Animated header that collapses when scrolling
  waveHeader: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    justifyContent: 'flex-start',
  },
  // Mini pill shown when waveform is collapsed
  miniPill: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
  },
  miniDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  miniLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  // True sticky footer — outside the scroll, never overlaps content
  trueFooter: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 12,
  },
  // Legacy — kept for reference
  stickyFooter: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingBottom: 16,
  },
  gradientFade: {
    height: 14,
  },
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

// ─── Classic check-in styles (mirrors checkin.tsx) ────────────────────────────
const classicStyles = StyleSheet.create({
  legendRow: {
    flexDirection: 'row', justifyContent: 'center', gap: 20,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 7, height: 7, borderRadius: 4 },
  legendText: { fontSize: 12, fontWeight: '500' },

  rateAllRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rateAllLabel: { fontSize: 13, fontWeight: '600', letterSpacing: 0.3, textTransform: 'uppercase' },

  scroll: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12 },
  section: { marginBottom: 18 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 8 },
  sectionTitle: { fontSize: 13, fontWeight: '700', letterSpacing: 0.3, textTransform: 'uppercase' },

  card: { borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  habitRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 14, paddingVertical: 13, gap: 12,
  },
  habitName: { fontSize: 15, fontWeight: '600' },
  habitDesc: { fontSize: 12, lineHeight: 17, marginTop: 2 },

  segmentedBtn: {
    flexDirection: 'row', borderRadius: 11, overflow: 'hidden', gap: 2, padding: 2,
  },
  segment: { width: 40, height: 38, borderRadius: 9 },
  segmentFirst: { borderTopLeftRadius: 9, borderBottomLeftRadius: 9 },
  segmentLast: { borderTopRightRadius: 9, borderBottomRightRadius: 9 },
  segmentSmall: { width: 32, height: 28 },

  footer: {
    paddingHorizontal: 16, paddingTop: 10, paddingBottom: 28,
    borderTopWidth: StyleSheet.hairlineWidth, gap: 10,
  },
  tally: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  tallyPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 9, paddingVertical: 4, borderRadius: 20,
  },
  tallyText: { fontSize: 13, fontWeight: '700' },
  tallyOf: { fontSize: 12, marginLeft: 4 },

  tryAgainBtn: {
    alignItems: 'center', paddingVertical: 14, paddingHorizontal: 20,
    borderRadius: 14, borderWidth: 1,
  },
  tryAgainText: { fontSize: 15, fontWeight: '600' },
  saveBtn: {
    borderRadius: 14, paddingVertical: 15,
    alignItems: 'center', justifyContent: 'center',
  },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '700', letterSpacing: 0.2 },

  journalSection: { marginBottom: 18 },
  journalTitle: { fontSize: 13, fontWeight: '700', letterSpacing: 0.3, textTransform: 'uppercase', marginBottom: 8 },
  journalBlock: { borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, padding: 14 },
  journalText: { fontSize: 14, lineHeight: 22 },
  journalTextInput: { fontSize: 14, lineHeight: 22, minHeight: 120 },
  habitDescInput: { fontSize: 12, lineHeight: 18, marginTop: 2, paddingVertical: 0, paddingHorizontal: 0 },
  gratitudeItem: { borderRadius: 10, borderWidth: StyleSheet.hairlineWidth, padding: 12, marginBottom: 6 },
});
