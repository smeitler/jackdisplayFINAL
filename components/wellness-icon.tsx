/**
 * WellnessIcon
 *
 * Flat SVG icons for the four wellness categories.
 * Each icon is a single-color flat design, sized to fit the wellness card.
 */

import Svg, { Path, Circle, Ellipse, G, Rect, Line, Polygon } from "react-native-svg";

type WellnessCategory = "meditate" | "sleep" | "move" | "focus";

interface WellnessIconProps {
  category: WellnessCategory;
  size?: number;
  color?: string;
}

// ── Meditate: seated lotus silhouette ────────────────────────────────────────
function MeditateIcon({ size = 28, color = "#FF8C42" }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {/* Head */}
      <Circle cx="12" cy="4.5" r="2" fill={color} />
      {/* Body / torso */}
      <Path
        d="M12 7.5C10 7.5 8.5 9 8 11H16C15.5 9 14 7.5 12 7.5Z"
        fill={color}
      />
      {/* Left arm resting on knee */}
      <Path
        d="M8 11C6.5 11.5 5 12.5 4.5 14H8.5L8 11Z"
        fill={color}
      />
      {/* Right arm resting on knee */}
      <Path
        d="M16 11C17.5 11.5 19 12.5 19.5 14H15.5L16 11Z"
        fill={color}
      />
      {/* Crossed legs / base */}
      <Path
        d="M4.5 14C4 15.5 4.5 17 6 17.5L9 16L12 17L15 16L18 17.5C19.5 17 20 15.5 19.5 14H4.5Z"
        fill={color}
      />
      {/* Ground line */}
      <Path
        d="M5 19.5H19"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </Svg>
  );
}

// ── Sleep: crescent moon with stars ──────────────────────────────────────────
function SleepIcon({ size = 28, color = "#B07FD0" }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {/* Crescent moon */}
      <Path
        d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z"
        fill={color}
      />
      {/* Small star top-right */}
      <Path
        d="M18 3L18.5 4.5L20 5L18.5 5.5L18 7L17.5 5.5L16 5L17.5 4.5Z"
        fill={color}
      />
      {/* Tiny star */}
      <Path
        d="M21 8L21.3 8.9L22.2 9L21.3 9.1L21 10L20.7 9.1L19.8 9L20.7 8.9Z"
        fill={color}
      />
    </Svg>
  );
}

// ── Move: running figure ──────────────────────────────────────────────────────
function MoveIcon({ size = 28, color = "#22C55E" }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {/* Head */}
      <Circle cx="14.5" cy="3.5" r="2" fill={color} />
      {/* Torso */}
      <Path
        d="M13 6L10 12L13 13L11 19"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Forward arm */}
      <Path
        d="M13 8L17 10"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
      />
      {/* Back arm */}
      <Path
        d="M11 10L8 8"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
      />
      {/* Forward leg */}
      <Path
        d="M11 19L14 22"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
      />
      {/* Back leg */}
      <Path
        d="M13 13L9 16L7 20"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

// ── Focus: music note ─────────────────────────────────────────────────────────
function FocusIcon({ size = 28, color = "#3B82F6" }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {/* Single music note */}
      <Path
        d="M9 18V5L21 3V16"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Note head (bottom of stem) */}
      <Circle cx="6" cy="18" r="3" fill={color} />
      {/* Note head (top) */}
      <Circle cx="18" cy="16" r="3" fill={color} />
    </Svg>
  );
}

// ── Exports ───────────────────────────────────────────────────────────────────

export function WellnessIcon({ category, size = 28, color }: WellnessIconProps) {
  switch (category) {
    case "meditate":
      return <MeditateIcon size={size} color={color ?? "#FF8C42"} />;
    case "sleep":
      return <SleepIcon size={size} color={color ?? "#B07FD0"} />;
    case "move":
      return <MoveIcon size={size} color={color ?? "#22C55E"} />;
    case "focus":
      return <FocusIcon size={size} color={color ?? "#3B82F6"} />;
  }
}
