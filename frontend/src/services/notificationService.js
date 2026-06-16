/**
 * Push Notification Service
 * Handles browser push notification permissions, subscriptions, and delivery.
 *
 * Background delivery (app closed / browser in background) requires:
 * 1. push-sw.js service worker registered
 * 2. PushManager subscription with server VAPID public key
 * 3. Server-side Web Push (VAPID_PRIVATE_KEY on backend)
 */

import { pushNotificationsAPI } from '../lib/api';

const NOTIFICATION_SETTINGS_KEY = 'assetiq_notification_settings';
const PUSH_SW_URL = '/push-sw.js';

/**
 * Convert VAPID public key to Uint8Array for PushManager.subscribe()
 */
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

/**
 * Register the minimal push-only service worker (independent of PWA cache SW).
 */
export async function ensurePushServiceWorker() {
  if (!('serviceWorker' in navigator)) return null;

  const useMainServiceWorker = process.env.REACT_APP_ENABLE_SERVICE_WORKER === 'true';

  try {
    const registrations = await navigator.serviceWorker.getRegistrations();
    const mainRegistration = registrations.find((reg) =>
      reg.active?.scriptURL?.includes('service-worker.js')
    );
    if (mainRegistration) {
      await navigator.serviceWorker.ready;
      return mainRegistration;
    }

    const pushRegistration = registrations.find((reg) =>
      reg.active?.scriptURL?.includes('push-sw.js')
    );
    if (pushRegistration) {
      await navigator.serviceWorker.ready;
      return pushRegistration;
    }

    const script = useMainServiceWorker ? '/service-worker.js' : PUSH_SW_URL;
    const registration = await navigator.serviceWorker.register(script, {
      scope: '/',
      updateViaCache: 'none',
    });
    await navigator.serviceWorker.ready;
    return registration;
  } catch (error) {
    console.error('[Notifications] Failed to register push service worker:', error);
    return null;
  }
}

/**
 * Sync an existing browser subscription with the backend (e.g. after login).
 */
export async function syncPushSubscription() {
  if (!isNotificationSupported()) return null;
  if (getPermissionStatus() !== 'granted') return null;

  const settings = getNotificationSettings();
  if (!settings.enabled) return null;

  return subscribeToPush();
}

// Default notification settings - enabled by default
const DEFAULT_SETTINGS = {
  enabled: true,  // Enabled by default
  overdueActions: true,
  newTasks: true,
  formReminders: true,
  observationAlerts: true,
  investigationUpdates: true,
  dailySummary: false,
  sound: true,
  autoPrompted: false,  // Track if we've auto-prompted
};

/**
 * Detect if running on iOS
 */
export function isIOS() {
  if (typeof navigator === 'undefined') return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || 
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

/**
 * Detect if running as installed PWA (standalone mode)
 */
export function isStandalone() {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true ||
    document.referrer.includes('android-app://');
}

/**
 * Check if notifications are supported
 */
export function isNotificationSupported() {
  if (typeof window === 'undefined') return false;
  
  // iOS requires PWA mode for notifications
  if (isIOS() && !isStandalone()) {
    return false;
  }
  
  return 'Notification' in window && 'serviceWorker' in navigator;
}

/**
 * Get detailed notification support info
 */
export function getNotificationSupportInfo() {
  const ios = isIOS();
  const standalone = isStandalone();
  const supported = isNotificationSupported();
  const permission = getPermissionStatus();
  
  return {
    supported,
    permission,
    isIOS: ios,
    isStandalone: standalone,
    requiresInstall: ios && !standalone,
    canEnable: supported && permission !== 'denied',
  };
}

/**
 * Get current notification permission status
 */
export function getPermissionStatus() {
  if (!('Notification' in window)) return 'unsupported';
  if (isIOS() && !isStandalone()) return 'requires-install';
  return Notification.permission; // 'default', 'granted', 'denied'
}

/**
 * Request notification permission from user
 */
export async function requestPermission() {
  if (!isNotificationSupported()) {
    return { success: false, error: 'Notifications not supported' };
  }

  try {
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      // Save settings
      const settings = getNotificationSettings();
      settings.enabled = true;
      settings.autoPrompted = true;
      saveNotificationSettings(settings);
      
      // Subscribe to push notifications
      await subscribeToPush();
      
      return { success: true, permission };
    }
    
    // Mark as prompted even if denied
    const settings = getNotificationSettings();
    settings.autoPrompted = true;
    saveNotificationSettings(settings);
    
    return { success: false, permission };
  } catch (error) {
    console.error('Failed to request notification permission:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Auto-request permission (called on login)
 * Only prompts once per user
 */
export async function autoRequestPermission() {
  if (!isNotificationSupported()) return false;
  
  // Check if already granted or denied
  const permission = getPermissionStatus();
  if (permission === 'granted') {
    const settings = getNotificationSettings();
    if (!settings.enabled) {
      settings.enabled = true;
      saveNotificationSettings(settings);
    }
    await subscribeToPush();
    return true;
  }
  
  if (permission === 'denied' || permission === 'requires-install') {
    return false;
  }
  
  // Check if we've already auto-prompted this user
  const settings = getNotificationSettings();
  if (settings.autoPrompted) {
    return false;
  }
  
  // Request permission
  const result = await requestPermission();
  return result.success;
}

/**
 * Get notification settings from localStorage
 */
export function getNotificationSettings() {
  try {
    const stored = localStorage.getItem(NOTIFICATION_SETTINGS_KEY);
    if (stored) {
      return { ...DEFAULT_SETTINGS, ...JSON.parse(stored) };
    }
  } catch (e) {
    console.warn('Failed to load notification settings:', e);
  }
  return { ...DEFAULT_SETTINGS };
}

/**
 * Save notification settings to localStorage
 */
export function saveNotificationSettings(settings) {
  try {
    localStorage.setItem(NOTIFICATION_SETTINGS_KEY, JSON.stringify(settings));
    return true;
  } catch (e) {
    console.warn('Failed to save notification settings:', e);
    return false;
  }
}

/**
 * Subscribe to push notifications and register subscription on the server.
 */
export async function subscribeToPush() {
  if (!isNotificationSupported()) return null;
  if (getPermissionStatus() !== 'granted') return null;

  try {
    const registration = await ensurePushServiceWorker();
    if (!registration?.pushManager) {
      console.warn('[Notifications] PushManager not available');
      return null;
    }

    let subscription = await registration.pushManager.getSubscription();

    if (!subscription) {
      let publicKey;
      try {
        const { publicKey: key, configured } = await pushNotificationsAPI.getVapidPublicKey();
        if (configured === false || !key) {
          console.warn('[Notifications] Server Web Push not configured (missing VAPID keys)');
          return null;
        }
        publicKey = key;
      } catch (error) {
        console.warn('[Notifications] Server Web Push not configured:', error?.response?.data?.detail || error.message);
        return null;
      }

      if (!publicKey) {
        console.warn('[Notifications] Missing VAPID public key from server');
        return null;
      }

      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
    }

    await pushNotificationsAPI.subscribe(subscription);
    return subscription;
  } catch (error) {
    console.error('Failed to subscribe to push:', error);
    return null;
  }
}

/**
 * Unsubscribe from push notifications
 */
export async function unsubscribeFromPush() {
  try {
    const registration = await ensurePushServiceWorker();
    const subscription = registration
      ? await registration.pushManager.getSubscription()
      : null;

    if (subscription) {
      try {
        await pushNotificationsAPI.unsubscribe(subscription.endpoint);
      } catch (error) {
        console.warn('[Notifications] Failed to remove server subscription:', error);
      }
      await subscription.unsubscribe();
    } else {
      try {
        await pushNotificationsAPI.unsubscribe();
      } catch (error) {
        console.warn('[Notifications] Failed to clear server subscriptions:', error);
      }
    }
    
    // Update settings
    const settings = getNotificationSettings();
    settings.enabled = false;
    saveNotificationSettings(settings);
    
    return true;
  } catch (error) {
    console.error('Failed to unsubscribe from push:', error);
    return false;
  }
}

/**
 * Send a test notification via the server (works when the app is closed).
 */
export async function sendServerTestPush() {
  if (getPermissionStatus() !== 'granted') {
    return { success: false, error: 'Permission not granted' };
  }

  try {
    await subscribeToPush();
    const result = await pushNotificationsAPI.sendTest();
    return { success: true, ...result };
  } catch (error) {
    const detail = error?.response?.data?.detail || error.message;
    return { success: false, error: detail };
  }
}

/**
 * Show a local notification (foreground / same-tab fallback).
 */
export async function showNotification(title, options = {}) {
  const settings = getNotificationSettings();
  
  if (!settings.enabled || getPermissionStatus() !== 'granted') {
    return false;
  }

  try {
    const registration = await ensurePushServiceWorker();
    if (!registration) {
      throw new Error('Push service worker unavailable');
    }
    
    const notificationOptions = {
      body: options.body || '',
      icon: options.icon || '/logo192.png',
      badge: '/logo192.png',
      tag: options.tag || `assetiq-${Date.now()}`,
      renotify: options.renotify || false,
      requireInteraction: options.requireInteraction || false,
      silent: !settings.sound,
      vibrate: settings.sound ? [100, 50, 100] : undefined,
      data: {
        url: options.url || '/',
        type: options.type || 'general',
        timestamp: Date.now(),
        ...options.data,
      },
      actions: options.actions || [],
    };

    await registration.showNotification(title, notificationOptions);
    return true;
  } catch (error) {
    console.error('Failed to show notification:', error);
    
    // Fallback to basic Notification API
    try {
      new Notification(title, {
        body: options.body,
        icon: '/logo192.png',
        tag: options.tag,
      });
      return true;
    } catch (e) {
      console.error('Fallback notification failed:', e);
      return false;
    }
  }
}

/**
 * Notification types with default messages
 */
export const NotificationTypes = {
  OVERDUE_ACTION: 'overdue_action',
  NEW_TASK: 'new_task',
  TASK_REMINDER: 'task_reminder',
  FORM_REMINDER: 'form_reminder',
  OBSERVATION_ALERT: 'observation_alert',
  INVESTIGATION_UPDATE: 'investigation_update',
  DAILY_SUMMARY: 'daily_summary',
  SYSTEM: 'system',
};

/**
 * Send specific notification types
 */
export const notify = {
  overdueAction: (action) => {
    const settings = getNotificationSettings();
    if (!settings.overdueActions) return;
    
    return showNotification('⚠️ Action Overdue', {
      body: `"${action.title || 'Untitled action'}" is past its due date`,
      url: `/actions?id=${action.id}`,
      tag: `overdue-${action.id}`,
      type: NotificationTypes.OVERDUE_ACTION,
      actions: [
        { action: 'view', title: 'View' },
        { action: 'dismiss', title: 'Dismiss' },
      ],
    });
  },

  // Deep links use /my-tasks until sunset 2026-09-01 (MyTasksPage route); API is /work-items
  newTask: (task) => {
    const settings = getNotificationSettings();
    if (!settings.newTasks) return;
    
    return showNotification('📋 New Task Assigned', {
      body: `You have a new task: "${task.title || task.name || 'Untitled'}"`,
      url: `/my-tasks?id=${task.id}`,
      tag: `task-${task.id}`,
      type: NotificationTypes.NEW_TASK,
      actions: [
        { action: 'start', title: 'Start' },
        { action: 'later', title: 'Later' },
      ],
    });
  },

  taskReminder: (task, minutesBefore) => {
    const settings = getNotificationSettings();
    if (!settings.newTasks) return;
    
    return showNotification('⏰ Task Reminder', {
      body: `"${task.title || task.name}" is due in ${minutesBefore} minutes`,
      url: `/my-tasks?id=${task.id}`,
      tag: `reminder-${task.id}`,
      type: NotificationTypes.TASK_REMINDER,
      requireInteraction: true,
    });
  },

  formReminder: (form) => {
    const settings = getNotificationSettings();
    if (!settings.formReminders) return;
    
    return showNotification('📝 Form Due', {
      body: `Time to complete: "${form.name || 'Form'}"`,
      url: `/my-tasks`,
      tag: `form-${form.id}`,
      type: NotificationTypes.FORM_REMINDER,
    });
  },

  observationAlert: (observation) => {
    const settings = getNotificationSettings();
    if (!settings.observationAlerts) return;
    
    const severity = observation.severity || observation.risk_level || 'Unknown';
    const emoji = severity.toLowerCase() === 'high' ? '🔴' : severity.toLowerCase() === 'medium' ? '🟠' : '🟡';
    
    return showNotification(`${emoji} New Observation`, {
      body: `${severity} severity: "${observation.description?.slice(0, 50) || 'New observation reported'}"`,
      url: `/observations?id=${observation.id}`,
      tag: `obs-${observation.id}`,
      type: NotificationTypes.OBSERVATION_ALERT,
    });
  },

  investigationUpdate: (investigation, update) => {
    const settings = getNotificationSettings();
    if (!settings.investigationUpdates) return;
    
    return showNotification('🔍 Investigation Update', {
      body: update || `"${investigation.title || 'Investigation'}" has been updated`,
      url: `/investigations?id=${investigation.id}`,
      tag: `inv-${investigation.id}`,
      type: NotificationTypes.INVESTIGATION_UPDATE,
    });
  },

  dailySummary: (stats) => {
    const settings = getNotificationSettings();
    if (!settings.dailySummary) return;
    
    const parts = [];
    if (stats.overdueActions > 0) parts.push(`${stats.overdueActions} overdue actions`);
    if (stats.pendingTasks > 0) parts.push(`${stats.pendingTasks} pending tasks`);
    if (stats.newObservations > 0) parts.push(`${stats.newObservations} new observations`);
    
    const body = parts.length > 0 
      ? parts.join(', ')
      : 'All caught up! No pending items.';
    
    return showNotification('📊 Daily Summary', {
      body,
      url: '/dashboard',
      tag: 'daily-summary',
      type: NotificationTypes.DAILY_SUMMARY,
    });
  },

  system: (title, body, url = '/') => {
    return showNotification(title, {
      body,
      url,
      type: NotificationTypes.SYSTEM,
    });
  },
};

/**
 * Schedule a notification for later
 */
export function scheduleNotification(title, options, delayMs) {
  return new Promise((resolve) => {
    setTimeout(async () => {
      const result = await showNotification(title, options);
      resolve(result);
    }, delayMs);
  });
}

/**
 * Check for pending notifications (overdue actions, etc.)
 * Call this periodically or on app load
 */
export async function checkPendingNotifications(data) {
  const settings = getNotificationSettings();
  if (!settings.enabled) return;

  const { actions = [], tasks = [] } = data;
  const now = Date.now();

  // Check for overdue actions (only notify once per action)
  const notifiedOverdue = new Set(
    JSON.parse(localStorage.getItem('notified_overdue') || '[]')
  );

  for (const action of actions) {
    if (!action.id) continue;
    
    const dueDate = action.due_date || action.dueDate || action.deadline;
    if (!dueDate) continue;
    
    const due = new Date(dueDate).getTime();
    const status = (action.status || '').toLowerCase();
    const isClosed = ['closed', 'completed', 'done'].includes(status);
    
    if (!isClosed && due < now && !notifiedOverdue.has(action.id)) {
      await notify.overdueAction(action);
      notifiedOverdue.add(action.id);
    }
  }

  localStorage.setItem('notified_overdue', JSON.stringify([...notifiedOverdue]));
}

/**
 * Clear notification history (for testing)
 */
export function clearNotificationHistory() {
  localStorage.removeItem('notified_overdue');
}

export default {
  isNotificationSupported,
  getPermissionStatus,
  requestPermission,
  getNotificationSettings,
  saveNotificationSettings,
  ensurePushServiceWorker,
  subscribeToPush,
  syncPushSubscription,
  sendServerTestPush,
  showNotification,
  notify,
  scheduleNotification,
  checkPendingNotifications,
  clearNotificationHistory,
  NotificationTypes,
};
