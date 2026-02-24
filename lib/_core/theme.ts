import { Platform } from "react-native";

import themeConfig from "@/theme.config";

export type ColorScheme = "light" | "dark";

// Named app themes
export type AppTheme = "blue" | "light" | "dark";

export const ThemeColors = themeConfig.themeColors;

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

/** Blue theme: current purple/blue brand palette */
const bluePalette: ThemeColorPalette = makeThemePalette(
  '#6C63FF', // primary
  '#F8F7FF', // background
  '#FFFFFF', // surface
  '#1A1A2E', // foreground
  '#7A7A9D', // muted
  '#E2E0F5', // border
  '#22C55E', // success
  '#F59E0B', // warning
  '#EF4444', // error
);

/** Light theme: clean iOS-style neutral white */
const lightPalette: ThemeColorPalette = makeThemePalette(
  '#007AFF', // primary
  '#FFFFFF', // background
  '#F2F2F7', // surface
  '#000000', // foreground
  '#8E8E93', // muted
  '#E5E5EA', // border
  '#34C759', // success
  '#FF9500', // warning
  '#FF3B30', // error
);

/** Dark theme: true black OLED */
const darkPalette: ThemeColorPalette = makeThemePalette(
  '#6C63FF', // primary
  '#000000', // background
  '#111111', // surface
  '#FFFFFF', // foreground
  '#8E8E93', // muted
  '#222222', // border
  '#4ADE80', // success
  '#FBBF24', // warning
  '#F87171', // error
);

export const AppThemePalettes: Record<AppTheme, ThemeColorPalette> = {
  blue: bluePalette,
  light: lightPalette,
  dark: darkPalette,
};

export const AppThemeColorScheme: Record<AppTheme, ColorScheme> = {
  blue: "light",
  light: "light",
  dark: "dark",
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
