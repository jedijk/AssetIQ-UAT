/**
 * NotificationPrompt - A banner to encourage users to enable notifications
 */
import React, { useState, useEffect } from 'react';
import { Bell, X, BellRing, Share, Smartphone } from 'lucide-react';
import { Button } from './ui/button';
import {
  isNotificationSupported,
  getPermissionStatus,
  requestPermission,
  getNotificationSettings,
  isIOS,
  isStandalone,
} from '../services/notificationService';

const DISMISS_KEY = 'assetiq_notification_prompt_dismissed';
const DISMISS_DURATION = 7 * 24 * 60 * 60 * 1000; // 7 days

export function NotificationPrompt() {
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  useEffect(() => {
    // Check if we should show the prompt
    const checkVisibility = () => {
      // On iOS without PWA, show install guide instead
      if (isIOS() && !isStandalone()) {
        // Check if dismissed
        const dismissedAt = localStorage.getItem(DISMISS_KEY + '_ios');
        if (dismissedAt) {
          const dismissedTime = parseInt(dismissedAt, 10);
          if (Date.now() - dismissedTime < DISMISS_DURATION) return false;
        }
        return true; // Show iOS guide
      }
      
      if (!isNotificationSupported()) return false;
      
      const permission = getPermissionStatus();
      if (permission === 'granted' || permission === 'denied') return false;
      
      const settings = getNotificationSettings();
      if (settings.enabled) return false;
      
      // Check if dismissed recently
      const dismissedAt = localStorage.getItem(DISMISS_KEY);
      if (dismissedAt) {
        const dismissedTime = parseInt(dismissedAt, 10);
        if (Date.now() - dismissedTime < DISMISS_DURATION) return false;
      }
      
      return true;
    };

    // Delay showing the prompt to not interrupt the initial experience
    const timer = setTimeout(() => {
      const shouldShow = checkVisibility();
      setVisible(shouldShow);
      setShowIOSGuide(isIOS() && !isStandalone());
    }, 5000);

    return () => clearTimeout(timer);
  }, []);

  const handleEnable = async () => {
    setLoading(true);
    try {
      const result = await requestPermission();
      if (result.success) {
        setVisible(false);
      }
    } catch (e) {
      console.error('Failed to enable notifications:', e);
    }
    setLoading(false);
  };

  const handleDismiss = () => {
    const key = showIOSGuide ? DISMISS_KEY + '_ios' : DISMISS_KEY;
    localStorage.setItem(key, String(Date.now()));
    setVisible(false);
  };

  if (!visible) return null;

  // iOS "Add to Home Screen" guide
  if (showIOSGuide) {
    return (
      <div className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-4 sm:max-w-md z-50 animate-slide-up">
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-2xl shadow-lg p-4 text-white">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center flex-shrink-0">
              <Smartphone className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm">Get push notifications</p>
              <p className="text-sm text-white/90 mt-0.5">
                Install the app to your home screen to receive alerts when you're away.
              </p>
              <div className="flex items-center gap-2 mt-2 text-xs text-white/80">
                <Share className="w-4 h-4" />
                <span>Tap Share → Add to Home Screen</span>
              </div>
              <div className="flex items-center gap-2 mt-3">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={handleDismiss}
                  className="text-white/80 hover:text-white hover:bg-white/10"
                >
                  Maybe later
                </Button>
              </div>
            </div>
            <button
              onClick={handleDismiss}
              className="text-white/60 hover:text-white p-1 -mr-1 -mt-1"
              aria-label="Dismiss"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-4 sm:max-w-md z-50 animate-slide-up">
      <div className="bg-gradient-to-r from-indigo-600 to-purple-600 rounded-2xl shadow-lg p-4 text-white">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center flex-shrink-0">
            <BellRing className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm">Stay updated!</p>
            <p className="text-sm text-white/90 mt-0.5">
              Enable push notifications to get alerts for overdue actions, new tasks, and important updates - even when you're not in the app.
            </p>
            <div className="flex items-center gap-2 mt-3">
              <Button
                size="sm"
                variant="secondary"
                onClick={handleEnable}
                disabled={loading}
                className="bg-white text-indigo-600 hover:bg-white/90"
              >
                {loading ? 'Enabling...' : 'Enable Notifications'}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={handleDismiss}
                className="text-white/80 hover:text-white hover:bg-white/10"
              >
                Not now
              </Button>
            </div>
          </div>
          <button
            onClick={handleDismiss}
            className="text-white/60 hover:text-white p-1 -mr-1 -mt-1"
            aria-label="Dismiss"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
}

export default NotificationPrompt;
