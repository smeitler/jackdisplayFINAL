import React, { useState, useCallback } from "react";
import {
  View, Text, ScrollView, Pressable, StyleSheet, FlatList, Alert, Platform,
} from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import { useApp } from "@/lib/app-context";
import * as Haptics from "expo-haptics";
import { loadRewards, saveRewards, countGreenCheckIns, Reward } from "@/lib/storage";
import AsyncStorage from "@react-native-async-storage/async-storage";

// ─── Types ────────────────────────────────────────────────────────────────────

type HabitReward = {
  habitId: string;
  habitName: string;
  habitEmoji: string;
  rewardName: string;
  rewardEmoji: string;
  rewardDescription?: string;
  frequencyType: "weekly" | "monthly";
  goal: number;
  currentCount: number;
  progress: number;
  isUnlocked: boolean;
  claimedAt?: string;
  periodKey: string; // e.g. "2026-W11" or "2026-03"
};

// ─── Progress bar ─────────────────────────────────────────────────────────────
function ProgressBar({ progress, color }: { progress: number; color: string }) {
  const pct = Math.min(Math.max(progress, 0), 1);
  return (
    <View style={styles.progressTrack}>
      <View style={[styles.progressFill, { width: `${pct * 100}%` as any, backgroundColor: color }]} />
    </View>
  );
}

// ─── Reward card ─────────────────────────────────────────────────────────────
function HabitRewardCard({
  item,
  onClaim,
  onUnclaim,
  colors,
}: {
  item: HabitReward;
  onClaim: () => void;
  onUnclaim: () => void;
  colors: ReturnType<typeof useColors>;
}) {
  const accent = item.isUnlocked ? "#22C55E" : colors.primary;
  const isClaimed = !!item.claimedAt;
  const remaining = Math.max(0, item.goal - item.currentCount);

  return (
    <View style={[styles.card, {
      backgroundColor: colors.surface,
      borderColor: isClaimed ? "#22C55E" : item.isUnlocked ? "#22C55E" : colors.border,
      borderWidth: isClaimed || item.isUnlocked ? 1.5 : 1,
    }]}>
      {/* Header */}
      <View style={styles.cardHeader}>
        <View style={[styles.emojiCircle, { backgroundColor: accent + "22" }]}>
          <Text style={styles.emojiText}>{item.rewardEmoji}</Text>
        </View>
        <View style={styles.cardTitleBlock}>
          <Text style={[styles.cardTitle, { color: colors.foreground }]} numberOfLines={1}>
            {item.rewardName}
          </Text>
          <Text style={[styles.cardHabit, { color: colors.muted }]} numberOfLines={1}>
            {item.habitEmoji} {item.habitName} · {item.frequencyType === "weekly" ? "Weekly" : "Monthly"} goal
          </Text>
        </View>
        {isClaimed ? (
          <View style={[styles.badge, { backgroundColor: "#22C55E22" }]}>
            <Text style={[styles.badgeText, { color: "#22C55E" }]}>Claimed ✓</Text>
          </View>
        ) : item.isUnlocked ? (
          <View style={[styles.badge, { backgroundColor: "#22C55E22" }]}>
            <Text style={[styles.badgeText, { color: "#22C55E" }]}>Unlocked!</Text>
          </View>
        ) : null}
      </View>

      {/* Description */}
      {item.rewardDescription ? (
        <Text style={[styles.cardDesc, { color: colors.muted }]} numberOfLines={2}>
          {item.rewardDescription}
        </Text>
      ) : null}

      {/* Progress */}
      {!isClaimed && (
        <View style={styles.progressSection}>
          <ProgressBar progress={item.progress} color={item.isUnlocked ? "#22C55E" : accent} />
          <View style={styles.progressLabels}>
            <Text style={[styles.progressCount, { color: item.isUnlocked ? "#22C55E" : accent }]}>
              {item.currentCount} / {item.goal} {item.frequencyType === "weekly" ? "this week" : "this month"}
            </Text>
            {!item.isUnlocked && (
              <Text style={[styles.progressRemaining, { color: colors.muted }]}>
                {remaining} to go
              </Text>
            )}
          </View>
        </View>
      )}

      {/* Actions */}
      {isClaimed ? (
        <View style={styles.cardActions}>
          <Pressable
            style={[styles.actionBtn, { borderColor: colors.border }]}
            onPress={onUnclaim}
          >
            <Text style={[styles.actionBtnText, { color: colors.muted }]}>Unclaim</Text>
          </Pressable>
        </View>
      ) : item.isUnlocked ? (
        <View style={styles.cardActions}>
          <Pressable
            style={[styles.claimBtn, { backgroundColor: "#22C55E" }]}
            onPress={onClaim}
          >
            <Text style={styles.claimBtnText}>🎉 Claim Reward</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

// ─── Main screen ─────────────────────────────────────────────────────────────
const CLAIMED_KEY = "habit_reward_claims_v1";

type ClaimRecord = { habitId: string; periodKey: string; claimedAt: string };

function getPeriodKey(frequencyType: "weekly" | "monthly"): string {
  const now = new Date();
  if (frequencyType === "monthly") {
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  }
  // ISO week
  const d = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

export default function RewardsScreen() {
  const colors = useColors();
  const { habits, checkIns } = useApp();
  const [claims, setClaims] = React.useState<ClaimRecord[]>([]);
  const [filter, setFilter] = React.useState<"all" | "unlocked" | "claimed">("all");

  // Load claims from AsyncStorage
  React.useEffect(() => {
    AsyncStorage.getItem(CLAIMED_KEY).then((raw) => {
      if (raw) {
        try { setClaims(JSON.parse(raw)); } catch { /* ignore */ }
      }
    });
  }, []);

  async function saveClaims(updated: ClaimRecord[]) {
    setClaims(updated);
    await AsyncStorage.setItem(CLAIMED_KEY, JSON.stringify(updated));
  }

  // Build reward items from habits that have reward fields set
  const rewardItems: HabitReward[] = React.useMemo(() => {
    return habits
      .filter((h) => h.isActive && h.rewardName && (h.weeklyGoal || h.monthlyGoal))
      .map((h) => {
        const freqType = h.frequencyType ?? "weekly";
        const goal = freqType === "monthly" ? (h.monthlyGoal ?? 0) : (h.weeklyGoal ?? 0);
        const periodKey = getPeriodKey(freqType);

        // Count green check-ins for this period
        const now = new Date();
        let currentCount = 0;
        if (freqType === "weekly") {
          const startOfWeek = new Date(now);
          startOfWeek.setDate(now.getDate() - ((now.getDay() + 6) % 7));
          startOfWeek.setHours(0, 0, 0, 0);
          currentCount = checkIns.filter((c) => {
            if (c.habitId !== h.id) return false;
            const d = new Date(c.date);
            return d >= startOfWeek && c.rating === "green";
          }).length;
        } else {
          currentCount = checkIns.filter((c) => {
            if (c.habitId !== h.id) return false;
            const d = new Date(c.date);
            return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && c.rating === "green";
          }).length;
        }

        const isUnlocked = goal > 0 && currentCount >= goal;
        const claimRecord = claims.find((c) => c.habitId === h.id && c.periodKey === periodKey);

        return {
          habitId: h.id,
          habitName: h.name,
          habitEmoji: h.emoji ?? "⭐",
          rewardName: h.rewardName!,
          rewardEmoji: h.rewardEmoji ?? "🎁",
          rewardDescription: h.rewardDescription,
          frequencyType: freqType,
          goal,
          currentCount,
          progress: goal > 0 ? currentCount / goal : 0,
          isUnlocked,
          claimedAt: claimRecord?.claimedAt,
          periodKey,
        };
      });
  }, [habits, checkIns, claims]);

  const filtered = React.useMemo(() => {
    if (filter === "unlocked") return rewardItems.filter((r) => r.isUnlocked && !r.claimedAt);
    if (filter === "claimed") return rewardItems.filter((r) => !!r.claimedAt);
    return rewardItems;
  }, [rewardItems, filter]);

  const unlockedCount = rewardItems.filter((r) => r.isUnlocked && !r.claimedAt).length;
  const claimedCount = rewardItems.filter((r) => !!r.claimedAt).length;

  async function handleClaim(item: HabitReward) {
    if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const updated = [
      ...claims.filter((c) => !(c.habitId === item.habitId && c.periodKey === item.periodKey)),
      { habitId: item.habitId, periodKey: item.periodKey, claimedAt: new Date().toISOString() },
    ];
    await saveClaims(updated);
  }

  async function handleUnclaim(item: HabitReward) {
    Alert.alert("Unclaim Reward", "Are you sure you want to unclaim this reward?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Unclaim", style: "destructive",
        onPress: async () => {
          const updated = claims.filter((c) => !(c.habitId === item.habitId && c.periodKey === item.periodKey));
          await saveClaims(updated);
        },
      },
    ]);
  }

  return (
    <ScreenContainer>
      <View style={styles.header}>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>Rewards</Text>
        {unlockedCount > 0 && (
          <View style={[styles.headerBadge, { backgroundColor: "#22C55E" }]}>
            <Text style={styles.headerBadgeText}>{unlockedCount} ready to claim</Text>
          </View>
        )}
      </View>

      {/* Filter tabs */}
      {rewardItems.length > 0 && (
        <View style={[styles.filterRow, { borderBottomColor: colors.border }]}>
          {(["all", "unlocked", "claimed"] as const).map((f) => (
            <Pressable
              key={f}
              style={[styles.filterTab, filter === f && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]}
              onPress={() => setFilter(f)}
            >
              <Text style={[styles.filterTabText, { color: filter === f ? colors.primary : colors.muted }]}>
                {f === "all" ? `All (${rewardItems.length})` : f === "unlocked" ? `Unlocked (${unlockedCount})` : `Claimed (${claimedCount})`}
              </Text>
            </Pressable>
          ))}
        </View>
      )}

      {rewardItems.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyEmoji}>🎁</Text>
          <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No rewards yet</Text>
          <Text style={[styles.emptyDesc, { color: colors.muted }]}>
            When you create a habit and set a weekly or monthly goal, your reward will appear here automatically.
          </Text>
          <Text style={[styles.emptyHint, { color: colors.muted }]}>
            Go to Manage Goals → tap a habit → set a goal to add a reward.
          </Text>
        </View>
      ) : filtered.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyEmoji}>{filter === "claimed" ? "🏆" : "⏳"}</Text>
          <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
            {filter === "claimed" ? "No claimed rewards yet" : "No unlocked rewards yet"}
          </Text>
          <Text style={[styles.emptyDesc, { color: colors.muted }]}>
            {filter === "claimed"
              ? "Claim a reward once you've hit your goal."
              : "Keep going — hit your habit goal to unlock your reward."}
          </Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => `${item.habitId}-${item.periodKey}`}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <HabitRewardCard
              item={item}
              onClaim={() => handleClaim(item)}
              onUnclaim={() => handleUnclaim(item)}
              colors={colors}
            />
          )}
        />
      )}
    </ScreenContainer>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
    gap: 10,
  },
  headerTitle: { fontSize: 28, fontWeight: "700" },
  headerBadge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 12,
  },
  headerBadgeText: { color: "#fff", fontSize: 12, fontWeight: "600" },
  filterRow: {
    flexDirection: "row",
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    marginBottom: 4,
  },
  filterTab: {
    paddingVertical: 10,
    paddingHorizontal: 4,
    marginRight: 20,
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  filterTabText: { fontSize: 14, fontWeight: "500" },
  list: { padding: 16, gap: 12, paddingBottom: 40 },
  card: {
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    gap: 10,
  },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: 12 },
  emojiCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  emojiText: { fontSize: 22 },
  cardTitleBlock: { flex: 1 },
  cardTitle: { fontSize: 16, fontWeight: "600" },
  cardHabit: { fontSize: 12, marginTop: 2 },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  badgeText: { fontSize: 11, fontWeight: "600" },
  cardDesc: { fontSize: 13, lineHeight: 18 },
  progressSection: { gap: 6 },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: "#E5E7EB",
    overflow: "hidden",
  },
  progressFill: { height: "100%", borderRadius: 3 },
  progressLabels: { flexDirection: "row", justifyContent: "space-between" },
  progressCount: { fontSize: 12, fontWeight: "600" },
  progressRemaining: { fontSize: 12 },
  cardActions: { flexDirection: "row", alignItems: "center", gap: 8 },
  claimBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  claimBtnText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  actionBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
  },
  actionBtnText: { fontSize: 13, fontWeight: "500" },
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    gap: 12,
  },
  emptyEmoji: { fontSize: 52 },
  emptyTitle: { fontSize: 20, fontWeight: "700", textAlign: "center" },
  emptyDesc: { fontSize: 14, textAlign: "center", lineHeight: 20 },
  emptyHint: { fontSize: 13, textAlign: "center", lineHeight: 18, marginTop: 4 },
});
