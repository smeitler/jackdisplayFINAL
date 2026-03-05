import { View, Text, StyleSheet, Pressable, ActivityIndicator, Platform } from "react-native";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { startOAuthLogin, getApiBaseUrl } from "@/constants/oauth";
import { useAuth } from "@/hooks/use-auth";
import { useApp } from "@/lib/app-context";
import * as Haptics from "expo-haptics";
import * as WebBrowser from "expo-web-browser";
import * as Auth from "@/lib/_core/auth";
import * as AppleAuthentication from "expo-apple-authentication";

export default function LoginScreen() {
  const colors = useColors();
  const router = useRouter();
  const { isAuthenticated, loading } = useAuth();
  const { startDemo, syncFromServer } = useApp();
  const [signingIn, setSigningIn] = useState(false);
  const [webSigningIn, setWebSigningIn] = useState(false);
  const [startingDemo, setStartingDemo] = useState(false);

  // If already authenticated, redirect to tabs
  useEffect(() => {
    if (!loading && isAuthenticated) {
      router.replace("/(tabs)");
    }
  }, [isAuthenticated, loading, router]);

  async function handleWebLogin() {
    setWebSigningIn(true);
    try {
      await startOAuthLogin();
    } catch (err) {
      console.error("[Login] OAuth start failed:", err);
      setWebSigningIn(false);
    }
    setWebSigningIn(false);
  }

  async function handleAppleSignIn() {
    if (Platform.OS !== "ios") return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSigningIn(true);
    try {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });
      // Exchange Apple identity token for a session token via our server
      const apiBase = getApiBaseUrl();
      const resp = await fetch(`${apiBase}/api/auth/apple`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          identityToken: credential.identityToken,
          user: credential.user,
          fullName: credential.fullName,
          email: credential.email,
        }),
      });
      if (!resp.ok) {
        const err = await resp.text();
        throw new Error(err || "Apple sign-in failed");
      }
      const data = await resp.json();
      if (data.app_session_id) {
        await Auth.setSessionToken(data.app_session_id);
        if (data.user) await Auth.setUserInfo(data.user);
        // Immediately sync server data so the app shows the user's real habits
        // (AppProvider's load() already ran on mount with no token — we must re-sync now)
        await syncFromServer();
        router.replace("/(tabs)");
      } else {
        throw new Error("No session token returned");
      }
    } catch (err: any) {
      if (err?.code !== "ERR_REQUEST_CANCELED") {
        console.error("[Login] Apple sign-in failed:", err);
      }
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
            <IconSymbol name="chart.bar.fill" size={44} color={colors.primary} />
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
          {/* Web-only login button (not shown on iOS) */}
          {Platform.OS === "web" && (
            <Pressable
              onPress={handleWebLogin}
              disabled={webSigningIn || startingDemo}
              style={({ pressed }) => [
                styles.signInBtn,
                { backgroundColor: colors.primary, transform: [{ scale: pressed ? 0.97 : 1 }], opacity: (webSigningIn || startingDemo) ? 0.7 : 1 },
              ]}
            >
              {webSigningIn ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <IconSymbol name="person.fill" size={18} color="#fff" />
              )}
              <Text style={styles.signInBtnText}>
                {webSigningIn ? "Opening login…" : "Sign in to get started"}
              </Text>
            </Pressable>
          )}

          {/* Primary: Sign in with Apple (iOS only) */}
          {Platform.OS === "ios" && (
            <AppleAuthentication.AppleAuthenticationButton
              buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
              buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
              cornerRadius={16}
              style={styles.appleBtn}
              onPress={handleAppleSignIn}
            />
          )}

          {/* Show loading state when signing in */}
          {signingIn && (
            <View style={[styles.loadingRow]}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={[styles.loadingText, { color: colors.muted }]}>Signing in…</Text>
            </View>
          )}

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

          {/* Privacy Policy & Terms — must be visible before sign-in per Apple guidelines */}
          <View style={styles.legalRow}>
            <Pressable
              onPress={() => WebBrowser.openBrowserAsync('https://jackalarm.com/privacy')}
              style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
            >
              <Text style={[styles.legalLink, { color: colors.muted }]}>Privacy Policy</Text>
            </Pressable>
            <Text style={[styles.legalSep, { color: colors.muted }]}>·</Text>
            <Pressable
              onPress={() => WebBrowser.openBrowserAsync('https://jackalarm.com/terms')}
              style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
            >
              <Text style={[styles.legalLink, { color: colors.muted }]}>Terms of Service</Text>
            </Pressable>
          </View>
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
  appName: { fontSize: 36, fontWeight: "800", letterSpacing: -1 },
  tagline: { fontSize: 16, textAlign: "center", lineHeight: 22, maxWidth: 260 },
  features: { gap: 14 },
  featureRow: { flexDirection: "row", alignItems: "center", gap: 14 },
  featureIconWrap: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  featureText: { fontSize: 16, fontWeight: "500" },
  footer: { gap: 12 },
  appleBtn: { height: 54, width: '100%' },
  signInBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10,
    borderRadius: 16, paddingVertical: 18,
  },
  signInBtnText: { color: "#fff", fontSize: 17, fontWeight: "700" },
  loadingRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  loadingText: { fontSize: 14 },
  demoBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10,
    borderRadius: 16, paddingVertical: 16, borderWidth: 1,
  },
  demoBtnText: { fontSize: 16, fontWeight: "600" },
  disclaimer: { fontSize: 12, textAlign: "center", lineHeight: 18 },
  legalRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 4 },
  legalLink: { fontSize: 12, textDecorationLine: 'underline' },
  legalSep: { fontSize: 12 },
});
