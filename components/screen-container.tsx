import { View, Platform, type ViewProps, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { Edge } from "react-native-safe-area-context";

import { cn } from "@/lib/utils";
import { NovaBackground, useIsNova } from "@/components/nova-effects";

/**
 * Minimum top padding on web / Manus preview.
 * The preview iframe may report insets.top = 0 if the parent container
 * hasn't sent setSafeAreaInsets yet (or at all). This ensures content
 * never overlaps the simulated status bar.
 */
const WEB_MIN_TOP = 50;

export interface ScreenContainerProps extends ViewProps {
  /**
   * SafeArea edges to apply. Defaults to ["top", "left", "right"].
   * Bottom is typically handled by Tab Bar.
   */
  edges?: Edge[];
  /**
   * Tailwind className for the content area.
   */
  className?: string;
  /**
   * Additional className for the outer container (background layer).
   */
  containerClassName?: string;
  /**
   * Additional className for the SafeAreaView (content layer).
   */
  safeAreaClassName?: string;
}

/**
 * A container component that properly handles SafeArea and background colors.
 *
 * Uses useSafeAreaInsets() hook directly instead of SafeAreaView to ensure
 * reliable padding on all devices and in the Manus web preview.
 */
export function ScreenContainer({
  children,
  edges = ["top", "left", "right"],
  className,
  containerClassName,
  safeAreaClassName,
  style,
  ...props
}: ScreenContainerProps) {
  const isNova = useIsNova();
  const insets = useSafeAreaInsets();

  // Build padding from requested edges using actual device insets.
  // On web, enforce a minimum top padding so the Manus preview
  // doesn't overlap the simulated status bar area.
  const safeAreaStyle: ViewStyle = {};
  if (edges.includes("top")) {
    const topInset = insets.top;
    safeAreaStyle.paddingTop =
      Platform.OS === "web" ? Math.max(topInset, WEB_MIN_TOP) : topInset;
  }
  if (edges.includes("bottom")) safeAreaStyle.paddingBottom = insets.bottom;
  if (edges.includes("left")) safeAreaStyle.paddingLeft = insets.left;
  if (edges.includes("right")) safeAreaStyle.paddingRight = insets.right;

  const inner = (
    <View
      className={cn("flex-1", safeAreaClassName)}
      style={[safeAreaStyle, style]}
    >
      <View className={cn("flex-1", className)}>{children}</View>
    </View>
  );

  if (isNova) {
    return (
      <View
        className={cn("flex-1", containerClassName)}
        style={{ backgroundColor: '#050510' }}
        {...props}
      >
        <NovaBackground style={{ flex: 1 }}>
          {inner}
        </NovaBackground>
      </View>
    );
  }

  return (
    <View
      className={cn("flex-1", "bg-background", containerClassName)}
      {...props}
    >
      {inner}
    </View>
  );
}
