"use client";

import { useTheme, type ThemeName } from "@/contexts/ThemeContext";
import { Palette, Check } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function ThemeSwitcher() {
  const { theme, setTheme, availableThemes } = useTheme();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="w-full flex items-center justify-between px-3 py-2 bg-black/20 hover:bg-black/30 border border-white/10 rounded-lg transition-colors">
          <div className="flex items-center gap-2">
            <Palette className="w-4 h-4 text-gray-400" />
            <span className="text-xs text-gray-300">Theme</span>
          </div>
          <div className="flex items-center gap-2">
            <div
              className="w-4 h-4 rounded-full"
              style={{
                background: `linear-gradient(135deg, ${availableThemes.find(t => t.name === theme)?.colors.primary}, ${availableThemes.find(t => t.name === theme)?.colors.secondary})`,
              }}
            />
            <span className="text-xs text-white capitalize">{theme}</span>
          </div>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56 bg-black border-white/10" align="start" side="top">
        {availableThemes.map((themeOption) => {
          const isSelected = themeOption.name === theme;
          
          return (
            <DropdownMenuItem
              key={themeOption.name}
              onClick={() => setTheme(themeOption.name as ThemeName)}
              className={`flex items-center gap-3 cursor-pointer ${
                isSelected ? "bg-white/10" : ""
              }`}
            >
              <div
                className="w-6 h-6 rounded-full shrink-0 border border-white/20"
                style={{
                  background: `linear-gradient(135deg, ${themeOption.colors.primary}, ${themeOption.colors.secondary})`,
                }}
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white">{themeOption.label}</p>
                <p className="text-[10px] text-gray-500 truncate">{themeOption.description}</p>
              </div>
              {isSelected && (
                <Check className="w-4 h-4 text-white shrink-0" />
              )}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
