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
  Alert,
  Modal,
  Pressable,
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

const REPORT_REASONS = [
  { key: "spam" as const, label: "Spam" },
  { key: "harassment" as const, label: "Harassment" },
  { key: "hate_speech" as const, label: "Hate Speech" },
  { key: "inappropriate" as const, label: "Inappropriate Content" },
  { key: "other" as const, label: "Other" },
];

export default function TeamChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const teamId = parseInt(id ?? "0");
  const colors = useColors();
  const router = useRouter();
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const flatListRef = useRef<FlatList>(null);
  const utils = trpc.useUtils();

  // Moderation state
  const [selectedMsg, setSelectedMsg] = useState<Message | null>(null);
  const [showActionSheet, setShowActionSheet] = useState(false);
  const [showReasonSheet, setShowReasonSheet] = useState(false);

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

  const reportMutation = trpc.moderation.report.useMutation({
    onSuccess: () => {
      Alert.alert("Report Submitted", "Thank you. Our team will review this message.");
      setShowReasonSheet(false);
      setSelectedMsg(null);
    },
    onError: () => Alert.alert("Error", "Could not submit report. Please try again."),
  });

  const blockMutation = trpc.moderation.blockUser.useMutation({
    onSuccess: () => {
      Alert.alert("User Blocked", "You will no longer see messages from this user.");
      setShowActionSheet(false);
      setSelectedMsg(null);
      utils.messages.list.invalidate();
    },
    onError: () => Alert.alert("Error", "Could not block user. Please try again."),
  });

  const handleSend = useCallback(() => {
    const content = text.trim();
    if (!content || sending) return;
    setSending(true);
    sendMutation.mutate({ teamId, message: content });
  }, [text, sending, teamId, sendMutation]);

  const handleLongPress = useCallback((msg: Message) => {
    if (msg.userId === me?.id) return; // can't report own messages
    setSelectedMsg(msg);
    setShowActionSheet(true);
  }, [me?.id]);

  const handleReport = useCallback((reason: typeof REPORT_REASONS[number]["key"]) => {
    if (!selectedMsg) return;
    reportMutation.mutate({ contentType: "message", contentId: selectedMsg.id, reason });
  }, [selectedMsg, reportMutation]);

  const handleBlock = useCallback(() => {
    if (!selectedMsg) return;
    const displayName = selectedMsg.name ?? selectedMsg.email ?? "this user";
    Alert.alert(
      "Block User",
      `Block ${displayName}? Their messages will be hidden from you.`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Block", style: "destructive", onPress: () => blockMutation.mutate({ userId: selectedMsg.userId }) },
      ]
    );
    setShowActionSheet(false);
  }, [selectedMsg, blockMutation]);

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
      <TouchableOpacity
        activeOpacity={0.85}
        onLongPress={() => handleLongPress(item)}
        delayLongPress={400}
      >
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
      </TouchableOpacity>
    );
  }, [me?.id, colors, handleLongPress]);

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
          <Text style={[styles.headerSub, { color: colors.muted }]}>Team messages · Hold a message to report</Text>
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

      {/* Action sheet: Report or Block */}
      <Modal visible={showActionSheet} transparent animationType="slide" onRequestClose={() => setShowActionSheet(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setShowActionSheet(false)}>
          <View style={[styles.actionSheet, { backgroundColor: colors.surface }]}>
            <Text style={[styles.actionSheetTitle, { color: colors.foreground }]}>Message Options</Text>
            <TouchableOpacity
              style={[styles.actionBtn, { borderBottomColor: colors.border }]}
              onPress={() => { setShowActionSheet(false); setShowReasonSheet(true); }}
              activeOpacity={0.7}
            >
              <IconSymbol name="flag.fill" size={18} color={colors.error ?? "#EF4444"} />
              <Text style={[styles.actionBtnText, { color: colors.error ?? "#EF4444" }]}>Report Message</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionBtn, { borderBottomColor: colors.border }]}
              onPress={handleBlock}
              activeOpacity={0.7}
            >
              <IconSymbol name="person.fill.xmark" size={18} color={colors.error ?? "#EF4444"} />
              <Text style={[styles.actionBtnText, { color: colors.error ?? "#EF4444" }]}>Block User</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionBtn} onPress={() => setShowActionSheet(false)} activeOpacity={0.7}>
              <Text style={[styles.actionBtnText, { color: colors.muted }]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>

      {/* Reason sheet */}
      <Modal visible={showReasonSheet} transparent animationType="slide" onRequestClose={() => setShowReasonSheet(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setShowReasonSheet(false)}>
          <View style={[styles.actionSheet, { backgroundColor: colors.surface }]}>
            <Text style={[styles.actionSheetTitle, { color: colors.foreground }]}>Why are you reporting this?</Text>
            {REPORT_REASONS.map((r) => (
              <TouchableOpacity
                key={r.key}
                style={[styles.actionBtn, { borderBottomColor: colors.border }]}
                onPress={() => handleReport(r.key)}
                activeOpacity={0.7}
              >
                <Text style={[styles.actionBtnText, { color: colors.foreground }]}>{r.label}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={styles.actionBtn} onPress={() => setShowReasonSheet(false)} activeOpacity={0.7}>
              <Text style={[styles.actionBtnText, { color: colors.muted }]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>
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
  // Moderation sheets
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" },
  actionSheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingTop: 16, paddingBottom: 32 },
  actionSheetTitle: { fontSize: 13, fontWeight: "600", textAlign: "center", paddingHorizontal: 16, paddingBottom: 12 },
  actionBtn: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 16, paddingHorizontal: 24, borderBottomWidth: 0.5 },
  actionBtnText: { fontSize: 16 },
});
