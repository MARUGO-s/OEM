// 通知管理

let notificationCount = 0;

// プッシュ通知の許可をリクエスト
async function requestNotificationPermission() {
    try {
        // 既に許可されている場合は何もしない
        if ('Notification' in window && Notification.permission === 'granted') {
            console.log('通知は既に許可されています');
            await subscribeToPushNotifications();
            return true;
        }

        // 通知がサポートされていない場合
        if (!('Notification' in window)) {
            console.warn('このブラウザは通知をサポートしていません');
            return false;
        }

        // 許可をリクエスト
        const permission = await Notification.requestPermission();
        console.log('通知許可の結果:', permission);

        if (permission === 'granted') {
            showNotification('プッシュ通知が有効になりました！', 'success');
            await subscribeToPushNotifications();
            // 許可状態を保存
            localStorage.setItem('notificationPermission', 'granted');
            return true;
        } else {
            console.log('通知が拒否されました');
            localStorage.setItem('notificationPermission', 'denied');
            return false;
        }
    } catch (error) {
        console.error('通知許可リクエストエラー:', error);
        return false;
    }
}

// プッシュ通知のサブスクリプション
async function subscribeToPushNotifications() {
    try {
        const registration = await navigator.serviceWorker.ready;
        
        // 既存のサブスクリプションを確認
        let subscription = await registration.pushManager.getSubscription();
        
        if (!subscription) {
            // 新しいサブスクリプションを作成
            subscription = await registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: null // VAPIDキーは実際の実装では必要
            });
            console.log('プッシュ通知にサブスクライブしました:', subscription);
        }

        // サブスクリプション情報を保存（実際の実装ではサーバーに送信）
        localStorage.setItem('pushSubscription', JSON.stringify(subscription));
        
        return subscription;
    } catch (error) {
        console.error('プッシュ通知サブスクリプションエラー:', error);
        return null;
    }
}

// ブラウザ通知を表示（テスト用）
function showBrowserNotification(title, options = {}) {
    if ('Notification' in window && Notification.permission === 'granted') {
        const defaultOptions = {
            body: options.body || '新しい通知があります',
            icon: '/OEM/icon-192.svg',
            badge: '/OEM/icon-192.svg',
            tag: options.tag || 'oem-notification',
            requireInteraction: false,
            ...options
        };
        
        const notification = new Notification(title, defaultOptions);
        
        notification.onclick = function(event) {
            event.preventDefault();
            window.focus();
            notification.close();
        };
        
        return notification;
    }
    return null;
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
        const { data, error } = await supabase
            .from('notifications')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(50);

        if (error) throw error;

        appState.notifications = data || [];
        console.log('読み込まれた通知:', appState.notifications);
        console.log('通知IDの例:', appState.notifications.length > 0 ? appState.notifications[0].id : 'なし');
        renderNotifications();
        updateNotificationBadge();
        
    } catch (error) {
        console.error('通知読み込みエラー:', error);
    }
}

// 通知を既読にする
async function markNotificationAsRead(notificationId) {
    try {
        console.log('既読にする通知ID:', notificationId);
        console.log('通知IDの型:', typeof notificationId);
        console.log('通知IDの長さ:', notificationId ? notificationId.length : 'null');
        
        // 通知IDの検証
        if (!notificationId) {
            throw new Error('通知IDが指定されていません');
        }
        
        // 現在の通知データを確認
        const notification = appState.notifications.find(n => n.id === notificationId);
        console.log('対象通知:', notification);
        
        if (!notification) {
            throw new Error('指定された通知が見つかりません');
        }
        
        // 通知IDの形式を確認（UUID形式の場合はそのまま使用）
        console.log('通知ID形式確認:', {
            id: notificationId,
            isUUID: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(notificationId),
            hasPrefix: notificationId.startsWith('notification_')
        });
        
        // Supabaseで通知を既読に更新
        console.log('Supabase更新開始...');
        const { data, error } = await supabase
            .from('notifications')
            .update({ read: true })
            .eq('id', notificationId)
            .select();

        if (error) {
            console.error('Supabase更新エラー:', error);
            console.error('エラー詳細:', {
                message: error.message,
                details: error.details,
                hint: error.hint,
                code: error.code
            });
            throw error;
        }
        
        console.log('Supabase更新成功:', data);

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

// すべての通知を既読にする
async function markAllNotificationsAsRead() {
    try {
        // 未読の通知のみを取得
        const unreadNotifications = appState.notifications.filter(n => !n.read);
        console.log('未読通知数:', unreadNotifications.length);
        console.log('未読通知ID一覧:', unreadNotifications.map(n => n.id));
        
        if (unreadNotifications.length === 0) {
            showNotification('既読にする通知がありません', 'info');
            return;
        }

        // Supabaseで一括更新
        console.log('一括更新開始...');
        const { data, error } = await supabase
            .from('notifications')
            .update({ read: true })
            .in('id', unreadNotifications.map(n => n.id))
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
}

// 通知作成
async function createNotification(notificationData) {
    try {
        const notification = {
            ...notificationData,
            created_by: appState.currentUser?.id || null
        };

        const { error } = await supabase
            .from('notifications')
            .insert([notification]);

        if (error) {
            console.error('通知作成エラー:', error);
            // 通知作成エラーはコメント投稿を阻害しない
        } else {
            // データベースに保存成功したら、プッシュ通知も送信
            await sendPushNotification(notification);
        }
        
    } catch (error) {
        console.error('通知作成エラー:', error);
        // 通知作成エラーはコメント投稿を阻害しない
    }
}

// プッシュ通知を送信
async function sendPushNotification(notificationData) {
    try {
        // 通知許可が得られているか確認
        if (checkNotificationPermission() !== 'granted') {
            console.log('通知許可がないため、プッシュ通知をスキップします');
            return;
        }

        // アプリがバックグラウンドまたは非アクティブの場合のみプッシュ通知を表示
        if (document.hidden || !document.hasFocus()) {
            // ブラウザ通知を表示
            const title = 'MARUGO OEM Special Menu';
            const options = {
                body: notificationData.message,
                icon: '/OEM/icon-192.svg',
                badge: '/OEM/icon-192.svg',
                tag: notificationData.related_id || 'general',
                vibrate: [200, 100, 200],
                data: {
                    url: '/OEM/',
                    notification_id: notificationData.id
                }
            };
            
            showBrowserNotification(title, options);
        } else {
            console.log('アプリがアクティブなため、プッシュ通知をスキップします');
        }
        
    } catch (error) {
        console.error('プッシュ通知送信エラー:', error);
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
    showNotificationPermissionButton();
});

// リアルタイム更新のサブスクリプション
function subscribeToNotifications() {
    const channel = supabase
        .channel('notifications-changes')
        .on('postgres_changes',
            { event: 'INSERT', schema: 'public', table: 'notifications' },
            (payload) => {
                console.log('新しい通知:', payload);
                
                // 新しい通知をリストに追加
                appState.notifications.unshift(payload.new);
                renderNotifications();
                updateNotificationBadge();
                
                // ブラウザ通知を表示（許可されている場合）
                if ('Notification' in window && Notification.permission === 'granted') {
                    new Notification('OEM商品企画管理', {
                        body: payload.new.message,
                        icon: '🍽️'
                    });
                }
            }
        )
        .subscribe();

    appState.subscriptions.push(channel);
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

