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
  Linking,
  Animated,
  Easing,
} from "react-native";
import { useContentMaxWidth } from "@/hooks/use-is-ipad";
import { ScreenContainer } from "@/components/screen-container";
import { SafeAreaView } from "react-native-safe-area-context";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";
import { useRouter } from "expo-router";
import { useApp } from "@/lib/app-context";
import { useIsCalm } from "@/components/calm-effects";
import CoachApplyModal from "@/app/coach-apply";

// ─── Types ────────────────────────────────────────────────────────────────────

type TeamItem = {
  id: number;
  name: string;
  description: string | null;
  joinCode: string;
  creatorId: number;
  role: "owner" | "member";
};

// ─── Coach Upsell Card ───────────────────────────────────────────────────────

const COACH_URL = "https://jackalarm.com/coach"; // TODO: replace with your landing page

function CoachCard() {
  const colors = useColors();
  const pulseAnim = React.useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1, duration: 1800, easing: Easing.inOut(Easing.sin), useNativeDriver: false }),
        Animated.timing(pulseAnim, { toValue: 0, duration: 1800, easing: Easing.inOut(Easing.sin), useNativeDriver: false }),
      ])
    ).start();
  }, []);

  const glowOpacity = pulseAnim.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0.85] });
  const glowRadius = pulseAnim.interpolate({ inputRange: [0, 1], outputRange: [8, 20] });

  const handlePress = () => {
    Linking.openURL(COACH_URL).catch(() =>
      Alert.alert("Coming Soon", "The coaching page will be available shortly.")
    );
  };

  return (
    <TouchableOpacity onPress={handlePress} activeOpacity={0.85} style={{ marginBottom: 20 }}>
      <Animated.View
        style={[
          styles.coachCard,
          {
            borderColor: glowOpacity.interpolate({ inputRange: [0.35, 0.85], outputRange: ["rgba(251,191,36,0.5)", "rgba(251,191,36,1)"] }),
            shadowColor: "#FBBF24",
            shadowOpacity: glowOpacity as unknown as number,
            shadowRadius: glowRadius as unknown as number,
            shadowOffset: { width: 0, height: 0 },
            elevation: 8,
          },
        ]}
      >
        {/* Badge */}
        <View style={styles.coachBadgeRow}>
          <View style={styles.coachBadge}>
            <Text style={styles.coachBadgeText}>8-WEEK SPRINT</Text>
          </View>
          <View style={styles.coachLimitBadge}>
            <Text style={styles.coachLimitText}>LIMITED SPOTS</Text>
          </View>
        </View>

        {/* Headline */}
        <Text style={styles.coachHeadline}>Accountability Coach</Text>
        <Text style={styles.coachSubheadline}>Daily voice feedback based on your actual app data.</Text>

        {/* Feature bullets */}
        <View style={styles.coachFeatures}>
          <View style={styles.coachFeatureRow}>
            <View style={styles.coachFeatureDot} />
            <Text style={styles.coachFeatureText}>Daily 1–3 min voice memo from your coach (Mon–Fri)</Text>
          </View>
          <View style={styles.coachFeatureRow}>
            <View style={styles.coachFeatureDot} />
            <Text style={styles.coachFeatureText}>Weekly strategy note — what to fix, where to push harder</Text>
          </View>
          <View style={styles.coachFeatureRow}>
            <View style={styles.coachFeatureDot} />
            <Text style={styles.coachFeatureText}>No Zoom calls. No scheduling. Real feedback in your ear every day.</Text>
          </View>
          <View style={styles.coachFeatureRow}>
            <View style={styles.coachFeatureDot} />
            <Text style={styles.coachFeatureText}>Coach responds within 24 business hours to your check-ins</Text>
          </View>
        </View>

        <View style={styles.coachBtn}>
          <Text style={styles.coachBtnText}>Get Your Coach  →</Text>
        </View>
      </Animated.View>
    </TouchableOpacity>
  );
}

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
  const { data: rankData } = trpc.teams.myRank.useQuery({ teamId: team.id });

  const rankLabel = rankData
    ? `#${rankData.rank} of ${rankData.total}`
    : null;

  const rankEmoji =
    rankData?.rank === 1 ? "🥇" :
    rankData?.rank === 2 ? "🥈" :
    rankData?.rank === 3 ? "🥉" : null;

  const scoreColor =
    (rankData?.weeklyScore ?? 0) >= 70 ? "#22C55E" :
    (rankData?.weeklyScore ?? 0) >= 40 ? "#F59E0B" : colors.muted;

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
        {rankData && (
          <View style={styles.rankBadge}>
            {rankEmoji ? (
              <Text style={styles.rankEmoji}>{rankEmoji}</Text>
            ) : null}
            <Text style={[styles.rankLabel, { color: scoreColor }]}>{rankLabel}</Text>
            <Text style={[styles.rankScore, { color: scoreColor }]}>{rankData.weeklyScore}%</Text>
          </View>
        )}
        {team.role === "owner" && !rankData && (
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
      <SafeAreaView style={[styles.modalContainer, { backgroundColor: colors.background }]} edges={["top", "left", "right"]}>
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
      </SafeAreaView>
    </Modal>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

// Demo mode mock teams shown to Apple reviewers
const DEMO_TEAMS: TeamItem[] = [
  { id: 1, name: 'Morning Warriors', description: 'Early risers holding each other accountable every day.', joinCode: 'DEMO1234', creatorId: 0, role: 'owner' },
  { id: 2, name: 'Fitness Squad', description: 'Gym and nutrition goals — no excuses.', joinCode: 'DEMO5678', creatorId: 1, role: 'member' },
];

export default function CommunityScreen() {
  const colors = useColors();
  const isCalm = useIsCalm();
  const router = useRouter();
  const maxWidth = useContentMaxWidth();
  const [showModal, setShowModal] = useState(false);
  const [showReferral, setShowReferral] = useState(false);
  const [showCoachApply, setShowCoachApply] = useState(false);
  const { isDemoMode } = useApp();

  const { data: serverTeams, isLoading } = trpc.teams.list.useQuery(
    undefined,
    { enabled: !isDemoMode }
  );
  const teams = isDemoMode ? DEMO_TEAMS : serverTeams;

  return (
    <ScreenContainer containerClassName={isCalm ? 'bg-[#0D1135]' : undefined}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={maxWidth ? { maxWidth, alignSelf: 'center', width: '100%' } : undefined}>

          {/* ── Header ── */}
          <View style={styles.pageHeader}>
            <Text style={[styles.pageTitle, { color: colors.foreground }]}>Community</Text>
          </View>

          {/* ── Large Coach CTA Banner (TOP) ── */}
          <TouchableOpacity
            style={styles.coachCtaBanner}
            onPress={() => setShowCoachApply(true)}
            activeOpacity={0.88}
          >
            <View style={styles.coachCtaTopRow}>
              <View style={styles.coachCtaBadge}>
                <Text style={styles.coachCtaBadgeText}>LIMITED SPOTS</Text>
              </View>
              <View style={styles.coachCtaBadge2}>
                <Text style={styles.coachCtaBadge2Text}>8-WEEK SPRINT</Text>
              </View>
            </View>
            <Text style={styles.coachCtaHeadline}>Hire an{`\n`}Accountability Coach</Text>
            <Text style={styles.coachCtaSub}>Daily voice feedback based on your real app data. No Zoom calls. No scheduling.</Text>
            <View style={styles.coachCtaBtn}>
              <Text style={styles.coachCtaBtnText}>Get Your Coach  →</Text>
            </View>
          </TouchableOpacity>

          {/* ── Compact action rows ── */}
          <View style={styles.compactRowsContainer}>
            {/* Refer a Friend */}
            <TouchableOpacity
              style={[styles.compactRow, { backgroundColor: colors.surface, borderColor: colors.border }]}
              onPress={() => setShowReferral(!showReferral)}
              activeOpacity={0.8}
            >
              <View style={[styles.compactRowIcon, { backgroundColor: colors.primary + '20' }]}>
                <IconSymbol name="gift.fill" size={18} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.compactRowTitle, { color: colors.foreground }]}>Refer a Friend</Text>
                <Text style={[styles.compactRowDesc, { color: colors.muted }]}>Earn 6 months free for every friend you invite</Text>
              </View>
              <IconSymbol name={showReferral ? 'chevron.down' : 'chevron.right'} size={16} color={colors.muted} />
            </TouchableOpacity>

            {/* Referral panel (expandable) */}
            {showReferral && (
              <View style={{ marginTop: -4, marginBottom: 4 }}>
                <ReferralBanner />
              </View>
            )}

            {/* Hire a Coach (compact) */}
            <TouchableOpacity
              style={[styles.compactRow, { backgroundColor: colors.surface, borderColor: 'rgba(251,191,36,0.35)' }]}
              onPress={() => setShowCoachApply(true)}
              activeOpacity={0.8}
            >
              <View style={[styles.compactRowIcon, { backgroundColor: 'rgba(251,191,36,0.15)' }]}>
                <IconSymbol name="star.fill" size={18} color="#FBBF24" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.compactRowTitle, { color: colors.foreground }]}>Hire a Coach</Text>
                <Text style={[styles.compactRowDesc, { color: colors.muted }]}>Get daily voice feedback from a real coach</Text>
              </View>
              <IconSymbol name="chevron.right" size={16} color={colors.muted} />
            </TouchableOpacity>

            {/* Family Plan */}
            <TouchableOpacity
              style={[styles.compactRow, { backgroundColor: colors.surface, borderColor: '#22C55E30' }]}
              onPress={() => setShowModal(true)}
              activeOpacity={0.8}
            >
              <View style={[styles.compactRowIcon, { backgroundColor: '#22C55E20' }]}>
                <IconSymbol name="person.3.fill" size={18} color="#22C55E" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.compactRowTitle, { color: colors.foreground }]}>Family Plan</Text>
                <Text style={[styles.compactRowDesc, { color: colors.muted }]}>Create a shared group to track habits together</Text>
              </View>
              <IconSymbol name="chevron.right" size={16} color={colors.muted} />
            </TouchableOpacity>
          </View>

          {/* ── My Teams ── */}
          <View style={styles.sectionRow}>
            <Text style={[styles.sectionTitle, { color: colors.muted }]}>MY TEAMS</Text>
            <TouchableOpacity
              style={[styles.addBtn, { backgroundColor: colors.primary }]}
              onPress={() => setShowModal(true)}
              activeOpacity={0.8}
            >
              <IconSymbol name="plus" size={16} color="#fff" />
              <Text style={styles.addBtnText}>Add</Text>
            </TouchableOpacity>
          </View>

          {isLoading ? (
            <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 32 }} />
          ) : !teams || teams.length === 0 ? (
            <View style={[styles.emptyState, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <IconSymbol name="person.3.fill" size={40} color={colors.muted} />
              <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No teams yet</Text>
              <Text style={[styles.emptySubtitle, { color: colors.muted }]}>
                Create a family plan or join a team with a code from a friend.
              </Text>
              <TouchableOpacity
                style={[styles.primaryBtn, { backgroundColor: colors.primary, marginTop: 16, alignSelf: 'stretch' }]}
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
                  onPress={() => router.push({ pathname: '/team/[id]', params: { id: String(team.id) } })}
                />
              ))}
            </View>
          )}

        </View>
      </ScrollView>

      <CreateJoinModal visible={showModal} onClose={() => setShowModal(false)} />
      <CoachApplyModal visible={showCoachApply} onClose={() => setShowCoachApply(false)} />
    </ScreenContainer>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 32 },
  pageHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 16 },
  pageTitle: { fontSize: 28, fontWeight: "700" },
  headerBtns: { flexDirection: "row", alignItems: "center", gap: 8 },
  addBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20 },
  addBtnText: { color: "#fff", fontWeight: "600", fontSize: 14 },
  coachHeaderBtn: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20,
    backgroundColor: "rgba(251,191,36,0.15)",
    borderWidth: 1, borderColor: "rgba(251,191,36,0.6)",
  },
  coachHeaderBtnText: { color: "#FBBF24", fontWeight: "700", fontSize: 13, letterSpacing: 0.3 },

  // Coach upsell card
  coachCard: {
    borderRadius: 18, borderWidth: 1.5,
    backgroundColor: "rgba(251,191,36,0.06)",
    padding: 18, gap: 12,
  },
  coachBadgeRow: { flexDirection: "row", gap: 8, alignItems: "center" },
  coachBadge: { backgroundColor: "#FBBF24", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  coachBadgeText: { color: "#000", fontWeight: "800", fontSize: 11, letterSpacing: 0.5 },
  coachLimitBadge: { backgroundColor: "rgba(239,68,68,0.15)", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: "rgba(239,68,68,0.4)" },
  coachLimitText: { color: "#EF4444", fontWeight: "700", fontSize: 11, letterSpacing: 0.5 },
  coachHeadline: { fontSize: 20, fontWeight: "800", color: "#FBBF24", lineHeight: 26 },
  coachSubheadline: { fontSize: 14, color: "rgba(251,191,36,0.75)", lineHeight: 20, marginTop: -4 },
  coachFeatures: { gap: 8, marginTop: 4 },
  coachFeatureRow: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  coachFeatureDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: "#FBBF24", marginTop: 8, flexShrink: 0 },
  coachFeatureText: { flex: 1, fontSize: 13, color: "#E5E7EB", lineHeight: 20 },
  coachCTA: { backgroundColor: "rgba(251,191,36,0.1)", borderRadius: 12, padding: 12, gap: 4, borderWidth: 1, borderColor: "rgba(251,191,36,0.25)" },
  coachCTAText: { fontSize: 15, fontWeight: "700", color: "#FBBF24" },
  coachCTASubtext: { fontSize: 12, color: "rgba(251,191,36,0.7)", lineHeight: 18 },
  coachBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    backgroundColor: "#FBBF24", borderRadius: 14,
    paddingVertical: 14, paddingHorizontal: 20,
    marginTop: 4,
  },
  coachBtnText: { color: "#000", fontWeight: "800", fontSize: 16 },

  // Referral
  referralCard: { borderRadius: 16, borderWidth: 1, padding: 16, marginBottom: 16 },
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
  rankBadge: { alignItems: "center", gap: 1 },
  rankEmoji: { fontSize: 18 },
  rankLabel: { fontSize: 11, fontWeight: "700" },
  rankScore: { fontSize: 13, fontWeight: "800" },
  ownerBadge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 },
  ownerBadgeText: { fontSize: 11, fontWeight: "700" },

  // Compact action rows
  compactRowsContainer: { gap: 8, marginBottom: 24 },
  compactRow: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 14, borderWidth: 1, padding: 14 },
  compactRowIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  compactRowTitle: { fontSize: 15, fontWeight: '600', marginBottom: 1 },
  compactRowDesc: { fontSize: 12, lineHeight: 16 },

  // Action grid
  actionGrid: { gap: 10, marginBottom: 24 },
  actionCard: { borderRadius: 16, borderWidth: 1, padding: 16, gap: 6 },
  actionIconCircle: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  actionNum: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },
  actionTitle: { fontSize: 17, fontWeight: '700' },
  actionDesc: { fontSize: 13, lineHeight: 18 },

  // Section row with title + button
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, marginTop: 4 },

  // Large coach CTA banner
  coachCtaBanner: {
    marginTop: 0, marginBottom: 16, borderRadius: 20, borderWidth: 1.5,
    borderColor: 'rgba(251,191,36,0.6)',
    backgroundColor: 'rgba(251,191,36,0.06)',
    padding: 24, gap: 14,
  },
  coachCtaTopRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  coachCtaBadge: { backgroundColor: '#EF4444', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  coachCtaBadgeText: { color: '#fff', fontWeight: '800', fontSize: 10, letterSpacing: 0.5 },
  coachCtaBadge2: { backgroundColor: '#FBBF24', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  coachCtaBadge2Text: { color: '#000', fontWeight: '800', fontSize: 10, letterSpacing: 0.5 },
  coachCtaHeadline: { fontSize: 32, fontWeight: '900', color: '#FBBF24', lineHeight: 38, letterSpacing: -0.5 },
  coachCtaSub: { fontSize: 14, color: 'rgba(251,191,36,0.75)', lineHeight: 20 },
  coachCtaBtn: {
    backgroundColor: '#FBBF24', borderRadius: 14,
    paddingVertical: 16, paddingHorizontal: 20,
    alignItems: 'center', marginTop: 4,
  },
  coachCtaBtnText: { color: '#000', fontWeight: '800', fontSize: 17 },

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
