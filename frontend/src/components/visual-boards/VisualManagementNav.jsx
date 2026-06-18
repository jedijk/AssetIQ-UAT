import React from "react";
import { NavLink } from "react-router-dom";
import { LayoutTemplate, Monitor, Tv, BarChart3 } from "lucide-react";

const TABS = [
  { path: "/visual-management/boards", label: "Boards", icon: Monitor, end: true },
  { path: "/visual-management/screens", label: "Pair Displays", icon: Tv, end: true },
  { path: "/visual-management/templates", label: "Templates", icon: LayoutTemplate, end: true },
  { path: "/visual-management/analytics", label: "Analytics", icon: BarChart3, end: true },
];

/**
 * Section tabs for Visual Management — makes TV pairing discoverable from every VMB page.
 */
export function VisualManagementNav() {
  return (
    <nav
      className="flex flex-wrap gap-1 rounded-lg border border-slate-200 bg-white p-1 shadow-sm"
      aria-label="Visual Management sections"
      data-testid="visual-management-nav"
    >
      {TABS.map((tab) => (
        <NavLink
          key={tab.path}
          to={tab.path}
          end={tab.end}
          className={({ isActive }) =>
            `flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
              isActive
                ? "bg-blue-600 text-white shadow-sm"
                : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            }`
          }
          data-testid={`vmb-nav-${tab.label.toLowerCase().replace(/\s+/g, "-")}`}
        >
          <tab.icon className="w-4 h-4 shrink-0" />
          {tab.label}
        </NavLink>
      ))}
    </nav>
  );
}
