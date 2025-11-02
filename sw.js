// Service Worker for PWA functionality
const CACHE_NAME = 'oem-app-v41';

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
  '/OEM/js/admin.js',
  '/OEM/manifest.json',
  '/OEM/favicon.ico',
  '/OEM/favicon.svg',
  '/OEM/icon-192.svg',
  '/OEM/icon-512.svg',
  '/OEM/offline.html'
];

// オフライン用のフォールバックページ
const OFFLINE_URL = '/OEM/offline.html';

async function shouldDisplayPushNotification() {
  try {
    const windowClients = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of windowClients) {
      const visibilityState = client.visibilityState;
      const isFocused = typeof client.focused === 'boolean' ? client.focused : false;
      if (visibilityState === 'visible' && isFocused) {
        console.log('🔕 クライアントがフォアグラウンドのためプッシュ通知をスキップします');
        return false;
      }
    }
  } catch (error) {
    console.warn('プッシュ通知表示判定でエラー:', error);
  }
  return true;
}

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

// Push notification handling - アプリが閉じている時も確実に通知を表示
self.addEventListener('push', (event) => {
  console.log('🔔 Service Worker: プッシュ通知を受信', event);
  
  let notificationData = {};
  
  try {
    if (event.data) {
      notificationData = event.data.json();
      console.log('📦 通知データ:', notificationData);
    }
  } catch (e) {
    console.warn('⚠️ 通知データの解析に失敗:', e);
    notificationData = {
      title: 'MARUGO OEM Special Menu',
      message: event.data ? event.data.text() : '新しい通知があります'
    };
  }

  const title = notificationData.title || 'MARUGO OEM Special Menu';
  const message = notificationData.message || notificationData.body || '新しい通知があります';
  
  console.log('📢 通知を表示:', { title, message });

  const badgeCount = typeof notificationData.badgeCount === 'number' ? notificationData.badgeCount : undefined;

  const options = {
    body: message,
    icon: '/OEM/icon-192.svg',
    badge: '/OEM/icon-192.svg',
    vibrate: [200, 100, 200],
    tag: notificationData.tag || 'oem-notification',
    requireInteraction: true, // アプリが閉じている時は確実に表示
    silent: false, // 音を鳴らす
    data: {
      dateOfArrival: Date.now(),
      url: notificationData.url || '/OEM/',
      notification_id: notificationData.id,
      type: notificationData.type || 'general'
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

  // 確実に通知を表示（アプリが閉じていても）
  event.waitUntil((async () => {
    if (!(await shouldDisplayPushNotification())) {
      return;
    }

    try {
      await self.registration.showNotification(title, options);
      console.log('✅ プッシュ通知を表示しました');

      if (typeof badgeCount === 'number') {
        if (self.registration.setAppBadge && badgeCount > 0) {
          self.registration.setAppBadge(badgeCount).catch(err => {
            console.warn('Service Worker setAppBadge失敗:', err);
          });
        } else if (self.registration.clearAppBadge) {
          self.registration.clearAppBadge().catch(err => {
            console.warn('Service Worker clearAppBadge失敗:', err);
          });
        }
      }
    } catch (error) {
      console.error('❌ プッシュ通知の表示に失敗:', error);
    }
  })());
});

// Service Workerメッセージ受信 - アプリが閉じている時も通知を表示
self.addEventListener('message', (event) => {
  console.log('📨 Service Worker: メッセージを受信', event.data);
  
  if (event.data && event.data.type === 'SHOW_NOTIFICATION') {
    const notificationData = event.data.notificationData;
    console.log('🔔 通知を表示します:', notificationData);
    
    const badgeCount = typeof notificationData.badgeCount === 'number' ? notificationData.badgeCount : undefined;

    const options = {
      body: notificationData.message,
      icon: notificationData.icon,
      badge: notificationData.badge,
      tag: notificationData.tag,
      vibrate: [200, 100, 200],
      requireInteraction: true, // アプリが閉じている時は確実に表示
      silent: false, // 音を鳴らす
      data: {
        dateOfArrival: Date.now(),
        url: notificationData.url,
        notification_id: notificationData.notification_id,
        type: notificationData.type
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

    event.waitUntil((async () => {
      if (!(await shouldDisplayPushNotification())) {
        return;
      }

      try {
        await self.registration.showNotification(notificationData.title, options);
        console.log('✅ Service Worker: 通知を表示しました');

        if (typeof badgeCount === 'number') {
          if (self.registration.setAppBadge && badgeCount > 0) {
            self.registration.setAppBadge(badgeCount).catch(err => {
              console.warn('Service Worker setAppBadge失敗:', err);
            });
          } else if (self.registration.clearAppBadge) {
            self.registration.clearAppBadge().catch(err => {
              console.warn('Service Worker clearAppBadge失敗:', err);
            });
          }
        }
      } catch (error) {
        console.error('❌ Service Worker: 通知表示エラー:', error);
      }
    })());
  }
});

// Notification click handling
self.addEventListener('notificationclick', (event) => {
  console.log('🖱️ 通知がクリックされました:', event);
  event.notification.close();

  if (event.action === 'open' || !event.action) {
    const urlToOpen = event.notification.data?.url || BASE_PATH;
    console.log('🔗 アプリを開きます:', urlToOpen);
    
    event.waitUntil(
      clients.matchAll({ type: 'window', includeUncontrolled: true })
        .then((clientList) => {
          console.log('🪟 既存のクライアント:', clientList.length);
          // 既に開いているウィンドウがあればそれをフォーカス
          for (let i = 0; i < clientList.length; i++) {
            const client = clientList[i];
            if (client.url.includes('/OEM/') && 'focus' in client) {
              console.log('✅ 既存のウィンドウをフォーカスします');
              return client.focus();
            }
          }
          // なければ新しいウィンドウを開く
          if (clients.openWindow) {
            console.log('🆕 新しいウィンドウを開きます');
            return clients.openWindow(urlToOpen);
          }
        })
    );
  }
});
