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
    
    if (appState.comments.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: var(--text-secondary);">まだコメントがありません。最初のコメントを投稿してください。</p>';
        return;
    }

    container.innerHTML = appState.comments.map(comment => {
        const timeAgo = getTimeAgo(new Date(comment.created_at));
        
        return `
            <div class="comment-item">
                <div class="comment-header">
                    <span class="comment-author">${escapeHtml(comment.author_username || 'anonymous')}</span>
                    <span class="comment-time">${timeAgo}</span>
                </div>
                <div class="comment-text">${escapeHtml(comment.content)}</div>
            </div>
        `;
    }).join('');
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

        // ユーザープロファイルの確実な存在保証（upsertを使用して競合を回避）
        if (appState.currentUser && appState.currentUser.username !== 'anonymous') {
            const email = appState.currentUser.email || `${appState.currentUser.username}@hotmail.com`;
            const { error: upsertError } = await supabase
                .from('user_profiles')
                .upsert({
                    id: appState.currentUser.id,
                    username: appState.currentUser.username,
                    display_name: appState.currentUser.username,
                    email: email
                }, {
                    onConflict: 'id'
                });

            if (upsertError) {
                console.error('ユーザープロファイル確保エラー:', upsertError);
                // エラーが発生してもコメント投稿を続行（プロファイルが既に存在する可能性）
            } else {
                console.log('ユーザープロファイルを確保しました:', appState.currentUser.username);
            }
        }

        // 新しいコメントを作成
        const newComment = {
            id: generateCommentId(),
            content: content,
            author_id: appState.currentUser.id || null,
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
            
            insertedData = data;
            console.log('コメント投稿成功:', insertedData);
        } catch (insertError) {
            console.error('コメント投稿例外:', insertError);
            alert('コメントの投稿に失敗しました。しばらく待ってから再度お試しください。');
            return;
        }

        // コメントを再読み込み
        await loadComments();

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
    const now = new Date();
    const diff = now - date;
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
