/**
 * CalmEffects — Visual effects layer for the Calm theme.
 *
 * Design language:
 *  - Deep navy backgrounds (#0D1135)
 *  - Flat navy header — NO gradients
 *  - Amber accent line only
 *  - Tall pill bars for period stats (red/yellow/green fill from bottom)
 *  - Rounded elevated cards
 *  - Soft blue-grey muted text
 */
import React, { ReactNode } from "react";
import {
  View,
  Text,
  StyleSheet,
  ViewStyle,
  TextStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useThemeContext } from "@/lib/theme-provider";

// ─── Hook ─────────────────────────────────────────────────────────────────────
export function useIsCalm() {
  const { appTheme } = useThemeContext();
  return appTheme === "calm";
}

// ─── Calm Header ──────────────────────────────────────────────────────────────
/**
 * Flat navy header — no gradient, no date, no icons.
 * Just the app/screen title with an amber accent underline.
 */
export function CalmHeader({
  title,
  style,
}: {
  title?: string;
  style?: ViewStyle;
}) {
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        {
          backgroundColor: "#0D1135",
          paddingTop: insets.top + 10,
          paddingBottom: 12,
          paddingHorizontal: 20,
        },
        style,
      ]}
    >
      {title ? (
        <Text style={styles.headerTitle}>{title}</Text>
      ) : null}
      {/* Amber accent underline */}
      <View style={styles.headerAccentLine} />
    </View>
  );
}

// ─── Calm Pill Bars ───────────────────────────────────────────────────────────
/**
 * Three tall pill bars showing 3 rolling periods.
 * Each pill fills from bottom up with a color based on score:
 *   - 0%: empty (dark navy)
 *   - 1–59%: red (#EF4444)
 *   - 60–89%: amber (#F5A623)
 *   - 90–100%: green (#22C55E)
 *
 * Current period pill is wider and uses amber/gold fill.
 */
export function CalmPillBars({
  periods,
}: {
  periods: Array<{
    done: number;
    goal: number;
    weekLabel: string;  // e.g. "Wk 3 & 4"
    monthLabel: string; // e.g. "Feb"
    isCurrent: boolean;
  }>;
}) {
  const PILL_H = 160;
  const PILL_W_NORMAL = 72;
  const PILL_W_CURRENT = 90;

  return (
    <View style={pillStyles.container}>
      {periods.map((p, i) => {
        const pct = p.goal > 0 ? Math.min(p.done / p.goal, 1) : 0;
        const fillH = Math.round(PILL_H * pct);

        // Color logic
        let fillColor: string;
        if (pct === 0) {
          fillColor = "transparent";
        } else if (pct >= 0.9) {
          fillColor = "#22C55E"; // green
        } else if (pct >= 0.6) {
          fillColor = "#F5A623"; // amber
        } else {
          fillColor = "#EF4444"; // red
        }

        // Current period always uses amber/gold
        if (p.isCurrent && pct > 0) {
          fillColor = "#F5A623";
        }

        const pillW = p.isCurrent ? PILL_W_CURRENT : PILL_W_NORMAL;

        return (
          <View key={i} style={pillStyles.pillarWrapper}>
            {/* Pill container */}
            <View
              style={[
                pillStyles.pillOuter,
                {
                  width: pillW,
                  height: PILL_H,
                  backgroundColor: "#1A2050",
                },
              ]}
            >
              {/* Fill from bottom */}
              {fillH > 0 && (
                <View
                  style={{
                    position: "absolute",
                    bottom: 0,
                    left: 0,
                    right: 0,
                    height: fillH,
                    backgroundColor: fillColor,
                    borderRadius: pillW / 2,
                  }}
                />
              )}
            </View>

            {/* Labels below */}
            <Text
              style={[
                pillStyles.weekLabel,
                p.isCurrent && pillStyles.weekLabelCurrent,
              ]}
            >
              {p.weekLabel}
            </Text>
            <Text
              style={[
                pillStyles.monthLabel,
                p.isCurrent && pillStyles.monthLabelCurrent,
              ]}
            >
              {p.monthLabel}
            </Text>
            {p.isCurrent && <View style={pillStyles.currentDot} />}
          </View>
        );
      })}
    </View>
  );
}

// ─── Calm Card ────────────────────────────────────────────────────────────────
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
    fontSize: 22,
    fontWeight: "700",
    color: "#FFFFFF",
    letterSpacing: -0.3,
    marginBottom: 8,
  },
  headerAccentLine: {
    width: 32,
    height: 3,
    backgroundColor: "#F5A623",
    borderRadius: 2,
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

const pillStyles = StyleSheet.create({
  container: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "flex-end",
    gap: 16,
    paddingVertical: 16,
    paddingHorizontal: 8,
  },
  pillarWrapper: {
    alignItems: "center",
    gap: 6,
  },
  pillOuter: {
    borderRadius: 999,
    overflow: "hidden",
    position: "relative",
  },
  weekLabel: {
    fontSize: 11,
    color: "#8B9CC8",
    fontWeight: "400",
    textAlign: "center",
  },
  weekLabelCurrent: {
    color: "#FFFFFF",
    fontWeight: "600",
  },
  monthLabel: {
    fontSize: 15,
    color: "#8B9CC8",
    fontWeight: "400",
    textAlign: "center",
  },
  monthLabelCurrent: {
    color: "#FFFFFF",
    fontWeight: "700",
  },
  currentDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: "#FFFFFF",
    marginTop: 2,
  },
});
