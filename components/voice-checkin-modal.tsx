/**
 * VoiceCheckInModal
 *
 * A modal that lets the user speak about their habits for the day.
 * As they talk, the AI transcribes the audio and automatically fills in
 * ratings (green/yellow/red) and notes for each habit.
 * The user can review and adjust before saving.
 */
import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  Platform,
  ActivityIndicator,
  TextInput,
} from 'react-native';
import { useAudioRecorder, useAudioRecorderState, RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync } from 'expo-audio';
import * as FileSystem from 'expo-file-system/legacy';
import * as Haptics from 'expo-haptics';
import { useColors } from '@/hooks/use-colors';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { trpc } from '@/lib/trpc';
import type { Habit, Rating } from '@/lib/storage';

// ── Types ────────────────────────────────────────────────────────────────────

type HabitResult = {
  habitId: string;
  habitName: string;
  rating: Rating;
  note: string;
};

type Phase = 'idle' | 'recording' | 'processing' | 'review' | 'saving';

// ── Rating Pill ──────────────────────────────────────────────────────────────

const RATING_COLORS: Record<string, string> = {
  green: '#22C55E',
  yellow: '#F59E0B',
  red: '#EF4444',
  none: '#334155',
};

const RATING_LABELS: Record<string, string> = {
  green: 'Crushed it',
  yellow: 'Okay',
  red: 'Missed',
  none: 'Not mentioned',
};

function RatingPill({
  rating,
  onSelect,
  colors,
}: {
  rating: Rating;
  onSelect: (r: Rating) => void;
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <View style={styles.ratingRow}>
      {(['green', 'yellow', 'red'] as Rating[]).map((r) => {
        const active = rating === r;
        const col = RATING_COLORS[r];
        return (
          <Pressable
            key={r}
            onPress={() => {
              if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              onSelect(r);
            }}
            style={[
              styles.ratingPill,
              {
                backgroundColor: active ? col + '28' : colors.surface,
                borderColor: active ? col : colors.border,
              },
            ]}
          >
            <Text style={[styles.ratingPillText, { color: active ? col : colors.muted }]}>
              {RATING_LABELS[r]}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export function VoiceCheckInModal({
  visible,
  habits,
  date,
  onClose,
  onSave,
}: {
  visible: boolean;
  habits: Habit[];
  date: string;
  onClose: () => void;
  onSave: (results: HabitResult[], notes: Record<string, string>) => Promise<void>;
}) {
  const colors = useColors();
  const [phase, setPhase] = useState<Phase>('idle');
  const [transcript, setTranscript] = useState('');
  const [results, setResults] = useState<HabitResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [permissionGranted, setPermissionGranted] = useState(false);

  const audioRecorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(audioRecorder);

  const transcribeMutation = trpc.voiceJournal.transcribeAndCategorize.useMutation();

  // Request mic permission on mount
  useEffect(() => {
    if (!visible) return;
    (async () => {
      const status = await requestRecordingPermissionsAsync();
      setPermissionGranted(status.granted);
      if (status.granted && Platform.OS !== 'web') {
        await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true });
      }
    })();
  }, [visible]);

  // Reset state when modal opens
  useEffect(() => {
    if (visible) {
      setPhase('idle');
      setTranscript('');
      setResults([]);
      setError(null);
    }
  }, [visible]);

  const handleStartRecording = useCallback(async () => {
    if (!permissionGranted) {
      setError('Microphone permission is required. Please allow access in Settings.');
      return;
    }
    try {
      if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      setError(null);
      await audioRecorder.prepareToRecordAsync();
      audioRecorder.record();
      setPhase('recording');
    } catch (e: any) {
      setError('Could not start recording: ' + (e?.message ?? 'Unknown error'));
    }
  }, [permissionGranted, audioRecorder]);

  const handleStopAndProcess = useCallback(async () => {
    if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setPhase('processing');
    try {
      await audioRecorder.stop();
      const uri = audioRecorder.uri;
      if (!uri) throw new Error('No recording found');

      // Read audio as base64
      let audioBase64: string;
      let mimeType: string;

      if (Platform.OS === 'web') {
        // Web: fetch the blob URL and convert to base64
        const resp = await fetch(uri);
        const blob = await resp.blob();
        mimeType = blob.type || 'audio/webm';
        audioBase64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => {
            const result = reader.result as string;
            resolve(result.split(',')[1] ?? '');
          };
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
      } else {
        // Native: read file as base64
        audioBase64 = await FileSystem.readAsStringAsync(uri, {
          encoding: FileSystem.EncodingType.Base64,
        });
        mimeType = 'audio/m4a';
      }

      // Send to server for transcription + AI categorization
      const habitPayload = habits.map((h) => ({
        id: h.id,
        name: h.name,
        emoji: h.emoji,
        description: h.description,
      }));

      const result = await transcribeMutation.mutateAsync({
        audioBase64,
        mimeType,
        date,
        habits: habitPayload,
      });

      setTranscript(result.transcript || '');

      // Build per-habit results from AI response
      const aiRatings = result.habitRatings ?? {};
      const aiNotes = result.habitNotes ?? {};

      const habitResults: HabitResult[] = habits.map((h) => ({
        habitId: h.id,
        habitName: h.name,
        rating: (aiRatings[h.id] as Rating) || 'none',
        note: aiNotes[h.id] || '',
      }));

      setResults(habitResults);
      setPhase('review');
    } catch (e: any) {
      console.error('[VoiceCheckIn] Error:', e);
      setError(e?.message ?? 'Processing failed. Please try again.');
      setPhase('idle');
    }
  }, [audioRecorder, habits, date, transcribeMutation]);

  const handleUpdateRating = useCallback((habitId: string, rating: Rating) => {
    setResults((prev) => prev.map((r) => r.habitId === habitId ? { ...r, rating } : r));
  }, []);

  const handleUpdateNote = useCallback((habitId: string, note: string) => {
    setResults((prev) => prev.map((r) => r.habitId === habitId ? { ...r, note } : r));
  }, []);

  const handleSave = useCallback(async () => {
    if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setPhase('saving');
    try {
      // Build ratings map (skip 'none')
      const notesMap: Record<string, string> = {};
      for (const r of results) {
        if (r.note.trim()) notesMap[r.habitId] = r.note.trim();
      }
      await onSave(results, notesMap);
      onClose();
    } catch (e: any) {
      setError(e?.message ?? 'Save failed');
      setPhase('review');
    }
  }, [results, onSave, onClose]);

  const handleClose = useCallback(() => {
    if (phase === 'recording') {
      audioRecorder.stop().catch(() => {});
    }
    onClose();
  }, [phase, audioRecorder, onClose]);

  // ── Render ─────────────────────────────────────────────────────────────────

  const isRecording = recorderState.isRecording;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleClose}
    >
      <Pressable style={styles.overlay} onPress={phase === 'idle' ? handleClose : undefined}>
        <View
          style={[styles.sheet, { backgroundColor: colors.surface, borderColor: colors.border }]}
        >
          {/* Handle */}
          <View style={[styles.handle, { backgroundColor: colors.border }]} />

          {/* Header */}
          <View style={styles.headerRow}>
            <View style={styles.headerLeft}>
              <View style={[styles.micCircle, { backgroundColor: colors.primary + '18', borderColor: colors.primary + '44' }]}>
                <IconSymbol name="mic.fill" size={20} color={colors.primary} />
              </View>
              <View>
                <Text style={[styles.headerTitle, { color: colors.foreground }]}>Voice Check-in</Text>
                <Text style={[styles.headerSub, { color: colors.muted }]}>
                  Talk about your habits — AI fills the rest
                </Text>
              </View>
            </View>
            <Pressable
              onPress={handleClose}
              style={({ pressed }) => [styles.closeBtn, { opacity: pressed ? 0.6 : 1 }]}
            >
              <IconSymbol name="xmark" size={18} color={colors.muted} />
            </Pressable>
          </View>

          {/* ── IDLE / RECORDING ── */}
          {(phase === 'idle' || phase === 'recording') && (
            <View style={styles.recordSection}>
              <Text style={[styles.recordHint, { color: colors.muted }]}>
                {phase === 'idle'
                  ? 'Tap the mic and speak naturally about what you did today. Mention each habit by name.'
                  : 'Listening… speak about your habits for today.'}
              </Text>

              {/* Animated mic button */}
              <Pressable
                onPress={phase === 'idle' ? handleStartRecording : handleStopAndProcess}
                style={({ pressed }) => [
                  styles.bigMicBtn,
                  {
                    backgroundColor: phase === 'recording' ? '#EF4444' : colors.primary,
                    transform: [{ scale: pressed ? 0.94 : 1 }],
                  },
                ]}
              >
                <IconSymbol
                  name={phase === 'recording' ? 'stop.fill' : 'mic.fill'}
                  size={36}
                  color="#fff"
                />
              </Pressable>

              <Text style={[styles.recordBtnLabel, { color: colors.muted }]}>
                {phase === 'idle' ? 'Tap to start' : 'Tap to stop & analyze'}
              </Text>

              {error && (
                <Text style={styles.errorText}>{error}</Text>
              )}
            </View>
          )}

          {/* ── PROCESSING ── */}
          {phase === 'processing' && (
            <View style={styles.processingSection}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={[styles.processingText, { color: colors.foreground }]}>
                Analyzing your habits…
              </Text>
              <Text style={[styles.processingSubText, { color: colors.muted }]}>
                Transcribing audio and matching to your habits
              </Text>
            </View>
          )}

          {/* ── REVIEW ── */}
          {(phase === 'review' || phase === 'saving') && (
            <>
              {/* Transcript preview */}
              {transcript.length > 0 && (
                <View style={[styles.transcriptBox, { backgroundColor: colors.background, borderColor: colors.border }]}>
                  <Text style={[styles.transcriptLabel, { color: colors.muted }]}>What you said</Text>
                  <Text style={[styles.transcriptText, { color: colors.foreground }]} numberOfLines={3}>
                    {transcript}
                  </Text>
                </View>
              )}

              <Text style={[styles.reviewHint, { color: colors.muted }]}>
                Review and adjust ratings below, then save.
              </Text>

              <ScrollView
                style={styles.resultsList}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
              >
                {results.map((r, idx) => (
                  <View
                    key={r.habitId}
                    style={[
                      styles.habitResultCard,
                      {
                        backgroundColor: colors.background,
                        borderColor: r.rating !== 'none' ? RATING_COLORS[r.rating] + '44' : colors.border,
                        borderLeftColor: r.rating !== 'none' ? RATING_COLORS[r.rating] : colors.border,
                      },
                    ]}
                  >
                    <View style={styles.habitResultHeader}>
                      <Text style={[styles.habitResultName, { color: colors.foreground }]} numberOfLines={1}>
                        {r.habitName}
                      </Text>
                      {r.rating !== 'none' && (
                        <View style={[styles.ratingBadge, { backgroundColor: RATING_COLORS[r.rating] + '22', borderColor: RATING_COLORS[r.rating] + '55' }]}>
                          <Text style={[styles.ratingBadgeText, { color: RATING_COLORS[r.rating] }]}>
                            {RATING_LABELS[r.rating]}
                          </Text>
                        </View>
                      )}
                    </View>

                    <RatingPill
                      rating={r.rating}
                      onSelect={(rating) => handleUpdateRating(r.habitId, rating)}
                      colors={colors}
                    />

                    {/* Note field */}
                    <TextInput
                      value={r.note}
                      onChangeText={(text) => handleUpdateNote(r.habitId, text)}
                      placeholder="Add a note (optional)"
                      placeholderTextColor={colors.muted}
                      style={[
                        styles.noteInput,
                        { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.surface },
                      ]}
                      multiline
                      returnKeyType="done"
                    />
                  </View>
                ))}
                <View style={{ height: 16 }} />
              </ScrollView>

              {error && (
                <Text style={styles.errorText}>{error}</Text>
              )}

              {/* Save button */}
              <Pressable
                onPress={handleSave}
                disabled={phase === 'saving'}
                style={({ pressed }) => [
                  styles.saveBtn,
                  {
                    backgroundColor: colors.primary,
                    opacity: phase === 'saving' ? 0.7 : pressed ? 0.85 : 1,
                    transform: [{ scale: pressed ? 0.98 : 1 }],
                  },
                ]}
              >
                {phase === 'saving' ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.saveBtnText}>Save Check-in</Text>
                )}
              </Pressable>

              {/* Re-record */}
              <Pressable
                onPress={() => { setPhase('idle'); setError(null); }}
                style={({ pressed }) => [styles.rerecordBtn, { opacity: pressed ? 0.6 : 1 }]}
              >
                <IconSymbol name="arrow.counterclockwise" size={14} color={colors.muted} />
                <Text style={[styles.rerecordText, { color: colors.muted }]}>Record again</Text>
              </Pressable>
            </>
          )}
        </View>
      </Pressable>
    </Modal>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderWidth: 1,
    borderBottomWidth: 0,
    paddingHorizontal: 20,
    paddingBottom: 40,
    paddingTop: 12,
    maxHeight: '90%',
  },
  handle: {
    width: 36, height: 4, borderRadius: 2,
    alignSelf: 'center', marginBottom: 16,
  },

  // Header
  headerRow: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', marginBottom: 20,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  micCircle: {
    width: 44, height: 44, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center', borderWidth: 1,
  },
  headerTitle: { fontSize: 17, fontWeight: '800' },
  headerSub: { fontSize: 12, marginTop: 1 },
  closeBtn: { padding: 6 },

  // Record section
  recordSection: { alignItems: 'center', paddingVertical: 16, gap: 16 },
  recordHint: { fontSize: 14, textAlign: 'center', lineHeight: 20, paddingHorizontal: 8 },
  bigMicBtn: {
    width: 88, height: 88, borderRadius: 44,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25, shadowRadius: 8, elevation: 8,
  },
  recordBtnLabel: { fontSize: 13, fontWeight: '500' },

  // Processing
  processingSection: { alignItems: 'center', paddingVertical: 40, gap: 14 },
  processingText: { fontSize: 17, fontWeight: '700' },
  processingSubText: { fontSize: 13, textAlign: 'center' },

  // Review
  transcriptBox: {
    borderRadius: 12, borderWidth: 1, padding: 12, marginBottom: 12,
  },
  transcriptLabel: { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
  transcriptText: { fontSize: 13, lineHeight: 18 },
  reviewHint: { fontSize: 12, marginBottom: 10 },
  resultsList: { maxHeight: 380 },

  // Habit result card
  habitResultCard: {
    borderRadius: 14, borderWidth: 1, borderLeftWidth: 3,
    padding: 14, marginBottom: 10, gap: 10,
  },
  habitResultHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  habitResultName: { fontSize: 14, fontWeight: '700', flex: 1 },
  ratingBadge: {
    borderRadius: 8, borderWidth: 1,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  ratingBadgeText: { fontSize: 11, fontWeight: '700' },

  // Rating pills
  ratingRow: { flexDirection: 'row', gap: 6 },
  ratingPill: {
    flex: 1, borderRadius: 8, borderWidth: 1,
    paddingVertical: 7, alignItems: 'center',
  },
  ratingPillText: { fontSize: 11, fontWeight: '700' },

  // Note input
  noteInput: {
    borderRadius: 10, borderWidth: 1,
    paddingHorizontal: 12, paddingVertical: 8,
    fontSize: 13, minHeight: 40, lineHeight: 18,
  },

  // Save
  saveBtn: {
    borderRadius: 16, padding: 16, alignItems: 'center',
    marginTop: 12, marginBottom: 8,
  },
  saveBtnText: { fontSize: 16, fontWeight: '800', color: '#fff' },

  // Re-record
  rerecordBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, padding: 8,
  },
  rerecordText: { fontSize: 13, fontWeight: '500' },

  // Error
  errorText: { fontSize: 13, color: '#EF4444', textAlign: 'center', marginTop: 4 },
});
