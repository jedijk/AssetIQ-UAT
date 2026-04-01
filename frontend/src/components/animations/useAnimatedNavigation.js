/**
 * useAnimatedNavigation
 * Hook for animated navigation with route-based transitions
 */

import { useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom";

export const useAnimatedNavigation = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const animatedNavigate = useCallback((to, options = {}) => {
    // Store current scroll position if needed
    const currentScroll = window.scrollY;
    
    // Navigate
    navigate(to, {
      ...options,
      state: {
        ...options.state,
        fromPath: location.pathname,
        scrollPosition: currentScroll,
      },
    });
  }, [navigate, location.pathname]);

  const goBack = useCallback(() => {
    if (window.history.length > 2) {
      navigate(-1);
    } else {
      navigate("/dashboard");
    }
  }, [navigate]);

  return {
    navigate: animatedNavigate,
    goBack,
    currentPath: location.pathname,
  };
};

export default useAnimatedNavigation;
