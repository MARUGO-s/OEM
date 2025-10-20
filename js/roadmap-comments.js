// ロードマップ項目ごとのコメント機能

// ロードマップ項目詳細モーダルの表示
window.showRoadmapItemModal = function(taskId) {
    const task = appState.tasks.find(t => t.id === taskId);
    if (!task) return;

    const modal = document.getElementById('roadmap-item-modal');
    
    // モーダル内容を更新
    document.getElementById('roadmap-item-title').textContent = task.title;
    document.getElementById('roadmap-item-description').textContent = task.description || '説明がありません';
    
    // ステータス
    const statusElement = document.getElementById('roadmap-item-status');
    statusElement.textContent = getStatusLabel(task.status);
    statusElement.className = `meta-value status-${task.status}`;
    
    // 優先度
    const priorityElement = document.getElementById('roadmap-item-priority');
    priorityElement.textContent = getPriorityLabel(task.priority);
    priorityElement.className = `meta-value priority-${task.priority}`;
    
    // 期限
    if (task.deadline) {
        document.getElementById('roadmap-item-deadline').textContent = 
            new Date(task.deadline).toLocaleDateString('ja-JP');
    } else {
        document.getElementById('roadmap-item-deadline').textContent = '未設定';
    }
    
    // モーダルを表示
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
    
    // コメントを読み込み
    loadRoadmapComments(taskId);
    
    // 現在のタスクIDを保存
    modal.dataset.taskId = taskId;
};

// ロードマップ項目詳細モーダルを閉じる
window.closeRoadmapItemModal = function() {
    const modal = document.getElementById('roadmap-item-modal');
    modal.classList.remove('active');
    document.body.style.overflow = '';
    
    // コメント入力欄をクリア
    document.getElementById('roadmap-comment-input').value = '';
};

function generateRoadmapCommentId() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }
    return `comment_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

let roadmapCommentCache = [];

// ロードマップコメントの読み込み
async function loadRoadmapComments(taskId) {
    try {
        // Supabaseからコメントを取得
        const { data: comments, error } = await supabase
            .from('comments')
            .select('*')
            .eq('task_id', taskId)
            .order('created_at', { ascending: false });

        if (error) {
            console.error('ロードマップコメント読み込みエラー:', error);
            // エラーが発生しても空の配列で処理を続行
            roadmapCommentCache = [];
            renderRoadmapComments([]);
            return;
        }
        
        roadmapCommentCache = comments || [];
        renderRoadmapComments(roadmapCommentCache);
        
        console.log('ロードマップコメント読み込み完了:', comments ? comments.length : 0, '個のコメント');
    } catch (error) {
        console.error('ロードマップコメント読み込みエラー:', error);
        roadmapCommentCache = [];
        renderRoadmapComments([]);
    }
}

// ロードマップコメントの表示
function renderRoadmapComments(comments) {
    const container = document.getElementById('roadmap-comments-list');
    
    if (comments.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: #64748b; padding: 1rem;">まだコメントがありません。</p>';
        return;
    }

    // 画像のような箇条書き形式で表示（日時付き、クリック可能、削除ボタン付き）
    container.innerHTML = comments.map(comment => {
        const date = new Date(comment.created_at);
        const formattedDate = date.toLocaleDateString('ja-JP', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        });
        
        // 投稿者名を取得（メールアドレスから抽出）
        const authorName = comment.author_username || 
            (comment.author_email ? comment.author_email.split('@')[0] : '匿名');
        
        return `
            <div class="roadmap-comment-item" style="display: flex; align-items: center; gap: 0.5rem; padding: 0.25rem; border-radius: 0.375rem; transition: background-color 0.2s ease;">
                <div class="roadmap-comment-bullet" onclick="showCommentPopup('${comment.id}')" style="cursor: pointer; flex: 1; display: flex; align-items: center; gap: 0.25rem;">
                    <span class="comment-bullet">・</span>
                    <span class="comment-text">${escapeHtml(comment.content)}</span>
                    <span class="comment-date">${escapeHtml(authorName)} ${formattedDate}</span>
                </div>
                <button onclick="deleteRoadmapComment('${comment.id}')" style="background: #ef4444; color: white; border: none; padding: 0.25rem 0.5rem; border-radius: 0.25rem; cursor: pointer; font-size: 0.75rem; transition: background-color 0.2s ease;" onmouseover="this.style.backgroundColor='#dc2626'" onmouseout="this.style.backgroundColor='#ef4444'">
                    削除
                </button>
            </div>
        `;
    }).join('');
}

// ロードマップコメントの投稿
async function submitRoadmapComment() {
    const modal = document.getElementById('roadmap-item-modal');
    const taskId = modal.dataset.taskId;
    const content = document.getElementById('roadmap-comment-input').value.trim();
    
    if (!content) {
        alert('コメントを入力してください');
        return;
    }
    
    // 現在のユーザー情報を取得（ログインしていない場合はデフォルト）
    const currentUser = appState.currentUser || {
        id: 'anonymous',
        username: 'anonymous'
    };

    try {
        // ユーザープロファイルの存在確認
        if (currentUser.username !== 'anonymous') {
            const { data: existingProfile, error: profileError } = await supabase
                .from('user_profiles')
                .select('id')
                .eq('username', currentUser.username)
                .maybeSingle();

            if (profileError && profileError.code !== 'PGRST116') {
                console.error('ユーザープロファイル確認エラー:', profileError);
            }

            // プロファイルが存在しない場合は作成
            if (!existingProfile) {
                try {
                    const { error: insertError } = await supabase
                        .from('user_profiles')
                        .upsert({
                            id: currentUser.id,
                            username: currentUser.username,
                            display_name: currentUser.username,
                            email: currentUser.email || `${currentUser.username}@hotmail.com`
                        }, {
                            onConflict: 'username'
                        });

                    if (insertError) {
                        console.error('ユーザープロファイル作成エラー:', insertError);
                        // エラーが発生してもコメント投稿を続行
                    }
                } catch (profileError) {
                    console.error('プロファイル自動作成エラー:', profileError);
                    // エラーが発生してもコメント投稿を続行
                }
            }
        }

        // 新しいコメントを作成
        const newComment = {
            id: generateRoadmapCommentId(),
            task_id: taskId,
            author_id: currentUser.id,
            author_username: currentUser.username,
            content: content,
            created_at: new Date().toISOString()
        };

        // Supabaseに保存（競合を回避するためupsertを使用）
        const { data, error } = await supabase
            .from('comments')
            .upsert([newComment], {
                onConflict: 'id'
            })
            .select();

        if (error) {
            console.error('コメント投稿エラー:', error);
            // エラーが発生しても処理を続行
            alert('コメントの投稿に失敗しました。しばらく待ってから再度お試しください。');
            return;
        }

        // コメント入力欄をクリア
        document.getElementById('roadmap-comment-input').value = '';
        
        // コメント一覧を再読み込み
        await loadRoadmapComments(taskId);
        
        // タイムラインを再描画して最新コメントを反映
        if (typeof renderTasks === 'function') {
            renderTasks();
        }
        
        // 通知を表示
        showNotification('コメントを投稿しました', 'success');
        
        console.log('コメント投稿完了:', data);
        
    } catch (error) {
        console.error('コメント投稿エラー:', error);
        alert('コメントの投稿に失敗しました');
    }
}

// コメント詳細ポップアップの表示
window.showCommentPopup = function(commentId) {
    try {
        // 既存のポップアップがあれば削除
        const existingPopup = document.querySelector('.comment-popup');
        if (existingPopup) {
            existingPopup.remove();
        }
        
        // ローカルストレージからコメントを取得
        const comment = roadmapCommentCache.find(c => c.id === commentId);
        
        if (!comment) {
            alert('コメントが見つかりません');
            return;
        }
        
        const date = new Date(comment.created_at);
        const formattedDate = date.toLocaleDateString('ja-JP', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
        
        // ポップアップを作成
        const popup = document.createElement('div');
        popup.className = 'comment-popup';
        popup.innerHTML = `
            <div class="comment-popup-content">
                <div class="comment-popup-header">
                    <h3>コメント詳細</h3>
                    <button class="comment-popup-close" onclick="closeCommentPopup()">&times;</button>
                </div>
                <div class="comment-popup-body">
                    <div class="comment-content">${escapeHtml(comment.content)}</div>
                    <div class="comment-meta">
                        <div class="comment-author">投稿者: ${escapeHtml(comment.author_username || comment.author_email || '匿名')}</div>
                        <div class="comment-date">投稿日時: ${formattedDate}</div>
                    </div>
                </div>
            </div>
        `;
        
        // スタイルを適用
        popup.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.5);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 2000;
            animation: fadeIn 0.3s ease;
        `;
        
        const content = popup.querySelector('.comment-popup-content');
        content.style.cssText = `
            background: white;
            border-radius: 0.75rem;
            box-shadow: 0 20px 40px rgba(0, 0, 0, 0.15);
            max-width: 500px;
            width: 90%;
            max-height: 80vh;
            overflow-y: auto;
            animation: slideInUp 0.3s ease;
        `;
        
        const header = popup.querySelector('.comment-popup-header');
        header.style.cssText = `
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 1.5rem 1.5rem 1rem 1.5rem;
            border-bottom: 1px solid #e2e8f0;
        `;
        
        const body = popup.querySelector('.comment-popup-body');
        body.style.cssText = `
            padding: 1.5rem;
        `;
        
        const commentContent = popup.querySelector('.comment-content');
        commentContent.style.cssText = `
            font-size: 1rem;
            line-height: 1.6;
            color: #1f2937;
            margin-bottom: 1.5rem;
            white-space: pre-wrap;
            word-break: break-word;
        `;
        
        const meta = popup.querySelector('.comment-meta');
        meta.style.cssText = `
            display: flex;
            flex-direction: column;
            gap: 0.5rem;
            font-size: 0.875rem;
            color: #64748b;
        `;
        
        const closeBtn = popup.querySelector('.comment-popup-close');
        closeBtn.style.cssText = `
            background: none;
            border: none;
            font-size: 1.5rem;
            cursor: pointer;
            color: #64748b;
            padding: 0;
            width: 2rem;
            height: 2rem;
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 0.375rem;
            transition: background-color 0.2s;
        `;
        
        closeBtn.addEventListener('mouseenter', () => {
            closeBtn.style.backgroundColor = '#f1f5f9';
        });
        
        closeBtn.addEventListener('mouseleave', () => {
            closeBtn.style.backgroundColor = 'transparent';
        });
        
        document.body.appendChild(popup);
        
        // 背景クリックで閉じる
        popup.addEventListener('click', (e) => {
            if (e.target === popup) {
                closeCommentPopup();
            }
        });
        
        // ESCキーで閉じる
        const handleKeydown = (e) => {
            if (e.key === 'Escape') {
                closeCommentPopup();
                document.removeEventListener('keydown', handleKeydown);
            }
        };
        document.addEventListener('keydown', handleKeydown);
        
    } catch (error) {
        console.error('コメントポップアップ表示エラー:', error);
        alert('コメントの表示に失敗しました');
    }
};

// コメント詳細ポップアップを閉じる
window.closeCommentPopup = function() {
    const popup = document.querySelector('.comment-popup');
    if (popup) {
        popup.style.animation = 'fadeOut 0.3s ease';
        setTimeout(() => {
            if (popup.parentNode) {
                popup.parentNode.removeChild(popup);
            }
        }, 300);
    }
};

// グローバル関数として定義（HTMLから呼び出し可能にする）
window.showCommentPopup = window.showCommentPopup;
window.closeCommentPopup = window.closeCommentPopup;

// 通知の表示
function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.textContent = message;
    
    // 通知スタイル
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: ${type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : '#3b82f6'};
        color: white;
        padding: 1rem 1.5rem;
        border-radius: 0.5rem;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        z-index: 1001;
        animation: slideInRight 0.3s ease;
    `;
    
    document.body.appendChild(notification);
    
    // 3秒後に自動削除
    setTimeout(() => {
        notification.style.animation = 'slideOutRight 0.3s ease';
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 300);
    }, 3000);
}

// HTMLエスケープ
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ステータスラベルの取得
function getStatusLabel(status) {
    const labels = {
        'pending': '未着手',
        'in_progress': '進行中',
        'completed': '完了'
    };
    return labels[status] || status;
}

// 優先度ラベルの取得
function getPriorityLabel(priority) {
    const labels = {
        'low': '低',
        'medium': '中',
        'high': '高'
    };
    return labels[priority] || priority;
}

// 初期化
document.addEventListener('DOMContentLoaded', function() {
    // コメント投稿ボタンのイベントリスナー
    const commentSubmitBtn = document.getElementById('roadmap-comment-submit');
    if (commentSubmitBtn) {
        commentSubmitBtn.addEventListener('click', submitRoadmapComment);
    }
    
    // コメント入力欄のEnterキー対応
    const commentInput = document.getElementById('roadmap-comment-input');
    if (commentInput) {
        commentInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                submitRoadmapComment();
            }
        });
    }
    
    // モーダル外クリックで閉じる
    const modal = document.getElementById('roadmap-item-modal');
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                closeRoadmapItemModal();
            }
        });
    }
    
    // ESCキーで閉じる
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && modal.classList.contains('active')) {
            closeRoadmapItemModal();
        }
    });
});

// CSS アニメーションを追加
const style = document.createElement('style');
style.textContent = `
    @keyframes slideInRight {
        from {
            transform: translateX(100%);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }
    
    @keyframes slideOutRight {
        from {
            transform: translateX(0);
            opacity: 1;
        }
        to {
            transform: translateX(100%);
            opacity: 0;
        }
    }
    
    @keyframes fadeIn {
        from {
            opacity: 0;
        }
        to {
            opacity: 1;
        }
    }
    
    @keyframes fadeOut {
        from {
            opacity: 1;
        }
        to {
            opacity: 0;
        }
    }
    
    @keyframes slideInUp {
        from {
            transform: translateY(20px);
            opacity: 0;
        }
        to {
            transform: translateY(0);
            opacity: 1;
        }
    }
    
    .comment-date {
        font-size: 0.75rem;
        color: #64748b;
        margin-left: 0.5rem;
    }
    
    .roadmap-comment-bullet:hover {
        background-color: #f8fafc;
        border-radius: 0.375rem;
        padding: 0.25rem;
        margin: -0.25rem;
    }
`;

// ロードマップコメントの削除
async function deleteRoadmapComment(commentId) {
    if (!confirm('このコメントを削除しますか？')) {
        return;
    }
    
    try {
        // Supabaseからコメントを削除
        const { error } = await supabase
            .from('comments')
            .delete()
            .eq('id', commentId);

        if (error) {
            console.error('コメント削除エラー:', error);
            throw error;
        }
        
        // モーダル内のコメント一覧を再読み込み
        const modal = document.getElementById('roadmap-item-modal');
        const taskId = modal.dataset.taskId;
        await loadRoadmapComments(taskId);
        
        // タイムラインを再描画
        if (typeof renderTasks === 'function') {
            renderTasks();
        }
        
        // 通知を表示
        showNotification('コメントを削除しました', 'success');
        
        console.log('コメント削除完了:', commentId);
        
    } catch (error) {
        console.error('コメント削除エラー:', error);
        showNotification('コメントの削除に失敗しました', 'error');
    }
}

// グローバル関数として公開
window.showRoadmapItemModal = showRoadmapItemModal;
window.closeRoadmapItemModal = closeRoadmapItemModal;
window.submitRoadmapComment = submitRoadmapComment;
window.showCommentPopup = showCommentPopup;
window.closeCommentPopup = closeCommentPopup;
window.deleteRoadmapComment = deleteRoadmapComment;

document.head.appendChild(style);
