/* eslint-disable no-restricted-globals */

const CACHE_NAME = 'reliabilityos-v1';
const OFFLINE_URL = '/offline.html';

// Assets to cache on install
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/offline.html',
  '/logo.png',
  '/logo192.png',
  '/logo512.png',
  '/manifest.json',
];

// API routes that should be cached with network-first strategy
const API_CACHE_ROUTES = [
  '/api/equipment-hierarchy/nodes',
  '/api/failure-modes',
  '/api/equipment-hierarchy/types',
];

// Install event - cache static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Caching static assets');
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

// Activate event - clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => {
            console.log('[SW] Removing old cache:', name);
            return caches.delete(name);
          })
      );
    })
  );
  self.clients.claim();
});

// Fetch event - network first for API, cache first for static
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') {
    return;
  }

  // Skip chrome-extension and other non-http(s) requests
  if (!url.protocol.startsWith('http')) {
    return;
  }

  // API requests - network first, fallback to cache
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(networkFirstStrategy(request));
    return;
  }

  // Static assets - cache first, fallback to network
  event.respondWith(cacheFirstStrategy(request));
});

// Network first strategy (for API calls)
async function networkFirstStrategy(request) {
  try {
    const networkResponse = await fetch(request);
    
    // Cache successful GET responses for cacheable API routes
    if (networkResponse.ok && API_CACHE_ROUTES.some(route => request.url.includes(route))) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, networkResponse.clone());
    }
    
    return networkResponse;
  } catch (error) {
    // Network failed, try cache
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      console.log('[SW] Serving from cache:', request.url);
      return cachedResponse;
    }
    
    // Return offline response for navigation requests
    if (request.mode === 'navigate') {
      return caches.match(OFFLINE_URL);
    }
    
    // Return error response for API
    return new Response(
      JSON.stringify({ error: 'Offline', message: 'No cached data available' }),
      { 
        status: 503, 
        headers: { 'Content-Type': 'application/json' } 
      }
    );
  }
}

// Cache first strategy (for static assets)
async function cacheFirstStrategy(request) {
  const cachedResponse = await caches.match(request);
  
  if (cachedResponse) {
    // Return cached response and update cache in background
    fetchAndCache(request);
    return cachedResponse;
  }
  
  try {
    const networkResponse = await fetch(request);
    
    // Cache successful responses
    if (networkResponse.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, networkResponse.clone());
    }
    
    return networkResponse;
  } catch (error) {
    // Return offline page for navigation requests
    if (request.mode === 'navigate') {
      return caches.match(OFFLINE_URL);
    }
    
    throw error;
  }
}

// Fetch and cache in background
async function fetchAndCache(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response);
    }
  } catch (error) {
    // Silently fail - we already have cached version
  }
}

// Handle background sync for offline form submissions
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-observations') {
    event.waitUntil(syncOfflineData('observations'));
  } else if (event.tag === 'sync-tasks') {
    event.waitUntil(syncOfflineData('tasks'));
  } else if (event.tag === 'sync-forms') {
    event.waitUntil(syncOfflineData('forms'));
  } else if (event.tag === 'sync-threats') {
    event.waitUntil(syncOfflineData('threats'));
  }
});

// Sync offline data when back online
async function syncOfflineData(type) {
  try {
    // Get pending items from IndexedDB
    const db = await openIndexedDB();
    const tx = db.transaction(`pending_${type}`, 'readwrite');
    const store = tx.objectStore(`pending_${type}`);
    const items = await store.getAll();
    
    for (const item of items) {
      try {
        const response = await fetch(item.url, {
          method: item.method,
          headers: item.headers,
          body: JSON.stringify(item.data),
        });
        
        if (response.ok) {
          // Remove from pending queue
          await store.delete(item.id);
          console.log('[SW] Synced offline item:', item.id);
        }
      } catch (error) {
        console.error('[SW] Failed to sync item:', item.id, error);
      }
    }
  } catch (error) {
    console.error('[SW] Sync failed:', error);
  }
}

// Open IndexedDB
function openIndexedDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('ReliabilityOS', 1);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      
      // Create object stores for offline data
      if (!db.objectStoreNames.contains('pending_observations')) {
        db.createObjectStore('pending_observations', { keyPath: 'id', autoIncrement: true });
      }
      if (!db.objectStoreNames.contains('pending_tasks')) {
        db.createObjectStore('pending_tasks', { keyPath: 'id', autoIncrement: true });
      }
      if (!db.objectStoreNames.contains('pending_forms')) {
        db.createObjectStore('pending_forms', { keyPath: 'id', autoIncrement: true });
      }
      if (!db.objectStoreNames.contains('pending_threats')) {
        db.createObjectStore('pending_threats', { keyPath: 'id', autoIncrement: true });
      }
      if (!db.objectStoreNames.contains('cached_data')) {
        db.createObjectStore('cached_data', { keyPath: 'key' });
      }
    };
  });
}

// Push notification handling
self.addEventListener('push', (event) => {
  if (!event.data) return;
  
  try {
    const data = event.data.json();
    
    const options = {
      body: data.body || 'New notification',
      icon: '/logo192.png',
      badge: '/logo192.png',
      vibrate: [100, 50, 100],
      data: {
        url: data.url || '/',
        ...data,
      },
      actions: data.actions || [],
    };
    
    event.waitUntil(
      self.registration.showNotification(data.title || 'ReliabilityOS', options)
    );
  } catch (error) {
    console.error('[SW] Push notification error:', error);
  }
});

// Notification click handling
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  
  const url = event.notification.data?.url || '/';
  
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Focus existing window if found
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      // Open new window
      if (clients.openWindow) {
        return clients.openWindow(url);
      }
    })
  );
});

console.log('[SW] Service Worker loaded');
