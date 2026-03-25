import { Tabs, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  Platform, View, Text, Pressable, Modal, StyleSheet, TouchableOpacity,
} from "react-native";
import { useColors } from "@/hooks/use-colors";
import { HapticTab } from "@/components/haptic-tab";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useAuth } from "@/hooks/use-auth";
import { useApp } from "@/lib/app-context";
import { useEffect, useState } from "react";
import { useIsNova } from "@/components/nova-effects";
import { useIsCalm } from "@/components/calm-effects";
import * as Haptics from "expo-haptics";

export default function TabLayout() {
  const colors = useColors();
  const isNova = useIsNova();
  const isCalm = useIsCalm();
  const insets = useSafeAreaInsets();
  const bottomPadding = Platform.OS === "web" ? 12 : Math.max(insets.bottom, 8);
  const tabBarHeight = 64 + bottomPadding;
  const { isAuthenticated, loading } = useAuth();
  const { isDemoMode } = useApp();
  const router = useRouter();
  const [plusSheetVisible, setPlusSheetVisible] = useState(false);

  // Dark navy background — matches the reference screenshot aesthetic
  const tabBarBg = colors.background;

  // Active: bright white. Inactive: soft muted blue-grey
  const activeColor = "#FFFFFF";
  const inactiveColor = "rgba(160,170,200,0.55)";

  useEffect(() => {
    if (!loading && !isAuthenticated && !isDemoMode) {
      router.replace("/login");
    }
  }, [isAuthenticated, isDemoMode, loading, router]);

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

  return (
    <>
      <Tabs
        screenOptions={{
          tabBarActiveTintColor: activeColor,
          tabBarInactiveTintColor: inactiveColor,
          headerShown: false,
          tabBarButton: HapticTab,
          tabBarStyle: {
            paddingTop: 10,
            paddingBottom: bottomPadding,
            height: tabBarHeight,
            backgroundColor: tabBarBg,
            borderTopWidth: 0,
            // Subtle top separator
            borderTopColor: "rgba(255,255,255,0.06)",
          },
          tabBarLabelStyle: {
            fontSize: 11,
            fontWeight: "700",
            letterSpacing: 0.1,
            marginTop: 2,
          },
          tabBarIconStyle: {
            marginBottom: -2,
          },
        }}
      >
        {/* Dashboard */}
        <Tabs.Screen
          name="index"
          options={{
            title: "Dashboard",
            tabBarIcon: ({ color, focused }) => (
              <IconSymbol size={focused ? 28 : 26} name="house.fill" color={color} />
            ),
          }}
        />

        {/* Journal */}
        <Tabs.Screen
          name="journal"
          options={{
            title: "Journal",
            tabBarIcon: ({ color, focused }) => (
              <IconSymbol size={focused ? 28 : 26} name="book.fill" color={color} />
            ),
          }}
        />

        {/* Center + spacer — floating button sits here */}
        <Tabs.Screen
          name="plus-placeholder"
          options={{
            title: "",
            tabBarLabel: () => null,
            tabBarIcon: () => null,
            tabBarButton: () => <View style={{ flex: 1 }} />,
          }}
        />

        {/* Chat */}
        <Tabs.Screen
          name="chat"
          options={{
            title: "Chat",
            tabBarIcon: ({ color, focused }) => (
              <IconSymbol size={focused ? 28 : 26} name="bubble.left.fill" color={color} />
            ),
          }}
        />

        {/* You */}
        <Tabs.Screen
          name="settings"
          options={{
            title: "You",
            tabBarIcon: ({ color, focused }) => (
              <IconSymbol size={focused ? 28 : 26} name="clipboard.data.fill" color={color} />
            ),
          }}
        />

        {/* Hidden screens */}
        <Tabs.Screen name="rewards" options={{ href: null }} />
        <Tabs.Screen name="progress" options={{ href: null }} />
        <Tabs.Screen name="vision" options={{ href: null }} />
        <Tabs.Screen name="community" options={{ href: null }} />
      </Tabs>

      {/* Floating center + button */}
      <View
        pointerEvents="box-none"
        style={[plusBtnStyles.floatWrapper, { bottom: bottomPadding + 6 }]}
      >
        <TouchableOpacity
          onPress={openPlusSheet}
          style={[plusBtnStyles.btn, { backgroundColor: '#E5383B' }]}
          activeOpacity={0.85}
        >
          <Text style={plusBtnStyles.icon}>+</Text>
        </TouchableOpacity>
      </View>

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
            { backgroundColor: colors.surface },
          ]}
        >
          <View style={[sheetStyles.handle, { backgroundColor: colors.muted + '55' }]} />

          {/* Two side-by-side large tiles */}
          <View style={sheetStyles.tileRow}>
            {/* Voice Log — Red */}
            <TouchableOpacity
              style={[sheetStyles.tile, { backgroundColor: '#1a0a0a', borderColor: '#E5383B44' }]}
              onPress={handleVoiceLog}
              activeOpacity={0.8}
            >
              <View style={[sheetStyles.tileIconCircle, { backgroundColor: '#E5383B' }]}>
                <IconSymbol name="mic.fill" size={28} color="#fff" />
              </View>
              <Text style={[sheetStyles.tileLabel, { color: '#fff' }]}>Voice Log</Text>
            </TouchableOpacity>

            {/* Log Habits — Yellow */}
            <TouchableOpacity
              style={[sheetStyles.tile, { backgroundColor: '#1a1500', borderColor: '#F59E0B44' }]}
              onPress={handleLogHabits}
              activeOpacity={0.8}
            >
              <View style={[sheetStyles.tileIconCircle, { backgroundColor: '#F59E0B' }]}>
                <IconSymbol name="checkmark.circle.fill" size={28} color="#fff" />
              </View>
              <Text style={[sheetStyles.tileLabel, { color: '#fff' }]}>Log Habits</Text>
            </TouchableOpacity>
          </View>

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

const plusBtnStyles = StyleSheet.create({
  floatWrapper: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
    pointerEvents: "box-none",
  } as any,
  btn: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 3,
    elevation: 6,
  },
  icon: {
    color: "#fff",
    fontSize: 30,
    fontWeight: "300",
    lineHeight: 34,
    marginTop: -2,
  },
});

const sheetStyles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingBottom: 40,
    paddingTop: 12,
    gap: 16,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 4,
  },
  tileRow: {
    flexDirection: 'row',
    gap: 12,
  },
  tile: {
    flex: 1,
    borderRadius: 18,
    borderWidth: 1,
    paddingVertical: 28,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
  },
  tileIconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileLabel: {
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  cancelBtn: {
    alignItems: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 0,
  },
  cancelText: { fontSize: 15, fontWeight: '600' },
});
