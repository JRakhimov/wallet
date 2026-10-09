import { useEffect } from "react";
import { syncTelegramColors } from "./telegram";

export type ThemePreference = "system" | "light" | "dark";

/** Applies the owner's theme to <html> and keeps Telegram's header in the same colors. */
export function useThemeSync(theme: ThemePreference | undefined) {
  useEffect(() => {
    if (!theme) {
      return;
    }
    document.documentElement.dataset.theme = theme;
    document.documentElement.lang = "ru";
    syncTelegramColors();
  }, [theme]);

  // "system" follows the OS: repaint Telegram's header when the OS theme flips.
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    media.addEventListener("change", syncTelegramColors);
    return () => media.removeEventListener("change", syncTelegramColors);
  }, []);
}
