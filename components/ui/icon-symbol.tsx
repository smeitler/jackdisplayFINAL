// Fallback for using MaterialIcons on Android and web.

import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { SymbolWeight } from "expo-symbols";
import { ComponentProps } from "react";
import { OpaqueColorValue, type StyleProp, type TextStyle } from "react-native";

type MaterialIconName = ComponentProps<typeof MaterialIcons>["name"];

const MAPPING: Record<string, MaterialIconName> = {
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
  "flag.fill": "flag",
  "person.fill.xmark": "person-remove",
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
  "wifi": "wifi",
  "desktopcomputer": "monitor",
  "qrcode": "qr-code",
  "qrcode.viewfinder": "qr-code-scanner",
  "antenna.radiowaves.left.and.right": "wifi-tethering",
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
  "arrow.up": "arrow-upward",
  "arrow.up.right": "north-east",
  "music.note": "music-note",
  "headphones": "headphones",
  "person.wave.2.fill": "record-voice-over",
  "bolt.fill": "bolt",
  "speaker.wave.2.fill": "volume-up",
  "play.fill": "play-arrow",
  "stop.fill": "stop",
  "moon.stars.fill": "bedtime",
  "waveform": "graphic-eq",
  "mic.fill": "mic",
  "mic": "mic-none",
  "book.fill": "menu-book",
  "book.closed.fill": "book",
  "diamond.fill": "diamond",
  "pause.fill": "pause",
  "arrow.counterclockwise": "replay",
  "self.improvement": "self-improvement",
  "fast.forward": "fast-forward",
  "nightlight": "nightlight",
  "spa": "spa",
  // Life area / category icons
  "figure.strengthtraining.traditional": "fitness-center",
  "brain.head.profile.fill": "psychology",
  "heart.circle.fill": "favorite",
  "scope": "my-location",
  "briefcase.fill": "work",
  "banknote.fill": "payments",
  "hands.and.sparkles.fill": "volunteer-activism",
  "sun.max.fill": "wb-sunny",
  "rosette": "workspace-premium",
  // Journal section icons
  "map.pin": "place",
  "map.fill": "map",
  "doc.fill": "description",
  "doc.text.fill": "article",
  "doc.on.doc": "content-copy",
  "folder.fill": "folder",
  "paperclip": "attach-file",
  "video.fill": "videocam",
  "location.fill": "location-on",
  "tag.fill": "label",
  "magnifyingglass": "search",
  "clipboard.data.fill": "assignment",
  "chart.clipboard.fill": "assignment",
};

export type IconSymbolName = keyof typeof MAPPING;

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
  const iconName = MAPPING[name] ?? "help-outline";
  return <MaterialIcons color={color} size={size} name={iconName} style={style} />;
}
