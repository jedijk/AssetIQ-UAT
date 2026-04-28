import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { useAuth } from "./AuthContext";
import { permissionsAPI } from "../lib/api";

const PermissionsContext = createContext(null);

// Feature to nav path mapping
const FEATURE_PATHS = {
  observations: ["/threats", "/observations"],
  investigations: ["/investigations", "/causal-engine"],
  actions: ["/actions"],
  tasks: ["/my-tasks", "/task-planner", "/tasks"],
  forms: ["/forms"],
  equipment: ["/equipment", "/definitions", "/equipment-manager"],
  library: ["/library"],
  feedback: ["/feedback", "/settings/feedback"],
  users: ["/settings/user-management"],
  settings: ["/settings/criticality-definitions", "/settings/statistics"],
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
    if (user && token) {
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
    if (user && token) {
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
