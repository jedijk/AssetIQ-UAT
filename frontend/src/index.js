import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import App from "./App";
import { installGlobalDebugHooks, debugLog } from "./lib/debug";

// Patch ResizeObserver to prevent "loop completed with undelivered notifications" errors
// This is a known issue with cmdk, Radix UI, and other libraries that use ResizeObserver
if (typeof window !== 'undefined') {
  const OriginalResizeObserver = window.ResizeObserver;
  
  window.ResizeObserver = class PatchedResizeObserver extends OriginalResizeObserver {
    constructor(callback) {
      const patchedCallback = (entries, observer) => {
        // Wrap callback in requestAnimationFrame to prevent loop errors
        window.requestAnimationFrame(() => {
          if (typeof callback === 'function') {
            callback(entries, observer);
          }
        });
      };
      super(patchedCallback);
    }
  };
  
  // Suppress console.error for ResizeObserver messages
  const originalError = console.error;
  console.error = (...args) => {
    const message = args[0];
    if (typeof message === 'string' && message.includes('ResizeObserver loop')) {
      return; // Suppress ResizeObserver loop errors
    }
    originalError.apply(console, args);
  };
  
  // Suppress window.onerror for ResizeObserver
  const originalOnError = window.onerror;
  window.onerror = function(message, source, lineno, colno, error) {
    if (message && message.toString().includes('ResizeObserver loop')) {
      return true; // Prevent default handling
    }
    if (originalOnError) {
      return originalOnError(message, source, lineno, colno, error);
    }
    return false;
  };
  
  // Suppress unhandled error events for ResizeObserver
  window.addEventListener('error', (event) => {
    if (event.message && event.message.includes('ResizeObserver loop')) {
      event.stopImmediatePropagation();
      event.preventDefault();
      return false;
    }
  }, true);
}

// Install global debug hooks (opt-in via REACT_APP_DEBUG=true)
installGlobalDebugHooks();

// Register Service Worker for PWA (OFF by default: avoids mobile white-screen
// issues due to stale caches / SW update races). Enable explicitly by setting:
// REACT_APP_ENABLE_SERVICE_WORKER=true at build time.
const ENABLE_SERVICE_WORKER = process.env.REACT_APP_ENABLE_SERVICE_WORKER === "true";

if ('serviceWorker' in navigator && ENABLE_SERVICE_WORKER) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/service-worker.js')
      .then((registration) => {
        console.log('ServiceWorker registered: ', registration.scope);
        debugLog("sw_registered", { scope: registration.scope });
        
        // Force update check on every page load
        registration.update();
        
        // Listen for new service worker installing
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              // New version available.
              // Do NOT interrupt the user with confirm/reload while typing.
              // The app-level version checker will show a banner when applicable.
              console.log('New version available (service worker).');
              debugLog("sw_update_available", {});
            }
          });
        });
      })
      .catch((error) => {
        console.log('ServiceWorker registration failed: ', error);
        debugLog("sw_register_failed", { error: String(error) });
      });
  });
  
  // Also check for updates when the page becomes visible again
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      navigator.serviceWorker.ready.then((registration) => {
        registration.update();
        debugLog("sw_update_check_visibility", {});
      });
    }
  });
}

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
