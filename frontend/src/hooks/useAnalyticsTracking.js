/**
 * useAnalyticsTracking - Hook for tracking user events
 * 
 * Tracks:
 * - Page views (module opens)
 * - Actions executed
 * - Session management (15-min timeout)
 * - Device type (desktop/mobile/tablet)
 */

import { useEffect, useRef, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const API_BASE_URL = process.env.REACT_APP_BACKEND_URL;
const SESSION_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes

// Detect device type based on user agent and screen size
const getDeviceType = () => {
  const ua = navigator.userAgent.toLowerCase();
  const screenWidth = window.innerWidth;
  
  // Check for mobile devices
  const isMobileUA = /android|webos|iphone|ipod|blackberry|iemobile|opera mini|mobile/i.test(ua);
  const isTabletUA = /ipad|tablet|playbook|silk/i.test(ua);
  
  // Also consider screen width for better accuracy
  if (isTabletUA || (isMobileUA && screenWidth >= 768)) {
    return 'tablet';
  }
  
  if (isMobileUA || screenWidth < 768) {
    return 'mobile';
  }
  
  return 'desktop';
};

// Generate a unique session ID
const generateSessionId = () => {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
};

// Get or create session ID from sessionStorage
const getSessionId = () => {
  let sessionId = sessionStorage.getItem('analytics_session_id');
  let lastActivity = sessionStorage.getItem('analytics_last_activity');
  
  const now = Date.now();
  
  // Check if session has expired
  if (lastActivity && (now - parseInt(lastActivity)) > SESSION_TIMEOUT_MS) {
    // Session expired, create new one
    sessionId = generateSessionId();
    sessionStorage.setItem('analytics_session_id', sessionId);
  }
  
  if (!sessionId) {
    sessionId = generateSessionId();
    sessionStorage.setItem('analytics_session_id', sessionId);
  }
  
  // Update last activity
  sessionStorage.setItem('analytics_last_activity', now.toString());
  
  return sessionId;
};

// Map route paths to module names
const getModuleFromPath = (pathname) => {
  const pathMap = {
    '/': 'Dashboard',
    '/dashboard': 'Dashboard',
    '/threats': 'Observations',
    '/my-tasks': 'My Tasks',
    '/causal-engine': 'Causal Engine',
    '/actions': 'Actions',
    '/library': 'Library',
    '/equipment-manager': 'Equipment Manager',
    '/tasks': 'Task Planner',
    '/forms': 'Forms',
    '/decision-engine': 'Decision Engine',
    '/analytics': 'Analytics',
    '/settings/user-management': 'Settings',
    '/settings/statistics': 'User Statistics',
    '/user-statistics': 'User Statistics',
    '/settings/criticality-definitions': 'Settings',
  };
  
  // Check for dynamic routes
  if (pathname.startsWith('/threats/')) return 'Observations';
  
  return pathMap[pathname] || 'Other';
};

// Track event API call
const trackEventAPI = async (eventData) => {
  const token = localStorage.getItem('token');
  if (!token) return; // Not logged in
  
  try {
    // Add device type to all events
    const enrichedData = {
      ...eventData,
      device_type: getDeviceType()
    };
    
    await fetch(`${API_BASE_URL}/api/user-stats/track`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(enrichedData)
    });
  } catch (error) {
    // Silently fail - tracking should not break the app
    console.debug('Analytics tracking failed:', error);
  }
};

/**
 * Hook to automatically track page views
 */
export const usePageTracking = () => {
  const location = useLocation();
  const { user } = useAuth();
  const lastPathRef = useRef(null);
  const pageStartTimeRef = useRef(null);
  
  useEffect(() => {
    if (!user) return;
    
    const currentPath = location.pathname;
    const currentModule = getModuleFromPath(currentPath);
    const sessionId = getSessionId();
    
    // Track duration of previous page
    if (lastPathRef.current && pageStartTimeRef.current) {
      const duration = Math.round((Date.now() - pageStartTimeRef.current) / 1000);
      const previousModule = getModuleFromPath(lastPathRef.current);
      
      // Only track if significant duration (> 1 second)
      if (duration > 1) {
        trackEventAPI({
          session_id: sessionId,
          module: previousModule,
          page: lastPathRef.current,
          event_type: 'page_view',
          duration: duration
        });
      }
    }
    
    // Update refs for new page
    lastPathRef.current = currentPath;
    pageStartTimeRef.current = Date.now();
    
    // Track new page view (without duration - duration will be calculated on next navigation)
    trackEventAPI({
      session_id: sessionId,
      module: currentModule,
      page: currentPath,
      event_type: 'page_view',
      action: 'Page Viewed'
    });
    
  }, [location.pathname, user]);
  
  // Track page duration on unmount
  useEffect(() => {
    return () => {
      if (lastPathRef.current && pageStartTimeRef.current) {
        const duration = Math.round((Date.now() - pageStartTimeRef.current) / 1000);
        if (duration > 1) {
          const previousModule = getModuleFromPath(lastPathRef.current);
          trackEventAPI({
            session_id: getSessionId(),
            module: previousModule,
            page: lastPathRef.current,
            event_type: 'page_view',
            duration: duration
          });
        }
      }
    };
  }, []);
};

/**
 * Hook to track specific actions
 * Returns a function to call when an action is performed
 */
export const useActionTracking = () => {
  const location = useLocation();
  const { user } = useAuth();
  
  const trackAction = useCallback((actionName, metadata = {}) => {
    if (!user) return;
    
    const currentModule = getModuleFromPath(location.pathname);
    const sessionId = getSessionId();
    
    trackEventAPI({
      session_id: sessionId,
      module: currentModule,
      page: location.pathname,
      action: actionName,
      event_type: 'action_executed',
      metadata
    });
  }, [location.pathname, user]);
  
  return trackAction;
};

/**
 * Combined hook for full analytics tracking
 */
export const useAnalyticsTracking = () => {
  usePageTracking();
  const trackAction = useActionTracking();
  
  return { trackAction };
};

export default useAnalyticsTracking;
