import { Navigate, useLocation } from "react-router-dom";

/** Visual Management admin routes live under Settings on desktop. */
export const VISUAL_MANAGEMENT_BASE = "/settings/visual-management";

export const visualManagementPaths = {
  boards: `${VISUAL_MANAGEMENT_BASE}/boards`,
  boardEdit: (boardId) =>
    `${VISUAL_MANAGEMENT_BASE}/boards/${encodeURIComponent(boardId)}/edit`,
  boardPreview: (boardId) =>
    `${VISUAL_MANAGEMENT_BASE}/boards/${encodeURIComponent(boardId)}/preview`,
  templates: `${VISUAL_MANAGEMENT_BASE}/templates`,
  pairDisplays: `${VISUAL_MANAGEMENT_BASE}/pair-displays`,
  screens: `${VISUAL_MANAGEMENT_BASE}/screens`,
  screenDetail: (deviceId) =>
    `${VISUAL_MANAGEMENT_BASE}/screens/${encodeURIComponent(deviceId)}`,
  analytics: `${VISUAL_MANAGEMENT_BASE}/analytics`,
};

/** Off-screen snapshot iframe — no app chrome, stays on legacy path. */
export function snapshotCapturePath(boardId) {
  return `/visual-management/boards/${encodeURIComponent(boardId)}/snapshot-capture`;
}

export function isVisualManagementInSettings(pathname) {
  return pathname.startsWith(VISUAL_MANAGEMENT_BASE);
}

export function visualManagementShellClass(pathname) {
  return isVisualManagementInSettings(pathname)
    ? "h-full min-h-0 flex flex-col"
    : "app-page-shell flex flex-col";
}

/** Redirect legacy `/visual-management/*` URLs to settings nested routes. */
export function VisualManagementLegacyRedirect() {
  const location = useLocation();
  const suffix = location.pathname.replace(/^\/visual-management/, "") || "";
  return (
    <Navigate
      to={`${VISUAL_MANAGEMENT_BASE}${suffix}${location.search}${location.hash}`}
      replace
    />
  );
}
