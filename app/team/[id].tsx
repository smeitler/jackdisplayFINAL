import React, { useState, useCallback } from "react";
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
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";
import { useApp } from "@/lib/app-context";

// ─── Member Stats Card ────────────────────────────────────────────────────────

function MemberStatsCard({ teamId, member, isCurrentUser }: {
  teamId: number;
  member: { userId: number; name: string | null; email: string | null; role: string };
  isCurrentUser: boolean;
}) {
  const colors = useColors();
  const { data: stats, isLoading } = trpc.teams.memberStats.useQuery(
    { teamId, memberId: member.userId },
    { enabled: !isCurrentUser }
  );
  const { categories } = useApp();

  const displayName = member.name ?? member.email ?? `User ${member.userId}`;
  const initials = displayName.slice(0, 2).toUpperCase();

  const ScorePill = ({ label, score }: { label: string; score: number | null }) => {
    if (score === null) return null;
    const bg = score >= 80 ? colors.success + "25" : score >= 50 ? colors.warning + "25" : colors.error + "25";
    const fg = score >= 80 ? colors.success : score >= 50 ? colors.warning : colors.error;
    return (
      <View style={[styles.scorePill, { backgroundColor: bg }]}>
        <Text style={[styles.scorePillLabel, { color: colors.muted }]}>{label}</Text>
        <Text style={[styles.scorePillValue, { color: fg }]}>{score}%</Text>
      </View>
    );
  };

  return (
    <View style={[styles.memberCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={styles.memberCardHeader}>
        <View style={[styles.avatarCircle, { backgroundColor: colors.primary + "25" }]}>
          <Text style={[styles.avatarText, { color: colors.primary }]}>{initials}</Text>
        </View>
        <View style={styles.memberInfo}>
          <View style={styles.memberNameRow}>
            <Text style={[styles.memberName, { color: colors.foreground }]}>{displayName}</Text>
            {isCurrentUser && (
              <View style={[styles.youBadge, { backgroundColor: colors.primary + "20" }]}>
                <Text style={[styles.youBadgeText, { color: colors.primary }]}>You</Text>
              </View>
            )}
            {member.role === "owner" && (
              <View style={[styles.ownerBadge, { backgroundColor: colors.warning + "20" }]}>
                <Text style={[styles.ownerBadgeText, { color: colors.warning }]}>Owner</Text>
              </View>
            )}
          </View>
          {member.email && member.name && (
            <Text style={[styles.memberEmail, { color: colors.muted }]}>{member.email}</Text>
          )}
        </View>
      </View>

      {isCurrentUser ? (
        <Text style={[styles.memberHint, { color: colors.muted }]}>Your stats are visible to teammates based on your shared goals.</Text>
      ) : isLoading ? (
        <ActivityIndicator size="small" color={colors.primary} style={{ marginTop: 8 }} />
      ) : !stats ? null : (
        <>
          {stats.sharedGoals && Array.isArray(stats.sharedGoals) && stats.sharedGoals.length > 0 ? (
            <>
              <View style={styles.sharedGoalChips}>
                {(stats.sharedGoals as { clientId: string; label: string; emoji: string }[]).map((g) => (
                  <View key={g.clientId} style={[styles.goalChip, { backgroundColor: colors.primary + "15", borderColor: colors.primary + "30" }]}>
                    <Text style={styles.goalChipText}>{g.emoji} {g.label}</Text>
                  </View>
                ))}
              </View>
              <View style={styles.scoreRow}>
                <ScorePill label="Yesterday" score={stats.yesterdayScore} />
                <ScorePill label="7 Days" score={stats.sevenDayScore} />
                <ScorePill label="30 Days" score={stats.thirtyDayScore} />
              </View>
              {stats.yesterdayScore === null && stats.sevenDayScore === null && (
                <Text style={[styles.memberHint, { color: colors.muted }]}>No check-ins yet this period.</Text>
              )}
            </>
          ) : (
            <Text style={[styles.memberHint, { color: colors.muted }]}>This member hasn't shared any goals with this team yet.</Text>
          )}
        </>
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
      <View style={[styles.modalContainer, { backgroundColor: colors.background }]}>
        <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
          <Text style={[styles.modalTitle, { color: colors.foreground }]}>Share Goals</Text>
          <TouchableOpacity onPress={onClose} style={styles.modalCloseBtn} activeOpacity={0.7}>
            <IconSymbol name="xmark" size={20} color={colors.muted} />
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
      </View>
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

  const { data: members, isLoading } = trpc.teams.members.useQuery({ teamId });
  const { data: myTeams } = trpc.teams.list.useQuery();
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

  // Get current user's userId from members list
  const { data: me } = trpc.auth.me.useQuery();
  const myUserId = me?.id;

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
        <View style={styles.headerActions}>
          <TouchableOpacity
            style={[styles.headerActionBtn, { backgroundColor: colors.primary + "15" }]}
            onPress={() => router.push({ pathname: "/team/chat/[id]" as any, params: { id: String(teamId) } })}
            activeOpacity={0.7}
          >
            <IconSymbol name="bubble.left.fill" size={18} color={colors.primary} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Team info */}
        {myTeam?.description ? (
          <Text style={[styles.teamDesc, { color: colors.muted }]}>{myTeam.description}</Text>
        ) : null}

        {myTeam?.joinCode ? (
          <View style={[styles.joinCodeRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.joinCodeLabel, { color: colors.muted }]}>Join Code</Text>
            <Text style={[styles.joinCodeValue, { color: colors.primary }]}>{myTeam.joinCode}</Text>
          </View>
        ) : null}

        {/* Share Goals Button */}
        <TouchableOpacity
          style={[styles.shareGoalsBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
          onPress={() => setShowShareGoals(true)}
          activeOpacity={0.75}
        >
          <IconSymbol name="lock.open.fill" size={18} color={colors.primary} />
          <Text style={[styles.shareGoalsBtnText, { color: colors.foreground }]}>Manage Shared Goals</Text>
          <IconSymbol name="chevron.right" size={16} color={colors.muted} />
        </TouchableOpacity>

        {/* Members */}
        <Text style={[styles.sectionTitle, { color: colors.muted }]}>MEMBERS</Text>

        {isLoading ? (
          <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 24 }} />
        ) : (
          <View style={styles.memberList}>
            {(members ?? []).map((member) => (
              <MemberStatsCard
                key={member.userId}
                teamId={teamId}
                member={member as { userId: number; name: string | null; email: string | null; role: string }}
                isCurrentUser={member.userId === myUserId}
              />
            ))}
          </View>
        )}

        {/* Leave / Delete */}
        <View style={styles.dangerZone}>
          {!isOwner && (
            <TouchableOpacity
              style={[styles.dangerBtn, { borderColor: colors.error + "60" }]}
              onPress={handleLeave}
              activeOpacity={0.7}
            >
              <Text style={[styles.dangerBtnText, { color: colors.error }]}>Leave Team</Text>
            </TouchableOpacity>
          )}
          {isOwner && (
            <TouchableOpacity
              style={[styles.dangerBtn, { borderColor: colors.error + "60" }]}
              onPress={handleDelete}
              activeOpacity={0.7}
            >
              <Text style={[styles.dangerBtnText, { color: colors.error }]}>Delete Team</Text>
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>

      <ShareGoalsModal teamId={teamId} visible={showShareGoals} onClose={() => setShowShareGoals(false)} />
    </ScreenContainer>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 0.5, gap: 8 },
  backBtn: { padding: 4 },
  headerTitle: { flex: 1, fontSize: 18, fontWeight: "700" },
  headerActions: { flexDirection: "row", gap: 8 },
  headerActionBtn: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 40 },
  teamDesc: { fontSize: 14, lineHeight: 20, marginBottom: 12 },
  joinCodeRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderRadius: 12, borderWidth: 1, padding: 14, marginBottom: 12 },
  joinCodeLabel: { fontSize: 13, fontWeight: "600" },
  joinCodeValue: { fontSize: 18, fontWeight: "700", letterSpacing: 3 },
  shareGoalsBtn: { flexDirection: "row", alignItems: "center", gap: 10, borderRadius: 12, borderWidth: 1, padding: 14, marginBottom: 20 },
  shareGoalsBtnText: { flex: 1, fontSize: 15, fontWeight: "600" },
  sectionTitle: { fontSize: 11, fontWeight: "700", letterSpacing: 1, marginBottom: 10 },
  memberList: { gap: 10 },
  memberCard: { borderRadius: 14, borderWidth: 1, padding: 14 },
  memberCardHeader: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 8 },
  avatarCircle: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  avatarText: { fontSize: 16, fontWeight: "700" },
  memberInfo: { flex: 1 },
  memberNameRow: { flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" },
  memberName: { fontSize: 15, fontWeight: "600" },
  memberEmail: { fontSize: 12, marginTop: 2 },
  youBadge: { borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  youBadgeText: { fontSize: 10, fontWeight: "700" },
  ownerBadge: { borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  ownerBadgeText: { fontSize: 10, fontWeight: "700" },
  memberHint: { fontSize: 12, lineHeight: 18, marginTop: 4 },
  sharedGoalChips: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 10 },
  goalChip: { borderRadius: 8, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 4 },
  goalChipText: { fontSize: 12, fontWeight: "600" },
  scoreRow: { flexDirection: "row", gap: 8 },
  scorePill: { flex: 1, borderRadius: 10, padding: 8, alignItems: "center", gap: 2 },
  scorePillLabel: { fontSize: 10, fontWeight: "600" },
  scorePillValue: { fontSize: 16, fontWeight: "700" },
  dangerZone: { marginTop: 32, gap: 10 },
  dangerBtn: { borderRadius: 12, borderWidth: 1, paddingVertical: 14, alignItems: "center" },
  dangerBtnText: { fontWeight: "600", fontSize: 15 },
  // Share Goals Modal
  modalContainer: { flex: 1 },
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 20, borderBottomWidth: 0.5 },
  modalTitle: { fontSize: 20, fontWeight: "700" },
  modalCloseBtn: { padding: 4 },
  shareGoalsHint: { fontSize: 13, lineHeight: 18, paddingHorizontal: 16, paddingTop: 12 },
  goalToggleRow: { flexDirection: "row", alignItems: "center", borderRadius: 12, borderWidth: 1, padding: 14, gap: 10 },
  goalToggleEmoji: { fontSize: 22 },
  goalToggleLabel: { flex: 1, fontSize: 15, fontWeight: "600" },
  goalToggleCheck: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  modalFooter: { padding: 16, borderTopWidth: 0.5 },
  primaryBtn: { borderRadius: 14, paddingVertical: 14, alignItems: "center" },
  primaryBtnText: { color: "#fff", fontWeight: "700", fontSize: 16 },
});
