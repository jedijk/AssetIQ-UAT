import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { useAuth } from "./AuthContext";
import { permissionsAPI } from "../lib/api";

const PermissionsContext = createContext(null);
const AUTH_MODE = process.env.REACT_APP_AUTH_MODE || "bearer"; // "bearer" | "cookie"

// Feature to route path mapping (used for route-gating + nav visibility).
// Keep this aligned with backend FEATURES in `backend/routes/permissions.py`.
const FEATURE_PATHS = {
  observations: ["/threats", "/observations"],
  investigations: ["/investigations", "/causal-engine"],
  actions: ["/actions"],
  // "tasks" is execution / personal work queue
  tasks: ["/my-tasks"],
  // "scheduler" is the planner / scheduling UI (route is `/tasks`)
  scheduler: ["/tasks"],
  forms: ["/forms", "/form-submissions", "/granulometry"],
  equipment: ["/equipment", "/definitions", "/equipment-manager"],
  library: ["/library"],
  insights: ["/settings/insights"],
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
    "/settings/server-performance",
    "/settings/database",
    "/settings/audit-log",
    "/settings/log-ingestion",
    "/settings/privacy",
    "/settings/deletion-requests",
    "/settings/consent-management",
    "/settings/criticality-definitions",
  ],
};

export const PermissionsProvider = ({ children }) => {
  const { user, token } = useAuth();
  const [permissions, setPermissions] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchPermissions = useCallback(async () => {
    try {
      setLoading(true);
      const data = await permissionsAPI.getMy();
      setPermissions(data);
    } catch (error) {
      console.error("Failed to fetch permissions:", error);
      // Set default viewer permissions on error
      setPermissions({
        role: user?.role || "viewer",
        permissions: {},
      });
    } finally {
      setLoading(false);
    }
  }, [user?.role]);

  // Fetch permissions when user logs in
  useEffect(() => {
    // In cookie-auth mode, `token` is intentionally null, but the backend session is valid.
    // We still need to load permissions for route gating and nav visibility.
    if (user && (AUTH_MODE === "cookie" || token)) {
      fetchPermissions();
    } else {
      setPermissions(null);
      setLoading(false);
    }
  }, [user, token, fetchPermissions]);

  // Check if user has a specific permission
  const hasPermission = useCallback((feature, action = "read") => {
    // Owner always has all permissions
    if (user?.role === "owner") return true;
    
    // If permissions not loaded yet, default to checking role
    if (!permissions?.permissions) {
      // Default permissions based on role while loading
      return user?.role === "admin";
    }

    const featurePerms = permissions.permissions[feature];
    if (!featurePerms) return false;
    
    return featurePerms[action] === true;
  }, [permissions, user?.role]);

  // Check if user can access a specific route
  const canAccessRoute = useCallback((path) => {
    // Owner and admin can access everything
    if (user?.role === "owner" || user?.role === "admin") return true;
    
    // Check each feature's paths
    for (const [feature, paths] of Object.entries(FEATURE_PATHS)) {
      if (paths.some(p => path.startsWith(p))) {
        return hasPermission(feature, "read");
      }
    }
    
    // Default to allowing access for unmatched paths (dashboard, etc.)
    return true;
  }, [hasPermission, user?.role]);

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
      userRole: user?.role || "viewer"
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
