// メインアプリケーション

// 重複初期化を防ぐフラグ
let appInitialized = false;

// モバイル環境での再接続機能
function setupMobileReconnection() {
    console.log('📱 モバイル再接続機能を設定します');
    
    // ネットワーク接続の監視
    window.addEventListener('online', () => {
        console.log('📶 ネットワーク接続が復旧しました');
        setTimeout(() => {
            console.log('🔄 ネットワーク復旧後の再接続を開始します');
            reconnectRealtimeSubscriptions();
        }, 2000);
    });
    
    window.addEventListener('offline', () => {
        console.log('📵 ネットワーク接続が切断されました');
    });
    
    // ページの可視性変更の監視（モバイルでよくある）
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) {
            console.log('👁️ ページが表示されました、リアルタイム接続を確認します');
            setTimeout(() => {
                checkRealtimeConnection();
            }, 1000);
        }
    });
    
    // 定期的な接続確認（モバイル環境では重要）
    setInterval(() => {
        checkRealtimeConnection();
    }, 30000); // 30秒ごとに確認
}

// リアルタイム接続の確認
function checkRealtimeConnection() {
    console.log('🔍 リアルタイム接続状況を確認します');
    
    if (appState.subscriptions.length === 0) {
        console.warn('⚠️ サブスクリプションが登録されていません');
        reconnectRealtimeSubscriptions();
        return;
    }
    
    // 各サブスクリプションの状態を確認
    appState.subscriptions.forEach((subscription, index) => {
        if (subscription && subscription.state) {
            console.log(`📊 サブスクリプション ${index + 1} の状態:`, subscription.state);
        }
    });
}

// リアルタイムサブスクリプションの再接続
function reconnectRealtimeSubscriptions() {
    console.log('🔄 リアルタイムサブスクリプションを再接続します');
    
    try {
        // 既存のサブスクリプションをクリア
        appState.subscriptions.forEach(subscription => {
            if (subscription && subscription.unsubscribe) {
                subscription.unsubscribe();
            }
        });
        appState.subscriptions = [];
        
        // 新しいサブスクリプションを開始
        console.log('📋 タスクサブスクリプションを再接続...');
        subscribeToTasks();
        
        console.log('💬 コメントサブスクリプションを再接続...');
        subscribeToComments();
        
        console.log('🔔 通知サブスクリプションを再接続...');
        subscribeToNotifications();
        
        console.log('✅ リアルタイムサブスクリプションの再接続が完了しました');
        
    } catch (error) {
        console.error('❌ 再接続エラー:', error);
    }
}

// すべてのデータを読み込む
async function loadAllData() {
    try {
        // 既に初期化済みの場合は、既存のサブスクリプションをクリア
        if (appInitialized) {
            console.log('プロジェクト切り替えを検知、既存サブスクリプションをクリアします');
            // 既存のサブスクリプションをクリア
            appState.subscriptions.forEach(subscription => {
                if (subscription && subscription.unsubscribe) {
                    subscription.unsubscribe();
                }
            });
            appState.subscriptions = [];
        }
        
        // Supabaseからデータを読み込み（エラーハンドリング付き）
        await Promise.allSettled([
            loadTasks().catch(err => console.error('タスク読み込みエラー:', err)),
            loadComments().catch(err => console.error('コメント読み込みエラー:', err)),
            loadDiscussionComments().catch(err => console.error('意見交換コメント読み込みエラー:', err)),
            loadNotifications().catch(err => console.error('通知読み込みエラー:', err)),
            typeof loadMeetings === 'function' ? loadMeetings().catch(err => console.error('会議読み込みエラー:', err)) : Promise.resolve()
        ]);
        
        // データ読み込み後にUIを強制更新
        console.log('🔄 データ読み込み後のUI更新を実行します');
        if (typeof renderTasks === 'function') {
            renderTasks();
        }
        if (typeof renderComments === 'function') {
            renderComments();
        }
        if (typeof renderDiscussionComments === 'function') {
            renderDiscussionComments();
        }
        
        // リアルタイム更新を開始（エラーハンドリング付き）
        console.log('🔄 リアルタイム機能を初期化します...');
        
        // モバイル環境の詳細情報を取得
        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
        const isAndroid = /Android/.test(navigator.userAgent);
        const connectionType = navigator.connection ? navigator.connection.effectiveType : 'unknown';
        const isOnline = navigator.onLine;
        
        console.log('📱 モバイル環境情報:', {
            isMobile: isMobile,
            isIOS: isIOS,
            isAndroid: isAndroid,
            userAgent: navigator.userAgent,
            connectionType: connectionType,
            isOnline: isOnline,
            language: navigator.language,
            platform: navigator.platform
        });
        
        console.log('📡 Supabase接続確認:', {
            url: SUPABASE_URL,
            hasSupabase: typeof supabase !== 'undefined',
            hasChannel: typeof supabase?.channel === 'function',
            hasRealtime: typeof supabase?.channel === 'function',
            isSecureContext: window.isSecureContext,
            protocol: window.location.protocol
        });
        
        try {
            console.log('📋 タスクサブスクリプション開始...');
            subscribeToTasks();
            
            console.log('💬 コメントサブスクリプション開始...');
            subscribeToComments();
            
            console.log('💬 意見交換コメントサブスクリプション開始...');
            subscribeToDiscussionComments();
            
            console.log('🔔 通知サブスクリプション開始...');
            subscribeToNotifications();
            
            if (typeof subscribeToMeetings === 'function') {
                console.log('📅 会議サブスクリプション開始...');
                subscribeToMeetings();
            }
            
            console.log('✅ すべてのリアルタイムサブスクリプションを開始しました');
            console.log('📊 登録済みサブスクリプション数:', appState.subscriptions.length);
            
            // リアルタイムサブスクリプション開始後にUIを再更新
            console.log('🔄 リアルタイムサブスクリプション開始後のUI更新を実行します');
            setTimeout(() => {
                if (typeof renderTasks === 'function') {
                    renderTasks();
                }
                if (typeof renderComments === 'function') {
                    renderComments();
                }
                if (typeof renderDiscussionComments === 'function') {
                    renderDiscussionComments();
                }
            }, 1000); // 1秒後にUI更新
            
            // モバイル環境での再接続機能（初回のみ設定）
            if (isMobile && !appInitialized) {
                console.log('📱 モバイル環境での再接続機能を有効化します');
                setupMobileReconnection();
            }
            
        } catch (error) {
            console.error('❌ リアルタイム購読エラー:', error);
            console.error('エラー詳細:', error.stack);
            
            // モバイル環境でのエラー時は再接続を試行
            if (isMobile && !appInitialized) {
                console.log('📱 モバイル環境でのエラー検知、再接続を試行します');
                setTimeout(() => {
                    console.log('🔄 モバイル環境での再接続を開始します');
                    setupMobileReconnection();
                }, 5000); // 5秒後に再接続
            }
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
        // モバイル環境でのService Worker登録を最適化
        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        
        if (isMobile) {
            console.log('📱 モバイル環境でのService Worker登録を開始します');
        }
        
        navigator.serviceWorker.register('/OEM/sw.js', {
            scope: '/OEM/',
            // モバイル環境での更新頻度を調整
            updateViaCache: isMobile ? 'none' : 'imports'
        })
        .then((registration) => {
            console.log('Service Worker登録成功:', registration.scope);
            
            // モバイル環境での特別な処理
            if (isMobile) {
                console.log('📱 モバイル環境でのService Worker設定を適用します');
                
                // モバイル環境での定期的な更新チェック
                setInterval(() => {
                    registration.update();
                }, 60000); // 1分ごとに更新チェック
            }
            
            // 更新チェック（Safari対応）
            registration.addEventListener('updatefound', () => {
                const newWorker = registration.installing;
                console.log('新しいService Workerが見つかりました');
                
                newWorker.addEventListener('statechange', () => {
                    if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                        console.log('新しいService Workerがインストールされました。リロードしてください。');
                        
                        // モバイル環境では自動リロードを提案
                        if (isMobile) {
                            console.log('📱 モバイル環境では手動リロードが必要です');
                        }
                    }
                });
            });
        })
        .catch((error) => {
            console.log('Service Worker登録失敗:', error);
            // モバイル環境でのエラーハンドリング
            if (isMobile) {
                console.warn('📱 モバイル環境でのService Worker登録に失敗しましたが、アプリは動作します');
            }
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
