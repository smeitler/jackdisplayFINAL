import {
  View, Text, ScrollView, Pressable, StyleSheet, Linking,
} from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import * as Haptics from "expo-haptics";
import { Platform } from "react-native";

const BENEFITS = [
  {
    icon: "person.fill.checkmark" as const,
    title: "Stay Accountable",
    desc: "A real human coach checks in with you daily so you never fall off track.",
  },
  {
    icon: "chart.line.uptrend.xyaxis" as const,
    title: "Accelerate Progress",
    desc: "Coaches help you break through plateaus and build momentum faster.",
  },
  {
    icon: "brain.head.profile" as const,
    title: "Mindset Shifts",
    desc: "Work through limiting beliefs and build the identity of someone who follows through.",
  },
  {
    icon: "calendar.badge.checkmark" as const,
    title: "Personalized Plan",
    desc: "Your coach tailors a strategy to your goals, schedule, and lifestyle.",
  },
];

export default function CoachScreen() {
  const colors = useColors();

  function handleCTA() {
    if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    // TODO: replace with actual sign-up URL or in-app form
    Linking.openURL("mailto:coach@jackdisplay.com?subject=Accountability%20Coach%20Sign-Up");
  }

  return (
    <ScreenContainer containerClassName="bg-background">
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero */}
        <View style={styles.hero}>
          <View style={[styles.iconCircle, { backgroundColor: colors.primary + "22" }]}>
            <IconSymbol name="person.2.fill" size={40} color={colors.primary} />
          </View>
          <Text style={[styles.heroTitle, { color: colors.foreground }]}>
            Get an Accountability Coach
          </Text>
          <Text style={[styles.heroSub, { color: colors.muted }]}>
            Stop going it alone. Pair with a dedicated coach who keeps you
            consistent, motivated, and moving toward your goals every single day.
          </Text>
        </View>

        {/* Benefits */}
        <View style={styles.benefits}>
          {BENEFITS.map((b) => (
            <View
              key={b.title}
              style={[styles.benefitCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
            >
              <View style={[styles.benefitIcon, { backgroundColor: colors.primary + "18" }]}>
                <IconSymbol name={b.icon} size={22} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.benefitTitle, { color: colors.foreground }]}>{b.title}</Text>
                <Text style={[styles.benefitDesc, { color: colors.muted }]}>{b.desc}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* Social proof */}
        <View style={[styles.quoteCard, { backgroundColor: colors.primary + "12", borderColor: colors.primary + "33" }]}>
          <Text style={[styles.quoteText, { color: colors.foreground }]}>
            "Having a coach changed everything. I went from 0 to 90-day streak in my first month."
          </Text>
          <Text style={[styles.quoteAuthor, { color: colors.muted }]}>— Alex M., DayCheck member</Text>
        </View>

        {/* CTA */}
        <Pressable
          onPress={handleCTA}
          style={({ pressed }) => [
            styles.ctaBtn,
            { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 },
          ]}
        >
          <Text style={styles.ctaBtnText}>Apply for a Coach</Text>
          <IconSymbol name="arrow.right" size={18} color="#ffffff" />
        </Pressable>

        <Text style={[styles.ctaNote, { color: colors.muted }]}>
          Limited spots available · Free intro call included
        </Text>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  scroll: {
    padding: 20,
    paddingBottom: 48,
    gap: 24,
  },
  hero: {
    alignItems: "center",
    gap: 12,
    paddingTop: 8,
    paddingBottom: 4,
  },
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  heroTitle: {
    fontSize: 26,
    fontWeight: "800",
    textAlign: "center",
    letterSpacing: -0.5,
  },
  heroSub: {
    fontSize: 15,
    lineHeight: 22,
    textAlign: "center",
    maxWidth: 320,
  },
  benefits: {
    gap: 12,
  },
  benefitCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 14,
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
  },
  benefitIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  benefitTitle: {
    fontSize: 15,
    fontWeight: "700",
    marginBottom: 3,
  },
  benefitDesc: {
    fontSize: 13,
    lineHeight: 19,
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
    paddingVertical: 16,
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
  },
});
