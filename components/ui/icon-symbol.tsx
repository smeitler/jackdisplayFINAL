// Fallback for using MaterialIcons on Android and web.

import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { SymbolWeight, SymbolViewProps } from "expo-symbols";
import { ComponentProps } from "react";
import { OpaqueColorValue, type StyleProp, type TextStyle } from "react-native";

type IconMapping = Record<SymbolViewProps["name"], ComponentProps<typeof MaterialIcons>["name"]>;
type IconSymbolName = keyof typeof MAPPING;

const MAPPING = {
  // Navigation
  "house.fill": "home",
  "chart.bar.fill": "bar-chart",
  "bell.fill": "notifications",
  "gearshape.fill": "settings",
  // Actions
  "paperplane.fill": "send",
  "chevron.left.forwardslash.chevron.right": "code",
  "chevron.right": "chevron-right",
  "chevron.left": "chevron-left",
  "chevron.down": "expand-more",
  "plus": "add",
  "plus.circle.fill": "add-circle",
  "minus.circle.fill": "remove-circle",
  "trash.fill": "delete",
  "trash": "delete-outline",
  "plus.circle": "add-circle-outline",
  "chevron.up": "expand-less",
  "pencil": "edit",
  "checkmark": "check",
  "checkmark.circle.fill": "check-circle",
  "checkmark.circle": "radio-button-unchecked",
  "xmark": "close",
  "xmark.circle.fill": "cancel",
  // Content
  "heart.fill": "favorite",
  "star.fill": "star",
  "flame.fill": "local-fire-department",
  "calendar": "calendar-today",
  "clock.fill": "access-time",
  "list.bullet": "list",
  "person.fill": "person",
  "person.2.fill": "group",
  "dollarsign.circle.fill": "attach-money",
  "brain.head.profile": "psychology",
  "figure.walk": "directions-walk",
  "arrow.right": "arrow-forward",
  "info.circle": "info",
  "trophy.fill": "emoji-events",
  "circle.fill": "circle",
  "circle": "radio-button-unchecked",
  "photo.stack.fill": "photo-library",
  "sparkles": "auto-awesome",
} as IconMapping;

export function IconSymbol({
  name,
  size = 24,
  color,
  style,
}: {
  name: IconSymbolName;
  size?: number;
  color: string | OpaqueColorValue;
  style?: StyleProp<TextStyle>;
  weight?: SymbolWeight;
}) {
  return <MaterialIcons color={color} size={size} name={MAPPING[name]} style={style} />;
}
