// メインアプリケーション

// 重複初期化を防ぐフラグ
let appInitialized = false;

// すべてのデータを読み込む
async function loadAllData() {
    if (appInitialized) {
        console.log('アプリケーションは既に初期化済みです');
        return;
    }
    
    try {
        // Supabaseからデータを読み込み（エラーハンドリング付き）
        await Promise.allSettled([
            loadTasks().catch(err => console.error('タスク読み込みエラー:', err)),
            loadComments().catch(err => console.error('コメント読み込みエラー:', err)),
            loadNotifications().catch(err => console.error('通知読み込みエラー:', err)),
            typeof loadMeetings === 'function' ? loadMeetings().catch(err => console.error('会議読み込みエラー:', err)) : Promise.resolve()
        ]);
        
        // リアルタイム更新を開始（エラーハンドリング付き）
        console.log('🔄 リアルタイム機能を初期化します...');
        console.log('📡 Supabase接続確認:', {
            url: SUPABASE_URL,
            hasSupabase: typeof supabase !== 'undefined',
            hasChannel: typeof supabase?.channel === 'function',
            hasRealtime: typeof supabase?.channel === 'function'
        });
        
        try {
            console.log('📋 タスクサブスクリプション開始...');
            subscribeToTasks();
            
            console.log('💬 コメントサブスクリプション開始...');
            subscribeToComments();
            
            console.log('🔔 通知サブスクリプション開始...');
            subscribeToNotifications();
            
            if (typeof subscribeToMeetings === 'function') {
                console.log('📅 会議サブスクリプション開始...');
                subscribeToMeetings();
            }
            
            console.log('✅ すべてのリアルタイムサブスクリプションを開始しました');
            console.log('📊 登録済みサブスクリプション数:', appState.subscriptions.length);
            
        } catch (error) {
            console.error('❌ リアルタイム購読エラー:', error);
            console.error('エラー詳細:', error.stack);
        }
        
        // ブラウザ通知の許可をリクエスト（エラーハンドリング付き）
        // ユーザージェスチャーなしでは通知許可を要求できないため、スキップ
        try {
            requestNotificationPermission();
        } catch (error) {
            console.error('通知許可リクエストエラー:', error);
        }
        
        // 通知のイベントリスナーを設定
        try {
            if (typeof setupNotificationEventListeners === 'function') {
                setupNotificationEventListeners();
            }
        } catch (error) {
            console.error('通知イベントリスナー設定エラー:', error);
        }
        
        // Service Workerの登録（PWA対応、エラーハンドリング付き）
        try {
            registerServiceWorker();
        } catch (error) {
            console.error('Service Worker登録エラー:', error);
        }
        
        appInitialized = true;
        console.log('アプリケーション初期化完了');
        
    } catch (error) {
        console.error('データ読み込み全体エラー:', error);
    }
}

// Service Workerの登録（Safari対応強化）
function registerServiceWorker() {
    // Service Workerのサポートチェック
    if (!('serviceWorker' in navigator)) {
        console.log('このブラウザはService Workerをサポートしていません');
        return;
    }
    
    // Safariの場合、追加のチェックを実行
    const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
    if (isSafari) {
        console.log('Safari検出: Service Workerを慎重に登録します');
    }
    
    // ページロード完了後に登録
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/OEM/sw.js', {
            scope: '/OEM/'
        })
        .then((registration) => {
            console.log('Service Worker登録成功:', registration.scope);
            
            // 更新チェック（Safari対応）
            registration.addEventListener('updatefound', () => {
                const newWorker = registration.installing;
                console.log('新しいService Workerが見つかりました');
                
                newWorker.addEventListener('statechange', () => {
                    if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                        console.log('新しいService Workerがインストールされました。リロードしてください。');
                    }
                });
            });
        })
        .catch((error) => {
            console.log('Service Worker登録失敗:', error);
            // Service Worker登録失敗はアプリケーションの動作を阻害しない
        });
    });
}

// モーダル外クリックで閉じる（要素が存在する場合のみ）
document.addEventListener('DOMContentLoaded', () => {
    const taskModal = document.getElementById('task-modal');
    if (taskModal) {
        taskModal.addEventListener('click', (e) => {
            if (e.target.id === 'task-modal') {
                closeModal();
            }
        });
    }
});

// 初期化
console.log('OEM商品企画管理システムを起動しました');

// グローバル関数として公開
window.loadAllData = loadAllData;
