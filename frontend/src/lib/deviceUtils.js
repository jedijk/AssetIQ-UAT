/**
 * Shared device detection helpers (iOS/iPadOS virtualization quirks, etc.).
 */
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
