import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { getRouteLabel, normalizeBreadcrumbPath, shouldExcludeRoute } from '../lib/routeLabels';

function sanitizeHistory(entries) {
  if (!Array.isArray(entries)) return [];
  const sanitized = [];
  for (const entry of entries) {
    const path = normalizeBreadcrumbPath(entry?.path);
    if (!path) continue;
    if (sanitized.length > 0 && sanitized[sanitized.length - 1].path === path) {
      continue;
    }
    sanitized.push({
      path,
      label: getRouteLabel(path),
      timestamp: entry?.timestamp || Date.now(),
    });
  }
  return sanitized;
}

const STORAGE_KEY = 'assetiq_breadcrumb_history';
const MAX_BREADCRUMBS = 3;

/**
 * @typedef {Object} BreadcrumbEntry
 * @property {string} path - Route path
 * @property {string} label - Display label
 * @property {number} timestamp - When visited
 */

const BreadcrumbContext = createContext(null);

/**
 * BreadcrumbProvider - Manages navigation history for breadcrumb display
 * Tracks up to 3 most recent pages visited
 */
export function BreadcrumbProvider({ children }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [history, setHistory] = useState(() => {
    // Initialize from sessionStorage
    try {
      const stored = sessionStorage.getItem(STORAGE_KEY);
      if (stored) {
        return sanitizeHistory(JSON.parse(stored));
      }
    } catch (e) {
      console.warn('Failed to load breadcrumb history:', e);
    }
    return [];
  });

  // Track the last path to prevent duplicate entries
  const lastPathRef = useRef(null);

  // Persist history to sessionStorage
  useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(history));
    } catch (e) {
      console.warn('Failed to save breadcrumb history:', e);
    }
  }, [history]);

  // Track page navigation
  useEffect(() => {
    const currentPath = normalizeBreadcrumbPath(location.pathname);

    // Skip excluded routes (auth pages, mobile, etc.)
    if (shouldExcludeRoute(location.pathname)) {
      return;
    }

    // Skip if same as last path (prevent duplicates on re-renders)
    if (lastPathRef.current === currentPath) {
      return;
    }
    lastPathRef.current = currentPath;

    // Add new entry to history
    setHistory(prev => {
      // Check if this path already exists in history
      const existingIndex = prev.findIndex(entry => entry.path === currentPath);

      if (existingIndex !== -1) {
        // Path exists - truncate history to this point
        // This happens when user clicks a breadcrumb
        return prev.slice(0, existingIndex + 1);
      }

      // Add new entry
      const newEntry = {
        path: currentPath,
        label: getRouteLabel(currentPath),
        timestamp: Date.now(),
      };

      // Keep only the last MAX_BREADCRUMBS entries
      const newHistory = [...prev, newEntry];
      if (newHistory.length > MAX_BREADCRUMBS) {
        return newHistory.slice(-MAX_BREADCRUMBS);
      }
      return newHistory;
    });
  }, [location.pathname]);

  /**
   * Navigate to a breadcrumb entry
   * @param {number} index - Index in the history array
   */
  const navigateTo = useCallback((index) => {
    if (index >= 0 && index < history.length) {
      const entry = history[index];
      const targetPath = normalizeBreadcrumbPath(entry.path);
      // Truncate history and skip the pathname tracker on the next navigation
      lastPathRef.current = targetPath;
      setHistory(prev => prev.slice(0, index + 1));
      navigate(targetPath);
    }
  }, [history, navigate]);

  /**
   * Clear all breadcrumb history
   */
  const clearHistory = useCallback(() => {
    setHistory([]);
    lastPathRef.current = null;
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch (e) {
      // Ignore
    }
  }, []);

  /**
   * Get the current breadcrumb trail
   * @returns {BreadcrumbEntry[]}
   */
  const getBreadcrumbs = useCallback(() => {
    return history;
  }, [history]);

  const value = {
    history,
    navigateTo,
    clearHistory,
    getBreadcrumbs,
    currentPath: location.pathname,
  };

  return (
    <BreadcrumbContext.Provider value={value}>
      {children}
    </BreadcrumbContext.Provider>
  );
}

/**
 * Hook to access breadcrumb navigation
 * @returns {Object} Breadcrumb context value
 */
export function useBreadcrumb() {
  const context = useContext(BreadcrumbContext);
  if (!context) {
    throw new Error('useBreadcrumb must be used within a BreadcrumbProvider');
  }
  return context;
}

export default BreadcrumbContext;
