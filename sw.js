// Service Worker for PWA functionality
const CACHE_NAME = 'oem-app-v30';

// ベースパスを自動検出（GitHub Pages対応）
const BASE_PATH = self.registration.scope;

const urlsToCache = [
  '/OEM/',
  '/OEM/index.html',
  '/OEM/styles/main.css',
  '/OEM/js/modal-utils.js',
  '/OEM/js/app.js',
  '/OEM/js/auth.js',
  '/OEM/js/comments.js',
  '/OEM/js/config.js',
  '/OEM/js/meetings.js',
  '/OEM/js/mobile.js',
  '/OEM/js/notifications.js',
  '/OEM/js/roadmap-comments.js',
  '/OEM/js/sample-data.js',
  '/OEM/js/tasks.js',
  '/OEM/manifest.json',
  '/OEM/favicon.ico',
  '/OEM/favicon.svg',
  '/OEM/icon-192.svg',
  '/OEM/icon-512.svg',
  '/OEM/offline.html'
];

// オフライン用のフォールバックページ
const OFFLINE_URL = '/OEM/offline.html';

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
    icon: '/OEM/icon-192.svg',
    badge: '/OEM/icon-192.svg',
    vibrate: [100, 50, 100],
    data: {
      dateOfArrival: Date.now(),
      primaryKey: 1
    },
    actions: [
      {
        action: 'explore',
        title: 'アプリを開く',
        icon: '/OEM/icon-192.svg'
      },
      {
        action: 'close',
        title: '閉じる',
        icon: '/OEM/icon-192.svg'
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
      clients.openWindow(BASE_PATH)
    );
  }
});
