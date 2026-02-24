import React, { useState, useCallback, useRef } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  StyleSheet,
  Modal,
  FlatList,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Image,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";
import { useApp } from "@/lib/app-context";
import * as ImagePicker from "expo-image-picker";

const REACTION_EMOJIS = ["🔥", "💪", "👏", "❤️", "😂"];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(date: Date | string) {
  const d = typeof date === "string" ? new Date(date) : date;
  const seconds = Math.floor((Date.now() - d.getTime()) / 1000);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

function getInitials(name: string | null, email: string | null) {
  const src = name ?? email ?? "?";
  return src.slice(0, 2).toUpperCase();
}

// ─── Team Streak Banner ───────────────────────────────────────────────────────

function TeamStreakBanner({ teamId, myUserId }: { teamId: number; myUserId?: number }) {
  const colors = useColors();
  const { data: streakData } = trpc.teamFeed.streak.useQuery({ teamId });

  if (!streakData) return null;

  const allCheckedIn = streakData.todayStatus.every((m) => m.checkedIn);

  return (
    <View style={[styles.streakBanner, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={styles.streakLeft}>
        <Text style={styles.streakFire}>🔥</Text>
        <View>
          <Text style={[styles.streakCount, { color: colors.foreground }]}>
            {streakData.streak} day{streakData.streak !== 1 ? "s" : ""}
          </Text>
          <Text style={[styles.streakLabel, { color: colors.muted }]}>Team Streak</Text>
        </View>
      </View>
      <View style={styles.streakMembers}>
        {streakData.todayStatus.map((m) => (
          <View key={m.userId} style={styles.streakMemberDot}>
            <View
              style={[
                styles.streakDot,
                { backgroundColor: m.checkedIn ? colors.success : colors.border },
              ]}
            />
            <Text style={[styles.streakMemberName, { color: colors.muted }]} numberOfLines={1}>
              {m.userId === myUserId ? "You" : (m.name?.split(" ")[0] ?? "?")}
            </Text>
          </View>
        ))}
      </View>
      {allCheckedIn && streakData.todayStatus.length > 0 && (
        <View style={[styles.streakBadge, { backgroundColor: colors.success + "20" }]}>
          <Text style={[styles.streakBadgeText, { color: colors.success }]}>All in!</Text>
        </View>
      )}
    </View>
  );
}

// ─── Weekly Leaderboard ───────────────────────────────────────────────────────

function WeeklyLeaderboard({ teamId, myUserId }: { teamId: number; myUserId?: number }) {
  const colors = useColors();
  const { data: board } = trpc.teamFeed.leaderboard.useQuery({ teamId });

  if (!board || board.length === 0) return null;

  return (
    <View style={[styles.leaderboard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={styles.leaderboardHeader}>
        <IconSymbol name="trophy.fill" size={16} color={colors.warning} />
        <Text style={[styles.leaderboardTitle, { color: colors.foreground }]}>This Week</Text>
      </View>
      {board.map((member, index) => {
        const isMe = member.userId === myUserId;
        const medal = index === 0 ? "🥇" : index === 1 ? "🥈" : index === 2 ? "🥉" : null;
        return (
          <View
            key={member.userId}
            style={[
              styles.leaderboardRow,
              isMe && { backgroundColor: colors.primary + "10" },
            ]}
          >
            <Text style={styles.leaderboardRank}>{medal ?? `${index + 1}`}</Text>
            <View style={[styles.leaderboardAvatar, { backgroundColor: colors.primary + "20" }]}>
              <Text style={[styles.leaderboardAvatarText, { color: colors.primary }]}>
                {getInitials(member.name, member.email)}
              </Text>
            </View>
            <Text style={[styles.leaderboardName, { color: colors.foreground }]} numberOfLines={1}>
              {isMe ? "You" : (member.name ?? member.email ?? "?")}
            </Text>
            <View style={styles.leaderboardScoreWrap}>
              <Text style={[styles.leaderboardScore, {
                color: member.weeklyScore >= 80 ? colors.success : member.weeklyScore >= 50 ? colors.warning : colors.muted,
              }]}>
                {member.weeklyScore}%
              </Text>
              <Text style={[styles.leaderboardCheckins, { color: colors.muted }]}>
                {member.checkInsCount} check-ins
              </Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

// ─── Post Composer ────────────────────────────────────────────────────────────

function PostComposer({ teamId, myUserId, onPosted }: { teamId: number; myUserId?: number; onPosted: () => void }) {
  const colors = useColors();
  const [text, setText] = useState("");
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const utils = trpc.useUtils();

  const createPost = trpc.teamFeed.createPost.useMutation({
    onSuccess: () => {
      setText("");
      setImageUri(null);
      utils.teamFeed.list.invalidate({ teamId });
      onPosted();
    },
    onError: (err) => Alert.alert("Error", err.message),
    onSettled: () => setUploading(false),
  });

  const pickImage = useCallback(async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.8,
      base64: false,
    });
    if (!result.canceled && result.assets[0]) {
      setImageUri(result.assets[0].uri);
    }
  }, []);

  const handlePost = useCallback(async () => {
    if (!text.trim() && !imageUri) return;
    setUploading(true);

    if (imageUri) {
      // Upload image via server
      try {
        const filename = `team-post-${Date.now()}.jpg`;
        const formData = new FormData();
        formData.append("file", { uri: imageUri, name: filename, type: "image/jpeg" } as any);
        const apiBase = process.env.EXPO_PUBLIC_API_BASE_URL ?? "http://localhost:3000";
        const res = await fetch(`${apiBase}/api/upload-team-image`, {
          method: "POST",
          body: formData,
        });
        if (res.ok) {
          const { url } = await res.json();
          await createPost.mutateAsync({
            teamId,
            type: "photo",
            content: text.trim() || undefined,
            imageUrl: url,
          });
        } else {
          // Fallback: post as text only
          await createPost.mutateAsync({ teamId, type: "text", content: text.trim() });
        }
      } catch {
        await createPost.mutateAsync({ teamId, type: "text", content: text.trim() });
      }
    } else {
      await createPost.mutateAsync({ teamId, type: "text", content: text.trim() });
    }
  }, [text, imageUri, teamId, createPost]);

  return (
    <View style={[styles.composer, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={styles.composerRow}>
        <TextInput
          style={[styles.composerInput, { color: colors.foreground, backgroundColor: colors.background, borderColor: colors.border }]}
          placeholder="Share something with your team..."
          placeholderTextColor={colors.muted}
          value={text}
          onChangeText={setText}
          multiline
          maxLength={2000}
          returnKeyType="default"
        />
      </View>
      {imageUri && (
        <View style={styles.composerImagePreview}>
          <Image source={{ uri: imageUri }} style={styles.composerImage} />
          <TouchableOpacity
            style={[styles.composerImageRemove, { backgroundColor: colors.error }]}
            onPress={() => setImageUri(null)}
          >
            <IconSymbol name="xmark" size={12} color="#fff" />
          </TouchableOpacity>
        </View>
      )}
      <View style={styles.composerActions}>
        <TouchableOpacity style={styles.composerIconBtn} onPress={pickImage} activeOpacity={0.7}>
          <IconSymbol name="photo.fill" size={22} color={colors.primary} />
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.composerPostBtn,
            { backgroundColor: (text.trim() || imageUri) ? colors.primary : colors.border },
          ]}
          onPress={handlePost}
          disabled={uploading || (!text.trim() && !imageUri)}
          activeOpacity={0.8}
        >
          {uploading ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.composerPostBtnText}>Post</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Post Card ────────────────────────────────────────────────────────────────

type FeedPost = {
  id: number;
  userId: number;
  type: string;
  content: string | null;
  imageUrl: string | null;
  checkinScore: number | null;
  checkinDate: string | null;
  createdAt: Date | string;
  authorName: string | null;
  authorEmail: string | null;
  reactions: { postId: number; userId: number; emoji: string }[];
  comments: { id: number; postId: number; userId: number; content: string; createdAt: Date | string; authorName: string | null }[];
};

function PostCard({
  post,
  myUserId,
  teamId,
}: {
  post: FeedPost;
  myUserId?: number;
  teamId: number;
}) {
  const colors = useColors();
  const utils = trpc.useUtils();
  const [showComments, setShowComments] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [showReactionPicker, setShowReactionPicker] = useState(false);

  const toggleReaction = trpc.teamFeed.toggleReaction.useMutation({
    onSuccess: () => utils.teamFeed.list.invalidate({ teamId }),
  });
  const addComment = trpc.teamFeed.addComment.useMutation({
    onSuccess: () => { setCommentText(""); utils.teamFeed.list.invalidate({ teamId }); },
    onError: (err) => Alert.alert("Error", err.message),
  });
  const deletePost = trpc.teamFeed.deletePost.useMutation({
    onSuccess: () => utils.teamFeed.list.invalidate({ teamId }),
  });

  const displayName = post.authorName ?? post.authorEmail ?? "Unknown";
  const initials = getInitials(post.authorName, post.authorEmail);
  const isMyPost = post.userId === myUserId;

  // Group reactions by emoji
  const reactionGroups: Record<string, { count: number; myReaction: boolean }> = {};
  for (const r of post.reactions) {
    if (!reactionGroups[r.emoji]) reactionGroups[r.emoji] = { count: 0, myReaction: false };
    reactionGroups[r.emoji].count++;
    if (r.userId === myUserId) reactionGroups[r.emoji].myReaction = true;
  }

  const handleReact = (emoji: string) => {
    setShowReactionPicker(false);
    toggleReaction.mutate({ postId: post.id, emoji });
  };

  const handleDeletePost = () => {
    Alert.alert("Delete Post", "Remove this post from the feed?", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => deletePost.mutate({ postId: post.id }) },
    ]);
  };

  const handleComment = () => {
    if (!commentText.trim()) return;
    addComment.mutate({ postId: post.id, content: commentText.trim() });
  };

  return (
    <View style={[styles.postCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      {/* Post Header */}
      <View style={styles.postHeader}>
        <View style={[styles.postAvatar, { backgroundColor: colors.primary + "20" }]}>
          <Text style={[styles.postAvatarText, { color: colors.primary }]}>{initials}</Text>
        </View>
        <View style={styles.postMeta}>
          <Text style={[styles.postAuthor, { color: colors.foreground }]}>{displayName}</Text>
          <Text style={[styles.postTime, { color: colors.muted }]}>{timeAgo(post.createdAt)}</Text>
        </View>
        {isMyPost && (
          <TouchableOpacity onPress={handleDeletePost} style={styles.postMoreBtn} activeOpacity={0.7}>
            <IconSymbol name="trash" size={16} color={colors.muted} />
          </TouchableOpacity>
        )}
      </View>

      {/* Check-in badge */}
      {post.type === "checkin" && post.checkinScore !== null && (
        <View style={[styles.checkinBadge, { backgroundColor: post.checkinScore >= 80 ? colors.success + "20" : post.checkinScore >= 50 ? colors.warning + "20" : colors.error + "20" }]}>
          <Text style={styles.checkinBadgeEmoji}>✅</Text>
          <Text style={[styles.checkinBadgeText, { color: post.checkinScore >= 80 ? colors.success : post.checkinScore >= 50 ? colors.warning : colors.error }]}>
            Checked in · {post.checkinScore}%
          </Text>
        </View>
      )}

      {/* Content */}
      {post.content ? (
        <Text style={[styles.postContent, { color: colors.foreground }]}>{post.content}</Text>
      ) : null}

      {/* Image */}
      {post.imageUrl ? (
        <Image source={{ uri: post.imageUrl }} style={styles.postImage} resizeMode="cover" />
      ) : null}

      {/* Reactions row */}
      <View style={styles.reactionsRow}>
        {Object.entries(reactionGroups).map(([emoji, { count, myReaction }]) => (
          <TouchableOpacity
            key={emoji}
            style={[
              styles.reactionChip,
              { backgroundColor: myReaction ? colors.primary + "20" : colors.background, borderColor: myReaction ? colors.primary : colors.border },
            ]}
            onPress={() => handleReact(emoji)}
            activeOpacity={0.7}
          >
            <Text style={styles.reactionEmoji}>{emoji}</Text>
            <Text style={[styles.reactionCount, { color: myReaction ? colors.primary : colors.muted }]}>{count}</Text>
          </TouchableOpacity>
        ))}
        <TouchableOpacity
          style={[styles.reactionAddBtn, { borderColor: colors.border }]}
          onPress={() => setShowReactionPicker((v) => !v)}
          activeOpacity={0.7}
        >
          <Text style={styles.reactionAddText}>+</Text>
        </TouchableOpacity>
      </View>

      {/* Reaction picker */}
      {showReactionPicker && (
        <View style={[styles.reactionPicker, { backgroundColor: colors.background, borderColor: colors.border }]}>
          {REACTION_EMOJIS.map((emoji) => (
            <TouchableOpacity key={emoji} onPress={() => handleReact(emoji)} style={styles.reactionPickerEmoji} activeOpacity={0.7}>
              <Text style={styles.reactionPickerEmojiText}>{emoji}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Comments toggle */}
      <TouchableOpacity
        style={styles.commentsToggle}
        onPress={() => setShowComments((v) => !v)}
        activeOpacity={0.7}
      >
        <IconSymbol name="text.bubble.fill" size={14} color={colors.muted} />
        <Text style={[styles.commentsToggleText, { color: colors.muted }]}>
          {post.comments.length > 0 ? `${post.comments.length} comment${post.comments.length !== 1 ? "s" : ""}` : "Comment"}
        </Text>
      </TouchableOpacity>

      {/* Comments section */}
      {showComments && (
        <View style={[styles.commentsSection, { borderTopColor: colors.border }]}>
          {post.comments.map((c) => (
            <View key={c.id} style={styles.commentRow}>
              <View style={[styles.commentAvatar, { backgroundColor: colors.primary + "15" }]}>
                <Text style={[styles.commentAvatarText, { color: colors.primary }]}>
                  {getInitials(c.authorName, null)}
                </Text>
              </View>
              <View style={[styles.commentBubble, { backgroundColor: colors.background }]}>
                <Text style={[styles.commentAuthor, { color: colors.foreground }]}>
                  {c.userId === myUserId ? "You" : (c.authorName ?? "?")}
                </Text>
                <Text style={[styles.commentContent, { color: colors.foreground }]}>{c.content}</Text>
              </View>
            </View>
          ))}
          <View style={styles.commentInputRow}>
            <TextInput
              style={[styles.commentInput, { color: colors.foreground, backgroundColor: colors.background, borderColor: colors.border }]}
              placeholder="Add a comment..."
              placeholderTextColor={colors.muted}
              value={commentText}
              onChangeText={setCommentText}
              returnKeyType="send"
              onSubmitEditing={handleComment}
              maxLength={500}
            />
            <TouchableOpacity
              style={[styles.commentSendBtn, { backgroundColor: commentText.trim() ? colors.primary : colors.border }]}
              onPress={handleComment}
              disabled={!commentText.trim() || addComment.isPending}
              activeOpacity={0.8}
            >
              <IconSymbol name="paperplane.fill" size={14} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}

// ─── Share Goals Modal ────────────────────────────────────────────────────────

function ShareGoalsModal({ teamId, visible, onClose }: { teamId: number; visible: boolean; onClose: () => void }) {
  const colors = useColors();
  const { categories } = useApp();
  const utils = trpc.useUtils();
  const { data: currentShared } = trpc.sharedGoals.get.useQuery({ teamId }, { enabled: visible });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  React.useEffect(() => {
    if (currentShared) setSelected(new Set(currentShared));
  }, [currentShared]);

  const setMutation = trpc.sharedGoals.set.useMutation({
    onSuccess: () => { utils.sharedGoals.get.invalidate(); utils.teams.memberStats.invalidate(); onClose(); },
    onError: (err) => Alert.alert("Error", err.message),
    onSettled: () => setSaving(false),
  });

  const toggle = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const handleSave = useCallback(() => {
    setSaving(true);
    setMutation.mutate({ teamId, categoryClientIds: Array.from(selected) });
  }, [teamId, selected, setMutation]);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={[styles.modalSafeArea, { backgroundColor: colors.background }]} edges={["top", "left", "right"]}>
        <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
          <Text style={[styles.modalTitle, { color: colors.foreground }]}>Share Goals</Text>
          <TouchableOpacity onPress={onClose} style={[styles.modalCloseBtn, { backgroundColor: colors.surface }]} activeOpacity={0.7}>
            <IconSymbol name="xmark" size={18} color={colors.muted} />
          </TouchableOpacity>
        </View>
        <Text style={[styles.shareGoalsHint, { color: colors.muted }]}>
          Choose which goals teammates can see your progress on. Only your check-in scores are shared — not individual habit names.
        </Text>
        <FlatList
          data={categories}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: 16, gap: 8 }}
          renderItem={({ item }) => {
            const isSelected = selected.has(item.id);
            return (
              <TouchableOpacity
                style={[styles.goalToggleRow, { backgroundColor: colors.surface, borderColor: isSelected ? colors.primary : colors.border }]}
                onPress={() => toggle(item.id)}
                activeOpacity={0.75}
              >
                <Text style={styles.goalToggleEmoji}>{item.emoji}</Text>
                <Text style={[styles.goalToggleLabel, { color: colors.foreground }]}>{item.label}</Text>
                <View style={[styles.goalToggleCheck, { backgroundColor: isSelected ? colors.primary : "transparent", borderColor: isSelected ? colors.primary : colors.border }]}>
                  {isSelected && <IconSymbol name="checkmark" size={14} color="#fff" />}
                </View>
              </TouchableOpacity>
            );
          }}
        />
        <View style={[styles.modalFooter, { borderTopColor: colors.border }]}>
          <TouchableOpacity
            style={[styles.primaryBtn, { backgroundColor: saving ? colors.muted : colors.primary }]}
            onPress={handleSave}
            disabled={saving}
            activeOpacity={0.8}
          >
            {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Save</Text>}
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function TeamDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const teamId = parseInt(id ?? "0");
  const colors = useColors();
  const router = useRouter();
  const utils = trpc.useUtils();
  const [showShareGoals, setShowShareGoals] = useState(false);
  const [activeTab, setActiveTab] = useState<"feed" | "members">("feed");

  const { data: members, isLoading: membersLoading } = trpc.teams.members.useQuery({ teamId });
  const { data: myTeams } = trpc.teams.list.useQuery();
  const { data: me } = trpc.auth.me.useQuery();
  const { data: feed, isLoading: feedLoading, refetch: refetchFeed } = trpc.teamFeed.list.useQuery({ teamId });
  const myUserId = me?.id;

  const leaveMutation = trpc.teams.leave.useMutation({
    onSuccess: () => { utils.teams.list.invalidate(); router.back(); },
    onError: (err) => Alert.alert("Error", err.message),
  });
  const deleteMutation = trpc.teams.delete.useMutation({
    onSuccess: () => { utils.teams.list.invalidate(); router.back(); },
    onError: (err) => Alert.alert("Error", err.message),
  });

  const myTeam = myTeams?.find((t) => t.id === teamId);
  const isOwner = myTeam?.role === "owner";

  const handleLeave = useCallback(() => {
    Alert.alert("Leave Team", "Are you sure you want to leave this team?", [
      { text: "Cancel", style: "cancel" },
      { text: "Leave", style: "destructive", onPress: () => leaveMutation.mutate({ teamId }) },
    ]);
  }, [teamId, leaveMutation]);

  const handleDelete = useCallback(() => {
    Alert.alert("Delete Team", "This will permanently delete the team and remove all members. This cannot be undone.", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => deleteMutation.mutate({ teamId }) },
    ]);
  }, [teamId, deleteMutation]);

  return (
    <ScreenContainer>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.7}>
          <IconSymbol name="chevron.left" size={24} color={colors.primary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.foreground }]} numberOfLines={1}>
          {myTeam?.name ?? "Team"}
        </Text>
        <TouchableOpacity
          style={[styles.headerActionBtn, { backgroundColor: colors.primary + "15" }]}
          onPress={() => setShowShareGoals(true)}
          activeOpacity={0.7}
        >
          <IconSymbol name="lock.open.fill" size={18} color={colors.primary} />
        </TouchableOpacity>
      </View>

      {/* Join code row */}
      {myTeam?.joinCode && (
        <View style={[styles.joinCodeBar, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
          <Text style={[styles.joinCodeBarLabel, { color: colors.muted }]}>Invite code:</Text>
          <Text style={[styles.joinCodeBarValue, { color: colors.primary }]}>{myTeam.joinCode}</Text>
          <IconSymbol name="square.and.arrow.up" size={16} color={colors.muted} />
        </View>
      )}

      {/* Tabs */}
      <View style={[styles.tabs, { borderBottomColor: colors.border }]}>
        {(["feed", "members"] as const).map((tab) => (
          <TouchableOpacity
            key={tab}
            style={[styles.tab, activeTab === tab && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]}
            onPress={() => setActiveTab(tab)}
            activeOpacity={0.7}
          >
            <Text style={[styles.tabText, { color: activeTab === tab ? colors.primary : colors.muted }]}>
              {tab === "feed" ? "Feed" : "Members"}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

          {activeTab === "feed" && (
            <>
              {/* Streak Banner */}
              <TeamStreakBanner teamId={teamId} myUserId={myUserId} />

              {/* Leaderboard */}
              <WeeklyLeaderboard teamId={teamId} myUserId={myUserId} />

              {/* Post Composer */}
              <PostComposer teamId={teamId} myUserId={myUserId} onPosted={() => refetchFeed()} />

              {/* Feed */}
              {feedLoading ? (
                <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 24 }} />
              ) : !feed || feed.length === 0 ? (
                <View style={styles.emptyFeed}>
                  <Text style={styles.emptyFeedEmoji}>💬</Text>
                  <Text style={[styles.emptyFeedTitle, { color: colors.foreground }]}>No posts yet</Text>
                  <Text style={[styles.emptyFeedSub, { color: colors.muted }]}>Be the first to share something with your team!</Text>
                </View>
              ) : (
                <View style={styles.feedList}>
                  {(feed as FeedPost[]).map((post) => (
                    <PostCard key={post.id} post={post} myUserId={myUserId} teamId={teamId} />
                  ))}
                </View>
              )}
            </>
          )}

          {activeTab === "members" && (
            <>
              {membersLoading ? (
                <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 24 }} />
              ) : (
                <View style={styles.memberList}>
                  {(members ?? []).map((member) => {
                    const displayName = member.name ?? member.email ?? `User ${member.userId}`;
                    const initials = getInitials(member.name, member.email);
                    const isMe = member.userId === myUserId;
                    return (
                      <View key={member.userId} style={[styles.memberCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                        <View style={[styles.memberAvatar, { backgroundColor: colors.primary + "20" }]}>
                          <Text style={[styles.memberAvatarText, { color: colors.primary }]}>{initials}</Text>
                        </View>
                        <View style={styles.memberInfo}>
                          <Text style={[styles.memberName, { color: colors.foreground }]}>{displayName}</Text>
                          {member.email && member.name && (
                            <Text style={[styles.memberEmail, { color: colors.muted }]}>{member.email}</Text>
                          )}
                        </View>
                        <View style={styles.memberBadges}>
                          {isMe && (
                            <View style={[styles.badge, { backgroundColor: colors.primary + "20" }]}>
                              <Text style={[styles.badgeText, { color: colors.primary }]}>You</Text>
                            </View>
                          )}
                          {member.role === "owner" && (
                            <View style={[styles.badge, { backgroundColor: colors.warning + "20" }]}>
                              <Text style={[styles.badgeText, { color: colors.warning }]}>Owner</Text>
                            </View>
                          )}
                        </View>
                      </View>
                    );
                  })}
                </View>
              )}

              {/* Leave / Delete */}
              <View style={styles.dangerZone}>
                {!isOwner && (
                  <TouchableOpacity style={[styles.dangerBtn, { borderColor: colors.error + "60" }]} onPress={handleLeave} activeOpacity={0.7}>
                    <Text style={[styles.dangerBtnText, { color: colors.error }]}>Leave Team</Text>
                  </TouchableOpacity>
                )}
                {isOwner && (
                  <TouchableOpacity style={[styles.dangerBtn, { borderColor: colors.error + "60" }]} onPress={handleDelete} activeOpacity={0.7}>
                    <Text style={[styles.dangerBtnText, { color: colors.error }]}>Delete Team</Text>
                  </TouchableOpacity>
                )}
              </View>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      <ShareGoalsModal teamId={teamId} visible={showShareGoals} onClose={() => setShowShareGoals(false)} />
    </ScreenContainer>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 0.5, gap: 8 },
  backBtn: { padding: 4 },
  headerTitle: { flex: 1, fontSize: 18, fontWeight: "700" },
  headerActionBtn: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  joinCodeBar: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 16, paddingVertical: 8, borderBottomWidth: 0.5 },
  joinCodeBarLabel: { fontSize: 12 },
  joinCodeBarValue: { fontSize: 14, fontWeight: "700", letterSpacing: 2, flex: 1 },
  tabs: { flexDirection: "row", borderBottomWidth: 0.5 },
  tab: { flex: 1, paddingVertical: 12, alignItems: "center" },
  tabText: { fontSize: 14, fontWeight: "600" },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 40, gap: 12 },

  // Streak
  streakBanner: { borderRadius: 16, borderWidth: 1, padding: 16, flexDirection: "row", alignItems: "center", gap: 12 },
  streakLeft: { flexDirection: "row", alignItems: "center", gap: 10 },
  streakFire: { fontSize: 32 },
  streakCount: { fontSize: 22, fontWeight: "800" },
  streakLabel: { fontSize: 11, fontWeight: "600" },
  streakMembers: { flex: 1, flexDirection: "row", flexWrap: "wrap", gap: 8 },
  streakMemberDot: { alignItems: "center", gap: 3 },
  streakDot: { width: 10, height: 10, borderRadius: 5 },
  streakMemberName: { fontSize: 10, maxWidth: 40 },
  streakBadge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  streakBadgeText: { fontSize: 11, fontWeight: "700" },

  // Leaderboard
  leaderboard: { borderRadius: 16, borderWidth: 1, padding: 14, gap: 8 },
  leaderboardHeader: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 4 },
  leaderboardTitle: { fontSize: 14, fontWeight: "700" },
  leaderboardRow: { flexDirection: "row", alignItems: "center", gap: 10, borderRadius: 10, paddingVertical: 6, paddingHorizontal: 8 },
  leaderboardRank: { fontSize: 16, width: 28, textAlign: "center" },
  leaderboardAvatar: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  leaderboardAvatarText: { fontSize: 12, fontWeight: "700" },
  leaderboardName: { flex: 1, fontSize: 14, fontWeight: "600" },
  leaderboardScoreWrap: { alignItems: "flex-end" },
  leaderboardScore: { fontSize: 15, fontWeight: "700" },
  leaderboardCheckins: { fontSize: 10 },

  // Composer
  composer: { borderRadius: 16, borderWidth: 1, padding: 12, gap: 10 },
  composerRow: {},
  composerInput: { borderRadius: 12, borderWidth: 1, padding: 12, fontSize: 14, minHeight: 60, maxHeight: 120, lineHeight: 20 },
  composerImagePreview: { position: "relative", alignSelf: "flex-start" },
  composerImage: { width: 120, height: 90, borderRadius: 10 },
  composerImageRemove: { position: "absolute", top: -6, right: -6, width: 20, height: 20, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  composerActions: { flexDirection: "row", alignItems: "center", gap: 10 },
  composerIconBtn: { padding: 6 },
  composerPostBtn: { marginLeft: "auto", borderRadius: 20, paddingHorizontal: 20, paddingVertical: 8 },
  composerPostBtnText: { color: "#fff", fontWeight: "700", fontSize: 14 },

  // Feed
  emptyFeed: { alignItems: "center", paddingVertical: 40, gap: 8 },
  emptyFeedEmoji: { fontSize: 40 },
  emptyFeedTitle: { fontSize: 17, fontWeight: "700" },
  emptyFeedSub: { fontSize: 13, textAlign: "center", lineHeight: 18 },
  feedList: { gap: 12 },

  // Post Card
  postCard: { borderRadius: 16, borderWidth: 1, padding: 14, gap: 10 },
  postHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  postAvatar: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },
  postAvatarText: { fontSize: 13, fontWeight: "700" },
  postMeta: { flex: 1 },
  postAuthor: { fontSize: 14, fontWeight: "700" },
  postTime: { fontSize: 11 },
  postMoreBtn: { padding: 4 },
  checkinBadge: { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6, alignSelf: "flex-start" },
  checkinBadgeEmoji: { fontSize: 14 },
  checkinBadgeText: { fontSize: 13, fontWeight: "600" },
  postContent: { fontSize: 15, lineHeight: 22 },
  postImage: { width: "100%", height: 200, borderRadius: 12 },

  // Reactions
  reactionsRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  reactionChip: { flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 20, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 4 },
  reactionEmoji: { fontSize: 14 },
  reactionCount: { fontSize: 12, fontWeight: "600" },
  reactionAddBtn: { borderRadius: 20, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 4, alignItems: "center", justifyContent: "center" },
  reactionAddText: { fontSize: 16, fontWeight: "600", lineHeight: 20 },
  reactionPicker: { flexDirection: "row", borderRadius: 16, borderWidth: 1, padding: 8, gap: 4, alignSelf: "flex-start" },
  reactionPickerEmoji: { padding: 4 },
  reactionPickerEmojiText: { fontSize: 22 },

  // Comments
  commentsToggle: { flexDirection: "row", alignItems: "center", gap: 6 },
  commentsToggleText: { fontSize: 12, fontWeight: "600" },
  commentsSection: { borderTopWidth: 0.5, paddingTop: 10, gap: 8 },
  commentRow: { flexDirection: "row", gap: 8, alignItems: "flex-start" },
  commentAvatar: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  commentAvatarText: { fontSize: 10, fontWeight: "700" },
  commentBubble: { flex: 1, borderRadius: 12, padding: 10 },
  commentAuthor: { fontSize: 12, fontWeight: "700", marginBottom: 2 },
  commentContent: { fontSize: 13, lineHeight: 18 },
  commentInputRow: { flexDirection: "row", gap: 8, alignItems: "center" },
  commentInput: { flex: 1, borderRadius: 20, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 8, fontSize: 13 },
  commentSendBtn: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },

  // Members tab
  memberList: { gap: 10 },
  memberCard: { flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 14, borderWidth: 1, padding: 14 },
  memberAvatar: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  memberAvatarText: { fontSize: 16, fontWeight: "700" },
  memberInfo: { flex: 1 },
  memberName: { fontSize: 15, fontWeight: "600" },
  memberEmail: { fontSize: 12, marginTop: 2 },
  memberBadges: { flexDirection: "row", gap: 4 },
  badge: { borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  badgeText: { fontSize: 10, fontWeight: "700" },

  // Danger
  dangerZone: { marginTop: 32, gap: 10 },
  dangerBtn: { borderRadius: 12, borderWidth: 1, paddingVertical: 14, alignItems: "center" },
  dangerBtnText: { fontWeight: "600", fontSize: 15 },

  // Share Goals Modal
  modalSafeArea: { flex: 1 },
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 20, borderBottomWidth: 0.5 },
  modalTitle: { fontSize: 20, fontWeight: "700" },
  modalCloseBtn: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  shareGoalsHint: { fontSize: 13, lineHeight: 18, paddingHorizontal: 16, paddingTop: 12 },
  goalToggleRow: { flexDirection: "row", alignItems: "center", borderRadius: 12, borderWidth: 1, padding: 14, gap: 10 },
  goalToggleEmoji: { fontSize: 22 },
  goalToggleLabel: { flex: 1, fontSize: 15, fontWeight: "600" },
  goalToggleCheck: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  modalFooter: { padding: 16, borderTopWidth: 0.5 },
  primaryBtn: { borderRadius: 14, paddingVertical: 14, alignItems: "center" },
  primaryBtnText: { color: "#fff", fontWeight: "700", fontSize: 16 },
});
