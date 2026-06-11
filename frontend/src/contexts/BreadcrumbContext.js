import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { useLanguage } from './LanguageContext';
import {
  ensureDetailAnchors,
  getHomeBreadcrumbPath,
  getParentBreadcrumbPath,
  getRouteLabel,
  isActionDetailPath,
  isHomeBreadcrumbPath,
  isObservationWorkspacePath,
  normalizeBreadcrumbPath,
  readBreadcrumbOrigin,
  shouldExcludeRoute,
  trimBreadcrumbHistory,
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

function collapseSiblingDetailPaths(entries) {
  if (!entries.length) return entries;

  const lastPath = normalizeBreadcrumbPath(entries[entries.length - 1].path);
  return entries.filter((entry, index) => {
    if (index === entries.length - 1) return true;
    const path = normalizeBreadcrumbPath(entry.path);
    if (isActionDetailPath(lastPath) && isActionDetailPath(path)) return false;
    if (isObservationWorkspacePath(lastPath) && isObservationWorkspacePath(path)) {
      return false;
    }
    return true;
  });
}

function normalizeBreadcrumbHistory(entries, homeLabel, max = MAX_BREADCRUMBS) {
  if (!Array.isArray(entries) || entries.length === 0) {
    return [];
  }

  let result = ensureDetailAnchors(collapseSiblingDetailPaths(entries));
  if (!isHomeBreadcrumbPath(result[0].path)) {
    result = [makeHomeEntry(homeLabel), ...result];
  } else {
    result = [{ ...result[0], label: homeLabel }, ...result.slice(1)];
  }

  if (result.length > max) {
    result = trimBreadcrumbHistory(result, homeLabel, max);
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
  const pendingNavTargetRef = useRef(null);
  const historyRef = useRef(history);
  historyRef.current = history;

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

  const navigateToPath = useCallback((targetPath, nextHistory) => {
    pendingNavTargetRef.current = normalizeBreadcrumbPath(targetPath);
    lastPathRef.current = null;
    historyRef.current = nextHistory;
    setHistory(nextHistory);
    navigate(targetPath);
  }, [navigate]);

  useEffect(() => {
    const currentPath = normalizeBreadcrumbPath(location.pathname);

    if (shouldExcludeRoute(location.pathname)) {
      return;
    }

    if (pendingNavTargetRef.current) {
      if (currentPath === pendingNavTargetRef.current) {
        pendingNavTargetRef.current = null;
        lastPathRef.current = currentPath;
      }
      return;
    }

    if (lastPathRef.current === currentPath) {
      return;
    }
    lastPathRef.current = currentPath;

    const originPath = readBreadcrumbOrigin(location.state);

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

      let nextEntries = [...prev];
      if (
        originPath
        && !isHomeBreadcrumbPath(originPath)
        && originPath !== currentPath
        && !nextEntries.some((entry) => entry.path === originPath)
      ) {
        nextEntries.push({
          path: originPath,
          label: getRouteLabel(originPath),
          timestamp: Date.now() - 1,
        });
      }

      nextEntries.push(newEntry);
      return normalizeBreadcrumbHistory(nextEntries, getHomeLabel());
    });
  }, [getHomeLabel, location.pathname, location.state]);

  const navigateTo = useCallback((index) => {
    const prev = historyRef.current;
    if (index < 0 || index >= prev.length) return;

    const entry = prev[index];
    const targetPath = normalizeBreadcrumbPath(entry.path);
    const nextHistory = normalizeBreadcrumbHistory(
      prev.slice(0, index + 1),
      getHomeLabel(),
    );
    navigateToPath(targetPath, nextHistory);
  }, [getHomeLabel, navigateToPath]);

  const canGoBack = useCallback(() => {
    const currentPath = normalizeBreadcrumbPath(location.pathname);
    if (historyRef.current.length > 1) {
      return true;
    }
    const parent = getParentBreadcrumbPath(location.pathname);
    return Boolean(parent && parent !== currentPath);
  }, [location.pathname]);

  const goBack = useCallback(() => {
    const prev = historyRef.current;
    if (prev.length > 1) {
      const previousIndex = prev.length - 2;
      const previous = prev[previousIndex];
      const current = prev[prev.length - 1];
      const parentPath = getParentBreadcrumbPath(current.path);
      const previousPath = normalizeBreadcrumbPath(previous.path);
      const dashboardOrigin = readBreadcrumbOrigin(location.state);

      // Deep-linked action detail (Home > Action): prefer the actions list as back target.
      if (
        isActionDetailPath(current.path)
        && parentPath
        && isHomeBreadcrumbPath(previousPath)
        && !prev.some((entry) => entry.path === parentPath)
        && dashboardOrigin !== getHomeBreadcrumbPath()
        && dashboardOrigin !== '/dashboard'
      ) {
        const nextHistory = normalizeBreadcrumbHistory(
          [
            ...prev.slice(0, -1),
            {
              path: parentPath,
              label: getRouteLabel(parentPath),
              timestamp: Date.now() - 1,
            },
            current,
          ],
          getHomeLabel(),
        );
        navigateToPath(parentPath, nextHistory);
        return;
      }

      navigateTo(previousIndex);
      return;
    }

    const currentPath = normalizeBreadcrumbPath(location.pathname);
    const parent = getParentBreadcrumbPath(location.pathname);
    const targetPath = parent && parent !== currentPath ? parent : getHomeBreadcrumbPath();
    const normalized = normalizeBreadcrumbHistory(prev, getHomeLabel());
    const existingIndex = normalized.findIndex((entry) => entry.path === targetPath);
    const nextHistory = existingIndex !== -1
      ? normalized.slice(0, existingIndex + 1)
      : normalized;
    navigateToPath(targetPath, nextHistory);
  }, [getHomeLabel, location.pathname, location.state, navigateTo, navigateToPath]);

  const clearHistory = useCallback(() => {
    setHistory([]);
    lastPathRef.current = null;
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch (e) {
      // Ignore
    }
  }, []);

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
    getBreadcrumbs: () => history,
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
