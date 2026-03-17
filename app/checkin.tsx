import {
  ScrollView, Text, View, Pressable, StyleSheet, Platform, Animated, TextInput,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { ScreenContainer } from "@/components/screen-container";
import { useApp } from "@/lib/app-context";
import { useColors } from "@/hooks/use-colors";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { CategoryIcon } from "@/components/category-icon";
import {
  yesterdayString, formatDisplayDate, toDateString, Rating,
} from "@/lib/storage";
import * as Haptics from "expo-haptics";
import * as Notifications from "expo-notifications";
import { trpc } from "@/lib/trpc";
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from "expo-audio";
import {
  loadHabits,
  loadGratitudeEntries,
  yesterdayString as yesterdayStr,
  loadDayNotes,
  saveDayNotes,
} from '@/lib/storage';

// ─── Voice Check-in Delta Streaming Recorder (isolated from journal code) ────
// Architecture:
//   1. delta-only chunks → Whisper (fast) → transcript appended immediately
//   2. Smart LLM debounce: fire analyzeTranscript on EITHER:
//      a) 1.5s of silence detected via Web Audio AnalyserNode RMS measurement
//      b) transcript grew by 3+ words since last LLM call
//   3. Mandatory final analysis on stop (complete transcript, awaited)
const CHUNK_INTERVAL_MS = 2000;        // 2-second delta chunks for Whisper (1s was too short)
const SILENCE_THRESHOLD_RMS = 0.02;    // RMS below this = silence
const SILENCE_TRIGGER_MS = 1200;       // 1.2s of continuous silence → trigger LLM
const WORD_DELTA_TRIGGER = 3;          // 3+ new words since last LLM → trigger LLM
const MAX_ROLLING_CHUNKS = 5;          // keep last N chunks as rolling window fallback

type DeltaChunkCallback = (deltaBlob: Blob, mimeType: string) => void;
type SilenceCallback = () => void;

function useCheckinWebRecorder(
  onDeltaChunk: DeltaChunkCallback,
  onSilenceDetected: SilenceCallback,
) {
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const pendingChunksRef = useRef<Blob[]>([]); // accumulates since last tick
  const rollingWindowRef = useRef<Blob[]>([]); // last N delta blobs for fallback
  const emptyDeltaCountRef = useRef(0); // consecutive empty Whisper responses
  const mimeTypeRef = useRef<string>('audio/webm');
  const chunkIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Silence detection via Web Audio API
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const silenceIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const silenceSinceRef = useRef<number | null>(null); // timestamp when silence started
  const silenceFiredRef = useRef(false); // prevent multiple fires per silence window
  const isRecordingRef = useRef(false);
  const [isRecording, setIsRecording] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);
  const onDeltaChunkRef = useRef(onDeltaChunk);
  const onSilenceRef = useRef(onSilenceDetected);
  useEffect(() => { onDeltaChunkRef.current = onDeltaChunk; });
  useEffect(() => { onSilenceRef.current = onSilenceDetected; });

  const start = useCallback(async (): Promise<boolean> => {
    setMicError(null);
    pendingChunksRef.current = [];
    silenceSinceRef.current = null;
    silenceFiredRef.current = false;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      let mimeType = '';
      if (typeof MediaRecorder.isTypeSupported === 'function') {
        if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) mimeType = 'audio/webm;codecs=opus';
        else if (MediaRecorder.isTypeSupported('audio/webm')) mimeType = 'audio/webm';
        else if (MediaRecorder.isTypeSupported('audio/mp4')) mimeType = 'audio/mp4';
      }
      mimeTypeRef.current = mimeType || 'audio/webm';
      const mr = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      mr.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) pendingChunksRef.current.push(e.data);
      };
      mr.start(100);
      mediaRecorderRef.current = mr;
      isRecordingRef.current = true;
      setIsRecording(true);

      // ── Web Audio silence detection ──────────────────────────────────────
      try {
        const AudioCtx = (window.AudioContext || (window as any).webkitAudioContext) as typeof AudioContext;
        const ctx = new AudioCtx();
        audioCtxRef.current = ctx;
        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);
        analyserRef.current = analyser;
        const buf = new Float32Array(analyser.fftSize);

        silenceIntervalRef.current = setInterval(() => {
          if (!isRecordingRef.current) return;
          analyser.getFloatTimeDomainData(buf);
          // RMS amplitude
          let sum = 0;
          for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
          const rms = Math.sqrt(sum / buf.length);

          if (rms < SILENCE_THRESHOLD_RMS) {
            // Silence detected
            if (silenceSinceRef.current === null) silenceSinceRef.current = Date.now();
            const silenceDuration = Date.now() - silenceSinceRef.current;
            if (silenceDuration >= SILENCE_TRIGGER_MS && !silenceFiredRef.current) {
              silenceFiredRef.current = true; // prevent re-firing until speech resumes
              onSilenceRef.current();
            }
          } else {
            // Speech detected — reset silence window and allow next silence trigger
            silenceSinceRef.current = null;
            silenceFiredRef.current = false;
          }
        }, 100); // check every 100ms
      } catch {
        // Web Audio not available — silence detection disabled, word-delta debounce still works
      }

      // ── Delta chunk interval (Whisper feed) ─────────────────────────────
      chunkIntervalRef.current = setInterval(() => {
        if (!isRecordingRef.current || pendingChunksRef.current.length === 0) return;
        const deltaChunks = pendingChunksRef.current.splice(0);
        const deltaBlob = new Blob(deltaChunks, { type: mimeTypeRef.current });
        if (deltaBlob.size < 500) return; // too small — skip
        // Push to rolling window (keep last MAX_ROLLING_CHUNKS)
        rollingWindowRef.current.push(deltaBlob);
        if (rollingWindowRef.current.length > MAX_ROLLING_CHUNKS) {
          rollingWindowRef.current.shift();
        }
        onDeltaChunkRef.current(deltaBlob, mimeTypeRef.current);
      }, CHUNK_INTERVAL_MS);

      return true;
    } catch (e: any) {
      const name = e?.name ?? '';
      if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
        setMicError('No microphone found.');
      } else if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
        setMicError('Microphone access denied.');
      } else {
        setMicError('Microphone unavailable: ' + (e?.message ?? name));
      }
      return false;
    }
  }, []);

  const stop = useCallback((): Promise<void> => {
    if (chunkIntervalRef.current) { clearInterval(chunkIntervalRef.current); chunkIntervalRef.current = null; }
    if (silenceIntervalRef.current) { clearInterval(silenceIntervalRef.current); silenceIntervalRef.current = null; }
    audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
    analyserRef.current = null;
    return new Promise((resolve) => {
      const mr = mediaRecorderRef.current;
      if (!mr || mr.state === 'inactive') {
        isRecordingRef.current = false;
        setIsRecording(false);
        resolve();
        return;
      }
      mr.addEventListener('stop', () => {
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        pendingChunksRef.current = [];
        isRecordingRef.current = false;
        setIsRecording(false);
        resolve();
      }, { once: true });
      mr.stop();
    });
  }, []);

  return { start, stop, isRecording, isRecordingRef, micError, rollingWindowRef };
}

// Convert Blob to base64 string
function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Strip data URI prefix: "data:audio/webm;base64," -> just the base64 part
      const base64 = result.split(',')[1] || '';
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

type ActiveRating = 'red' | 'yellow' | 'green';
const RATINGS: ActiveRating[] = ['red', 'yellow', 'green'];

const RATING_COLORS: Record<ActiveRating, string> = {
  red:    '#EF4444',
  yellow: '#F59E0B',
  green:  '#22C55E',
};

// Must match MEDITATION_OPTIONS in settings.tsx
const AFTER_ALARM_SOURCES: Record<string, string | ReturnType<typeof require> | null> = {
  priming:       null,
  meditation:    'https://d2xsxph8kpxj0f.cloudfront.net/310519663287248938/bFcyWdAL5JXed3bpyDvBEf/meditation_bowl_c8bd7151.wav',
  breathwork:    'https://d2xsxph8kpxj0f.cloudfront.net/310519663287248938/bFcyWdAL5JXed3bpyDvBEf/meditation_breathing_fd1069a2.wav',
  visualization: 'https://d2xsxph8kpxj0f.cloudfront.net/310519663287248938/bFcyWdAL5JXed3bpyDvBEf/meditation_focus_782acd2b.wav',
  journaling:    null,
};

const AFTER_ALARM_META: Record<string, { label: string; emoji: string; description: string }> = {
  priming:       { label: 'Priming',           emoji: '🔥', description: 'Gratitude · Goals · Visualize' },
  meditation:    { label: 'Guided Meditation', emoji: '🧘', description: 'Mindful awareness, 5 min' },
  breathwork:    { label: 'Breathwork',        emoji: '🌬️', description: 'Box breathing, 4-4-4-4' },
  visualization: { label: 'Visualizations',   emoji: '🎯', description: 'See your goals achieved' },
  journaling:    { label: 'Journaling',        emoji: '📓', description: 'Morning pages, free write' },
};

// Duration in seconds for each session type
const AFTER_ALARM_DURATIONS: Record<string, number> = {
  meditation:    5 * 60,
  breathwork:    4 * 60,
  visualization: 5 * 60,
  priming:       10 * 60,
  journaling:    10 * 60,
};

function formatMMSS(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

const COUNTDOWN_SECONDS = 15;

export default function CheckInScreen() {
  const { activeHabits, categories, submitCheckIn, getRatingsForDate, alarm, isPendingCheckIn } = useApp();
  const sortedCategories = useMemo(() => [...categories].sort((a, b) => a.order - b.order), [categories]);
  const colors = useColors();
  const router = useRouter();
  const params = useLocalSearchParams<{ date?: string; fromAlarm?: string; preview?: string }>();
  const fromAlarm = params.fromAlarm === '1';
  const isPreview = params.preview === '1';

  const [currentDate, setCurrentDate] = useState(params.date ?? yesterdayString());
  const [ratings, setRatings] = useState<Record<string, Rating>>(() => getRatingsForDate(currentDate));
  const [submitted, setSubmitted] = useState(false);
  const [shareToTeam, setShareToTeam] = useState(true);
  const [shared, setShared] = useState(false);
  const [practiceReady, setPracticeReady] = useState(false);
  const [practiceGenerating, setPracticeGenerating] = useState(false);
  const [practiceResult, setPracticeResult] = useState<{ chunkUrls: string[]; pausesBetweenChunks: number[]; totalDurationMinutes: number } | null>(null);
  const generatePracticeMutation = trpc.morningPractice.generate.useMutation();

  // ── Voice Check-in state (isolated from journal) ──
  const [vcStatus, setVcStatus] = useState<'idle' | 'recording' | 'done' | 'error'>('idle');
  const [vcTranscript, setVcTranscript] = useState(''); // cumulative transcript shown live
  const [vcNotes, setVcNotes] = useState<Record<string, string>>({});
  const [vcElapsed, setVcElapsed] = useState(0);
  const [vcProcessing, setVcProcessing] = useState(false); // true while a chunk is being analyzed
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null); // habitId being edited inline
  const vcTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const vcPulseAnim = useRef(new Animated.Value(1)).current;
  const vcPulseLoopRef = useRef<Animated.CompositeAnimation | null>(null);
  // Split pipeline: two separate mutations
  const transcribeChunkMutation = trpc.voiceCheckin.transcribeChunk.useMutation();
  const analyzeTranscriptMutation = trpc.voiceCheckin.analyzeTranscript.useMutation();
  // Refs for use inside callbacks (avoids stale closures — all callbacks use .current)
  const activeHabitsRef = useRef(activeHabits);
  useEffect(() => { activeHabitsRef.current = activeHabits; }, [activeHabits]);
  const setRatingsRef = useRef(setRatings);
  useEffect(() => { setRatingsRef.current = setRatings; }, [setRatings]);
  const setVcNotesRef = useRef(setVcNotes);
  useEffect(() => { setVcNotesRef.current = setVcNotes; }, [setVcNotes]);
  // Keep mutation refs so callbacks never go stale
  const transcribeChunkMutationRef = useRef(transcribeChunkMutation);
  useEffect(() => { transcribeChunkMutationRef.current = transcribeChunkMutation; });
  const analyzeTranscriptMutationRef = useRef(analyzeTranscriptMutation);
  useEffect(() => { analyzeTranscriptMutationRef.current = analyzeTranscriptMutation; });
  // Accumulated transcript ref (used by LLM analysis path without stale closure)
  const vcTranscriptRef = useRef('');
  useEffect(() => { vcTranscriptRef.current = vcTranscript; }, [vcTranscript]);

  // Guard: skip delta if Whisper is still processing the previous chunk
  const vcWhisperInFlightRef = useRef(false);
  // Smart LLM debounce: track word count at last LLM call
  const vcLastLlmWordCountRef = useRef(0);
  // Rolling window fallback: count consecutive empty Whisper responses
  const emptyDeltaCountRef = useRef(0);
  // Shared LLM fire function — uses refs only, never stale
  const fireAnalyzeTranscript = useCallback((transcript: string) => {
    if (!transcript.trim()) return;
    const habitList = activeHabitsRef.current.map((h) => ({ id: h.id, name: h.name }));
    vcLastLlmWordCountRef.current = transcript.split(/\s+/).filter(Boolean).length;
    analyzeTranscriptMutationRef.current.mutateAsync({ transcript, habits: habitList })
      .then((analysis) => {
        const newRatings: Record<string, Rating> = {};
        const newNotes: Record<string, string> = {};
        for (const [habitId, data] of Object.entries(analysis.results) as [string, { rating: string | null; note: string }][]) {
          if (data.rating) newRatings[habitId] = data.rating as Rating;
          if (data.note) newNotes[habitId] = data.note;
        }
        if (Object.keys(newRatings).length > 0) setRatingsRef.current((prev) => ({ ...prev, ...newRatings }));
        if (Object.keys(newNotes).length > 0) setVcNotesRef.current((prev) => ({ ...prev, ...newNotes }));
      })
      .catch((e) => console.warn('[VoiceCheckin] LLM analysis error:', e));
  }, []); // stable — all deps accessed via refs

  // Silence callback: fires when 1.5s of silence is detected mid-recording
  // Guard: only fire if we have at least 3 words of transcript (avoids firing on startup silence)
  const handleVcSilence = useCallback(() => {
    const t = vcTranscriptRef.current;
    const wordCount = t.trim().split(/\s+/).filter(Boolean).length;
    if (wordCount < 3) return; // not enough transcript yet — ignore startup silence
    console.log('[VoiceCheckin] Silence detected — firing LLM analysis on', wordCount, 'words');
    fireAnalyzeTranscript(t);
  }, [fireAnalyzeTranscript]);

  // Called every CHUNK_INTERVAL_MS with a DELTA blob (only new audio since last tick)
  // Uses refs only — stable callback, never stale
  const handleVcDeltaChunk = useCallback(async (deltaBlob: Blob, mimeType: string) => {
    if (vcWhisperInFlightRef.current) return; // Whisper still busy — skip this tick
    vcWhisperInFlightRef.current = true;
    setVcProcessing(true);
    try {
      // STEP 1: Whisper — transcribe delta only (fast, small input)
      const audioBase64 = await blobToBase64(deltaBlob);
      const result = await transcribeChunkMutationRef.current.mutateAsync({
        audioBase64,
        mimeType,
        previousTranscript: vcTranscriptRef.current,
      });
      let delta = result.delta?.trim() ?? '';
      if (!delta) {
        // Whisper returned empty on this delta chunk — try rolling window as fallback
        emptyDeltaCountRef.current = (emptyDeltaCountRef.current ?? 0) + 1;
        if (emptyDeltaCountRef.current >= 2 && checkinRecorderRef.current?.rollingWindowRef?.current?.length > 0) {
          // Build a rolling window blob (last few chunks combined) and retry
          const rollingBlob = new Blob(checkinRecorderRef.current.rollingWindowRef.current, { type: mimeType });
          const rollingBase64 = await blobToBase64(rollingBlob);
          const retry = await transcribeChunkMutationRef.current.mutateAsync({
            audioBase64: rollingBase64,
            mimeType,
            previousTranscript: vcTranscriptRef.current,
          });
          delta = retry.delta?.trim() ?? '';
          if (!delta) return; // still empty — give up this tick
          emptyDeltaCountRef.current = 0; // reset on success
        } else {
          return; // not enough consecutive empties yet — skip
        }
      } else {
        emptyDeltaCountRef.current = 0; // reset on non-empty delta
      }

      // Append delta to transcript immediately — user sees it right away
      const newTranscript = vcTranscriptRef.current
        ? vcTranscriptRef.current + ' ' + delta
        : delta;
      setVcTranscript(newTranscript);
      vcTranscriptRef.current = newTranscript;

      // STEP 2: Smart LLM debounce — fire if word delta >= WORD_DELTA_TRIGGER
      const currentWordCount = newTranscript.split(/\s+/).filter(Boolean).length;
      const wordDelta = currentWordCount - vcLastLlmWordCountRef.current;
      if (wordDelta >= WORD_DELTA_TRIGGER) {
        fireAnalyzeTranscript(newTranscript);
      }
      // (Silence path fires separately via handleVcSilence callback)

    } catch (e) {
      console.warn('[VoiceCheckin] Whisper chunk error:', e);
    } finally {
      vcWhisperInFlightRef.current = false;
      setVcProcessing(false);
    }
  }, [fireAnalyzeTranscript]); // stable — all other deps via refs

  const checkinRecorder = useCheckinWebRecorder(handleVcDeltaChunk, handleVcSilence);
  // Ref so handleVcDeltaChunk can access rollingWindowRef without stale closure
  const checkinRecorderRef = useRef(checkinRecorder);
  useEffect(() => { checkinRecorderRef.current = checkinRecorder; });

  // ── Countdown bar (only active when fromAlarm and not yet submitted) ──
  const countdownAnim = useRef(new Animated.Value(1)).current;
  const countdownRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownAnimRef = useRef<Animated.CompositeAnimation | null>(null);
  const isAlarmActive = fromAlarm && !isPreview && !submitted;

  const fireAlarmAgain = useCallback(async () => {
    if (Platform.OS === 'web') return;
    try {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      await Notifications.scheduleNotificationAsync({
        content: {
          title: '⏰ Keep going! Rate your habits.',
          body: 'You stopped interacting — alarm re-fired.',
          sound: 'default',
        },
        trigger: null,
      });
    } catch { /* ignore */ }
  }, []);

  const startCountdown = useCallback(() => {
    // Cancel any existing animation/timer
    if (countdownAnimRef.current) { countdownAnimRef.current.stop(); }
    if (countdownRef.current) { clearTimeout(countdownRef.current); }

    // Reset bar to full
    countdownAnim.setValue(1);

    // Animate bar to 0 over COUNTDOWN_SECONDS
    const anim = Animated.timing(countdownAnim, {
      toValue: 0,
      duration: COUNTDOWN_SECONDS * 1000,
      useNativeDriver: false,
    });
    countdownAnimRef.current = anim;
    anim.start(({ finished }) => {
      if (finished) {
        // Timer expired — re-fire alarm
        fireAlarmAgain();
        // Restart countdown
        startCountdown();
      }
    });
  }, [countdownAnim, fireAlarmAgain]);

  const resetCountdown = useCallback(() => {
    if (!isAlarmActive) return;
    startCountdown();
  }, [isAlarmActive, startCountdown]);

  // Start countdown when alarm check-in opens
  useEffect(() => {
    if (!isAlarmActive) return;
    startCountdown();
    return () => {
      if (countdownAnimRef.current) countdownAnimRef.current.stop();
      if (countdownRef.current) clearTimeout(countdownRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAlarmActive]);

  // Stop countdown when submitted
  useEffect(() => {
    if (submitted) {
      if (countdownAnimRef.current) countdownAnimRef.current.stop();
      if (countdownRef.current) clearTimeout(countdownRef.current);
    }
  }, [submitted]);

  // After-alarm audio state
  const [afterAlarmPlaying, setAfterAlarmPlaying] = useState(false);
  const [afterAlarmStarted, setAfterAlarmStarted] = useState(false);
  const [sessionElapsed, setSessionElapsed] = useState(0);
  const sessionTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const afterAlarmPlayerRef = useRef<AudioPlayer | null>(null);

  const { data: myTeams } = trpc.teams.list.useQuery();
  const createPost = trpc.teamFeed.createPost.useMutation();
  const teamNameMap = useMemo(() => {
    const map: Record<number, string> = {};
    for (const t of myTeams ?? []) map[t.id] = t.name;
    return map;
  }, [myTeams]);

  const today = toDateString();
  const canGoForward = currentDate < yesterdayString();

  // Start after-alarm audio when submitted from alarm context
  useEffect(() => {
    if (!submitted || !fromAlarm || isPreview) return;
    const meditationId = alarm.meditationId;
    if (!meditationId) return;
    const source = AFTER_ALARM_SOURCES[meditationId];
    if (!source) return;

    setAudioModeAsync({ playsInSilentMode: true }).catch(() => {});
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const player = createAudioPlayer(source as any);
      afterAlarmPlayerRef.current = player;
      player.play();
      setAfterAlarmPlaying(true);
    } catch (e) {
      console.warn('[AfterAlarm] Failed to start audio:', e);
    }

    return () => {
      if (afterAlarmPlayerRef.current) {
        try { afterAlarmPlayerRef.current.pause(); } catch { /* ignore */ }
        try { afterAlarmPlayerRef.current.remove(); } catch { /* ignore */ }
        afterAlarmPlayerRef.current = null;
      }
    };
  }, [submitted, fromAlarm, isPreview, alarm.meditationId]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (afterAlarmPlayerRef.current) {
        try { afterAlarmPlayerRef.current.pause(); } catch { /* ignore */ }
        try { afterAlarmPlayerRef.current.remove(); } catch { /* ignore */ }
        afterAlarmPlayerRef.current = null;
      }
    };
  }, []);

  function stopAfterAlarm() {
    if (afterAlarmPlayerRef.current) {
      try { afterAlarmPlayerRef.current.pause(); } catch { /* ignore */ }
      try { afterAlarmPlayerRef.current.remove(); } catch { /* ignore */ }
      afterAlarmPlayerRef.current = null;
    }
    if (sessionTimerRef.current) { clearInterval(sessionTimerRef.current); sessionTimerRef.current = null; }
    setAfterAlarmPlaying(false);
    setAfterAlarmStarted(false);
    setSessionElapsed(0);
  }

  function startAfterAlarmSession(meditationId: string) {
    const source = AFTER_ALARM_SOURCES[meditationId];
    setAfterAlarmStarted(true);
    setSessionElapsed(0);
    if (sessionTimerRef.current) clearInterval(sessionTimerRef.current);
    sessionTimerRef.current = setInterval(() => {
      setSessionElapsed((prev) => {
        const next = prev + 1;
        const total = AFTER_ALARM_DURATIONS[meditationId] ?? 300;
        if (next >= total) {
          if (sessionTimerRef.current) { clearInterval(sessionTimerRef.current); sessionTimerRef.current = null; }
        }
        return next;
      });
    }, 1000);
    if (!source) return; // no audio for priming/journaling
    setAudioModeAsync({ playsInSilentMode: true }).catch(() => {});
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const player = createAudioPlayer(source as any);
      afterAlarmPlayerRef.current = player;
      player.play();
      setAfterAlarmPlaying(true);
    } catch (e) {
      console.warn('[AfterAlarm] Failed to start audio:', e);
    }
  }

  function navigateDate(direction: -1 | 1) {
    const d = new Date(currentDate + 'T12:00:00');
    d.setDate(d.getDate() + direction);
    const newDate = toDateString(d);
    if (newDate >= today) return;
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setCurrentDate(newDate);
    setRatings(getRatingsForDate(newDate));
    setSubmitted(false);
  }

  const habitsByCategory = useMemo(() => {
    const map: Record<string, typeof activeHabits> = {};
    for (const cat of categories) map[cat.id] = [];
    for (const h of activeHabits) {
      if (!map[h.category]) map[h.category] = [];
      map[h.category].push(h);
    }
    return map;
  }, [activeHabits, categories]);

  // Global rank map: habitId -> 1-based rank across ALL active habits
  const globalRankMap = useMemo(() => {
    const m: Record<string, number> = {};
    activeHabits.forEach((h, i) => { m[h.id] = i + 1; });
    return m;
  }, [activeHabits]);

  function setRating(habitId: string, rating: ActiveRating) {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setRatings((prev) => ({ ...prev, [habitId]: prev[habitId] === rating ? 'none' : rating }));
  }

  function rateCategory(categoryId: string, rating: ActiveRating) {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const habits = habitsByCategory[categoryId] ?? [];
    setRatings((prev) => {
      const next = { ...prev };
      for (const h of habits) next[h.id] = rating;
      return next;
    });
  }

  function rateAll(rating: ActiveRating) {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    setRatings((prev) => {
      const next = { ...prev };
      for (const h of activeHabits) next[h.id] = rating;
      return next;
    });
  }

  async function handleSubmit() {
    if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    // Stop countdown before submitting
    if (countdownAnimRef.current) countdownAnimRef.current.stop();
    if (countdownRef.current) clearTimeout(countdownRef.current);

    // Save voice check-in notes to DayNotes so they appear in habit detail history
    const noteEntries = Object.entries(vcNotes).filter(([, v]) => v.trim().length > 0);
    if (noteEntries.length > 0) {
      try {
        const existing = await loadDayNotes();
        const updated = { ...existing };
        for (const [habitId, note] of noteEntries) {
          const key = `${habitId}:${currentDate}`;
          // Append to existing note if one already exists, otherwise set
          updated[key] = existing[key] ? `${existing[key]} | ${note}` : note;
        }
        await saveDayNotes(updated);
      } catch (e) {
        console.warn('[CheckIn] Failed to save voice notes:', e);
      }
    }

    await submitCheckIn(currentDate, ratings);
    setSubmitted(true);

    // Auto-generate morning practice if enabled
    const practiceType = alarm?.morningPracticeType;
    if (fromAlarm && !isPreview && practiceType && practiceType !== 'none' && alarm?.morningPracticeEnabled) {
      setPracticeGenerating(true);
      try {
        const allHabits = await loadHabits();
        const activeHabitNames = allHabits.filter(h => h.isActive).map(h => h.name).slice(0, 8);
        const goalList = categories.map(c => c.label);
        const gratitudeEntries = await loadGratitudeEntries();
        const yd = yesterdayStr();
        const ydEntry = gratitudeEntries.find(e => e.date === yd);
        const gratitudes = ydEntry?.items ?? [];
        const voiceKey = alarm?.elevenLabsVoice ?? 'rachel';
        const VOICE_IDS: Record<string, string> = {
          rachel: '21m00Tcm4TlvDq8ikWAM',
          aria:   '9BWtsMINqrJLrRacOk9x',
          adam:   'pNInz6obpgDQGcFmaJgB',
          josh:   'TxGEqnHWrfWFTfGW9XjX',
          bella:  'EXAVITQu4vr4xnSDxMaL',
        };
        const voiceId = VOICE_IDS[voiceKey] ?? VOICE_IDS.rachel;
        const result = await generatePracticeMutation.mutateAsync({
          type: practiceType as 'priming' | 'meditation' | 'breathwork' | 'visualization',
          voiceId,
          lengthMinutes: alarm?.morningPracticeLength,
          breathworkStyle: alarm?.morningBreathworkStyle,
          name: 'Friend',
          goals: goalList,
          rewards: [],
          habits: activeHabitNames,
          gratitudes,
        });
        setPracticeResult(result);
        setPracticeReady(true);
      } catch {
        // fail silently — practice is optional
      } finally {
        setPracticeGenerating(false);
      }
    }
  }

  async function handleSnooze() {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const snoozeMinutes = alarm.snoozeMinutes ?? 10;
    // Schedule a one-time notification snoozeMinutes from now
    if (Platform.OS !== 'web') {
      try {
        const triggerDate = new Date(Date.now() + snoozeMinutes * 60 * 1000);
        await Notifications.scheduleNotificationAsync({
          content: {
            title: "Snooze over — time to check in! ⏰",
            body: "Your daily habit check-in is waiting.",
            data: { action: 'open_checkin' },
            sound: 'default',
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DATE,
            date: triggerDate,
          } as Notifications.DateTriggerInput,
        });
      } catch (e) {
        console.warn('[Snooze] Failed to schedule:', e);
      }
    }
    router.back();
  }

  // ── Voice Check-in handlers ──
  async function handleVoiceMicPress() {
    if (vcStatus === 'recording') {
      // Stop recording — chunks are already being processed in background
      if (vcTimerRef.current) { clearInterval(vcTimerRef.current); vcTimerRef.current = null; }
      vcPulseLoopRef.current?.stop();
      Animated.spring(vcPulseAnim, { toValue: 1, useNativeDriver: true, speed: 30 }).start();
      await checkinRecorder.stop();
      // MANDATORY FINAL ANALYSIS: fire one last LLM call on the complete transcript
      // This is the polished result — mid-stream analysis is always partial/noisy
      const finalTranscript = vcTranscriptRef.current;
      if (finalTranscript.trim()) {
        setVcProcessing(true);
        try {
          const habitList = activeHabitsRef.current.map((h) => ({ id: h.id, name: h.name }));
          const finalAnalysis = await analyzeTranscriptMutation.mutateAsync({
            transcript: finalTranscript,
            habits: habitList,
          });
          const finalRatings: Record<string, Rating> = {};
          const finalNotes: Record<string, string> = {};
          for (const [habitId, data] of Object.entries(finalAnalysis.results) as [string, { rating: string | null; note: string }][]) {
            if (data.rating) finalRatings[habitId] = data.rating as Rating;
            if (data.note) finalNotes[habitId] = data.note;
          }
          if (Object.keys(finalRatings).length > 0) setRatings((prev) => ({ ...prev, ...finalRatings }));
          if (Object.keys(finalNotes).length > 0) setVcNotes((prev) => ({ ...prev, ...finalNotes }));
        } catch (e) {
          console.warn('[VoiceCheckin] Final analysis error:', e);
        } finally {
          setVcProcessing(false);
        }
      }
      // Show done state
      setVcStatus('done');
      // Auto-clear after 5 seconds
      setTimeout(() => setVcStatus('idle'), 5000);
    } else if (vcStatus === 'idle' || vcStatus === 'done' || vcStatus === 'error') {
      // Start recording
      if (Platform.OS !== 'web') {
        setVcStatus('error');
        setTimeout(() => setVcStatus('idle'), 2000);
        return;
      }
      // Reset transcript and notes for new session
      setVcTranscript('');
      vcTranscriptRef.current = '';
      vcWhisperInFlightRef.current = false;
      vcLastLlmWordCountRef.current = 0;
      emptyDeltaCountRef.current = 0;
      const ok = await checkinRecorder.start();
      if (!ok) { setVcStatus('error'); setTimeout(() => setVcStatus('idle'), 2000); return; }
      setVcElapsed(0);
      setVcStatus('recording');
      if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      // Start elapsed timer
      const startTime = Date.now();
      vcTimerRef.current = setInterval(() => setVcElapsed(Math.round((Date.now() - startTime) / 1000)), 500);
      // Start pulse animation
      vcPulseLoopRef.current = Animated.loop(Animated.sequence([
        Animated.timing(vcPulseAnim, { toValue: 1.3, duration: 600, useNativeDriver: true }),
        Animated.timing(vcPulseAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
      ]));
      vcPulseLoopRef.current.start();
    }
  }

  // Allow submission when at least 1 habit has been rated (partial check-in is valid)
  const anyRated = activeHabits.length > 0 &&
    activeHabits.some((h) => ratings[h.id] && ratings[h.id] !== 'none');
  // Keep allRated for display purposes (full completion indicator)
  const allRated = activeHabits.length > 0 &&
    activeHabits.every((h) => ratings[h.id] && ratings[h.id] !== 'none');

  // Only count ratings for currently active habits (avoids stale entries from past days inflating the score)
  const activeHabitIds = new Set(activeHabits.map((h) => h.id));
  const activeRatings = Object.entries(ratings)
    .filter(([id, r]) => activeHabitIds.has(id) && r !== 'none' && r !== undefined)
    .map(([, r]) => r);
  const ratedEntries = activeRatings;
  const greenCount  = ratedEntries.filter((r) => r === 'green').length;
  const yellowCount = ratedEntries.filter((r) => r === 'yellow').length;
  const redCount    = ratedEntries.filter((r) => r === 'red').length;
  const totalActive = activeHabits.length;
  const progress    = totalActive > 0 ? ratedEntries.length / totalActive : 0;

  if (submitted) {
    const score = totalActive > 0
      ? Math.round(((greenCount * 1 + yellowCount * 0.5) / totalActive) * 100)
      : 0;
    const scoreColor = score >= 70 ? '#22C55E' : score >= 40 ? '#F59E0B' : '#EF4444';
    const hasTeams = myTeams && myTeams.length > 0;

    // After-alarm meditation info
    const meditationId = alarm.meditationId;
    const meditationMeta = meditationId ? AFTER_ALARM_META[meditationId] : null;
    const showAfterAlarm = fromAlarm && !isPreview && meditationMeta;

    const handleShareToTeams = async () => {
      if (!myTeams) return;
      for (const team of myTeams) {
        await createPost.mutateAsync({
          teamId: team.id,
          type: 'checkin',
          content: score >= 70 ? 'Crushed it today!' : score >= 40 ? 'Solid effort today' : 'Showing up every day',
          checkinScore: score,
          checkinDate: currentDate,
        });
      }
      setShared(true);
      stopAfterAlarm();
      setTimeout(() => router.back(), 1200);
    };

    return (
      <ScreenContainer>
        <View style={styles.successContainer}>
          <Text style={[styles.successTitle, { color: colors.foreground }]}>
            {score >= 70 ? 'Crushed it!' : score >= 40 ? 'Good effort!' : 'Keep going!'}
          </Text>
          <Text style={[styles.successDate, { color: colors.muted }]}>
            {formatDisplayDate(currentDate)}
          </Text>
          <View style={[styles.successScoreWrap, { backgroundColor: scoreColor + '18', borderColor: scoreColor + '40' }]}>
            <Text style={[styles.successScore, { color: scoreColor }]}>{score}%</Text>
            <Text style={[styles.successScoreLabel, { color: scoreColor }]}>overall</Text>
          </View>
          <View style={styles.successPills}>
            {greenCount  > 0 && <View style={[styles.successPill, { backgroundColor: '#22C55E' }]}><Text style={styles.successPillText}>{greenCount} crushed</Text></View>}
            {yellowCount > 0 && <View style={[styles.successPill, { backgroundColor: '#F59E0B' }]}><Text style={styles.successPillText}>{yellowCount} okay</Text></View>}
            {redCount    > 0 && <View style={[styles.successPill, { backgroundColor: '#EF4444' }]}><Text style={styles.successPillText}>{redCount} missed</Text></View>}
          </View>

          {/* After-alarm session player card */}
          {showAfterAlarm && meditationMeta && (() => {
            const totalSecs = AFTER_ALARM_DURATIONS[meditationId!] ?? 300;
            const progress = Math.min(sessionElapsed / totalSecs, 1);
            const elapsed = formatMMSS(sessionElapsed);
            const totalLabel = formatMMSS(totalSecs);
            return (
              <View style={[styles.afterAlarmBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[styles.afterAlarmTitle, { color: colors.foreground }]}>
                  {meditationMeta.emoji}  {meditationMeta.label}
                </Text>
                <Text style={[styles.afterAlarmDesc, { color: colors.muted }]}>
                  {meditationMeta.description}
                </Text>
                {afterAlarmStarted ? (
                  <>
                    {/* Progress bar */}
                    <View style={[styles.sessionProgressTrack, { backgroundColor: colors.border }]}>
                      <View style={[styles.sessionProgressFill, { backgroundColor: colors.primary, width: `${Math.round(progress * 100)}%` as `${number}%` }]} />
                    </View>
                    <Text style={[styles.sessionTime, { color: colors.muted }]}>
                      {elapsed} / {totalLabel}
                    </Text>
                    {/* Stop button */}
                    <Pressable
                      style={({ pressed }) => [styles.afterAlarmStopBtn, { borderColor: colors.border, opacity: pressed ? 0.7 : 1 }]}
                      onPress={stopAfterAlarm}
                    >
                      <Text style={[styles.afterAlarmStopText, { color: colors.muted }]}>Stop</Text>
                    </Pressable>
                  </>
                ) : (
                  <View style={styles.sessionBtns}>
                    <Pressable
                      style={({ pressed }) => [styles.sessionSkipBtn, { borderColor: colors.border, opacity: pressed ? 0.7 : 1 }]}
                      onPress={stopAfterAlarm}
                    >
                      <Text style={[styles.sessionSkipText, { color: colors.muted }]}>✕  Skip</Text>
                    </Pressable>
                    <Pressable
                      style={({ pressed }) => [styles.sessionStartBtn, { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 }]}
                      onPress={() => startAfterAlarmSession(meditationId!)}
                    >
                      <Text style={styles.sessionStartText}>▶  Start</Text>
                    </Pressable>
                  </View>
                )}
              </View>
            );
          })()}

          {hasTeams && !shared && (
            <View style={[styles.shareTeamBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.shareTeamTitle, { color: colors.foreground }]}>Share with your team?</Text>
              <Text style={[styles.shareTeamSub, { color: colors.muted }]}>Post your check-in score to your team feed</Text>
              <View style={styles.shareTeamBtns}>
                <Pressable
                  style={({ pressed }) => [styles.shareTeamSkip, { borderColor: colors.border, opacity: pressed ? 0.6 : 1 }]}
                  onPress={() => { stopAfterAlarm(); setTimeout(() => router.back(), 300); }}
                >
                  <Text style={[styles.shareTeamSkipText, { color: colors.muted }]}>Skip</Text>
                </Pressable>
                <Pressable
                  style={({ pressed }) => [styles.shareTeamBtn, { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 }]}
                  onPress={handleShareToTeams}
                  disabled={createPost.isPending}
                >
                  <Text style={styles.shareTeamBtnText}>{createPost.isPending ? 'Sharing...' : 'Share'}</Text>
                </Pressable>
              </View>
            </View>
          )}

          {/* Morning Practice auto-launch card */}
          {(practiceReady || practiceGenerating) && (
            <View style={[styles.afterAlarmBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.afterAlarmTitle, { color: colors.foreground }]}>
                🌅  Morning Practice Ready
              </Text>
              <Text style={[styles.afterAlarmDesc, { color: colors.muted }]}>
                {practiceGenerating
                  ? 'Generating your personalized session...'
                  : 'Your session has been prepared with your voice.'}
              </Text>
              {!practiceGenerating && practiceResult && (
                <View style={styles.sessionBtns}>
                  <Pressable
                    style={({ pressed }) => [styles.sessionSkipBtn, { borderColor: colors.border, opacity: pressed ? 0.7 : 1 }]}
                    onPress={() => setPracticeReady(false)}
                  >
                    <Text style={[styles.sessionSkipText, { color: colors.muted }]}>✕  Skip</Text>
                  </Pressable>
                  <Pressable
                    style={({ pressed }) => [styles.sessionStartBtn, { backgroundColor: '#7C3AED', opacity: pressed ? 0.85 : 1 }]}
                    onPress={() => {
                      stopAfterAlarm();
                      router.push({
                        pathname: '/practice-player',
                        params: {
                          type: alarm?.morningPracticeType ?? 'meditation',
                          chunkUrls: JSON.stringify(practiceResult.chunkUrls),
                          pausesBetweenChunks: JSON.stringify(practiceResult.pausesBetweenChunks),
                          totalDurationMinutes: String(practiceResult.totalDurationMinutes),
                          breathworkStyle: alarm?.morningBreathworkStyle ?? 'box',
                        },
                      } as never);
                    }}
                  >
                    <Text style={styles.sessionStartText}>▶  Begin</Text>
                  </Pressable>
                </View>
              )}
            </View>
          )}

          {(!hasTeams || shared) && (
            <Pressable
              style={({ pressed }) => [styles.successDoneBtn, { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 }]}
              onPress={() => { stopAfterAlarm(); router.back(); }}
            >
              <Text style={styles.successDoneBtnText}>{shared ? 'Shared!' : 'Done'}</Text>
            </Pressable>
          )}
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer edges={["top", "left", "right"]}>

      {/* ── Countdown bar (alarm mode only) ── */}
      {isAlarmActive && (
        <Pressable onPress={resetCountdown} style={{ width: '100%' }}>
          <View style={styles.countdownTrack}>
            <Animated.View
              style={[
                styles.countdownFill,
                {
                  width: countdownAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: ['0%', '100%'],
                  }),
                  backgroundColor: countdownAnim.interpolate({
                    inputRange: [0, 0.3, 0.6, 1],
                    outputRange: ['#EF4444', '#EF4444', '#F59E0B', '#22C55E'],
                  }),
                },
              ]}
            />
          </View>
          <View style={styles.countdownLabelRow}>
            <Text style={styles.countdownLabel}>Keep going — tap or scroll to reset timer</Text>
          </View>
        </Pressable>
      )}

      {/* ── Alarm banner (fixed at top when opened from alarm) ── */}
      {fromAlarm && !isPreview && (
        <View style={[styles.alarmBanner, { backgroundColor: alarm.requireCheckin ? '#DC2626' : colors.primary }]}>
          <Text style={styles.alarmBannerText}>
            {alarm.requireCheckin
              ? '🔒 Complete your habits to turn off the alarm'
              : '⏰ Complete your check-in to dismiss the alarm'}
          </Text>
        </View>
      )}

      {/* ── Preview banner ── */}
      {isPreview && (
        <View style={[styles.alarmBanner, { backgroundColor: alarm.requireCheckin ? '#DC2626' : colors.primary }]}>
          <Text style={styles.alarmBannerText}>
            {alarm.requireCheckin
              ? '🔒 Preview: “Complete your habits to turn off the alarm”'
              : '👁 Preview Mode — this is what your alarm check-in looks like'}
          </Text>
        </View>
      )}

      {/* ── Header ── */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [styles.headerBtn, { opacity: pressed ? 0.5 : 1 }]}
        >
          <IconSymbol name="xmark" size={16} color={colors.muted} />
        </Pressable>

        <View style={styles.dateRow}>
          <Pressable
            onPress={() => navigateDate(-1)}
            style={({ pressed }) => [styles.arrowBtn, { opacity: pressed ? 0.5 : 1 }]}
          >
            <IconSymbol name="chevron.left" size={16} color={colors.primary} />
          </Pressable>
          <View style={styles.dateLabelWrap}>
            <Text style={[styles.dateLabel, { color: colors.foreground }]}>
              {formatDisplayDate(currentDate)}
            </Text>
            <Text style={[styles.dateSub, { color: colors.muted }]}>
              {new Date(currentDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
            </Text>
          </View>
          <Pressable
            onPress={() => canGoForward ? navigateDate(1) : undefined}
            style={({ pressed }) => [styles.arrowBtn, { opacity: canGoForward ? (pressed ? 0.5 : 1) : 0.2 }]}
          >
            <IconSymbol name="chevron.right" size={16} color={colors.primary} />
          </Pressable>
        </View>

        <View style={styles.headerBtn} />
      </View>

      {/* ── Progress bar ── */}
      <View style={[styles.progressTrack, { backgroundColor: colors.border }]}>
        <View style={[styles.progressFill, {
          width: `${Math.round(progress * 100)}%` as any,
          backgroundColor: colors.primary,
        }]} />
      </View>

      {/* ── Legend ── */}
      <View style={[styles.legendRow, { borderBottomColor: colors.border }]}>
        {RATINGS.map((r) => (
          <View key={r} style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: RATING_COLORS[r] }]} />
            <Text style={[styles.legendText, { color: colors.muted }]}>
              {r === 'red' ? 'Missed' : r === 'yellow' ? 'Okay' : 'Crushed it'}
            </Text>
          </View>
        ))}
      </View>

      {/* ── Global rate-all row ── */}
      <View style={[styles.rateAllRow, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <Text style={[styles.rateAllLabel, { color: colors.muted }]}>Rate All</Text>
        <View style={[styles.segmentedBtn, { backgroundColor: colors.border }]}>
          {RATINGS.map((r, i) => (
            <Pressable
              key={r}
              onPress={() => rateAll(r)}
              style={({ pressed }) => [
                styles.segment,
                i === 0 && styles.segmentFirst,
                i === RATINGS.length - 1 && styles.segmentLast,
                { backgroundColor: RATING_COLORS[r] + (pressed ? 'CC' : '88'), opacity: pressed ? 0.8 : 1 },
              ]}
            />
          ))}
        </View>
      </View>

      {/* ── Habit list ── */}
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        onScrollBeginDrag={resetCountdown}
        onMomentumScrollBegin={resetCountdown}
        scrollEventThrottle={400}
      >
        {sortedCategories.map((cat) => {
          const habits = habitsByCategory[cat.id] ?? [];
          if (habits.length === 0) return null;

          return (
            <View key={cat.id} style={styles.section}>
              <View style={styles.sectionHeader}>
                <CategoryIcon
                  categoryId={cat.id}
                  lifeArea={cat.lifeArea}
                  size={18}
                  color={colors.primary}
                />
                <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{cat.label}</Text>
                <View style={{ flex: 1 }} />
                <View style={[styles.segmentedBtn, { backgroundColor: colors.border }]}>
                  {RATINGS.map((r, i) => (
                    <Pressable
                      key={r}
                      onPress={() => rateCategory(cat.id, r)}
                      style={({ pressed }) => [
                        styles.segment,
                        styles.segmentSmall,
                        i === 0 && styles.segmentFirst,
                        i === RATINGS.length - 1 && styles.segmentLast,
                        { backgroundColor: RATING_COLORS[r] + (pressed ? 'CC' : '88'), opacity: pressed ? 0.8 : 1 },
                      ]}
                    />
                  ))}
                </View>
              </View>

              <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                {habits.map((habit, idx) => {
                  const current: Rating = ratings[habit.id] ?? 'none';
                  const isLast = idx === habits.length - 1;
                  const rank = idx + 1;

                  return (
                    <View
                      key={habit.id}
                      style={[
                        styles.habitRow,
                        !isLast && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
                      ]}
                    >
                      {/* Habit name with number badge */}
                      <View style={styles.habitNameRow}>
                        <View style={[styles.habitNumBadge, {
                          backgroundColor: colors.primary + '22',
                          borderColor: colors.primary + '44',
                        }]}>
                          <Text style={[styles.habitNumText, { color: colors.primary }]}>{rank}</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.habitName, { color: colors.foreground }]} numberOfLines={2}>
                            {habit.name}
                          </Text>
                          {habit.teamId && teamNameMap[habit.teamId] && (
                            <View style={[styles.teamBadge, { backgroundColor: colors.primary + '18', borderColor: colors.primary + '40' }]}>
                              <Text style={[styles.teamBadgeText, { color: colors.primary }]}>👥 {teamNameMap[habit.teamId]}</Text>
                            </View>
                          )}
                          {/* Show note area if: has a voice note, currently editing, or habit is rated (allow manual note) */}
                          {(vcNotes[habit.id] !== undefined || editingNoteId === habit.id || (ratings[habit.id] && ratings[habit.id] !== 'none')) ? (
                            editingNoteId === habit.id ? (
                              <TextInput
                                autoFocus
                                value={vcNotes[habit.id] ?? ''}
                                onChangeText={(t) => setVcNotes(prev => ({ ...prev, [habit.id]: t }))}
                                onBlur={() => setEditingNoteId(null)}
                                onSubmitEditing={() => setEditingNoteId(null)}
                                returnKeyType="done"
                                multiline
                                style={[styles.habitVcNoteInput, { color: RATING_COLORS[ratings[habit.id] as ActiveRating] ?? colors.muted, borderColor: (RATING_COLORS[ratings[habit.id] as ActiveRating] ?? colors.muted) + '55' }]}
                                placeholder="Add a note..."
                                placeholderTextColor={colors.muted + '88'}
                              />
                            ) : (
                              <Pressable onPress={() => setEditingNoteId(habit.id)} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 4 }}>
                                <Text style={[styles.habitVcNote, { color: RATING_COLORS[ratings[habit.id] as ActiveRating] ?? colors.muted, flex: 1 }]} numberOfLines={3}>
                                  {vcNotes[habit.id] || 'Tap to add note...'}
                                </Text>
                                <IconSymbol name="pencil" size={10} color={RATING_COLORS[ratings[habit.id] as ActiveRating] ?? colors.muted} style={{ marginTop: 2, opacity: 0.7 }} />
                              </Pressable>
                            )
                          ) : null}
                        </View>
                      </View>

                      {/* 3-color segmented button */}
                      <View style={[styles.segmentedBtn, { backgroundColor: colors.border }]}>
                        {RATINGS.map((rating, i) => {
                          const isSelected = current === rating;
                          const isFirst = i === 0;
                          const isLastSeg = i === RATINGS.length - 1;
                          const col = RATING_COLORS[rating];

                          return (
                            <Pressable
                              key={rating}
                              onPress={() => setRating(habit.id, rating)}
                              style={({ pressed }) => [
                                styles.segment,
                                isFirst && styles.segmentFirst,
                                isLastSeg && styles.segmentLast,
                                {
                                  backgroundColor: isSelected ? col : col + '28',
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

        <View style={{ height: 16 }} />
      </ScrollView>

      {/* ── Footer ── */}
      <View style={[styles.footer, { backgroundColor: colors.background, borderTopColor: colors.border }]}>
        {ratedEntries.length > 0 && (
          <View style={styles.tally}>
            {greenCount  > 0 && <View style={[styles.tallyPill, { backgroundColor: '#22C55E18' }]}><Text style={[styles.tallyText, { color: '#22C55E' }]}>{greenCount} crushed</Text></View>}
            {yellowCount > 0 && <View style={[styles.tallyPill, { backgroundColor: '#F59E0B18' }]}><Text style={[styles.tallyText, { color: '#F59E0B' }]}>{yellowCount} okay</Text></View>}
            {redCount    > 0 && <View style={[styles.tallyPill, { backgroundColor: '#EF444418' }]}><Text style={[styles.tallyText, { color: '#EF4444' }]}>{redCount} missed</Text></View>}
            <Text style={[styles.tallyOf, { color: colors.muted }]}>{ratedEntries.length}/{totalActive}</Text>
          </View>
        )}

        {/* ── Voice Check-in status bar ── */}
        {vcStatus === 'recording' && (
          <View style={[styles.vcStatusBar, { backgroundColor: '#EF444410', borderColor: '#EF444430', flexDirection: 'column', gap: 4 }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Animated.View style={[styles.vcDot, { backgroundColor: '#EF4444', transform: [{ scale: vcPulseAnim }] }]} />
              <Text style={[styles.vcStatusText, { color: '#EF4444', flex: 1 }]}>Recording… {formatMMSS(vcElapsed)}</Text>
              {vcProcessing && (
                <Text style={[styles.vcStatusHint, { color: colors.primary }]}>● Analyzing</Text>
              )}
              {!vcProcessing && (
                <Text style={[styles.vcStatusHint, { color: '#EF4444' }]}>Tap ■ to stop</Text>
              )}
            </View>
            {vcTranscript ? (
              <Text style={[styles.vcStatusHint, { color: '#EF4444', opacity: 0.8, paddingLeft: 16 }]} numberOfLines={2}>
                {vcTranscript}
              </Text>
            ) : null}
          </View>
        )}
        {vcStatus === 'done' && vcTranscript ? (
          <View style={[styles.vcStatusBar, { backgroundColor: '#22C55E10', borderColor: '#22C55E30' }]}>
            <IconSymbol name="checkmark.circle.fill" size={14} color="#22C55E" />
            <Text style={[styles.vcStatusText, { color: '#22C55E', flex: 1 }]} numberOfLines={2}>{vcTranscript}</Text>
          </View>
        ) : null}
        {vcStatus === 'error' && (
          <View style={[styles.vcStatusBar, { backgroundColor: '#EF444410', borderColor: '#EF444430' }]}>
            <Text style={[styles.vcStatusText, { color: '#EF4444' }]}>
              {checkinRecorder.micError ?? 'Could not analyze. Try again.'}
            </Text>
          </View>
        )}

        {/* Snooze button — only when opened from alarm and lockout is off */}
        {fromAlarm && !isPreview && !alarm.requireCheckin && (
          <Pressable
            onPress={handleSnooze}
            style={({ pressed }) => [
              styles.snoozeBtn,
              { borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
            ]}
          >
            <IconSymbol name="clock.arrow.circlepath" size={16} color={colors.muted} />
            <Text style={[styles.snoozeBtnText, { color: colors.muted }]}>
              Snooze {alarm.snoozeMinutes ?? 10} min
            </Text>
          </Pressable>
        )}

        {/* Mic + Save row */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          {/* Voice check-in mic button */}
          {Platform.OS === 'web' && (
            <Pressable
              onPress={handleVoiceMicPress}
              style={({ pressed }) => [
                styles.vcMicBtn,
                {
                  backgroundColor: vcStatus === 'recording' ? '#EF4444' : colors.surface,
                  borderColor: vcStatus === 'recording' ? '#EF4444' : colors.border,
                  opacity: pressed ? 0.8 : 1,
                  transform: [{ scale: pressed ? 0.95 : 1 }],
                },
              ]}
            >
              <Animated.View style={{ transform: [{ scale: vcStatus === 'recording' ? vcPulseAnim : 1 }] }}>
                <IconSymbol
                  name={vcStatus === 'recording' ? 'stop.fill' : 'mic.fill'}
                  size={20}
                  color={vcStatus === 'recording' ? '#fff' : colors.muted}
                />
              </Animated.View>
            </Pressable>
          )}

          <Pressable
            onPress={anyRated ? handleSubmit : undefined}
            style={({ pressed }) => [
              styles.saveBtn,
              { flex: 1 },
              {
                backgroundColor: anyRated ? colors.primary : colors.border,
                transform: [{ scale: anyRated && pressed ? 0.97 : 1 }],
                opacity: anyRated ? 1 : 0.55,
              },
            ]}
          >
            <Text style={[styles.saveBtnText, { color: anyRated ? '#fff' : colors.muted }]}>
              {allRated
                ? 'Save Review'
                : anyRated
                ? `Save Partial Review (${ratedEntries.length}/${totalActive})`
                : `Rate at least one habit to save`}
            </Text>
          </Pressable>
        </View>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 12, paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  dateRow: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  arrowBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  dateLabelWrap: { alignItems: 'center', minWidth: 140 },
  dateLabel: { fontSize: 15, fontWeight: '700' },
  dateSub: { fontSize: 11, marginTop: 1 },

  progressTrack: { height: 2 },
  progressFill: { height: 2, borderRadius: 1 },

  countdownTrack: { height: 6, backgroundColor: '#1a1a1a', width: '100%' },
  countdownFill: { height: 6, borderRadius: 0 },
  countdownLabelRow: {
    backgroundColor: '#1a0000',
    paddingVertical: 5, paddingHorizontal: 16,
    alignItems: 'center',
  },
  countdownLabel: {
    color: '#EF444499', fontSize: 11, fontWeight: '600', textAlign: 'center',
  },

  legendRow: {
    flexDirection: 'row', justifyContent: 'center', gap: 20,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 7, height: 7, borderRadius: 4 },
  legendText: { fontSize: 12, fontWeight: '500' },

  scroll: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12 },

  section: { marginBottom: 18 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 8 },
  sectionEmoji: { fontSize: 16 },
  sectionTitle: { fontSize: 13, fontWeight: '700', letterSpacing: 0.3, textTransform: 'uppercase' },

  card: { borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },

  habitRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 14, paddingVertical: 13, gap: 12,
  },
  habitNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  habitNumBadge: {
    width: 26, height: 26, borderRadius: 7, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  habitNumText: { fontSize: 12, fontWeight: '700' },
  habitName: { fontSize: 15, lineHeight: 20 },
  teamBadge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginTop: 3,
  },
  teamBadgeText: { fontSize: 11, fontWeight: '600' },

  segmentedBtn: {
    flexDirection: 'row',
    borderRadius: 11,
    overflow: 'hidden',
    gap: 2,
    padding: 2,
  },
  segment: {
    width: 36,
    height: 34,
    borderRadius: 8,
  },
  segmentFirst: { borderTopLeftRadius: 9, borderBottomLeftRadius: 9 },
  segmentLast:  { borderTopRightRadius: 9, borderBottomRightRadius: 9 },
  segmentSmall: { width: 28, height: 26 },

  rateAllRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rateAllLabel: { fontSize: 13, fontWeight: '600', letterSpacing: 0.3, textTransform: 'uppercase' },

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
  saveBtn: {
    borderRadius: 14, paddingVertical: 15,
    alignItems: 'center', justifyContent: 'center',
  },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '700', letterSpacing: 0.2 },

  // Voice check-in styles
  habitVcNote: { fontSize: 11, fontWeight: '600', marginTop: 3, letterSpacing: 0.1 },
  habitVcNoteInput: {
    fontSize: 11, fontWeight: '600', marginTop: 3, letterSpacing: 0.1,
    borderWidth: 1, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 3,
    minHeight: 28,
  },
  vcStatusBar: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderRadius: 10, borderWidth: 1,
    paddingHorizontal: 12, paddingVertical: 8,
  },
  vcDot: { width: 8, height: 8, borderRadius: 4 },
  vcStatusText: { fontSize: 13, fontWeight: '600', flex: 1 },
  vcStatusHint: { fontSize: 11, opacity: 0.7 },
  vcMicBtn: {
    width: 52, height: 52, borderRadius: 14, borderWidth: 1.5,
    alignItems: 'center', justifyContent: 'center',
  },

  successContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 32 },
  successTitle: { fontSize: 26, fontWeight: '700' },
  successDate: { fontSize: 14 },
  successScoreWrap: {
    borderRadius: 20, borderWidth: 1.5,
    paddingHorizontal: 28, paddingVertical: 14,
    alignItems: 'center', marginVertical: 4,
  },
  successScore: { fontSize: 48, fontWeight: '900', letterSpacing: -1 },
  successScoreLabel: { fontSize: 13, fontWeight: '600', marginTop: -4 },
  successPills: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', justifyContent: 'center', marginTop: 8 },
  successPill: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20 },
  successPillText: { color: '#fff', fontSize: 13, fontWeight: '700' },

  afterAlarmBox: {
    borderRadius: 16, borderWidth: 1, padding: 16, width: '100%',
    alignItems: 'center', gap: 6, marginTop: 12,
  },
  afterAlarmTitle: { fontSize: 17, fontWeight: '700' },
  afterAlarmDesc: { fontSize: 13, textAlign: 'center' },
  afterAlarmStopBtn: {
    borderRadius: 10, borderWidth: 1,
    paddingHorizontal: 20, paddingVertical: 8, marginTop: 4,
  },
  afterAlarmStopText: { fontSize: 14, fontWeight: '600' },
  sessionProgressTrack: { width: '100%', height: 6, borderRadius: 3, marginTop: 10, overflow: 'hidden' },
  sessionProgressFill: { height: 6, borderRadius: 3 },
  sessionTime: { fontSize: 12, marginTop: 4 },
  sessionBtns: { flexDirection: 'row', gap: 10, marginTop: 10, width: '100%' },
  sessionSkipBtn: { flex: 1, borderRadius: 12, borderWidth: 1, paddingVertical: 12, alignItems: 'center' },
  sessionSkipText: { fontSize: 14, fontWeight: '600' },
  sessionStartBtn: { flex: 2, borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  sessionStartText: { color: '#fff', fontSize: 14, fontWeight: '700' },

  shareTeamBox: { borderRadius: 16, borderWidth: 1, padding: 16, width: '100%', gap: 8, marginTop: 12 },
  shareTeamTitle: { fontSize: 16, fontWeight: '700', textAlign: 'center' },
  shareTeamSub: { fontSize: 13, textAlign: 'center', lineHeight: 18 },
  shareTeamBtns: { flexDirection: 'row', gap: 10, marginTop: 4 },
  shareTeamSkip: { flex: 1, borderRadius: 12, borderWidth: 1, paddingVertical: 12, alignItems: 'center' },
  shareTeamSkipText: { fontSize: 14, fontWeight: '600' },
  shareTeamBtn: { flex: 2, borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  shareTeamBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  successDoneBtn: { borderRadius: 14, paddingVertical: 14, paddingHorizontal: 40, alignItems: 'center', marginTop: 16 },
  successDoneBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  alarmBanner: {
    paddingVertical: 10, paddingHorizontal: 16,
    alignItems: 'center', justifyContent: 'center',
  },
  alarmBannerText: {
    color: '#fff', fontSize: 14, fontWeight: '700', textAlign: 'center',
  },
  snoozeBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    borderRadius: 14, paddingVertical: 13,
    borderWidth: 1.5,
  },
  snoozeBtnText: { fontSize: 15, fontWeight: '700' },
});
