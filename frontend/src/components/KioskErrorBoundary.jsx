import React from "react";
import { debugLog } from "../lib/debug";
import { clearAppCaches, hardReloadWithCacheBust, isChunkLoadFailure } from "../lib/chunkRecovery";

/**
 * Route-level error boundary for /tv kiosk pages.
 * Inline styles only — must render on Samsung TV browsers without Tailwind.
 */
class KioskErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    try {
      debugLog("kiosk_error_boundary", {
        message: String(error?.message || error),
        stack: String(error?.stack || ""),
        componentStack: String(errorInfo?.componentStack || ""),
        url: window.location.href,
        userAgent: navigator.userAgent,
      });
    } catch (_e) {
      console.error("KioskErrorBoundary caught:", error);
    }
  }

  handleReload = async () => {
    try {
      await clearAppCaches();
    } catch (_e) {}
    await hardReloadWithCacheBust();
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    const errorMessage = String(this.state.error?.message || "Unknown error");
    const isChunkError = isChunkLoadFailure(errorMessage);

    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#020617",
          color: "#e2e8f0",
          padding: "24px",
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
        }}
      >
        <div style={{ maxWidth: "420px", width: "100%", textAlign: "center" }}>
          <h1 style={{ margin: "0 0 8px", fontSize: "22px", fontWeight: 700, color: "#f8fafc" }}>
            Display could not load
          </h1>
          <p style={{ margin: "0 0 16px", fontSize: "14px", lineHeight: 1.5, color: "#94a3b8" }}>
            {isChunkError
              ? "This TV browser cached an older version of the app. Reload to fetch the latest files."
              : "Something went wrong while loading the AssetIQ display. Try reloading this page."}
          </p>
          <p
            style={{
              margin: "0 0 20px",
              fontSize: "12px",
              lineHeight: 1.4,
              color: "#64748b",
              wordBreak: "break-word",
            }}
          >
            {errorMessage}
          </p>
          <button
            type="button"
            onClick={this.handleReload}
            style={{
              padding: "12px 20px",
              border: "none",
              borderRadius: "10px",
              background: "#2563eb",
              color: "#ffffff",
              fontSize: "14px",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Reload display
          </button>
        </div>
      </div>
    );
  }
}

export default KioskErrorBoundary;
