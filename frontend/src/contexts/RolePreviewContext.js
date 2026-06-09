import { createContext, useContext, useState, useEffect, useCallback, useMemo } from "react";
import { useAuth } from "./AuthContext";
import { formatRoleLabel } from "../lib/roleLabels";

export { formatRoleLabel };

const STORAGE_KEY = "rolePreviewRole";
export const ROLE_PREVIEW_CHANGED_EVENT = "rolePreviewChanged";

const RolePreviewContext = createContext(null);

export function RolePreviewProvider({ children }) {
  const { user } = useAuth();
  const isOwner = user?.role === "owner";

  const [previewRole, setPreviewRoleState] = useState(() => {
    if (typeof window === "undefined") return null;
    return localStorage.getItem(STORAGE_KEY) || null;
  });

  useEffect(() => {
    if (!isOwner && previewRole) {
      localStorage.removeItem(STORAGE_KEY);
      setPreviewRoleState(null);
    }
  }, [isOwner, previewRole]);

  useEffect(() => {
    const syncFromStorage = () => {
      if (!isOwner) return;
      setPreviewRoleState(localStorage.getItem(STORAGE_KEY) || null);
    };
    window.addEventListener(ROLE_PREVIEW_CHANGED_EVENT, syncFromStorage);
    window.addEventListener("storage", syncFromStorage);
    return () => {
      window.removeEventListener(ROLE_PREVIEW_CHANGED_EVENT, syncFromStorage);
      window.removeEventListener("storage", syncFromStorage);
    };
  }, [isOwner]);

  const setPreviewRole = useCallback(
    (role) => {
      if (!isOwner) return;
      if (role && role !== "owner") {
        localStorage.setItem(STORAGE_KEY, role);
        setPreviewRoleState(role);
      } else {
        localStorage.removeItem(STORAGE_KEY);
        setPreviewRoleState(null);
      }
      window.dispatchEvent(new CustomEvent(ROLE_PREVIEW_CHANGED_EVENT));
    },
    [isOwner],
  );

  const clearPreview = useCallback(() => setPreviewRole(null), [setPreviewRole]);

  const isPreviewing = isOwner && !!previewRole;
  const effectiveRole = isPreviewing ? previewRole : user?.role || "viewer";

  const value = useMemo(
    () => ({
      previewRole,
      effectiveRole,
      isPreviewing,
      isOwner,
      actualRole: user?.role || null,
      setPreviewRole,
      clearPreview,
      previewRoleLabel: previewRole ? formatRoleLabel(previewRole) : null,
    }),
    [previewRole, effectiveRole, isPreviewing, isOwner, user?.role, setPreviewRole, clearPreview],
  );

  return <RolePreviewContext.Provider value={value}>{children}</RolePreviewContext.Provider>;
}

export function useRolePreview() {
  const context = useContext(RolePreviewContext);
  if (!context) {
    throw new Error("useRolePreview must be used within a RolePreviewProvider");
  }
  return context;
}

/** Effective role for permission / nav gating (respects owner preview mode). */
export function useEffectiveRole() {
  const { user } = useAuth();
  const context = useContext(RolePreviewContext);

  if (!context) {
    return {
      actualRole: user?.role || null,
      effectiveRole: user?.role || "viewer",
      isOwner: user?.role === "owner",
      isPreviewing: false,
      previewRole: null,
      previewRoleLabel: null,
      setPreviewRole: () => {},
      clearPreview: () => {},
    };
  }

  return context;
}

export function clearRolePreviewStorage() {
  localStorage.removeItem(STORAGE_KEY);
  window.dispatchEvent(new CustomEvent(ROLE_PREVIEW_CHANGED_EVENT));
}
