import { useEffect } from "react";
import { toast } from "sonner";
import { useAuth } from "../contexts/AuthContext";
import { useLanguage } from "../contexts/LanguageContext";

const RELEASE_TOAST_VERSION = process.env.REACT_APP_VERSION || "3.7.4";

/**
 * One-time toast per (app version, language) pair after login.
 * Re-shows when the user switches to a new language so they see the
 * announcement in their preferred language.
 */
export function ProductionReleaseToast() {
  const { user, loading } = useAuth();
  const { t, language } = useLanguage();

  useEffect(() => {
    if (loading || !user) return undefined;

    const STORAGE_KEY = `assetiq_announced_lite_mode_${RELEASE_TOAST_VERSION}_${language || "en"}`;

    const timer = window.setTimeout(() => {
      try {
        if (localStorage.getItem(STORAGE_KEY) === "1") return;
      } catch (_e) {
        return;
      }

      const path = window.location.pathname || "";
      if (/login|register|forgot-password|reset-password/i.test(path)) return;

      try {
        localStorage.setItem(STORAGE_KEY, "1");
      } catch (_e) {}

      toast.info(t("announcements.liteModeTitle"), {
        id: "lite-mode-release-announcement",
        description: t("announcements.liteModeBody"),
        duration: 16000,
      });
    }, 700);

    return () => window.clearTimeout(timer);
  }, [loading, user, t, language]);

  return null;
}
