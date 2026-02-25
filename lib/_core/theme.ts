import { Platform } from "react-native";

import themeConfig from "@/theme.config";

export type ColorScheme = "light" | "dark";

// Named app themes
export type AppTheme = "purple" | "white" | "black" | "punk" | "valley" | "airy";

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

/** Purple theme: original dark navy/purple brand palette */
const purplePalette: ThemeColorPalette = makeThemePalette(
  '#7B74FF', // primary
  '#0F0E1A', // background (deep dark navy)
  '#1C1B2E', // surface
  '#EEEEFF', // foreground
  '#9090B8', // muted
  '#2E2D45', // border
  '#4ADE80', // success
  '#FBBF24', // warning
  '#F87171', // error
);

/** White theme: clean pure white, iOS-style */
const whitePalette: ThemeColorPalette = makeThemePalette(
  '#007AFF', // primary
  '#FFFFFF', // background (pure white)
  '#FFFFFF', // surface (pure white — no grey tint)
  '#000000', // foreground
  '#8E8E93', // muted
  '#E5E5EA', // border
  '#34C759', // success
  '#FF9500', // warning
  '#FF3B30', // error
);

/** Black theme: true black OLED */
const blackPalette: ThemeColorPalette = makeThemePalette(
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

/** Momentum Valley theme: deep forest green + warm amber on rich dark earth */
const valleyPalette: ThemeColorPalette = makeThemePalette(
  '#4ADE80', // primary — vivid green
  '#0D1A0F', // background — deep forest black-green
  '#162318', // surface — dark moss
  '#E8F5E9', // foreground — soft leaf white
  '#6B9E72', // muted — muted sage
  '#1E3A22', // border — dark forest
  '#86EFAC', // success — bright mint
  '#FCD34D', // warning — warm amber
  '#F87171', // error — soft red
);

/**
 * Airy theme: inspired by Monument Valley's dreamy pastel aesthetic.
 * Soft dusty rose primary, misty lavender-white background, warm sandy surface,
 * deep muted slate text — the same ethereal, calming palette as the game.
 */
const airyPalette: ThemeColorPalette = makeThemePalette(
  '#C084A8', // primary — dusty rose / soft magenta (MV accent)
  '#F5F0F7', // background — misty lavender-white
  '#EDE8F2', // surface — pale lilac card
  '#2D2438', // foreground — deep muted plum text
  '#8E7FA0', // muted — soft lavender-grey
  '#D8CEEA', // border — pale violet
  '#7ECBA1', // success — muted sage green (MV greenery)
  '#E8B86D', // warning — warm sandy amber (MV warm tones)
  '#D97B8A', // error — soft dusty pink
);

/** Punk theme: cyberpunk neon magenta + cyan on true black */
const punkPalette: ThemeColorPalette = makeThemePalette(
  '#FF00FF', // primary — neon magenta
  '#000000', // background — true black
  '#0D0D0D', // surface — near-black
  '#00FFFF', // foreground — neon cyan
  '#CC00CC', // muted — dim magenta
  '#330033', // border — dark magenta
  '#00FF99', // success — neon green
  '#FF6600', // warning — neon orange
  '#FF0055', // error — hot pink
);

export const AppThemePalettes: Record<AppTheme, ThemeColorPalette> = {
  purple: purplePalette,
  white: whitePalette,
  black: blackPalette,
  punk: punkPalette,
  valley: valleyPalette,
  airy: airyPalette,
};

export const AppThemeColorScheme: Record<AppTheme, ColorScheme> = {
  purple: "dark",
  white: "light",
  black: "dark",
  punk: "dark",
  valley: "dark",
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
