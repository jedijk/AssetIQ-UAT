import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { useLanguage } from './LanguageContext';
import {
  getHomeBreadcrumbPath,
  getParentBreadcrumbPath,
  getRouteLabel,
  isHomeBreadcrumbPath,
  normalizeBreadcrumbPath,
  shouldExcludeRoute,
} from '../lib/routeLabels';

const STORAGE_KEY = 'assetiq_breadcrumb_history';
const MAX_BREADCRUMBS = 3;
const MOBILE_MEDIA_QUERY = '(max-width: 639px)';

function makeHomeEntry(homeLabel) {
  return {
    path: getHomeBreadcrumbPath(),
    label: homeLabel,
    timestamp: 0,
  };
}

function normalizeBreadcrumbHistory(entries, homeLabel, max = MAX_BREADCRUMBS) {
  if (!Array.isArray(entries) || entries.length === 0) {
    return [];
  }

  let result = entries;
  if (!isHomeBreadcrumbPath(result[0].path)) {
    result = [makeHomeEntry(homeLabel), ...result];
  } else {
    result = [{ ...result[0], label: homeLabel }, ...result.slice(1)];
  }

  if (result.length > max) {
    return [result[0], ...result.slice(-(max - 1))];
  }
  return result;
}

function sanitizeHistory(entries, homeLabel) {
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
      label: isHomeBreadcrumbPath(path) ? homeLabel : getRouteLabel(path),
      timestamp: entry?.timestamp || Date.now(),
    });
  }
  return normalizeBreadcrumbHistory(sanitized, homeLabel);
}

/**
 * @typedef {Object} BreadcrumbEntry
 * @property {string} path - Route path
 * @property {string} label - Display label
 * @property {number} timestamp - When visited
 */

const BreadcrumbContext = createContext(null);

function useSimpleModeHome() {
  const { user } = useAuth();
  const [operatorView, setOperatorView] = useState(
    () => typeof window !== 'undefined' && localStorage.getItem('operatorViewEnabled') === 'true',
  );
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(MOBILE_MEDIA_QUERY).matches,
  );

  useEffect(() => {
    const onOperatorViewChange = () => {
      setOperatorView(localStorage.getItem('operatorViewEnabled') === 'true');
    };
    const mediaQuery = window.matchMedia(MOBILE_MEDIA_QUERY);
    const onViewportChange = () => setIsMobile(mediaQuery.matches);

    window.addEventListener('operatorViewChanged', onOperatorViewChange);
    window.addEventListener('storage', onOperatorViewChange);
    mediaQuery.addEventListener('change', onViewportChange);

    return () => {
      window.removeEventListener('operatorViewChanged', onOperatorViewChange);
      window.removeEventListener('storage', onOperatorViewChange);
      mediaQuery.removeEventListener('change', onViewportChange);
    };
  }, []);

  return isMobile && (user?.role === 'operator' || operatorView);
}

/**
 * BreadcrumbProvider - Manages navigation history for breadcrumb display
 * Tracks up to 3 most recent pages visited
 */
export function BreadcrumbProvider({ children }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { t } = useLanguage();
  const isSimpleModeHome = useSimpleModeHome();
  const getHomeLabel = useCallback(
    () => (isSimpleModeHome ? t('simpleMode.home') : t('nav.dashboard')),
    [isSimpleModeHome, t],
  );

  const [history, setHistory] = useState(() => {
    try {
      const stored = sessionStorage.getItem(STORAGE_KEY);
      if (stored) {
        return sanitizeHistory(JSON.parse(stored), 'Dashboard');
      }
    } catch (e) {
      console.warn('Failed to load breadcrumb history:', e);
    }
    return [];
  });

  const lastPathRef = useRef(null);

  useEffect(() => {
    setHistory((prev) => normalizeBreadcrumbHistory(prev, getHomeLabel()));
  }, [getHomeLabel]);

  useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(history));
    } catch (e) {
      console.warn('Failed to save breadcrumb history:', e);
    }
  }, [history]);

  useEffect(() => {
    const currentPath = normalizeBreadcrumbPath(location.pathname);

    if (shouldExcludeRoute(location.pathname)) {
      return;
    }

    if (lastPathRef.current === currentPath) {
      return;
    }
    lastPathRef.current = currentPath;

    setHistory((prev) => {
      const existingIndex = prev.findIndex((entry) => entry.path === currentPath);

      if (existingIndex !== -1) {
        return normalizeBreadcrumbHistory(
          prev.slice(0, existingIndex + 1),
          getHomeLabel(),
        );
      }

      const newEntry = {
        path: currentPath,
        label: isHomeBreadcrumbPath(currentPath) ? getHomeLabel() : getRouteLabel(currentPath),
        timestamp: Date.now(),
      };

      return normalizeBreadcrumbHistory([...prev, newEntry], getHomeLabel());
    });
  }, [getHomeLabel, location.pathname]);

  const navigateTo = useCallback((index) => {
    if (index >= 0 && index < history.length) {
      const entry = history[index];
      const targetPath = normalizeBreadcrumbPath(entry.path);
      lastPathRef.current = targetPath;
      setHistory((prev) => normalizeBreadcrumbHistory(prev.slice(0, index + 1), getHomeLabel()));
      navigate(targetPath);
    }
  }, [getHomeLabel, history, navigate]);

  const canGoBack = useCallback(() => {
    const currentPath = normalizeBreadcrumbPath(location.pathname);
    if (history.length > 1) {
      return true;
    }
    const parent = getParentBreadcrumbPath(location.pathname);
    return Boolean(parent && parent !== currentPath);
  }, [history.length, location.pathname]);

  const goBack = useCallback(() => {
    if (history.length > 1) {
      navigateTo(history.length - 2);
      return;
    }

    const currentPath = normalizeBreadcrumbPath(location.pathname);
    const parent = getParentBreadcrumbPath(location.pathname);
    const targetPath = parent && parent !== currentPath ? parent : getHomeBreadcrumbPath();
    lastPathRef.current = targetPath;
    setHistory((prev) => {
      const normalized = normalizeBreadcrumbHistory(prev, getHomeLabel());
      const existingIndex = normalized.findIndex((entry) => entry.path === targetPath);
      if (existingIndex !== -1) {
        return normalized.slice(0, existingIndex + 1);
      }
      return normalized;
    });
    navigate(targetPath);
  }, [getHomeLabel, history, location.pathname, navigate, navigateTo]);

  const clearHistory = useCallback(() => {
    setHistory([]);
    lastPathRef.current = null;
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch (e) {
      // Ignore
    }
  }, []);

  const getBreadcrumbs = useCallback(() => history, [history]);

  const getDisplayLabel = useCallback((entry) => {
    if (isHomeBreadcrumbPath(entry.path)) {
      return getHomeLabel();
    }
    return entry.label;
  }, [getHomeLabel]);

  const value = {
    history,
    navigateTo,
    goBack,
    canGoBack: canGoBack(),
    clearHistory,
    getBreadcrumbs,
    getDisplayLabel,
    isHomeBreadcrumbPath,
    currentPath: location.pathname,
  };

  return (
    <BreadcrumbContext.Provider value={value}>
      {children}
    </BreadcrumbContext.Provider>
  );
}

export function useBreadcrumb() {
  const context = useContext(BreadcrumbContext);
  if (!context) {
    throw new Error('useBreadcrumb must be used within a BreadcrumbProvider');
  }
  return context;
}

export default BreadcrumbContext;
