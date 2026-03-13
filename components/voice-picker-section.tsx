/**
 * VoicePickerSection
 * Global voice selection component for the More tab.
 * Shows only "professional" category voices from the user's ElevenLabs account
 * (i.e. voices they have personally saved — not the default premade library).
 *
 * On voice selection:
 *  1. Saves the voice ID globally (AsyncStorage)
 *  2. Triggers habit pre-recording in the background
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import * as FileSystem from 'expo-file-system/legacy';

import { IconSymbol } from '@/components/ui/icon-symbol';
import { useColors } from '@/hooks/use-colors';
import { trpc } from '@/lib/trpc';
import {
  clearHabitAudioCache,
  getGlobalVoiceId,
  getHabitReadAloud,
  setGlobalVoiceId,
  setHabitReadAloud,
  syncHabitAudio,
} from '@/lib/voice-settings';
import { loadHabits } from '@/lib/storage';

type VoiceEntry = { voice_id: string; name: string; category: string; preview_url?: string };

export function VoicePickerSection() {
  const colors = useColors();

  // ── State ──────────────────────────────────────────────────────────────────
  const [selectedVoiceId, setSelectedVoiceId] = useState<string | null>(null);
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [previewLoading, setPreviewLoading] = useState<string | null>(null);
  const [readAloud, setReadAloud] = useState(true);
  const [syncProgress, setSyncProgress] = useState<{ done: number; total: number } | null>(null);

  // ── tRPC ───────────────────────────────────────────────────────────────────
  const voicesQuery = trpc.voice.listVoices.useQuery();
  const apiKeyQuery = trpc.voice.getApiKey.useQuery();

  // Filter to professional (saved) voices only
  const voices: VoiceEntry[] = (voicesQuery.data ?? []).filter(
    (v) => v.category === 'professional'
  );

  // ── Audio preview refs ─────────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const previewPlayerRef = useRef<any>(null);
  const previewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function stopPreview() {
    if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
    try { previewPlayerRef.current?.remove(); } catch {}
    previewPlayerRef.current = null;
  }

  useEffect(() => () => stopPreview(), []);

  // ── Load persisted voice on mount ─────────────────────────────────────────
  useEffect(() => {
    getGlobalVoiceId().then((id) => { if (id) setSelectedVoiceId(id); });
    getHabitReadAloud().then(setReadAloud);
  }, []);

  // ── Handle voice selection ─────────────────────────────────────────────────
  const handleSelectVoice = useCallback(
    async (voiceId: string) => {
      if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      setSelectedVoiceId(voiceId);
      await setGlobalVoiceId(voiceId);
      setVoiceOpen(false);

      // Trigger background pre-recording of all habits
      const apiKey = apiKeyQuery.data?.apiKey;
      if (!apiKey) return;

      try {
        // Clear old cache since voice changed
        await clearHabitAudioCache();
        const habits = await loadHabits();
        const activeHabits = habits.filter((h) => h.isActive).map((h) => ({ id: h.id, name: h.name }));

        setSyncProgress({ done: 0, total: activeHabits.length });
        await syncHabitAudio(activeHabits, voiceId, apiKey, (done, total) => {
          setSyncProgress({ done, total });
        });
        setSyncProgress(null);
      } catch (err) {
        console.error('[VoicePickerSection] sync error:', err);
        setSyncProgress(null);
      }
    },
    [apiKeyQuery.data?.apiKey]
  );

  // ── Handle read-aloud toggle ───────────────────────────────────────────────
  async function handleToggleReadAloud(val: boolean) {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setReadAloud(val);
    await setHabitReadAloud(val);
  }

  // ── Preview a voice using the built-in ElevenLabs preview_url (CDN MP3) ────
  async function handlePreview(voice: VoiceEntry) {
    if (previewLoading) return;
    const previewUrl = voice.preview_url;
    if (!previewUrl) {
      Alert.alert('No preview', 'This voice does not have a preview available.');
      return;
    }
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setPreviewLoading(voice.voice_id);
    try {
      stopPreview();
      await setAudioModeAsync({ playsInSilentMode: true }).catch(() => {});

      let audioUri: string;

      if (Platform.OS === 'web') {
        // Web: play directly from URL
        audioUri = previewUrl;
      } else {
        // Native: download CDN MP3 to cache, play from local file
        const tempPath = `${FileSystem.cacheDirectory}voice_preview_${voice.voice_id}.mp3`;
        // Check if already cached
        const info = await FileSystem.getInfoAsync(tempPath);
        if (!info.exists) {
          const dlResp = await fetch(previewUrl);
          if (!dlResp.ok) throw new Error(`Download error ${dlResp.status}`);
          const arrayBuffer = await dlResp.arrayBuffer();
          const uint8 = new Uint8Array(arrayBuffer);
          let binary = '';
          for (let i = 0; i < uint8.length; i++) binary += String.fromCharCode(uint8[i]);
          const base64 = btoa(binary);
          await FileSystem.writeAsStringAsync(tempPath, base64, {
            encoding: FileSystem.EncodingType.Base64,
          });
        }
        audioUri = tempPath;
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const player = createAudioPlayer({ uri: audioUri } as any);
      previewPlayerRef.current = player;
      player.play();
      previewTimerRef.current = setTimeout(() => stopPreview(), 20000);
    } catch (err) {
      console.error('[VoicePickerSection] preview error:', err);
      Alert.alert('Preview failed', 'Could not load voice preview. Check your connection.');
    } finally {
      setPreviewLoading(null);
    }
  }

  // ── Re-record all habits manually ─────────────────────────────────────────
  async function handleReRecord() {
    const apiKey = apiKeyQuery.data?.apiKey;
    if (!apiKey || !selectedVoiceId) {
      Alert.alert('No voice selected', 'Please select a voice first.');
      return;
    }
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      await clearHabitAudioCache();
      const habits = await loadHabits();
      const activeHabits = habits.filter((h) => h.isActive).map((h) => ({ id: h.id, name: h.name }));
      setSyncProgress({ done: 0, total: activeHabits.length });
      await syncHabitAudio(activeHabits, selectedVoiceId, apiKey, (done, total) => {
        setSyncProgress({ done, total });
      });
      setSyncProgress(null);
      Alert.alert('Done', 'All habits have been pre-recorded.');
    } catch {
      setSyncProgress(null);
      Alert.alert('Error', 'Failed to pre-record habits. Please try again.');
    }
  }

  const selectedVoiceName = voices.find((v) => v.voice_id === selectedVoiceId)?.name ?? 'None selected';

  return (
    <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      {/* Section Header */}
      <View style={styles.sectionHeader}>
        <View style={[styles.iconWrap, { backgroundColor: colors.primary + '22' }]}>
          <IconSymbol name="waveform" size={18} color={colors.primary} />
        </View>
        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Voice</Text>
      </View>

      {/* Voice Selector Row */}
      <Pressable
        onPress={() => {
          if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          setVoiceOpen((v) => !v);
        }}
        style={({ pressed }) => [
          styles.row,
          { borderTopColor: colors.border, opacity: pressed ? 0.7 : 1 },
        ]}
      >
        <IconSymbol name="person.fill" size={16} color={colors.muted} />
        <View style={{ flex: 1, marginLeft: 10 }}>
          <Text style={[styles.rowLabel, { color: colors.muted }]}>Jack Voice</Text>
          <Text style={[styles.rowValue, { color: colors.foreground }]}>{selectedVoiceName}</Text>
        </View>
        <IconSymbol name={voiceOpen ? 'chevron.up' : 'chevron.down'} size={14} color={colors.muted} />
      </Pressable>

      {/* Voice List */}
      {voiceOpen && (
        <View style={[styles.voiceList, { borderTopColor: colors.border }]}>
          {voicesQuery.isLoading && (
            <View style={styles.loadingRow}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={[styles.loadingText, { color: colors.muted }]}>Loading voices…</Text>
            </View>
          )}
          {voices.map((voice) => {
            const isSelected = selectedVoiceId === voice.voice_id;
            const isPreviewing = previewLoading === voice.voice_id;
            return (
              <Pressable
                key={voice.voice_id}
                onPress={() => handleSelectVoice(voice.voice_id)}
                style={({ pressed }) => [
                  styles.voiceItem,
                  isSelected && { backgroundColor: colors.primary + '18' },
                  { opacity: pressed ? 0.7 : 1, borderBottomColor: colors.border },
                ]}
              >
                <Text style={styles.voiceEmoji}>🎙️</Text>
                <Text style={[styles.voiceName, { color: isSelected ? colors.primary : colors.foreground }]}>
                  {voice.name}
                </Text>
                {/* Preview button */}
                <Pressable
                  onPress={() => handlePreview(voice)}
                  style={({ pressed }) => [
                    styles.previewBtn,
                    { borderColor: colors.border, opacity: pressed ? 0.6 : 1 },
                  ]}
                >
                  {isPreviewing
                    ? <ActivityIndicator size="small" color={colors.primary} />
                    : <Text style={[styles.previewBtnText, { color: colors.primary }]}>Preview</Text>
                  }
                </Pressable>
                {isSelected && (
                  <IconSymbol name="checkmark" size={14} color={colors.primary} style={{ marginLeft: 6 }} />
                )}
              </Pressable>
            );
          })}
        </View>
      )}

      {/* Sync progress */}
      {syncProgress !== null && (
        <View style={[styles.syncRow, { borderTopColor: colors.border }]}>
          <ActivityIndicator size="small" color={colors.primary} />
          <Text style={[styles.syncText, { color: colors.muted }]}>
            Pre-recording habits… {syncProgress.done}/{syncProgress.total}
          </Text>
        </View>
      )}

      {/* Read Aloud Toggle */}
      <Pressable
        onPress={() => handleToggleReadAloud(!readAloud)}
        style={({ pressed }) => [
          styles.row,
          { borderTopColor: colors.border, opacity: pressed ? 0.7 : 1 },
        ]}
      >
        <IconSymbol name="speaker.wave.2.fill" size={16} color={colors.muted} />
        <View style={{ flex: 1, marginLeft: 10 }}>
          <Text style={[styles.rowLabel, { color: colors.muted }]}>Read Habits Aloud</Text>
          <Text style={[styles.rowValue, { color: colors.foreground }]}>
            {readAloud ? 'On — plays habit name as it appears' : 'Off'}
          </Text>
        </View>
        <View
          style={[
            styles.toggle,
            { backgroundColor: readAloud ? colors.primary : colors.border },
          ]}
        >
          <View style={[styles.toggleThumb, { left: readAloud ? 18 : 2 }]} />
        </View>
      </Pressable>

      {/* Re-record button */}
      {selectedVoiceId && syncProgress === null && (
        <Pressable
          onPress={handleReRecord}
          style={({ pressed }) => [
            styles.row,
            { borderTopColor: colors.border, opacity: pressed ? 0.7 : 1 },
          ]}
        >
          <IconSymbol name="arrow.right.circle.fill" size={16} color={colors.muted} />
          <View style={{ flex: 1, marginLeft: 10 }}>
            <Text style={[styles.rowLabel, { color: colors.muted }]}>Re-record All Habits</Text>
            <Text style={[styles.rowValue, { color: colors.foreground }]}>
              Regenerate audio for all active habits
            </Text>
          </View>
          <IconSymbol name="chevron.right" size={14} color={colors.muted} />
        </Pressable>
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
  sectionHeader: {
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
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    flex: 1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
  },
  rowLabel: {
    fontSize: 12,
    fontWeight: '500',
    marginBottom: 2,
  },
  rowValue: {
    fontSize: 14,
    fontWeight: '600',
  },
  voiceList: {
    borderTopWidth: 1,
  },
  voiceItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  voiceEmoji: {
    fontSize: 18,
    marginRight: 10,
  },
  voiceName: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
  },
  previewBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    minWidth: 64,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewBtnText: {
    fontSize: 12,
    fontWeight: '600',
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 10,
  },
  loadingText: {
    fontSize: 13,
  },
  syncRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderTopWidth: 1,
    gap: 10,
  },
  syncText: {
    fontSize: 13,
  },
  toggle: {
    width: 40,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
  },
  toggleThumb: {
    position: 'absolute',
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#fff',
    top: 2,
  },
});
