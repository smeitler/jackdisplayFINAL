import { View, Text, StyleSheet, Pressable, ActivityIndicator, Platform } from "react-native";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { startOAuthLogin } from "@/constants/oauth";
import { useAuth } from "@/hooks/use-auth";
import { useApp } from "@/lib/app-context";
import * as Haptics from "expo-haptics";

export default function LoginScreen() {
  const colors = useColors();
  const router = useRouter();
  const { isAuthenticated, loading } = useAuth();
  const { startDemo } = useApp();
  const [signingIn, setSigningIn] = useState(false);
  const [startingDemo, setStartingDemo] = useState(false);

  // If already authenticated, redirect to tabs
  useEffect(() => {
    if (!loading && isAuthenticated) {
      router.replace("/(tabs)");
    }
  }, [isAuthenticated, loading, router]);

  async function handleLogin() {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSigningIn(true);
    try {
      await startOAuthLogin();
      // On native, the OAuth callback will handle redirect
      // On web, the page redirects so we never reach here
    } catch (err) {
      console.error("[Login] OAuth start failed:", err);
      setSigningIn(false);
    }
    // Keep signingIn=true on native until the deep link callback fires
    if (Platform.OS === "web") {
      setSigningIn(false);
    }
  }

  async function handleTryDemo() {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setStartingDemo(true);
    try {
      await startDemo();
      router.replace("/(tabs)");
    } catch (err) {
      console.error("[Login] Demo start failed:", err);
      setStartingDemo(false);
    }
  }

  if (loading) {
    return (
      <ScreenContainer>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <View style={styles.container}>
        {/* Logo / Hero */}
        <View style={styles.hero}>
          <View style={[styles.logoWrap, { backgroundColor: colors.primary + "22" }]}>
            <Text style={styles.logoEmoji}>📈</Text>
          </View>
          <Text style={[styles.appName, { color: colors.foreground }]}>Jack</Text>
          <Text style={[styles.tagline, { color: colors.muted }]}>
            Your daily alarm + habit check-in.
          </Text>
        </View>

        {/* Feature highlights */}
        <View style={styles.features}>
          {[
            { icon: "checkmark.circle.fill" as const, label: "Rate habits in seconds" },
            { icon: "chart.bar.fill" as const, label: "Visual progress heatmaps" },
            { icon: "sparkles" as const, label: "Vision board for your goals" },
          ].map((f) => (
            <View key={f.label} style={styles.featureRow}>
              <View style={[styles.featureIconWrap, { backgroundColor: colors.primary + "18" }]}>
                <IconSymbol name={f.icon} size={18} color={colors.primary} />
              </View>
              <Text style={[styles.featureText, { color: colors.foreground }]}>{f.label}</Text>
            </View>
          ))}
        </View>

        {/* Buttons */}
        <View style={styles.footer}>
          {/* Primary: Sign in */}
          <Pressable
            onPress={handleLogin}
            disabled={signingIn || startingDemo}
            style={({ pressed }) => [
              styles.signInBtn,
              { backgroundColor: colors.primary, transform: [{ scale: pressed ? 0.97 : 1 }], opacity: (signingIn || startingDemo) ? 0.7 : 1 },
            ]}
          >
            {signingIn ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <IconSymbol name="person.fill" size={18} color="#fff" />
            )}
            <Text style={styles.signInBtnText}>
              {signingIn ? "Opening login…" : "Sign in to get started"}
            </Text>
          </Pressable>

          {/* Divider */}
          <View style={styles.dividerRow}>
            <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
            <Text style={[styles.dividerText, { color: colors.muted }]}>or</Text>
            <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
          </View>

          {/* Secondary: Try Demo */}
          <Pressable
            onPress={handleTryDemo}
            disabled={signingIn || startingDemo}
            style={({ pressed }) => [
              styles.demoBtn,
              { borderColor: colors.border, backgroundColor: colors.surface, transform: [{ scale: pressed ? 0.97 : 1 }], opacity: (signingIn || startingDemo) ? 0.7 : 1 },
            ]}
          >
            {startingDemo ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <IconSymbol name="play.fill" size={16} color={colors.primary} />
            )}
            <Text style={[styles.demoBtnText, { color: colors.foreground }]}>
              {startingDemo ? "Loading demo…" : "Try Demo"}
            </Text>
          </Pressable>

          <Text style={[styles.disclaimer, { color: colors.muted }]}>
            Your data is securely tied to your account and syncs across devices.
          </Text>
        </View>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  container: { flex: 1, paddingHorizontal: 28, paddingTop: 40, paddingBottom: 32, justifyContent: "space-between" },
  hero: { alignItems: "center", gap: 12, marginTop: 20 },
  logoWrap: { width: 96, height: 96, borderRadius: 28, alignItems: "center", justifyContent: "center", marginBottom: 4 },
  logoEmoji: { fontSize: 52 },
  appName: { fontSize: 36, fontWeight: "800", letterSpacing: -1 },
  tagline: { fontSize: 16, textAlign: "center", lineHeight: 22, maxWidth: 260 },
  features: { gap: 14 },
  featureRow: { flexDirection: "row", alignItems: "center", gap: 14 },
  featureIconWrap: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  featureText: { fontSize: 16, fontWeight: "500" },
  footer: { gap: 12 },
  signInBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10,
    borderRadius: 16, paddingVertical: 18,
  },
  signInBtnText: { color: "#fff", fontSize: 17, fontWeight: "700" },
  dividerRow: { flexDirection: "row", alignItems: "center", gap: 10, marginVertical: 2 },
  dividerLine: { flex: 1, height: StyleSheet.hairlineWidth },
  dividerText: { fontSize: 13 },
  demoBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10,
    borderRadius: 16, paddingVertical: 16, borderWidth: 1,
  },
  demoBtnText: { fontSize: 16, fontWeight: "600" },
  disclaimer: { fontSize: 12, textAlign: "center", lineHeight: 18 },
});
