import React, { useState, useRef, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/use-colors";
import { useApp } from "@/lib/app-context";
import { trpc } from "@/lib/trpc";
import { loadEntries } from "@/lib/journal-store";

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

const SUGGESTED_PROMPTS = [
  "How am I doing overall?",
  "Which habit needs the most attention?",
  "What patterns do you see in my journal?",
  "How can I improve my consistency?",
  "What should I focus on this week?",
];

export default function CoachScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { habits, checkIns } = useApp();

  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      role: "assistant",
      content:
        "Hey! I'm your personal coach 👋\n\nI've analyzed your habit data and journal entries. What would you like to work on today?",
    },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const flatListRef = useRef<FlatList>(null);

  const chatMutation = trpc.coach.chat.useMutation();

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || isLoading) return;

      const userMsg: Message = {
        id: Date.now().toString(),
        role: "user",
        content: trimmed,
      };
      const newMessages = [...messages, userMsg];
      setMessages(newMessages);
      setInput("");
      setIsLoading(true);

      try {
        // Load recent journal entries for context
        const allEntries = await loadEntries('local');
        const recentJournal = allEntries.slice(-20).map((e: any) => ({
          date: e.date,
          title: e.title ?? "",
          body: e.body ?? "",
        }));

        // Build conversation history (exclude welcome message)
        const history = newMessages
          .filter((m) => m.id !== "welcome")
          .slice(-10)
          .map((m) => ({ role: m.role, content: m.content }));

        // Build habits context
        const habitsContext = habits.map((h) => ({
          id: h.id,
          name: h.name,
          category: h.category ?? undefined,
          emoji: h.emoji ?? undefined,
        }));

        // Build check-ins context (last 60 days)
        const checkInsContext = checkIns.slice(-200).map((c) => ({
          date: c.date,
          habitId: c.habitId,
          rating: c.rating,
        }));

        const result = await chatMutation.mutateAsync({
          message: trimmed,
          habits: habitsContext,
          checkIns: checkInsContext,
          journalEntries: recentJournal,
          history,
        });

        const reply = typeof result.reply === 'string' ? result.reply : String(result.reply);
        const assistantMsg: Message = {
          id: (Date.now() + 1).toString(),
          role: "assistant",
          content: reply,
        };
        setMessages((prev) => [...prev, assistantMsg]);
      } catch (err) {
        const errorMsg: Message = {
          id: (Date.now() + 1).toString(),
          role: "assistant",
          content:
            "Sorry, I ran into an issue. Please check your connection and try again.",
        };
        setMessages((prev) => [...prev, errorMsg]);
      } finally {
        setIsLoading(false);
        setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
      }
    },
    [messages, habits, checkIns, isLoading, chatMutation]
  );

  const renderMessage = ({ item }: { item: Message }) => {
    const isUser = item.role === "user";
    return (
      <View
        style={[
          styles.messageBubble,
          isUser
            ? [styles.userBubble, { backgroundColor: colors.primary }]
            : [styles.assistantBubble, { backgroundColor: colors.surface, borderColor: colors.border }],
        ]}
      >
        <Text
          style={[
            styles.messageText,
            { color: isUser ? "#fff" : colors.foreground },
          ]}
        >
          {item.content}
        </Text>
      </View>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View
        style={[
          styles.header,
          {
            paddingTop: insets.top + 8,
            backgroundColor: colors.background,
            borderBottomColor: colors.border,
          },
        ]}
      >
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [styles.backBtn, { opacity: pressed ? 0.6 : 1 }]}
        >
          <Text style={[styles.backText, { color: colors.primary }]}>← Back</Text>
        </Pressable>
        <View style={styles.headerCenter}>
          <Text style={styles.coachEmoji}>🧠</Text>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>
            Coach
          </Text>
        </View>
        <View style={styles.backBtn} />
      </View>

      {/* Messages */}
      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={(item) => item.id}
        renderItem={renderMessage}
        contentContainerStyle={[styles.messageList, { paddingBottom: 16 }]}
        onContentSizeChange={() =>
          flatListRef.current?.scrollToEnd({ animated: false })
        }
        ListFooterComponent={
          isLoading ? (
            <View style={[styles.messageBubble, styles.assistantBubble, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <ActivityIndicator size="small" color={colors.primary} />
            </View>
          ) : null
        }
      />

      {/* Suggested prompts (only show when no conversation yet) */}
      {messages.length === 1 && (
        <View style={styles.suggestedRow}>
          <FlatList
            horizontal
            showsHorizontalScrollIndicator={false}
            data={SUGGESTED_PROMPTS}
            keyExtractor={(item) => item}
            contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}
            renderItem={({ item }) => (
              <Pressable
                onPress={() => sendMessage(item)}
                style={({ pressed }) => [
                  styles.suggestionChip,
                  {
                    backgroundColor: colors.surface,
                    borderColor: colors.border,
                    opacity: pressed ? 0.7 : 1,
                  },
                ]}
              >
                <Text style={[styles.suggestionText, { color: colors.foreground }]}>
                  {item}
                </Text>
              </Pressable>
            )}
          />
        </View>
      )}

      {/* Input bar */}
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={0}
      >
        <View
          style={[
            styles.inputBar,
            {
              backgroundColor: colors.background,
              borderTopColor: colors.border,
              paddingBottom: insets.bottom + 8,
            },
          ]}
        >
          <TextInput
            style={[
              styles.textInput,
              {
                backgroundColor: colors.surface,
                borderColor: colors.border,
                color: colors.foreground,
              },
            ]}
            placeholder="Ask your coach anything..."
            placeholderTextColor={colors.muted}
            value={input}
            onChangeText={setInput}
            multiline
            maxLength={2000}
            returnKeyType="send"
            onSubmitEditing={() => sendMessage(input)}
          />
          <Pressable
            onPress={() => sendMessage(input)}
            disabled={!input.trim() || isLoading}
            style={({ pressed }) => [
              styles.sendBtn,
              {
                backgroundColor:
                  input.trim() && !isLoading ? colors.primary : colors.border,
                opacity: pressed ? 0.8 : 1,
              },
            ]}
          >
            <Text style={styles.sendBtnText}>↑</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 0.5,
  },
  backBtn: { width: 70 },
  backText: { fontSize: 16, fontWeight: "600" },
  headerCenter: { flexDirection: "row", alignItems: "center", gap: 6 },
  coachEmoji: { fontSize: 22 },
  headerTitle: { fontSize: 18, fontWeight: "800" },
  messageList: { padding: 16, gap: 12 },
  messageBubble: {
    maxWidth: "82%",
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 4,
  },
  userBubble: {
    alignSelf: "flex-end",
    borderBottomRightRadius: 4,
  },
  assistantBubble: {
    alignSelf: "flex-start",
    borderBottomLeftRadius: 4,
    borderWidth: 1,
  },
  messageText: { fontSize: 15, lineHeight: 22 },
  suggestedRow: { paddingVertical: 8 },
  suggestionChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  suggestionText: { fontSize: 13, fontWeight: "500" },
  inputBar: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: 12,
    paddingTop: 10,
    borderTopWidth: 0.5,
    gap: 8,
  },
  textInput: {
    flex: 1,
    borderRadius: 22,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 15,
    maxHeight: 120,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  sendBtnText: { color: "#fff", fontSize: 18, fontWeight: "700" },
});
