// Service Worker for PWA functionality
const CACHE_NAME = 'oem-app-v11';
const urlsToCache = [
  '/',
  '/index.html',
  '/styles/main.css',
  '/js/modal-utils.js',
  '/js/app.js',
  '/js/auth.js',
  '/js/comments.js',
  '/js/config.js',
  '/js/meetings.js',
  '/js/mobile.js',
  '/js/notifications.js',
  '/js/roadmap-comments.js',
  '/js/sample-data.js',
  '/js/tasks.js',
  '/manifest.json',
  '/sw.js',
  '/favicon.ico',
  '/favicon.svg',
  '/icon-192.png',
  '/icon-512.png',
  '/offline.html'
];

// オフライン用のフォールバックページ
const OFFLINE_URL = '/offline.html';

// Install event
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        // 各URLを個別にキャッシュしてエラーを回避
        return Promise.allSettled(
          urlsToCache.map(url => 
            cache.add(url).catch(err => {
              console.warn(`Failed to cache ${url}:`, err);
              return null;
            })
          )
        );
      })
  );
});

// Fetch event
self.addEventListener('fetch', (event) => {
  // ネットワークリクエストのみを処理
  if (event.request.method !== 'GET') {
    return;
  }

  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        // キャッシュから返す
        if (response) {
          return response;
        }

        // ネットワークから取得を試行
        return fetch(event.request)
          .then((response) => {
            // レスポンスが有効でない場合はキャッシュしない
            if (!response || response.status !== 200 || response.type !== 'basic') {
              return response;
            }

            // レスポンスをクローンしてキャッシュに保存
            const responseToCache = response.clone();
            caches.open(CACHE_NAME)
              .then((cache) => {
                cache.put(event.request, responseToCache);
              });

            return response;
          })
          .catch(() => {
            // ネットワークエラーの場合、オフラインページを返す
            if (event.request.destination === 'document') {
              return caches.match(OFFLINE_URL);
            }
          });
      })
  );
});

// Push notification handling
self.addEventListener('push', (event) => {
  const options = {
    body: event.data ? event.data.text() : '新しい通知があります',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    vibrate: [100, 50, 100],
    data: {
      dateOfArrival: Date.now(),
      primaryKey: 1
    },
    actions: [
      {
        action: 'explore',
        title: 'アプリを開く',
        icon: '/icon-192.png'
      },
      {
        action: 'close',
        title: '閉じる',
        icon: '/icon-192.png'
      }
    ]
  };

  event.waitUntil(
    self.registration.showNotification('OEM商品企画管理', options)
  );
});

// Notification click handling
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'explore') {
    event.waitUntil(
      clients.openWindow('/')
    );
  }
});
