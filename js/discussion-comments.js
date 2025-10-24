// 意見交換コメント管理
// タスクコメントとは分離された独立したコメントシステム

let discussionComments = [];

// 意見交換コメントを読み込み
async function loadDiscussionComments() {
    try {
        console.log('💬 意見交換コメントを読み込み中...');
        const { data, error } = await supabase
            .from('discussion_comments')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) {
            console.error('意見交換コメント読み込みエラー:', error);
            return;
        }

        discussionComments = data || [];
        console.log('💬 意見交換コメント読み込み完了:', discussionComments.length);
        renderDiscussionComments();
    } catch (error) {
        console.error('意見交換コメント読み込み例外:', error);
    }
}

// 意見交換コメントを表示
function renderDiscussionComments() {
    const container = document.getElementById('discussion-comments-container');
    if (!container) {
        console.warn('意見交換コメントコンテナが見つかりません');
        return;
    }

    if (discussionComments.length === 0) {
        container.innerHTML = '<p class="no-comments">まだ意見交換がありません。最初のコメントを投稿してみましょう！</p>';
        return;
    }

    const commentsHtml = discussionComments.map(comment => {
        const createdAt = new Date(comment.created_at).toLocaleString('ja-JP');
        return `
            <div class="discussion-comment" data-comment-id="${comment.id}">
                <div class="comment-header">
                    <span class="comment-author">${escapeHtml(comment.author_username || '不明')}</span>
                    <span class="comment-date">${createdAt}</span>
                </div>
                <div class="comment-content">${escapeHtml(comment.content)}</div>
                <div class="comment-actions">
                    <button onclick="deleteDiscussionComment('${comment.id}')" class="btn btn-sm btn-danger">削除</button>
                </div>
            </div>
        `;
    }).join('');

    container.innerHTML = commentsHtml;
}

// 意見交換コメントを投稿
async function postDiscussionComment() {
    const input = document.getElementById('discussion-comment-input');
    if (!input) {
        console.error('意見交換コメント入力欄が見つかりません');
        return;
    }

    const content = input.value.trim();
    if (!content) {
        alert('コメントを入力してください');
        return;
    }

    // 認証状態を詳細にチェック
    console.log('認証状態チェック:', {
        appState_currentUser: appState.currentUser,
        appState_currentUser_id: appState.currentUser?.id,
        appState_currentUser_username: appState.currentUser?.username,
        supabase_user: supabase.auth.getUser()
    });
    
    if (!appState.currentUser) {
        console.error('appState.currentUserが設定されていません');
        alert('ログインが必要です。ページをリロードしてください。');
        return;
    }
    
    if (!appState.currentUser.id) {
        console.error('appState.currentUser.idが設定されていません');
        alert('ユーザー情報が不完全です。ページをリロードしてください。');
        return;
    }

    try {
        console.log('💬 意見交換コメントを投稿中...');
        const commentId = 'discussion_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        
        const { data, error } = await supabase
            .from('discussion_comments')
            .insert({
                id: commentId,
                author_id: appState.currentUser.id,
                author_username: appState.currentUser.username,
                content: content
            })
            .select()
            .single();

        if (error) {
            console.error('意見交換コメント投稿エラー:', error);
            alert('コメントの投稿に失敗しました: ' + error.message);
            return;
        }

        console.log('💬 意見交換コメント投稿成功:', data);
        
        // 入力欄をクリア
        input.value = '';
        
        // ローカル状態を更新
        discussionComments.unshift(data);
        
        // 画面を更新
        renderDiscussionComments();
        
        // 成功通知
        if (typeof showNotification === 'function') {
            showNotification('意見交換コメントを投稿しました', 'success');
        }
        
        // 通知を送信（エラーが発生してもコメント投稿は成功とする）
        try {
            await createNotification({
                type: 'new_discussion_comment',
                message: `${appState.currentUser?.username || 'ユーザー'}さんが意見交換にコメントしました: ${content.substring(0, 50)}...`,
                related_id: data.id
            });
        } catch (notificationError) {
            console.error('通知送信エラー:', notificationError);
            // 通知エラーはコメント投稿を阻害しない
        }

    } catch (error) {
        console.error('意見交換コメント投稿例外:', error);
        alert('コメントの投稿に失敗しました');
    }
}

// 意見交換コメントを削除
async function deleteDiscussionComment(commentId) {
    if (!confirm('このコメントを削除しますか？\nこの操作は取り消せません。')) {
        return;
    }

    try {
        console.log('💬 意見交換コメントを削除中:', commentId);
        
        const { error } = await supabase
            .from('discussion_comments')
            .delete()
            .eq('id', commentId);

        if (error) {
            console.error('意見交換コメント削除エラー:', error);
            alert('コメントの削除に失敗しました: ' + error.message);
            return;
        }

        console.log('💬 意見交換コメント削除成功:', commentId);
        
        // ローカル状態を更新
        discussionComments = discussionComments.filter(comment => comment.id !== commentId);
        
        // 画面を更新
        renderDiscussionComments();
        
        // 成功通知
        if (typeof showNotification === 'function') {
            showNotification('意見交換コメントを削除しました', 'success');
        }

        try {
            await createNotification({
                type: 'discussion_comment_deleted',
                message: `${appState.currentUser?.username || 'ユーザー'}さんが意見交換コメントを削除しました。`,
                related_id: commentId
            });

            await loadNotifications();
            if (typeof updateNotificationBadge === 'function') {
                updateNotificationBadge();
            }
            if (typeof renderNotifications === 'function') {
                renderNotifications();
            }
        } catch (notificationError) {
            console.error('意見交換コメント削除通知エラー:', notificationError);
        }

    } catch (error) {
        console.error('意見交換コメント削除例外:', error);
        alert('コメントの削除に失敗しました');
    }
}

// 意見交換コメントのリアルタイム購読
function subscribeToDiscussionComments() {
    console.log('💬 意見交換コメントのリアルタイム購読を開始...');
    
    const channel = supabase
        .channel('discussion_comments_changes')
        .on('postgres_changes',
            { event: '*', schema: 'public', table: 'discussion_comments' },
            (payload) => {
                console.log('💬 意見交換コメント変更検知:', payload);
                console.log('イベントタイプ:', payload.eventType);
                console.log('変更データ:', payload.new || payload.old);
                
                // リアルタイムで画面を更新
                loadDiscussionComments().then(() => {
                    console.log('💬 意見交換コメントをリアルタイム更新しました');
                });
            }
        )
        .subscribe((status) => {
            console.log('💬 意見交換コメント購読ステータス:', status);
            if (status === 'SUBSCRIBED') {
                console.log('✅ 意見交換コメントのリアルタイム購読が開始されました');
            } else if (status === 'CHANNEL_ERROR') {
                console.error('❌ 意見交換コメント購読エラー');
            } else if (status === 'TIMED_OUT') {
                console.warn('⏰ 意見交換コメント購読タイムアウト');
            } else if (status === 'CLOSED') {
                console.log('🔒 意見交換コメント購読が終了しました');
            }
        });
    
    return channel;
}

// HTMLエスケープ関数
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ページ読み込み時に初期化
document.addEventListener('DOMContentLoaded', function() {
    // 意見交換コメント投稿ボタンのイベントリスナー
    const postBtn = document.getElementById('post-discussion-comment-btn');
    if (postBtn) {
        postBtn.addEventListener('click', postDiscussionComment);
    }
    
    // エンターキーで投稿
    const input = document.getElementById('discussion-comment-input');
    if (input) {
        input.addEventListener('keypress', function(e) {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                postDiscussionComment();
            }
        });
    }
});
