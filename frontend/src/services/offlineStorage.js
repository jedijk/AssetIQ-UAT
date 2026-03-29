/**
 * Offline Storage Service for My Tasks
 * Handles caching tasks and syncing completed work when back online
 */

import { useState, useEffect } from 'react';

const DB_NAME = 'threatbase_offline';
const DB_VERSION = 1;
const STORES = {
  TASKS: 'tasks',
  PENDING_COMPLETIONS: 'pending_completions',
  SYNC_QUEUE: 'sync_queue',
};

class OfflineStorageService {
  constructor() {
    this.db = null;
    this.isOnline = navigator.onLine;
    this.syncInProgress = false;
    this.listeners = new Set();
    
    // Listen for online/offline events
    window.addEventListener('online', () => this.handleOnlineStatusChange(true));
    window.addEventListener('offline', () => this.handleOnlineStatusChange(false));
  }

  // Initialize IndexedDB
  async init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve(this.db);
      };
      
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        
        // Tasks store - cache for offline access
        if (!db.objectStoreNames.contains(STORES.TASKS)) {
          const tasksStore = db.createObjectStore(STORES.TASKS, { keyPath: 'id' });
          tasksStore.createIndex('status', 'status', { unique: false });
          tasksStore.createIndex('due_date', 'due_date', { unique: false });
        }
        
        // Pending completions - tasks completed offline awaiting sync
        if (!db.objectStoreNames.contains(STORES.PENDING_COMPLETIONS)) {
          const pendingStore = db.createObjectStore(STORES.PENDING_COMPLETIONS, { keyPath: 'id' });
          pendingStore.createIndex('created_at', 'created_at', { unique: false });
        }
        
        // Sync queue - general sync operations
        if (!db.objectStoreNames.contains(STORES.SYNC_QUEUE)) {
          db.createObjectStore(STORES.SYNC_QUEUE, { keyPath: 'id', autoIncrement: true });
        }
      };
    });
  }

  // Handle online status change
  handleOnlineStatusChange(isOnline) {
    this.isOnline = isOnline;
    this.notifyListeners({ type: 'connection', isOnline });
    
    if (isOnline) {
      // Auto-sync when coming back online
      this.syncPendingCompletions();
    }
  }

  // Add listener for status changes
  addListener(callback) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  // Notify all listeners
  notifyListeners(event) {
    this.listeners.forEach(callback => callback(event));
  }

  // Cache tasks for offline access
  async cacheTasks(tasks) {
    if (!this.db) await this.init();
    
    const transaction = this.db.transaction([STORES.TASKS], 'readwrite');
    const store = transaction.objectStore(STORES.TASKS);
    
    // Clear old cache and add new tasks
    await new Promise((resolve, reject) => {
      const clearRequest = store.clear();
      clearRequest.onsuccess = resolve;
      clearRequest.onerror = () => reject(clearRequest.error);
    });
    
    for (const task of tasks) {
      store.put({
        ...task,
        cached_at: new Date().toISOString(),
      });
    }
    
    return new Promise((resolve, reject) => {
      transaction.oncomplete = () => resolve(tasks.length);
      transaction.onerror = () => reject(transaction.error);
    });
  }

  // Get cached tasks
  async getCachedTasks() {
    if (!this.db) await this.init();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([STORES.TASKS], 'readonly');
      const store = transaction.objectStore(STORES.TASKS);
      const request = store.getAll();
      
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }

  // Get single cached task
  async getCachedTask(taskId) {
    if (!this.db) await this.init();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([STORES.TASKS], 'readonly');
      const store = transaction.objectStore(STORES.TASKS);
      const request = store.get(taskId);
      
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  // Save task completion for later sync
  async savePendingCompletion(taskId, completionData, taskInfo) {
    if (!this.db) await this.init();
    
    const pendingCompletion = {
      id: `${taskId}_${Date.now()}`,
      task_id: taskId,
      task_title: taskInfo?.title || 'Unknown Task',
      completion_data: completionData,
      is_action: taskInfo?.source_type === 'action',
      created_at: new Date().toISOString(),
      status: 'pending',
    };
    
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([STORES.PENDING_COMPLETIONS], 'readwrite');
      const store = transaction.objectStore(STORES.PENDING_COMPLETIONS);
      const request = store.put(pendingCompletion);
      
      request.onsuccess = () => {
        this.notifyListeners({ type: 'pending_added', completion: pendingCompletion });
        resolve(pendingCompletion);
      };
      request.onerror = () => reject(request.error);
    });
  }

  // Get all pending completions
  async getPendingCompletions() {
    if (!this.db) await this.init();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([STORES.PENDING_COMPLETIONS], 'readonly');
      const store = transaction.objectStore(STORES.PENDING_COMPLETIONS);
      const request = store.getAll();
      
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }

  // Remove pending completion after successful sync
  async removePendingCompletion(id) {
    if (!this.db) await this.init();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([STORES.PENDING_COMPLETIONS], 'readwrite');
      const store = transaction.objectStore(STORES.PENDING_COMPLETIONS);
      const request = store.delete(id);
      
      request.onsuccess = () => resolve(true);
      request.onerror = () => reject(request.error);
    });
  }

  // Update task in cache (e.g., mark as completed locally)
  async updateCachedTask(taskId, updates) {
    if (!this.db) await this.init();
    
    const task = await this.getCachedTask(taskId);
    if (!task) return null;
    
    const updatedTask = { ...task, ...updates, updated_locally: true };
    
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([STORES.TASKS], 'readwrite');
      const store = transaction.objectStore(STORES.TASKS);
      const request = store.put(updatedTask);
      
      request.onsuccess = () => resolve(updatedTask);
      request.onerror = () => reject(request.error);
    });
  }

  // Sync pending completions with server
  async syncPendingCompletions() {
    if (this.syncInProgress || !this.isOnline) return { synced: 0, failed: 0 };
    
    this.syncInProgress = true;
    this.notifyListeners({ type: 'sync_started' });
    
    const pending = await this.getPendingCompletions();
    let synced = 0;
    let failed = 0;
    
    const API_BASE_URL = process.env.REACT_APP_BACKEND_URL;
    const token = localStorage.getItem('token');
    
    for (const completion of pending) {
      try {
        const endpoint = completion.is_action
          ? `${API_BASE_URL}/api/my-tasks/action/${completion.task_id}/complete`
          : `${API_BASE_URL}/api/task-instances/${completion.task_id}/complete`;
        
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(completion.completion_data),
        });
        
        if (response.ok) {
          await this.removePendingCompletion(completion.id);
          synced++;
        } else {
          failed++;
        }
      } catch (error) {
        console.error('Sync error:', error);
        failed++;
      }
    }
    
    this.syncInProgress = false;
    this.notifyListeners({ type: 'sync_completed', synced, failed });
    
    return { synced, failed };
  }

  // Check online status
  getOnlineStatus() {
    return this.isOnline;
  }

  // Get sync status
  async getSyncStatus() {
    const pending = await this.getPendingCompletions();
    return {
      isOnline: this.isOnline,
      pendingCount: pending.length,
      syncInProgress: this.syncInProgress,
    };
  }

  // Clear all cached data
  async clearCache() {
    if (!this.db) await this.init();
    
    const transaction = this.db.transaction([STORES.TASKS], 'readwrite');
    const store = transaction.objectStore(STORES.TASKS);
    
    return new Promise((resolve, reject) => {
      const request = store.clear();
      request.onsuccess = () => resolve(true);
      request.onerror = () => reject(request.error);
    });
  }
}

// Singleton instance
export const offlineStorage = new OfflineStorageService();

// React hook for offline status
export const useOfflineStatus = () => {
  const [status, setStatus] = useState({
    isOnline: navigator.onLine,
    pendingCount: 0,
    syncInProgress: false,
  });

  useEffect(() => {
    // Initialize and get initial status
    const init = async () => {
      await offlineStorage.init();
      const syncStatus = await offlineStorage.getSyncStatus();
      setStatus(syncStatus);
    };
    init();

    // Listen for changes
    const unsubscribe = offlineStorage.addListener((event) => {
      if (event.type === 'connection') {
        setStatus(prev => ({ ...prev, isOnline: event.isOnline }));
      } else if (event.type === 'pending_added') {
        setStatus(prev => ({ ...prev, pendingCount: prev.pendingCount + 1 }));
      } else if (event.type === 'sync_started') {
        setStatus(prev => ({ ...prev, syncInProgress: true }));
      } else if (event.type === 'sync_completed') {
        offlineStorage.getSyncStatus().then(setStatus);
      }
    });

    return unsubscribe;
  }, []);

  return status;
};
