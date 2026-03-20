import { Tabs, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Platform, View, Text, Pressable, Modal, StyleSheet, TouchableOpacity } from "react-native";
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
  const tabBarHeight = 56 + bottomPadding;
  const { isAuthenticated, loading } = useAuth();
  const { isDemoMode } = useApp();
  const router = useRouter();
  const [plusSheetVisible, setPlusSheetVisible] = useState(false);

  const tabBarBg = isNova ? '#050510' : isCalm ? '#0D1135' : colors.surface;
  const tabBarBorderColor = isNova ? '#2D1B69' : isCalm ? '#252D6E' : colors.border;

  useEffect(() => {
    if (!loading && !isAuthenticated && !isDemoMode) {
      router.replace("/login");
    }
  }, [isAuthenticated, isDemoMode, loading, router]);

  function openPlusSheet() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setPlusSheetVisible(true);
  }

  function closePlusSheet() {
    setPlusSheetVisible(false);
  }

  function handleVoiceLog() {
    closePlusSheet();
    // Navigate to journal tab and trigger voice recording
    router.push("/(tabs)/journal?action=voice");
  }

  function handleLogHabits() {
    closePlusSheet();
    // Navigate to journal tab and trigger habit check-in
    router.push("/(tabs)/journal?action=checkin");
  }

  return (
    <>
      <Tabs
        screenOptions={{
          tabBarActiveTintColor: colors.primary,
          tabBarInactiveTintColor: colors.muted,
          headerShown: false,
          tabBarButton: HapticTab,
          tabBarStyle: {
            paddingTop: 8,
            paddingBottom: bottomPadding,
            height: tabBarHeight,
            backgroundColor: tabBarBg,
            borderTopColor: tabBarBorderColor,
            borderTopWidth: 0.5,
          },
          tabBarLabelStyle: {
            fontSize: 11,
            fontWeight: '600',
          },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: "Dashboard",
            tabBarIcon: ({ color }) => <IconSymbol size={26} name="house.fill" color={color} />,
          }}
        />
        <Tabs.Screen
          name="progress"
          options={{ href: null }}
        />
        <Tabs.Screen
          name="vision"
          options={{ href: null }}
        />
        <Tabs.Screen
          name="journal"
          options={{
            title: "Journal",
            tabBarIcon: ({ color }) => <IconSymbol size={26} name="book.fill" color={color} />,
          }}
        />
        {/* Center + button — rendered as a non-navigating tab placeholder */}
        <Tabs.Screen
          name="plus-placeholder"
          options={{
            href: null,
            tabBarButton: () => (
              <View style={plusBtnStyles.wrapper}>
                <TouchableOpacity
                  onPress={openPlusSheet}
                  style={[plusBtnStyles.btn, { backgroundColor: colors.primary }]}
                  activeOpacity={0.85}
                >
                  <Text style={plusBtnStyles.icon}>+</Text>
                </TouchableOpacity>
              </View>
            ),
          }}
        />
        <Tabs.Screen
          name="rewards"
          options={{
            title: "Rewards",
            tabBarIcon: ({ color }) => <IconSymbol size={26} name="diamond.fill" color={color} />,
          }}
        />
        <Tabs.Screen
          name="community"
          options={{
            title: "Community",
            tabBarIcon: ({ color }) => <IconSymbol size={26} name="person.3.fill" color={color} />,
          }}
        />
        <Tabs.Screen
          name="settings"
          options={{
            title: "More",
            tabBarIcon: ({ color }) => (
              <IconSymbol size={26} name="line.3.horizontal.decrease" color={color} />
            ),
          }}
        />
      </Tabs>

      {/* Plus Action Sheet */}
      <Modal
        visible={plusSheetVisible}
        transparent
        animationType="slide"
        onRequestClose={closePlusSheet}
      >
        <Pressable style={sheetStyles.backdrop} onPress={closePlusSheet} />
        <View style={[sheetStyles.sheet, { backgroundColor: isNova ? '#0D0A1E' : isCalm ? '#0D1135' : colors.surface }]}>
          <View style={[sheetStyles.handle, { backgroundColor: colors.muted + '55' }]} />
          <Text style={[sheetStyles.title, { color: colors.foreground }]}>Quick Add</Text>

          <TouchableOpacity
            style={[sheetStyles.option, { backgroundColor: colors.primary + '18', borderColor: colors.primary + '44' }]}
            onPress={handleVoiceLog}
            activeOpacity={0.8}
          >
            <View style={[sheetStyles.optionIcon, { backgroundColor: colors.primary + '22' }]}>
              <IconSymbol name="mic.fill" size={24} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[sheetStyles.optionTitle, { color: colors.foreground }]}>Voice Log</Text>
              <Text style={[sheetStyles.optionDesc, { color: colors.muted }]}>Record your habits and journal by voice</Text>
            </View>
            <IconSymbol name="chevron.right" size={16} color={colors.muted} />
          </TouchableOpacity>

          <TouchableOpacity
            style={[sheetStyles.option, { backgroundColor: colors.success + '18', borderColor: colors.success + '44' }]}
            onPress={handleLogHabits}
            activeOpacity={0.8}
          >
            <View style={[sheetStyles.optionIcon, { backgroundColor: colors.success + '22' }]}>
              <IconSymbol name="checkmark.circle.fill" size={24} color={colors.success} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[sheetStyles.optionTitle, { color: colors.foreground }]}>Log Habits</Text>
              <Text style={[sheetStyles.optionDesc, { color: colors.muted }]}>Check in today's habits and progress</Text>
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

const plusBtnStyles = StyleSheet.create({
  wrapper: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 4,
  },
  btn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 6,
    marginBottom: 2,
  },
  icon: {
    color: '#fff',
    fontSize: 28,
    fontWeight: '300',
    lineHeight: 32,
    marginTop: -2,
  },
});

const sheetStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
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
    alignSelf: 'center',
    marginBottom: 8,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 4,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
  },
  optionIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 2,
  },
  optionDesc: {
    fontSize: 13,
  },
  cancelBtn: {
    alignItems: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 4,
  },
  cancelText: {
    fontSize: 15,
    fontWeight: '600',
  },
});
