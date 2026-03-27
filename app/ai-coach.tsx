import {
  View, Text, TextInput, Pressable, FlatList, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import { ScreenContainer } from '@/components/screen-container';
import { useColors } from '@/hooks/use-colors';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useApp } from '@/lib/app-context';
import { trpc } from '@/lib/trpc';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { loadEntries } from '@/lib/journal-store';
import { loadDayNotes, getLastUserId } from '@/lib/storage';

// ─── Types ───────────────────────────────────────────────────────────────────
type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
};

type HabitRating = 'none' | 'red' | 'yellow' | 'green';

// ─── Suggested prompts ───────────────────────────────────────────────────────
const SUGGESTED_PROMPTS = [
  "How am I doing overall?",
  "Which habit needs the most attention?",
  "What's my biggest win lately?",
  "Give me a tip to improve consistency",
  "What patterns do you see in my data?",
];

// ─── Helpers ─────────────────────────────────────────────────────────────────
function generateId(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function toDateString(d: Date): string {
  return d.toISOString().split('T')[0];
}

// ─── Message bubble ──────────────────────────────────────────────────────────
function MessageBubble({ message, colors }: { message: ChatMessage; colors: any }) {
  const isUser = message.role === 'user';
  return (
    <View style={[styles.bubbleRow, isUser && styles.bubbleRowUser]}>
      {!isUser && (
        <View style={[styles.avatarDot, { backgroundColor: colors.primary }]}>
          <IconSymbol name="brain" size={14} color="#fff" />
        </View>
      )}
      <View style={[
        styles.bubble,
        isUser
          ? [styles.bubbleUser, { backgroundColor: colors.primary }]
          : [styles.bubbleAssistant, { backgroundColor: colors.surface, borderColor: colors.border }],
      ]}>
        <Text style={[
          styles.bubbleText,
          { color: isUser ? '#fff' : colors.foreground },
        ]}>
          {message.content}
        </Text>
      </View>
    </View>
  );
}

// ─── Main screen ─────────────────────────────────────────────────────────────
export default function AiCoachScreen() {
  const router = useRouter();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { activeHabits, categories, checkIns: checkInEntries, streak, getRatingsForDate } = useApp();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const flatListRef = useRef<FlatList>(null);

  // Load journal entries and habit notes for deep AI context
  const [journalSummary, setJournalSummary] = useState<string>('');
  const [habitNotesSummary, setHabitNotesSummary] = useState<string>('');

  useEffect(() => {
    (async () => {
      try {
        const uid = await getLastUserId();
        const userId = uid || 'default';
        // Load last 30 journal entries
        const entries = await loadEntries(userId);
        const recent = entries
          .sort((a, b) => b.date.localeCompare(a.date))
          .slice(0, 30);
        if (recent.length > 0) {
          const lines = recent.map((e) => {
            const body = (e.body || '').replace(/\[photo:[^\]]+\]/g, '[photo]').slice(0, 300);
            return `[${e.date}] ${body}`;
          });
          setJournalSummary(lines.join('\n'));
        }
        // Load habit notes (voice check-in descriptions) for last 30 days
        const allNotes = await loadDayNotes();
        const noteLines: string[] = [];
        const today = new Date();
        for (let i = 0; i < 30; i++) {
          const d = new Date(today);
          d.setDate(d.getDate() - i);
          const dateStr = d.toISOString().slice(0, 10);
          for (const [key, note] of Object.entries(allNotes)) {
            if (key.endsWith(`:${dateStr}`) && note) {
              const habitId = key.replace(`:${dateStr}`, '');
              const habit = activeHabits.find((h) => h.id === habitId);
              if (habit) noteLines.push(`[${dateStr}] ${habit.name}: ${note}`);
            }
          }
        }
        if (noteLines.length > 0) setHabitNotesSummary(noteLines.join('\n'));
      } catch {
        // non-critical
      }
    })();
  }, [activeHabits]);

  const chatMutation = trpc.aiCoach.chat.useMutation();

  // Build habit context from app data
  const habitContext = useMemo(() => {
    const habits = activeHabits.map((h) => ({
      id: h.id,
      name: h.name,
      category: categories.find((c) => c.id === h.category)?.label,
    }));

    // Get last 30 days of check-in ratings
    const recentRatings: Array<{ date: string; ratings: Record<string, HabitRating> }> = [];
    const today = new Date();
    for (let i = 1; i <= 30; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const dateStr = toDateString(d);
      const dayRatings = getRatingsForDate(dateStr);
      const filtered = Object.fromEntries(
        Object.entries(dayRatings).filter(([, v]) => v !== 'none')
      ) as Record<string, HabitRating>;
      if (Object.keys(filtered).length > 0) {
        recentRatings.push({ date: dateStr, ratings: filtered });
      }
    }

    // Unique days with any check-in
    const uniqueDays = new Set(checkInEntries.map((e) => e.date)).size;

    return {
      habits,
      recentRatings: recentRatings.length > 0 ? recentRatings : undefined,
      streak,
      totalDaysLogged: uniqueDays,
      journalSummary: journalSummary || undefined,
      habitNotesSummary: habitNotesSummary || undefined,
    };
  }, [activeHabits, categories, checkInEntries, streak, getRatingsForDate, journalSummary, habitNotesSummary]);

  const sendMessage = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || isLoading) return;

    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    const userMsg: ChatMessage = { id: generateId(), role: 'user', content: trimmed };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput('');
    setIsLoading(true);

    // Scroll to bottom
    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);

    try {
      const history = newMessages.slice(-10).map((m) => ({ role: m.role, content: m.content }));
      const result = await chatMutation.mutateAsync({
        message: trimmed,
        habitContext,
        history: history.slice(0, -1), // exclude the message we just added
      });

      const assistantMsg: ChatMessage = {
        id: generateId(),
        role: 'assistant',
        content: result.reply,
      };
      setMessages((prev) => [...prev, assistantMsg]);
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    } catch (e) {
      const errMsg: ChatMessage = {
        id: generateId(),
        role: 'assistant',
        content: "Sorry, I couldn't connect right now. Please try again.",
      };
      setMessages((prev) => [...prev, errMsg]);
    } finally {
      setIsLoading(false);
    }
  }, [messages, isLoading, habitContext, chatMutation]);

  const handleSend = useCallback(() => sendMessage(input), [sendMessage, input]);

  const showSuggestions = messages.length === 0;

  return (
    <ScreenContainer edges={['top', 'left', 'right']}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [styles.backBtn, { opacity: pressed ? 0.6 : 1 }]}
        >
          <IconSymbol name="chevron.left" size={22} color={colors.foreground} />
        </Pressable>
        <View style={styles.headerCenter}>
          <View style={[styles.headerIcon, { backgroundColor: colors.primary + '20' }]}>
            <IconSymbol name="brain" size={18} color={colors.primary} />
          </View>
          <View>
            <Text style={[styles.headerTitle, { color: colors.foreground }]}>AI Coach</Text>
            <Text style={[styles.headerSub, { color: colors.muted }]}>
              {activeHabits.length} habit{activeHabits.length !== 1 ? 's' : ''} · {streak} day streak
            </Text>
          </View>
        </View>
        <View style={{ width: 40 }} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={insets.top + 60}
      >
        {/* Message list */}
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(m) => m.id}
          renderItem={({ item }) => <MessageBubble message={item} colors={colors} />}
          contentContainerStyle={[styles.listContent, showSuggestions && { flex: 1 }]}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <View style={[styles.emptyIcon, { backgroundColor: colors.primary + '15' }]}>
                <IconSymbol name="brain" size={32} color={colors.primary} />
              </View>
              <Text style={[styles.emptyTitle, { color: colors.foreground }]}>Your Habit Coach</Text>
              <Text style={[styles.emptySub, { color: colors.muted }]}>
                I know your habits and history. Ask me anything about your progress, patterns, or how to improve.
              </Text>
            </View>
          }
          ListFooterComponent={
            isLoading ? (
              <View style={styles.loadingRow}>
                <View style={[styles.avatarDot, { backgroundColor: colors.primary }]}>
                  <IconSymbol name="brain" size={14} color="#fff" />
                </View>
                <View style={[styles.bubble, styles.bubbleAssistant, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <ActivityIndicator size="small" color={colors.primary} />
                </View>
              </View>
            ) : null
          }
        />

        {/* Suggested prompts */}
        {showSuggestions && (
          <View style={styles.suggestionsWrap}>
            <Text style={[styles.suggestionsLabel, { color: colors.muted }]}>Try asking:</Text>
            <View style={styles.suggestionsRow}>
              {SUGGESTED_PROMPTS.map((prompt) => (
                <Pressable
                  key={prompt}
                  onPress={() => sendMessage(prompt)}
                  style={({ pressed }) => [
                    styles.suggestionChip,
                    { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
                  ]}
                >
                  <Text style={[styles.suggestionText, { color: colors.foreground }]}>{prompt}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}

        {/* Input row */}
        <View style={[styles.inputRow, { backgroundColor: colors.background, borderTopColor: colors.border, paddingBottom: Math.max(insets.bottom, 12) }]}>
          <TextInput
            style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground }]}
            placeholder="Ask your coach anything…"
            placeholderTextColor={colors.muted}
            value={input}
            onChangeText={setInput}
            multiline
            maxLength={2000}
            returnKeyType="send"
            onSubmitEditing={handleSend}
            blurOnSubmit={false}
          />
          <Pressable
            onPress={handleSend}
            style={({ pressed }) => [
              styles.sendBtn,
              {
                backgroundColor: input.trim() && !isLoading ? colors.primary : colors.border,
                opacity: input.trim() && !isLoading ? (pressed ? 0.8 : 1) : 0.5,
                transform: [{ scale: pressed && input.trim() ? 0.95 : 1 }],
              },
            ]}
          >
            <IconSymbol name="paperplane.fill" size={18} color="#fff" />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 12, paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerCenter: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 16, fontWeight: '700' },
  headerSub: { fontSize: 12, marginTop: 1 },

  listContent: { padding: 16, paddingBottom: 8, gap: 12 },

  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 },
  emptyIcon: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { fontSize: 20, fontWeight: '700', textAlign: 'center' },
  emptySub: { fontSize: 14, textAlign: 'center', lineHeight: 20 },

  bubbleRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginBottom: 4 },
  bubbleRowUser: { flexDirection: 'row-reverse' },
  avatarDot: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  bubble: { maxWidth: '80%', borderRadius: 16, padding: 12 },
  bubbleUser: { borderBottomRightRadius: 4 },
  bubbleAssistant: { borderWidth: StyleSheet.hairlineWidth, borderBottomLeftRadius: 4 },
  bubbleText: { fontSize: 15, lineHeight: 22 },

  loadingRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginBottom: 4, paddingHorizontal: 16 },

  suggestionsWrap: { paddingHorizontal: 16, paddingBottom: 8 },
  suggestionsLabel: { fontSize: 12, fontWeight: '600', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  suggestionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  suggestionChip: {
    borderRadius: 20, borderWidth: 1,
    paddingHorizontal: 14, paddingVertical: 8,
  },
  suggestionText: { fontSize: 13, fontWeight: '500' },

  inputRow: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 10,
    paddingHorizontal: 16, paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  input: {
    flex: 1, borderRadius: 14, borderWidth: 1,
    paddingHorizontal: 14, paddingVertical: 10,
    fontSize: 15, lineHeight: 20,
    maxHeight: 120,
  },
  sendBtn: {
    width: 44, height: 44, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
  },
});
