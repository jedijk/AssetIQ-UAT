import React from "react";
import { debugLog } from "../lib/debug";
import { attemptChunkRecovery, isChunkLoadFailure } from "../lib/chunkRecovery";

export class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    try {
      const msg = String(error?.message || error || "");
      if (isChunkLoadFailure(msg)) {
        setTimeout(() => {
          attemptChunkRecovery("app_error_boundary");
        }, 300);
      }
    } catch (_e) {}

    try {
      debugLog("react_error_boundary", {
        message: String(error?.message || error),
        stack: String(error?.stack || ""),
        componentStack: String(info?.componentStack || ""),
        context: this.props.context || "",
      });
    } catch (_e) {}
  }

  handleHardReload = async () => {
    try {
      if ("serviceWorker" in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((r) => r.unregister()));
      }
      if ("caches" in window) {
        const names = await caches.keys();
        await Promise.all(names.map((n) => caches.delete(n)));
      }
    } catch (_e) {}
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      const title = this.props.title || "Something went wrong";
      const subtitle = this.props.subtitle || "Try reloading the page.";
      return (
        <div className="min-h-[60vh] flex items-center justify-center p-6 bg-white">
          <div className="max-w-md w-full border border-slate-200 rounded-xl p-5">
            <div className="text-base font-semibold text-slate-900">{title}</div>
            <div className="text-sm text-slate-600 mt-1">{subtitle}</div>
            <button
              type="button"
              className="mt-4 inline-flex items-center justify-center px-4 py-2 rounded-lg bg-slate-900 text-white font-semibold"
              onClick={this.handleHardReload}
            >
              Reload
            </button>
            <div className="mt-3 text-[11px] text-slate-400 break-words">
              {String(this.state.error?.message || "")}
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

