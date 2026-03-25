/**
 * NovaEffects — Visual effects layer for the Nova theme.
 *
 * Provides:
 *  - NovaBackground: animated aurora gradient that slowly shifts colors
 *  - NovaCard: card with animated shimmer sweep + glowing gradient border
 *  - NovaButton: primary button with pulsing violet glow
 *  - NovaOrbs: floating particle orbs drifting in the background
 *  - useIsNova: hook to check if Nova theme is active
 */
import React, { useEffect, useRef, ReactNode } from "react";
import { View, StyleSheet, Dimensions, ViewStyle } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSequence,
  Easing,
  interpolate,
  interpolateColor,
} from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { useThemeContext } from "@/lib/theme-provider";

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");

// ─── Hook ─────────────────────────────────────────────────────────────────────
export function useIsNova() {
  // Nova theme removed — always returns false
  return false;
}

// ─── Aurora Background ────────────────────────────────────────────────────────
/**
 * Full-screen animated aurora gradient background.
 * Wraps the screen content. Only renders visually when Nova theme is active.
 */
export function NovaBackground({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  const isNova = useIsNova();
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withRepeat(
      withTiming(1, { duration: 8000, easing: Easing.inOut(Easing.sin) }),
      -1,
      true,
    );
  }, []);

  const animStyle = useAnimatedStyle(() => {
    // Slowly shift the gradient start point to simulate aurora movement
    const translateY = interpolate(progress.value, [0, 1], [-40, 40]);
    return { transform: [{ translateY }] };
  });

  if (!isNova) return <View style={[{ flex: 1 }, style]}>{children}</View>;

  return (
    <View style={[{ flex: 1, overflow: "hidden" }, style]}>
      {/* Animated aurora layer behind everything */}
      <Animated.View style={[StyleSheet.absoluteFill, animStyle, { height: SCREEN_H + 80 }]}>
        <LinearGradient
          colors={[
            "#050510",
            "#1a0533",
            "#0d1a4a",
            "#0a2a3a",
            "#1a0533",
            "#050510",
          ]}
          locations={[0, 0.2, 0.4, 0.6, 0.8, 1]}
          start={{ x: 0.2, y: 0 }}
          end={{ x: 0.8, y: 1 }}
          style={{ flex: 1 }}
        />
      </Animated.View>

      {/* Secondary aurora shimmer overlay */}
      <AuroraOverlay />

      {/* Floating orbs */}
      <NovaOrbs />

      {/* Content on top */}
      <View style={{ flex: 1 }}>{children}</View>
    </View>
  );
}

function AuroraOverlay() {
  const opacity = useSharedValue(0.3);
  const translateX = useSharedValue(-SCREEN_W * 0.5);

  useEffect(() => {
    opacity.value = withRepeat(
      withSequence(
        withTiming(0.55, { duration: 4000, easing: Easing.inOut(Easing.quad) }),
        withTiming(0.2, { duration: 4000, easing: Easing.inOut(Easing.quad) }),
      ),
      -1,
      false,
    );
    translateX.value = withRepeat(
      withTiming(SCREEN_W * 0.3, { duration: 10000, easing: Easing.inOut(Easing.sin) }),
      -1,
      true,
    );
  }, []);

  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  return (
    <Animated.View style={[StyleSheet.absoluteFill, style, { pointerEvents: "none" }]}>
      <LinearGradient
        colors={["transparent", "#7c3aed30", "#0d1a4a50", "#7c3aed20", "transparent"]}
        locations={[0, 0.3, 0.5, 0.7, 1]}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={{ flex: 1 }}
      />
    </Animated.View>
  );
}

// ─── Floating Orbs ────────────────────────────────────────────────────────────
const ORB_CONFIGS = [
  { x: 0.15, y: 0.2, size: 120, color: "#7c3aed40", duration: 12000 },
  { x: 0.75, y: 0.35, size: 90, color: "#06b6d430", duration: 9000 },
  { x: 0.4, y: 0.65, size: 150, color: "#a855f730", duration: 15000 },
  { x: 0.85, y: 0.75, size: 70, color: "#f43f5e25", duration: 8000 },
  { x: 0.1, y: 0.8, size: 100, color: "#22d3ee25", duration: 11000 },
];

function NovaOrbs() {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {ORB_CONFIGS.map((orb, i) => (
        <FloatingOrb key={i} {...orb} delay={i * 1200} />
      ))}
    </View>
  );
}

function FloatingOrb({
  x, y, size, color, duration, delay,
}: {
  x: number; y: number; size: number; color: string; duration: number; delay: number;
}) {
  const translateY = useSharedValue(0);
  const opacity = useSharedValue(0.6);

  useEffect(() => {
    const start = () => {
      translateY.value = withRepeat(
        withTiming(-30, { duration, easing: Easing.inOut(Easing.sin) }),
        -1,
        true,
      );
      opacity.value = withRepeat(
        withSequence(
          withTiming(1, { duration: duration * 0.5 }),
          withTiming(0.4, { duration: duration * 0.5 }),
        ),
        -1,
        false,
      );
    };
    const timer = setTimeout(start, delay);
    return () => clearTimeout(timer);
  }, []);

  const style = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    opacity: opacity.value,
  }));

  return (
    <Animated.View
      style={[
        style,
        {
          position: "absolute",
          left: SCREEN_W * x - size / 2,
          top: SCREEN_H * y - size / 2,
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: color,
          // Soft blur simulation via nested views
        },
      ]}
    >
      <View
        style={{
          position: "absolute",
          inset: size * 0.15,
          borderRadius: size / 2,
          backgroundColor: color,
        }}
      />
    </Animated.View>
  );
}

// ─── Nova Card ────────────────────────────────────────────────────────────────
/**
 * Card with animated shimmer sweep + gradient border glow.
 * Falls back to a plain surface card when Nova theme is not active.
 */
export function NovaCard({
  children,
  style,
  colors: themeColors,
  cardBg,
  cardBorder,
}: {
  children: ReactNode;
  style?: ViewStyle;
  colors: { surface: string; border: string };
  cardBg?: string;
  cardBorder?: string;
}) {
  const isNova = useIsNova();
  const shimmerX = useSharedValue(-1);
  const borderGlow = useSharedValue(0);

  useEffect(() => {
    if (!isNova) return;
    shimmerX.value = withRepeat(
      withTiming(2, { duration: 2800, easing: Easing.inOut(Easing.quad) }),
      -1,
      false,
    );
    borderGlow.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 2000 }),
        withTiming(0, { duration: 2000 }),
      ),
      -1,
      false,
    );
  }, [isNova]);

  const shimmerStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: interpolate(shimmerX.value, [-1, 2], [-SCREEN_W, SCREEN_W]) }],
  }));

  if (!isNova) {
    return (
      <View
        style={[
          novaCardStyles.card,
          { backgroundColor: cardBg ?? themeColors.surface, borderColor: cardBorder ?? themeColors.border },
          style,
        ]}
      >
        {children}
      </View>
    );
  }

  return (
    <View style={[novaCardStyles.wrapper, style]}>
      {/* Gradient border */}
      <LinearGradient
        colors={["#7c3aed", "#06b6d4", "#f43f5e", "#a855f7"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={novaCardStyles.gradientBorder}
      />
      {/* Card surface */}
      <View style={[novaCardStyles.innerCard, { backgroundColor: "#0D0B1E" }]}>
        {/* Shimmer sweep — very subtle violet sheen */}
        <Animated.View style={[novaCardStyles.shimmerContainer, shimmerStyle]} pointerEvents="none">
          <LinearGradient
            colors={["transparent", "rgba(168,85,247,0.07)", "rgba(168,85,247,0.10)", "rgba(168,85,247,0.07)", "transparent"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={{ width: 180, height: "100%" }}
          />
        </Animated.View>
        {children}
      </View>
    </View>
  );
}

const novaCardStyles = StyleSheet.create({
  wrapper: {
    borderRadius: 16,
    padding: 1.5, // border thickness
    overflow: "hidden",
  },
  gradientBorder: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 16,
  },
  innerCard: {
    borderRadius: 15,
    overflow: "hidden",
  },
  shimmerContainer: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    width: 120,
    zIndex: 1,
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: "hidden",
  },
});

// ─── Nova Button ──────────────────────────────────────────────────────────────
/**
 * Primary button with pulsing violet glow shadow.
 * Wraps any Pressable/TouchableOpacity child.
 */
export function NovaGlow({
  children,
  style,
}: {
  children: ReactNode;
  style?: ViewStyle;
}) {
  const isNova = useIsNova();
  const glowOpacity = useSharedValue(0.6);
  const glowScale = useSharedValue(1);

  useEffect(() => {
    if (!isNova) return;
    glowOpacity.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 1200, easing: Easing.inOut(Easing.quad) }),
        withTiming(0.4, { duration: 1200, easing: Easing.inOut(Easing.quad) }),
      ),
      -1,
      false,
    );
    glowScale.value = withRepeat(
      withSequence(
        withTiming(1.08, { duration: 1200, easing: Easing.inOut(Easing.quad) }),
        withTiming(1, { duration: 1200, easing: Easing.inOut(Easing.quad) }),
      ),
      -1,
      false,
    );
  }, [isNova]);

  const glowStyle = useAnimatedStyle(() => ({
    opacity: glowOpacity.value,
    transform: [{ scale: glowScale.value }],
  }));

  if (!isNova) return <View style={style}>{children}</View>;

  return (
    <View style={[{ alignItems: "center", justifyContent: "center" }, style]}>
      {/* Glow halo behind button */}
      <Animated.View
        style={[
          glowStyle,
          {
            position: "absolute",
            width: "110%",
            height: "140%",
            borderRadius: 50,
            backgroundColor: "#7c3aed",
            opacity: 0.35,
          },
        ]}
        pointerEvents="none"
      />
      {/* Second glow ring */}
      <Animated.View
        style={[
          glowStyle,
          {
            position: "absolute",
            width: "125%",
            height: "160%",
            borderRadius: 50,
            backgroundColor: "#06b6d4",
            opacity: 0.15,
          },
        ]}
        pointerEvents="none"
      />
      {children}
    </View>
  );
}
