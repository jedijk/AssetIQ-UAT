// Lightweight client-side debugging (opt-in)
// Enable by setting: REACT_APP_DEBUG=true
// For mobile debugging, this provides comprehensive instrumentation

export const DEBUG_ENABLED = String(process.env.REACT_APP_DEBUG || "").toLowerCase() === "true";

// Circular buffer for events
const MAX_EVENTS = 500;
const eventBuffer = [];
let renderCounts = {};
let activeTimers = new Map();
let lastFpsTime = 0;
let frameCount = 0;
let currentFps = 0;
let fpsHistory = [];

function nowIso() {
  try {
    return new Date().toISOString();
  } catch {
    return "";
  }
}

function safeJson(v) {
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

// Add event to circular buffer
function addToBuffer(entry) {
  eventBuffer.push(entry);
  while (eventBuffer.length > MAX_EVENTS) {
    eventBuffer.shift();
  }
}

export function debugLog(event, data = {}) {
  if (!DEBUG_ENABLED) return;
  const entry = { t: nowIso(), event, ...data };
  // eslint-disable-next-line no-console
  console.log("[AssetIQ][DBG]", entry);
  addToBuffer(entry);
  try {
    const key = "assetiq_debug_log_v1";
    const prev = JSON.parse(localStorage.getItem(key) || "[]");
    prev.push(entry);
    while (prev.length > 200) prev.shift();
    localStorage.setItem(key, JSON.stringify(prev));
  } catch {
    // ignore storage errors
  }
}

// Track React component renders
export function trackRender(componentName) {
  if (!DEBUG_ENABLED) return;
  renderCounts[componentName] = (renderCounts[componentName] || 0) + 1;
  const count = renderCounts[componentName];
  
  // Log if render count is high (potential infinite loop)
  if (count % 10 === 0) {
    debugLog("high_render_count", { 
      component: componentName, 
      count,
      warning: count > 50 ? "POTENTIAL_INFINITE_LOOP" : undefined
    });
  }
}

// Track timer creation (setInterval, setTimeout)
export function trackTimer(type, id, callback, delay) {
  if (!DEBUG_ENABLED) return;
  const timerInfo = {
    type,
    id,
    delay,
    createdAt: nowIso(),
    stack: new Error().stack?.split("\n").slice(2, 5).join(" -> ") || "unknown"
  };
  activeTimers.set(id, timerInfo);
  debugLog("timer_created", timerInfo);
}

// Track timer cleanup
export function trackTimerClear(type, id) {
  if (!DEBUG_ENABLED) return;
  const timer = activeTimers.get(id);
  if (timer) {
    debugLog("timer_cleared", { type, id, duration: Date.now() - new Date(timer.createdAt).getTime() });
    activeTimers.delete(id);
  }
}

// FPS monitoring for detecting visual glitches
function measureFps() {
  if (!DEBUG_ENABLED) return;
  
  const now = performance.now();
  frameCount++;
  
  if (now - lastFpsTime >= 1000) {
    currentFps = Math.round(frameCount * 1000 / (now - lastFpsTime));
    fpsHistory.push({ t: nowIso(), fps: currentFps });
    
    // Keep last 60 seconds of FPS data
    while (fpsHistory.length > 60) {
      fpsHistory.shift();
    }
    
    // Log if FPS drops significantly (potential flickering indicator)
    if (currentFps < 30) {
      debugLog("fps_drop", { 
        fps: currentFps, 
        warning: "LOW_FPS",
        activeTimers: activeTimers.size,
        memoryMB: getMemoryUsage()
      });
    }
    
    frameCount = 0;
    lastFpsTime = now;
  }
  
  requestAnimationFrame(measureFps);
}

// Get memory usage if available
function getMemoryUsage() {
  try {
    if (performance.memory) {
      return Math.round(performance.memory.usedJSHeapSize / 1024 / 1024);
    }
  } catch {
    // Memory API not available
  }
  return null;
}

// Track state changes
export function trackStateChange(stateName, prevValue, newValue, componentName) {
  if (!DEBUG_ENABLED) return;
  
  // Only log if values actually differ
  const prevStr = safeJson(prevValue);
  const newStr = safeJson(newValue);
  
  if (prevStr !== newStr) {
    debugLog("state_change", {
      component: componentName,
      state: stateName,
      prev: prevStr.length > 100 ? prevStr.substring(0, 100) + "..." : prevStr,
      new: newStr.length > 100 ? newStr.substring(0, 100) + "..." : newStr
    });
  }
}

// Capture snapshot on suspected flickering
export function captureFlickerSnapshot(trigger = "manual") {
  if (!DEBUG_ENABLED) return null;
  
  const snapshot = {
    capturedAt: nowIso(),
    trigger,
    route: window.location.pathname,
    fps: {
      current: currentFps,
      history: fpsHistory.slice(-10)
    },
    renders: { ...renderCounts },
    activeTimers: Array.from(activeTimers.values()),
    memory: getMemoryUsage(),
    visibility: document.visibilityState,
    recentEvents: eventBuffer.slice(-30),
    userAgent: navigator.userAgent,
    screenSize: {
      width: window.innerWidth,
      height: window.innerHeight,
      devicePixelRatio: window.devicePixelRatio
    }
  };
  
  debugLog("flicker_snapshot", snapshot);
  
  // Save to localStorage for later analysis
  try {
    localStorage.setItem("assetiq_flicker_snapshot", JSON.stringify(snapshot));
  } catch {
    // ignore storage errors
  }
  
  return snapshot;
}

// Detect rapid re-renders (potential cause of flickering)
let lastRenderTime = 0;
let rapidRenderCount = 0;

export function detectRapidRenders() {
  if (!DEBUG_ENABLED) return;
  
  const now = performance.now();
  if (now - lastRenderTime < 16) { // Less than 1 frame (60fps = 16.67ms)
    rapidRenderCount++;
    
    if (rapidRenderCount >= 5) {
      debugLog("rapid_renders_detected", {
        count: rapidRenderCount,
        warning: "POTENTIAL_FLICKER_SOURCE",
        suggestion: "Check useEffect dependencies and state updates"
      });
      
      // Auto-capture snapshot on rapid renders
      if (rapidRenderCount >= 10) {
        captureFlickerSnapshot("rapid_renders");
      }
    }
  } else {
    rapidRenderCount = 0;
  }
  
  lastRenderTime = now;
}

// Monitor long tasks that might cause jank
function monitorLongTasks() {
  if (!DEBUG_ENABLED) return;
  if (typeof PerformanceObserver === "undefined") return;
  
  try {
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.duration > 50) { // Tasks longer than 50ms
          debugLog("long_task", {
            duration: Math.round(entry.duration),
            startTime: Math.round(entry.startTime),
            warning: entry.duration > 100 ? "BLOCKING_TASK" : undefined
          });
        }
      }
    });
    
    observer.observe({ entryTypes: ["longtask"] });
  } catch {
    // Long task API not supported
  }
}

export function installGlobalDebugHooks() {
  if (!DEBUG_ENABLED) return;
  if (typeof window === "undefined") return;
  if (window.__assetiqDebugInstalled) return;
  window.__assetiqDebugInstalled = true;

  window.__assetiqDebug = {
    enabled: true,
    dump: () => {
      try {
        const key = "assetiq_debug_log_v1";
        return JSON.parse(localStorage.getItem(key) || "[]");
      } catch {
        return [];
      }
    },
    clear: () => {
      try {
        localStorage.removeItem("assetiq_debug_log_v1");
        localStorage.removeItem("assetiq_flicker_snapshot");
        renderCounts = {};
        activeTimers.clear();
        eventBuffer.length = 0;
        fpsHistory.length = 0;
      } catch {
        // ignore
      }
    },
    getSnapshot: () => captureFlickerSnapshot("manual"),
    getLastSnapshot: () => {
      try {
        return JSON.parse(localStorage.getItem("assetiq_flicker_snapshot") || "null");
      } catch {
        return null;
      }
    },
    getStats: () => ({
      renderCounts: { ...renderCounts },
      activeTimers: activeTimers.size,
      fps: currentFps,
      memory: getMemoryUsage(),
      eventCount: eventBuffer.length
    }),
    getFpsHistory: () => [...fpsHistory],
    getActiveTimers: () => Array.from(activeTimers.values())
  };

  debugLog("debug_enabled", {
    href: window.location.href,
    ua: navigator.userAgent,
    isMobile: /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent),
    screen: {
      width: window.screen.width,
      height: window.screen.height,
      orientation: window.screen.orientation?.type
    }
  });

  // Error handlers
  window.addEventListener("error", (e) => {
    debugLog("window_error", {
      message: e?.message,
      filename: e?.filename,
      lineno: e?.lineno,
      colno: e?.colno,
      error: e?.error ? String(e.error) : undefined,
    });
  });

  window.addEventListener("unhandledrejection", (e) => {
    debugLog("unhandled_rejection", {
      reason: e?.reason ? safeJson(e.reason) : undefined,
    });
  });

  // Visibility changes (important for mobile)
  document.addEventListener("visibilitychange", () => {
    debugLog("visibility_change", { 
      state: document.visibilityState,
      activeTimers: activeTimers.size
    });
    
    // Capture snapshot when returning from background (common flicker trigger)
    if (document.visibilityState === "visible") {
      setTimeout(() => {
        if (currentFps < 30 || rapidRenderCount > 3) {
          captureFlickerSnapshot("visibility_return");
        }
      }, 500);
    }
  });

  // Page lifecycle events
  window.addEventListener("pageshow", (e) => {
    debugLog("pageshow", { persisted: !!e?.persisted });
  });

  window.addEventListener("pagehide", (e) => {
    debugLog("pagehide", { persisted: !!e?.persisted });
  });

  // Focus/blur events (important for mobile)
  window.addEventListener("focus", () => {
    debugLog("window_focus", { activeTimers: activeTimers.size });
  });

  window.addEventListener("blur", () => {
    debugLog("window_blur", { activeTimers: activeTimers.size });
  });

  // Resize events (can trigger re-renders)
  let resizeTimeout;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
      debugLog("window_resize", {
        width: window.innerWidth,
        height: window.innerHeight,
        orientation: window.screen.orientation?.type
      });
    }, 250);
  });

  // Orientation change (mobile specific)
  window.addEventListener("orientationchange", () => {
    debugLog("orientation_change", {
      orientation: window.screen.orientation?.type,
      angle: window.screen.orientation?.angle
    });
  });

  // Network status changes
  window.addEventListener("online", () => {
    debugLog("network_online", {});
  });

  window.addEventListener("offline", () => {
    debugLog("network_offline", {});
  });

  // Start FPS monitoring
  lastFpsTime = performance.now();
  requestAnimationFrame(measureFps);

  // Start long task monitoring
  monitorLongTasks();

  // Wrap setInterval to track timers
  const originalSetInterval = window.setInterval;
  window.setInterval = function(callback, delay, ...args) {
    const id = originalSetInterval.call(window, callback, delay, ...args);
    trackTimer("setInterval", id, callback?.name || "anonymous", delay);
    return id;
  };

  // Wrap clearInterval to track cleanup
  const originalClearInterval = window.clearInterval;
  window.clearInterval = function(id) {
    trackTimerClear("clearInterval", id);
    return originalClearInterval.call(window, id);
  };

  // Wrap setTimeout for important timers (>1s)
  const originalSetTimeout = window.setTimeout;
  window.setTimeout = function(callback, delay, ...args) {
    const id = originalSetTimeout.call(window, callback, delay, ...args);
    if (delay >= 1000) {
      trackTimer("setTimeout", id, callback?.name || "anonymous", delay);
    }
    return id;
  };

  // eslint-disable-next-line no-console
  console.log("[AssetIQ] Debug mode enabled. Access via window.__assetiqDebug");
  // eslint-disable-next-line no-console
  console.log("[AssetIQ] Commands: dump(), clear(), getSnapshot(), getStats(), getFpsHistory()");
}

