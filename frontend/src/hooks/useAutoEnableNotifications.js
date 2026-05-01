/**
 * useAutoEnableNotifications - Hook to automatically request notification permission on login
 * 
 * This hook should be called in the main App or Layout component.
 * It will prompt for notification permission once per user after login.
 */
import { useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { 
  autoRequestPermission,
  isNotificationSupported,
  getPermissionStatus,
  isIOS,
  isStandalone,
} from '../services/notificationService';

export function useAutoEnableNotifications() {
  const { user } = useAuth();
  const hasPromptedRef = useRef(false);

  useEffect(() => {
    // Only run when user logs in
    if (!user?.id) {
      hasPromptedRef.current = false;
      return;
    }

    // Don't prompt multiple times in same session
    if (hasPromptedRef.current) return;

    // iOS requires PWA - don't auto-prompt in browser
    if (isIOS() && !isStandalone()) return;

    // Check if notifications are supported
    if (!isNotificationSupported()) return;

    // Check if already decided
    const permission = getPermissionStatus();
    if (permission === 'granted' || permission === 'denied') return;

    // Small delay to not interrupt login flow
    const timer = setTimeout(async () => {
      hasPromptedRef.current = true;
      
      try {
        await autoRequestPermission();
      } catch (e) {
        console.warn('Auto notification permission request failed:', e);
      }
    }, 2000); // 2 second delay after login

    return () => clearTimeout(timer);
  }, [user?.id]);
}

export default useAutoEnableNotifications;
