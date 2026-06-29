import React from "react";
import { NavLink } from "react-router-dom";
import { LayoutTemplate, Monitor, Tv, BarChart3, Link2 } from "lucide-react";
import { visualManagementPaths } from "../../lib/visualManagementPaths";

export const VISUAL_MANAGEMENT_TABS = [
  { path: visualManagementPaths.boards, label: "Boards", shortLabel: "Boards", icon: Monitor, end: true },
  { path: visualManagementPaths.screens, label: "Screens", shortLabel: "Screens", icon: Tv, end: false },
  { path: visualManagementPaths.pairDisplays, label: "Pair Displays", shortLabel: "Pair", icon: Link2, end: true },
  { path: visualManagementPaths.templates, label: "Templates", shortLabel: "Templates", icon: LayoutTemplate, end: true },
  { path: visualManagementPaths.analytics, label: "Analytics", shortLabel: "Analytics", icon: BarChart3, end: true },
];

/**
 * Section tabs for Visual Management — wraps on small screens so labels stay visible.
 */
export function VisualManagementNav() {
  return (
    <nav
      className="grid grid-cols-2 gap-1 rounded-lg border border-slate-200 bg-white p-1 shadow-sm sm:flex sm:flex-wrap"
      aria-label="Visual Management sections"
      data-testid="visual-management-nav"
    >
      {VISUAL_MANAGEMENT_TABS.map((tab) => (
        <NavLink
          key={tab.path}
          to={tab.path}
          end={tab.end}
          className={({ isActive }) =>
            `flex min-w-0 items-center justify-center gap-1.5 rounded-md px-2 py-2 text-xs font-medium transition-colors sm:justify-start sm:px-3 sm:text-sm ${
              isActive
                ? "bg-blue-600 text-white shadow-sm"
                : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            }`
          }
          data-testid={`vmb-nav-${tab.label.toLowerCase().replace(/\s+/g, "-")}`}
        >
          <tab.icon className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
          <span className="truncate sm:hidden">{tab.shortLabel}</span>
          <span className="truncate hidden sm:inline">{tab.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
