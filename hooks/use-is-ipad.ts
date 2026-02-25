import { useWindowDimensions } from "react-native";

/**
 * Returns true when the app is running on a large screen (iPad or wide web).
 * Threshold: 768px width — covers iPad mini and above.
 */
export function useIsIPad(): boolean {
  const { width } = useWindowDimensions();
  return width >= 768;
}

/**
 * Returns a max-width for content containers on iPad.
 * Keeps content centered and readable on large screens.
 */
export function useContentMaxWidth(): number | undefined {
  const isIPad = useIsIPad();
  return isIPad ? 720 : undefined;
}
