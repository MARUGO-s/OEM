// ロードマップ項目ごとのコメント機能

// 編集モードを有効にする
function enableEditMode(taskId) {
    const task = appState.tasks.find(t => t.id === taskId);
    if (!task) return;
    
    // 表示モードを非表示、編集モードを表示
    const displayMode = document.getElementById('roadmap-item-display-mode');
    const editMode = document.getElementById('roadmap-item-edit-mode');
    const editBtn = document.getElementById('roadmap-item-edit-btn');
    
    if (displayMode) displayMode.style.display = 'none';
    if (editMode) editMode.style.display = 'block';
    
    // フォームに現在の値を設定
    const titleInput = document.getElementById('roadmap-edit-title');
    const descInput = document.getElementById('roadmap-edit-description');
    const statusInput = document.getElementById('roadmap-edit-status');
    const priorityInput = document.getElementById('roadmap-edit-priority');
    const deadlineInput = document.getElementById('roadmap-edit-deadline');
    
    if (titleInput) titleInput.value = task.title;
    if (descInput) descInput.value = task.description || '';
    if (statusInput) statusInput.value = task.status || 'pending';
    if (priorityInput) priorityInput.value = task.priority || 'medium';
    if (deadlineInput) deadlineInput.value = task.deadline || '';
    
    // 編集ボタンを非表示
    if (editBtn) editBtn.style.display = 'none';
}

// 編集モードを無効にする
function disableEditMode() {
    // 編集モードを非表示、表示モードを表示
    const editMode = document.getElementById('roadmap-item-edit-mode');
    const displayMode = document.getElementById('roadmap-item-display-mode');
    const editBtn = document.getElementById('roadmap-item-edit-btn');
    
    if (editMode) editMode.style.display = 'none';
    if (displayMode) displayMode.style.display = 'block';
    
    // 編集ボタンを表示
    if (editBtn) editBtn.style.display = 'inline-block';
}

// タスクを更新する
async function updateTask(taskId) {
    const form = document.getElementById('roadmap-item-edit-form');
    if (!form) {
        console.error('編集フォームが見つかりません');
        return;
    }
    
    const titleInput = document.getElementById('roadmap-edit-title');
    const descInput = document.getElementById('roadmap-edit-description');
    const statusInput = document.getElementById('roadmap-edit-status');
    const priorityInput = document.getElementById('roadmap-edit-priority');
    const deadlineInput = document.getElementById('roadmap-edit-deadline');
    
    if (!titleInput || !descInput || !statusInput || !priorityInput || !deadlineInput) {
        console.error('必須フォーム要素が見つかりません');
        return;
    }
    
    const taskData = {
        title: titleInput.value,
        description: descInput.value,
        status: statusInput.value,
        priority: priorityInput.value,
        deadline: deadlineInput.value && deadlineInput.value.trim() !== '' ? deadlineInput.value : null
    };
    
    try {
        // Supabaseでタスクを更新
        const { error } = await supabase
            .from('tasks')
            .update(taskData)
            .eq('id', taskId);
        
        if (error) throw error;
        
        // ローカル状態を更新
        const taskIndex = appState.tasks.findIndex(t => t.id === taskId);
        if (taskIndex !== -1) {
            appState.tasks[taskIndex] = { ...appState.tasks[taskIndex], ...taskData };
        }
        
        // 表示を更新
        updateTaskDisplay(taskId);
        
        // 編集モードを無効にする
        disableEditMode();
        
        console.log('タスクが正常に更新されました');
        
        // 成功メッセージを表示
        showNotification('タスクが正常に更新されました', 'success');
        
    } catch (error) {
        console.error('タスク更新エラー:', error);
        showNotification('タスクの更新に失敗しました', 'error');
    }
}

// タスクの表示を更新する
function updateTaskDisplay(taskId) {
    const task = appState.tasks.find(t => t.id === taskId);
    if (!task) return;
    
    // モーダル内の表示を更新
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
    
    // ロードマップの表示も更新
    if (window.loadRoadmap) {
        window.loadRoadmap();
    }
}

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
    
    // 編集・削除ボタンの表示制御（誰でも編集・削除可能）
    const editBtn = document.getElementById('roadmap-item-edit-btn');
    const deleteBtn = document.getElementById('roadmap-item-delete-btn');
    
    // ログインユーザーなら誰でも編集・削除可能
    const canEdit = appState.currentUser && appState.currentUser.username;
    
    if (editBtn) {
        if (canEdit) {
            editBtn.style.display = 'inline-block';
            editBtn.onclick = () => enableEditMode(taskId);
        } else {
            editBtn.style.display = 'none';
        }
    }
    
    if (deleteBtn) {
        if (canEdit) {
            deleteBtn.style.display = 'inline-block';
            deleteBtn.onclick = () => deleteTask(taskId);
        } else {
            deleteBtn.style.display = 'none';
        }
    }
    
    // モーダルを表示
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
    
    // コメントを読み込み
    loadRoadmapComments(taskId);
    
    // 編集フォームのイベントリスナーを設定
    setupEditFormListeners(taskId);
    
    // 現在のタスクIDを保存
    modal.dataset.taskId = taskId;
};

// 編集フォームのイベントリスナーを設定
function setupEditFormListeners(taskId) {
    const editForm = document.getElementById('roadmap-item-edit-form');
    const cancelBtn = document.getElementById('roadmap-edit-cancel');
    
    if (editForm) {
        editForm.onsubmit = (e) => {
            e.preventDefault();
            updateTask(taskId);
        };
    }
    
    if (cancelBtn) {
        cancelBtn.onclick = () => {
            disableEditMode();
        };
    }
}

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
    // より堅牢なID生成（タイムスタンプ + ランダム文字列 + カウンター）
    const timestamp = Date.now();
    const random = Math.random().toString(36).substr(2, 9);
    const counter = (window.roadmapCommentIdCounter = (window.roadmapCommentIdCounter || 0) + 1);
    return `roadmap_comment_${timestamp}_${random}_${counter}`;
}

// HTMLエスケープ（XSS対策）
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// タスク削除機能
async function deleteTask(taskId) {
    try {
        // ユーザー情報のバリデーション
        if (!appState.currentUser || !appState.currentUser.username) {
            alert('タスクを削除するにはログインが必要です。');
            return;
        }

        // 確認ダイアログ
        if (!confirm('このタスクを削除しますか？\nこの操作は取り消せません。\n\n注意: 関連するコメントもすべて削除されます。')) {
            return;
        }

        console.log('タスク削除開始:', taskId);

        // まず関連するコメントを削除
        const { error: commentsError } = await supabase
            .from('task_comments')
            .delete()
            .eq('task_id', taskId);

        if (commentsError) {
            console.warn('関連コメント削除エラー（継続）:', commentsError);
            // コメント削除エラーはタスク削除を阻害しない
        }

        // Supabaseからタスクを削除
        const { error } = await supabase
            .from('tasks')
            .delete()
            .eq('id', taskId);

        if (error) {
            console.error('タスク削除エラー:', error);
            alert('タスクの削除に失敗しました。しばらく待ってから再度お試しください。');
            return;
        }

        console.log('タスク削除成功:', taskId);

        // モーダルを閉じる
        closeRoadmapItemModal();

        // タスクを再読み込み
        if (typeof loadTasks === 'function') {
            await loadTasks();
        }

        // 通知を表示
        showNotification('タスクを削除しました', 'success');

    } catch (error) {
        console.error('タスク削除エラー:', error);
        alert('タスクの削除に失敗しました');
    }
}

let roadmapCommentCache = [];

// Supabaseコメントの読み込み（復活版）
async function loadRoadmapComments(taskId) {
    try {
        // Supabaseからコメントを取得
        const { data: comments, error } = await supabase
            .from('task_comments')
            .select('*')
            .eq('task_id', taskId)
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Supabaseコメント読み込みエラー:', error);
            // エラーが発生しても空の配列で処理を続行
            roadmapCommentCache = [];
            renderRoadmapComments([]);
            return;
        }
        
        roadmapCommentCache = comments || [];
        renderRoadmapComments(roadmapCommentCache);
        
        console.log('Supabaseコメント読み込み完了:', comments ? comments.length : 0, '個のコメント');
    } catch (error) {
        console.error('Supabaseコメント読み込みエラー:', error);
        roadmapCommentCache = [];
        renderRoadmapComments([]);
    }
}

// ロードマップコメントの表示
function renderRoadmapComments(comments) {
    const container = document.getElementById('roadmap-comments-list');
    
    // コンテナが存在しない場合は処理を中断
    if (!container) {
        console.error('roadmap-comments-list要素が見つかりません');
        return;
    }
    
    if (!comments || comments.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: #64748b; padding: 1rem;">まだコメントがありません。</p>';
        return;
    }

    // 画像のような箇条書き形式で表示（日時付き、クリック可能、削除ボタン付き）
    container.innerHTML = comments.map(comment => {
        // created_atが存在しない場合のフォールバック
        const date = comment.created_at ? new Date(comment.created_at) : new Date();
        const formattedDate = date.toLocaleDateString('ja-JP', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        });
        
        // 投稿者名を取得（メールアドレスから抽出）
        const authorName = comment.author_username || 
            (comment.author_email ? comment.author_email.split('@')[0] : '匿名');
        
        // 削除ボタンの表示判定（ログインユーザーなら誰でも削除可能）
        const canDelete = appState.currentUser && appState.currentUser.username;
        
        return `
            <div class="roadmap-comment-item" data-comment-id="${escapeHtml(comment.id || '')}" style="display: flex; align-items: center; gap: 0.5rem; padding: 0.25rem; border-radius: 0.375rem; transition: background-color 0.2s ease;">
                <div class="roadmap-comment-bullet" style="cursor: pointer; flex: 1; display: flex; align-items: center; gap: 0.25rem;">
                    <span class="comment-bullet">・</span>
                    <span class="comment-text">${escapeHtml(comment.content || '')}</span>
                    <span class="comment-date">${escapeHtml(authorName)} ${escapeHtml(formattedDate)}</span>
                </div>
                ${canDelete ? `<button class="delete-comment-btn" style="background: #ef4444; color: white; border: none; padding: 0.25rem 0.5rem; border-radius: 0.25rem; cursor: pointer; font-size: 0.75rem; transition: background-color 0.2s ease;" onmouseover="this.style.backgroundColor='#dc2626'" onmouseout="this.style.backgroundColor='#ef4444'">
                    削除
                </button>` : ''}
            </div>
        `;
    }).join('');
    
    // イベントリスナーを安全に追加（XSS対策、重複防止）
    container.querySelectorAll('.roadmap-comment-item').forEach(item => {
        const commentId = item.dataset.commentId;
        if (!commentId) return;
        
        // クリックイベント（コメント詳細表示）
        const bullet = item.querySelector('.roadmap-comment-bullet');
        if (bullet && !bullet.dataset.listenerAttached) {
            bullet.addEventListener('click', () => {
                if (typeof window.showCommentPopup === 'function') {
                    window.showCommentPopup(commentId);
                } else {
                    console.warn('showCommentPopup関数が定義されていません');
                }
            });
            bullet.dataset.listenerAttached = 'true';
        }
        
        // 削除ボタンのイベント
        const deleteBtn = item.querySelector('.delete-comment-btn');
        if (deleteBtn && !deleteBtn.dataset.listenerAttached) {
            deleteBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (typeof window.deleteRoadmapComment === 'function') {
                    window.deleteRoadmapComment(commentId);
                } else {
                    console.warn('deleteRoadmapComment関数が定義されていません');
                }
            });
            deleteBtn.dataset.listenerAttached = 'true';
        }
    });
}

// ロードマップコメントの投稿
async function submitRoadmapComment() {
    const modal = document.getElementById('roadmap-item-modal');
    
    // モーダルが存在しない場合は処理を中断
    if (!modal) {
        console.error('roadmap-item-modal要素が見つかりません');
        alert('モーダルが見つかりません。ページをリロードしてください。');
        return;
    }
    
    const taskId = modal.dataset.taskId;
    
    // taskIdが存在しない場合は処理を中断
    if (!taskId) {
        console.error('taskIdが設定されていません');
        alert('タスクIDが見つかりません。');
        return;
    }
    
    const contentInput = document.getElementById('roadmap-comment-input');
    
    if (!contentInput) {
        console.error('コメント入力欄が見つかりません');
        return;
    }
    
    let content = contentInput.value;
    
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
    
    const currentUser = appState.currentUser;

    try {
        // Supabaseコメント投稿（409エラー完全回避版）
        console.log('Supabaseコメント投稿（エラー回避）:', currentUser.username);
        
        // ユーザープロファイルの存在確認（409エラー回避）
        try {
            const { data: existingProfile, error: profileCheckError } = await supabase
                .from('user_profiles')
                .select('id, username')
                .eq('id', currentUser.id)
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
                            id: currentUser.id,
                            username: currentUser.username,
                            display_name: currentUser.username,
                            email: currentUser.email || `${currentUser.username}@hotmail.com`
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
            id: generateRoadmapCommentId(),
            task_id: taskId,
            author_id: currentUser.id,
            author_username: currentUser.username,
            content: content,
            created_at: new Date().toISOString()
        };

        // Supabaseに保存
        let insertedComment = null;
        try {
            const { data, error } = await supabase
                .from('task_comments')
                .insert([newComment])
                .select();

            if (error) {
                console.error('Supabaseコメント投稿エラー:', error);
                alert('コメントの投稿に失敗しました。しばらく待ってから再度お試しください。');
                return;
            }
            
            insertedComment = Array.isArray(data) && data.length > 0 ? data[0] : newComment;
            console.log('Supabaseコメント投稿成功:', insertedComment);
        } catch (insertError) {
            console.error('Supabaseコメント投稿例外:', insertError);
            alert('コメントの投稿に失敗しました。しばらく待ってから再度お試しください。');
            return;
        }

        // コメント入力欄をクリア（要素が存在する場合のみ）
        const roadmapCommentInput = document.getElementById('roadmap-comment-input');
        if (roadmapCommentInput) {
            roadmapCommentInput.value = '';
        }
        
        // ロードマップモーダルとローカル状態を即時更新
        if (insertedComment) {
            roadmapCommentCache = [
                insertedComment,
                ...roadmapCommentCache.filter(comment => comment.id !== insertedComment.id)
            ];
            renderRoadmapComments(roadmapCommentCache);

            appState.comments = [
                insertedComment,
                ...appState.comments.filter(comment => comment.id !== insertedComment.id)
            ];
        }

        // タイムラインを再描画して最新コメントを反映
        if (typeof renderTasks === 'function') {
            renderTasks();
        }

        if (typeof renderComments === 'function') {
            renderComments();
        }

        // バックグラウンドで全コメント/ロードマップコメントを再同期
        setTimeout(() => {
            loadRoadmapComments(taskId).catch(err => console.error('コメント再読み込みエラー (ロードマップ):', err));

            loadComments()
                .then(() => {
                    if (insertedComment && !appState.comments.some(comment => comment.id === insertedComment.id)) {
                        appState.comments = [
                            insertedComment,
                            ...appState.comments
                        ];
                        if (typeof renderComments === 'function') {
                            renderComments();
                        }
                        if (typeof renderTasks === 'function') {
                            renderTasks();
                        }
                    }
                })
                .catch(err => console.error('コメント再読み込みエラー:', err));
        }, 600);

        // 通知を送信（エラーが発生してもコメント投稿は成功とする）
        try {
            const previewText = content.length > 50 ? content.substring(0, 50) + '…' : content;
            console.log('🔔 ロードマップコメントの通知を作成します:', {
                type: 'new_comment',
                message: `${currentUser?.username || 'ユーザー'}さんがタスクにコメントしました: ${previewText}`,
                related_id: insertedComment?.id
            });

            const notificationResult = await createNotification({
                type: 'new_comment',
                message: `${currentUser?.username || 'ユーザー'}さんがタスクにコメントしました: ${previewText}`,
                related_id: insertedComment?.id || newComment.id
            });

            console.log('🔔 ロードマップコメント通知作成結果:', notificationResult);

            await loadNotifications();

            if (typeof updateNotificationBadge === 'function') {
                updateNotificationBadge();
            }

            if (typeof renderNotifications === 'function') {
                renderNotifications();
            }
        } catch (notificationError) {
            console.error('❌ ロードマップコメント通知送信エラー:', notificationError);
        }

        // 通知を表示（エラーが発生してもコメント投稿は成功とする）
        try {
            showNotification('コメントを投稿しました', 'success');
        } catch (notificationError) {
            console.error('通知表示エラー:', notificationError);
            // 通知エラーはコメント投稿を阻害しない
        }
        
        console.log('コメント投稿完了:', insertedComment);
        
    } catch (error) {
        console.error('コメント投稿エラー:', error);
        alert('コメントの投稿に失敗しました');
    }
}

// コメント詳細ポップアップの表示
window.showCommentPopup = async function(commentId) {
    try {
        // commentIdの検証
        if (!commentId) {
            console.error('commentIdが指定されていません');
            return;
        }
        
        // 既存のポップアップがあれば削除
        const existingPopup = document.querySelector('.comment-popup');
        if (existingPopup) {
            existingPopup.remove();
        }
        
        // コメントを段階的に探索（モーダルキャッシュ → 全体キャッシュ → Supabase）
        let comment = roadmapCommentCache.find(c => c.id === commentId);

        if (!comment && Array.isArray(appState.comments)) {
            comment = appState.comments.find(c => c.id === commentId);
        }

        if (!comment) {
            console.log('🛰️ コメントキャッシュに存在しないためSupabaseから取得します:', commentId);
            try {
                const { data, error } = await supabase
                    .from('task_comments')
                    .select('*')
                    .eq('id', commentId)
                    .maybeSingle();

                if (error) {
                    console.error('コメント単体取得エラー:', error);
                }

                if (data) {
                    comment = data;
                    // キャッシュに追加して次回以降の検索を高速化
                    roadmapCommentCache = [comment, ...roadmapCommentCache.filter(c => c.id !== comment.id)];
                    if (Array.isArray(appState.comments)) {
                        appState.comments = [comment, ...appState.comments.filter(c => c.id !== comment.id)];
                    }
                }
            } catch (fetchError) {
                console.error('コメント取得例外:', fetchError);
            }
        }

        if (!comment) {
            alert('コメントが見つかりません');
            return;
        }
        
        // created_atが存在しない場合のフォールバック
        const date = comment.created_at ? new Date(comment.created_at) : new Date();
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
                    <div class="comment-content">${escapeHtml(comment.content || '')}</div>
                    <div class="comment-meta">
                        <div class="comment-author">投稿者: ${escapeHtml(comment.author_username || comment.author_email || '匿名')}</div>
                        <div class="comment-date">投稿日時: ${escapeHtml(formattedDate)}</div>
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

    // 通知スタイル（右上に小さく表示）
    notification.style.cssText = `
        position: fixed;
        top: 80px;
        right: 20px;
        max-width: 350px;
        background: ${type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : '#3b82f6'};
        color: white;
        padding: 0.875rem 1.25rem;
        border-radius: 0.5rem;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        z-index: 9999;
        animation: slideInRight 0.3s ease;
        font-size: 0.9rem;
        line-height: 1.4;
        word-wrap: break-word;
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
    // commentIdの検証
    if (!commentId) {
        console.error('commentIdが指定されていません');
        return;
    }

    // ユーザー情報のバリデーション
    if (!appState.currentUser || !appState.currentUser.username) {
        alert('コメントを削除するにはログインが必要です。');
        return;
    }

    if (!confirm('このコメントを削除しますか？\nこの操作は取り消せません。')) {
        return;
    }

    try {
        // Supabaseからコメントを削除
        const { error } = await supabase
            .from('task_comments')
            .delete()
            .eq('id', commentId);

        if (error) {
            console.error('コメント削除エラー:', error);
            throw error;
        }

        // ローカル状態を更新（即時反映）
        appState.comments = appState.comments.filter(comment => comment.id !== commentId);

        // モーダルキャッシュを即時更新
        roadmapCommentCache = roadmapCommentCache.filter(comment => comment.id !== commentId);
        renderRoadmapComments(roadmapCommentCache);

        // タイムラインとコメント一覧を再描画
        if (typeof renderTasks === 'function') {
            renderTasks();
            setTimeout(() => renderTasks(), 100);
        }

        if (typeof renderComments === 'function') {
            renderComments();
        }

        // バックグラウンドで全コメント/ロードマップコメントを再同期
        const modal = document.getElementById('roadmap-item-modal');
        const taskId = modal ? modal.dataset.taskId : null;

        setTimeout(() => {
            if (taskId) {
                loadRoadmapComments(taskId).catch(err => console.error('コメント再読み込みエラー (ロードマップ):', err));
            }

            loadComments()
                .then(() => {
                    appState.comments = appState.comments.filter(comment => comment.id !== commentId);
                    if (typeof renderComments === 'function') {
                        renderComments();
                    }
                    if (typeof renderTasks === 'function') {
                        renderTasks();
                    }
                })
                .catch(err => console.error('コメント再読み込みエラー:', err));
        }, 500);

        try {
            await createNotification({
                type: 'roadmap_comment_deleted',
                message: `${appState.currentUser?.username || 'ユーザー'}さんがロードマップコメントを削除しました。`,
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
            console.error('ロードマップコメント削除通知エラー:', notificationError);
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
window.deleteTask = deleteTask;

document.head.appendChild(style);
