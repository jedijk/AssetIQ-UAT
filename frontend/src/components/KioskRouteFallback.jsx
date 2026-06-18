import React from "react";

/**
 * Loading fallback for /tv kiosk routes.
 * Uses inline styles so it renders even when lazy chunks or Tailwind fail on TV browsers.
 */
export function KioskRouteFallback({ message = "Loading display…" }) {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: "#020617",
        color: "#e2e8f0",
        padding: "24px",
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
      }}
    >
      <div
        style={{
          width: "40px",
          height: "40px",
          border: "3px solid #334155",
          borderTopColor: "#60a5fa",
          borderRadius: "50%",
          animation: "assetiq-kiosk-spin 0.8s linear infinite",
          marginBottom: "16px",
        }}
      />
      <p style={{ margin: 0, fontSize: "14px", color: "#94a3b8" }}>{message}</p>
      <style>{`@keyframes assetiq-kiosk-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

export default KioskRouteFallback;
