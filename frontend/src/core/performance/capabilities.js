/**
 * Central capability flags — merge device + network + optional backend overrides.
 * Import `buildCapabilities` / `defaultCapabilities` from here; React consumers should prefer `useCapabilities()`.
 */
import { getPerformanceMode } from "./deviceCapabilities";

/**
 * @typedef {import('./deviceCapabilities').PerformanceMode} PerformanceMode
 */

/**
 * @typedef {object} BackendPerformanceFlags
 * @property {boolean} [forceLiteMode]
 * @property {boolean} [disableCharts]
 */

/**
 * Build merged capability snapshot.
 * @param {BackendPerformanceFlags} [backend]
 * @returns {{
 *   mode: PerformanceMode,
 *   animations: boolean,
 *   highResImages: boolean,
 *   realtimeUpdates: boolean,
 *   complexCharts: boolean,
 *   backgroundSync: boolean,
 *   maxListItems: number,
 *   pollingIntervalMs: number,
 *   dashboardPollingMs: number,
 * }}
 */
export function buildCapabilities(backend = {}) {
  let mode = getPerformanceMode();
  if (backend.forceLiteMode === true) mode = "lite";

  const connection =
    typeof navigator !== "undefined" ? navigator.connection || navigator.mozConnection || navigator.webkitConnection : null;
  const slowNetwork =
    connection &&
    (connection.effectiveType === "2g" ||
      connection.effectiveType === "slow-2g" ||
      connection.saveData === true);

  let animations = mode === "full";
  let highResImages = mode === "full";
  let realtimeUpdates = mode === "full";
  let complexCharts = mode === "full";
  let backgroundSync = mode === "full";

  if (slowNetwork) {
    realtimeUpdates = false;
    highResImages = false;
  }

  if (backend.disableCharts === true) {
    complexCharts = false;
  }

  if (mode === "lite") {
    animations = false;
    complexCharts = false;
    realtimeUpdates = false;
    backgroundSync = false;
  }

  const maxListItems = mode === "lite" ? 20 : 100;

  const pollingIntervalMs = realtimeUpdates ? 15_000 : 45_000;
  const dashboardPollingMs = realtimeUpdates ? 60_000 : 120_000;

  return {
    mode,
    animations,
    highResImages,
    realtimeUpdates,
    complexCharts,
    backgroundSync,
    maxListItems,
    pollingIntervalMs,
    dashboardPollingMs,
  };
}

/** Synchronous defaults before async `/api/config/performance` merge */
export const defaultCapabilities = buildCapabilities({});

/**
 * Apply backend flags onto a fresh snapshot (immutable).
 * @param {BackendPerformanceFlags} flags
 * @returns {ReturnType<typeof buildCapabilities>}
 */
export function applyBackendOverrides(flags) {
  return buildCapabilities(flags || {});
}
