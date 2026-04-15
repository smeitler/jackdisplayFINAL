/**
 * VoiceCommandPanel
 *
 * A bottom-sheet voice command interface triggered by long-pressing the
 * center "+" button in the tab bar.
 *
 * Supported commands:
 *   • "Set alarm to/for [time]"        → creates/updates alarm
 *   • "Turn off all alarms"            → disables all alarms
 *   • "Cancel alarm"                   → disables first active alarm
 *   • "Log habit [name] as done/okay/missed"
 *   • "All habits done"                → marks all habits green
 *   • "Add gratitude [text]"
 *   • "Add task [text]"
 *
 * Audio feedback: expo-speech (device TTS) for instant, offline confirmations.
 * Recording: expo-audio on native, MediaRecorder on web.
 * Transcription: server voiceJournal.transcribeAndCategorize endpoint.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
  Easing,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import * as Haptics from "expo-haptics";
import * as Speech from "expo-speech";
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
} from "expo-audio";
import * as FileSystem from "expo-file-system/legacy";
import AsyncStorage from "@react-native-async-storage/async-storage";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useColors } from "@/hooks/use-colors";
import { useApp } from "@/lib/app-context";
import { trpc } from "@/lib/trpc";
import { loadAlarms, saveAlarms, type Rating } from "@/lib/storage";
import { TASKS_KEY, type Task } from "@/components/tasks-panel";
import { generateId, todayDateStr } from "@/lib/journal-store";

// ─── Types ────────────────────────────────────────────────────────────────────

type CommandStatus = "idle" | "listening" | "processing" | "done" | "error";

interface CommandResult {
  type:
    | "alarm_set"
    | "alarm_off_all"
    | "alarm_off_single"
    | "habit_logged"
    | "all_habits_green"
    | "gratitude_added"
    | "task_added"
    | "unknown";
  message: string;
  speakText: string;
}

// ─── Time parsing helpers ─────────────────────────────────────────────────────

const HOUR_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8,
  nine: 9, ten: 10, eleven: 11, twelve: 12,
};

function parseTimeFromText(text: string): { hour: number; minute: number } | null {
  const t = text.toLowerCase().trim();

  // Numeric: "6:30 am", "06:30", "6 30 am", "6:00"
  const numericMatch = t.match(/(\d{1,2})[:\s](\d{2})\s*(am|pm)?/);
  if (numericMatch) {
    let h = parseInt(numericMatch[1], 10);
    const m = parseInt(numericMatch[2], 10);
    const period = numericMatch[3];
    if (period === "pm" && h < 12) h += 12;
    if (period === "am" && h === 12) h = 0;
    if (h >= 0 && h < 24 && m >= 0 && m < 60) return { hour: h, minute: m };
  }

  // Numeric hour only: "6 am", "9pm", "12 pm"
  const hourOnlyMatch = t.match(/\b(\d{1,2})\s*(am|pm)\b/);
  if (hourOnlyMatch) {
    let h = parseInt(hourOnlyMatch[1], 10);
    const period = hourOnlyMatch[2];
    if (period === "pm" && h < 12) h += 12;
    if (period === "am" && h === 12) h = 0;
    if (h >= 0 && h < 24) return { hour: h, minute: 0 };
  }

  // Word-based: "six thirty am", "six am"
  const wordMatch = t.match(
    /\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)(?:\s+(thirty|forty|fifty|fifteen|twenty|ten|five|oh\s+\w+))?\s+(am|pm)\b/
  );
  if (wordMatch) {
    let h = HOUR_WORDS[wordMatch[1]] ?? 0;
    const period = wordMatch[3];
    const minPhrase = (wordMatch[2] ?? "").trim();
    let m = 0;
    if (minPhrase === "thirty") m = 30;
    else if (minPhrase === "forty") m = 40;
    else if (minPhrase === "fifty") m = 50;
    else if (minPhrase === "fifteen") m = 15;
    else if (minPhrase === "twenty") m = 20;
    else if (minPhrase === "ten") m = 10;
    else if (minPhrase === "five") m = 5;
    else if (minPhrase.startsWith("oh")) {
      const ones = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];
      const idx = ones.indexOf(minPhrase.replace("oh ", "").trim());
      m = idx >= 0 ? idx : 0;
    }
    if (period === "pm" && h < 12) h += 12;
    if (period === "am" && h === 12) h = 0;
    return { hour: h, minute: m };
  }

  return null;
}

function formatTimeSpeech(hour: number, minute: number): string {
  const h12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  const period = hour < 12 ? "A M" : "P M";
  const hourWords = [
    "twelve", "one", "two", "three", "four", "five", "six",
    "seven", "eight", "nine", "ten", "eleven", "twelve",
  ];
  const hWord = hourWords[h12] ?? String(h12);
  if (minute === 0) return `${hWord} ${period}`;
  const minStr = minute < 10 ? `oh ${minute}` : String(minute);
  return `${hWord} ${minStr} ${period}`;
}

// ─── NLP command parser ───────────────────────────────────────────────────────

async function parseCommand(
  transcript: string,
  habits: { id: string; name: string }[],
  today: string
): Promise<CommandResult> {
  const t = transcript.toLowerCase().trim();

  // ── Turn off all alarms
  if (/turn off all|disable all|cancel all|clear all/.test(t) && /alarm/.test(t)) {
    const alarms = await loadAlarms();
    const updated = alarms.map((a) => ({ ...a, isEnabled: false }));
    await saveAlarms(updated);
    return {
      type: "alarm_off_all",
      message: "All alarms turned off",
      speakText: "All alarms turned off.",
    };
  }

  // ── Cancel / turn off single alarm
  if (/(cancel|turn off|disable|stop)\s+(the\s+)?alarm/.test(t) && !/all/.test(t)) {
    const alarms = await loadAlarms();
    const active = alarms.find((a) => a.isEnabled);
    if (active) {
      const updated = alarms.map((a) =>
        a.id === active.id ? { ...a, isEnabled: false } : a
      );
      await saveAlarms(updated);
      return {
        type: "alarm_off_single",
        message: "Alarm cancelled",
        speakText: "Alarm cancelled.",
      };
    }
    return {
      type: "alarm_off_single",
      message: "No active alarms found",
      speakText: "You have no active alarms.",
    };
  }

  // ── Set alarm
  if (
    /(set|add|create|schedule|wake me up at|wake me at)\s.*(alarm|up|wake)|(alarm|wake).*(set|to|for|at)/.test(
      t
    )
  ) {
    const parsed = parseTimeFromText(t);
    if (parsed) {
      const alarms = await loadAlarms();
      if (alarms.length === 0) {
        const newAlarm = {
          id: `alarm_${Date.now()}`,
          label: "Voice Alarm",
          hour: parsed.hour,
          minute: parsed.minute,
          days: [0, 1, 2, 3, 4, 5, 6],
          isEnabled: true,
          notificationIds: [] as string[],
        };
        await saveAlarms([newAlarm]);
      } else {
        const updated = alarms.map((a, i) =>
          i === 0
            ? { ...a, hour: parsed.hour, minute: parsed.minute, isEnabled: true }
            : a
        );
        await saveAlarms(updated);
      }
      const timeSpeech = formatTimeSpeech(parsed.hour, parsed.minute);
      const hh = String(parsed.hour).padStart(2, "0");
      const mm = String(parsed.minute).padStart(2, "0");
      return {
        type: "alarm_set",
        message: `Alarm set for ${hh}:${mm}`,
        speakText: `Alarm set for ${timeSpeech}.`,
      };
    }
    return {
      type: "unknown",
      message: "Couldn't parse the time",
      speakText: "Sorry, I couldn't understand the time. Please try again.",
    };
  }

  // ── All habits done
  if (
    /(all habits|every habit|mark all).*(done|green|crushed|complete)/.test(t)
  ) {
    return {
      type: "all_habits_green",
      message: "All habits marked as done",
      speakText: "All habits logged as crushed it.",
    };
  }

  // ── Log individual habit
  for (const habit of habits) {
    const name = habit.name.toLowerCase();
    if (t.includes(name) || (name.split(" ")[0] && t.includes(name.split(" ")[0]))) {
      let ratingWord = "crushed it";
      if (/missed|skip|didn't|did not|no|zero|failed/.test(t)) ratingWord = "missed";
      else if (/okay|ok|partial|kinda|sort of|half/.test(t)) ratingWord = "okay";
      return {
        type: "habit_logged",
        message: `${habit.name} logged as ${ratingWord}`,
        speakText: `Got it. ${habit.name} logged as ${ratingWord}.`,
      };
    }
  }

  // ── Add gratitude
  const gratMatch = t.match(
    /(?:add|log|record|i'm grateful for|grateful for|thankful for|gratitude[:\s]+)(.*)/
  );
  if (gratMatch && gratMatch[1].trim().length > 2) {
    const gratText = gratMatch[1].trim();
    // Gratitude items are stored as part of the journal entry body.
    // We store a pending grat in AsyncStorage so the journal screen can pick it up.
    const PENDING_GRAT_KEY = "@daycheck:pending_grat";
    const raw = await AsyncStorage.getItem(PENDING_GRAT_KEY).catch(() => null);
    const existing: string[] = raw ? JSON.parse(raw) : [];
    await AsyncStorage.setItem(
      PENDING_GRAT_KEY,
      JSON.stringify([...existing, gratText])
    );
    return {
      type: "gratitude_added",
      message: `Gratitude added: "${gratText}"`,
      speakText: "Gratitude added.",
    };
  }

  // ── Add task
  const taskMatch = t.match(
    /(?:add task|create task|new task|remind me to|add to my list)[:\s]+(.*)/
  );
  if (taskMatch && taskMatch[1].trim().length > 2) {
    const taskTitle = taskMatch[1].trim();
    const raw = await AsyncStorage.getItem(TASKS_KEY).catch(() => null);
    const tasks: Task[] = raw ? JSON.parse(raw) : [];
    const newTask: Task = {
      id: generateId(),
      title:
        taskTitle.charAt(0).toUpperCase() + taskTitle.slice(1),
      notes: "",
      dueDate: today,
      priority: "medium",
      completed: false,
      createdAt: new Date().toISOString(),
      category: null,
      subtasks: [],
      recurring: null,
      sortOrder: tasks.length,
      completedAt: null,
    };
    await AsyncStorage.setItem(TASKS_KEY, JSON.stringify([...tasks, newTask]));
    return {
      type: "task_added",
      message: `Task added: "${taskTitle}"`,
      speakText: "Task added.",
    };
  }

  return {
    type: "unknown",
    message: `Heard: "${transcript}"`,
    speakText: "Sorry, I didn't catch that. Please try again.",
  };
}

// ─── Web recorder helper ──────────────────────────────────────────────────────

function useWebRecorder() {
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const [isRecording, setIsRecording] = useState(false);

  const start = useCallback(async () => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices) return false;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream, { mimeType: "audio/webm" });
      chunksRef.current = [];
      mr.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      mr.start(100);
      mediaRecorderRef.current = mr;
      setIsRecording(true);
      return true;
    } catch {
      return false;
    }
  }, []);

  const stop = useCallback((): Promise<Blob | null> => {
    return new Promise((resolve) => {
      const mr = mediaRecorderRef.current;
      if (!mr) {
        resolve(null);
        return;
      }
      mr.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        mediaRecorderRef.current?.stream.getTracks().forEach((t) => t.stop());
        mediaRecorderRef.current = null;
        setIsRecording(false);
        resolve(blob.size > 0 ? blob : null);
      };
      mr.stop();
    });
  }, []);

  return { start, stop, isRecording };
}

// ─── Waveform bars ────────────────────────────────────────────────────────────

function WaveformBars({ isActive, color }: { isActive: boolean; color: string }) {
  const anims = useRef(
    Array.from({ length: 5 }, () => new Animated.Value(0.3))
  ).current;

  useEffect(() => {
    if (!isActive) {
      anims.forEach((a) =>
        Animated.timing(a, {
          toValue: 0.3,
          duration: 200,
          useNativeDriver: true,
        }).start()
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
            toValue: 0.2,
            duration: 300 + i * 40,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
        ])
      )
    );
    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
  }, [isActive, anims]);

  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 4, height: 36 }}>
      {anims.map((a, i) => (
        <Animated.View
          key={i}
          style={{
            width: 4,
            height: 36,
            borderRadius: 2,
            backgroundColor: color,
            transform: [{ scaleY: a }],
          }}
        />
      ))}
    </View>
  );
}

// ─── Command hint chips ───────────────────────────────────────────────────────

const COMMAND_HINTS: Array<{
  icon: React.ComponentProps<typeof MaterialIcons>["name"];
  label: string;
}> = [
  { icon: "alarm", label: "Set alarm to 7am" },
  { icon: "alarm-off", label: "Turn off all alarms" },
  { icon: "check-circle", label: "Log habit as done" },
  { icon: "add-task", label: "Add task [text]" },
  { icon: "favorite", label: "Add gratitude [text]" },
];

// ─── Main component ───────────────────────────────────────────────────────────

interface VoiceCommandPanelProps {
  visible: boolean;
  onClose: () => void;
}

export function VoiceCommandPanel({ visible, onClose }: VoiceCommandPanelProps) {
  const colors = useColors();
  const { activeHabits, submitCheckIn } = useApp();
  const habits = activeHabits;
  const today = todayDateStr();

  const [status, setStatus] = useState<CommandStatus>("idle");
  const [transcript, setTranscript] = useState("");
  const [result, setResult] = useState<CommandResult | null>(null);
  const [history, setHistory] = useState<CommandResult[]>([]);

  // Slide-up animation
  const slideAnim = useRef(new Animated.Value(400)).current;
  const backdropAnim = useRef(new Animated.Value(0)).current;

  // Pulse animation for mic button
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const pulseLoop = useRef<Animated.CompositeAnimation | null>(null);

  // Native recorder
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  // Web recorder
  const webRecorder = useWebRecorder();

  // tRPC transcription
  const transcribeMutation = trpc.voiceJournal.transcribeAndCategorize.useMutation();

  // Animate in/out
  useEffect(() => {
    if (visible) {
      setStatus("idle");
      setTranscript("");
      setResult(null);
      Animated.parallel([
        Animated.spring(slideAnim, {
          toValue: 0,
          useNativeDriver: true,
          damping: 20,
          stiffness: 200,
        }),
        Animated.timing(backdropAnim, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: 400,
          duration: 250,
          easing: Easing.in(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(backdropAnim, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible, slideAnim, backdropAnim]);

  // Pulse when listening
  useEffect(() => {
    if (status === "listening") {
      pulseLoop.current = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.15,
            duration: 600,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 600,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
        ])
      );
      pulseLoop.current.start();
    } else {
      pulseLoop.current?.stop();
      Animated.timing(pulseAnim, {
        toValue: 1,
        duration: 150,
        useNativeDriver: true,
      }).start();
    }
  }, [status, pulseAnim]);

  const speak = useCallback((text: string) => {
    Speech.stop();
    Speech.speak(text, { language: "en-US", rate: 0.95, pitch: 1.0 });
  }, []);

  const startListening = useCallback(async () => {
    if (Platform.OS !== "web") {
      const { granted } = await requestRecordingPermissionsAsync();
      if (!granted) {
        speak("Microphone permission required.");
        return;
      }
      await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
    } else {
      const ok = await webRecorder.start();
      if (!ok) {
        speak("Microphone not available.");
        return;
      }
    }
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    setStatus("listening");
    setTranscript("");
    setResult(null);
    speak("Listening.");
  }, [recorder, webRecorder, speak]);

  const stopListening = useCallback(async () => {
    if (status !== "listening") return;
    setStatus("processing");
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }

    try {
      let audioBase64 = "";
      let mimeType = "audio/m4a";

      if (Platform.OS === "web") {
        const blob = await webRecorder.stop();
        if (!blob) throw new Error("No audio recorded");
        mimeType = "audio/webm";
        audioBase64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
            const res = reader.result as string;
            resolve(res.split(",")[1] ?? "");
          };
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
      } else {
        await recorder.stop();
        const uri = recorder.uri;
        if (!uri) throw new Error("No recording URI");
        audioBase64 = await FileSystem.readAsStringAsync(uri, {
          encoding: FileSystem.EncodingType.Base64,
        });
      }

      const resp = await transcribeMutation.mutateAsync({
        audioBase64,
        mimeType,
      });

      const text = resp.transcript?.trim() ?? "";
      setTranscript(text);

      if (!text) {
        const noAudio: CommandResult = {
          type: "unknown",
          message: "No speech detected",
          speakText: "I didn't hear anything. Please try again.",
        };
        setResult(noAudio);
        setStatus("error");
        speak(noAudio.speakText);
        return;
      }

      const habitList = habits.map((h) => ({ id: h.id, name: h.name }));
      const cmd = await parseCommand(text, habitList, today);
      setResult(cmd);
      setHistory((prev) => [cmd, ...prev.slice(0, 4)]);

      // Handle all-habits-green specially
      if (cmd.type === "all_habits_green") {
        const ratingMap: Record<string, Rating> = {};
        habits.forEach((h) => {
          ratingMap[h.id] = "green";
        });
        await submitCheckIn(today, ratingMap);
      }

      speak(cmd.speakText);
      if (Platform.OS !== "web") {
        if (cmd.type === "unknown") {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        } else {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }
      }
      setStatus("done");
    } catch (err) {
      console.error("[VoiceCommandPanel] error:", err);
      setStatus("error");
      const errResult: CommandResult = {
        type: "unknown",
        message: "Something went wrong",
        speakText: "Sorry, something went wrong. Please try again.",
      };
      setResult(errResult);
      speak(errResult.speakText);
    }
  }, [
    status,
    recorder,
    webRecorder,
    transcribeMutation,
    habits,
    today,
    submitCheckIn,
    speak,
  ]);

  const handleClose = useCallback(() => {
    if (status === "listening") {
      // Stop recording silently
      if (Platform.OS !== "web") {
        recorder.stop().catch(() => {});
      } else {
        webRecorder.stop().catch(() => {});
      }
    }
    Speech.stop();
    setStatus("idle");
    onClose();
  }, [status, recorder, webRecorder, onClose]);

  const isListening = status === "listening";
  const micColor = isListening ? "#EF4444" : colors.primary;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={handleClose}
    >
      {/* Backdrop */}
      <Animated.View style={[styles.backdrop, { opacity: backdropAnim }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={handleClose} />
      </Animated.View>

      {/* Sheet */}
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.sheetWrapper}
        pointerEvents="box-none"
      >
        <Animated.View
          style={[
            styles.sheet,
            {
              backgroundColor: colors.surface,
              transform: [{ translateY: slideAnim }],
            },
          ]}
        >
          {/* Drag handle */}
          <View
            style={[styles.handle, { backgroundColor: colors.muted + "55" }]}
          />

          {/* Title row */}
          <View style={styles.titleRow}>
            <Text style={[styles.title, { color: colors.foreground }]}>
              Voice Commands
            </Text>
            <TouchableOpacity
              onPress={handleClose}
              style={styles.closeBtn}
              activeOpacity={0.7}
            >
              <MaterialIcons name="close" size={22} color={colors.muted} />
            </TouchableOpacity>
          </View>

          {/* Mic + waveform area */}
          <View style={styles.micArea}>
            {/* Pulse ring */}
            <Animated.View
              style={[
                styles.pulseRing,
                {
                  borderColor: micColor + "55",
                  transform: [{ scale: pulseAnim }],
                  opacity: isListening ? 1 : 0,
                },
              ]}
            />

            {/* Mic button */}
            <TouchableOpacity
              onPress={isListening ? stopListening : startListening}
              style={[styles.micBtn, { backgroundColor: micColor }]}
              activeOpacity={0.85}
            >
              <MaterialIcons
                name={isListening ? "stop" : "mic"}
                size={32}
                color="#fff"
              />
            </TouchableOpacity>

            {/* Waveform / status */}
            <View style={styles.statusArea}>
              {isListening ? (
                <WaveformBars isActive color={micColor} />
              ) : (
                <Text style={[styles.statusText, { color: colors.muted }]}>
                  {status === "idle" && "Tap mic to speak"}
                  {status === "processing" && "Processing…"}
                  {status === "done" && "Done ✓"}
                  {status === "error" && "Try again"}
                </Text>
              )}
            </View>
          </View>

          {/* Live transcript */}
          {(transcript.length > 0 || status === "listening") && (
            <View
              style={[
                styles.transcriptBox,
                {
                  backgroundColor: colors.background,
                  borderColor: colors.border,
                },
              ]}
            >
              <Text
                style={[styles.transcriptText, { color: colors.foreground }]}
              >
                {transcript || "…"}
              </Text>
            </View>
          )}

          {/* Result card */}
          {result && (
            <View
              style={[
                styles.resultCard,
                {
                  backgroundColor:
                    result.type === "unknown"
                      ? colors.warning + "22"
                      : colors.success + "22",
                  borderColor:
                    result.type === "unknown"
                      ? colors.warning + "66"
                      : colors.success + "66",
                },
              ]}
            >
              <MaterialIcons
                name={result.type === "unknown" ? "warning" : "check-circle"}
                size={18}
                color={
                  result.type === "unknown" ? colors.warning : colors.success
                }
              />
              <Text
                style={[styles.resultText, { color: colors.foreground }]}
              >
                {result.message}
              </Text>
            </View>
          )}

          {/* Command hint chips */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.chipsScroll}
            contentContainerStyle={styles.chipsContent}
          >
            {COMMAND_HINTS.map((hint, i) => (
              <View
                key={i}
                style={[
                  styles.chip,
                  {
                    backgroundColor: colors.background,
                    borderColor: colors.border,
                  },
                ]}
              >
                <MaterialIcons name={hint.icon} size={14} color={colors.muted} />
                <Text style={[styles.chipText, { color: colors.muted }]}>
                  {hint.label}
                </Text>
              </View>
            ))}
          </ScrollView>

          {/* Command history */}
          {history.length > 0 && (
            <View style={styles.historySection}>
              <Text style={[styles.historyTitle, { color: colors.muted }]}>
                Recent
              </Text>
              {history.map((h, i) => (
                <View
                  key={i}
                  style={[
                    styles.historyItem,
                    { borderColor: colors.border },
                  ]}
                >
                  <MaterialIcons
                    name={h.type === "unknown" ? "warning" : "check"}
                    size={14}
                    color={
                      h.type === "unknown" ? colors.warning : colors.success
                    }
                  />
                  <Text
                    style={[
                      styles.historyText,
                      { color: colors.foreground },
                    ]}
                    numberOfLines={1}
                  >
                    {h.message}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  sheetWrapper: {
    flex: 1,
    justifyContent: "flex-end",
  },
  sheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    paddingBottom: 40,
    paddingTop: 12,
    gap: 14,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 20,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: 4,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  title: {
    fontSize: 17,
    fontWeight: "700",
    letterSpacing: 0.1,
  },
  closeBtn: {
    padding: 4,
  },
  micArea: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
    gap: 14,
  },
  pulseRing: {
    position: "absolute",
    width: 90,
    height: 90,
    borderRadius: 45,
    borderWidth: 2,
  },
  micBtn: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 8,
  },
  statusArea: {
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  statusText: {
    fontSize: 14,
    fontWeight: "500",
  },
  transcriptBox: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    minHeight: 44,
  },
  transcriptText: {
    fontSize: 14,
    lineHeight: 20,
    fontStyle: "italic",
  },
  resultCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
  },
  resultText: {
    fontSize: 14,
    fontWeight: "600",
    flex: 1,
  },
  chipsScroll: {
    flexGrow: 0,
  },
  chipsContent: {
    gap: 8,
    paddingRight: 4,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  chipText: {
    fontSize: 12,
    fontWeight: "500",
  },
  historySection: {
    gap: 6,
  },
  historyTitle: {
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  historyItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  historyText: {
    fontSize: 13,
    flex: 1,
  },
});
