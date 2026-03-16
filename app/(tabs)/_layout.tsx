import { Tabs, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Platform } from "react-native";
import { useColors } from "@/hooks/use-colors";
import { HapticTab } from "@/components/haptic-tab";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useAuth } from "@/hooks/use-auth";
import { useApp } from "@/lib/app-context";
import { useEffect } from "react";
import { useIsNova } from "@/components/nova-effects";

export default function TabLayout() {
  const colors = useColors();
  const isNova = useIsNova();
  const insets = useSafeAreaInsets();
  const bottomPadding = Platform.OS === "web" ? 12 : Math.max(insets.bottom, 8);
  const tabBarHeight = 56 + bottomPadding;
  const { isAuthenticated, loading } = useAuth();
  const { isDemoMode } = useApp();
  const router = useRouter();

  // Nova theme: deep space black tab bar to match aurora background
  const tabBarBg = isNova ? '#050510' : colors.surface;
  const tabBarBorderColor = isNova ? '#2D1B69' : colors.border;

  useEffect(() => {
    // Allow demo mode users through without authentication
    if (!loading && !isAuthenticated && !isDemoMode) {
      router.replace("/login");
    }
  }, [isAuthenticated, isDemoMode, loading, router]);

  return (
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
          title: "Today",
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
  );
}
