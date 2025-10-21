/* タスク管理 */

let currentEditingTask = null;

// タスク詳細ポップアップモーダル表示
function showTaskDetailModal(taskId) {
    const task = appState.tasks.find(t => t.id === taskId);
    if (!task) return;

    const modal = document.getElementById('task-detail-modal');
    
    // モーダル内容を更新
    document.getElementById('modal-status-icon').textContent = 
        task.status === 'completed' ? '✅' : 
        task.status === 'in_progress' ? '🔄' : '⭕';
    
    document.getElementById('modal-task-title').textContent = task.title;
    document.getElementById('modal-task-description').textContent = task.description || '説明がありません';
    
    // ステータスバッジ
    const statusBadge = document.getElementById('modal-status-badge');
    statusBadge.textContent = getStatusLabel(task.status);
    statusBadge.className = `status-badge ${task.status}`;
    
    // 優先度バッジ
    const priorityBadge = document.getElementById('modal-priority-badge');
    priorityBadge.textContent = getPriorityLabel(task.priority);
    priorityBadge.className = `priority-badge ${task.priority}`;
    
    // 期限
    if (task.deadline) {
        document.getElementById('modal-deadline').textContent = 
            `📅 ${new Date(task.deadline).toLocaleDateString('ja-JP')}`;
    } else {
        document.getElementById('modal-deadline').textContent = '未設定';
    }
    
    // 担当者
    const assignedUser = task.created_by_email
        ? task.created_by_email.split('@')[0]
        : (task.created_by || '不明');
    document.getElementById('modal-assigned-user').textContent = assignedUser;
    
    // 作成日
    document.getElementById('modal-created-date').textContent = 
        new Date(task.created_at).toLocaleDateString('ja-JP');
    
    // 更新日
    document.getElementById('modal-updated-date').textContent = 
        new Date(task.updated_at).toLocaleDateString('ja-JP');
    
    // 編集で使用するタスクIDを保持
    modal.dataset.taskId = task.id;

    // モーダルを表示
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
}

// タスク詳細ポップアップモーダルを閉じる
function hideTaskDetailModal() {
    const modal = document.getElementById('task-detail-modal');
    modal.classList.remove('active');
    document.body.style.overflow = '';
    delete modal.dataset.taskId;
}

// モーダルイベントリスナー設定
document.addEventListener('DOMContentLoaded', function() {
    const modal = document.getElementById('task-detail-modal');
    const closeBtn = document.getElementById('modal-close-btn');
    const closeAction = document.getElementById('modal-close-action');
    const editAction = document.getElementById('modal-edit-action');
    const deleteAction = document.getElementById('modal-delete-action');
    
    // 閉じるボタン
    if (closeBtn) {
        closeBtn.addEventListener('click', hideTaskDetailModal);
    }
    
    if (closeAction) {
        closeAction.addEventListener('click', hideTaskDetailModal);
    }
    
    // 編集ボタン
    if (editAction) {
        editAction.addEventListener('click', () => {
            const taskId = modal.dataset.taskId;
            if (taskId) {
                hideTaskDetailModal();
                editTask(taskId);
            }
        });
    }

    // 削除ボタン
    if (deleteAction) {
        deleteAction.addEventListener('click', async () => {
            const taskId = modal.dataset.taskId;
            if (!taskId) return;

            const targetTask = appState.tasks.find(t => t.id === taskId);
            const title = targetTask ? targetTask.title : '';

            const confirmed = window.confirm(`タスク「${title || '無題'}」を削除しますか？\nこの操作は取り消せません。`);
            if (!confirmed) {
                return;
            }

            await deleteTask(taskId, title);
        });
    }
    
    // モーダル外クリックで閉じる
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                hideTaskDetailModal();
            }
        });
    }
    
    // ESCキーで閉じる
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && modal.classList.contains('active')) {
            hideTaskDetailModal();
        }
    });
});

// タスク一覧の読み込み
async function loadTasks() {
    try {
        console.log('Supabaseからタスクを読み込み中...');
        
        // Supabaseからタスクを読み込み
        const { data: tasks, error } = await supabase
            .from('tasks')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) {
            console.error('タスク読み込みエラー:', error);
            throw error;
        }
        
        console.log('Supabaseから取得したタスク:', tasks);
        appState.tasks = tasks || [];
        
        renderTasks();
        updateSummary();
        
        console.log('タスク読み込み完了:', appState.tasks.length, '個のタスク');
        
    } catch (error) {
        console.error('タスク読み込みエラー:', error);
        appState.tasks = [];
        renderTasks();
        updateSummary();
    }
}

// タスクの表示
function renderTasks() {
    const container = document.getElementById('roadmap-container');
    
    if (appState.tasks.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: var(--text-secondary); padding: 2rem;">タスクがまだありません。新規タスクを追加してください。</p>';
        return;
    }

    // タスクを日付順でソート
    const sortedTasks = [...appState.tasks].sort((a, b) => {
        if (a.deadline && b.deadline) {
            return new Date(a.deadline) - new Date(b.deadline);
        }
        if (a.deadline) return -1;
        if (b.deadline) return 1;
        return new Date(a.created_at) - new Date(b.created_at);
    });

    container.innerHTML = sortedTasks.map((task, index) => {
        const statusIcon = task.status === 'completed' ? '✅' : 
                          task.status === 'in_progress' ? '🔄' : '⭕';

        const comments = appState.comments
            .filter(comment => comment.task_id === task.id)
            .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
            .slice(0, 6);

        const descriptionLines = (task.description || '')
            .split(/\r?\n|・|\u30fb/)
            .map(line => line.trim())
            .filter(Boolean);

        const isLeft = index % 2 === 0;
        const taskSideClass = isLeft ? 'left' : 'right';
        const commentsSideClass = isLeft ? 'right' : 'left';

        const detailEntries = [];

        const maxItems = 6;
        const maxDescriptions = 3;
        let commentIndex = 0;
        let descriptionIndex = 0;

        while (detailEntries.length < maxItems) {
            if (commentIndex < comments.length) {
                detailEntries.push({
                    type: 'comment',
                    text: comments[commentIndex].content
                });
                commentIndex += 1;
            }

            if (descriptionIndex < descriptionLines.length && detailEntries.length < maxItems && descriptionIndex < maxDescriptions) {
                detailEntries.push({
                    type: 'description',
                    text: descriptionLines[descriptionIndex]
                });
                descriptionIndex += 1;
            }

            if (commentIndex >= comments.length && (descriptionIndex >= descriptionLines.length || descriptionIndex >= maxDescriptions)) {
                break;
            }
        }

        const commentsList = detailEntries.length > 0
            ? detailEntries.map(entry => {
                if (entry.type === 'comment') {
                    const comment = comments.find(c => c.content === entry.text);
                    const date = comment ? new Date(comment.created_at) : new Date();
                    const formattedDate = date.toLocaleDateString('ja-JP', {
                        year: 'numeric',
                        month: '2-digit',
                        day: '2-digit'
                    });
                    
                    // 投稿者名を取得
                    const authorName = comment && comment.author_username 
                        ? comment.author_username
                        : '匿名';
                    
                    // 削除ボタンの表示判定（現在のユーザーがコメントの作成者かどうか）
                    const canDelete = appState.currentUser && 
                                     comment && comment.author_username === appState.currentUser.username;
                    
                    return `
                        <div class="roadmap-comment-item" style="display: flex; align-items: center; gap: 0.5rem; padding: 0.25rem; border-radius: 0.375rem; transition: background-color 0.2s ease;">
                            <div class="roadmap-comment-bullet comment" data-comment-id="${escapeHtml(comment ? comment.id : '')}" style="cursor: pointer; flex: 1; display: flex; align-items: center; gap: 0.25rem;">
                                <span class="comment-bullet">・</span>
                                <div class="comment-content">
                                    <div class="comment-text">${escapeHtml(entry.text)}</div>
                                    <div class="comment-meta">
                                        <span class="comment-author">${escapeHtml(authorName)} ${escapeHtml(formattedDate)}</span>
                                    </div>
                                </div>
                            </div>
                            ${canDelete ? `<button data-comment-id="${escapeHtml(comment ? comment.id : '')}" class="delete-comment-btn" style="background: #ef4444; color: white; border: none; padding: 0.25rem 0.5rem; border-radius: 0.25rem; cursor: pointer; font-size: 0.75rem; transition: background-color 0.2s ease;" onmouseover="this.style.backgroundColor='#dc2626'" onmouseout="this.style.backgroundColor='#ef4444'">
                                削除
                            </button>` : ''}
                        </div>
                    `;
                } else {
                    // 説明文はタイムラインに表示しない
                    return '';
                }
            }).join('')
            : '<div class="roadmap-comment-empty">まだコメントがありません。</div>';

        return `
            <div class="roadmap-item ${task.status}" data-task-id="${task.id}">
                <div class="roadmap-side roadmap-side-task ${taskSideClass}">
                    <div class="roadmap-task" data-task-id="${task.id}">
                        <div class="roadmap-task-header">
                            <div class="roadmap-task-title">
                                <span class="status-icon">${statusIcon}</span>
                                <span>${escapeHtml(task.title)}</span>
                            </div>
                        </div>
                        <div class="roadmap-task-badges">
                            <span class="status-badge ${task.status}">${getStatusLabel(task.status)}</span>
                            <span class="priority-badge ${task.priority}">${getPriorityLabel(task.priority)}</span>
                        </div>
                    </div>
                </div>
                <div class="roadmap-side roadmap-side-comments ${commentsSideClass}">
                    <div class="roadmap-task-comments ${commentsSideClass} ${comments.length === 0 ? 'is-empty' : ''}">
                        ${commentsList}
                    </div>
                </div>
            </div>
        `;
    }).join('');

           // タスククリックイベント - ロードマップ項目詳細モーダル表示
           container.querySelectorAll('.roadmap-task').forEach(item => {
               item.addEventListener('click', () => {
                   const taskId = item.dataset.taskId;
                   showRoadmapItemModal(taskId);
               });
           });
           
           // コメント関連のイベントリスナーを安全に追加（XSS対策）
           container.querySelectorAll('.roadmap-comment-bullet.comment').forEach(element => {
               element.addEventListener('click', () => {
                   const commentId = element.dataset.commentId;
                   if (commentId) {
                       showCommentPopup(commentId);
                   }
               });
           });
           
           container.querySelectorAll('.delete-comment-btn').forEach(button => {
               button.addEventListener('click', (e) => {
                   e.stopPropagation();
                   const commentId = button.dataset.commentId;
                   if (commentId) {
                       deleteTimelineComment(commentId);
                   }
               });
           });
}

// サマリー更新
function updateSummary() {
    const total = appState.tasks.length;
    const completed = appState.tasks.filter(t => t.status === 'completed').length;
    const inProgress = appState.tasks.filter(t => t.status === 'in_progress').length;
    const pending = appState.tasks.filter(t => t.status === 'pending').length;
    const progress = total > 0 ? Math.round((completed / total) * 100) : 0;

    document.getElementById('total-tasks').textContent = total;
    document.getElementById('completed-tasks').textContent = completed;
    document.getElementById('inprogress-tasks').textContent = inProgress;
    document.getElementById('pending-tasks').textContent = pending;
    document.getElementById('progress-fill').style.width = progress + '%';
    document.getElementById('progress-text').textContent = progress + '%';
}

// タスク追加
async function addTask(taskData) {
    try {
        const now = new Date().toISOString();
        const newTask = {
            id: `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            ...taskData,
            created_by: appState.currentUser?.id || null,
            created_at: now,
            updated_at: now
        };

        const { error } = await supabase
            .from('tasks')
            .insert([newTask]);

        if (error) {
            throw error;
        }

        await loadTasks();
        closeModal();
        
    } catch (error) {
        console.error('タスク追加エラー:', error);
        alert('タスクの追加に失敗しました');
    }
}

// タスク更新
async function updateTask(taskId, updates) {
    try {
        const updatePayload = {
            ...updates,
            updated_at: new Date().toISOString()
        };

        const { error } = await supabase
            .from('tasks')
            .update(updatePayload)
            .eq('id', taskId);

        if (error) {
            throw error;
        }

        await loadTasks();
        closeModal();
        
    } catch (error) {
        console.error('タスク更新エラー:', error);
        alert('タスクの更新に失敗しました');
    }
}

// タスク削除
async function deleteTask(taskId, taskTitle = '') {
    try {
        const { error } = await supabase
            .from('tasks')
            .delete()
            .eq('id', taskId);

        if (error) {
            throw error;
        }

        await loadTasks();
        hideTaskDetailModal();
        currentEditingTask = null;
        
    } catch (error) {
        console.error('タスク削除エラー:', error);
        alert('タスクの削除に失敗しました');
    }
}

// タスク編集
function editTask(taskId) {
    const task = appState.tasks.find(t => t.id === taskId);
    if (!task) return;

    currentEditingTask = task;
    
    document.getElementById('modal-title').textContent = 'タスク編集';
    document.getElementById('task-title').value = task.title;
    document.getElementById('task-description').value = task.description || '';
    document.getElementById('task-status').value = task.status;
    document.getElementById('task-priority').value = task.priority;
    document.getElementById('task-deadline').value = task.deadline || '';

    openModal();
}

// モーダル操作
function openModal() {
    document.getElementById('task-modal').classList.add('active');
}

function closeModal() {
    document.getElementById('task-modal').classList.remove('active');
    document.getElementById('task-form').reset();
    currentEditingTask = null;
    document.getElementById('modal-title').textContent = '新規タスク追加';
}

// ステータスラベル
function getStatusLabel(status) {
    const labels = {
        pending: '未着手',
        in_progress: '進行中',
        completed: '完了'
    };
    return labels[status] || status;
}

// 優先度ラベル
function getPriorityLabel(priority) {
    const labels = {
        low: '低',
        medium: '中',
        high: '高'
    };
    return labels[priority] || priority;
}

// HTMLエスケープ
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// タイムラインコメント削除機能
async function deleteTimelineComment(commentId) {
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

        console.log('タイムラインコメント削除開始:', commentId);

        // Supabaseからコメントを削除
        const { error } = await supabase
            .from('comments')
            .delete()
            .eq('id', commentId);

        if (error) {
            console.error('タイムラインコメント削除エラー:', error);
            alert('コメントの削除に失敗しました。しばらく待ってから再度お試しください。');
            return;
        }

        console.log('タイムラインコメント削除成功:', commentId);

        // タスクを再読み込み
        await loadTasks();

        // 通知を表示
        showNotification('コメントを削除しました', 'success');

    } catch (error) {
        console.error('タイムラインコメント削除エラー:', error);
        alert('コメントの削除に失敗しました');
    }
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
        if (!confirm('このタスクを削除しますか？\n\n注意: 関連するコメントもすべて削除されます。')) {
            return;
        }

        console.log('タスク削除開始:', taskId);

        // まず関連するコメントを削除
        const { error: commentsError } = await supabase
            .from('comments')
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

        // タスクを再読み込み
        await loadTasks();

        // モーダルを閉じる
        closeModal();

        // 通知を表示
        showNotification('タスクを削除しました', 'success');

    } catch (error) {
        console.error('タスク削除エラー:', error);
        alert('タスクの削除に失敗しました');
    }
}

// イベントリスナー（DOMContentLoaded後に登録、重複防止）
document.addEventListener('DOMContentLoaded', () => {
    const addTaskBtn = document.getElementById('add-task-btn');
    const closeModalBtn = document.getElementById('close-modal');
    const cancelTaskBtn = document.getElementById('cancel-task');
    const taskForm = document.getElementById('task-form');
    
    if (addTaskBtn && !addTaskBtn.dataset.listenerAttached) {
        addTaskBtn.addEventListener('click', () => {
            currentEditingTask = null;
            if (taskForm) taskForm.reset();
            const modalTitle = document.getElementById('modal-title');
            if (modalTitle) modalTitle.textContent = '新規タスク追加';
            openModal();
        });
        addTaskBtn.dataset.listenerAttached = 'true';
    }
    
    if (closeModalBtn && !closeModalBtn.dataset.listenerAttached) {
        closeModalBtn.addEventListener('click', closeModal);
        closeModalBtn.dataset.listenerAttached = 'true';
    }
    
    if (cancelTaskBtn && !cancelTaskBtn.dataset.listenerAttached) {
        cancelTaskBtn.addEventListener('click', closeModal);
        cancelTaskBtn.dataset.listenerAttached = 'true';
    }
    
    if (taskForm && !taskForm.dataset.listenerAttached) {
        taskForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const taskData = {
                title: document.getElementById('task-title').value,
                description: document.getElementById('task-description').value,
                status: document.getElementById('task-status').value,
                priority: document.getElementById('task-priority').value,
                deadline: document.getElementById('task-deadline').value || null
            };

            if (currentEditingTask) {
                await updateTask(currentEditingTask.id, taskData);
            } else {
                await addTask(taskData);
            }
        });
        taskForm.dataset.listenerAttached = 'true';
    }
});

// リアルタイム更新のサブスクリプション
function subscribeToTasks() {
    const channel = supabase
        .channel('tasks-changes')
        .on('postgres_changes', 
            { event: '*', schema: 'public', table: 'tasks' },
            (payload) => {
                console.log('タスク変更検知:', payload);
                loadTasks();
            }
        )
        .subscribe();

    appState.subscriptions.push(channel);
}
