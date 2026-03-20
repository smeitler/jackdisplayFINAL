/**
 * WellnessIcon
 *
 * Uses user-supplied PNG assets for Meditate, Move, and Focus,
 * tinted to the card's brand color via the `tintColor` style prop.
 * Sleep keeps a clean SVG crescent moon.
 */

import { Image, ImageSourcePropType, ImageStyle, StyleProp } from "react-native";
import Svg, { Path, Circle } from "react-native-svg";

type WellnessCategory = "meditate" | "sleep" | "move" | "focus";

interface WellnessIconProps {
  category: WellnessCategory;
  size?: number;
  color?: string;
}

// PNG assets (bundled at build time)
const ASSETS: Record<"meditate" | "move" | "focus", ImageSourcePropType> = {
  meditate: require("@/assets/images/wellness-meditate.png") as ImageSourcePropType,
  move: require("@/assets/images/wellness-move.png") as ImageSourcePropType,
  focus: require("@/assets/images/wellness-focus.png") as ImageSourcePropType,
};

// ── Sleep: crescent moon (SVG — no PNG provided) ──────────────────────────────
function SleepIcon({ size = 28, color = "#B07FD0" }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z"
        fill={color}
      />
      <Path
        d="M18 3L18.5 4.5L20 5L18.5 5.5L18 7L17.5 5.5L16 5L17.5 4.5Z"
        fill={color}
      />
      <Path
        d="M21 8L21.3 8.9L22.2 9L21.3 9.1L21 10L20.7 9.1L19.8 9L20.7 8.9Z"
        fill={color}
      />
    </Svg>
  );
}

// ── PNG icon with tintColor ───────────────────────────────────────────────────
function PngIcon({
  source,
  size = 28,
  color,
}: {
  source: ImageSourcePropType;
  size?: number;
  color: string;
}) {
  const style: StyleProp<ImageStyle> = {
    width: size,
    height: size,
    tintColor: color,
    resizeMode: "contain",
  };
  return <Image source={source} style={style} />;
}

// ── Public component ──────────────────────────────────────────────────────────
export function WellnessIcon({ category, size = 28, color }: WellnessIconProps) {
  switch (category) {
    case "meditate":
      return <PngIcon source={ASSETS.meditate} size={size} color={color ?? "#FF8C42"} />;
    case "sleep":
      return <SleepIcon size={size} color={color ?? "#B07FD0"} />;
    case "move":
      return <PngIcon source={ASSETS.move} size={size} color={color ?? "#22C55E"} />;
    case "focus":
      return <PngIcon source={ASSETS.focus} size={size} color={color ?? "#3B82F6"} />;
  }
}
