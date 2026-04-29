/**
 * Device-side hints for adaptive performance (lite vs full).
 * @typedef {'full' | 'lite'} PerformanceMode
 */

/**
 * Heuristic: low RAM or few CPU cores → prefer lite UI paths.
 * deviceMemory / hardwareConcurrency are undefined on many browsers → assume capable.
 * @returns {boolean}
 */
export function detectLowEndDevice() {
  if (typeof navigator === "undefined") return false;
  const memory = navigator.deviceMemory ?? 4;
  const cores = navigator.hardwareConcurrency ?? 4;
  return memory <= 2 || cores <= 2;
}

/**
 * Base mode before backend overrides (see capabilities.js).
 * Debug: localStorage.setItem('forceLiteMode','true') | forceFullMode
 * @returns {PerformanceMode}
 */
export function getPerformanceMode() {
  try {
    if (typeof localStorage !== "undefined") {
      if (localStorage.getItem("forceLiteMode") === "true") return "lite";
      if (localStorage.getItem("forceFullMode") === "true") return "full";
    }
  } catch (_e) {
    /* private mode */
  }
  return detectLowEndDevice() ? "lite" : "full";
}
