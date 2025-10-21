// Service Worker for PWA functionality
const CACHE_NAME = 'oem-app-v37';

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
  console.log('Service Worker: インストール中...', CACHE_NAME);
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Service Worker: キャッシュを開いています');
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
      .then(() => {
        console.log('Service Worker: インストール完了');
        return self.skipWaiting(); // 新しいSWを即座にアクティブ化
      })
  );
});

// Activate event - 古いキャッシュを削除
self.addEventListener('activate', (event) => {
  console.log('Service Worker: アクティベーション中...', CACHE_NAME);
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('Service Worker: 古いキャッシュを削除:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
    .then(() => {
      console.log('Service Worker: アクティベーション完了');
      return self.clients.claim(); // すべてのクライアントを即座に制御下に
    })
  );
});

// Fetch event
self.addEventListener('fetch', (event) => {
  // ネットワークリクエストのみを処理
  if (event.request.method !== 'GET') {
    return;
  }

  // 外部リソース（Supabase API等）はスキップ
  if (event.request.url.includes('supabase') || 
      event.request.url.includes('unpkg.com') ||
      event.request.url.includes('googleapis.com')) {
    return;
  }

  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        // キャッシュから返す
        if (response) {
          console.log('キャッシュから返却:', event.request.url);
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
                console.log('キャッシュに保存:', event.request.url);
              });

            return response;
          })
          .catch((error) => {
            console.log('ネットワークエラー:', event.request.url, error);
            // ネットワークエラーの場合、オフラインページを返す
            if (event.request.destination === 'document') {
              return caches.match(OFFLINE_URL);
            }
            // その他のリソースの場合は空のレスポンスを返す
            return new Response('', { status: 404, statusText: 'Not Found' });
          });
      })
  );
});

// Push notification handling
self.addEventListener('push', (event) => {
  let notificationData = {};
  
  try {
    if (event.data) {
      notificationData = event.data.json();
    }
  } catch (e) {
    notificationData = {
      title: 'MARUGO OEM Special Menu',
      message: event.data ? event.data.text() : '新しい通知があります'
    };
  }

  const title = notificationData.title || 'MARUGO OEM Special Menu';
  const options = {
    body: notificationData.message || notificationData.body || '新しい通知があります',
    icon: '/OEM/icon-192.svg',
    badge: '/OEM/icon-192.svg',
    vibrate: [200, 100, 200],
    tag: notificationData.tag || 'oem-notification',
    requireInteraction: false,
    data: {
      dateOfArrival: Date.now(),
      url: notificationData.url || '/OEM/',
      notification_id: notificationData.id
    },
    actions: [
      {
        action: 'open',
        title: 'アプリを開く'
      },
      {
        action: 'close',
        title: '閉じる'
      }
    ]
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

// Notification click handling
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'open' || !event.action) {
    const urlToOpen = event.notification.data?.url || BASE_PATH;
    
    event.waitUntil(
      clients.matchAll({ type: 'window', includeUncontrolled: true })
        .then((clientList) => {
          // 既に開いているウィンドウがあればそれをフォーカス
          for (let i = 0; i < clientList.length; i++) {
            const client = clientList[i];
            if (client.url.includes('/OEM/') && 'focus' in client) {
              return client.focus();
            }
          }
          // なければ新しいウィンドウを開く
          if (clients.openWindow) {
            return clients.openWindow(urlToOpen);
          }
        })
    );
  }
});
