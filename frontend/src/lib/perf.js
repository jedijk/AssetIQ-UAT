// Lightweight, opt-in performance helpers for profiling perceived speed.
// Enabled only when REACT_APP_DEBUG_PERF=true (and never in production by default).

export const PERF_ENABLED = String(process.env.REACT_APP_DEBUG_PERF || "").toLowerCase() === "true";

export function perfMark(name, detail) {
  if (!PERF_ENABLED) return;
  try {
    performance.mark(name, detail ? { detail } : undefined);
  } catch (_e) {}
}

export function perfMeasure(name, startMark, endMark) {
  if (!PERF_ENABLED) return null;
  try {
    const m = performance.measure(name, startMark, endMark);
    return m;
  } catch (_e) {
    return null;
  }
}

export function installPerfObservers() {
  if (!PERF_ENABLED) return () => {};
  const cleanups = [];
  try {
    // Long tasks (main-thread jank). Not supported on all browsers.
    if (typeof PerformanceObserver !== "undefined") {
      const longTaskObs = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          // Only log truly noticeable stalls.
          if (entry.duration >= 120) {
            // eslint-disable-next-line no-console
            console.log("[perf] longtask", { duration: Math.round(entry.duration), startTime: Math.round(entry.startTime) });
          }
        }
      });
      try {
        longTaskObs.observe({ entryTypes: ["longtask"] });
        cleanups.push(() => longTaskObs.disconnect());
      } catch (_e) {}
    }
  } catch (_e) {}

  return () => {
    cleanups.forEach((fn) => {
      try {
        fn();
      } catch (_e) {}
    });
  };
}

export function createRenderCounter(label) {
  let count = 0;
  return function bump(extra) {
    if (!PERF_ENABLED) return;
    count += 1;
    // eslint-disable-next-line no-console
    console.log("[perf] render", label, { count, ...(extra || {}) });
  };
}

