/**
 * CategoryIcon
 * Renders a clean vector icon for a goal/category instead of an emoji.
 * Maps life area IDs and category IDs to SF Symbol names (iOS) / Material Icons (Android/web).
 */
import { View, StyleSheet } from "react-native";
import { IconSymbol } from "@/components/ui/icon-symbol";

// Map life area id → SF Symbol name
const LIFE_AREA_ICON: Record<string, Parameters<typeof IconSymbol>[0]["name"]> = {
  body:          "figure.strengthtraining.traditional",
  mind:          "brain.head.profile",
  relationships: "heart.circle.fill",
  focus:         "scope",
  career:        "briefcase.fill",
  money:         "banknote.fill",
  contribution:  "hands.and.sparkles.fill",
  spirituality:  "sun.max.fill",
};

// Fallback: map category id → SF Symbol name (for custom categories or when lifeArea is absent)
const CATEGORY_ICON: Record<string, Parameters<typeof IconSymbol>[0]["name"]> = {
  body:          "figure.strengthtraining.traditional",
  mind:          "brain.head.profile",
  relationships: "heart.circle.fill",
  focus:         "scope",
  career:        "briefcase.fill",
  money:         "banknote.fill",
  contribution:  "hands.and.sparkles.fill",
  spirituality:  "sun.max.fill",
};

const DEFAULT_ICON: Parameters<typeof IconSymbol>[0]["name"] = "star.fill";

export function getCategoryIconName(
  categoryId: string,
  lifeArea?: string,
): Parameters<typeof IconSymbol>[0]["name"] {
  if (lifeArea && LIFE_AREA_ICON[lifeArea]) return LIFE_AREA_ICON[lifeArea];
  if (CATEGORY_ICON[categoryId]) return CATEGORY_ICON[categoryId];
  return DEFAULT_ICON;
}

interface CategoryIconProps {
  categoryId: string;
  lifeArea?: string;
  size?: number;
  color: string;
  /** If provided, wraps the icon in a rounded square with this background color */
  bgColor?: string;
  bgSize?: number;
  borderRadius?: number;
}

export function CategoryIcon({
  categoryId,
  lifeArea,
  size = 22,
  color,
  bgColor,
  bgSize,
  borderRadius = 10,
}: CategoryIconProps) {
  const iconName = getCategoryIconName(categoryId, lifeArea);

  if (bgColor) {
    const boxSize = bgSize ?? size + 16;
    return (
      <View
        style={[
          styles.iconBox,
          { width: boxSize, height: boxSize, borderRadius, backgroundColor: bgColor },
        ]}
      >
        <IconSymbol name={iconName} size={size} color={color} />
      </View>
    );
  }

  return <IconSymbol name={iconName} size={size} color={color} />;
}

const styles = StyleSheet.create({
  iconBox: {
    alignItems: "center",
    justifyContent: "center",
  },
});
