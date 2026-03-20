// This screen is never navigated to — it exists only to create a gap
// in the tab bar for the floating + button overlay.
import { View } from "react-native";
export default function PlusPlaceholder() {
  return <View style={{ flex: 1 }} />;
}
