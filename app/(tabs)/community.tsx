import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Modal,
  ActivityIndicator,
  Alert,
  StyleSheet,
  Share,
  Platform,
} from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";
import { useRouter } from "expo-router";

// ─── Types ────────────────────────────────────────────────────────────────────

type TeamItem = {
  id: number;
  name: string;
  description: string | null;
  joinCode: string;
  creatorId: number;
  role: "owner" | "member";
};

// ─── Referral Banner ──────────────────────────────────────────────────────────

function ReferralBanner() {
  const colors = useColors();
  const { data: stats, isLoading } = trpc.referrals.stats.useQuery();
  const utils = trpc.useUtils();
  const [codeInput, setCodeInput] = useState("");
  const [applyingCode, setApplyingCode] = useState(false);
  const useCodeMutation = trpc.referrals.useCode.useMutation({
    onSuccess: (applied) => {
      if (applied) {
        Alert.alert("Success!", "Referral code applied. 6 months of credit added!");
      } else {
        Alert.alert("Not Applied", "This code may already have been used or is invalid.");
      }
      setCodeInput("");
      utils.referrals.stats.invalidate();
    },
    onError: (err) => Alert.alert("Error", err.message),
    onSettled: () => setApplyingCode(false),
  });

  const handleShare = useCallback(async () => {
    if (!stats?.referralCode) return;
    const message = `Join me on Jack — the daily alarm + habit check-in app! Use my referral code ${stats.referralCode} to get 6 months free. Download at https://jackalarm.com`;
    if (Platform.OS === "web") {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(stats.referralCode);
        Alert.alert("Copied!", `Your referral code ${stats.referralCode} has been copied to clipboard.`);
      }
    } else {
      await Share.share({ message });
    }
  }, [stats?.referralCode]);

  const handleApplyCode = useCallback(() => {
    const code = codeInput.trim();
    if (!code) return;
    setApplyingCode(true);
    useCodeMutation.mutate({ referralCode: code });
  }, [codeInput, useCodeMutation]);

  return (
    <View style={[styles.referralCard, { backgroundColor: colors.primary + "18", borderColor: colors.primary + "40" }]}>
      <View style={styles.referralHeader}>
        <IconSymbol name="gift.fill" size={20} color={colors.primary} />
        <Text style={[styles.referralTitle, { color: colors.foreground }]}>Refer a Friend</Text>
        <Text style={[styles.referralSubtitle, { color: colors.muted }]}>Earn 6 months free per referral</Text>
      </View>

      {isLoading ? (
        <ActivityIndicator size="small" color={colors.primary} style={{ marginVertical: 8 }} />
      ) : (
        <>
          <View style={styles.referralCodeRow}>
            <View style={[styles.referralCodeBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.referralCodeText, { color: colors.primary }]}>{stats?.referralCode ?? "—"}</Text>
            </View>
            <TouchableOpacity
              style={[styles.referralShareBtn, { backgroundColor: colors.primary }]}
              onPress={handleShare}
              activeOpacity={0.8}
            >
              <IconSymbol name="square.and.arrow.up" size={16} color="#fff" />
              <Text style={styles.referralShareBtnText}>Share</Text>
            </TouchableOpacity>
          </View>

          {(stats?.totalReferrals ?? 0) > 0 && (
            <Text style={[styles.referralStats, { color: colors.muted }]}>
              {stats!.totalReferrals} friend{stats!.totalReferrals !== 1 ? "s" : ""} referred · {stats!.totalCreditMonths} months earned
            </Text>
          )}

          <View style={styles.applyCodeRow}>
            <TextInput
              style={[styles.applyCodeInput, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground }]}
              placeholder="Enter a friend's code"
              placeholderTextColor={colors.muted}
              value={codeInput}
              onChangeText={setCodeInput}
              autoCapitalize="characters"
              returnKeyType="done"
              onSubmitEditing={handleApplyCode}
            />
            <TouchableOpacity
              style={[styles.applyCodeBtn, { backgroundColor: applyingCode ? colors.muted : colors.primary + "20", borderColor: colors.primary + "60" }]}
              onPress={handleApplyCode}
              disabled={applyingCode || !codeInput.trim()}
              activeOpacity={0.7}
            >
              {applyingCode ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Text style={[styles.applyCodeBtnText, { color: colors.primary }]}>Apply</Text>
              )}
            </TouchableOpacity>
          </View>
        </>
      )}
    </View>
  );
}

// ─── Team Card ────────────────────────────────────────────────────────────────

function TeamCard({ team, onPress }: { team: TeamItem; onPress: () => void }) {
  const colors = useColors();
  return (
    <TouchableOpacity
      style={[styles.teamCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
      onPress={onPress}
      activeOpacity={0.75}
    >
      <View style={[styles.teamIconCircle, { backgroundColor: colors.primary + "20" }]}>
        <IconSymbol name="person.3.fill" size={20} color={colors.primary} />
      </View>
      <View style={styles.teamCardContent}>
        <Text style={[styles.teamCardName, { color: colors.foreground }]}>{team.name}</Text>
        {team.description ? (
          <Text style={[styles.teamCardDesc, { color: colors.muted }]} numberOfLines={1}>{team.description}</Text>
        ) : null}
        <Text style={[styles.teamCardCode, { color: colors.muted }]}>Code: {team.joinCode}</Text>
      </View>
      <View style={styles.teamCardRight}>
        {team.role === "owner" && (
          <View style={[styles.ownerBadge, { backgroundColor: colors.primary + "20" }]}>
            <Text style={[styles.ownerBadgeText, { color: colors.primary }]}>Owner</Text>
          </View>
        )}
        <IconSymbol name="chevron.right" size={18} color={colors.muted} />
      </View>
    </TouchableOpacity>
  );
}

// ─── Create / Join Modal ──────────────────────────────────────────────────────

function CreateJoinModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const colors = useColors();
  const utils = trpc.useUtils();
  const [tab, setTab] = useState<"create" | "join">("create");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [loading, setLoading] = useState(false);

  const createMutation = trpc.teams.create.useMutation({
    onSuccess: () => { utils.teams.list.invalidate(); onClose(); setName(""); setDescription(""); },
    onError: (err) => Alert.alert("Error", err.message),
    onSettled: () => setLoading(false),
  });

  const joinMutation = trpc.teams.join.useMutation({
    onSuccess: () => { utils.teams.list.invalidate(); onClose(); setJoinCode(""); },
    onError: (err) => Alert.alert("Error", err.message),
    onSettled: () => setLoading(false),
  });

  const handleCreate = useCallback(() => {
    if (!name.trim()) { Alert.alert("Required", "Please enter a team name."); return; }
    setLoading(true);
    createMutation.mutate({ name: name.trim(), description: description.trim() || undefined });
  }, [name, description, createMutation]);

  const handleJoin = useCallback(() => {
    if (!joinCode.trim()) { Alert.alert("Required", "Please enter a join code."); return; }
    setLoading(true);
    joinMutation.mutate({ joinCode: joinCode.trim().toUpperCase() });
  }, [joinCode, joinMutation]);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[styles.modalContainer, { backgroundColor: colors.background }]}>
        {/* Header */}
        <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
          <Text style={[styles.modalTitle, { color: colors.foreground }]}>Teams</Text>
          <TouchableOpacity onPress={onClose} style={styles.modalCloseBtn} activeOpacity={0.7}>
            <IconSymbol name="xmark" size={20} color={colors.muted} />
          </TouchableOpacity>
        </View>

        {/* Tab switcher */}
        <View style={[styles.tabRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {(["create", "join"] as const).map((t) => (
            <TouchableOpacity
              key={t}
              style={[styles.tabBtn, tab === t && { backgroundColor: colors.primary }]}
              onPress={() => setTab(t)}
              activeOpacity={0.8}
            >
              <Text style={[styles.tabBtnText, { color: tab === t ? "#fff" : colors.muted }]}>
                {t === "create" ? "Create Team" : "Join Team"}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <ScrollView style={styles.modalBody} keyboardShouldPersistTaps="handled">
          {tab === "create" ? (
            <View style={styles.formGroup}>
              <Text style={[styles.formLabel, { color: colors.muted }]}>Team Name *</Text>
              <TextInput
                style={[styles.formInput, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground }]}
                placeholder="e.g. Morning Warriors"
                placeholderTextColor={colors.muted}
                value={name}
                onChangeText={setName}
                maxLength={100}
                returnKeyType="next"
              />
              <Text style={[styles.formLabel, { color: colors.muted, marginTop: 16 }]}>Description (optional)</Text>
              <TextInput
                style={[styles.formInput, styles.formTextarea, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground }]}
                placeholder="What is this team about?"
                placeholderTextColor={colors.muted}
                value={description}
                onChangeText={setDescription}
                maxLength={500}
                multiline
                numberOfLines={3}
                returnKeyType="done"
              />
              <TouchableOpacity
                style={[styles.primaryBtn, { backgroundColor: loading ? colors.muted : colors.primary }]}
                onPress={handleCreate}
                disabled={loading}
                activeOpacity={0.8}
              >
                {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Create Team</Text>}
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.formGroup}>
              <Text style={[styles.formLabel, { color: colors.muted }]}>Join Code</Text>
              <Text style={[styles.formHint, { color: colors.muted }]}>Ask your team owner for the 8-character code.</Text>
              <TextInput
                style={[styles.formInput, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground, letterSpacing: 4, textAlign: "center", fontSize: 20, fontWeight: "700" }]}
                placeholder="XXXXXXXX"
                placeholderTextColor={colors.muted}
                value={joinCode}
                onChangeText={(t) => setJoinCode(t.toUpperCase())}
                maxLength={12}
                autoCapitalize="characters"
                returnKeyType="done"
                onSubmitEditing={handleJoin}
              />
              <TouchableOpacity
                style={[styles.primaryBtn, { backgroundColor: loading ? colors.muted : colors.primary }]}
                onPress={handleJoin}
                disabled={loading}
                activeOpacity={0.8}
              >
                {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Join Team</Text>}
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function CommunityScreen() {
  const colors = useColors();
  const router = useRouter();
  const [showModal, setShowModal] = useState(false);

  const { data: teams, isLoading, refetch } = trpc.teams.list.useQuery();

  return (
    <ScreenContainer>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.pageHeader}>
          <Text style={[styles.pageTitle, { color: colors.foreground }]}>Community</Text>
          <TouchableOpacity
            style={[styles.addBtn, { backgroundColor: colors.primary }]}
            onPress={() => setShowModal(true)}
            activeOpacity={0.8}
          >
            <IconSymbol name="plus" size={18} color="#fff" />
            <Text style={styles.addBtnText}>Team</Text>
          </TouchableOpacity>
        </View>

        {/* Referral Banner */}
        <ReferralBanner />

        {/* Teams Section */}
        <Text style={[styles.sectionTitle, { color: colors.muted }]}>MY TEAMS</Text>

        {isLoading ? (
          <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 32 }} />
        ) : !teams || teams.length === 0 ? (
          <View style={[styles.emptyState, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <IconSymbol name="person.3.fill" size={40} color={colors.muted} />
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No teams yet</Text>
            <Text style={[styles.emptySubtitle, { color: colors.muted }]}>
              Create a team to hold each other accountable, or join one with a code from a friend.
            </Text>
            <TouchableOpacity
              style={[styles.primaryBtn, { backgroundColor: colors.primary, marginTop: 16, alignSelf: "stretch" }]}
              onPress={() => setShowModal(true)}
              activeOpacity={0.8}
            >
              <Text style={styles.primaryBtnText}>Create or Join a Team</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.teamList}>
            {(teams as TeamItem[]).map((team) => (
              <TeamCard
                key={team.id}
                team={team}
                onPress={() => router.push({ pathname: "/team/[id]", params: { id: String(team.id) } })}
              />
            ))}
          </View>
        )}
      </ScrollView>

      <CreateJoinModal visible={showModal} onClose={() => setShowModal(false)} />
    </ScreenContainer>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 32 },
  pageHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 16 },
  pageTitle: { fontSize: 28, fontWeight: "700" },
  addBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20 },
  addBtnText: { color: "#fff", fontWeight: "600", fontSize: 14 },

  // Referral
  referralCard: { borderRadius: 16, borderWidth: 1, padding: 16, marginBottom: 24 },
  referralHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 },
  referralTitle: { fontSize: 16, fontWeight: "700", flex: 1 },
  referralSubtitle: { fontSize: 12 },
  referralCodeRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 8 },
  referralCodeBox: { flex: 1, borderRadius: 10, borderWidth: 1, paddingVertical: 10, paddingHorizontal: 14 },
  referralCodeText: { fontSize: 18, fontWeight: "700", letterSpacing: 3 },
  referralShareBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10 },
  referralShareBtnText: { color: "#fff", fontWeight: "600", fontSize: 14 },
  referralStats: { fontSize: 12, marginBottom: 12 },
  applyCodeRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4 },
  applyCodeInput: { flex: 1, borderRadius: 10, borderWidth: 1, paddingVertical: 8, paddingHorizontal: 12, fontSize: 14 },
  applyCodeBtn: { borderRadius: 10, borderWidth: 1, paddingVertical: 8, paddingHorizontal: 14 },
  applyCodeBtnText: { fontWeight: "600", fontSize: 14 },

  // Section
  sectionTitle: { fontSize: 11, fontWeight: "700", letterSpacing: 1, marginBottom: 10, marginTop: 4 },

  // Empty
  emptyState: { borderRadius: 16, borderWidth: 1, padding: 24, alignItems: "center", gap: 8, width: "100%" },
  emptyTitle: { fontSize: 18, fontWeight: "700", marginTop: 8 },
  emptySubtitle: { fontSize: 14, textAlign: "center", lineHeight: 20 },

  // Team list
  teamList: { gap: 10 },
  teamCard: { flexDirection: "row", alignItems: "center", borderRadius: 14, borderWidth: 1, padding: 14, gap: 12 },
  teamIconCircle: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  teamCardContent: { flex: 1, gap: 2 },
  teamCardName: { fontSize: 16, fontWeight: "600" },
  teamCardDesc: { fontSize: 13 },
  teamCardCode: { fontSize: 12 },
  teamCardRight: { alignItems: "center", gap: 4 },
  ownerBadge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 },
  ownerBadgeText: { fontSize: 11, fontWeight: "700" },

  // Modal
  modalContainer: { flex: 1 },
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 20, borderBottomWidth: 0.5 },
  modalTitle: { fontSize: 20, fontWeight: "700" },
  modalCloseBtn: { padding: 8, borderRadius: 20, backgroundColor: "rgba(128,128,128,0.15)" },
  tabRow: { flexDirection: "row", margin: 16, borderRadius: 12, borderWidth: 1, padding: 4 },
  tabBtn: { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: "center" },
  tabBtnText: { fontWeight: "600", fontSize: 14 },
  modalBody: { flex: 1 },
  formGroup: { padding: 16, gap: 4 },
  formLabel: { fontSize: 12, fontWeight: "600", letterSpacing: 0.5, marginBottom: 4 },
  formHint: { fontSize: 12, marginBottom: 8 },
  formInput: { borderRadius: 12, borderWidth: 1, paddingVertical: 12, paddingHorizontal: 14, fontSize: 16 },
  formTextarea: { minHeight: 80, textAlignVertical: "top" },
  primaryBtn: { borderRadius: 14, paddingVertical: 14, alignItems: "center", marginTop: 24 },
  primaryBtnText: { color: "#fff", fontWeight: "700", fontSize: 16 },
});
