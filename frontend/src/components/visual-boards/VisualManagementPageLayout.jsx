import React from "react";
import { useLocation } from "react-router-dom";
import { VMB_PAGE_CLASS, VMB_PAGE_SHELL_CLASS } from "./visualManagementLayout";
import { isVisualManagementInSettings } from "../../lib/visualManagementPaths";

/** Viewport-bounded shell + scroll pane for Visual Management list/detail pages. */
export function VisualManagementPageLayout({ children, className = "max-w-6xl" }) {
  const location = useLocation();
  const inSettings = isVisualManagementInSettings(location.pathname);

  if (inSettings) {
    return (
      <div className={`${VMB_PAGE_CLASS} ${className}`.trim()}>{children}</div>
    );
  }

  return (
    <div className={VMB_PAGE_SHELL_CLASS}>
      <div className={`${VMB_PAGE_CLASS} ${className}`.trim()}>{children}</div>
    </div>
  );
}
