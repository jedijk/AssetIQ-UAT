import React from "react";
import { VMB_PAGE_CLASS, VMB_PAGE_SHELL_CLASS } from "./visualManagementLayout";

/** Viewport-bounded shell + scroll pane for Visual Management list/detail pages. */
export function VisualManagementPageLayout({ children, className = "max-w-6xl" }) {
  return (
    <div className={VMB_PAGE_SHELL_CLASS}>
      <div className={`${VMB_PAGE_CLASS} ${className}`.trim()}>{children}</div>
    </div>
  );
}
