import React from "react";
import { Link } from "react-router-dom";
import { visualManagementPaths } from "../../lib/visualManagementPaths";
import { Monitor, Tv } from "lucide-react";

export function getDisplayPairingUrl() {
  if (typeof window !== "undefined" && window.location?.origin) {
    return `${window.location.origin}/tv`;
  }
  return "/tv";
}

const ADMIN_STEPS = [
  {
    title: "Open the display page on the TV",
    body: (url) => (
      <>
        On the shop-floor TV or tablet, open{" "}
        <a href={url} target="_blank" rel="noopener noreferrer" className="font-mono text-blue-600 hover:underline">
          {url}
        </a>{" "}
        in full-screen mode and leave it open.
      </>
    ),
  },
  {
    title: "Read the pairing code",
    body: () => "The display shows a 6-character code. Codes expire after 10 minutes and refresh automatically.",
  },
  {
    title: "Enter the code here",
    body: () => "Type the code in the field below and click Look up to see the waiting device.",
  },
  {
    title: "Assign a board",
    body: () => "Choose the visual management board, screen name, and optional location, then click Pair Device.",
  },
  {
    title: "Confirm on the TV",
    body: () => "The display pairs automatically within a few seconds. No login is required on the TV.",
  },
];

const DISPLAY_STEPS = [
  {
    title: "Open the TV kiosk URL",
    body: (url) => (
      <>
        Use{" "}
        <span className="font-mono text-blue-300">{url}</span> — not the main AssetIQ homepage. Hide the browser
        toolbar if your TV browser allows it, and set zoom to 100%.
      </>
    ),
  },
  {
    title: "Keep this screen open",
    body: () => "Leave this browser on the TV or kiosk. Do not close or refresh after pairing.",
  },
  {
    title: "Sign in to AssetIQ on another device",
    body: () => "Use a laptop, phone, or tablet where you are already logged into AssetIQ.",
  },
  {
    title: "Go to Settings → Visual Management → Pair Displays",
    body: () => (
      <>
        Open the gear menu (<span className="text-slate-300 font-medium">Settings</span>), choose{" "}
        <span className="text-slate-300 font-medium">Visual Management</span>, then{" "}
        <span className="text-slate-300 font-medium">Pair Displays</span>.
      </>
    ),
  },
  {
    title: "Enter the code below",
    body: () => "Type the 6-character code shown on this screen and click Look up.",
  },
  {
    title: "Pair the device",
    body: () => "Select a board, name the screen, and click Pair Device. This display will connect automatically.",
  },
];

/**
 * In-app pairing instructions for TVs (display) and administrators (screens page).
 */
export function DisplayPairingInstructions({ variant = "admin", className = "" }) {
  const displayUrl = getDisplayPairingUrl();
  const steps = variant === "display" ? DISPLAY_STEPS : ADMIN_STEPS;
  const isDisplay = variant === "display";

  return (
    <div
      className={
        isDisplay
          ? `rounded-xl border border-slate-700 bg-slate-900/60 p-5 text-left ${className}`
          : `rounded-xl border border-blue-100 bg-blue-50/80 p-5 text-left ${className}`
      }
    >
      <div className="flex items-start gap-3 mb-4">
        {isDisplay ? (
          <Tv className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" />
        ) : (
          <Monitor className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
        )}
        <div>
          <h2 className={`text-sm font-semibold ${isDisplay ? "text-white" : "text-slate-900"}`}>
            {isDisplay ? "How to pair this display" : "How to pair a shop-floor display"}
          </h2>
          <p className={`text-xs mt-1 ${isDisplay ? "text-slate-400" : "text-slate-600"}`}>
            {isDisplay
              ? "No passwords on the TV — an administrator completes pairing from AssetIQ."
              : "Connect TVs and tablets without user accounts or session logins."}
          </p>
        </div>
      </div>

      <ol className={`space-y-3 text-sm ${isDisplay ? "text-slate-300" : "text-slate-700"}`}>
        {steps.map((step, index) => (
          <li key={step.title} className="flex gap-3">
            <span
              className={
                isDisplay
                  ? "flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-800 text-xs font-bold text-blue-300"
                  : "flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white"
              }
            >
              {index + 1}
            </span>
            <div>
              <p className={`font-medium ${isDisplay ? "text-slate-200" : "text-slate-900"}`}>{step.title}</p>
              <p className={`text-xs mt-0.5 leading-relaxed ${isDisplay ? "text-slate-400" : "text-slate-600"}`}>
                {typeof step.body === "function" ? step.body(displayUrl) : step.body}
              </p>
            </div>
          </li>
        ))}
      </ol>

      {!isDisplay && (
        <p className="text-xs text-slate-500 mt-4 pt-3 border-t border-blue-100">
          Tip: Publish your board first under{" "}
          <Link to={visualManagementPaths.boards} className="text-blue-600 hover:underline">
            Settings → Visual Management → Boards
          </Link>
          , then assign it when pairing.
        </p>
      )}
    </div>
  );
}
