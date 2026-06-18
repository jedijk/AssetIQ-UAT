import { isPublicKioskPath } from "./publicRoutes";

/**
 * Shared device detection helpers (iOS/iPadOS virtualization quirks, etc.).
 */

/** Samsung/Tizen and other embedded TV browsers with limited ES/CSS support. */
export function isSamsungTVBrowser() {
  if (typeof navigator === "undefined") return false;
  const ua = (navigator.userAgent || "").toLowerCase();
  return (
    ua.includes("tizen") ||
    ua.includes("smarttv") ||
    ua.includes("smart-tv") ||
    ua.includes("hbbtv") ||
    (ua.includes("samsung") && (ua.includes("tv") || ua.includes("smarthub")))
  );
}

/** TV display routes or known TV user agents — skip SW, version checks, StrictMode. */
export function isDisplayKioskContext() {
  if (typeof window === "undefined") return false;
  if (isSamsungTVBrowser()) return true;
  try {
    return isPublicKioskPath(window.location.pathname);
  } catch (_e) {
    return false;
  }
}

export function isIOSLikeDevice() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  return (
    /iPhone|iPad|iPod/i.test(ua) ||
    (ua.includes("Mac") && typeof document !== "undefined" && "ontouchend" in document)
  );
}

/** Alias used by print flows and legacy call sites. */
export const isIOS = isIOSLikeDevice;

export function isAndroidDevice() {
  if (typeof navigator === "undefined") return false;
  return /Android/i.test(navigator.userAgent || "");
}

/** Touch-first mobile browsers where heavy exit animations often break DOM unmount. */
export function isTouchMobileDevice() {
  return isIOSLikeDevice() || isAndroidDevice();
}

export function isConnectedDomNode(node) {
  return !!(node && node.nodeType === 1 && node.isConnected);
}
