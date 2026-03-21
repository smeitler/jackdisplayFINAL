import {
  View, Text, ScrollView, Pressable, StyleSheet,
} from "react-native";
import { useState } from "react";
import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import * as Haptics from "expo-haptics";
import { Platform } from "react-native";
import CoachApplyModal from "@/app/coach-apply";

const DELIVERABLES = [
  {
    icon: "person.2.fill" as const,
    num: "1",
    title: "Live Group Kickoff Workshop",
    desc: "One 60-minute Zoom with a small group. You leave with your top 1–3 goals broken into weekly targets and daily habits already loaded into your app.",
  },
  {
    icon: "checkmark.circle.fill" as const,
    num: "2",
    title: "Daily Check-Ins (2–3 min)",
    desc: "Open the app, check off your habits, answer two quick prompts. No long journaling. Just simple, repeatable actions every day.",
  },
  {
    icon: "waveform" as const,
    num: "3",
    title: "Personal Voice Feedback Mon–Fri",
    desc: "Your coach reviews your check-ins and sends a 1–2 minute voice memo: what you're winning at, where you slipped, and one concrete adjustment for tomorrow.",
  },
  {
    icon: "doc.text.fill" as const,
    num: "4",
    title: "Weekly Strategy Summary",
    desc: "Once a week: here's what worked, here's what held you back, here's exactly what to focus on for the next 7 days. You never wonder if you're on track.",
  },
];

export default function CoachScreen() {
  const colors = useColors();
  const [applyVisible, setApplyVisible] = useState(false);

  function handleCTA() {
    if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setApplyVisible(true);
  }

  return (
    <ScreenContainer containerClassName="bg-background">
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* Headline */}
        <View style={styles.hero}>
          <Text style={[styles.heroTitle, { color: colors.foreground }]}>
            Become the person who shows up for their goals — not just writes them down.
          </Text>
          <Text style={[styles.heroSub, { color: colors.muted }]}>
            Your 8-Week Accountability Sprint: daily check-ins, a coach in your corner, and a simple plan you can actually stick with.
          </Text>
        </View>

        {/* Personal open */}
        <View style={[styles.openCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.openText, { color: colors.foreground }]}>
            The real problem hasn't been knowledge. You already know what you should be doing.{"\n\n"}
            The real problem is <Text style={{ fontWeight: "700" }}>no accountability</Text> — and no one noticing when you quietly fall off.{"\n\n"}
            This Sprint exists to fix exactly that: a clear plan built inside your app, plus a coach watching your data and sending you direct feedback so you do not drift.
          </Text>
        </View>

        {/* What you get */}
        <Text style={[styles.sectionLabel, { color: colors.foreground }]}>WHAT YOU GET FOR 8 WEEKS</Text>
        <View style={styles.deliverables}>
          {DELIVERABLES.map((d) => (
            <View
              key={d.num}
              style={[styles.deliverableCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
            >
              <View style={[styles.numBadge, { backgroundColor: colors.primary }]}>
                <Text style={styles.numText}>{d.num}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.deliverableTitle, { color: colors.foreground }]}>{d.title}</Text>
                <Text style={[styles.deliverableDesc, { color: colors.muted }]}>{d.desc}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* The promise */}
        <View style={[styles.promiseCard, { backgroundColor: colors.primary + "15", borderColor: colors.primary + "40" }]}>
          <Text style={[styles.promiseLabel, { color: colors.primary }]}>THE PROMISE</Text>
          <Text style={[styles.promiseText, { color: colors.foreground }]}>
            In 8 weeks you will be the person who shows up for their goals, not just writes them down.
          </Text>
        </View>

        {/* Price */}
        <View style={[styles.priceCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.priceLabel, { color: colors.muted }]}>8-WEEK ACCOUNTABILITY SPRINT</Text>
          <Text style={[styles.priceAmount, { color: colors.foreground }]}>$297</Text>
          <Text style={[styles.priceNote, { color: colors.muted }]}>One-time investment · No subscription</Text>
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          <Text style={[styles.guaranteeTitle, { color: colors.foreground }]}>100% Results Guarantee</Text>
          <Text style={[styles.guaranteeText, { color: colors.muted }]}>
            Show up, do your daily check-ins, and listen to your coach's feedback. If after 8 weeks you don't feel meaningfully more consistent and in control of your habits, email us and we'll refund your Sprint.
          </Text>
        </View>

        {/* Testimonial */}
        <View style={[styles.quoteCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.quoteText, { color: colors.foreground }]}>
            "I'd been trying to build this habit for two years. Eight weeks with a coach and I haven't missed a day in the 3 months since."
          </Text>
          <Text style={[styles.quoteAuthor, { color: colors.muted }]}>— Marcus T., Sprint graduate</Text>
        </View>

        {/* CTA */}
        <Pressable
          onPress={handleCTA}
          style={({ pressed }) => [
            styles.ctaBtn,
            { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 },
          ]}
        >
          <Text style={styles.ctaBtnText}>Start My 8-Week Sprint</Text>
          <IconSymbol name="arrow.right" size={18} color="#ffffff" />
        </Pressable>

        <Text style={[styles.ctaNote, { color: colors.muted }]}>
          This is you choosing to be the person they remember.
        </Text>
      </ScrollView>

      <CoachApplyModal visible={applyVisible} onClose={() => setApplyVisible(false)} />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  scroll: {
    padding: 20,
    paddingBottom: 56,
    gap: 24,
  },
  hero: {
    gap: 10,
    paddingTop: 4,
  },
  heroTitle: {
    fontSize: 26,
    fontWeight: "800",
    lineHeight: 33,
    letterSpacing: -0.5,
  },
  heroSub: {
    fontSize: 15,
    lineHeight: 22,
  },
  openCard: {
    padding: 18,
    borderRadius: 14,
    borderWidth: 1,
  },
  openText: {
    fontSize: 15,
    lineHeight: 23,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.2,
    marginBottom: -12,
  },
  deliverables: {
    gap: 12,
  },
  deliverableCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 14,
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
  },
  numBadge: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
  },
  numText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "800",
  },
  deliverableTitle: {
    fontSize: 15,
    fontWeight: "700",
    marginBottom: 4,
  },
  deliverableDesc: {
    fontSize: 13,
    lineHeight: 19,
  },
  promiseCard: {
    padding: 20,
    borderRadius: 14,
    borderWidth: 1,
    gap: 8,
    alignItems: "center",
  },
  promiseLabel: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.2,
  },
  promiseText: {
    fontSize: 17,
    fontWeight: "700",
    lineHeight: 25,
    textAlign: "center",
  },
  priceCard: {
    padding: 20,
    borderRadius: 14,
    borderWidth: 1,
    gap: 6,
    alignItems: "center",
  },
  priceLabel: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.2,
  },
  priceAmount: {
    fontSize: 48,
    fontWeight: "900",
    letterSpacing: -1,
    lineHeight: 56,
  },
  priceNote: {
    fontSize: 13,
    marginBottom: 4,
  },
  divider: {
    height: 1,
    width: "100%",
    marginVertical: 8,
  },
  guaranteeTitle: {
    fontSize: 15,
    fontWeight: "700",
    textAlign: "center",
  },
  guaranteeText: {
    fontSize: 13,
    lineHeight: 19,
    textAlign: "center",
  },
  quoteCard: {
    padding: 18,
    borderRadius: 14,
    borderWidth: 1,
    gap: 8,
  },
  quoteText: {
    fontSize: 15,
    lineHeight: 22,
    fontStyle: "italic",
  },
  quoteAuthor: {
    fontSize: 13,
    fontWeight: "600",
  },
  ctaBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 18,
    borderRadius: 14,
  },
  ctaBtnText: {
    color: "#ffffff",
    fontSize: 17,
    fontWeight: "700",
  },
  ctaNote: {
    textAlign: "center",
    fontSize: 13,
    marginTop: -8,
    fontStyle: "italic",
  },
});
