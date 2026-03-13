/**
 * VoiceJournalSection
 * ---------------------
 * Placed in the More tab. Lets the user record a voice journal entry.
 * On stop:
 *  1. Uploads audio to server → Whisper transcription → LLM categorization
 *  2. Auto-saves gratitude items → Gratitude tab
 *  3. Auto-saves journal thoughts → Journal tab
 *  4. Stores the recording locally so the user can replay past entries
 *
 * Recordings are persisted in AsyncStorage as a list of VoiceRecording objects.
 * The audio file is stored in FileSystem.documentDirectory for permanence.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import {
  createAudioPlayer,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
  RecordingPresets,
} from 'expo-audio';
import * as FileSystem from 'expo-file-system/legacy';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { IconSymbol } from '@/components/ui/icon-symbol';
import { useColors } from '@/hooks/use-colors';
import { trpc } from '@/lib/trpc';
import {
  addJournalEntry,
  addGratitudeEntry,
  toDateString,
} from '@/lib/storage';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface VoiceRecording {
  id: string;
  date: string;          // YYYY-MM-DD
  createdAt: string;     // ISO
  durationSeconds: number;
  localUri: string;      // permanent file:// path
  transcript: string;
  journalCount: number;  // how many journal entries were extracted
  gratitudeCount: number; // how many gratitude items were extracted
}

const RECORDINGS_KEY = 'daycheck:voiceRecordings';

async function loadRecordings(): Promise<VoiceRecording[]> {
  try {
    const raw = await AsyncStorage.getItem(RECORDINGS_KEY);
    return raw ? (JSON.parse(raw) as VoiceRecording[]) : [];
  } catch { return []; }
}

async function saveRecordings(list: VoiceRecording[]): Promise<void> {
  await AsyncStorage.setItem(RECORDINGS_KEY, JSON.stringify(list));
}

async function addRecording(rec: VoiceRecording): Promise<void> {
  const list = await loadRecordings();
  await saveRecordings([rec, ...list]);
}

async function deleteRecording(id: string): Promise<void> {
  const list = await loadRecordings();
  const rec = list.find(r => r.id === id);
  if (rec?.localUri) {
    try { await FileSystem.deleteAsync(rec.localUri, { idempotent: true }); } catch {}
  }
  await saveRecordings(list.filter(r => r.id !== id));
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function formatRelativeDate(isoString: string): string {
  const d = new Date(isoString);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// ─── RecordingRow ─────────────────────────────────────────────────────────────

function RecordingRow({
  rec,
  onDelete,
  colors,
}: {
  rec: VoiceRecording;
  onDelete: (id: string) => void;
  colors: ReturnType<typeof import('@/hooks/use-colors').useColors>;
}) {
  const [playing, setPlaying] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const playerRef = useRef<any>(null);

  function stopPlayback() {
    try { playerRef.current?.remove(); } catch {}
    playerRef.current = null;
    setPlaying(false);
  }

  useEffect(() => () => stopPlayback(), []);

  async function handlePlay() {
    if (playing) { stopPlayback(); return; }
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      await setAudioModeAsync({ playsInSilentMode: true }).catch(() => {});
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const player = createAudioPlayer({ uri: rec.localUri } as any);
      playerRef.current = player;
      setPlaying(true);
      player.play();
      // Auto-stop after duration + 1s buffer
      setTimeout(() => stopPlayback(), (rec.durationSeconds + 1) * 1000);
    } catch {
      Alert.alert('Playback error', 'Could not play this recording.');
      setPlaying(false);
    }
  }

  function handleDelete() {
    if (Platform.OS === 'web') {
      if (window.confirm('Delete this recording?')) onDelete(rec.id);
      return;
    }
    Alert.alert('Delete Recording', 'Remove this voice journal entry?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => onDelete(rec.id) },
    ]);
  }

  return (
    <View style={[rowStyles.container, { borderBottomColor: colors.border }]}>
      {/* Play/Stop button */}
      <Pressable
        onPress={handlePlay}
        style={({ pressed }) => [
          rowStyles.playBtn,
          { backgroundColor: playing ? colors.primary : colors.primary + '18', opacity: pressed ? 0.7 : 1 },
        ]}
      >
        <IconSymbol
          name={playing ? 'stop.fill' : 'play.fill'}
          size={16}
          color={playing ? '#fff' : colors.primary}
        />
      </Pressable>

      {/* Info */}
      <View style={{ flex: 1, marginLeft: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text style={[rowStyles.dateLabel, { color: colors.foreground }]}>
            {formatRelativeDate(rec.createdAt)}
          </Text>
          <Text style={[rowStyles.durationLabel, { color: colors.muted }]}>
            {formatDuration(rec.durationSeconds)}
          </Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 3 }}>
          {rec.journalCount > 0 && (
            <View style={[rowStyles.badge, { backgroundColor: '#7B74FF18' }]}>
              <Text style={[rowStyles.badgeText, { color: '#7B74FF' }]}>
                📝 {rec.journalCount} journal
              </Text>
            </View>
          )}
          {rec.gratitudeCount > 0 && (
            <View style={[rowStyles.badge, { backgroundColor: '#22C55E18' }]}>
              <Text style={[rowStyles.badgeText, { color: '#22C55E' }]}>
                🙏 {rec.gratitudeCount} gratitude
              </Text>
            </View>
          )}
          {rec.journalCount === 0 && rec.gratitudeCount === 0 && (
            <Text style={[rowStyles.badgeText, { color: colors.muted }]}>No entries extracted</Text>
          )}
        </View>
        {rec.transcript ? (
          <Text style={[rowStyles.transcript, { color: colors.muted }]} numberOfLines={2}>
            "{rec.transcript}"
          </Text>
        ) : null}
      </View>

      {/* Delete */}
      <Pressable
        onPress={handleDelete}
        style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1, padding: 8 })}
      >
        <IconSymbol name="trash.fill" size={16} color={colors.error ?? '#EF4444'} />
      </Pressable>
    </View>
  );
}

const rowStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  playBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateLabel: {
    fontSize: 14,
    fontWeight: '600',
  },
  durationLabel: {
    fontSize: 12,
    fontVariant: ['tabular-nums'],
  },
  badge: {
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  transcript: {
    fontSize: 12,
    marginTop: 4,
    lineHeight: 16,
    fontStyle: 'italic',
  },
});

// ─── Main Component ───────────────────────────────────────────────────────────

export function VoiceJournalSection() {
  const colors = useColors();
  const [recordings, setRecordings] = useState<VoiceRecording[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [processingStep, setProcessingStep] = useState('');
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(0);

  const transcribeMutation = trpc.voiceJournal.transcribeAndCategorize.useMutation();

  // Recorder
  const audioRecorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(audioRecorder);

  // Load saved recordings on mount
  useEffect(() => {
    loadRecordings().then(setRecordings);
  }, []);

  // Elapsed timer while recording
  useEffect(() => {
    if (recorderState.isRecording) {
      startTimeRef.current = Date.now();
      setElapsedSeconds(0);
      timerRef.current = setInterval(() => {
        setElapsedSeconds(Math.floor((Date.now() - startTimeRef.current) / 1000));
      }, 1000);
    } else {
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [recorderState.isRecording]);

  const handleStartRecording = useCallback(async () => {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const perm = await requestRecordingPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Microphone Access', 'Please allow microphone access in Settings to use Voice Journal.');
      return;
    }
    try {
      await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true });
      await audioRecorder.prepareToRecordAsync();
      audioRecorder.record();
    } catch (err) {
      console.error('[VoiceJournal] start error:', err);
      Alert.alert('Recording Error', 'Could not start recording. Please try again.');
    }
  }, [audioRecorder]);

  const handleStopAndProcess = useCallback(async () => {
    if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const durationSeconds = elapsedSeconds;

    try {
      await audioRecorder.stop();
      const uri = audioRecorder.uri;
      if (!uri) { Alert.alert('Error', 'Recording file not found.'); return; }

      setProcessing(true);
      setProcessingStep('Saving recording…');

      // Copy to permanent storage
      const destPath = `${FileSystem.documentDirectory}voice_journal_${Date.now()}.m4a`;
      let localUri = uri;
      if (Platform.OS !== 'web') {
        try {
          await FileSystem.copyAsync({ from: uri, to: destPath });
          localUri = destPath;
        } catch { /* keep original uri */ }
      }

      // Read as base64 for upload
      setProcessingStep('Transcribing…');
      let audioBase64 = '';
      if (Platform.OS !== 'web') {
        audioBase64 = await FileSystem.readAsStringAsync(localUri, {
          encoding: FileSystem.EncodingType.Base64,
        });
      } else {
        // Web: fetch the blob URL and convert
        const resp = await fetch(uri);
        const ab = await resp.arrayBuffer();
        const uint8 = new Uint8Array(ab);
        let binary = '';
        for (let i = 0; i < uint8.length; i++) binary += String.fromCharCode(uint8[i]);
        audioBase64 = btoa(binary);
      }

      setProcessingStep('Categorizing…');
      const today = toDateString(new Date());
      const result = await transcribeMutation.mutateAsync({
        audioBase64,
        mimeType: Platform.OS === 'web' ? 'audio/webm' : 'audio/m4a',
        date: today,
      });

      setProcessingStep('Saving entries…');

      // Save journal entries
      for (const text of result.journalEntries) {
        await addJournalEntry({
          id: `vj_${Date.now()}_${Math.random().toString(36).slice(2)}`,
          date: today,
          text,
          audioUri: localUri,
          createdAt: new Date().toISOString(),
        });
      }

      // Save gratitude items (group into one entry per recording)
      if (result.gratitudeItems.length > 0) {
        await addGratitudeEntry({
          id: `vg_${Date.now()}_${Math.random().toString(36).slice(2)}`,
          date: today,
          items: result.gratitudeItems,
          createdAt: new Date().toISOString(),
        });
      }

      // Save recording metadata
      const newRec: VoiceRecording = {
        id: `vrec_${Date.now()}`,
        date: today,
        createdAt: new Date().toISOString(),
        durationSeconds,
        localUri,
        transcript: result.transcript,
        journalCount: result.journalEntries.length,
        gratitudeCount: result.gratitudeItems.length,
      };
      await addRecording(newRec);
      setRecordings(prev => [newRec, ...prev]);

      // Summary alert
      const parts: string[] = [];
      if (result.journalEntries.length > 0) parts.push(`${result.journalEntries.length} journal entry${result.journalEntries.length > 1 ? 'ies' : ''}`);
      if (result.gratitudeItems.length > 0) parts.push(`${result.gratitudeItems.length} gratitude item${result.gratitudeItems.length > 1 ? 's' : ''}`);
      const summary = parts.length > 0
        ? `Added ${parts.join(' and ')} to your Vision tab.`
        : 'Recording saved. No gratitude or journal entries were detected.';
      Alert.alert('Voice Journal Saved', summary);

    } catch (err) {
      console.error('[VoiceJournal] process error:', err);
      Alert.alert('Processing Error', 'Could not transcribe recording. Please check your connection and try again.');
    } finally {
      setProcessing(false);
      setProcessingStep('');
    }
  }, [audioRecorder, elapsedSeconds, transcribeMutation]);

  const handleDeleteRecording = useCallback(async (id: string) => {
    await deleteRecording(id);
    setRecordings(prev => prev.filter(r => r.id !== id));
  }, []);

  const isRecording = recorderState.isRecording;

  return (
    <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      {/* Header */}
      <Pressable
        onPress={() => {
          if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          setExpanded(v => !v);
        }}
        style={({ pressed }) => [styles.header, { opacity: pressed ? 0.7 : 1 }]}
      >
        <View style={[styles.iconWrap, { backgroundColor: '#FF6B6B18' }]}>
          <IconSymbol name="mic.fill" size={18} color="#FF6B6B" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: colors.foreground }]}>Voice Journal</Text>
          <Text style={[styles.subtitle, { color: colors.muted }]}>
            {recordings.length > 0
              ? `${recordings.length} recording${recordings.length > 1 ? 's' : ''} · auto-saves to Journal & Gratitude`
              : 'Speak your thoughts — auto-saves to Journal & Gratitude'}
          </Text>
        </View>
        <IconSymbol name={expanded ? 'chevron.up' : 'chevron.down'} size={14} color={colors.muted} />
      </Pressable>

      {expanded && (
        <View style={[styles.body, { borderTopColor: colors.border }]}>
          {/* Record button area */}
          <View style={styles.recordArea}>
            {processing ? (
              <View style={styles.processingRow}>
                <ActivityIndicator size="small" color="#FF6B6B" />
                <Text style={[styles.processingText, { color: colors.muted }]}>{processingStep}</Text>
              </View>
            ) : (
              <>
                <Pressable
                  onPress={isRecording ? handleStopAndProcess : handleStartRecording}
                  style={({ pressed }) => [
                    styles.recordBtn,
                    {
                      backgroundColor: isRecording ? '#EF4444' : '#FF6B6B',
                      transform: [{ scale: pressed ? 0.94 : 1 }],
                    },
                  ]}
                >
                  <IconSymbol
                    name={isRecording ? 'stop.fill' : 'mic.fill'}
                    size={28}
                    color="#fff"
                  />
                </Pressable>
                {isRecording ? (
                  <View style={styles.recordingIndicator}>
                    <View style={[styles.recordingDot, { backgroundColor: '#EF4444' }]} />
                    <Text style={[styles.recordingLabel, { color: '#EF4444' }]}>
                      Recording {formatDuration(elapsedSeconds)}
                    </Text>
                  </View>
                ) : (
                  <Text style={[styles.recordHint, { color: colors.muted }]}>
                    Tap to start recording
                  </Text>
                )}
                {isRecording && (
                  <Text style={[styles.stopHint, { color: colors.muted }]}>
                    Tap again to stop &amp; save
                  </Text>
                )}
              </>
            )}
          </View>

          {/* Recordings list */}
          {recordings.length > 0 && (
            <View style={[styles.listContainer, { borderTopColor: colors.border }]}>
              <Text style={[styles.listHeader, { color: colors.muted }]}>PAST RECORDINGS</Text>
              <FlatList
                data={recordings}
                keyExtractor={r => r.id}
                scrollEnabled={false}
                renderItem={({ item }) => (
                  <RecordingRow
                    rec={item}
                    onDelete={handleDeleteRecording}
                    colors={colors}
                  />
                )}
              />
            </View>
          )}

          {recordings.length === 0 && !processing && !isRecording && (
            <View style={styles.emptyState}>
              <Text style={[styles.emptyText, { color: colors.muted }]}>
                Your recordings will appear here after you save them.
              </Text>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
    marginBottom: 12,
    marginTop: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 10,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
  },
  subtitle: {
    fontSize: 12,
    marginTop: 1,
  },
  body: {
    borderTopWidth: 1,
  },
  recordArea: {
    alignItems: 'center',
    paddingVertical: 24,
    gap: 12,
  },
  recordBtn: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#FF6B6B',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  recordingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  recordingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  recordingLabel: {
    fontSize: 15,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  recordHint: {
    fontSize: 13,
    marginTop: 4,
  },
  stopHint: {
    fontSize: 12,
    marginTop: -4,
  },
  processingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 20,
  },
  processingText: {
    fontSize: 14,
    fontWeight: '500',
  },
  listContainer: {
    borderTopWidth: 1,
  },
  listHeader: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 4,
  },
  emptyState: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
  },
});
