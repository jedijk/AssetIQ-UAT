/* Minimal service worker for Web Push only (no asset caching). */

self.addEventListener('push', (event) => {
  if (!event.data) return;

  try {
    const data = event.data.json();
    const options = {
      body: data.body || 'New notification',
      icon: data.icon || '/logo192.png',
      badge: '/logo192.png',
      vibrate: data.silent ? undefined : [100, 50, 100],
      silent: !!data.silent,
      tag: data.tag || `assetiq-${Date.now()}`,
      renotify: !!data.renotify,
      requireInteraction: !!data.requireInteraction,
      data: {
        url: data.url || '/',
        type: data.type || 'general',
        ...data,
      },
      actions: data.actions || [],
    };

    event.waitUntil(
      self.registration.showNotification(data.title || 'AssetIQ', options)
    );
  } catch (error) {
    console.error('[Push SW] Failed to show notification:', error);
  }
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const url = event.notification.data?.url || '/';
  const targetUrl = new URL(url, self.location.origin).href;

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.startsWith(self.location.origin) && 'focus' in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
      return undefined;
    })
  );
});

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim());
});
