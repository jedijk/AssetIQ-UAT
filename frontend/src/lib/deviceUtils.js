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
