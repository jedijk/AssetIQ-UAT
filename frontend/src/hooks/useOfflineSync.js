import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import offlineQueue from '../lib/offlineQueue';
import { getBackendUrl } from '../lib/apiConfig';

/**
 * Hook for managing offline data synchronization
 */
export const useOfflineSync = () => {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [pendingCounts, setPendingCounts] = useState({
    observations: 0,
    tasks: 0,
    forms: 0,
    threats: 0,
  });
  const [isSyncing, setIsSyncing] = useState(false);

  // Update pending counts
  const updatePendingCounts = useCallback(async () => {
    const counts = {
      observations: await offlineQueue.getPendingCount('pending_observations'),
      tasks: await offlineQueue.getPendingCount('pending_tasks'),
      forms: await offlineQueue.getPendingCount('pending_forms'),
      threats: await offlineQueue.getPendingCount('pending_threats'),
    };
    setPendingCounts(counts);
  }, []);

  // Queue an observation for offline sync
  const queueObservation = useCallback(async (data) => {
    const result = await offlineQueue.queueOfflineItem('pending_observations', {
      data,
      url: `${getBackendUrl()}/api/observations`,
      method: 'POST',
    });
    if (result) {
      await updatePendingCounts();
      toast.info('Observation saved offline. Will sync when connected.');
    }
    return result;
  }, [updatePendingCounts]);

  // Queue a task completion for offline sync
  const queueTaskCompletion = useCallback(async (taskId, data) => {
    const result = await offlineQueue.queueOfflineItem('pending_tasks', {
      data,
      url: `${getBackendUrl()}/api/tasks/instances/${taskId}/complete`,
      method: 'POST',
    });
    if (result) {
      await updatePendingCounts();
      toast.info('Task completion saved offline. Will sync when connected.');
    }
    return result;
  }, [updatePendingCounts]);

  // Queue a form submission for offline sync
  const queueFormSubmission = useCallback(async (data) => {
    const result = await offlineQueue.queueOfflineItem('pending_forms', {
      data,
      url: `${getBackendUrl()}/api/forms/submit`,
      method: 'POST',
    });
    if (result) {
      await updatePendingCounts();
      toast.info('Form saved offline. Will sync when connected.');
    }
    return result;
  }, [updatePendingCounts]);

  // Queue a threat report for offline sync
  const queueThreat = useCallback(async (data) => {
    const result = await offlineQueue.queueOfflineItem('pending_threats', {
      data,
      url: `${getBackendUrl()}/api/chat/send`,
      method: 'POST',
    });
    if (result) {
      await updatePendingCounts();
      toast.info('Threat report saved offline. Will sync when connected.');
    }
    return result;
  }, [updatePendingCounts]);

  // Sync all pending items
  const syncAllPending = useCallback(async () => {
    if (!navigator.onLine) {
      toast.error('Cannot sync while offline');
      return;
    }

    setIsSyncing(true);
    const token = localStorage.getItem('token');
    const API_URL = getBackendUrl();

    try {
      const syncConfigs = [
        { store: 'pending_observations', endpoint: `${API_URL}/api/observations` },
        { store: 'pending_tasks', endpoint: null }, // Tasks have dynamic URLs
        { store: 'pending_forms', endpoint: `${API_URL}/api/forms/submit` },
        { store: 'pending_threats', endpoint: `${API_URL}/api/chat/send` },
      ];

      let totalSynced = 0;
      let totalFailed = 0;

      for (const config of syncConfigs) {
        if (config.endpoint) {
          const result = await offlineQueue.syncPendingItems(
            config.store,
            config.endpoint,
            token
          );
          totalSynced += result.synced;
          totalFailed += result.failed;
        } else {
          // Handle items with dynamic URLs (like task completions)
          const items = await offlineQueue.getPendingItems(config.store);
          for (const item of items) {
            try {
              const response = await fetch(item.url, {
                method: item.method,
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${token}`,
                },
                body: JSON.stringify(item.data),
              });
              if (response.ok) {
                await offlineQueue.removeFromQueue(config.store, item.id);
                totalSynced++;
              } else {
                totalFailed++;
              }
            } catch {
              totalFailed++;
            }
          }
        }
      }

      await updatePendingCounts();

      if (totalSynced > 0) {
        toast.success(`Synced ${totalSynced} items`);
      }
      if (totalFailed > 0) {
        toast.error(`Failed to sync ${totalFailed} items`);
      }
    } catch (error) {
      console.error('Sync error:', error);
      toast.error('Sync failed. Will retry later.');
    } finally {
      setIsSyncing(false);
    }
  }, [updatePendingCounts]);

  // Set up network listeners
  useEffect(() => {
    const handleOnline = async () => {
      setIsOnline(true);
      toast.success('Back online! Syncing pending data...');
      await syncAllPending();
    };

    const handleOffline = () => {
      setIsOnline(false);
      toast.warning('You are offline. Data will be saved locally.');
    };

    const cleanup = offlineQueue.addNetworkListener(handleOnline, handleOffline);
    updatePendingCounts();

    return cleanup;
  }, [syncAllPending, updatePendingCounts]);

  // Get total pending count
  const totalPending = Object.values(pendingCounts).reduce((a, b) => a + b, 0);

  return {
    isOnline,
    pendingCounts,
    totalPending,
    isSyncing,
    queueObservation,
    queueTaskCompletion,
    queueFormSubmission,
    queueThreat,
    syncAllPending,
    updatePendingCounts,
  };
};

export default useOfflineSync;
