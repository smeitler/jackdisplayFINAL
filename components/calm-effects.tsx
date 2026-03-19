/**
 * CalmEffects — Visual effects layer for the Calm theme.
 *
 * Inspired by the Headspace/Calm app aesthetic:
 *  - Deep navy backgrounds (#0D1135)
 *  - Warm amber→orange gradient headers with curved bottom edge
 *  - Rounded elevated cards
 *  - Soft blue-grey muted text
 *
 * Provides:
 *  - useIsCalm: hook to check if Calm theme is active
 *  - CalmHeader: curved gradient header (amber→orange→navy)
 *  - CalmCard: elevated navy card with subtle border
 *  - CalmSectionTitle: bold white section heading
 */
import React, { ReactNode } from "react";
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  ViewStyle,
  TextStyle,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useThemeContext } from "@/lib/theme-provider";
import Svg, { Path } from "react-native-svg";

const { width: SCREEN_W } = Dimensions.get("window");

// ─── Hook ─────────────────────────────────────────────────────────────────────
export function useIsCalm() {
  const { appTheme } = useThemeContext();
  return appTheme === "calm";
}

// ─── Calm Header ──────────────────────────────────────────────────────────────
/**
 * Curved gradient header with amber→orange→deep-navy gradient.
 * The bottom edge has a concave arch shape matching the Headspace aesthetic.
 *
 * Usage:
 * ```tsx
 * <CalmHeader title="Today" subtitle="March 19" />
 * ```
 */
export function CalmHeader({
  title,
  subtitle,
  rightContent,
  height = 160,
  style,
}: {
  title?: string;
  subtitle?: string;
  rightContent?: ReactNode;
  height?: number;
  style?: ViewStyle;
}) {
  const insets = useSafeAreaInsets();
  const totalHeight = height + insets.top;
  const curveDepth = 28; // how deep the concave arch dips

  // SVG path for concave bottom arch
  // Starts at bottom-left, curves up to center, then back down to bottom-right
  const archPath = `M 0 0 L ${SCREEN_W} 0 L ${SCREEN_W} ${curveDepth} Q ${SCREEN_W / 2} ${-curveDepth} 0 ${curveDepth} Z`;

  return (
    <View style={[{ height: totalHeight + curveDepth, overflow: "hidden" }, style]}>
      <LinearGradient
        colors={["#F5A623", "#E8751A", "#C0392B", "#1a1f5e"]}
        locations={[0, 0.35, 0.65, 1]}
        style={StyleSheet.absoluteFill}
      />
      {/* Content area above the arch */}
      <View
        style={{
          paddingTop: insets.top + 12,
          paddingHorizontal: 20,
          paddingBottom: curveDepth + 8,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <View style={{ flex: 1 }}>
          {title ? (
            <Text style={styles.headerTitle}>{title}</Text>
          ) : null}
          {subtitle ? (
            <Text style={styles.headerSubtitle}>{subtitle}</Text>
          ) : null}
        </View>
        {rightContent ? (
          <View style={{ marginLeft: 12 }}>{rightContent}</View>
        ) : null}
      </View>
      {/* Concave arch overlay — navy color to create the arch illusion */}
      <View
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          height: curveDepth * 2,
        }}
        pointerEvents="none"
      >
        <Svg
          width={SCREEN_W}
          height={curveDepth * 2}
          viewBox={`0 0 ${SCREEN_W} ${curveDepth * 2}`}
        >
          <Path
            d={`M 0 ${curveDepth * 2} Q ${SCREEN_W / 2} 0 ${SCREEN_W} ${curveDepth * 2} Z`}
            fill="#0D1135"
          />
        </Svg>
      </View>
    </View>
  );
}

// ─── Calm Card ────────────────────────────────────────────────────────────────
/**
 * Elevated navy card with subtle border and rounded corners.
 */
export function CalmCard({
  children,
  style,
}: {
  children: ReactNode;
  style?: ViewStyle;
}) {
  return (
    <View style={[styles.card, style]}>
      {children}
    </View>
  );
}

// ─── Calm Section Title ───────────────────────────────────────────────────────
/**
 * Bold white section heading with optional amber accent underline.
 */
export function CalmSectionTitle({
  children,
  style,
  showAccent = false,
}: {
  children: string;
  style?: TextStyle;
  showAccent?: boolean;
}) {
  return (
    <View style={{ marginBottom: showAccent ? 12 : 8 }}>
      <Text style={[styles.sectionTitle, style]}>{children}</Text>
      {showAccent && (
        <View style={styles.accentLine} />
      )}
    </View>
  );
}

// ─── Calm List Row ────────────────────────────────────────────────────────────
/**
 * Dark navy list row card — used for habit rows, journal entries, etc.
 */
export function CalmListRow({
  children,
  style,
}: {
  children: ReactNode;
  style?: ViewStyle;
}) {
  return (
    <View style={[styles.listRow, style]}>
      {children}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  headerTitle: {
    fontSize: 26,
    fontWeight: "700",
    color: "#FFFFFF",
    letterSpacing: -0.3,
  },
  headerSubtitle: {
    fontSize: 14,
    color: "rgba(255,255,255,0.75)",
    marginTop: 2,
    fontWeight: "400",
  },
  card: {
    backgroundColor: "#1A2050",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#252D6E",
    padding: 16,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: "#FFFFFF",
    letterSpacing: -0.2,
  },
  accentLine: {
    width: 32,
    height: 3,
    backgroundColor: "#F5A623",
    borderRadius: 2,
    marginTop: 4,
  },
  listRow: {
    backgroundColor: "#1A2050",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#252D6E",
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 8,
  },
});
