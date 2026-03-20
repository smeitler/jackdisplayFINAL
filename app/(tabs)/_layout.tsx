import { Tabs, useRouter, usePathname } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  Platform, View, Text, Pressable, Modal, StyleSheet,
  TouchableOpacity, Animated,
} from "react-native";
import { useColors } from "@/hooks/use-colors";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useAuth } from "@/hooks/use-auth";
import { useApp } from "@/lib/app-context";
import { useEffect, useState, useRef } from "react";
import { useIsNova } from "@/components/nova-effects";
import { useIsCalm } from "@/components/calm-effects";
import * as Haptics from "expo-haptics";
import { BlurView } from "expo-blur";

// ─── Tab definitions ──────────────────────────────────────────────────────────
const TABS = [
  { name: "index",   label: "Dashboard", icon: "house.fill" as const },
  { name: "journal", label: "Journal",   icon: "book.fill" as const },
  { name: "__plus__", label: "",         icon: "plus" as const }, // center action
  { name: "chat",    label: "Chat",      icon: "bubble.left.fill" as const },
  { name: "settings", label: "More",    icon: "line.3.horizontal.decrease" as const },
];

// ─── Custom floating pill tab bar ─────────────────────────────────────────────
function FloatingTabBar({
  activeRoute,
  onTabPress,
  onPlusPress,
  colors,
  isNova,
  isCalm,
}: {
  activeRoute: string;
  onTabPress: (name: string) => void;
  onPlusPress: () => void;
  colors: any;
  isNova: boolean;
  isCalm: boolean;
}) {
  const insets = useSafeAreaInsets();
  const bottom = Platform.OS === "web" ? 16 : Math.max(insets.bottom, 12);

  const pillBg = isNova
    ? "rgba(12,8,28,0.92)"
    : isCalm
    ? "rgba(10,14,50,0.92)"
    : "rgba(28,28,32,0.92)";

  return (
    <View
      pointerEvents="box-none"
      style={[tabBarStyles.wrapper, { bottom }]}
    >
      <View style={[tabBarStyles.pill, { backgroundColor: pillBg }]}>
        {/* Blur tint layer */}
        {Platform.OS !== "web" && (
          <BlurView
            intensity={40}
            tint="dark"
            style={StyleSheet.absoluteFill}
          />
        )}

        {TABS.map((tab) => {
          if (tab.name === "__plus__") {
            return (
              <TouchableOpacity
                key="plus"
                onPress={onPlusPress}
                activeOpacity={0.85}
                style={tabBarStyles.plusBtn}
              >
                <View style={[tabBarStyles.plusInner, { backgroundColor: colors.primary }]}>
                  <Text style={tabBarStyles.plusIcon}>+</Text>
                </View>
              </TouchableOpacity>
            );
          }

          const isActive = activeRoute === tab.name;
          return (
            <Pressable
              key={tab.name}
              onPress={() => onTabPress(tab.name)}
              style={({ pressed }) => [
                tabBarStyles.tabItem,
                isActive && tabBarStyles.tabItemActive,
                pressed && { opacity: 0.7 },
              ]}
            >
              <IconSymbol
                name={tab.icon}
                size={22}
                color={isActive ? "#fff" : "rgba(255,255,255,0.45)"}
              />
              <Text
                style={[
                  tabBarStyles.tabLabel,
                  { color: isActive ? "#fff" : "rgba(255,255,255,0.45)" },
                ]}
              >
                {tab.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

// ─── Main layout ──────────────────────────────────────────────────────────────
export default function TabLayout() {
  const colors = useColors();
  const isNova = useIsNova();
  const isCalm = useIsCalm();
  const insets = useSafeAreaInsets();
  const { isAuthenticated, loading } = useAuth();
  const { isDemoMode } = useApp();
  const router = useRouter();
  const pathname = usePathname();
  const [plusSheetVisible, setPlusSheetVisible] = useState(false);

  // Derive active tab name from pathname
  const activeRoute = (() => {
    if (pathname === "/" || pathname === "/index") return "index";
    if (pathname.startsWith("/journal")) return "journal";
    if (pathname.startsWith("/chat")) return "chat";
    if (pathname.startsWith("/settings")) return "settings";
    return "index";
  })();

  useEffect(() => {
    if (!loading && !isAuthenticated && !isDemoMode) {
      router.replace("/login");
    }
  }, [isAuthenticated, isDemoMode, loading, router]);

  function handleTabPress(name: string) {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (name === "index") router.push("/" as never);
    else router.push(`/(tabs)/${name}` as never);
  }

  function openPlusSheet() {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setPlusSheetVisible(true);
  }

  function closePlusSheet() {
    setPlusSheetVisible(false);
  }

  function handleVoiceLog() {
    closePlusSheet();
    router.push("/voice-checkin" as never);
  }

  function handleLogHabits() {
    closePlusSheet();
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, "0");
    const dd = String(today.getDate()).padStart(2, "0");
    router.push(`/checkin?date=${yyyy}-${mm}-${dd}` as never);
  }

  const bottomPadding = Platform.OS === "web" ? 12 : Math.max(insets.bottom, 8);
  // Extra bottom padding so screen content doesn't hide behind the floating pill
  const tabBarHeight = 64 + Math.max(insets.bottom, 12) + 16;

  return (
    <>
      <Tabs
        screenOptions={{
          headerShown: false,
          // Hide the native tab bar — we render our own
          tabBarStyle: { display: "none" },

        }}
      >
        <Tabs.Screen name="index" />
        <Tabs.Screen name="journal" />
        <Tabs.Screen name="plus-placeholder" options={{ href: null }} />
        <Tabs.Screen name="chat" />
        <Tabs.Screen name="settings" />
        {/* Hidden screens */}
        <Tabs.Screen name="rewards" options={{ href: null }} />
        <Tabs.Screen name="progress" options={{ href: null }} />
        <Tabs.Screen name="vision" options={{ href: null }} />
        <Tabs.Screen name="community" options={{ href: null }} />
      </Tabs>

      {/* Floating pill tab bar */}
      <FloatingTabBar
        activeRoute={activeRoute}
        onTabPress={handleTabPress}
        onPlusPress={openPlusSheet}
        colors={colors}
        isNova={isNova}
        isCalm={isCalm}
      />

      {/* Plus Action Sheet */}
      <Modal
        visible={plusSheetVisible}
        transparent
        animationType="slide"
        onRequestClose={closePlusSheet}
      >
        <Pressable style={sheetStyles.backdrop} onPress={closePlusSheet} />
        <View
          style={[
            sheetStyles.sheet,
            {
              backgroundColor: isNova
                ? "#0D0A1E"
                : isCalm
                ? "#0D1135"
                : colors.surface,
            },
          ]}
        >
          <View style={[sheetStyles.handle, { backgroundColor: colors.muted + "55" }]} />
          <Text style={[sheetStyles.title, { color: colors.foreground }]}>Quick Add</Text>

          <TouchableOpacity
            style={[
              sheetStyles.option,
              {
                backgroundColor: colors.primary + "18",
                borderColor: colors.primary + "44",
              },
            ]}
            onPress={handleVoiceLog}
            activeOpacity={0.8}
          >
            <View style={[sheetStyles.optionIcon, { backgroundColor: colors.primary + "22" }]}>
              <IconSymbol name="mic.fill" size={24} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[sheetStyles.optionTitle, { color: colors.foreground }]}>
                Voice Log
              </Text>
              <Text style={[sheetStyles.optionDesc, { color: colors.muted }]}>
                Record your habits and journal by voice
              </Text>
            </View>
            <IconSymbol name="chevron.right" size={16} color={colors.muted} />
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              sheetStyles.option,
              {
                backgroundColor: colors.success + "18",
                borderColor: colors.success + "44",
              },
            ]}
            onPress={handleLogHabits}
            activeOpacity={0.8}
          >
            <View style={[sheetStyles.optionIcon, { backgroundColor: colors.success + "22" }]}>
              <IconSymbol name="checkmark.circle.fill" size={24} color={colors.success} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[sheetStyles.optionTitle, { color: colors.foreground }]}>
                Log Habits
              </Text>
              <Text style={[sheetStyles.optionDesc, { color: colors.muted }]}>
                Check in today's habits and progress
              </Text>
            </View>
            <IconSymbol name="chevron.right" size={16} color={colors.muted} />
          </TouchableOpacity>

          <TouchableOpacity
            style={[sheetStyles.cancelBtn, { borderColor: colors.border }]}
            onPress={closePlusSheet}
            activeOpacity={0.7}
          >
            <Text style={[sheetStyles.cancelText, { color: colors.muted }]}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </Modal>
    </>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const tabBarStyles = StyleSheet.create({
  wrapper: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
    pointerEvents: "box-none",
  } as any,
  pill: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 36,
    paddingHorizontal: 6,
    paddingVertical: 6,
    gap: 2,
    overflow: "hidden",
    // Shadow
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 20,
    elevation: 12,
  },
  tabItem: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderRadius: 28,
    gap: 3,
    minHeight: 52,
  },
  tabItemActive: {
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  tabLabel: {
    fontSize: 10,
    fontWeight: "600",
    letterSpacing: 0.2,
  },
  plusBtn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 52,
  },
  plusInner: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  plusIcon: {
    color: "#fff",
    fontSize: 28,
    fontWeight: "300",
    lineHeight: 32,
    marginTop: -2,
  },
});

const sheetStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingBottom: 40,
    paddingTop: 12,
    gap: 12,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: 8,
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 4,
  },
  option: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
  },
  optionIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  optionTitle: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 2,
  },
  optionDesc: {
    fontSize: 13,
  },
  cancelBtn: {
    alignItems: "center",
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 4,
  },
  cancelText: {
    fontSize: 15,
    fontWeight: "600",
  },
});
