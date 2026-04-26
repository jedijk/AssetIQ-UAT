import React from "react";
import { debugLog } from "../lib/debug";

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
      debugLog("react_error_boundary", {
        message: String(error?.message || error),
        stack: String(error?.stack || ""),
        componentStack: String(info?.componentStack || ""),
        context: this.props.context || "",
      });
    } catch (_e) {}
  }

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
              onClick={() => window.location.reload()}
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

