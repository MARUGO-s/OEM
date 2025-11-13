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
            typeof loadMeetings === 'function' ? loadMeetings().catch(err => console.error('会議読み込みエラー:', err)) : Promise.resolve(),
            typeof loadProjectFiles === 'function' ? loadProjectFiles().catch(err => console.error('資料ファイル読み込みエラー:', err)) : Promise.resolve()
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

            if (typeof subscribeToProjectFiles === 'function') {
                console.log('📁 プロジェクトファイルサブスクリプション開始...');
                subscribeToProjectFiles();
            }

            if (typeof subscribeToProjectTasks === 'function') {
                console.log('📌 タスク変更監視サブスクリプション開始...');
                subscribeToProjectTasks();
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
        
        // 権限に基づいてUI要素を制御
        if (typeof updateUIByPermissions === 'function') {
            updateUIByPermissions();
        }
        
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

// 権限に基づいてUI要素を制御
function updateUIByPermissions() {
    const canEditContent = canEdit();
    const role = appState.currentUserRole;
    const canManageFiles = role === 'owner' || role === 'member';
    
    console.log('🔒 権限チェック結果:', { role, canEditContent });
    
    // タスク追加ボタン
    const addTaskBtn = document.getElementById('add-task-btn');
    if (addTaskBtn) {
        addTaskBtn.style.display = canEditContent ? '' : 'none';
    }
    
    // 会議作成ボタン
    const createMeetingBtn = document.getElementById('create-meeting-btn');
    if (createMeetingBtn) {
        createMeetingBtn.style.display = canEditContent ? '' : 'none';
    }
    
    // 会議フォーム全体
    const meetingsForm = document.getElementById('meetings-form');
    if (meetingsForm) {
        meetingsForm.style.display = canEditContent ? '' : 'none';
    }
    
    // 意見交換セクションの投稿エリア
    const discussionCommentInput = document.getElementById('discussion-comment-input');
    const postDiscussionBtn = document.getElementById('post-discussion-comment-btn');
    if (discussionCommentInput) {
        discussionCommentInput.style.display = canEditContent ? '' : 'none';
    }
    if (postDiscussionBtn) {
        postDiscussionBtn.style.display = canEditContent ? '' : 'none';
    }
    
    // 意見交換の投稿フォーム全体を探す
    const discussionFormContainer = document.querySelector('.discussion-section .discussion-comments-form, .discussion-section form');
    if (discussionFormContainer) {
        discussionFormContainer.style.display = canEditContent ? '' : 'none';
    }
    
    // タスク編集・削除ボタン（各タスクカード内）
    document.querySelectorAll('.task-card .edit-task-btn, .task-card .delete-task-btn, .roadmap-task .edit-task-btn, .roadmap-task .delete-task-btn').forEach(btn => {
        btn.style.display = canEditContent ? '' : 'none';
    });
    
    // タスク詳細モーダル内の編集・削除ボタン
    document.querySelectorAll('#task-modal .edit-task-btn, #task-modal .delete-task-btn, .task-detail-modal .edit-task-btn, .task-detail-modal .delete-task-btn').forEach(btn => {
        btn.style.display = canEditContent ? '' : 'none';
    });
    
    // コメント投稿フォーム（すべての種類）
    document.querySelectorAll('.comment-form, .comment-input-container, .comment-input, textarea[id*="comment"], input[id*="comment"], #roadmap-comment-input, #comment-input, #discussion-comment-input').forEach(form => {
        // コメント入力欄の親要素も確認
        const parent = form.closest('.comment-form-container, .comment-input-wrapper, .comment-section, .comment-input-area, .roadmap-comment-input');
        if (parent && !parent.querySelector('.comment-display')) {
            parent.style.display = canEditContent ? '' : 'none';
        }
        form.style.display = canEditContent ? '' : 'none';
    });
    
    // 返信フォームコンテナ
    document.querySelectorAll('.reply-form-container, .reply-form').forEach(form => {
        form.style.display = canEditContent ? '' : 'none';
    });
    
    // 返信ボタン
    document.querySelectorAll('.reply-btn, .reply-button, button[onclick*="reply"], button[data-action="reply"]').forEach(btn => {
        btn.style.display = canEditContent ? '' : 'none';
    });
    
    // コメント投稿ボタン
    document.querySelectorAll('#roadmap-comment-submit, #post-comment-btn, #post-discussion-comment-btn, button[id*="comment-submit"], button[id*="post-comment"]').forEach(btn => {
        btn.style.display = canEditContent ? '' : 'none';
    });
    
    // リアクションボタン（追加ボタン）
    document.querySelectorAll('.reaction-btn, .add-reaction-btn, .reaction-button, button[onclick*="reaction"], button[data-action="reaction"]').forEach(btn => {
        // 既存のリアクション表示は残すが、追加ボタンは非表示
        if (!btn.classList.contains('reaction-display') && !btn.closest('.reaction-summary')) {
            btn.style.display = canEditContent ? '' : 'none';
        }
    });
    
    // 会議編集・削除ボタン
    document.querySelectorAll('.edit-meeting-btn, .delete-meeting-btn, button[onclick*="editMeeting"], button[onclick*="deleteMeeting"]').forEach(btn => {
        btn.style.display = canEditContent ? '' : 'none';
    });
    
    // 会議アイテム内の編集・削除ボタン
    document.querySelectorAll('.meeting-item .edit-btn, .meeting-item .delete-btn, .meeting-card .edit-btn, .meeting-card .delete-btn').forEach(btn => {
        btn.style.display = canEditContent ? '' : 'none';
    });
    
    // コメント編集・削除ボタン
    document.querySelectorAll('.edit-comment-btn, .delete-comment-btn, button[onclick*="editComment"], button[onclick*="deleteComment"]').forEach(btn => {
        btn.style.display = canEditContent ? '' : 'none';
    });
    
    // ロードマップのタスク編集・削除ボタン
    document.querySelectorAll('.roadmap-task-actions button, .roadmap-task-header button').forEach(btn => {
        if (btn.textContent.includes('編集') || btn.textContent.includes('削除') || btn.textContent.includes('Edit') || btn.textContent.includes('Delete')) {
            btn.style.display = canEditContent ? '' : 'none';
        }
    });

    document.querySelectorAll('.project-files-manage-only').forEach(el => {
        el.style.display = canManageFiles ? '' : 'none';
    });

    document.querySelectorAll('.project-file-memo-input').forEach(textarea => {
        textarea.disabled = !canManageFiles;
    });

    document.querySelectorAll('.project-file-memo-save, .project-file-delete-btn').forEach(btn => {
        btn.style.display = canManageFiles ? '' : 'none';
    });

    if (role === 'viewer') {
        console.log('👀 閲覧者モード: すべての編集機能を非表示にしました');
    }

    if (typeof renderProjectFiles === 'function') {
        renderProjectFiles();
    }
}

// グローバル関数として公開
window.loadAllData = loadAllData;
window.updateUIByPermissions = updateUIByPermissions;
