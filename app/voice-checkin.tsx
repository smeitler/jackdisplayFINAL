/**
 * VoiceCheckinModal — Full-screen voice check-in flow
 *
 * Flow:
 *   IDLE → tap mic → LISTENING (waveform pulses) → tap send → ANALYZING (spinner) →
 *   RESULTS (habit cards + journal block + gratitude) → tap Log → saved → DONE
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  Animated,
  Easing,
  FlatList,
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
import { useColors } from "@/hooks/use-colors";
import { useApp } from "@/lib/app-context";
import { trpc } from "@/lib/trpc";
import {
  addEntry,
  generateId,
  todayDateStr,
} from "@/lib/journal-store";
import { getLastUserId, submitCheckIn, type Rating } from "@/lib/storage";

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
      anims.forEach((a) => Animated.timing(a, { toValue: 0.3, duration: 200, useNativeDriver: true }).start());
      return;
    }
    const loops = anims.map((a, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 80),
          Animated.timing(a, { toValue: 1, duration: 300 + i * 40, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          Animated.timing(a, { toValue: 0.25, duration: 300 + i * 40, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
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

// ─── Orbiting dots spinner ────────────────────────────────────────────────────
function OrbitingDots({ color }: { color: string }) {
  const rotation = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(rotation, { toValue: 1, duration: 1400, easing: Easing.linear, useNativeDriver: true })
    );
    loop.start();
    return () => loop.stop();
  }, []);

  const spin = rotation.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] });

  const DOT_COUNT = 8;
  const RADIUS = 28;

  return (
    <View style={{ width: RADIUS * 2 + 12, height: RADIUS * 2 + 12, alignItems: "center", justifyContent: "center" }}>
      <Animated.View style={{ transform: [{ rotate: spin }], width: RADIUS * 2 + 12, height: RADIUS * 2 + 12 }}>
        {Array.from({ length: DOT_COUNT }).map((_, i) => {
          const angle = (i / DOT_COUNT) * 2 * Math.PI;
          const x = RADIUS * Math.cos(angle);
          const y = RADIUS * Math.sin(angle);
          const opacity = 0.3 + (i / DOT_COUNT) * 0.7;
          return (
            <View
              key={i}
              style={{
                position: "absolute",
                width: 7,
                height: 7,
                borderRadius: 3.5,
                backgroundColor: color,
                opacity,
                left: RADIUS + 2 + x - 3.5,
                top: RADIUS + 2 + y - 3.5,
              }}
            />
          );
        })}
      </Animated.View>
    </View>
  );
}

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
    <View style={[cardStyles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Text style={[cardStyles.habitName, { color: colors.foreground }]}>{item.habitName}</Text>
      {item.note ? (
        <TextInput
          style={[cardStyles.noteInput, { color: colors.muted, borderColor: colors.border }]}
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
                if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                onRatingChange(item.habitId, r);
              }}
              activeOpacity={0.7}
            >
              <View style={[cardStyles.ratingDot, { backgroundColor: RATING_COLORS[r] }]} />
              <Text style={[cardStyles.ratingLabel, { color: isSelected ? RATING_COLORS[r] : colors.muted }]}>
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

  const [phase, setPhase] = useState<Phase>("idle");
  const [transcript, setTranscript] = useState("");
  const [results, setResults] = useState<ParsedResults | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Mic pulse animation for idle state
  const pulseAnim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.08, duration: 900, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);

  // Audio recorder
  const audioRecorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(audioRecorder);

  // tRPC mutations
  const analyzeTranscript = trpc.voiceCheckin.analyzeTranscript.useMutation();
  const transcribeAndCategorize = trpc.voiceJournal.transcribeAndCategorize.useMutation();

  // ── Start recording ──────────────────────────────────────────────────────
  const startRecording = useCallback(async () => {
    try {
      const perm = await requestRecordingPermissionsAsync();
      if (!perm.granted) {
        Alert.alert("Microphone Permission", "Please allow microphone access to use voice check-in.");
        return;
      }
      await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true });
      await audioRecorder.prepareToRecordAsync();
      audioRecorder.record();
      setPhase("listening");
      if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch (err) {
      console.error("[VoiceCheckin] start recording error:", err);
      Alert.alert("Error", "Could not start recording. Please try again.");
    }
  }, [audioRecorder]);

  // ── Stop & analyze ───────────────────────────────────────────────────────
  const stopAndAnalyze = useCallback(async () => {
    try {
      setPhase("analyzing");
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      await audioRecorder.stop();
      const uri = audioRecorder.uri;
      if (!uri) throw new Error("No recording URI");

      // Read the audio file as base64
      const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
      const mimeType = Platform.OS === "ios" ? "audio/m4a" : "audio/webm";

      // Active habits for context
      const habitList = habits.map((h) => ({ id: h.id, name: h.name }));

      // Run transcription + categorization in parallel
      const [categorized, analysisResult] = await Promise.all([
        transcribeAndCategorize.mutateAsync({ audioBase64: base64, mimeType, habits: habitList }),
        // We'll run habit analysis after we have the transcript
        Promise.resolve(null),
      ]);

      const fullTranscript = categorized.transcript;
      setTranscript(fullTranscript);

      // Now run habit analysis on the transcript
      let habitAnalysis: Record<string, { rating: "green" | "yellow" | "red" | null; note: string }> = {};
      if (fullTranscript && habitList.length > 0) {
        const analysisResp = await analyzeTranscript.mutateAsync({ transcript: fullTranscript, habits: habitList });
        habitAnalysis = analysisResp.results;
      }

      // Build habit results — only habits mentioned by AI
      const mentionedHabitResults: HabitResult[] = Object.entries(habitAnalysis)
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

      // Also include habits from categorized.habitNotes that aren't already in mentionedHabitResults
      if (categorized.habitNotes) {
        for (const [habitId, note] of Object.entries(categorized.habitNotes)) {
          if (!mentionedHabitResults.find((r) => r.habitId === habitId)) {
            const habit = habits.find((h) => h.id === habitId);
            if (habit) {
              mentionedHabitResults.push({ habitId, habitName: habit.name, rating: null, note: note as string });
            }
          }
        }
      }

      setResults({
        habitResults: mentionedHabitResults,
        journalEntries: categorized.journalEntries,
        gratitudeItems: categorized.gratitudeItems,
        transcript: fullTranscript,
      });
      setPhase("results");
    } catch (err: any) {
      console.error("[VoiceCheckin] analyze error:", err);
      Alert.alert("Error", err?.message ?? "Could not process your recording. Please try again.");
      setPhase("idle");
    }
  }, [audioRecorder, habits, transcribeAndCategorize, analyzeTranscript]);

  // ── Update habit rating ──────────────────────────────────────────────────
  const handleRatingChange = useCallback((habitId: string, rating: "green" | "yellow" | "red") => {
    setResults((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        habitResults: prev.habitResults.map((r) =>
          r.habitId === habitId ? { ...r, rating } : r
        ),
      };
    });
  }, []);

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

      // Build journal body: transcript block + gratitude section
      let body = results.transcript || results.journalEntries.join("\n\n");
      if (results.gratitudeItems.length > 0) {
        body += "\n\n🙏 Grateful for:\n" + results.gratitudeItems.map((g, i) => `${i + 1}. ${g}`).join("\n");
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

      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
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
    setTranscript("");
    setResults(null);
  }, []);

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <ScreenContainer edges={["top", "left", "right", "bottom"]} containerClassName="bg-background">
      {/* Header */}
      <View style={[headerStyles.row, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={headerStyles.closeBtn} activeOpacity={0.7}>
          <IconSymbol name="xmark" size={20} color={colors.muted} />
        </TouchableOpacity>
        <Text style={[headerStyles.title, { color: colors.foreground }]}>
          {phase === "results" ? "Review Your Check-in" : "Voice Check-in"}
        </Text>
        <View style={{ width: 36 }} />
      </View>

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
                { borderColor: colors.primary + "44", transform: [{ scale: pulseAnim }] },
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
        <View style={phaseStyles.center}>
          <Text style={[phaseStyles.subtitle, { color: colors.muted }]}>
            Listening... Talk about your habits, how you felt, and what you're grateful for.
          </Text>
          <WaveformBars isActive color={colors.primary} />
          <Text style={[phaseStyles.hint, { color: colors.muted, marginTop: 8 }]}>
            {recorderState.isRecording ? "Recording..." : "Starting..."}
          </Text>
          <TouchableOpacity
            style={[sendStyles.btn, { backgroundColor: colors.primary }]}
            onPress={stopAndAnalyze}
            activeOpacity={0.85}
          >
            <IconSymbol name="arrow.up" size={22} color="#fff" />
            <Text style={sendStyles.label}>Send</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ANALYZING phase */}
      {phase === "analyzing" && (
        <View style={phaseStyles.center}>
          <OrbitingDots color={colors.primary} />
          <Text style={[phaseStyles.analyzeTitle, { color: colors.foreground }]}>Analyzing...</Text>
          <Text style={[phaseStyles.hint, { color: colors.muted }]}>
            Extracting habits, journal notes, and gratitude
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
              <Text style={[resultsStyles.sectionTitle, { color: colors.foreground }]}>Habits</Text>
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

          {/* Journal block */}
          {(results.journalEntries.length > 0 || results.transcript) && (
            <View style={resultsStyles.section}>
              <Text style={[resultsStyles.sectionTitle, { color: colors.foreground }]}>Journal Entry</Text>
              <View style={[resultsStyles.journalBlock, { backgroundColor: colors.surface, borderColor: colors.border }]}>
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
              <Text style={[resultsStyles.sectionTitle, { color: colors.foreground }]}>🙏 Grateful For</Text>
              {results.gratitudeItems.map((g, i) => (
                <View key={i} style={[resultsStyles.gratitudeItem, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <Text style={[resultsStyles.gratitudeText, { color: colors.foreground }]}>{g}</Text>
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
              <Text style={[resultsStyles.tryAgainText, { color: colors.muted }]}>Try Again</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[resultsStyles.logBtn, { backgroundColor: colors.primary, opacity: isSaving ? 0.6 : 1 }]}
              onPress={handleLog}
              disabled={isSaving}
              activeOpacity={0.85}
            >
              <Text style={resultsStyles.logText}>{isSaving ? "Saving..." : "Log"}</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      )}

      {/* DONE phase */}
      {phase === "done" && (
        <View style={phaseStyles.center}>
          <View style={[doneStyles.circle, { backgroundColor: "#22C55E22", borderColor: "#22C55E44" }]}>
            <IconSymbol name="checkmark.circle.fill" size={56} color="#22C55E" />
          </View>
          <Text style={[doneStyles.title, { color: colors.foreground }]}>Logged!</Text>
          <Text style={[phaseStyles.hint, { color: colors.muted }]}>Your check-in has been saved.</Text>
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
  closeBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 17, fontWeight: "700" },
});

const phaseStyles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 32, gap: 24 },
  subtitle: { fontSize: 15, textAlign: "center", lineHeight: 22 },
  hint: { fontSize: 13, textAlign: "center" },
  analyzeTitle: { fontSize: 20, fontWeight: "700", marginTop: 16 },
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

const sendStyles = StyleSheet.create({
  btn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 30,
    marginTop: 8,
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
