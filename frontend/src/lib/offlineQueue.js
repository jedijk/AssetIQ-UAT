/**
 * Offline Data Queue Utility
 * Handles storing and syncing data when the app goes offline
 */

const DB_NAME = 'ReliabilityOS';
const DB_VERSION = 1;

// Open IndexedDB connection
export const openDB = () => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      
      // Create object stores for offline data
      if (!db.objectStoreNames.contains('pending_observations')) {
        const obsStore = db.createObjectStore('pending_observations', { keyPath: 'id', autoIncrement: true });
        obsStore.createIndex('created_at', 'created_at', { unique: false });
      }
      if (!db.objectStoreNames.contains('pending_tasks')) {
        const taskStore = db.createObjectStore('pending_tasks', { keyPath: 'id', autoIncrement: true });
        taskStore.createIndex('created_at', 'created_at', { unique: false });
      }
      if (!db.objectStoreNames.contains('pending_forms')) {
        const formStore = db.createObjectStore('pending_forms', { keyPath: 'id', autoIncrement: true });
        formStore.createIndex('created_at', 'created_at', { unique: false });
      }
      if (!db.objectStoreNames.contains('pending_threats')) {
        const threatStore = db.createObjectStore('pending_threats', { keyPath: 'id', autoIncrement: true });
        threatStore.createIndex('created_at', 'created_at', { unique: false });
      }
      if (!db.objectStoreNames.contains('cached_data')) {
        db.createObjectStore('cached_data', { keyPath: 'key' });
      }
    };
  });
};

// Add item to offline queue
export const queueOfflineItem = async (storeName, data) => {
  try {
    const db = await openDB();
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    
    const item = {
      ...data,
      created_at: new Date().toISOString(),
      synced: false,
    };
    
    await new Promise((resolve, reject) => {
      const request = store.add(item);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    
    // Request background sync if available
    if ('serviceWorker' in navigator && 'sync' in window.registration) {
      try {
        const registration = await navigator.serviceWorker.ready;
        await registration.sync.register(`sync-${storeName.replace('pending_', '')}`);
      } catch (e) {
        console.log('Background sync not available:', e);
      }
    }
    
    return true;
  } catch (error) {
    console.error('Failed to queue offline item:', error);
    return false;
  }
};

// Get all pending items from a store
export const getPendingItems = async (storeName) => {
  try {
    const db = await openDB();
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    
    return new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error('Failed to get pending items:', error);
    return [];
  }
};

// Remove item from queue after successful sync
export const removeFromQueue = async (storeName, id) => {
  try {
    const db = await openDB();
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    
    await new Promise((resolve, reject) => {
      const request = store.delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
    
    return true;
  } catch (error) {
    console.error('Failed to remove from queue:', error);
    return false;
  }
};

// Get count of pending items
export const getPendingCount = async (storeName) => {
  try {
    const db = await openDB();
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    
    return new Promise((resolve, reject) => {
      const request = store.count();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error('Failed to get pending count:', error);
    return 0;
  }
};

// Cache data for offline access
export const cacheData = async (key, data) => {
  try {
    const db = await openDB();
    const tx = db.transaction('cached_data', 'readwrite');
    const store = tx.objectStore('cached_data');
    
    await new Promise((resolve, reject) => {
      const request = store.put({ key, data, cached_at: new Date().toISOString() });
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
    
    return true;
  } catch (error) {
    console.error('Failed to cache data:', error);
    return false;
  }
};

// Get cached data
export const getCachedData = async (key) => {
  try {
    const db = await openDB();
    const tx = db.transaction('cached_data', 'readonly');
    const store = tx.objectStore('cached_data');
    
    return new Promise((resolve, reject) => {
      const request = store.get(key);
      request.onsuccess = () => resolve(request.result?.data || null);
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error('Failed to get cached data:', error);
    return null;
  }
};

// Sync all pending items
export const syncPendingItems = async (storeName, apiEndpoint, token) => {
  try {
    const items = await getPendingItems(storeName);
    const results = { synced: 0, failed: 0 };
    
    for (const item of items) {
      try {
        const response = await fetch(apiEndpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify(item.data),
        });
        
        if (response.ok) {
          await removeFromQueue(storeName, item.id);
          results.synced++;
        } else {
          results.failed++;
        }
      } catch (error) {
        results.failed++;
      }
    }
    
    return results;
  } catch (error) {
    console.error('Failed to sync pending items:', error);
    return { synced: 0, failed: 0, error };
  }
};

// Check if online
export const isOnline = () => navigator.onLine;

// Listen for online/offline events
export const addNetworkListener = (onOnline, onOffline) => {
  window.addEventListener('online', onOnline);
  window.addEventListener('offline', onOffline);
  
  return () => {
    window.removeEventListener('online', onOnline);
    window.removeEventListener('offline', onOffline);
  };
};

export default {
  openDB,
  queueOfflineItem,
  getPendingItems,
  removeFromQueue,
  getPendingCount,
  cacheData,
  getCachedData,
  syncPendingItems,
  isOnline,
  addNetworkListener,
};
