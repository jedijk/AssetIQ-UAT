import {
  LayoutDashboard,
  Sparkles,
  AlertTriangle,
  GitBranch,
  ClipboardList,
  ClipboardCheck,
  Calendar,
  FileText,
  BookOpen,
  Building2,
  Brain,
  Users,
  Clock,
  Sliders,
  Server,
  Database,
  ScrollText,
  BarChart3,
} from "lucide-react";

export function buildNavItems(t) {
  return [
    { path: "/dashboard", label: t("nav.dashboard"), icon: LayoutDashboard },
    { path: "/reliability", label: "Reliability Intelligence", icon: Sparkles, desktopOnly: true },
    { path: "/threats", label: t("nav.observations"), icon: AlertTriangle, feature: "observations" },
    { path: "/causal-engine", label: t("nav.causalEngine"), icon: GitBranch, desktopOnly: true, feature: "investigations" },
    { path: "/actions", label: t("nav.actions"), icon: ClipboardList, feature: "actions" },
    // UI route kept for deep links; data via /work-items API (see docs/api/WORK_ITEMS_API.md)
    { path: "/my-tasks", label: t("nav.myTasks"), icon: ClipboardCheck, feature: "tasks" },
    { path: "/tasks", label: t("nav.taskScheduler"), icon: Calendar, desktopOnly: true, feature: "tasks" },
    { path: "/form-submissions", label: t("nav.formSubmissions"), icon: FileText, feature: "forms" },
    { path: "/library", label: t("nav.library"), icon: BookOpen, desktopOnly: true, feature: "library" },
  ];
}

export function buildSettingsMenuItems(t) {
  return [
    { path: "/equipment-manager", label: t("nav.equipmentManager"), icon: Building2, desktopOnly: true, feature: "equipment" },
    { path: "/settings/user-management", label: t("nav.userManagement"), icon: Users, feature: "users" },
    { path: "/settings/preferences", label: "Preferences", icon: Clock, desktopOnly: true },
    { path: "/settings/risk-calculation", label: "Risk Calculation", icon: Sliders, adminOnly: true, desktopOnly: true },
    { path: "/settings/server-performance", label: "Server Performance", icon: Server, ownerOnly: true },
    { path: "/settings/database", label: "Database Environment", icon: Database, ownerOnly: true },
    { path: "/settings/ai-usage", label: t("nav.aiUsage"), icon: Brain, adminOnly: true, desktopOnly: true },
    { path: "/settings/maintenance-readiness", label: t("nav.maintenanceReadiness"), icon: ClipboardCheck, adminOnly: true, desktopOnly: true },
    { path: "/settings/audit-log", label: "Audit Log", icon: ScrollText, roles: ["owner"] },
    { path: "/settings/statistics", label: t("nav.statistics"), icon: BarChart3 },
    { path: "/definitions", label: t("nav.criticalityDefinitions"), icon: Sliders, feature: "settings" },
  ];
}

export function filterNavItems(items, { isMobileView, canSeeNavItem }) {
  return items.filter((item) => {
    if (isMobileView && item.desktopOnly) return false;
    if (item.feature && !canSeeNavItem(item.path)) return false;
    return true;
  });
}

export function filterSettingsMenuItems(items, { isMobileView, user, canSeeNavItem, operatorViewEnabled }) {
  return items.filter((item) => {
    if (isMobileView && (user?.role === "operator" || operatorViewEnabled)) {
      return item.path === "/definitions";
    }
    if (item.roles && (!user?.role || !item.roles.includes(user.role))) return false;
    if (isMobileView && item.desktopOnly) return false;
    if (item.ownerOnly && user?.role !== "owner") return false;
    if (item.adminOnly && user?.role !== "admin" && user?.role !== "owner") return false;
    if (item.feature && !canSeeNavItem(item.path)) return false;
    return true;
  });
}
