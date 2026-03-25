import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { Appearance, View } from "react-native";
import { colorScheme as nativewindColorScheme, vars } from "nativewind";
import AsyncStorage from "@react-native-async-storage/async-storage";

import {
  AppTheme,
  AppThemeColorScheme,
  AppThemePalettes,
  type ColorScheme,
  type ThemeColorPalette,
} from "@/constants/theme";

const THEME_STORAGE_KEY = "app_theme";

type ThemeContextValue = {
  colorScheme: ColorScheme;
  appTheme: AppTheme;
  setAppTheme: (theme: AppTheme) => void;
  colors: ThemeColorPalette;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [appTheme, setAppThemeState] = useState<AppTheme>("purple");

  // Load persisted theme on mount
  useEffect(() => {
    AsyncStorage.getItem(THEME_STORAGE_KEY).then((saved) => {
      const validThemes: AppTheme[] = ["purple","white","black","punk","valley","airy","nova","calm"];
      if (saved && validThemes.includes(saved as AppTheme)) {
        applyTheme(saved as AppTheme);
        setAppThemeState(saved as AppTheme);
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const applyTheme = useCallback((theme: AppTheme) => {
    const scheme: ColorScheme = AppThemeColorScheme[theme];
    const palette = AppThemePalettes[theme];

    nativewindColorScheme.set(scheme);
    Appearance.setColorScheme?.(scheme);

    if (typeof document !== "undefined") {
      const root = document.documentElement;
      root.dataset.theme = scheme;
      root.classList.toggle("dark", scheme === "dark");
      Object.entries(palette).forEach(([token, value]) => {
        root.style.setProperty(`--color-${token}`, value as string);
      });
    }
  }, []);

  const setAppTheme = useCallback((theme: AppTheme) => {
    setAppThemeState(theme);
    applyTheme(theme);
    AsyncStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [applyTheme]);

  // Apply on mount after state is set
  useEffect(() => {
    applyTheme(appTheme);
  }, [applyTheme, appTheme]);

  const colorScheme: ColorScheme = AppThemeColorScheme[appTheme];
  const colors = AppThemePalettes[appTheme];

  const themeVariables = useMemo(
    () =>
      vars({
        "color-primary": colors.primary,
        "color-background": colors.background,
        "color-surface": colors.surface,
        "color-foreground": colors.foreground,
        "color-muted": colors.muted,
        "color-border": colors.border,
        "color-success": colors.success,
        "color-warning": colors.warning,
        "color-error": colors.error,
      }),
    [colors],
  );

  const value = useMemo(
    () => ({
      colorScheme,
      appTheme,
      setAppTheme,
      colors,
    }),
    [colorScheme, appTheme, setAppTheme, colors],
  );

  return (
    <ThemeContext.Provider value={value}>
      <View style={[{ flex: 1 }, themeVariables]}>{children}</View>
    </ThemeContext.Provider>
  );
}

export function useThemeContext(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useThemeContext must be used within ThemeProvider");
  }
  return ctx;
}
