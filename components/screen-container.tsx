import { View, type ViewProps } from "react-native";
import { SafeAreaView, type Edge } from "react-native-safe-area-context";

import { cn } from "@/lib/utils";
import { NovaBackground, useIsNova } from "@/components/nova-effects";

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
 * When the Nova theme is active, wraps the screen in the animated aurora
 * background. Otherwise renders the standard background color.
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

  const inner = (
    <SafeAreaView
      edges={edges}
      className={cn("flex-1", safeAreaClassName)}
      style={style}
    >
      <View className={cn("flex-1", className)}>{children}</View>
    </SafeAreaView>
  );

  if (isNova) {
    return (
      <View className={cn("flex-1", containerClassName)} {...props}>
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
