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
  "chevron.up": "keyboard-arrow-up",
  "chevron.down": "expand-more",
  "chevron.left": "chevron-left",
  "plus": "add",
  "plus.circle.fill": "add-circle",
  "minus.circle.fill": "remove-circle",
  "trash.fill": "delete",
  "trash": "delete-outline",
  "plus.circle": "add-circle-outline",
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
  "clock.arrow.circlepath": "snooze",
  "list.bullet": "list",
  "person.fill": "person",
  "person.2.fill": "group",
  "dollarsign.circle.fill": "attach-money",
  "brain.head.profile": "psychology",
  "brain": "psychology",
  "figure.walk": "directions-walk",
  "arrow.right": "arrow-forward",
  "info.circle": "info",
  "trophy.fill": "emoji-events",
  "circle.fill": "circle",
  "circle": "radio-button-unchecked",
  "photo.stack.fill": "photo-library",
  "sparkles": "auto-awesome",
  "alarm.fill": "alarm",
  "arrow.right.circle.fill": "arrow-circle-right",
  "arrow.up.arrow.down": "swap-vert",
  "line.3.horizontal": "drag-handle",
  "person.3.fill": "groups",
  "bubble.left.fill": "chat",
  "link": "link",
  "square.and.arrow.up": "share",
  "gift.fill": "card-giftcard",
  "eye.fill": "visibility",
  "lock.fill": "lock",
  "lock.open.fill": "lock-open",
  "line.3.horizontal.decrease": "menu",
  "camera.fill": "camera-alt",
  "photo.fill": "photo",
  "text.bubble.fill": "comment",
  "hand.thumbsup.fill": "thumb-up",
  "ellipsis": "more-horiz",
  "crown.fill": "workspace-premium",
  "medal.fill": "military-tech",
  "arrow.up.right": "north-east",
  "music.note": "music-note",
  "headphones": "headphones",
  "speaker.wave.2.fill": "volume-up",
  "play.fill": "play-arrow",
  "stop.fill": "stop",
  "moon.stars.fill": "bedtime",
  "waveform": "graphic-eq",
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
