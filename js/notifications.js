// 通知管理

let notificationCount = 0;

// Push通知の登録状態を管理
const pushRegistrationState = {
    isSubscribing: false,
    lastSubscriptionEndpoint: null
};

// VAPID公開鍵をUint8Arrayに変換
function urlBase64ToUint8Array(base64String) {
    if (!base64String) {
        throw new Error('VAPIDキーが設定されていません');
    }

    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding)
        .replace(/-/g, '+')
        .replace(/_/g, '/');

    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);

    for (let i = 0; i < rawData.length; i++) {
        outputArray[i] = rawData.charCodeAt(i);
    }

    return outputArray;
}

// SupabaseにPushサブスクリプションを保存
async function registerPushSubscription(subscription) {
    try {
        if (!subscription) {
            return null;
        }

        // 認証済みユーザーが必要
        let currentUser = appState.currentUser;
        if (!currentUser || !currentUser.id) {
            if (typeof refreshCurrentUser === 'function') {
                currentUser = await refreshCurrentUser();
            }
        }

        if (!currentUser || !currentUser.id) {
            console.warn('ユーザー情報が取得できないためプッシュサブスクリプションを保存できません');
            return null;
        }

        const subscriptionJson = subscription.toJSON();
        const payload = {
            user_id: currentUser.id,
            endpoint: subscriptionJson.endpoint,
            p256dh: subscriptionJson.keys?.p256dh || null,
            auth: subscriptionJson.keys?.auth || null,
            expiration_time: subscription.expirationTime ? new Date(subscription.expirationTime).toISOString() : null,
            user_agent: navigator.userAgent,
            platform: navigator.platform || null
        };

        const { data, error } = await supabase
            .from('push_subscriptions')
            .upsert(payload, { onConflict: 'endpoint' })
            .select();

        if (error) {
            console.error('プッシュサブスクリプション保存エラー:', error);
            return null;
        }

        const savedRecord = Array.isArray(data) ? data[0] : data;
        console.log('✅ プッシュサブスクリプションを保存しました:', savedRecord?.id || subscriptionJson.endpoint);
        pushRegistrationState.lastSubscriptionEndpoint = subscriptionJson.endpoint;
        
        // セッション単位でサブスクリプション情報を保持
        try {
            sessionStorage.setItem('pushSubscriptionEndpoint', subscriptionJson.endpoint);
        } catch (storageError) {
            console.warn('セッションストレージへの保存に失敗しました:', storageError);
        }

        return savedRecord;
    } catch (error) {
        console.error('プッシュサブスクリプション登録例外:', error);
        return null;
    }
}

async function sendServerPushNotification(notification) {
    try {
        if (!supabase?.functions || typeof supabase.functions.invoke !== 'function') {
            console.warn('Supabase Edge Functionが利用できないため、サーバープッシュをスキップします');
            return;
        }

        const unreadCount = appState.notifications.filter(n => !n.read).length;

        const payload = {
            title: notification.title || 'MARUGO OEM Special Menu',
            body: notification.message || notification.body || '新しい通知があります',
            icon: '/OEM/icon-192.svg',
            badge: '/OEM/icon-192.svg',
            url: notification.url || '/OEM/',
            vibration: [200, 100, 200],
            tag: notification.related_id || 'oem-notification',
            data: {
                notification_id: notification.id,
                type: notification.type || 'general',
                url: notification.url || '/OEM/'
            }
        };

        const skipUserId = appState.currentUser?.id || null;
        const { error } = await supabase.functions.invoke('send-push', {
            body: {
                notification: payload,
                skipUserId,
                badgeCount: unreadCount
            }
        });

        if (error) {
            console.warn('サーバープッシュ送信エラー（無視）:', error.message);
            // CORSエラーやVAPIDキー未設定は無視（ローカル通知で代替）
        } else {
            console.log('📡 サーバープッシュを要求しました');
        }
    } catch (error) {
        console.warn('サーバープッシュ送信例外（無視）:', error.message);
        // CORSエラーやVAPIDキー未設定は無視（ローカル通知で代替）
    }
}

// プッシュ通知の許可をリクエスト
async function requestNotificationPermission() {
    try {
        console.log('通知許可リクエスト開始');
        
        // 既に許可されている場合は何もしない
        if ('Notification' in window && Notification.permission === 'granted') {
            console.log('通知は既に許可されています');
            try {
                sessionStorage.setItem('notificationPermission', 'granted');
            } catch (storageError) {
                console.warn('通知許可状態を保存できませんでした:', storageError);
            }

            try {
                await subscribeToPushNotifications();
            } catch (subscriptionError) {
                console.error('プッシュサブスクリプション再作成エラー:', subscriptionError);
            }
            
            // テスト通知を表示（削除）
            // showBrowserNotification('通知が有効です', {
            //     body: 'プッシュ通知が正常に動作しています'
            // });
            
            return true;
        }

        // HTTPS接続の確認（表示を削除）
        if (!window.isSecureContext) {
            console.warn('⚠️ HTTPS接続が必要です');
            // alert('通知機能を使用するにはHTTPS接続が必要です。\n\n現在の接続: ' + window.location.protocol + '//' + window.location.host);
            return false;
        }

        // 通知がサポートされていない場合（表示を削除）
        if (!('Notification' in window)) {
            console.warn('⚠️ このブラウザは通知をサポートしていません');
            console.log('🔍 ブラウザ情報:', {
                userAgent: navigator.userAgent,
                platform: navigator.platform,
                language: navigator.language,
                cookieEnabled: navigator.cookieEnabled,
                isSecureContext: window.isSecureContext,
                protocol: window.location.protocol
            });
            
            // エラーメッセージの表示を削除
            // alert(errorMessage);
            return false;
        }

        // 許可をリクエスト
        console.log('Notification.requestPermission() を呼び出します');
        const permission = await Notification.requestPermission();
        console.log('通知許可の結果:', permission);

        if (permission === 'granted') {
            console.log('通知が許可されました！');
            
            // 許可状態を保存
            try {
                sessionStorage.setItem('notificationPermission', 'granted');
            } catch (storageError) {
                console.warn('通知許可状態を保存できませんでした:', storageError);
            }

            try {
                await subscribeToPushNotifications();
            } catch (subscriptionError) {
                console.error('プッシュサブスクリプション作成エラー:', subscriptionError);
            }
            
            // テスト通知を表示（削除）
            // showBrowserNotification('プッシュ通知が有効になりました！', {
            //     body: '今後、コメントや会議の通知が届きます'
            // });
            
            // 成功メッセージ（削除）
            // if (typeof showNotification === 'function') {
            //     showNotification('プッシュ通知が有効になりました！', 'success');
            // }
            
            return true;
        } else if (permission === 'denied') {
            console.log('通知が拒否されました');
            try {
                sessionStorage.setItem('notificationPermission', 'denied');
            } catch (storageError) {
                console.warn('通知拒否状態を保存できませんでした:', storageError);
            }
            // alert('通知が拒否されました。ブラウザの設定から通知を許可してください。');
            return false;
        } else {
            console.log('通知許可が保留されました');
            return false;
        }
    } catch (error) {
        console.error('通知許可リクエストエラー:', error);
        console.error('エラー詳細:', error.stack);
        // alert('通知の設定中にエラーが発生しました: ' + error.message);
        return false;
    }
}

// プッシュ通知のサブスクリプション
async function subscribeToPushNotifications() {
    if (pushRegistrationState.isSubscribing) {
        console.log('プッシュサブスクリプションの作成中です');
        return null;
    }

    try {
        console.log('🔔 プッシュ通知のサブスクリプションを開始します...');

        if (!VAPID_PUBLIC_KEY) {
            console.warn('⚠️ VAPID公開鍵が設定されていないため、プッシュ通知を登録できません');
            return null;
        }

        if (!('serviceWorker' in navigator)) {
            console.warn('⚠️ Service Workerがサポートされていません');
            return null;
        }

        if (!('PushManager' in window)) {
            console.warn('⚠️ Push Managerがサポートされていません');
            return null;
        }

        pushRegistrationState.isSubscribing = true;

        const registration = await navigator.serviceWorker.ready;
        console.log('✅ Service Worker登録確認:', registration);

        let subscription = await registration.pushManager.getSubscription();
        console.log('📋 既存のサブスクリプション:', subscription);

        if (!subscription) {
            console.log('🆕 新しいプッシュ通知サブスクリプションを作成します...');
            const applicationServerKey = urlBase64ToUint8Array(VAPID_PUBLIC_KEY);
            subscription = await registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey
            });
            console.log('✅ プッシュ通知にサブスクライブしました:', subscription);
        } else {
            console.log('✅ 既存のプッシュ通知サブスクリプションを使用します');
        }

        await registerPushSubscription(subscription);

        try {
            sessionStorage.setItem('pushNotificationsEnabled', 'true');
        } catch (storageError) {
            console.warn('プッシュ通知状態を保存できませんでした:', storageError);
        }

        console.log('💾 プッシュ通知設定を保存しました');
        // if (typeof showNotification === 'function') {
        //     showNotification('🔔 プッシュ通知が有効になりました（ホーム画面に追加済みのPWAでも通知されます）', 'success');
        // }

        checkAndShowNotificationButtons();
        return subscription;
    } catch (error) {
        console.error('❌ プッシュ通知サブスクリプションエラー:', error);
        console.error('エラー詳細:', error.stack);
        if (typeof showNotification === 'function') {
            showNotification('プッシュ通知の設定に失敗しました', 'error');
        }
        return null;
    } finally {
        pushRegistrationState.isSubscribing = false;
    }
}

// ブラウザ通知を表示（テスト用）
function showBrowserNotification(title, options = {}) {
    console.log('showBrowserNotification 呼び出し:', {
        title: title,
        options: options,
        notificationSupported: 'Notification' in window,
        permission: 'Notification' in window ? Notification.permission : 'unsupported'
    });

    if ('Notification' in window && Notification.permission === 'granted') {
        try {
            const defaultOptions = {
                body: options.body || '新しい通知があります',
                icon: '/OEM/icon-192.svg',
                badge: '/OEM/icon-192.svg',
                tag: options.tag || 'oem-notification',
                requireInteraction: false,
                ...options
            };
            
            console.log('Notification オブジェクトを作成します:', defaultOptions);
            const notification = new Notification(title, defaultOptions);
            
            notification.onclick = function(event) {
                console.log('通知がクリックされました');
                event.preventDefault();
                window.focus();
                notification.close();
            };
            
            notification.onerror = function(error) {
                console.error('通知表示エラー:', error);
            };
            
            notification.onshow = function() {
                console.log('通知が表示されました');
            };
            
            console.log('通知オブジェクトを作成しました:', notification);
            return notification;
        } catch (error) {
            console.error('Notification 作成エラー:', error);
            return null;
        }
    } else {
        console.warn('通知が許可されていないか、サポートされていません');
        return null;
    }
}

// 通知許可状態を確認
function checkNotificationPermission() {
    if (!('Notification' in window)) {
        return 'unsupported';
    }
    return Notification.permission;
}

// 通知一覧の読み込み
async function loadNotifications() {
    try {
        // ユーザー情報の確認
        if (!appState.currentUser || !appState.currentUser.id) {
            console.warn('ユーザー情報が取得できないため、通知を読み込めません');
            appState.notifications = [];
            renderNotifications();
            return;
        }

        // 通知とユーザー別の既読状態を結合して取得
        const { data, error } = await supabase
            .from('notifications')
            .select(`
                *,
                notification_read_status!left(
                    id,
                    read_at,
                    user_id
                )
            `)
            .order('created_at', { ascending: false })
            .limit(50);

        if (error) throw error;

        // 通知データを処理してユーザー別の既読状態を設定
        appState.notifications = (data || []).map(notification => {
            // 現在のユーザーの既読状態を確認
            const userReadStatus = notification.notification_read_status?.find(
                status => status.user_id === appState.currentUser.id
            );
            
            return {
                ...notification,
                read: !!userReadStatus, // ユーザー別の既読状態
                read_at: userReadStatus?.read_at || null
            };
        });

        console.log('読み込まれた通知（ユーザー別既読状態）:', appState.notifications);
        console.log('通知IDの例:', appState.notifications.length > 0 ? appState.notifications[0].id : 'なし');
        console.log('通知の種類別カウント:', {
            total: appState.notifications.length,
            read: appState.notifications.filter(n => n.read).length,
            unread: appState.notifications.filter(n => !n.read).length,
            new_comment: appState.notifications.filter(n => n.type === 'new_comment').length,
            new_discussion_comment: appState.notifications.filter(n => n.type === 'new_discussion_comment').length,
            meeting_scheduled: appState.notifications.filter(n => n.type === 'meeting_scheduled').length
        });
        renderNotifications();
        updateNotificationBadge();
        
    } catch (error) {
        console.error('通知読み込みエラー:', error);
    }
}

// 通知を既読にする（ユーザー別）
async function markNotificationAsRead(notificationId) {
    try {
        console.log('既読にする通知ID:', notificationId);
        console.log('現在のユーザー:', appState.currentUser);
        
        // 通知IDの検証
        if (!notificationId) {
            throw new Error('通知IDが指定されていません');
        }
        
        // ユーザー情報の確認
        if (!appState.currentUser || !appState.currentUser.id) {
            throw new Error('ユーザー情報が取得できません');
        }
        
        // 現在の通知データを確認
        const notification = appState.notifications.find(n => n.id === notificationId);
        console.log('対象通知:', notification);
        
        if (!notification) {
            throw new Error('指定された通知が見つかりません');
        }
        
        // ユーザー別の既読状態を作成/更新
        console.log('ユーザー別既読状態を更新中...');
        const { data, error } = await supabase
            .from('notification_read_status')
            .upsert({
                notification_id: notificationId,
                user_id: appState.currentUser.id,
                read_at: new Date().toISOString()
            })
            .select();

        if (error) {
            console.error('既読状態更新エラー:', error);
            throw error;
        }
        
        console.log('既読状態更新成功:', data);

        // ローカル状態を更新
        const notificationIndex = appState.notifications.findIndex(n => n.id === notificationId);
        if (notificationIndex !== -1) {
            appState.notifications[notificationIndex].read = true;
            console.log('ローカル状態更新成功');
        } else {
            console.warn('ローカル状態で通知が見つかりません');
        }

        // 表示を更新
        renderNotifications();
        updateNotificationBadge();

        console.log('通知を既読にしました:', notificationId);
        showNotification('通知を既読にしました', 'success');
        
    } catch (error) {
        console.error('通知既読エラー:', error);
        console.error('エラースタック:', error.stack);
        showNotification(`通知の既読に失敗しました: ${error.message}`, 'error');
    }
}

// すべての通知を既読にする（ユーザー別）
async function markAllNotificationsAsRead() {
    try {
        // ユーザー情報の確認
        if (!appState.currentUser || !appState.currentUser.id) {
            throw new Error('ユーザー情報が取得できません');
        }

        // 未読の通知のみを取得
        const unreadNotifications = appState.notifications.filter(n => !n.read);
        console.log('未読通知数:', unreadNotifications.length);
        console.log('未読通知ID一覧:', unreadNotifications.map(n => n.id));
        
        if (unreadNotifications.length === 0) {
            showNotification('既読にする通知がありません', 'info');
            return;
        }

        // ユーザー別の既読状態を一括作成
        console.log('ユーザー別既読状態を一括作成中...');
        const readStatusData = unreadNotifications.map(notification => ({
            notification_id: notification.id,
            user_id: appState.currentUser.id,
            read_at: new Date().toISOString()
        }));

        const { data, error } = await supabase
            .from('notification_read_status')
            .upsert(readStatusData)
            .select();

        if (error) {
            console.error('一括更新エラー:', error);
            console.error('エラー詳細:', {
                message: error.message,
                details: error.details,
                hint: error.hint,
                code: error.code
            });
            throw error;
        }
        
        console.log('一括更新成功:', data);

        // ローカル状態を更新
        appState.notifications.forEach(notification => {
            notification.read = true;
        });

        // 表示を更新
        renderNotifications();
        updateNotificationBadge();

        console.log('すべての通知を既読にしました');
        showNotification('すべての通知を既読にしました', 'success');
        
    } catch (error) {
        console.error('通知一括既読エラー:', error);
        console.error('エラースタック:', error.stack);
        showNotification(`通知の既読に失敗しました: ${error.message}`, 'error');
    }
}

// 通知パネルのイベントリスナーを設定
function setupNotificationEventListeners() {
    // すべて既読ボタン
    const markAllReadBtn = document.getElementById('mark-all-read-btn');
    if (markAllReadBtn) {
        markAllReadBtn.addEventListener('click', () => {
            markAllNotificationsAsRead();
        });
    }
}

// 通知の表示
function renderNotifications() {
    const container = document.getElementById('notification-list');
    
    console.log('🔔 通知を表示します:', {
        container: container,
        notificationsCount: appState.notifications.length,
        notifications: appState.notifications.map(n => ({
            id: n.id,
            type: n.type,
            message: n.message,
            read: n.read
        }))
    });
    
    if (appState.notifications.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: var(--text-secondary); padding: 2rem;">通知はありません</p>';
        return;
    }

    container.innerHTML = appState.notifications.map(notification => {
        const timeAgo = getTimeAgo(new Date(notification.created_at));
        const isNew = !notification.read;
        
        return `
            <div class="notification-item ${isNew ? 'new' : ''}" data-notification-id="${notification.id}">
                <div class="notification-content">
                    <div class="notification-message">${getNotificationIcon(notification.type)} ${escapeHtml(notification.message)}</div>
                    <div class="time">${timeAgo}</div>
                </div>
                ${isNew ? '<div class="unread-indicator"></div>' : ''}
            </div>
        `;
    }).join('');
    
    // 各通知アイテムにクリックイベントを追加
    container.querySelectorAll('.notification-item').forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const notificationId = item.getAttribute('data-notification-id');
            console.log('クリックされた通知ID:', notificationId);
            if (notificationId) {
                markNotificationAsRead(notificationId);
            }
        });
    });
}

// 通知アイコン
function getNotificationIcon(type) {
    const icons = {
        task_created: '✨',
        task_updated: '🔄',
        task_deleted: '🗑️',
        brainstorm_idea_created: '🧠',
        new_comment: '💬',
        new_discussion_comment: '💭',
        meeting_scheduled: '📅',
        general: '📢'
    };
    return icons[type] || icons.general;
}

// 通知バッジ更新
function updateNotificationBadge() {
    const unreadCount = appState.notifications.filter(n => !n.read).length;
    const badge = document.getElementById('notification-badge');

    if (unreadCount > 0) {
        badge.textContent = unreadCount > 99 ? '99+' : unreadCount;
        badge.classList.remove('hidden');
    } else {
        badge.classList.add('hidden');
    }

    updateAppIconBadge(unreadCount);
}

// PWAアイコンのバッジ更新
function updateAppIconBadge(unreadCount) {
    try {
        if (navigator.setAppBadge) {
            if (unreadCount > 0) {
                navigator.setAppBadge(unreadCount).catch(err => {
                    console.warn('setAppBadge失敗:', err);
                });
            } else if (navigator.clearAppBadge) {
                navigator.clearAppBadge().catch(err => {
                    console.warn('clearAppBadge失敗:', err);
                });
            }
        } else if (navigator.experimentalSetAppBadge) {
            if (unreadCount > 0) {
                navigator.experimentalSetAppBadge(unreadCount);
            } else if (navigator.experimentalClearAppBadge) {
                navigator.experimentalClearAppBadge();
            }
        }
    } catch (error) {
        console.warn('アプリアイコンバッジ更新エラー:', error);
    }
}

// 通知作成
async function createNotification(notificationData) {
    try {
        console.log('📝 通知を作成します:', notificationData);
        console.log('📝 createNotification関数が呼び出されました');
        console.log('📝 通知データの詳細:', {
            type: notificationData.type,
            message: notificationData.message,
            related_id: notificationData.related_id
        });
        
        const notification = {
            ...notificationData,
            created_by: appState.currentUser?.id || null
        };

        console.log('Supabaseに通知を保存します:', notification);
        console.log('通知データの詳細:', {
            type: notification.type,
            message: notification.message,
            created_by: notification.created_by,
            related_id: notification.related_id
        });
        
        const { data, error } = await supabase
            .from('notifications')
            .insert([notification])
            .select();

        if (error) {
            console.error('❌ 通知作成エラー:', error);
            console.error('エラー詳細:', {
                message: error.message,
                details: error.details,
                hint: error.hint,
                code: error.code
            });
            // 通知作成エラーはコメント投稿を阻害しない
        } else {
            const insertedNotification = Array.isArray(data) ? data[0] : data;
            console.log('✅ 通知をデータベースに保存しました:', insertedNotification);
            console.log('✅ 保存された通知の詳細:', {
                id: insertedNotification?.id,
                type: insertedNotification?.type,
                message: insertedNotification?.message,
                created_by: insertedNotification?.created_by
            });

            if (insertedNotification) {
                console.log('📡 サーバープッシュ通知を送信します...');
                await sendServerPushNotification(insertedNotification);
            }

            console.log('✅ createNotification関数が正常に完了しました');
            return insertedNotification;
        }
        
    } catch (error) {
        console.error('❌ 通知作成例外:', error);
        console.error('スタック:', error.stack);
        // 通知作成エラーはコメント投稿を阻害しない
    }

    return null;
}

// プッシュ通知を送信 - アプリが閉じている時も確実に通知
async function sendPushNotification(notificationData) {
    try {
        console.log('🔔 プッシュ通知送信チェック:', {
            permission: checkNotificationPermission(),
            hidden: document.hidden,
            hasFocus: document.hasFocus(),
            notificationData: notificationData
        });

        const unreadCount = appState.notifications.filter(n => !n.read).length;
        updateAppIconBadge(unreadCount);

        // 通知許可が得られているか確認
        const permission = checkNotificationPermission();
        if (permission !== 'granted') {
            console.log('⚠️ 通知許可がないため、プッシュ通知をスキップします。現在の許可状態:', permission);
            // 許可が拒否されていても、ローカル通知は表示する
            console.log('📱 ローカル通知を表示します');
            showBrowserNotification('MARUGO OEM Special Menu', {
                body: notificationData.message || '新しい通知があります',
                icon: '/OEM/icon-192.svg',
                badge: '/OEM/icon-192.svg',
                tag: 'marugo-notification',
                requireInteraction: true,
                silent: false
            });
            return;
        }

        // Service Workerにプッシュ通知を送信（アプリが閉じていても動作）
        console.log('📡 Service Workerにプッシュ通知を送信します...');
        
        // Service Workerが登録されているか確認
        if ('serviceWorker' in navigator && 'PushManager' in window) {
            try {
                const registration = await navigator.serviceWorker.ready;
                console.log('✅ Service Worker準備完了:', registration);
                
                // Service Workerにメッセージを送信してプッシュ通知を表示
                if (registration.active) {
                    registration.active.postMessage({
                        type: 'SHOW_NOTIFICATION',
                        notificationData: {
                            title: 'MARUGO OEM Special Menu',
                            message: notificationData.message || '新しい通知があります',
                            icon: '/OEM/icon-192.svg',
                            badge: '/OEM/icon-192.svg',
                            tag: notificationData.related_id || 'oem-notification',
                            url: '/OEM/',
                            notification_id: notificationData.id,
                            type: notificationData.type || 'general',
                            badgeCount: unreadCount
                        }
                    });
                    console.log('✅ Service Workerに通知メッセージを送信しました');
                } else {
                    console.warn('⚠️ Service Workerがアクティブではありません');
                    // フォールバック: 直接ブラウザ通知を表示
                    showBrowserNotification('MARUGO OEM Special Menu', {
                        body: notificationData.message || '新しい通知があります',
                        icon: '/OEM/icon-192.svg',
                        badge: '/OEM/icon-192.svg',
                        tag: notificationData.related_id || 'oem-notification',
                        vibrate: [200, 100, 200],
                        requireInteraction: true, // アプリが閉じている時は確実に表示
                        data: {
                            url: '/OEM/',
                            notification_id: notificationData.id
                        }
                    });
                }
            } catch (swError) {
                console.error('❌ Service Worker通知送信エラー:', swError);
                // フォールバック: 直接ブラウザ通知を表示
                showBrowserNotification('MARUGO OEM Special Menu', {
                    body: notificationData.message || '新しい通知があります',
                    icon: '/OEM/icon-192.svg',
                    badge: '/OEM/icon-192.svg',
                    tag: notificationData.related_id || 'oem-notification',
                    vibrate: [200, 100, 200],
                    requireInteraction: true,
                    data: {
                        url: '/OEM/',
                        notification_id: notificationData.id
                    }
                });
            }
        } else {
            console.warn('⚠️ Service WorkerまたはPushManagerがサポートされていません');
            // フォールバック: 直接ブラウザ通知を表示
            showBrowserNotification('MARUGO OEM Special Menu', {
                body: notificationData.message || '新しい通知があります',
                icon: '/OEM/icon-192.svg',
                badge: '/OEM/icon-192.svg',
                tag: notificationData.related_id || 'oem-notification',
                vibrate: [200, 100, 200],
                requireInteraction: true,
                data: {
                    url: '/OEM/',
                    notification_id: notificationData.id
                }
            });
        }
        
        console.log('✅ プッシュ通知を送信しました');
        
    } catch (error) {
        console.error('❌ プッシュ通知送信エラー:', error);
        console.error('エラー詳細:', error.stack);
        // プッシュ通知エラーは無視
    }
}

// 通知を既読にする
async function markNotificationsAsRead() {
    try {
        const unreadIds = appState.notifications
            .filter(n => !n.read)
            .map(n => n.id);

        if (unreadIds.length === 0) return;

        const { error } = await supabase
            .from('notifications')
            .update({ read: true })
            .in('id', unreadIds);

        if (error) throw error;
        
    } catch (error) {
        console.error('既読更新エラー:', error);
    }
}

// 通知パネルの開閉
function toggleNotificationPanel() {
    const panel = document.getElementById('notification-panel');
    panel.classList.toggle('open');
    
    if (panel.classList.contains('open')) {
        markNotificationsAsRead();
    }
}

// イベントリスナー（DOMContentLoaded後に登録、重複防止）
document.addEventListener('DOMContentLoaded', () => {
    const notificationBell = document.getElementById('notification-bell');
    const closeNotifications = document.getElementById('close-notifications');
    const enablePushBtn = document.getElementById('enable-push-notifications-btn');
    const markAllReadBtn = document.getElementById('mark-all-read-btn');
    
    if (notificationBell && !notificationBell.dataset.listenerAttached) {
        notificationBell.addEventListener('click', toggleNotificationPanel);
        notificationBell.dataset.listenerAttached = 'true';
    }
    
    if (closeNotifications && !closeNotifications.dataset.listenerAttached) {
        closeNotifications.addEventListener('click', () => {
            const panel = document.getElementById('notification-panel');
            if (panel) {
                panel.classList.remove('open');
            }
        });
        closeNotifications.dataset.listenerAttached = 'true';
    }
    
    if (enablePushBtn && !enablePushBtn.dataset.listenerAttached) {
        enablePushBtn.addEventListener('click', async () => {
            const granted = await requestNotificationPermission();
            if (granted) {
                hideNotificationPermissionButton();
            }
        });
        enablePushBtn.dataset.listenerAttached = 'true';
    }
    
    if (markAllReadBtn && !markAllReadBtn.dataset.listenerAttached) {
        markAllReadBtn.addEventListener('click', markAllNotificationsAsRead);
        markAllReadBtn.dataset.listenerAttached = 'true';
    }
    
    // ページ読み込み時に通知許可状態をチェック
    checkAndShowNotificationButtons();
});

// リアルタイム更新のサブスクリプション
function subscribeToNotifications() {
    console.log('🔔 通知のリアルタイムサブスクリプションを開始します');
    console.log('📡 Supabase接続情報:', {
        url: SUPABASE_URL,
        hasSupabase: typeof supabase !== 'undefined',
        hasChannel: typeof supabase?.channel === 'function'
    });
    
    try {
        const channel = supabase
            .channel('notifications-changes')
            .on('postgres_changes',
                { event: 'INSERT', schema: 'public', table: 'notifications' },
                (payload) => {
                    console.log('🔔 新しい通知を受信:', payload);
                    console.log('通知データ:', payload.new);
                    console.log('通知タイプ:', payload.new?.type);
                    console.log('通知メッセージ:', payload.new?.message);
                    
                    // 新しい通知をリストに追加
                    appState.notifications.unshift(payload.new);
                    console.log('通知リストに追加後の総数:', appState.notifications.length);
                    
                    renderNotifications();
                    updateNotificationBadge();
                    
                    // プッシュ通知を送信
                    console.log('プッシュ通知を送信します...');
                    sendPushNotification(payload.new);
                }
            )
            .subscribe((status) => {
                console.log('📊 通知サブスクリプション状態:', status);
                if (status === 'SUBSCRIBED') {
                    console.log('✅ 通知のリアルタイム更新が有効になりました');
                } else if (status === 'CHANNEL_ERROR') {
                    console.error('❌ 通知サブスクリプションエラー');
                } else if (status === 'TIMED_OUT') {
                    console.error('⏰ 通知サブスクリプションタイムアウト');
                } else if (status === 'CLOSED') {
                    console.warn('🔒 通知サブスクリプションが閉じられました');
                }
            });

        appState.subscriptions.push(channel);
        console.log('📝 通知サブスクリプションを登録しました');
        
    } catch (error) {
        console.error('❌ 通知サブスクリプション作成エラー:', error);
        console.error('エラー詳細:', error.stack);
    }
}

// 通知許可ボタンを表示
function showNotificationPermissionButton() {
    const button = document.getElementById('enable-push-notifications-btn');
    if (button && 'Notification' in window && Notification.permission === 'default') {
        button.style.display = 'inline-block';
    }
}

// 通知許可ボタンを非表示
function hideNotificationPermissionButton() {
    const button = document.getElementById('enable-push-notifications-btn');
    if (button) {
        button.style.display = 'none';
    }
}

// 通知ボタンの表示状態をチェック
function checkAndShowNotificationButtons() {
    console.log('🔍 通知ボタン表示チェック開始');
    console.log('ブラウザ情報:', {
        userAgent: navigator.userAgent,
        notificationSupported: 'Notification' in window,
        serviceWorkerSupported: 'serviceWorker' in navigator,
        pushManagerSupported: 'PushManager' in window,
        isSecureContext: window.isSecureContext,
        protocol: window.location.protocol
    });
    
    if ('Notification' in window) {
        const permission = Notification.permission;
        console.log('現在の通知許可状態:', permission);
        
        if (permission === 'default') {
            console.log('📝 通知許可ボタンを表示します');
            showNotificationPermissionButton();
        } else if (permission === 'granted') {
            console.log('✅ 通知は許可済みのためボタンを整理します');
            hideNotificationPermissionButton();
        } else if (permission === 'denied') {
            console.log('❌ 通知が拒否されているため、ボタンを非表示にします');
            hideNotificationPermissionButton();
        }
    } else {
        console.warn('⚠️ 通知がサポートされていません');
        // 通知がサポートされていない場合の対応
        hideNotificationPermissionButton();
        
        // ユーザーに詳細情報を表示
        const enableBtn = document.getElementById('enable-push-notifications-btn');
        if (enableBtn) {
            enableBtn.style.display = 'none';
        }
        
        console.log('🔧 通知非対応ブラウザのため、通知ボタンを非表示にしました');
    }
}
