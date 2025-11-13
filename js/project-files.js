const PROJECT_FILE_ALLOWED_TYPES = ['image/jpeg', 'application/pdf'];
const PROJECT_FILE_MAX_IMAGE_DIMENSION = 1600;
const PROJECT_FILE_TARGET_SIZE = 2 * 1024 * 1024; // 2MB目安

let projectFilesSortOption = 'recent';
let projectFilesFilterOption = 'all';
let projectFilesTaskFilter = 'all'; // タスクフィルター
let projectFilesUploading = false;
let projectTasks = []; // プロジェクトのタスク一覧

function canManageProjectFiles() {
    return appState.currentUserRole === 'owner' || appState.currentUserRole === 'member';
}

// タスク情報を取得してHTML化
function getTaskInfo(taskId) {
    if (!taskId) {
        return {
            number: null,
            task: null,
            html: '<div class="project-file-task-badge unlinked">🔗 紐付きなし</div>'
        };
    }

    const taskIndex = projectTasks.findIndex(t => t.id === taskId);
    if (taskIndex === -1) {
        return {
            number: null,
            task: null,
            html: '<div class="project-file-task-badge deleted">⚠️ タスクが削除されました</div>'
        };
    }

    const task = projectTasks[taskIndex];
    const taskNumber = taskIndex + 1;
    const truncatedTitle = task.title.length > 20 ? task.title.substring(0, 20) + '...' : task.title;

    return {
        number: taskNumber,
        task: task,
        html: `<div class="project-file-task-badge linked" title="${escapeHtml(task.title)}">📌 タスク#${taskNumber}: ${escapeHtml(truncatedTitle)}</div>`
    };
}

// タスク一覧を取得
async function loadProjectTasks() {
    try {
        if (!appState.currentProject) {
            console.log('⚠️ currentProjectが設定されていません');
            projectTasks = [];
            return;
        }

        console.log('📌 タスク読み込み開始:', appState.currentProject.id);

        const { data, error } = await supabase
            .from('tasks')
            .select('id, title, status, priority, deadline, created_at')
            .eq('project_id', appState.currentProject.id)
            .order('created_at', { ascending: true });

        if (error) {
            console.error('❌ タスク読み込みエラー:', error);
            projectTasks = [];
            return;
        }

        projectTasks = data || [];
        console.log(`✅ タスクを${projectTasks.length}件読み込みました:`, projectTasks.map(t => t.title));
    } catch (error) {
        console.error('❌ タスク読み込み例外:', error);
        projectTasks = [];
    }
}

async function loadProjectFiles() {
    try {
        if (!appState.currentProject) {
            appState.projectFiles = [];
            renderProjectFiles();
            return;
        }

        // タスク一覧を先に読み込む
        await loadProjectTasks();

        const { data, error } = await supabase
            .from('project_files')
            .select('*, uploader:user_profiles!project_files_uploaded_by_fkey(id, display_name, username, email)')
            .eq('project_id', appState.currentProject.id)
            .order('uploaded_at', { ascending: false });

        if (error) {
            console.error('プロジェクトファイル読み込みエラー:', error);
            notifyProjectFiles(`ファイル一覧の取得に失敗しました: ${error.message}`, 'error');
            return;
        }

        appState.projectFiles = data || [];
        renderProjectFiles();
    } catch (error) {
        console.error('プロジェクトファイル読み込み例外:', error);
    }
}

function renderProjectFiles() {
    const container = document.getElementById('project-files-list');
    if (!container) return;

    const filterSelect = document.getElementById('project-files-filter');
    if (filterSelect && filterSelect.value !== projectFilesFilterOption) {
        filterSelect.value = projectFilesFilterOption;
    }

    const sortSelect = document.getElementById('project-files-sort');
    if (sortSelect && sortSelect.value !== projectFilesSortOption) {
        sortSelect.value = projectFilesSortOption;
    }

    const uploadBtn = document.getElementById('project-files-upload-btn');
    if (uploadBtn) {
        uploadBtn.disabled = projectFilesUploading || !canManageProjectFiles();
        uploadBtn.textContent = projectFilesUploading ? 'アップロード中...' : '+ ファイルを追加';
    }

    // タスクフィルターのセレクトボックスを更新
    const taskFilterSelect = document.getElementById('project-files-task-filter');
    if (taskFilterSelect) {
        // オプションを動的に生成
        const currentValue = taskFilterSelect.value;
        taskFilterSelect.innerHTML = `
            <option value="all">すべて</option>
            <option value="unlinked">🔗 紐付きなし</option>
            ${projectTasks.map((task, index) => {
                const taskNumber = index + 1;
                const truncatedTitle = task.title.length > 25 ? task.title.substring(0, 25) + '...' : task.title;
                return `<option value="${task.id}">タスク#${taskNumber}: ${escapeHtml(truncatedTitle)}</option>`;
            }).join('')}
        `;

        // 以前の選択を復元
        if (currentValue && (currentValue === 'all' || currentValue === 'unlinked' || projectTasks.find(t => t.id === currentValue))) {
            taskFilterSelect.value = currentValue;
        } else {
            taskFilterSelect.value = 'all';
            projectFilesTaskFilter = 'all';
        }
    }

    const files = (appState.projectFiles || []).slice();

    let filtered = files.filter(file => {
        // ファイルタイプフィルター
        if (projectFilesFilterOption === 'jpeg') {
            if (file.file_type !== 'image/jpeg') return false;
        }
        if (projectFilesFilterOption === 'pdf') {
            if (file.file_type !== 'application/pdf') return false;
        }

        // タスクフィルター
        if (projectFilesTaskFilter === 'unlinked') {
            return !file.task_id;
        } else if (projectFilesTaskFilter !== 'all') {
            return file.task_id === projectFilesTaskFilter;
        }

        return true;
    });

    filtered.sort((a, b) => {
        if (projectFilesSortOption === 'name') {
            return (a.file_name || '').localeCompare(b.file_name || '', 'ja');
        }
        if (projectFilesSortOption === 'type') {
            const typeCompare = (a.file_type || '').localeCompare(b.file_type || '');
            if (typeCompare !== 0) return typeCompare;
            return (a.file_name || '').localeCompare(b.file_name || '', 'ja');
        }
        return new Date(b.uploaded_at).getTime() - new Date(a.uploaded_at).getTime();
    });

    if (filtered.length === 0) {
        container.innerHTML = appState.currentProject
            ? '<div class="empty-state">📂 プロジェクト資料がまだありません</div>'
            : '<div class="empty-state">📂 プロジェクトを選択すると資料を表示します</div>';
        return;
    }

    const canManage = canManageProjectFiles();

    container.innerHTML = filtered.map(file => {
        const typeLabel = getFileTypeLabel(file.file_type);
        const sizeLabel = formatFileSize(file.file_size);
        const uploadedAt = formatDateTime(file.uploaded_at);
        const uploaderName = getUploaderName(file.uploader);
        const memo = file.memo || '';
        const downloadUrl = file.public_url || getPublicUrlFallback(file.storage_path);
        const fileIcon = file.file_type === 'image/jpeg' ? '🖼️' : '📄';

        // タスク情報を取得
        const taskInfo = getTaskInfo(file.task_id);
        const taskBadge = taskInfo.html;

        const memoSection = canManage
            ? `
                <div class="project-file-memo project-file-manage-only">
                    <textarea class="project-file-memo-input" data-file-id="${file.id}" placeholder="メモを入力">${escapeHtml(memo)}</textarea>
                    <div class="project-file-memo-actions">
                        <button class="btn btn-ghost project-file-memo-save" data-file-id="${file.id}">保存</button>
                        <span class="project-file-memo-status" id="project-file-memo-status-${file.id}"></span>
                    </div>
                </div>
            `
            : `
                <div class="project-file-memo-display">${memo ? escapeHtml(memo) : '<span style="color: rgba(15,23,42,0.55);">メモは未登録です</span>'}</div>
            `;

        // タスク変更UI
        const taskChangeSection = canManage
            ? `
                <div class="project-file-task-change">
                    <button class="btn btn-ghost btn-sm project-file-task-change-btn" data-file-id="${file.id}">
                        🔗 タスクを変更
                    </button>
                </div>
            `
            : '';

        return `
            <div class="project-file-item" data-file-id="${file.id}">
                <div class="project-file-icon">${fileIcon}</div>
                <div class="project-file-body">
                    <div class="project-file-heading">
                        <div class="project-file-name">${escapeHtml(file.file_name || '名称未設定')}</div>
                        <div class="project-file-chips">
                            <span class="project-file-chip">${typeLabel}</span>
                            <span class="project-file-chip subtle">${sizeLabel}</span>
                        </div>
                    </div>
                    <div class="project-file-task-section">
                        ${taskBadge}
                        ${taskChangeSection}
                    </div>
                    <div class="project-file-meta">
                        <span>${uploadedAt}</span>
                        <span>${escapeHtml(uploaderName)}</span>
                    </div>
                    ${memoSection}
                    <div class="project-file-actions">
                        <a href="${downloadUrl}" target="_blank" rel="noopener noreferrer" class="btn btn-ghost">閲覧</a>
                        <button class="btn btn-ghost danger project-file-delete-btn" data-file-id="${file.id}" style="display: ${canManage ? 'inline-flex' : 'none'};">削除</button>
                    </div>
                </div>
            </div>
        `;
    }).join('');

    attachProjectFileEventHandlers();
}

function attachProjectFileEventHandlers() {
    document.querySelectorAll('.project-file-delete-btn').forEach(btn => {
        if (btn.dataset.listenerAttached) return;
        btn.addEventListener('click', async (event) => {
            const fileId = event.currentTarget.dataset.fileId;
            await handleProjectFileDelete(fileId);
        });
        btn.dataset.listenerAttached = 'true';
    });

    document.querySelectorAll('.project-file-memo-save').forEach(btn => {
        if (btn.dataset.listenerAttached) return;
        btn.addEventListener('click', async (event) => {
            const fileId = event.currentTarget.dataset.fileId;
            await handleProjectFileMemoSave(fileId);
        });
        btn.dataset.listenerAttached = 'true';
    });

    document.querySelectorAll('.project-file-task-change-btn').forEach(btn => {
        if (btn.dataset.listenerAttached) return;
        btn.addEventListener('click', async (event) => {
            const fileId = event.currentTarget.dataset.fileId;
            await showTaskChangeModal(fileId);
        });
        btn.dataset.listenerAttached = 'true';
    });
}

function setProjectFilesUploading(isUploading) {
    projectFilesUploading = isUploading;
    const uploadBtn = document.getElementById('project-files-upload-btn');
    if (uploadBtn) {
        uploadBtn.disabled = isUploading || !canManageProjectFiles();
        uploadBtn.textContent = isUploading ? 'アップロード中...' : '+ ファイルを追加';
    }
}

async function handleProjectFilesInputChange(event) {
    const files = Array.from(event.target.files || []);
    event.target.value = '';

    if (!files.length || !appState.currentProject) {
        return;
    }

    const allowed = PROJECT_FILE_ALLOWED_TYPES;
    const disallowed = files.filter(file => !allowed.includes(file.type));
    if (disallowed.length > 0) {
        alert('対応形式は JPEG (.jpg/.jpeg) と PDF (.pdf) のみです。');
        return;
    }

    setProjectFilesUploading(true);

    try {
        for (const file of files) {
            await uploadProjectFile(file);
        }
        await loadProjectFiles();
    } catch (error) {
        console.error('ファイルアップロードエラー:', error);
        notifyProjectFiles(`ファイルのアップロードに失敗しました: ${error.message}`, 'error');
    } finally {
        setProjectFilesUploading(false);
    }
}

async function uploadProjectFile(originalFile) {
    let file = originalFile;

    if (file.type === 'image/jpeg') {
        file = await compressImageIfNeeded(file);
    }

    const sanitizedName = sanitizeFileName(file.name || 'file');
    const timestamp = Date.now();
    const storagePath = `${appState.currentProject.id}/${timestamp}_${sanitizedName}`;

    const { error: uploadError } = await supabase.storage
        .from('project-files')
        .upload(storagePath, file, {
            cacheControl: '3600',
            upsert: false
        });

    if (uploadError) {
        throw uploadError;
    }

    const { data: publicData } = supabase.storage
        .from('project-files')
        .getPublicUrl(storagePath);

    const payload = {
        project_id: appState.currentProject.id,
        file_name: sanitizedName,
        file_type: file.type,
        file_size: file.size,
        storage_path: storagePath,
        public_url: publicData?.publicUrl || null,
        memo: '',
        uploaded_by: appState.currentUser?.id || null
    };

    const { error: insertError } = await supabase
        .from('project_files')
        .insert(payload);

    if (insertError) {
        throw insertError;
    }

    notifyProjectFiles(`${sanitizedName} をアップロードしました`, 'success');
}

async function handleProjectFileDelete(fileId) {
    const file = (appState.projectFiles || []).find(item => item.id === fileId);
    if (!file) {
        alert('ファイルが見つかりません');
        return;
    }

    if (!confirm(`「${file.file_name}」を削除しますか？\nこの操作は取り消せません。`)) {
        return;
    }

    try {
        if (file.storage_path) {
            await supabase.storage
                .from('project-files')
                .remove([file.storage_path]);
        }

        const { error } = await supabase
            .from('project_files')
            .delete()
            .eq('id', fileId);

        if (error) {
            throw error;
        }

        notifyProjectFiles('ファイルを削除しました', 'success');
        await loadProjectFiles();
    } catch (error) {
        console.error('ファイル削除エラー:', error);
        notifyProjectFiles(`削除に失敗しました: ${error.message}`, 'error');
    }
}

// タスク変更モーダルを表示
async function showTaskChangeModal(fileId) {
    const file = (appState.projectFiles || []).find(item => item.id === fileId);
    if (!file) {
        alert('ファイルが見つかりません');
        return;
    }

    // デバッグ: タスク一覧を確認
    console.log('プロジェクトタスク:', projectTasks);
    console.log('タスク数:', projectTasks.length);

    // タスクが読み込まれていない場合、再読み込み
    if (!projectTasks || projectTasks.length === 0) {
        console.log('タスクが読み込まれていないため、再読み込みします');
        await loadProjectTasks();
        console.log('再読み込み後のタスク数:', projectTasks.length);
    }

    const options = [
        '<option value="">🔗 紐付きなし</option>',
        ...projectTasks.map((task, index) => {
            const taskNumber = index + 1;
            const selected = file.task_id === task.id ? 'selected' : '';
            return `<option value="${task.id}" ${selected}>タスク#${taskNumber}: ${escapeHtml(task.title)}</option>`;
        })
    ].join('');

    const currentTaskInfo = getTaskInfo(file.task_id);
    const currentTaskText = currentTaskInfo.task
        ? `タスク#${currentTaskInfo.number}: ${currentTaskInfo.task.title}`
        : '紐付きなし';

    const result = await new Promise((resolve) => {
        const modalHtml = `
            <div class="modal-overlay" id="task-change-modal" style="display: flex;">
                <div class="modal-content" style="max-width: 500px;">
                    <div class="modal-header">
                        <h3>📌 タスクを変更</h3>
                        <button class="btn-icon" onclick="document.getElementById('task-change-modal').remove()">✕</button>
                    </div>
                    <div style="padding: 20px;">
                        <p style="margin-bottom: 12px;"><strong>ファイル:</strong> ${escapeHtml(file.file_name)}</p>
                        <p style="margin-bottom: 12px;"><strong>現在のタスク:</strong> ${currentTaskText}</p>
                        <div class="form-group">
                            <label for="task-change-select">新しいタスク:</label>
                            <select id="task-change-select" class="form-control" style="width: 100%; padding: 10px; border-radius: 8px;">
                                ${options}
                            </select>
                        </div>
                    </div>
                    <div class="modal-actions">
                        <button class="btn btn-secondary" onclick="document.getElementById('task-change-modal').remove()">キャンセル</button>
                        <button class="btn btn-primary" id="task-change-confirm">変更</button>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHtml);

        document.getElementById('task-change-confirm').addEventListener('click', () => {
            const newTaskId = document.getElementById('task-change-select').value || null;
            document.getElementById('task-change-modal').remove();
            resolve(newTaskId);
        });
    });

    if (result !== undefined) {
        await handleProjectFileTaskChange(fileId, result);
    }
}

// タスク変更を実行
async function handleProjectFileTaskChange(fileId, newTaskId) {
    try {
        const { error } = await supabase
            .from('project_files')
            .update({ task_id: newTaskId })
            .eq('id', fileId);

        if (error) {
            throw error;
        }

        notifyProjectFiles('タスクを変更しました', 'success');
        await loadProjectFiles();
    } catch (error) {
        console.error('タスク変更エラー:', error);
        notifyProjectFiles(`タスクの変更に失敗しました: ${error.message}`, 'error');
    }
}

async function handleProjectFileMemoSave(fileId) {
    const textarea = document.querySelector(`.project-file-memo-input[data-file-id="${fileId}"]`);
    const statusLabel = document.getElementById(`project-file-memo-status-${fileId}`);
    const saveButton = document.querySelector(`.project-file-memo-save[data-file-id="${fileId}"]`);
    if (!textarea) return;

    const memoText = textarea.value.trim();

    try {
        if (statusLabel) {
            statusLabel.textContent = '保存中...';
        }
        if (saveButton) {
            saveButton.disabled = true;
        }

        const { error } = await supabase
            .from('project_files')
            .update({ memo: memoText })
            .eq('id', fileId);

        if (error) {
            throw error;
        }

        await loadProjectFiles();

        if (statusLabel) {
            statusLabel.textContent = '保存しました';
            setTimeout(() => {
                statusLabel.textContent = '';
            }, 2000);
        }
        notifyProjectFiles('メモを保存しました', 'success');
    } catch (error) {
        console.error('メモ保存エラー:', error);
        if (statusLabel) {
            statusLabel.textContent = '保存に失敗しました';
        }
        notifyProjectFiles(`メモの保存に失敗しました: ${error.message}`, 'error');
    }
    finally {
        if (saveButton) {
            saveButton.disabled = false;
        }
    }
}

function sanitizeFileName(name) {
    return name.replace(/[^a-zA-Z0-9_.()\-]/g, '_');
}

function formatFileSize(size) {
    if (!size && size !== 0) return '-';
    if (size >= 1024 * 1024) {
        return `${(size / (1024 * 1024)).toFixed(1)} MB`;
    }
    if (size >= 1024) {
        return `${(size / 1024).toFixed(1)} KB`;
    }
    return `${size} B`;
}

function formatDateTime(value) {
    if (!value) return '-';
    try {
        return new Date(value).toLocaleString('ja-JP');
    } catch (error) {
        return value;
    }
}

function getFileTypeLabel(type) {
    if (type === 'application/pdf') return 'PDF';
    if (type === 'image/jpeg') return 'JPEG';
    return type || 'ファイル';
}

function getUploaderName(uploader) {
    if (!uploader) return '不明';
    return uploader.display_name || uploader.username || (uploader.email ? uploader.email.split('@')[0] : '不明');
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function notifyProjectFiles(message, type = 'info') {
    if (typeof showNotification === 'function') {
        showNotification(message, type);
    } else {
        console.log(`[${type}] ${message}`);
    }
}

function getPublicUrlFallback(path) {
    if (!path) return '#';
    const { data } = supabase.storage
        .from('project-files')
        .getPublicUrl(path);
    return data?.publicUrl || '#';
}

async function compressImageIfNeeded(file) {
    if (file.type !== 'image/jpeg') {
        return file;
    }

    if (file.size <= PROJECT_FILE_TARGET_SIZE) {
        return file;
    }

    const image = await loadImageFromFile(file);
    const scale = Math.min(
        PROJECT_FILE_MAX_IMAGE_DIMENSION / Math.max(image.width, image.height),
        1
    );

    const canvas = document.createElement('canvas');
    canvas.width = Math.round(image.width * scale);
    canvas.height = Math.round(image.height * scale);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

    let quality = 0.75;
    let blob = await canvasToBlob(canvas, 'image/jpeg', quality);
    while (blob.size > PROJECT_FILE_TARGET_SIZE && quality > 0.45) {
        quality -= 0.1;
        blob = await canvasToBlob(canvas, 'image/jpeg', quality);
    }

    return new File([blob], ensureJpegExtension(file.name), { type: 'image/jpeg' });
}

function ensureJpegExtension(name) {
    return name.replace(/\.[^.]+$/, '').concat('.jpg');
}

function loadImageFromFile(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = reject;
            img.src = reader.result;
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

function canvasToBlob(canvas, type, quality) {
    return new Promise((resolve, reject) => {
        canvas.toBlob((blob) => {
            if (blob) {
                resolve(blob);
            } else {
                reject(new Error('画像の圧縮に失敗しました'));
            }
        }, type, quality);
    });
}

function initializeProjectFilesUI() {
    const uploadBtn = document.getElementById('project-files-upload-btn');
    const fileInput = document.getElementById('project-files-input');
    const filterSelect = document.getElementById('project-files-filter');
    const sortSelect = document.getElementById('project-files-sort');

    if (uploadBtn && !uploadBtn.dataset.listenerAttached) {
        uploadBtn.addEventListener('click', () => {
            if (!canManageProjectFiles()) return;
            if (fileInput) {
                fileInput.click();
            }
        });
        uploadBtn.dataset.listenerAttached = 'true';
    }

    if (fileInput && !fileInput.dataset.listenerAttached) {
        fileInput.addEventListener('change', handleProjectFilesInputChange);
        fileInput.dataset.listenerAttached = 'true';
    }

    if (filterSelect && !filterSelect.dataset.listenerAttached) {
        filterSelect.addEventListener('change', (event) => {
            projectFilesFilterOption = event.target.value;
            renderProjectFiles();
        });
        filterSelect.dataset.listenerAttached = 'true';
    }

    if (sortSelect && !sortSelect.dataset.listenerAttached) {
        sortSelect.addEventListener('change', (event) => {
            projectFilesSortOption = event.target.value;
            renderProjectFiles();
        });
        sortSelect.dataset.listenerAttached = 'true';
    }

    const taskFilterSelect = document.getElementById('project-files-task-filter');
    if (taskFilterSelect && !taskFilterSelect.dataset.listenerAttached) {
        taskFilterSelect.addEventListener('change', (event) => {
            projectFilesTaskFilter = event.target.value;
            renderProjectFiles();
        });
        taskFilterSelect.dataset.listenerAttached = 'true';
    }

    renderProjectFiles();
}

function subscribeToProjectFiles() {
    if (!appState.currentProject) return;

    const channel = supabase
        .channel(`project-files-${appState.currentProject.id}`)
        .on('postgres_changes', {
            event: '*',
            schema: 'public',
            table: 'project_files',
            filter: `project_id=eq.${appState.currentProject.id}`
        }, () => {
            loadProjectFiles();
        })
        .subscribe();

    appState.subscriptions.push(channel);
}

// タスクの変更を監視してファイル表示を更新
function subscribeToProjectTasks() {
    if (!appState.currentProject) return;

    const channel = supabase
        .channel(`project-files-tasks-${appState.currentProject.id}`)
        .on('postgres_changes', {
            event: '*',
            schema: 'public',
            table: 'tasks',
            filter: `project_id=eq.${appState.currentProject.id}`
        }, async () => {
            console.log('タスクが変更されました。ファイル表示を更新します');
            await loadProjectTasks();
            renderProjectFiles();
        })
        .subscribe();

    appState.subscriptions.push(channel);
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeProjectFilesUI);
} else {
    initializeProjectFilesUI();
}

window.loadProjectFiles = loadProjectFiles;
window.renderProjectFiles = renderProjectFiles;
window.subscribeToProjectFiles = subscribeToProjectFiles;
window.subscribeToProjectTasks = subscribeToProjectTasks;
