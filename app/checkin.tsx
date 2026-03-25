import {
  ScrollView, Text, View, Pressable, StyleSheet, Platform, Animated, TextInput, Image, Alert, Share,
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
import { useIsCalm } from '@/components/calm-effects';

// ─── Voice Check-in Simple Recorder ─────────────────────────────────────────
// Simple approach: record all audio, stop, send full blob to Whisper once.
// No streaming, no silence detection, no chunk intervals.
// Result: reliable on web + native, ~0.5-1.5s transcription after stop.

function useSimpleRecorder() {
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const allChunksRef = useRef<Blob[]>([]);
  const mimeTypeRef = useRef<string>('audio/webm');
  const isRecordingRef = useRef(false);
  const [isRecording, setIsRecording] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);

  const start = useCallback(async (): Promise<boolean> => {
    setMicError(null);
    allChunksRef.current = [];
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
        if (e.data && e.data.size > 0) allChunksRef.current.push(e.data);
      };
      mr.start(100);
      mediaRecorderRef.current = mr;
      isRecordingRef.current = true;
      setIsRecording(true);
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

  // Stop recording and return the full audio blob
  const stop = useCallback((): Promise<Blob | null> => {
    return new Promise((resolve) => {
      const mr = mediaRecorderRef.current;
      if (!mr || mr.state === 'inactive') {
        isRecordingRef.current = false;
        setIsRecording(false);
        resolve(null);
        return;
      }
      mr.addEventListener('stop', () => {
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        const blob = allChunksRef.current.length > 0
          ? new Blob(allChunksRef.current, { type: mimeTypeRef.current })
          : null;
        allChunksRef.current = [];
        isRecordingRef.current = false;
        setIsRecording(false);
        resolve(blob);
      }, { once: true });
      mr.stop();
    });
  }, []);

  const getMimeType = useCallback(() => mimeTypeRef.current, []);

  return { start, stop, getMimeType, isRecording, isRecordingRef, micError };
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

// ─── Celebration Overlay ─────────────────────────────────────────────────────
// Shows fireworks/confetti animation for 3 seconds after check-in submission.
// Uses pure React Native Animated API (no native modules needed).

const CONFETTI_COLORS = ['#22C55E', '#F59E0B', '#6366F1', '#EF4444', '#60A5FA', '#F472B6', '#34D399', '#FBBF24'];
const NUM_PARTICLES = 40;

function CelebrationOverlay({ score }: { score: number }) {
  const [visible, setVisible] = useState(true);
  const particles = useRef(
    Array.from({ length: NUM_PARTICLES }, (_, i) => ({
      x: new Animated.Value(0),
      y: new Animated.Value(0),
      opacity: new Animated.Value(1),
      color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      size: 6 + Math.random() * 8,
      startX: 0.1 + Math.random() * 0.8, // fraction of screen width
    }))
  ).current;

  useEffect(() => {
    if (!visible) return;
    const animations = particles.map((p) => {
      const endX = (Math.random() - 0.5) * 300;
      const endY = 200 + Math.random() * 400;
      return Animated.parallel([
        Animated.timing(p.x, { toValue: endX, duration: 1800 + Math.random() * 800, useNativeDriver: true }),
        Animated.timing(p.y, { toValue: endY, duration: 1800 + Math.random() * 800, useNativeDriver: true }),
        Animated.sequence([
          Animated.delay(800),
          Animated.timing(p.opacity, { toValue: 0, duration: 800, useNativeDriver: true }),
        ]),
      ]);
    });
    Animated.parallel(animations).start();
    const timer = setTimeout(() => setVisible(false), 3000);
    return () => clearTimeout(timer);
  }, []);

  if (!visible || score < 40) return null;

  return (
    <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
      {particles.map((p, i) => (
        <Animated.View
          key={i}
          style={[
            {
              position: 'absolute',
              top: 80,
              left: `${Math.round(p.startX * 100)}%` as `${number}%`,
              width: p.size,
              height: p.size,
              borderRadius: p.size / 4,
              backgroundColor: p.color,
            },
            { transform: [{ translateX: p.x }, { translateY: p.y }], opacity: p.opacity },
          ]}
        />
      ))}
    </View>
  );
}

export default function CheckInScreen() {
  const { activeHabits, categories, submitCheckIn, getRatingsForDate, alarm, isPendingCheckIn, streak } = useApp();
  const sortedCategories = useMemo(() => [...categories].sort((a, b) => a.order - b.order), [categories]);
  const colors = useColors();
  const isCalm = useIsCalm();
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
  // Inline morning practice picker (shown after check-in submission)
  // Default type = alarm's selected after-alarm type; default duration = saved per-type duration
  const defaultMpType = (alarm?.meditationId && alarm.meditationId !== 'journaling'
    ? alarm.meditationId
    : 'priming') as 'priming' | 'meditation' | 'breathwork' | 'visualization';
  const defaultMpDuration = alarm?.practiceDurations?.[defaultMpType] ?? 10;
  const [mpPickerVisible, setMpPickerVisible] = useState(false);
  const [mpCustomPickerVisible, setMpCustomPickerVisible] = useState(false);
  const [mpSelectedType, setMpSelectedType] = useState<'priming' | 'meditation' | 'breathwork' | 'visualization'>(defaultMpType);
  const [mpSelectedDuration, setMpSelectedDuration] = useState<number>(defaultMpDuration);
  const [mpCustomDuration, setMpCustomDuration] = useState('');
  const [mpGenerating, setMpGenerating] = useState(false);
  const [mpDismissed, setMpDismissed] = useState(false);

  // ── Voice Check-in state (simple: record all → stop → transcribe once → analyze) ──
  const [vcStatus, setVcStatus] = useState<'idle' | 'recording' | 'transcribing' | 'done' | 'error'>('idle');
  const [vcTranscript, setVcTranscript] = useState('');
  const [vcNotes, setVcNotes] = useState<Record<string, string>>({});
  const [vcElapsed, setVcElapsed] = useState(0);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const vcTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const vcPulseAnim = useRef(new Animated.Value(1)).current;
  const vcPulseLoopRef = useRef<Animated.CompositeAnimation | null>(null);
  const transcribeChunkMutation = trpc.voiceCheckin.transcribeChunk.useMutation();
  const analyzeTranscriptMutation = trpc.voiceCheckin.analyzeTranscript.useMutation();

  // Load existing day notes for the current date into vcNotes on mount
  useEffect(() => {
    loadDayNotes().then((allNotes) => {
      const notesForDate: Record<string, string> = {};
      for (const habit of activeHabits) {
        const key = `${habit.id}:${currentDate}`;
        if (allNotes[key]) notesForDate[habit.id] = allNotes[key];
      }
      if (Object.keys(notesForDate).length > 0) setVcNotes(notesForDate);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const checkinRecorder = useSimpleRecorder();

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

  // Priming screen data: photo highlights, gratitudes, vision board goals
  const [primingPhotos, setPrimingPhotos] = useState<string[]>([]);
  const [primingGratitudes, setPrimingGratitudes] = useState<string[]>([]);
  const [primingGoals, setPrimingGoals] = useState<string[]>([]);
  const [primingPhotoIdx, setPrimingPhotoIdx] = useState(0);
  const primingSlideTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  // Load priming data from local storage when priming session starts
  async function loadPrimingData() {
    try {
      const { loadEntries } = await import('@/lib/journal-store');
      const uid = await import('@/lib/storage').then((m) => m.getLastUserId());
      const journalEntries = await loadEntries(uid || 'default');
      // Collect recent photo attachments (last 30 entries)
      const photos: string[] = [];
      const gratitudes: string[] = [];
      const { parseGratitudes } = await import('@/lib/journal-store');
      for (const e of journalEntries.slice(0, 30)) {
        for (const att of e.attachments ?? []) {
          if ((att.type === 'photo') && att.uri && photos.length < 12) photos.push(att.uri);
        }
        // Parse gratitudes from body text (🙏 Grateful for: section)
        const bodyGratitudes = parseGratitudes(e.body ?? '');
        for (const g of bodyGratitudes) {
          if (g.trim() && gratitudes.length < 10) gratitudes.push(g.trim());
        }
        // Also fall back to legacy gratitudes field if present
        for (const g of e.gratitudes ?? []) {
          if (g.trim() && gratitudes.length < 10 && !gratitudes.includes(g.trim())) gratitudes.push(g.trim());
        }
      }
      // Load vision board goals from storage
      const goalsRaw = await import('@react-native-async-storage/async-storage').then((m) => m.default.getItem('daycheck:visionGoals'));
      const goals: string[] = goalsRaw ? JSON.parse(goalsRaw) : [];
      setPrimingPhotos(photos);
      setPrimingGratitudes(gratitudes);
      setPrimingGoals(goals);
      setPrimingPhotoIdx(0);
      // Auto-advance slideshow every 4s
      if (primingSlideTimer.current) clearInterval(primingSlideTimer.current);
      if (photos.length > 1) {
        primingSlideTimer.current = setInterval(() => {
          setPrimingPhotoIdx((i) => (i + 1) % photos.length);
        }, 4000);
      }
    } catch (e) {
      console.warn('[Priming] Failed to load priming data:', e);
    }
  }

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
    // Load photo highlights, gratitudes, and vision board goals for priming display
    loadPrimingData();
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
    // Reset voice notes and load existing notes for the new date
    loadDayNotes().then((allNotes) => {
      const notesForDate: Record<string, string> = {};
      for (const habit of activeHabits) {
        const key = `${habit.id}:${newDate}`;
        if (allNotes[key]) notesForDate[habit.id] = allNotes[key];
      }
      setVcNotes(notesForDate);
    });
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

  // ── Morning Practice inline launcher ────────────────────────────────────────
  async function handleMpLaunch() {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    // ── Test audio shortcut: Priming 5-min uses a pre-recorded MP3 (no TTS generation needed) ──
    const customMinsRaw = parseInt(mpCustomDuration, 10);
    const effectiveDurForTest = (!isNaN(customMinsRaw) && customMinsRaw > 0) ? customMinsRaw : mpSelectedDuration;
    if (mpSelectedType === 'priming' && effectiveDurForTest === 5) {
      stopAfterAlarm();
      router.push({
        pathname: '/practice-player',
        params: {
          type: 'priming',
          chunkUrls: JSON.stringify(['https://files.manuscdn.com/user_upload_by_module/session_file/310519663287248938/lYxzlZcwkYrgInjh.mp3']),
          pausesBetweenChunks: JSON.stringify([0]),
          totalDurationMinutes: '5',
          breathworkStyle: 'box',
        },
      } as never);
      return;
    }

    setMpGenerating(true);
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
      const customMins = parseInt(mpCustomDuration, 10);
      const durationMins = (!isNaN(customMins) && customMins > 0) ? customMins : mpSelectedDuration;
      const result = await generatePracticeMutation.mutateAsync({
        type: mpSelectedType,
        voiceId,
        lengthMinutes: durationMins,
        breathworkStyle: alarm?.morningBreathworkStyle ?? 'box',
        name: 'Friend',
        goals: goalList,
        rewards: [],
        habits: activeHabitNames,
        gratitudes,
      });
      stopAfterAlarm();
      router.push({
        pathname: '/practice-player',
        params: {
          type: mpSelectedType,
          chunkUrls: JSON.stringify(result.chunkUrls),
          pausesBetweenChunks: JSON.stringify(result.pausesBetweenChunks),
          totalDurationMinutes: String(result.totalDurationMinutes),
          breathworkStyle: alarm?.morningBreathworkStyle ?? 'box',
        },
      } as never);
    } catch (err: any) {
      Alert.alert('Could not generate session', err?.message ?? 'Something went wrong. Please try again.');
    } finally {
      setMpGenerating(false);
    }
  }

  async function handleSubmit() {
    if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    // Stop countdown before submitting
    if (countdownAnimRef.current) countdownAnimRef.current.stop();
    if (countdownRef.current) clearTimeout(countdownRef.current);

    // ── PREVIEW MODE: skip saving, just show the post-submission screen ──
    if (isPreview) {
      setSubmitted(true);
      return;
    }

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
  // Simple flow: tap mic → record → tap stop → Whisper transcribes full audio → LLM rates habits
  async function handleVoiceMicPress() {
    if (vcStatus === 'recording') {
      // STOP: stop timer + animation, get full audio blob, transcribe + analyze
      if (vcTimerRef.current) { clearInterval(vcTimerRef.current); vcTimerRef.current = null; }
      vcPulseLoopRef.current?.stop();
      Animated.spring(vcPulseAnim, { toValue: 1, useNativeDriver: true, speed: 30 }).start();

      // Show transcribing state immediately (optimistic UI)
      setVcStatus('transcribing');

      // Get the full audio blob from the recorder
      const audioBlob = await checkinRecorder.stop();
      if (!audioBlob || audioBlob.size < 500) {
        setVcStatus('error');
        setTimeout(() => setVcStatus('idle'), 3000);
        return;
      }

      try {
        // STEP 1: Whisper — transcribe full audio in one shot
        const audioBase64 = await blobToBase64(audioBlob);
        const mimeType = checkinRecorder.getMimeType();
        const transcribeResult = await transcribeChunkMutation.mutateAsync({
          audioBase64,
          mimeType,
          previousTranscript: 'Daily habit check-in',
        });
        const fullTranscript = transcribeResult.delta?.trim() ?? '';
        if (!fullTranscript) {
          setVcStatus('error');
          setTimeout(() => setVcStatus('idle'), 3000);
          return;
        }
        setVcTranscript(fullTranscript);

        // STEP 2: LLM — analyze full transcript and rate all habits at once
        const allHabits = activeHabits.map((h) => ({ id: h.id, name: h.name }));
        const analysis = await analyzeTranscriptMutation.mutateAsync({
          transcript: fullTranscript,
          habits: allHabits,
        });
        const newRatings: Record<string, Rating> = {};
        const newNotes: Record<string, string> = {};
        for (const [habitId, data] of Object.entries(analysis.results) as [string, { rating: string | null; note: string }][]) {
          if (data.rating) newRatings[habitId] = data.rating as Rating;
          if (data.note) newNotes[habitId] = data.note;
        }
        if (Object.keys(newRatings).length > 0) setRatings((prev) => ({ ...prev, ...newRatings }));
        if (Object.keys(newNotes).length > 0) setVcNotes((prev) => ({ ...prev, ...newNotes }));

        setVcStatus('done');
        if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        // Auto-clear after 6 seconds
        setTimeout(() => setVcStatus('idle'), 6000);
      } catch (e) {
        console.warn('[VoiceCheckin] Transcription/analysis error:', e);
        setVcStatus('error');
        setTimeout(() => setVcStatus('idle'), 3000);
      }

    } else if (vcStatus === 'idle' || vcStatus === 'done' || vcStatus === 'error') {
      // START recording
      setVcTranscript('');
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
    // Show after-alarm content in real alarm flow AND in preview mode
    const showAfterAlarm = (fromAlarm || isPreview) && meditationMeta;

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
        {/* ── Celebration confetti overlay ── */}
        <CelebrationOverlay score={score} />
        <View style={styles.successContainer}>
          <Text style={[styles.successTitle, { color: colors.foreground }]}>
            {score >= 70 ? '🎉 Crushed it!' : score >= 40 ? '✨ Good effort!' : '💪 Keep going!'}
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

          {/* ── Shareable Win Cards ── */}
          {(() => {
            const winCards: { id: string; gradient: [string, string]; headline: string; subline: string; message: string }[] = [];
            if (score === 100) winCards.push({ id: 'perfect', gradient: ['#22C55E', '#16A34A'], headline: '💯 Perfect Day', subline: 'Every single habit crushed', message: `I just had a PERFECT day — 100% on every habit! 💯 Building momentum one day at a time. #DailyProgress` });
            if (streak >= 7 && streak % 7 === 0) winCards.push({ id: 'streak', gradient: ['#F59E0B', '#D97706'], headline: `🔥 ${streak}-Day Streak`, subline: `${streak} days of showing up`, message: `${streak} days in a row of showing up for myself 🔥 Consistency is everything. #Streak #DailyProgress` });
            if (streak >= 3 && streak < 7) winCards.push({ id: 'streak3', gradient: ['#F59E0B', '#D97706'], headline: `🔥 ${streak}-Day Streak`, subline: 'Building momentum', message: `${streak} days in a row! 🔥 Building momentum one day at a time. #DailyProgress` });
            if (greenCount >= 5) winCards.push({ id: 'green5', gradient: ['#6366F1', '#4F46E5'], headline: `💪 ${greenCount} Habits Crushed`, subline: 'On fire today', message: `Crushed ${greenCount} habits today 💪 Showing up and doing the work. #DailyProgress` });
            if (score >= 70 && score < 100) winCards.push({ id: 'solid', gradient: ['#0EA5E9', '#0284C7'], headline: `✨ ${score}% Score`, subline: 'Strong day', message: `Hit ${score}% on my daily habits today ✨ Progress over perfection. #DailyProgress` });
            // Always add at least one card
            if (winCards.length === 0) winCards.push({ id: 'showing-up', gradient: ['#64748B', '#475569'], headline: '💪 Showing Up', subline: 'Every rep counts', message: `Showing up for myself today 💪 Every day counts. #DailyProgress` });
            return (
              <View style={{ width: '100%', marginTop: 16, marginBottom: 4 }}>
                <Text style={{ fontSize: 11, fontWeight: '700', color: colors.muted, letterSpacing: 0.8, marginBottom: 10 }}>SHARE YOUR WIN</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingRight: 4 }}>
                  {winCards.map(card => (
                    <View key={card.id} style={{ width: 200, borderRadius: 16, padding: 16, overflow: 'hidden', backgroundColor: card.gradient[0] }}>
                      <Text style={{ fontSize: 22, fontWeight: '900', color: '#fff', lineHeight: 28 }}>{card.headline}</Text>
                      <Text style={{ fontSize: 13, color: 'rgba(255,255,255,0.8)', marginTop: 4, marginBottom: 16 }}>{card.subline}</Text>
                      <Pressable
                        onPress={() => {
                          if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                          Share.share({ message: card.message });
                        }}
                        style={({ pressed }) => ({
                          backgroundColor: 'rgba(255,255,255,0.25)',
                          borderRadius: 10,
                          paddingVertical: 9,
                          paddingHorizontal: 14,
                          alignSelf: 'flex-start',
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 6,
                          opacity: pressed ? 0.7 : 1,
                        })}
                      >
                        <Text style={{ fontSize: 13, fontWeight: '700', color: '#fff' }}>Share</Text>
                      </Pressable>
                    </View>
                  ))}
                </ScrollView>
              </View>
            );
          })()}

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

                    {/* Photo highlights slideshow */}
                    {primingPhotos.length > 0 && (
                      <View style={{ marginTop: 12, borderRadius: 12, overflow: 'hidden', width: '100%', aspectRatio: 1.5 }}>
                        <Image
                          source={{ uri: primingPhotos[primingPhotoIdx] }}
                          style={{ width: '100%', height: '100%' }}
                          resizeMode="cover"
                        />
                        {primingPhotos.length > 1 && (
                          <View style={{ position: 'absolute', bottom: 8, alignSelf: 'center', flexDirection: 'row', gap: 4 }}>
                            {primingPhotos.map((_, i) => (
                              <View key={i} style={{ width: i === primingPhotoIdx ? 14 : 6, height: 6, borderRadius: 3, backgroundColor: i === primingPhotoIdx ? '#fff' : 'rgba(255,255,255,0.4)' }} />
                            ))}
                          </View>
                        )}
                      </View>
                    )}

                    {/* Recent gratitudes */}
                    {primingGratitudes.length > 0 && (
                      <View style={{ marginTop: 14, gap: 6, width: '100%' }}>
                        <Text style={{ fontSize: 11, fontWeight: '700', color: colors.primary, letterSpacing: 0.5 }}>GRATEFUL FOR</Text>
                        {primingGratitudes.slice(0, 5).map((g, i) => (
                          <View key={i} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
                            <Text style={{ fontSize: 13 }}>🙏</Text>
                            <Text style={{ flex: 1, fontSize: 13, color: colors.foreground, lineHeight: 18 }}>{g}</Text>
                          </View>
                        ))}
                      </View>
                    )}

                    {/* Vision board goals */}
                    {primingGoals.length > 0 && (
                      <View style={{ marginTop: 14, gap: 6, width: '100%' }}>
                        <Text style={{ fontSize: 11, fontWeight: '700', color: colors.primary, letterSpacing: 0.5 }}>YOUR GOALS</Text>
                        {primingGoals.slice(0, 5).map((g, i) => (
                          <View key={i} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
                            <Text style={{ fontSize: 13 }}>🎯</Text>
                            <Text style={{ flex: 1, fontSize: 13, color: colors.foreground, lineHeight: 18 }}>{g}</Text>
                          </View>
                        ))}
                      </View>
                    )}

                    {/* Stop button */}
                    <Pressable
                      style={({ pressed }) => [styles.afterAlarmStopBtn, { borderColor: colors.border, opacity: pressed ? 0.7 : 1, marginTop: 16 }]}
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

          {/* Morning Practice card — shown after alarm check-in (and in preview mode), not dismissed */}
          {(fromAlarm || isPreview) && !mpDismissed && (() => {
            const MP_META: Record<string, { emoji: string; label: string }> = {
              priming: { emoji: '⚡', label: 'Priming' },
              meditation: { emoji: '🧘', label: 'Guided Meditation' },
              breathwork: { emoji: '💨', label: 'Breathwork' },
              visualization: { emoji: '🎯', label: 'Visualization' },
            };
            const meta = MP_META[mpSelectedType] ?? MP_META.priming;
            const customMins = parseInt(mpCustomDuration, 10);
            const effectiveDuration = (!isNaN(customMins) && customMins > 0) ? customMins : mpSelectedDuration;
            return (
              <View style={[styles.afterAlarmBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[styles.afterAlarmTitle, { color: colors.foreground }]}>🌅  Morning Practice</Text>
                <Text style={[styles.afterAlarmDesc, { color: colors.muted, marginBottom: 12 }]}>
                  {meta.emoji} {meta.label} · {effectiveDuration} min
                </Text>

                {/* Practice type chips */}
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginBottom: 14 }}>
                  {([{ id: 'priming', emoji: '⚡', label: 'Priming' }, { id: 'meditation', emoji: '🧘', label: 'Meditation' }, { id: 'breathwork', emoji: '💨', label: 'Breathwork' }, { id: 'visualization', emoji: '🎯', label: 'Visualization' }] as const).map(opt => (
                    <Pressable
                      key={opt.id}
                      onPress={() => {
                        setMpSelectedType(opt.id);
                        setMpSelectedDuration(alarm?.practiceDurations?.[opt.id] ?? 10);
                        setMpCustomDuration('');
                        setMpCustomPickerVisible(false);
                      }}
                      style={({ pressed }) => ({
                        paddingHorizontal: 11,
                        paddingVertical: 6,
                        borderRadius: 16,
                        borderWidth: 1.5,
                        borderColor: mpSelectedType === opt.id ? '#6366F1' : colors.border,
                        backgroundColor: mpSelectedType === opt.id ? '#6366F118' : 'transparent',
                        opacity: pressed ? 0.7 : 1,
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 4,
                      })}
                    >
                      <Text style={{ fontSize: 13 }}>{opt.emoji}</Text>
                      <Text style={{ fontSize: 12, fontWeight: '600', color: mpSelectedType === opt.id ? '#6366F1' : colors.muted }}>{opt.label}</Text>
                    </Pressable>
                  ))}
                </View>

                {/* Custom time picker (shown when yellow button tapped) */}
                {mpCustomPickerVisible && (
                  <View style={{ marginBottom: 14, gap: 8 }}>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: colors.muted, letterSpacing: 0.5 }}>PICK DURATION</Text>
                    <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                      {[5, 10, 15, 20].map(min => (
                        <Pressable
                          key={min}
                          onPress={() => { setMpSelectedDuration(min); setMpCustomDuration(''); }}
                          style={({ pressed }) => ({
                            paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1.5,
                            borderColor: mpSelectedDuration === min && !mpCustomDuration ? '#6366F1' : colors.border,
                            backgroundColor: mpSelectedDuration === min && !mpCustomDuration ? '#6366F118' : 'transparent',
                            opacity: pressed ? 0.7 : 1,
                          })}
                        >
                          <Text style={{ fontSize: 13, fontWeight: '600', color: mpSelectedDuration === min && !mpCustomDuration ? '#6366F1' : colors.foreground }}>{min} min</Text>
                        </Pressable>
                      ))}
                      <View style={{
                        flexDirection: 'row', alignItems: 'center', borderWidth: 1.5,
                        borderColor: mpCustomDuration ? '#6366F1' : colors.border, borderRadius: 20,
                        paddingHorizontal: 10, paddingVertical: 4,
                        backgroundColor: mpCustomDuration ? '#6366F118' : 'transparent',
                      }}>
                        <TextInput
                          value={mpCustomDuration}
                          onChangeText={setMpCustomDuration}
                          placeholder="Custom"
                          placeholderTextColor={colors.muted}
                          keyboardType="number-pad"
                          style={{ fontSize: 13, fontWeight: '600', color: mpCustomDuration ? '#6366F1' : colors.foreground, minWidth: 50, textAlign: 'center' }}
                          returnKeyType="done"
                        />
                        {mpCustomDuration ? <Text style={{ fontSize: 12, color: '#6366F1', marginLeft: 2 }}>min</Text> : null}
                      </View>
                    </View>
                  </View>
                )}

                {/* Three action buttons: Green / Yellow / Red */}
                <View style={{ gap: 10 }}>
                  {/* GREEN — Begin with default time */}
                  <Pressable
                    style={({ pressed }) => ({
                      backgroundColor: mpGenerating ? colors.border : '#16A34A',
                      borderRadius: 12, paddingVertical: 14, alignItems: 'center',
                      opacity: pressed ? 0.85 : 1,
                    })}
                    onPress={handleMpLaunch}
                    disabled={mpGenerating}
                  >
                    <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>
                      {mpGenerating ? 'Generating...' : `▶  Begin ${meta.label} · ${effectiveDuration} min`}
                    </Text>
                  </Pressable>

                  {/* YELLOW — Pick custom time */}
                  <Pressable
                    style={({ pressed }) => ({
                      backgroundColor: '#D97706' + '18',
                      borderWidth: 1.5, borderColor: '#D97706',
                      borderRadius: 12, paddingVertical: 12, alignItems: 'center',
                      opacity: pressed ? 0.8 : 1,
                    })}
                    onPress={() => setMpCustomPickerVisible(v => !v)}
                  >
                    <Text style={{ color: '#D97706', fontWeight: '700', fontSize: 14 }}>
                      ⏱  {mpCustomPickerVisible ? 'Hide time picker' : 'Pick a different time'}
                    </Text>
                  </Pressable>

                  {/* RED — Skip */}
                  <Pressable
                    style={({ pressed }) => ({
                      backgroundColor: '#DC2626' + '12',
                      borderWidth: 1.5, borderColor: '#DC2626',
                      borderRadius: 12, paddingVertical: 12, alignItems: 'center',
                      opacity: pressed ? 0.8 : 1,
                    })}
                    onPress={() => setMpDismissed(true)}
                  >
                    <Text style={{ color: '#DC2626', fontWeight: '700', fontSize: 14 }}>✕  Skip Morning Practice</Text>
                  </Pressable>
                </View>
              </View>
            );
          })()}

          {(!hasTeams || shared || isPreview) && (
            <Pressable
              style={({ pressed }) => [styles.successDoneBtn, { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 }]}
              onPress={() => { stopAfterAlarm(); router.back(); }}
            >
              <Text style={styles.successDoneBtnText}>{isPreview ? 'Close Preview' : shared ? 'Shared!' : 'Done'}</Text>
            </Pressable>
          )}
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer edges={["top", "left", "right"]} containerClassName={isCalm ? 'bg-[#0D1135]' : undefined}>

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
                          <Text style={[styles.habitName, { color: colors.foreground }]}>
                            {habit.name}
                          </Text>
                          {habit.description ? (
                            <Text style={[styles.habitDescription, { color: colors.muted }]} numberOfLines={2}>
                              {habit.description}
                            </Text>
                          ) : null}
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
                                  backgroundColor: isSelected ? col : col + '44',
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
              <Text style={[styles.vcStatusHint, { color: '#EF4444' }]}>Tap ■ to stop</Text>
            </View>
          </View>
        )}
        {vcStatus === 'transcribing' && (
          <View style={[styles.vcStatusBar, { backgroundColor: '#6366F110', borderColor: '#6366F130' }]}>
            <Text style={[styles.vcStatusText, { color: '#6366F1', flex: 1 }]}>● Transcribing…</Text>
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
  habitNameRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, flex: 1 },
  habitNumBadge: {
    width: 26, height: 26, borderRadius: 7, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  habitNumText: { fontSize: 12, fontWeight: '700' },
  habitName: { fontSize: 15, lineHeight: 20, fontWeight: '500' },
  habitDescription: { fontSize: 12, lineHeight: 17, marginTop: 2, opacity: 0.75 },
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
    width: 40,
    height: 38,
    borderRadius: 9,
  },
  segmentFirst: { borderTopLeftRadius: 9, borderBottomLeftRadius: 9 },
  segmentLast:  { borderTopRightRadius: 9, borderBottomRightRadius: 9 },
  segmentSmall: { width: 32, height: 28 },

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
