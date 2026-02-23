import React, { useState, useCallback, useRef, useEffect } from "react";
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";

type Message = {
  id: number;
  userId: number;
  message: string;
  sentAt: Date | string;
  name: string | null;
  email: string | null;
};

export default function TeamChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const teamId = parseInt(id ?? "0");
  const colors = useColors();
  const router = useRouter();
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const flatListRef = useRef<FlatList>(null);
  const utils = trpc.useUtils();

  const { data: messages, isLoading } = trpc.messages.list.useQuery(
    { teamId, limit: 100 },
    { refetchInterval: 5000 }
  );
  const { data: me } = trpc.auth.me.useQuery();
  const { data: myTeams } = trpc.teams.list.useQuery();
  const myTeam = myTeams?.find((t) => t.id === teamId);

  const sendMutation = trpc.messages.send.useMutation({
    onSuccess: () => {
      utils.messages.list.invalidate();
      setText("");
    },
    onSettled: () => setSending(false),
  });

  const handleSend = useCallback(() => {
    const content = text.trim();
    if (!content || sending) return;
    setSending(true);
    sendMutation.mutate({ teamId, message: content });
  }, [text, sending, teamId, sendMutation]);

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    if (messages && messages.length > 0) {
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [messages?.length]);

  const renderMessage = useCallback(({ item }: { item: Message }) => {
    const isMe = item.userId === me?.id;
    const displayName = item.name ?? item.email ?? `User ${item.userId}`;
    const initials = displayName.slice(0, 2).toUpperCase();
    const time = new Date(item.sentAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

    return (
      <View style={[styles.messageRow, isMe && styles.messageRowMe]}>
        {!isMe && (
          <View style={[styles.msgAvatar, { backgroundColor: colors.primary + "20" }]}>
            <Text style={[styles.msgAvatarText, { color: colors.primary }]}>{initials}</Text>
          </View>
        )}
        <View style={[
          styles.messageBubble,
          isMe
            ? { backgroundColor: colors.primary, alignSelf: "flex-end" }
            : { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 }
        ]}>
          {!isMe && (
            <Text style={[styles.msgSender, { color: colors.primary }]}>{displayName}</Text>
          )}
          <Text style={[styles.msgContent, { color: isMe ? "#fff" : colors.foreground }]}>{item.message}</Text>
          <Text style={[styles.msgTime, { color: isMe ? "rgba(255,255,255,0.65)" : colors.muted }]}>{time}</Text>
        </View>
      </View>
    );
  }, [me?.id, colors]);

  return (
    <ScreenContainer edges={["top", "left", "right"]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.7}>
          <IconSymbol name="chevron.left" size={24} color={colors.primary} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={[styles.headerTitle, { color: colors.foreground }]} numberOfLines={1}>
            {myTeam?.name ?? "Team Chat"}
          </Text>
          <Text style={[styles.headerSub, { color: colors.muted }]}>Team messages</Text>
        </View>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={0}
      >
        {isLoading ? (
          <ActivityIndicator size="large" color={colors.primary} style={{ flex: 1 }} />
        ) : !messages || messages.length === 0 ? (
          <View style={styles.emptyChat}>
            <IconSymbol name="bubble.left.fill" size={40} color={colors.muted} />
            <Text style={[styles.emptyChatTitle, { color: colors.foreground }]}>No messages yet</Text>
            <Text style={[styles.emptyChatSub, { color: colors.muted }]}>Be the first to say something!</Text>
          </View>
        ) : (
          <FlatList
            ref={flatListRef}
            data={messages as Message[]}
            keyExtractor={(item) => String(item.id)}
            renderItem={renderMessage}
            contentContainerStyle={styles.messageList}
            showsVerticalScrollIndicator={false}
            onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
          />
        )}

        {/* Input bar */}
        <View style={[styles.inputBar, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
          <TextInput
            style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
            placeholder="Message..."
            placeholderTextColor={colors.muted}
            value={text}
            onChangeText={setText}
            multiline
            maxLength={1000}
            returnKeyType="send"
            onSubmitEditing={handleSend}
            blurOnSubmit={false}
          />
          <TouchableOpacity
            style={[styles.sendBtn, { backgroundColor: text.trim() ? colors.primary : colors.border }]}
            onPress={handleSend}
            disabled={!text.trim() || sending}
            activeOpacity={0.8}
          >
            {sending ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <IconSymbol name="paperplane.fill" size={18} color="#fff" />
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 0.5, gap: 8 },
  backBtn: { padding: 4 },
  headerCenter: { flex: 1 },
  headerTitle: { fontSize: 17, fontWeight: "700" },
  headerSub: { fontSize: 12 },
  emptyChat: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8, padding: 32 },
  emptyChatTitle: { fontSize: 18, fontWeight: "700" },
  emptyChatSub: { fontSize: 14, textAlign: "center" },
  messageList: { padding: 16, gap: 12, paddingBottom: 8 },
  messageRow: { flexDirection: "row", alignItems: "flex-end", gap: 8 },
  messageRowMe: { flexDirection: "row-reverse" },
  msgAvatar: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  msgAvatarText: { fontSize: 12, fontWeight: "700" },
  messageBubble: { maxWidth: "75%", borderRadius: 16, padding: 10, gap: 2 },
  msgSender: { fontSize: 11, fontWeight: "700", marginBottom: 2 },
  msgContent: { fontSize: 15, lineHeight: 20 },
  msgTime: { fontSize: 10, alignSelf: "flex-end", marginTop: 2 },
  inputBar: { flexDirection: "row", alignItems: "flex-end", gap: 8, padding: 12, borderTopWidth: 0.5 },
  input: { flex: 1, borderRadius: 20, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15, maxHeight: 100 },
  sendBtn: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
});
