// コメント・意見交換管理

// コメント一覧の読み込み
async function loadComments() {
    try {
        console.log('Supabaseからコメントを読み込み中...');
        
        // Supabaseからコメントを読み込み
        const { data: comments, error } = await supabase
            .from('comments')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) {
            console.error('コメント読み込みエラー:', error);
            throw error;
        }
        
        console.log('Supabaseから取得したコメント:', comments);
        appState.comments = comments || [];
        
        renderComments();
        // タイムライン側も最新コメントで再描画
        if (typeof renderTasks === 'function') {
            renderTasks();
        }
        
        console.log('コメント読み込み完了:', appState.comments.length, '個のコメント');
        
    } catch (error) {
        console.error('コメント読み込みエラー:', error);
        appState.comments = [];
        renderComments();
        if (typeof renderTasks === 'function') {
            renderTasks();
        }
    }
}

// コメントの表示
function renderComments() {
    const container = document.getElementById('comments-container');
    
    // コンテナが存在しない場合は処理を中断
    if (!container) {
        console.error('comments-container要素が見つかりません');
        return;
    }
    
    if (!appState.comments || appState.comments.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: var(--text-secondary);">まだコメントがありません。最初のコメントを投稿してください。</p>';
        return;
    }

    container.innerHTML = appState.comments.map(comment => {
        // created_atが存在しない場合のフォールバック
        const createdAt = comment.created_at ? new Date(comment.created_at) : new Date();
        const timeAgo = getTimeAgo(createdAt);
        
        // 削除ボタンの表示判定（ログインユーザーなら誰でも削除可能）
        const canDelete = appState.currentUser && appState.currentUser.username;
        
        return `
            <div class="comment-item">
                <div class="comment-header">
                    <span class="comment-author">${escapeHtml(comment.author_username || 'anonymous')}</span>
                    <span class="comment-time">${timeAgo}</span>
                    ${canDelete ? `<button class="delete-comment-btn" data-comment-id="${escapeHtml(comment.id)}" style="background: #ef4444; color: white; border: none; padding: 0.25rem 0.5rem; border-radius: 0.25rem; cursor: pointer; font-size: 0.75rem; margin-left: 0.5rem;">削除</button>` : ''}
                </div>
                <div class="comment-text">${escapeHtml(comment.content || '')}</div>
            </div>
        `;
    }).join('');

    // 削除ボタンのイベントリスナーを追加
    container.querySelectorAll('.delete-comment-btn').forEach(button => {
        button.addEventListener('click', (e) => {
            e.stopPropagation();
            const commentId = button.dataset.commentId;
            if (commentId) {
                deleteComment(commentId);
            }
        });
    });
}

function generateCommentId() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }
    // より堅牢なID生成（タイムスタンプ + ランダム文字列 + カウンター）
    const timestamp = Date.now();
    const random = Math.random().toString(36).substr(2, 9);
    const counter = (window.commentIdCounter = (window.commentIdCounter || 0) + 1);
    return `comment_${timestamp}_${random}_${counter}`;
}

// HTMLエスケープ（XSS対策）
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// コメント削除機能
async function deleteComment(commentId) {
    try {
        // ユーザー情報のバリデーション
        if (!appState.currentUser || !appState.currentUser.username) {
            alert('コメントを削除するにはログインが必要です。');
            return;
        }

        // 確認ダイアログ
        if (!confirm('このコメントを削除しますか？')) {
            return;
        }

        console.log('コメント削除開始:', commentId);

        // Supabaseからコメントを削除
        const { error } = await supabase
            .from('comments')
            .delete()
            .eq('id', commentId);

        if (error) {
            console.error('コメント削除エラー:', error);
            alert('コメントの削除に失敗しました。しばらく待ってから再度お試しください。');
            return;
        }

        console.log('コメント削除成功:', commentId);

        // コメントを再読み込み
        await loadComments();

        // 通知を表示
        showNotification('コメントを削除しました', 'success');

    } catch (error) {
        console.error('コメント削除エラー:', error);
        alert('コメントの削除に失敗しました');
    }
}

// コメント投稿
async function postComment(content) {
    try {
        // 入力値のサニタイゼーション
        if (!content || typeof content !== 'string') {
            alert('コメント内容を入力してください。');
            return;
        }
        
        content = content.trim();
        if (content.length === 0) {
            alert('コメント内容を入力してください。');
            return;
        }
        
        if (content.length > 1000) {
            alert('コメントは1000文字以内で入力してください。');
            return;
        }
        
        // ユーザー情報のバリデーション
        if (!appState.currentUser || !appState.currentUser.username) {
            alert('コメントを投稿するにはログインが必要です。');
            return;
        }

        // Supabaseコメント投稿（409エラー完全回避版）
        console.log('Supabaseコメント投稿（エラー回避）:', appState.currentUser.username);
        
        // ユーザープロファイルの存在確認（409エラー回避）
        try {
            const { data: existingProfile, error: profileCheckError } = await supabase
                .from('user_profiles')
                .select('id, username')
                .eq('id', appState.currentUser.id)
                .maybeSingle();
                
            if (profileCheckError && profileCheckError.code !== 'PGRST116') {
                console.warn('プロファイル確認エラー（無視）:', profileCheckError);
            }
            
            if (!existingProfile) {
                console.log('プロファイルが存在しないため作成を試行');
                try {
                    const { error: createError } = await supabase
                        .from('user_profiles')
                        .insert({
                            id: appState.currentUser.id,
                            username: appState.currentUser.username,
                            display_name: appState.currentUser.username,
                            email: appState.currentUser.email || `${appState.currentUser.username}@hotmail.com`
                        });
                        
                    if (createError && createError.code !== '23505') { // 重複エラー以外は無視
                        console.warn('プロファイル作成エラー（無視）:', createError);
                    } else {
                        console.log('プロファイル作成成功または既存');
                    }
                } catch (profileCreateError) {
                    console.warn('プロファイル作成例外（無視）:', profileCreateError);
                }
            }
        } catch (profileError) {
            console.warn('プロファイル確認例外（無視）:', profileError);
        }

        // 新しいコメントを作成
        const newComment = {
            id: generateCommentId(),
            content: content,
            author_id: appState.currentUser.id,
            author_username: appState.currentUser.username,
            task_id: null,
            created_at: new Date().toISOString()
        };

        // Supabaseに保存
        let insertedData = null;
        try {
            const { data, error } = await supabase
                .from('comments')
                .insert([newComment])
                .select();

            if (error) {
                console.error('コメント投稿エラー:', error);
                alert('コメントの投稿に失敗しました。しばらく待ってから再度お試しください。');
                return;
            }
            
            insertedData = data && data.length > 0 ? data[0] : newComment;
            console.log('コメント投稿成功:', insertedData);
        } catch (insertError) {
            console.error('コメント投稿例外:', insertError);
            alert('コメントの投稿に失敗しました。しばらく待ってから再度お試しください。');
            return;
        }

        // ローカル状態を即座に更新（UIの即時反映）
        appState.comments.unshift(insertedData);
        console.log('ローカルコメント配列を更新:', appState.comments.length);
        
        // 画面を即座に更新
        renderComments();
        
        // タイムライン側も更新
        if (typeof renderTasks === 'function') {
            renderTasks();
        }
        
        // バックグラウンドでデータを再読み込み（整合性確保）
        loadComments().catch(err => console.error('コメント再読み込みエラー:', err));

        // 通知を送信（エラーが発生してもコメント投稿は成功とする）
        try {
            await createNotification({
                type: 'new_comment',
                message: `${appState.currentUser?.username || 'ユーザー'}さんがコメントしました: ${content.substring(0, 50)}...`,
                related_id: newComment.id
            });
        } catch (notificationError) {
            console.error('通知送信エラー:', notificationError);
            // 通知エラーはコメント投稿を阻害しない
        }

        // 入力欄をクリア（要素が存在する場合のみ）
        const commentInput = document.getElementById('comment-input');
        if (commentInput) {
            commentInput.value = '';
        }
        
        console.log('コメント投稿完了:', insertedData);
        
    } catch (error) {
        console.error('コメント投稿エラー:', error);
        alert('コメントの投稿に失敗しました');
    }
}

// 相対時間の取得
function getTimeAgo(date) {
    // dateが無効な場合のフォールバック
    if (!date || isNaN(date.getTime())) {
        return '不明';
    }
    
    const now = new Date();
    const diff = now - date;
    
    // 未来の日付の場合
    if (diff < 0) {
        return '今';
    }
    
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) {
        return `${days}日前`;
    } else if (hours > 0) {
        return `${hours}時間前`;
    } else if (minutes > 0) {
        return `${minutes}分前`;
    } else {
        return '今';
    }
}

// イベントリスナー（DOMContentLoaded後に登録、重複防止）
document.addEventListener('DOMContentLoaded', () => {
    const postCommentBtn = document.getElementById('post-comment-btn');
    const commentInput = document.getElementById('comment-input');
    
    // 投稿ボタンのイベントリスナー
    if (postCommentBtn && !postCommentBtn.dataset.listenerAttached) {
        postCommentBtn.addEventListener('click', async () => {
            const content = commentInput ? commentInput.value.trim() : '';
            
            if (!content) {
                alert('コメントを入力してください');
                return;
            }

            await postComment(content);
        });
        postCommentBtn.dataset.listenerAttached = 'true';
    }
    
    // Enterキーで投稿（Shift+Enterで改行）
    if (commentInput && !commentInput.dataset.listenerAttached) {
        commentInput.addEventListener('keydown', async (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                const content = e.target.value.trim();
                
                if (content) {
                    await postComment(content);
                }
            }
        });
        commentInput.dataset.listenerAttached = 'true';
    }
});

// リアルタイム更新のサブスクリプション
function subscribeToComments() {
    const channel = supabase
        .channel('comments-changes')
        .on('postgres_changes',
            { event: '*', schema: 'public', table: 'comments' },
            (payload) => {
                console.log('コメント変更検知:', payload);
                loadComments();
            }
        )
        .subscribe();

    appState.subscriptions.push(channel);
}
