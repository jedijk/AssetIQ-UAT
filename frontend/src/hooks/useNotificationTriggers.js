/**
 * useNotificationTriggers - Hook to trigger push notifications based on app events
 * 
 * This hook monitors app state and triggers appropriate push notifications:
 * - New task assignments
 * - Overdue actions
 * - New observations (high severity)
 * - Investigation updates
 */
import { useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { 
  notify, 
  checkPendingNotifications, 
  getNotificationSettings,
  isNotificationSupported,
  getPermissionStatus,
} from '../services/notificationService';

// Track which items we've already notified about
const NOTIFIED_TASKS_KEY = 'assetiq_notified_tasks';
const NOTIFIED_OBSERVATIONS_KEY = 'assetiq_notified_observations';
const CHECK_INTERVAL = 5 * 60 * 1000; // Check every 5 minutes

function getNotifiedSet(key) {
  try {
    return new Set(JSON.parse(localStorage.getItem(key) || '[]'));
  } catch {
    return new Set();
  }
}

function saveNotifiedSet(key, set) {
  try {
    // Keep only the last 500 items to prevent unbounded growth
    const arr = [...set].slice(-500);
    localStorage.setItem(key, JSON.stringify(arr));
  } catch (e) {
    console.warn('Failed to save notified set:', e);
  }
}

export function useNotificationTriggers({ 
  tasks = [], 
  actions = [], 
  observations = [],
  enabled = true 
}) {
  const { user } = useAuth();
  const lastCheckRef = useRef(0);
  const previousTasksRef = useRef(new Set());
  const previousObservationsRef = useRef(new Set());

  // Check if notifications are available
  const canNotify = useCallback(() => {
    if (!enabled) return false;
    if (!isNotificationSupported()) return false;
    if (getPermissionStatus() !== 'granted') return false;
    const settings = getNotificationSettings();
    return settings.enabled;
  }, [enabled]);

  // Check for new tasks assigned to current user
  useEffect(() => {
    if (!canNotify() || !user?.id) return;

    const settings = getNotificationSettings();
    if (!settings.newTasks) return;

    const notifiedTasks = getNotifiedSet(NOTIFIED_TASKS_KEY);
    const currentTaskIds = new Set(tasks.map(t => t.id));

    // Find tasks that are:
    // 1. Assigned to current user
    // 2. Not previously seen
    // 3. Not already notified
    const newTasks = tasks.filter(task => {
      if (!task.id) return false;
      
      // Check if assigned to current user
      const assignee = task.assignee || task.assigned_to || task.owner_id || task.user_id;
      if (assignee !== user.id) return false;
      
      // Check if we've already notified
      if (notifiedTasks.has(task.id)) return false;
      
      // Check if this is truly new (wasn't in previous render)
      if (previousTasksRef.current.has(task.id)) return false;
      
      // Check if task is recent (created in last hour)
      const created = new Date(task.created_at || task.createdAt);
      if (isNaN(created)) return false;
      const hourAgo = Date.now() - (60 * 60 * 1000);
      if (created.getTime() < hourAgo) return false;
      
      return true;
    });

    // Send notifications for new tasks
    newTasks.forEach(task => {
      notify.newTask(task);
      notifiedTasks.add(task.id);
    });

    if (newTasks.length > 0) {
      saveNotifiedSet(NOTIFIED_TASKS_KEY, notifiedTasks);
    }

    previousTasksRef.current = currentTaskIds;
  }, [tasks, user?.id, canNotify]);

  // Check for high severity observations
  useEffect(() => {
    if (!canNotify()) return;

    const settings = getNotificationSettings();
    if (!settings.observationAlerts) return;

    const notifiedObs = getNotifiedSet(NOTIFIED_OBSERVATIONS_KEY);
    const currentObsIds = new Set(observations.map(o => o.id));

    // Find high-severity observations that are new
    const newHighSeverity = observations.filter(obs => {
      if (!obs.id) return false;
      
      // Only notify for high/critical severity
      const severity = (obs.severity || obs.risk_level || '').toLowerCase();
      if (!['high', 'critical', 'severe'].includes(severity)) return false;
      
      // Check if we've already notified
      if (notifiedObs.has(obs.id)) return false;
      
      // Check if this is truly new
      if (previousObservationsRef.current.has(obs.id)) return false;
      
      // Check if observation is recent (created in last hour)
      const created = new Date(obs.created_at || obs.createdAt);
      if (isNaN(created)) return false;
      const hourAgo = Date.now() - (60 * 60 * 1000);
      if (created.getTime() < hourAgo) return false;
      
      return true;
    });

    // Send notifications
    newHighSeverity.forEach(obs => {
      notify.observationAlert(obs);
      notifiedObs.add(obs.id);
    });

    if (newHighSeverity.length > 0) {
      saveNotifiedSet(NOTIFIED_OBSERVATIONS_KEY, notifiedObs);
    }

    previousObservationsRef.current = currentObsIds;
  }, [observations, canNotify]);

  // Periodically check for overdue actions
  useEffect(() => {
    if (!canNotify()) return;

    const settings = getNotificationSettings();
    if (!settings.overdueActions) return;

    const checkOverdue = () => {
      const now = Date.now();
      // Don't check more than once per interval
      if (now - lastCheckRef.current < CHECK_INTERVAL) return;
      lastCheckRef.current = now;

      checkPendingNotifications({ actions, tasks });
    };

    // Initial check
    checkOverdue();

    // Set up interval for periodic checks
    const intervalId = setInterval(checkOverdue, CHECK_INTERVAL);

    return () => clearInterval(intervalId);
  }, [actions, tasks, canNotify]);

  return null;
}

/**
 * Utility to manually trigger a notification for testing or specific events
 */
export function triggerNotification(type, data) {
  if (!isNotificationSupported()) return false;
  if (getPermissionStatus() !== 'granted') return false;
  
  const settings = getNotificationSettings();
  if (!settings.enabled) return false;

  switch (type) {
    case 'newTask':
      return notify.newTask(data);
    case 'overdueAction':
      return notify.overdueAction(data);
    case 'observationAlert':
      return notify.observationAlert(data);
    case 'investigationUpdate':
      return notify.investigationUpdate(data, data.message);
    case 'formReminder':
      return notify.formReminder(data);
    case 'dailySummary':
      return notify.dailySummary(data);
    default:
      return notify.system(data.title, data.body, data.url);
  }
}

export default useNotificationTriggers;
