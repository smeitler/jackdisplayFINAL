/**
 * VoicePickerSection
 * Lets the user pick one of 4 voices for the app.
 * - Only 4 hardcoded voices: Christopher, Michael, Rachael, Jessa
 * - Voice can only be changed once per month
 * - Confirmation modal before committing the change
 * - Read Aloud toggle has been moved to Alarm Settings
 */
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { IconSymbol } from '@/components/ui/icon-symbol';
import { useColors } from '@/hooks/use-colors';
import {
  clearHabitAudioCache,
  getGlobalVoiceId,
  setGlobalVoiceId,
  syncHabitAudio,
} from '@/lib/voice-settings';
import { loadHabits } from '@/lib/storage';
import { trpc } from '@/lib/trpc';

// ─── Constants ────────────────────────────────────────────────────────────────

const VOICE_LAST_CHANGED_KEY = '@voice_last_changed_v1';

const VOICES: { id: string; name: string; description: string }[] = [
  { id: 'christopher', name: 'Christopher', description: 'Clear, confident male voice' },
  { id: 'michael',     name: 'Michael',     description: 'Warm, authoritative male voice' },
  { id: 'rachael',     name: 'Rachael',     description: 'Bright, expressive female voice' },
  { id: 'jessa',       name: 'Jessa',       description: 'Calm, soothing female voice' },
];

// ElevenLabs voice IDs mapped to our names
const ELEVENLABS_IDS: Record<string, string> = {
  christopher: 'IKne3meq5aSn9XLyUdCD',
  michael:     'flq6f7yk4E4fJM5XTYuZ',
  rachael:     '21m00Tcm4TlvDq8ikWAM',
  jessa:       'cgSgspJ2msm6clMCkdW9',
};

// ─── Component ────────────────────────────────────────────────────────────────

export function VoicePickerSection() {
  const colors = useColors();
  const apiKeyQuery = trpc.voice.getApiKey.useQuery();

  const [selectedVoiceId, setSelectedVoiceId] = useState<string | null>(null);
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [pendingVoice, setPendingVoice] = useState<typeof VOICES[0] | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [lastChangedDate, setLastChangedDate] = useState<Date | null>(null);
  const [syncProgress, setSyncProgress] = useState<{ done: number; total: number } | null>(null);

  // Load persisted voice + last changed date on mount
  useEffect(() => {
    getGlobalVoiceId().then((id) => { if (id) setSelectedVoiceId(id); });
    AsyncStorage.getItem(VOICE_LAST_CHANGED_KEY).then((val) => {
      if (val) setLastChangedDate(new Date(val));
    });
  }, []);

  // Check if user is allowed to change voice this month
  function canChangeVoice(): boolean {
    if (!lastChangedDate) return true;
    const now = new Date();
    return (
      now.getFullYear() !== lastChangedDate.getFullYear() ||
      now.getMonth() !== lastChangedDate.getMonth()
    );
  }

  function getDaysUntilNextChange(): number {
    if (!lastChangedDate) return 0;
    const now = new Date();
    const firstOfNextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    return Math.ceil((firstOfNextMonth.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  }

  function handleTapVoice(voice: typeof VOICES[0]) {
    if (voice.id === selectedVoiceId) return;
    if (!canChangeVoice()) {
      const days = getDaysUntilNextChange();
      Alert.alert(
        'Monthly Limit',
        `You can only change your voice once per month. You can change it again in ${days} day${days !== 1 ? 's' : ''}.`
      );
      return;
    }
    setPendingVoice(voice);
    setShowConfirm(true);
  }

  async function handleConfirmChange() {
    if (!pendingVoice) return;
    setShowConfirm(false);
    if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    const elevenLabsId = ELEVENLABS_IDS[pendingVoice.id] ?? pendingVoice.id;
    setSelectedVoiceId(pendingVoice.id);
    await setGlobalVoiceId(elevenLabsId);

    const now = new Date().toISOString();
    await AsyncStorage.setItem(VOICE_LAST_CHANGED_KEY, now);
    setLastChangedDate(new Date(now));

    setVoiceOpen(false);
    setPendingVoice(null);

    // Trigger background pre-recording of all habits
    const apiKey = apiKeyQuery.data?.apiKey;
    if (!apiKey) return;
    try {
      await clearHabitAudioCache();
      const habits = await loadHabits();
      const activeHabits = habits.filter((h) => h.isActive).map((h) => ({ id: h.id, name: h.name }));
      setSyncProgress({ done: 0, total: activeHabits.length });
      await syncHabitAudio(activeHabits, elevenLabsId, apiKey, (done, total) => {
        setSyncProgress({ done, total });
      });
      setSyncProgress(null);
    } catch (err) {
      console.error('[VoicePickerSection] sync error:', err);
      setSyncProgress(null);
    }
  }

  function handleCancelChange() {
    setShowConfirm(false);
    setPendingVoice(null);
  }

  const selectedVoice = VOICES.find((v) => v.id === selectedVoiceId);
  const selectedLabel = selectedVoice?.name ?? 'None selected';

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
          <Text style={[styles.rowLabel, { color: colors.muted }]}>Selected Voice</Text>
          <Text style={[styles.rowValue, { color: colors.foreground }]}>{selectedLabel}</Text>
        </View>
        <IconSymbol name={voiceOpen ? 'chevron.up' : 'chevron.down'} size={14} color={colors.muted} />
      </Pressable>

      {/* Voice List */}
      {voiceOpen && (
        <View style={[styles.voiceList, { borderTopColor: colors.border }]}>
          {!canChangeVoice() && (
            <View style={[styles.limitBanner, { backgroundColor: '#F59E0B18', borderBottomColor: colors.border }]}>
              <IconSymbol name="clock" size={14} color="#F59E0B" />
              <Text style={[styles.limitText, { color: '#F59E0B' }]}>
                Voice locked until next month ({getDaysUntilNextChange()} days)
              </Text>
            </View>
          )}
          {VOICES.map((voice) => {
            const isSelected = selectedVoiceId === voice.id;
            return (
              <Pressable
                key={voice.id}
                onPress={() => handleTapVoice(voice)}
                style={({ pressed }) => [
                  styles.voiceItem,
                  isSelected && { backgroundColor: colors.primary + '18' },
                  { opacity: pressed ? 0.7 : 1, borderBottomColor: colors.border },
                ]}
              >
                <Text style={styles.voiceEmoji}>🎙️</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.voiceName, { color: isSelected ? colors.primary : colors.foreground }]}>
                    {voice.name}
                  </Text>
                  <Text style={[styles.voiceDesc, { color: colors.muted }]}>{voice.description}</Text>
                </View>
                {isSelected && (
                  <IconSymbol name="checkmark" size={14} color={colors.primary} />
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

      {/* Monthly-change confirmation modal */}
      <Modal
        visible={showConfirm}
        transparent
        animationType="fade"
        onRequestClose={handleCancelChange}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>Change Voice?</Text>
            <Text style={[styles.modalBody, { color: colors.muted }]}>
              You are switching to{' '}
              <Text style={{ fontWeight: '700', color: colors.foreground }}>{pendingVoice?.name}</Text>.
              {'\n\n'}
              You can only change your voice{' '}
              <Text style={{ fontWeight: '700', color: colors.foreground }}>once per month</Text>.
              {'\n'}Are you sure?
            </Text>
            <View style={styles.modalButtons}>
              <Pressable
                onPress={handleCancelChange}
                style={({ pressed }) => [
                  styles.modalBtn,
                  { backgroundColor: colors.border, opacity: pressed ? 0.7 : 1 },
                ]}
              >
                <Text style={[styles.modalBtnText, { color: colors.foreground }]}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={handleConfirmChange}
                style={({ pressed }) => [
                  styles.modalBtn,
                  { backgroundColor: colors.primary, opacity: pressed ? 0.8 : 1 },
                ]}
              >
                <Text style={[styles.modalBtnText, { color: '#fff' }]}>Yes, switch</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
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
  limitBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  limitText: {
    fontSize: 12,
    fontWeight: '600',
  },
  voiceItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 13,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 10,
  },
  voiceEmoji: {
    fontSize: 18,
  },
  voiceName: {
    fontSize: 15,
    fontWeight: '600',
  },
  voiceDesc: {
    fontSize: 12,
    marginTop: 1,
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
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: {
    width: '100%',
    maxWidth: 340,
    borderRadius: 20,
    borderWidth: 1,
    padding: 24,
    gap: 16,
  },
  modalTitle: {
    fontSize: 19,
    fontWeight: '700',
    textAlign: 'center',
  },
  modalBody: {
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 4,
  },
  modalBtn: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 12,
    alignItems: 'center',
  },
  modalBtnText: {
    fontSize: 15,
    fontWeight: '700',
  },
});
