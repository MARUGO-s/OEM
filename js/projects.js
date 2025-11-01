// プロジェクト管理機能
// 複数プロジェクト対応のための機能を提供

// グローバルなプロジェクト状態
window.currentProject = null;

// プロジェクト一覧を取得
async function loadProjects() {
    try {
        const { data: memberData, error: memberError } = await supabase
            .from('project_members')
            .select(`
                project_id,
                role,
                projects (
                    id,
                    name,
                    description,
                    created_by,
                    created_at,
                    updated_at
                )
            `)
            .eq('user_id', appState.currentUser.id);

        if (memberError) throw memberError;

        const projects = memberData.map(item => ({
            ...item.projects,
            role: item.role
        }));

        return projects;
    } catch (error) {
        console.error('プロジェクトの読み込みエラー:', error);
        return [];
    }
}

// プロジェクト一覧を表示
async function displayProjects() {
    const projectsList = document.getElementById('projects-list');
    const projects = await loadProjects();

    if (!projects || projects.length === 0) {
        projectsList.innerHTML = `
            <div style="text-align: center; padding: 3rem; color: var(--text-secondary);">
                <p style="font-size: 1.2rem; margin-bottom: 1rem;">プロジェクトがありません</p>
                <p>「新規プロジェクト作成」ボタンから最初のプロジェクトを作成してください</p>
            </div>
        `;
        return;
    }

    projectsList.innerHTML = projects.map(project => `
        <div class="project-card" data-project-id="${project.id}">
            <div class="project-card-header">
                <div>
                    <h3 class="project-card-title">${escapeHtml(project.name)}</h3>
                    <span class="project-card-role ${project.role}">${getRoleLabel(project.role)}</span>
                </div>
            </div>
            <p class="project-card-description">${escapeHtml(project.description || '説明なし')}</p>
            <div class="project-card-meta">
                <div>作成日: ${formatDate(project.created_at)}</div>
            </div>
            <div class="project-card-actions">
                <button class="btn btn-primary btn-sm select-project-btn" data-project-id="${project.id}">
                    開く
                </button>
                ${project.role === 'owner' ? `
                    <button class="btn btn-danger btn-sm delete-project-btn" data-project-id="${project.id}">
                        削除
                    </button>
                ` : ''}
            </div>
        </div>
    `).join('');

    // プロジェクト選択イベント
    document.querySelectorAll('.select-project-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const projectId = e.target.dataset.projectId;
            await selectProject(projectId);
        });
    });

    // プロジェクト削除イベント
    document.querySelectorAll('.delete-project-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const projectId = e.target.dataset.projectId;
            await deleteProject(projectId);
        });
    });
}

// プロジェクトを選択してメイン画面へ遷移
async function selectProject(projectId) {
    try {
        // プロジェクト情報を取得
        const { data, error } = await supabase
            .from('projects')
            .select('*')
            .eq('id', projectId)
            .single();

        if (error) throw error;

        // 現在のプロジェクトを設定
        window.currentProject = data;
        sessionStorage.setItem('currentProjectId', projectId);
        sessionStorage.setItem('currentProjectName', data.name);

        // メイン画面に遷移
        showScreen('main-screen');

        // ヘッダーにプロジェクト名を表示
        const headerTitle = document.querySelector('.app-header h1');
        if (headerTitle) {
            headerTitle.innerHTML = `🍽️ MARUGO OEM<br>${escapeHtml(data.name)}`;
        }

        // データを読み込み
        if (typeof loadAllData === 'function') {
            await loadAllData();
        }
    } catch (error) {
        console.error('プロジェクト選択エラー:', error);
        alert('プロジェクトを開けませんでした');
    }
}

// 新規プロジェクトを作成
async function createProject(name, description) {
    try {
        // プロジェクトを作成
        const { data: project, error: projectError } = await supabase
            .from('projects')
            .insert([{
                name: name,
                description: description,
                created_by: appState.currentUser.id
            }])
            .select()
            .single();

        if (projectError) throw projectError;

        // プロジェクトメンバーとして自分を追加（owner）
        const { error: memberError } = await supabase
            .from('project_members')
            .insert([{
                project_id: project.id,
                user_id: appState.currentUser.id,
                role: 'owner'
            }]);

        if (memberError) throw memberError;

        return project;
    } catch (error) {
        console.error('プロジェクト作成エラー:', error);
        throw error;
    }
}

// プロジェクトを削除
async function deleteProject(projectId) {
    if (!confirm('このプロジェクトを削除してもよろしいですか？\n※プロジェクト内のすべてのデータが削除されます')) {
        return;
    }

    try {
        const { error } = await supabase
            .from('projects')
            .delete()
            .eq('id', projectId);

        if (error) throw error;

        alert('プロジェクトを削除しました');
        await displayProjects();
    } catch (error) {
        console.error('プロジェクト削除エラー:', error);
        alert('プロジェクトの削除に失敗しました');
    }
}

// ロール名を日本語に変換
function getRoleLabel(role) {
    const roleLabels = {
        'owner': 'オーナー',
        'admin': '管理者',
        'member': 'メンバー',
        'viewer': '閲覧者'
    };
    return roleLabels[role] || role;
}

// 日付をフォーマット
function formatDate(dateString) {
    if (!dateString) return '不明';
    const date = new Date(dateString);
    return date.toLocaleDateString('ja-JP', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    });
}

// HTMLエスケープ
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// プロジェクト選択画面を初期化
function initProjectSelectScreen() {
    // ユーザー名を表示
    const projectUserName = document.getElementById('project-user-name');
    if (projectUserName && appState.currentUser) {
        projectUserName.textContent = appState.currentUser.username || appState.currentUser.email;
    }

    // プロジェクト一覧を読み込み
    displayProjects();

    // 新規プロジェクト作成ボタン
    const createProjectBtn = document.getElementById('create-project-btn');
    const createProjectForm = document.getElementById('create-project-form');
    const closeCreateProject = document.getElementById('close-create-project');
    const cancelCreateProject = document.getElementById('cancel-create-project');
    const newProjectForm = document.getElementById('new-project-form');

    createProjectBtn?.addEventListener('click', () => {
        createProjectForm.style.display = 'flex';
    });

    closeCreateProject?.addEventListener('click', () => {
        createProjectForm.style.display = 'none';
        newProjectForm.reset();
    });

    cancelCreateProject?.addEventListener('click', () => {
        createProjectForm.style.display = 'none';
        newProjectForm.reset();
    });

    // フォーム送信
    newProjectForm?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = document.getElementById('new-project-name').value.trim();
        const description = document.getElementById('new-project-description').value.trim();

        if (!name) {
            alert('プロジェクト名を入力してください');
            return;
        }

        try {
            await createProject(name, description);
            alert('プロジェクトを作成しました');
            createProjectForm.style.display = 'none';
            newProjectForm.reset();
            await displayProjects();
        } catch (error) {
            alert('プロジェクトの作成に失敗しました');
        }
    });

    // ログアウトボタン
    const projectLogoutBtn = document.getElementById('project-logout-btn');
    projectLogoutBtn?.addEventListener('click', () => {
        sessionStorage.removeItem('currentUser');
        sessionStorage.removeItem('currentProjectId');
        sessionStorage.removeItem('currentProjectName');
        appState.currentUser = null;
        window.currentProject = null;
        showScreen('login-screen');
    });
}

// 画面切り替え
function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(screen => {
        screen.classList.remove('active');
    });
    const targetScreen = document.getElementById(screenId);
    if (targetScreen) {
        targetScreen.classList.add('active');
    }
}
