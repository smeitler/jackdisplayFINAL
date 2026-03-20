/**
 * WellnessIcon
 *
 * Flat SVG icons for the four wellness categories.
 * Each icon is a single-color flat design, sized to fit the wellness card.
 *
 * Meditate → Peace symbol (circle + vertical + two diagonal lines)
 * Sleep    → Crescent moon with stars
 * Move     → Dumbbell
 * Focus    → Music note
 */

import Svg, { Path, Circle, Line, G } from "react-native-svg";

type WellnessCategory = "meditate" | "sleep" | "move" | "focus";

interface WellnessIconProps {
  category: WellnessCategory;
  size?: number;
  color?: string;
}

// ── Meditate: Peace symbol ────────────────────────────────────────────────────
// Classic ☮ — outer circle, vertical line down from centre, two diagonal lines
function MeditateIcon({ size = 28, color = "#FF8C42" }: { size?: number; color?: string }) {
  const sw = size * 0.1; // stroke width scales with size
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {/* Outer circle */}
      <Circle cx="12" cy="12" r="9" stroke={color} strokeWidth={sw} />
      {/* Vertical line: top centre → bottom centre */}
      <Line x1="12" y1="3" x2="12" y2="21" stroke={color} strokeWidth={sw} strokeLinecap="round" />
      {/* Bottom-left diagonal: centre → lower-left */}
      <Line x1="12" y1="12" x2="4.5" y2="19.5" stroke={color} strokeWidth={sw} strokeLinecap="round" />
      {/* Bottom-right diagonal: centre → lower-right */}
      <Line x1="12" y1="12" x2="19.5" y2="19.5" stroke={color} strokeWidth={sw} strokeLinecap="round" />
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

// ── Move: Dumbbell ────────────────────────────────────────────────────────────
function MoveIcon({ size = 28, color = "#22C55E" }: { size?: number; color?: string }) {
  const sw = size * 0.11;
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {/* Left outer plate */}
      <Line x1="3" y1="9" x2="3" y2="15" stroke={color} strokeWidth={sw * 2.2} strokeLinecap="round" />
      {/* Left inner collar */}
      <Line x1="6" y1="8" x2="6" y2="16" stroke={color} strokeWidth={sw * 1.5} strokeLinecap="round" />
      {/* Bar */}
      <Line x1="6" y1="12" x2="18" y2="12" stroke={color} strokeWidth={sw} strokeLinecap="round" />
      {/* Right inner collar */}
      <Line x1="18" y1="8" x2="18" y2="16" stroke={color} strokeWidth={sw * 1.5} strokeLinecap="round" />
      {/* Right outer plate */}
      <Line x1="21" y1="9" x2="21" y2="15" stroke={color} strokeWidth={sw * 2.2} strokeLinecap="round" />
    </Svg>
  );
}

// ── Focus: music note ─────────────────────────────────────────────────────────
function FocusIcon({ size = 28, color = "#3B82F6" }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {/* Stem + flag */}
      <Path
        d="M9 18V5L21 3V16"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Bottom note head */}
      <Circle cx="6" cy="18" r="3" fill={color} />
      {/* Top note head */}
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
