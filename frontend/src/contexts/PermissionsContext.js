import { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "./AuthContext";
import { useEffectiveRole } from "./RolePreviewContext";
import { permissionsAPI } from "../lib/api";

const PermissionsContext = createContext(null);
const AUTH_MODE = process.env.REACT_APP_AUTH_MODE || "bearer"; // "bearer" | "cookie"

// Feature to route path mapping (used for route-gating + nav visibility).
// Keep this aligned with backend FEATURES in `backend/routes/permissions.py`.
const DASHBOARD_HUB_FEATURES = [
  "dashboard_operational",
  "dashboard_production",
  "dashboard_executive",
  "dashboard_builder",
];

const FEATURE_PATHS = {
  observations: ["/threats", "/observations"],
  investigations: ["/investigations", "/causal-engine", "/decision-engine"],
  actions: ["/actions"],
  tasks: ["/my-tasks", "/mobile"],
  dashboard_operational: ["/dashboard"],
  supervisor_command_center: ["/supervisor"],
  dashboard_production: ["/production"],
  // "scheduler" is the planner / scheduling UI (route is `/tasks`)
  scheduler: ["/tasks"],
  forms: ["/forms", "/form-submissions", "/granulometry"],
  equipment: ["/equipment", "/definitions", "/settings/criticality-definitions", "/equipment-manager"],
  library: ["/library"],
  spareiq: ["/spareiq"],
  visual_boards: [
    "/visual-management",
    "/visual-management/boards",
    "/visual-management/templates",
    "/visual-management/screens",
    "/visual-management/pair-displays",
    "/visual-management/analytics",
    "/settings/visual-management",
  ],
  reliability_intelligence: ["/reliability"],
  // chat is currently a sidebar (no dedicated route), keep mapping empty for now
  chat: [],
  statistics: ["/settings/statistics", "/user-statistics"],
  feedback: ["/feedback", "/settings/feedback"],
  users: ["/settings/user-management"],
  // Treat all settings pages as "settings" gated, except user-management (users) and statistics (statistics)
  settings: [
    "/settings",
    "/settings/preferences",
    "/settings/general",
    "/settings/permissions",
    "/settings/qr",
    "/settings/labels",
    "/settings/notifications",
    "/settings/risk-calculation",
    "/settings/ai-usage",
    "/settings/file-security",
    "/settings/external-api",
    "/settings/server-performance",
    "/settings/database",
    "/settings/audit-log",
    "/settings/log-ingestion",
    "/settings/privacy",
    "/settings/deletion-requests",
    "/settings/consent-management",
    "/settings/criticality-definitions",
    "/settings/disciplines",
    "/settings/task-generation",
    "/settings/translations",
    "/settings/onboarding",
    "/settings/company",
    "/settings/maintenance-readiness",
    "/settings/tenant-management",
  ],
};

// Authenticated routes that do not map to a feature permission check.
const AUTHENTICATED_PUBLIC_PATHS = ["/"];

// Personal settings pages are always accessible to authenticated users.
const PERSONAL_SETTINGS_PATHS = [
  "/settings/preferences",
  "/settings/privacy",
  "/settings/notifications",
];

export const PermissionsProvider = ({ children }) => {
  const { user, token } = useAuth();
  const { effectiveRole, isPreviewing } = useEffectiveRole();
  const [permissions, setPermissions] = useState(null);
  const [loading, setLoading] = useState(true);
  const hasLoadedOnce = useRef(false);

  const fetchPermissions = useCallback(async () => {
    try {
      if (!hasLoadedOnce.current) {
        setLoading(true);
      }
      if (isPreviewing) {
        const data = await permissionsAPI.getByRole(effectiveRole);
        setPermissions({
          role: effectiveRole,
          permissions: data.permissions,
        });
        return;
      }
      const data = await permissionsAPI.getMy();
      setPermissions(data);
    } catch (error) {
      console.error("Failed to fetch permissions:", error);
      setPermissions({
        role: effectiveRole,
        permissions: {},
      });
    } finally {
      setLoading(false);
      hasLoadedOnce.current = true;
    }
  }, [effectiveRole, isPreviewing]);

  // Fetch permissions when user logs in
  useEffect(() => {
    // In cookie-auth mode, `token` is intentionally null, but the backend session is valid.
    // We still need to load permissions for route gating and nav visibility.
    if (user && (AUTH_MODE === "cookie" || token)) {
      fetchPermissions();
    } else {
      setPermissions(null);
      setLoading(false);
      hasLoadedOnce.current = false;
    }
  }, [user, token, fetchPermissions, isPreviewing, effectiveRole]);

  // Check if user has a specific permission
  const hasPermission = useCallback((feature, action = "read") => {
    if (user?.role === "owner" && !isPreviewing) return true;
    
    // If permissions not loaded yet, default to checking role
    if (!permissions?.permissions) {
      // Default permissions based on role while loading
      return user?.role === "admin";
    }

    const featurePerms = permissions.permissions[feature];
    if (!featurePerms) return false;
    
    return featurePerms[action] === true;
  }, [permissions, user?.role, isPreviewing]);

  // Check if user can access a specific route
  const canAccessRoute = useCallback((path) => {
    if ((user?.role === "owner" || user?.role === "admin") && !isPreviewing) return true;

    if (AUTHENTICATED_PUBLIC_PATHS.some((p) => path === p || path.startsWith(`${p}/`))) {
      return true;
    }

    if (path === "/dashboard") {
      return DASHBOARD_HUB_FEATURES.some((feature) => hasPermission(feature, "read"));
    }

    if (PERSONAL_SETTINGS_PATHS.some((p) => path === p || path.startsWith(`${p}/`))) {
      return true;
    }

    // Settings hub: allow equipment readers to open settings for definitions (read-only)
    if (path === "/settings") {
      return hasPermission("settings", "read") || hasPermission("equipment", "read");
    }
    
    // Check each feature's paths
    for (const [feature, paths] of Object.entries(FEATURE_PATHS)) {
      if (paths.some(p => path.startsWith(p))) {
        return hasPermission(feature, "read");
      }
    }
    
    // Deny unmapped routes (previously defaulted to allow)
    return false;
  }, [hasPermission, user?.role, isPreviewing]);

  // Check if a nav item should be visible
  const canSeeNavItem = useCallback((path) => {
    return canAccessRoute(path);
  }, [canAccessRoute]);

  // Refresh permissions (call after role change)
  const refreshPermissions = useCallback(() => {
    if (user && (AUTH_MODE === "cookie" || token)) {
      fetchPermissions();
    }
  }, [user, token, fetchPermissions]);

  return (
    <PermissionsContext.Provider value={{ 
      permissions, 
      loading, 
      hasPermission, 
      canAccessRoute,
      canSeeNavItem,
      refreshPermissions,
      userRole: effectiveRole,
      isPreviewing,
    }}>
      {children}
    </PermissionsContext.Provider>
  );
};

export const usePermissions = () => {
  const context = useContext(PermissionsContext);
  if (!context) {
    throw new Error("usePermissions must be used within a PermissionsProvider");
  }
  return context;
};
