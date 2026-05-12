import { useEffect } from "react";
import { toast } from "sonner";
import { useAuth } from "../contexts/AuthContext";
import { useLanguage } from "../contexts/LanguageContext";

const RELEASE_TOAST_VERSION = process.env.REACT_APP_VERSION || "3.6.8";
const STORAGE_KEY = `assetiq_announced_lite_mode_${RELEASE_TOAST_VERSION}`;

/**
 * One-time toast per app version after login (production releases).
 */
export function ProductionReleaseToast() {
  const { user, loading } = useAuth();
  const { t } = useLanguage();

  useEffect(() => {
    if (loading || !user) return undefined;

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
  }, [loading, user, t]);

  return null;
}
