import { clearAppCaches } from "./chunkRecovery";

const KIOSK_PATH_PREFIXES = ["/tv", "/display", "/vmb/"];

export function isKioskLocation(pathname = "") {
  const path = pathname || (typeof window !== "undefined" ? window.location.pathname : "");
  return (
    path === "/tv" ||
    path.startsWith("/tv/") ||
    path === "/display" ||
    path.startsWith("/display/") ||
    path.startsWith("/vmb/")
  );
}

/**
 * Clear SW/cache storage and ensure kiosk URLs carry a cache-bust query param
 * so Samsung/Tizen browsers fetch fresh tv.html + kiosk.js bundles.
 * Returns false when a hard redirect was triggered (caller must not render).
 */
export async function prepareKioskBoot() {
  if (typeof window === "undefined") return true;

  try {
    await clearAppCaches();
  } catch (_e) {
    /* ignore */
  }

  const url = new URL(window.location.href);
  if (!isKioskLocation(url.pathname)) {
    return true;
  }

  if (!url.searchParams.has("_cb")) {
    url.searchParams.set("_cb", String(Date.now()));
    window.location.replace(url.toString());
    return false;
  }

  return true;
}

export function kioskBoardUrl(extraParams = {}) {
  const params = new URLSearchParams({
    fullscreen: "true",
    _cb: String(Date.now()),
    ...extraParams,
  });
  return `/tv/board?${params.toString()}`;
}
