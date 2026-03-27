/**
 * AlarmJournalScreen — Post-alarm morning journal entry
 *
 * Shown after the user taps "Wake Up" on the alarm ring screen.
 *
 * Flow:
 *   1. Ask: "Did you journal last night?" → YES (skip to meditation) / NO (show entry options)
 *   2. Entry options: Voice (→ voice-checkin) or Type manually (→ inline text entry)
 *   3. After entry saved (or skipped): if meditation configured → go to alarm-meditation picker
 *                                      else → go home
 *
 * Params:
 *   meditationId       — which practice type to launch after (or 'none')
 *   practiceDuration   — duration in minutes
 */

import { useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { addEntry, generateId, todayDateStr } from '@/lib/journal-store';
import { getLastUserId } from '@/lib/storage';

type Step = 'ask' | 'choose' | 'type' | 'done';

export default function AlarmJournalScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ meditationId?: string; practiceDuration?: string }>();

  const meditationId = params.meditationId ?? 'none';
  const practiceDuration = parseInt(params.practiceDuration ?? '10', 10);
  const hasMeditation = meditationId !== 'none' && meditationId !== '';

  const [step, setStep] = useState<Step>('ask');
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);

  function haptic() {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }

  function goToMeditation() {
    if (hasMeditation) {
      router.replace({
        pathname: '/alarm-meditation',
        params: { meditationId, practiceDuration: String(practiceDuration) },
      } as never);
    } else {
      router.replace('/(tabs)' as never);
    }
  }

  function handleAlreadyJournaled() {
    haptic();
    goToMeditation();
  }

  function handleSkip() {
    haptic();
    goToMeditation();
  }

  function handleChooseVoice() {
    haptic();
    // Launch voice check-in; on complete it will navigate home
    // Pass a returnTo param so voice-checkin knows where to go after
    router.replace({
      pathname: '/voice-checkin',
      params: {
        returnTo: hasMeditation ? '/alarm-meditation' : '/(tabs)',
        meditationId,
        practiceDuration: String(practiceDuration),
      },
    } as never);
  }

  function handleChooseType() {
    haptic();
    setStep('type');
  }

  async function handleSaveText() {
    if (!text.trim()) {
      goToMeditation();
      return;
    }
    setSaving(true);
    try {
      const uid = await getLastUserId();
      const effectiveUid = uid || 'default';
      await addEntry(effectiveUid, {
        id: generateId(),
        userId: effectiveUid,
        date: todayDateStr(),
        title: '',
        body: text.trim(),
        template: 'blank' as const,
        tags: [],
        attachments: [],
        gratitudes: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    } catch (e) {
      console.warn('[AlarmJournal] Save error:', e);
    } finally {
      setSaving(false);
      goToMeditation();
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={[styles.inner, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]}>

        {/* ── Step: Ask ─────────────────────────────────────────────────────── */}
        {step === 'ask' && (
          <View style={styles.centeredBlock}>
            <Text style={styles.emoji}>📓</Text>
            <Text style={styles.title}>Morning Check-in</Text>
            <Text style={styles.subtitle}>Did you journal last night?</Text>

            <View style={styles.btnGroup}>
              <Pressable
                style={({ pressed }) => [styles.primaryBtn, pressed && styles.pressed]}
                onPress={handleAlreadyJournaled}
              >
                <Text style={styles.primaryBtnText}>Yes, I did</Text>
              </Pressable>

              <Pressable
                style={({ pressed }) => [styles.secondaryBtn, pressed && styles.pressed]}
                onPress={() => { haptic(); setStep('choose'); }}
              >
                <Text style={styles.secondaryBtnText}>No, let me do it now</Text>
              </Pressable>

              <Pressable
                style={({ pressed }) => [styles.ghostBtn, pressed && { opacity: 0.5 }]}
                onPress={handleSkip}
              >
                <Text style={styles.ghostBtnText}>Skip</Text>
              </Pressable>
            </View>
          </View>
        )}

        {/* ── Step: Choose entry method ─────────────────────────────────────── */}
        {step === 'choose' && (
          <View style={styles.centeredBlock}>
            <Text style={styles.emoji}>✍️</Text>
            <Text style={styles.title}>How would you like to journal?</Text>
            <Text style={styles.subtitle}>Capture how yesterday went</Text>

            <View style={styles.btnGroup}>
              <Pressable
                style={({ pressed }) => [styles.choiceBtn, pressed && styles.pressed]}
                onPress={handleChooseVoice}
              >
                <Text style={styles.choiceEmoji}>🎙️</Text>
                <View style={styles.choiceTextBlock}>
                  <Text style={styles.choiceBtnTitle}>Voice</Text>
                  <Text style={styles.choiceBtnDesc}>Speak your entry — AI extracts habits & gratitudes</Text>
                </View>
              </Pressable>

              <Pressable
                style={({ pressed }) => [styles.choiceBtn, pressed && styles.pressed]}
                onPress={handleChooseType}
              >
                <Text style={styles.choiceEmoji}>⌨️</Text>
                <View style={styles.choiceTextBlock}>
                  <Text style={styles.choiceBtnTitle}>Type manually</Text>
                  <Text style={styles.choiceBtnDesc}>Write a quick morning note</Text>
                </View>
              </Pressable>

              <Pressable
                style={({ pressed }) => [styles.ghostBtn, pressed && { opacity: 0.5 }]}
                onPress={handleSkip}
              >
                <Text style={styles.ghostBtnText}>Skip for now</Text>
              </Pressable>
            </View>
          </View>
        )}

        {/* ── Step: Type entry ──────────────────────────────────────────────── */}
        {step === 'type' && (
          <View style={styles.typeBlock}>
            <Text style={styles.title}>Morning Note</Text>
            <Text style={styles.subtitle}>What's on your mind?</Text>

            <ScrollView style={styles.textAreaWrapper} keyboardShouldPersistTaps="handled">
              <TextInput
                style={styles.textArea}
                value={text}
                onChangeText={setText}
                placeholder="Write about yesterday, how you're feeling, what you're grateful for..."
                placeholderTextColor="rgba(255,255,255,0.3)"
                multiline
                autoFocus
                textAlignVertical="top"
              />
            </ScrollView>

            <View style={styles.btnGroup}>
              <Pressable
                style={({ pressed }) => [styles.primaryBtn, pressed && styles.pressed, saving && styles.disabledBtn]}
                onPress={handleSaveText}
                disabled={saving}
              >
                <Text style={styles.primaryBtnText}>{saving ? 'Saving...' : text.trim() ? 'Save & Continue' : 'Skip'}</Text>
              </Pressable>
            </View>
          </View>
        )}

      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0d0d1f',
  },
  inner: {
    flex: 1,
    paddingHorizontal: 28,
  },
  centeredBlock: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  emoji: {
    fontSize: 52,
    marginBottom: 8,
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    color: '#ffffff',
    textAlign: 'center',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.55)',
    textAlign: 'center',
    marginBottom: 32,
  },
  btnGroup: {
    width: '100%',
    gap: 12,
    alignItems: 'center',
  },
  primaryBtn: {
    width: '100%',
    backgroundColor: '#3B82F6',
    borderRadius: 16,
    paddingVertical: 18,
    alignItems: 'center',
  },
  primaryBtnText: {
    fontSize: 17,
    fontWeight: '700',
    color: '#ffffff',
  },
  secondaryBtn: {
    width: '100%',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 16,
    paddingVertical: 18,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  secondaryBtnText: {
    fontSize: 17,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.85)',
  },
  ghostBtn: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  ghostBtnText: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.35)',
    fontWeight: '500',
  },
  choiceBtn: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    gap: 16,
  },
  choiceEmoji: {
    fontSize: 32,
  },
  choiceTextBlock: {
    flex: 1,
    gap: 3,
  },
  choiceBtnTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#ffffff',
  },
  choiceBtnDesc: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.5)',
  },
  pressed: {
    opacity: 0.8,
    transform: [{ scale: 0.98 }],
  },
  disabledBtn: {
    opacity: 0.5,
  },
  typeBlock: {
    flex: 1,
    gap: 8,
  },
  textAreaWrapper: {
    flex: 1,
    marginVertical: 16,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  textArea: {
    flex: 1,
    minHeight: 200,
    padding: 16,
    fontSize: 16,
    color: '#ffffff',
    lineHeight: 24,
  },
});
