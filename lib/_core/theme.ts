import { Platform } from "react-native";

import { themeColors } from "@/theme.config";

export type ColorScheme = "light" | "dark";

// Named app themes — Dark, Light, Airy
export type AppTheme = "dark" | "light" | "airy";

export const ThemeColors = themeColors;

type ThemeColorTokens = typeof ThemeColors;
type ThemeColorName = keyof ThemeColorTokens;
type SchemePalette = Record<ColorScheme, Record<ThemeColorName, string>>;
type SchemePaletteItem = SchemePalette[ColorScheme];

function buildSchemePalette(colors: ThemeColorTokens): SchemePalette {
  const palette: SchemePalette = {
    light: {} as SchemePalette["light"],
    dark: {} as SchemePalette["dark"],
  };

  (Object.keys(colors) as ThemeColorName[]).forEach((name) => {
    const swatch = colors[name];
    palette.light[name] = swatch.light;
    palette.dark[name] = swatch.dark;
  });

  return palette;
}

export const SchemeColors = buildSchemePalette(ThemeColors);

type RuntimePalette = SchemePaletteItem & {
  text: string;
  tint: string;
  icon: string;
  tabIconDefault: string;
  tabIconSelected: string;
};

function buildRuntimePalette(scheme: ColorScheme): RuntimePalette {
  const base = SchemeColors[scheme];
  return {
    ...base,
    text: base.foreground,
    tint: base.primary,
    icon: base.muted,
    tabIconDefault: base.muted,
    tabIconSelected: base.primary,
  };
}

export const Colors = {
  light: buildRuntimePalette("light"),
  dark: buildRuntimePalette("dark"),
} satisfies Record<ColorScheme, RuntimePalette>;

export type ThemeColorPalette = (typeof Colors)[ColorScheme];

// ─── Named theme palettes ────────────────────────────────────────────────────

function makeThemePalette(
  primary: string,
  background: string,
  surface: string,
  foreground: string,
  muted: string,
  border: string,
  success: string,
  warning: string,
  error: string,
): ThemeColorPalette {
  return {
    primary,
    background,
    surface,
    foreground,
    muted,
    border,
    success,
    warning,
    error,
    text: foreground,
    tint: primary,
    icon: muted,
    tabIconDefault: muted,
    tabIconSelected: primary,
  };
}

/** Dark theme: true black OLED with blue accent */
const darkPalette: ThemeColorPalette = makeThemePalette(
  '#3B82F6', // primary — blue
  '#000000', // background
  '#111111', // surface
  '#FFFFFF', // foreground
  '#8E8E93', // muted
  '#222222', // border
  '#4ADE80', // success
  '#FBBF24', // warning
  '#F87171', // error
);

/** Light theme: clean pure white with blue accent */
const lightPalette: ThemeColorPalette = makeThemePalette(
  '#3B82F6', // primary — blue
  '#FFFFFF', // background
  '#F2F2F7', // surface
  '#000000', // foreground
  '#8E8E93', // muted
  '#E5E5EA', // border
  '#34C759', // success
  '#FF9500', // warning
  '#FF3B30', // error
);

/**
 * Airy theme: soft dreamy pastel aesthetic.
 * Dusty rose primary, misty lavender-white background, warm sandy surface.
 */
const airyPalette: ThemeColorPalette = makeThemePalette(
  '#C084A8', // primary — dusty rose
  '#F5F0F7', // background — misty lavender-white
  '#EDE8F2', // surface — pale lilac card
  '#2D2438', // foreground — deep muted plum text
  '#8E7FA0', // muted — soft lavender-grey
  '#D8CEEA', // border — pale violet
  '#7ECBA1', // success — muted sage green
  '#E8B86D', // warning — warm sandy amber
  '#D97B8A', // error — soft dusty pink
);

export const AppThemePalettes: Record<AppTheme, ThemeColorPalette> = {
  dark: darkPalette,
  light: lightPalette,
  airy: airyPalette,
};

export const AppThemeColorScheme: Record<AppTheme, ColorScheme> = {
  dark: "dark",
  light: "light",
  airy: "light",
};

export const Fonts = Platform.select({
  ios: {
    sans: "system-ui",
    serif: "ui-serif",
    rounded: "ui-rounded",
    mono: "ui-monospace",
  },
  default: {
    sans: "normal",
    serif: "serif",
    rounded: "normal",
    mono: "monospace",
  },
  web: {
    sans: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    serif: "Georgia, 'Times New Roman', serif",
    rounded: "'SF Pro Rounded', 'Hiragino Maru Gothic ProN', Meiryo, 'MS PGothic', sans-serif",
    mono: "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  },
});
