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
        renderNotifications();
        updateNotificationBadge();
        
    } catch (error) {
        console.error('通知読み込みエラー:', error);
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
                <div>${getNotificationIcon(notification.type)} ${escapeHtml(notification.message)}</div>
                <div class="time">${timeAgo}</div>
            </div>
        `;
    }).join('');
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

// ブラウザ通知の許可をリクエスト
function requestNotificationPermission() {
    if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
    }
}
