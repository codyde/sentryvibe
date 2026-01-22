"use client";

import {
  createContext,
  useContext,
  useMemo,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";

export type ThemeName = "sentry" | "ocean" | "ember" | "forest" | "noir";

export interface ThemeInfo {
  name: ThemeName;
  label: string;
  description: string;
  colors: {
    primary: string;
    secondary: string;
  };
}

export const THEMES: Record<ThemeName, ThemeInfo> = {
  sentry: {
    name: "sentry",
    label: "Sentry",
    description: "Purple-pink gradient theme",
    colors: {
      primary: "#a855f7",
      secondary: "#ec4899",
    },
  },
  ocean: {
    name: "ocean",
    label: "Ocean",
    description: "Cool blue & teal theme",
    colors: {
      primary: "#3b82f6",
      secondary: "#22d3ee",
    },
  },
  ember: {
    name: "ember",
    label: "Ember",
    description: "Warm orange & red theme",
    colors: {
      primary: "#f97316",
      secondary: "#ef4444",
    },
  },
  forest: {
    name: "forest",
    label: "Forest",
    description: "Green & earth tones theme",
    colors: {
      primary: "#10b981",
      secondary: "#84cc16",
    },
  },
  noir: {
    name: "noir",
    label: "Noir",
    description: "Monochrome dark theme",
    colors: {
      primary: "#ffffff",
      secondary: "#a1a1aa",
    },
  },
};

const THEME_STORAGE_KEY = "shipbuilder-theme";

interface ThemeContextValue {
  theme: ThemeName;
  themeInfo: ThemeInfo;
  setTheme: (theme: ThemeName) => void;
  availableThemes: ThemeInfo[];
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

interface ThemeProviderProps {
  children: ReactNode;
  defaultTheme?: ThemeName;
}

export function ThemeProvider({ children, defaultTheme = "sentry" }: ThemeProviderProps) {
  const [theme, setThemeState] = useState<ThemeName>(defaultTheme);
  const [mounted, setMounted] = useState(false);

  // Load theme from localStorage on mount
  useEffect(() => {
    setMounted(true);
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem(THEME_STORAGE_KEY) as ThemeName | null;
      if (stored && THEMES[stored]) {
        setThemeState(stored);
      }
    }
  }, []);

  // Apply theme class to document
  useEffect(() => {
    if (!mounted) return;
    
    const root = document.documentElement;
    
    // Remove all theme classes
    Object.keys(THEMES).forEach((t) => {
      root.classList.remove(`theme-${t}`);
    });
    
    // Add current theme class
    root.classList.add(`theme-${theme}`);
    
    // Always ensure dark class is present
    root.classList.add("dark");
  }, [theme, mounted]);

  const setTheme = useCallback((newTheme: ThemeName) => {
    if (THEMES[newTheme]) {
      setThemeState(newTheme);
      if (typeof window !== "undefined") {
        localStorage.setItem(THEME_STORAGE_KEY, newTheme);
      }
    }
  }, []);

  const value = useMemo<ThemeContextValue>(() => ({
    theme,
    themeInfo: THEMES[theme],
    setTheme,
    availableThemes: Object.values(THEMES),
  }), [theme, setTheme]);

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}
