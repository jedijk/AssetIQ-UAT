import { useLayoutEffect, useState } from "react";
import { applyKioskCompatClasses } from "../lib/kioskCompat";

const THEME_CLASS_PREFIX = "vmb-theme-";

/**
 * Apply the same document-level classes as the Samsung TV kiosk (/tv).
 * Keeps preview, editor TV mode, and paired displays visually aligned.
 */
export function useKioskDocumentTheme(theme = "dark", { enabled = true, fullscreen = true } = {}) {
  const [, setReady] = useState(0);

  useLayoutEffect(() => {
    if (!enabled || typeof document === "undefined") return undefined;

    const html = document.documentElement;
    const themeClass = `${THEME_CLASS_PREFIX}${theme === "light" ? "light" : "dark"}`;
    const added = ["display-kiosk", "vmb-legacy-tv", themeClass];
    if (fullscreen) added.push("vmb-kiosk");

    added.forEach((cls) => html.classList.add(cls));
    applyKioskCompatClasses();
    setReady((n) => n + 1);

    return () => {
      added.forEach((cls) => html.classList.remove(cls));
    };
  }, [enabled, fullscreen, theme]);
}
