// 通知管理

let notificationCount = 0;

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
        
        // Supabaseで通知を既読に更新
        const { error } = await supabase
            .from('notifications')
            .update({ read: true })
            .eq('id', notificationId);

        if (error) {
            console.error('Supabase更新エラー:', error);
            throw error;
        }

        // ローカル状態を更新
        const notificationIndex = appState.notifications.findIndex(n => n.id === notificationId);
        if (notificationIndex !== -1) {
            appState.notifications[notificationIndex].read = true;
        }

        // 表示を更新
        renderNotifications();
        updateNotificationBadge();

        console.log('通知を既読にしました:', notificationId);
        
    } catch (error) {
        console.error('通知既読エラー:', error);
        showNotification('通知の既読に失敗しました', 'error');
    }
}

// すべての通知を既読にする
async function markAllNotificationsAsRead() {
    try {
        // 未読の通知のみを取得
        const unreadNotifications = appState.notifications.filter(n => !n.read);
        
        if (unreadNotifications.length === 0) {
            showNotification('既読にする通知がありません', 'info');
            return;
        }

        // Supabaseで一括更新
        const { error } = await supabase
            .from('notifications')
            .update({ read: true })
            .in('id', unreadNotifications.map(n => n.id));

        if (error) throw error;

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
        showNotification('通知の既読に失敗しました', 'error');
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
        }
        
    } catch (error) {
        console.error('通知作成エラー:', error);
        // 通知作成エラーはコメント投稿を阻害しない
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
    
    if (notificationBell && !notificationBell.dataset.listenerAttached) {
        notificationBell.addEventListener('click', toggleNotificationPanel);
        notificationBell.dataset.listenerAttached = 'true';
    }
    
    if (closeNotifications && !closeNotifications.dataset.listenerAttached) {
        closeNotifications.addEventListener('click', () => {
            document.getElementById('notification-panel').classList.remove('open');
        });
        closeNotifications.dataset.listenerAttached = 'true';
    }
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

// ブラウザ通知の許可をリクエスト（ユーザージェスチャーが必要）
function requestNotificationPermission() {
    // ユーザージェスチャーなしでは通知許可を要求できないため、完全にスキップ
    console.log('通知許可要求はスキップされました（ユーザージェスチャーが必要）');
    return;
}

// ユーザージェスチャー付きで通知許可を要求する関数
function requestNotificationPermissionWithGesture() {
    if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission().then(permission => {
            if (permission === 'granted') {
                console.log('通知許可が付与されました');
                hideNotificationPermissionButton();
            } else {
                console.log('通知許可が拒否されました');
            }
        });
    }
}

// 通知許可ボタンを表示
function showNotificationPermissionButton() {
    const button = document.getElementById('notification-permission-btn');
    if (button && 'Notification' in window && Notification.permission === 'default') {
        button.style.display = 'inline-block';
    }
}

// 通知許可ボタンを非表示
function hideNotificationPermissionButton() {
    const button = document.getElementById('notification-permission-btn');
    if (button) {
        button.style.display = 'none';
    }
}

// 通知許可ボタンのイベントリスナー
document.addEventListener('DOMContentLoaded', () => {
    const permissionBtn = document.getElementById('notification-permission-btn');
    if (permissionBtn && !permissionBtn.dataset.listenerAttached) {
        permissionBtn.addEventListener('click', () => {
            requestNotificationPermissionWithGesture();
        });
        permissionBtn.dataset.listenerAttached = 'true';
    }
    
    // 通知許可ボタンの表示チェック
    showNotificationPermissionButton();
});
