// メインアプリケーション

// すべてのデータを読み込む
async function loadAllData() {
    // Supabaseからデータを読み込み
    await loadTasks();
    await loadComments();
    await loadNotifications();
    if (typeof loadMeetings === 'function') {
        await loadMeetings();
    }
    
    // リアルタイム更新を開始
    subscribeToTasks();
    subscribeToComments();
    subscribeToNotifications();
    if (typeof subscribeToMeetings === 'function') {
        subscribeToMeetings();
    }
    
    // ブラウザ通知の許可をリクエスト
    requestNotificationPermission();
    
    // Service Workerの登録（PWA対応）
    registerServiceWorker();
}

// Service Workerの登録
function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/sw.js')
            .then((registration) => {
                console.log('Service Worker登録成功:', registration);
            })
            .catch((error) => {
                console.log('Service Worker登録失敗:', error);
            });
    }
}

// モーダル外クリックで閉じる
document.getElementById('task-modal').addEventListener('click', (e) => {
    if (e.target.id === 'task-modal') {
        closeModal();
    }
});

// 初期化
console.log('OEM商品企画管理システムを起動しました');

// グローバル関数として公開
window.loadAllData = loadAllData;
