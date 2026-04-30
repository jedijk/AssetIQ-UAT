/**
 * Polyfills for older browsers that may cause white screens.
 * These should be imported at the very beginning of the app.
 */

// ResizeObserver polyfill for older browsers
if (typeof window !== 'undefined' && typeof window.ResizeObserver === 'undefined') {
  // Simple ResizeObserver polyfill that uses requestAnimationFrame
  window.ResizeObserver = class ResizeObserverPolyfill {
    constructor(callback) {
      this.callback = callback;
      this.observedElements = new Map();
      this.rafId = null;
    }

    observe(target) {
      if (!target || this.observedElements.has(target)) return;
      
      const lastSize = { width: 0, height: 0 };
      this.observedElements.set(target, lastSize);
      
      const check = () => {
        const entries = [];
        this.observedElements.forEach((size, el) => {
          const rect = el.getBoundingClientRect();
          if (rect.width !== size.width || rect.height !== size.height) {
            size.width = rect.width;
            size.height = rect.height;
            entries.push({
              target: el,
              contentRect: rect,
              borderBoxSize: [{ blockSize: rect.height, inlineSize: rect.width }],
              contentBoxSize: [{ blockSize: rect.height, inlineSize: rect.width }],
            });
          }
        });
        if (entries.length > 0 && this.callback) {
          try {
            this.callback(entries, this);
          } catch (e) {
            console.warn('ResizeObserver callback error:', e);
          }
        }
        this.rafId = requestAnimationFrame(check);
      };
      
      this.rafId = requestAnimationFrame(check);
    }

    unobserve(target) {
      this.observedElements.delete(target);
      if (this.observedElements.size === 0 && this.rafId) {
        cancelAnimationFrame(this.rafId);
        this.rafId = null;
      }
    }

    disconnect() {
      this.observedElements.clear();
      if (this.rafId) {
        cancelAnimationFrame(this.rafId);
        this.rafId = null;
      }
    }
  };
}

// IntersectionObserver polyfill for older browsers
if (typeof window !== 'undefined' && typeof window.IntersectionObserver === 'undefined') {
  window.IntersectionObserver = class IntersectionObserverPolyfill {
    constructor(callback, options = {}) {
      this.callback = callback;
      this.root = options.root || null;
      this.rootMargin = options.rootMargin || '0px';
      this.threshold = options.threshold || 0;
      this.observedElements = new Set();
      this.checkInterval = null;
    }

    observe(target) {
      if (!target || this.observedElements.has(target)) return;
      this.observedElements.add(target);
      
      if (!this.checkInterval) {
        this.checkInterval = setInterval(() => this._check(), 200);
      }
    }

    unobserve(target) {
      this.observedElements.delete(target);
      if (this.observedElements.size === 0 && this.checkInterval) {
        clearInterval(this.checkInterval);
        this.checkInterval = null;
      }
    }

    disconnect() {
      this.observedElements.clear();
      if (this.checkInterval) {
        clearInterval(this.checkInterval);
        this.checkInterval = null;
      }
    }

    _check() {
      const entries = [];
      this.observedElements.forEach((el) => {
        const rect = el.getBoundingClientRect();
        const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
        const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
        const isIntersecting = rect.top < viewportHeight && rect.bottom > 0 &&
                               rect.left < viewportWidth && rect.right > 0;
        entries.push({
          target: el,
          boundingClientRect: rect,
          intersectionRatio: isIntersecting ? 1 : 0,
          isIntersecting,
          rootBounds: null,
          time: Date.now(),
        });
      });
      if (entries.length > 0 && this.callback) {
        try {
          this.callback(entries, this);
        } catch (e) {
          console.warn('IntersectionObserver callback error:', e);
        }
      }
    }
  };
}

// Array.prototype.at polyfill
if (!Array.prototype.at) {
  Array.prototype.at = function(index) {
    const len = this.length;
    const relativeIndex = index < 0 ? len + index : index;
    if (relativeIndex < 0 || relativeIndex >= len) return undefined;
    return this[relativeIndex];
  };
}

// String.prototype.at polyfill
if (!String.prototype.at) {
  String.prototype.at = function(index) {
    const len = this.length;
    const relativeIndex = index < 0 ? len + index : index;
    if (relativeIndex < 0 || relativeIndex >= len) return undefined;
    return this[relativeIndex];
  };
}

// Object.hasOwn polyfill
if (!Object.hasOwn) {
  Object.hasOwn = function(obj, prop) {
    return Object.prototype.hasOwnProperty.call(obj, prop);
  };
}

// globalThis polyfill
if (typeof globalThis === 'undefined') {
  if (typeof window !== 'undefined') {
    window.globalThis = window;
  } else if (typeof global !== 'undefined') {
    global.globalThis = global;
  } else if (typeof self !== 'undefined') {
    self.globalThis = self;
  }
}

// Promise.allSettled polyfill
if (!Promise.allSettled) {
  Promise.allSettled = function(promises) {
    return Promise.all(
      promises.map(p =>
        Promise.resolve(p)
          .then(value => ({ status: 'fulfilled', value }))
          .catch(reason => ({ status: 'rejected', reason }))
      )
    );
  };
}

// queueMicrotask polyfill
if (typeof queueMicrotask !== 'function') {
  window.queueMicrotask = function(callback) {
    Promise.resolve().then(callback).catch(e => setTimeout(() => { throw e; }));
  };
}

// structuredClone polyfill (basic implementation)
if (typeof structuredClone !== 'function') {
  window.structuredClone = function(obj) {
    try {
      return JSON.parse(JSON.stringify(obj));
    } catch (e) {
      console.warn('structuredClone fallback failed:', e);
      return obj;
    }
  };
}

// AbortController polyfill (minimal)
if (typeof AbortController === 'undefined') {
  window.AbortController = class AbortControllerPolyfill {
    constructor() {
      this.signal = { aborted: false, addEventListener: () => {}, removeEventListener: () => {} };
    }
    abort() {
      this.signal.aborted = true;
    }
  };
}

// Log that polyfills were loaded
try {
  if (typeof console !== 'undefined' && console.log) {
    console.log('[Polyfills] Loaded for older browser support');
  }
} catch (e) {}

export default {};
