import { type ThemeColorPalette } from "@/constants/theme";
import { useThemeContext } from "@/lib/theme-provider";

/**
 * Returns the current theme's color palette.
 * Reads from the active named app theme (blue / light / dark).
 * Usage: const colors = useColors(); then colors.primary, colors.background, etc.
 */
export function useColors(): ThemeColorPalette {
  const { colors } = useThemeContext();
  return colors;
}
