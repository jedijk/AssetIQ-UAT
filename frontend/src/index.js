import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import App from "./App";

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

// Register Service Worker for PWA
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/service-worker.js')
      .then((registration) => {
        console.log('ServiceWorker registered: ', registration.scope);
        // Force update check on every page load
        registration.update();
      })
      .catch((error) => {
        console.log('ServiceWorker registration failed: ', error);
      });
  });
}

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
