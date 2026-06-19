import React from "react";
import { NavLink } from "react-router-dom";
import { LayoutTemplate, Monitor, Tv, BarChart3, Link2 } from "lucide-react";

export const VISUAL_MANAGEMENT_TABS = [
  { path: "/visual-management/boards", label: "Boards", icon: Monitor, end: true },
  { path: "/visual-management/screens", label: "Screens", icon: Tv, end: false },
  { path: "/visual-management/pair-displays", label: "Pair Displays", icon: Link2, end: true },
  { path: "/visual-management/templates", label: "Templates", icon: LayoutTemplate, end: true },
  { path: "/visual-management/analytics", label: "Analytics", icon: BarChart3, end: true },
];

/**
 * Section tabs for Visual Management — scrollable on mobile, wraps on desktop.
 */
export function VisualManagementNav() {
  return (
    <nav
      className="flex gap-1 rounded-lg border border-slate-200 bg-white p-1 shadow-sm overflow-x-auto overscroll-x-contain [-webkit-overflow-scrolling:touch] sm:flex-wrap sm:overflow-visible"
      aria-label="Visual Management sections"
      data-testid="visual-management-nav"
    >
      {VISUAL_MANAGEMENT_TABS.map((tab) => (
        <NavLink
          key={tab.path}
          to={tab.path}
          end={tab.end}
          className={({ isActive }) =>
            `flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-2 text-xs font-medium transition-colors sm:px-3 sm:text-sm ${
              isActive
                ? "bg-blue-600 text-white shadow-sm"
                : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            }`
          }
          data-testid={`vmb-nav-${tab.label.toLowerCase().replace(/\s+/g, "-")}`}
        >
          <tab.icon className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
          {tab.label}
        </NavLink>
      ))}
    </nav>
  );
}
