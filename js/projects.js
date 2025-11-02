// プロジェクト管理機能
// 複数プロジェクト対応のための機能を提供

// グローバルなプロジェクト状態
window.currentProject = null;

// プロジェクト一覧を取得
async function loadProjects(retryCount = 0) {
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

        // データベースの反映遅延に対応するため、プロジェクト作成直後の場合は少し待機して再試行
        // 最大2回まで再試行（合計3回試行）
        if (retryCount < 2 && (!memberData || memberData.length === 0)) {
            console.log(`🔄 プロジェクト一覧が空です。待機してから再試行します... (${retryCount + 1}/2)`);
            await new Promise(resolve => setTimeout(resolve, 500));
            return await loadProjects(retryCount + 1);
        }

        // すべてのプロジェクトIDを取得
        const projectIds = memberData.map(item => item.project_id);

        // プロジェクトIDが空の場合はオーナーマップを空で返す
        if (!projectIds || projectIds.length === 0) {
            console.log('⚠️ プロジェクトIDが空です');
            const projects = memberData.map(item => ({
                ...item.projects,
                role: item.role,
                ownerName: '不明'
            }));
            return projects;
        }

        // すべてのプロジェクトのオーナーを一度に取得（project_membersテーブルからrole='owner'のユーザー）
        // joined_atで並び替え（新しい順）、emailも取得
        // RLSポリシーにより、自分のメンバーシップがあるプロジェクトのオーナーのみ取得可能
        console.log('📋 オーナー情報を取得中...', { projectIds, count: projectIds.length });
        const { data: allOwners, error: ownersError } = await supabase
            .from('project_members')
            .select(`
                project_id,
                joined_at,
                user:user_profiles!user_id(username, display_name, email)
            `)
            .in('project_id', projectIds)
            .eq('role', 'owner')
            .order('joined_at', { ascending: false }); // 新しい順（最後に追加された順）

        if (ownersError) {
            console.error('オーナー情報取得エラー:', ownersError);
            // エラーが発生してもプロジェクト一覧は表示する（オーナー名は「不明」になる）
        } else {
            console.log('✅ オーナー情報取得成功:', { count: allOwners?.length || 0, owners: allOwners });
        }

        // プロジェクトID -> オーナー名のマップを作成
        // pingus0428@gmail.comを除外し、最新のオーナーを優先
        const ownerMap = new Map();
        if (!ownersError && allOwners && allOwners.length > 0) {
            // プロジェクトごとにグループ化
            const ownersByProject = new Map();
            allOwners.forEach(owner => {
                const projectId = owner.project_id;
                if (!ownersByProject.has(projectId)) {
                    ownersByProject.set(projectId, []);
                }
                ownersByProject.get(projectId).push(owner);
            });

            // 各プロジェクトで、itagawaを最優先で表示（itagawaが存在する場合は必ずitagawaを表示）
            ownersByProject.forEach((owners, projectId) => {
                // itagawaを最優先で探す
                const itagawaOwner = owners.find(owner => 
                    owner.user?.username === 'itagawa'
                );

                if (itagawaOwner) {
                    // itagawaが見つかった場合は、必ずitagawaを表示
                    const ownerName = itagawaOwner.user?.display_name || 
                                     itagawaOwner.user?.username || 
                                     'itagawa';
                    ownerMap.set(projectId, ownerName);
                    return;
                }

                // itagawaがいない場合のみ、他のオーナーを表示
                // pingus0428@gmail.com以外の最新オーナーを優先
                const otherOwners = owners.filter(owner => 
                    owner.user?.email !== 'pingus0428@gmail.com'
                );

                let selectedOwner = null;
                if (otherOwners.length > 0) {
                    // pingus0428@gmail.com以外のオーナーがいる場合は、最新（最初の要素、既に新しい順で並び替え済み）を選択
                    selectedOwner = otherOwners[0];
                } else {
                    // pingus0428@gmail.comのみの場合は、pingus0428@gmail.comを表示
                    selectedOwner = owners.find(owner => 
                        owner.user?.email === 'pingus0428@gmail.com'
                    );
                }

                if (selectedOwner) {
                    const ownerName = selectedOwner.user?.display_name || 
                                     selectedOwner.user?.username || 
                                     '不明';
                    ownerMap.set(projectId, ownerName);
                }
            });
        }

        // プロジェクトデータにオーナー名を追加
        const projects = memberData.map(item => ({
            ...item.projects,
            role: item.role,
            ownerName: ownerMap.get(item.project_id) || '不明',
            // 作成者かどうかを判定（削除ボタンの表示条件に使用）
            isCreator: item.projects.created_by === appState.currentUser.id
        }));

        console.log('📋 プロジェクト一覧データ:', projects.map(p => ({
            id: p.id,
            name: p.name,
            role: p.role,
            ownerName: p.ownerName,
            isCreator: p.isCreator,
            created_by: p.created_by,
            currentUserId: appState.currentUser.id
        })));

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
                <div>📅 作成日: ${formatDate(project.created_at)}</div>
                <div>👤 オーナー: <strong>${escapeHtml(project.ownerName)}</strong></div>
            </div>
            <div class="project-card-actions">
                <button class="btn btn-primary btn-sm select-project-btn" data-project-id="${project.id}">
                    開く
                </button>
                ${project.role === 'owner' ? `
                    <button class="btn btn-danger btn-sm delete-project-btn" data-project-id="${project.id}" data-project-name="${escapeHtml(project.name)}">
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
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const projectId = e.target.dataset.projectId;
            const projectName = e.target.dataset.projectName;
            showDeleteProjectModal(projectId, projectName);
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
        appState.currentProject = data;
        sessionStorage.setItem('currentProjectId', projectId);
        sessionStorage.setItem('currentProjectName', data.name);

        // メイン画面に遷移
        showScreen('main-screen');

        // ヘッダーにプロジェクト名を表示
        const headerTitle = document.querySelector('.app-header h1');
        if (headerTitle) {
            headerTitle.innerHTML = `🍽️ MARUGO OEM<br>${escapeHtml(data.name)}`;
        }

        // ユーザー名を表示（メイン画面ヘッダー）
        const userNameElement = document.getElementById('user-name');
        if (userNameElement && appState.currentUser) {
            const username = appState.currentUser.display_name ||
                           appState.currentUser.username ||
                           appState.currentUser.email.split('@')[0];
            console.log('🏠 プロジェクト選択後にメイン画面のユーザー名を更新:', {
                display_name: appState.currentUser.display_name,
                username: appState.currentUser.username,
                email: appState.currentUser.email,
                finalUsername: username
            });
            userNameElement.textContent = username;
        }

        // 進行状況セクションのタイトルを更新
        const summaryTitle = document.getElementById('project-summary-title');
        if (summaryTitle) {
            summaryTitle.innerHTML = `📊 ${escapeHtml(data.name)}<br>進行状況`;
        }

        // 現在のユーザーのロールを取得して保存
        const userRole = await getUserRole(projectId);
        appState.currentUserRole = userRole;
        console.log('👤 現在のユーザーロール:', userRole);
        
        // 権限バッジを表示（メイン画面ヘッダー）
        const roleBadge = document.getElementById('user-role-badge');
        if (roleBadge && userRole) {
            roleBadge.textContent = getRoleLabel(userRole);
            roleBadge.className = `user-role-badge ${userRole}`;
            roleBadge.style.display = 'inline-block';
            console.log('👤 権限バッジを表示:', userRole);
        } else if (roleBadge) {
            roleBadge.style.display = 'none';
        }

        // データを読み込み
        if (typeof loadAllData === 'function') {
            await loadAllData();
        }

        // 管理画面のアクセス権限をチェック
        console.log('🔍 checkAdminAccess関数の存在チェック:', typeof checkAdminAccess);
        if (typeof checkAdminAccess === 'function') {
            console.log('✅ checkAdminAccessを呼び出します');
            await checkAdminAccess();
        } else {
            console.error('❌ checkAdminAccessが関数として見つかりません');
        }
    } catch (error) {
        console.error('プロジェクト選択エラー:', error);
        alert('プロジェクトを開けませんでした');
    }
}

// 新規プロジェクトを作成
// プロジェクト作成中のフラグ（二重実行を防ぐ）
let isCreatingProject = false;

async function createProject(name, description) {
    // 二重実行を防ぐ
    if (isCreatingProject) {
        console.warn('プロジェクト作成は既に実行中です');
        throw new Error('プロジェクト作成は既に実行中です。しばらくお待ちください。');
    }
    
    isCreatingProject = true;
    
    try {
        console.log('📝 プロジェクト作成開始:', { name, description });
        
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

        if (projectError) {
            console.error('プロジェクト作成エラー（Supabase）:', projectError);
            throw projectError;
        }
        
        console.log('✅ プロジェクト作成成功:', project.id);

        // pingus0428@gmail.com、itagawa、板川与志人のユーザーIDを取得
        const { data: ownerUsers, error: ownerUserError } = await supabase
            .from('user_profiles')
            .select('id, email, username, display_name')
            .or('email.eq.pingus0428@gmail.com,username.eq.itagawa,display_name.eq.板川与志人');

        if (ownerUserError) {
            console.error('オーナーユーザー取得エラー:', ownerUserError);
            throw new Error('オーナーユーザーの取得に失敗しました');
        }

        const pingus0428User = ownerUsers?.find(u => u.email === 'pingus0428@gmail.com');
        const itagawaUser = ownerUsers?.find(u => u.username === 'itagawa');
        const itakawayoshitoUser = ownerUsers?.find(u => u.display_name === '板川与志人');

        if (!pingus0428User) {
            throw new Error('pingus0428@gmail.com のユーザーが見つかりません');
        }

        if (!itagawaUser) {
            console.warn('⚠️ itagawa のユーザーが見つかりません。プロジェクト作成は続行します。');
        }

        if (!itakawayoshitoUser) {
            console.warn('⚠️ 板川与志人 のユーザーが見つかりません。プロジェクト作成は続行します。');
        }

        // プロジェクトメンバーを追加
        // 1. pingus0428@gmail.comを必ずオーナーとして追加
        // 2. itagawaを必ずオーナーとして追加（存在する場合）
        // 3. 板川与志人を必ずオーナーとして追加（存在する場合）
        // 4. 作成者を必ずメンバーとして追加
        // 既にメンバーが存在する場合はロールを更新

        const ownerUserIds = [pingus0428User.id];
        if (itagawaUser) {
            ownerUserIds.push(itagawaUser.id);
        }
        if (itakawayoshitoUser) {
            ownerUserIds.push(itakawayoshitoUser.id);
        }
        
        // 既存のメンバーをチェック
        const { data: existingMembers } = await supabase
            .from('project_members')
            .select('user_id, role')
            .eq('project_id', project.id)
            .in('user_id', [...ownerUserIds, appState.currentUser.id]);

        const existingMembersMap = new Map();
        existingMembers?.forEach(m => {
            existingMembersMap.set(m.user_id, m.role);
        });

        const membersToInsert = [];
        const membersToUpdate = [];
        
        // pingus0428@gmail.comを必ずオーナーとして追加または更新
        if (!existingMembersMap.has(pingus0428User.id)) {
            membersToInsert.push({
                project_id: project.id,
                user_id: pingus0428User.id,
                role: 'owner'
            });
        } else if (existingMembersMap.get(pingus0428User.id) !== 'owner') {
            // 既にメンバーだがロールがオーナーでない場合は更新
            membersToUpdate.push({
                userId: pingus0428User.id,
                role: 'owner'
            });
        }

        // itagawaを必ずオーナーとして追加または更新（存在する場合）
        if (itagawaUser) {
            if (!existingMembersMap.has(itagawaUser.id)) {
                membersToInsert.push({
                    project_id: project.id,
                    user_id: itagawaUser.id,
                    role: 'owner'
                });
            } else if (existingMembersMap.get(itagawaUser.id) !== 'owner') {
                // 既にメンバーだがロールがオーナーでない場合は更新
                membersToUpdate.push({
                    userId: itagawaUser.id,
                    role: 'owner'
                });
            }
        }

        // 板川与志人を必ずオーナーとして追加または更新（存在する場合）
        if (itakawayoshitoUser) {
            if (!existingMembersMap.has(itakawayoshitoUser.id)) {
                membersToInsert.push({
                    project_id: project.id,
                    user_id: itakawayoshitoUser.id,
                    role: 'owner'
                });
            } else if (existingMembersMap.get(itakawayoshitoUser.id) !== 'owner') {
                // 既にメンバーだがロールがオーナーでない場合は更新
                membersToUpdate.push({
                    userId: itakawayoshitoUser.id,
                    role: 'owner'
                });
            }
        }

        // 作成者を必ずメンバーとして追加または更新
        if (!existingMembersMap.has(appState.currentUser.id)) {
            membersToInsert.push({
                project_id: project.id,
                user_id: appState.currentUser.id,
                role: 'member'
            });
        } else if (existingMembersMap.get(appState.currentUser.id) !== 'member') {
            // 既にメンバーだがロールがメンバーでない場合は更新（オーナーにされている場合など）
            membersToUpdate.push({
                userId: appState.currentUser.id,
                role: 'member'
            });
        }

        // 追加すべきメンバーをINSERT
        if (membersToInsert.length > 0) {
            const { error: memberError } = await supabase
                .from('project_members')
                .insert(membersToInsert);

            if (memberError) {
                console.error('プロジェクトメンバー追加エラー:', memberError);
                // 23505エラー（重複キー）の場合は無視（既に追加されている可能性がある）
                if (memberError.code !== '23505') {
                    throw memberError;
                } else {
                    console.warn('メンバーが既に存在します（スキップ）:', memberError);
                }
            }
        }

        // 更新すべきメンバーのロールをUPDATE
        for (const member of membersToUpdate) {
            const { error: updateError } = await supabase
                .from('project_members')
                .update({ role: member.role })
                .eq('project_id', project.id)
                .eq('user_id', member.userId);

            if (updateError) {
                console.error(`ユーザー ${member.userId} のロール更新エラー:`, updateError);
                // 更新エラーは警告のみで続行（既に正しいロールの場合もある）
                console.warn('ロール更新をスキップします');
            }
        }

        // メンバー追加が完了したことを確認するために、少し待機してから検証
        // Supabaseのレプリケーション遅延に対応するため
        await new Promise(resolve => setTimeout(resolve, 500));

        // 作成者がメンバーとして正しく追加されているか確認
        const { data: creatorMembership } = await supabase
            .from('project_members')
            .select('user_id, role')
            .eq('project_id', project.id)
            .eq('user_id', appState.currentUser.id)
            .maybeSingle();

        if (!creatorMembership) {
            console.warn('⚠️ 作成者のメンバーシップがまだ反映されていません。再試行します...');
            // メンバーシップが見つからない場合、再度追加を試みる
            const { error: retryError } = await supabase
                .from('project_members')
                .insert([{
                    project_id: project.id,
                    user_id: appState.currentUser.id,
                    role: 'member'
                }]);
            
            if (retryError && retryError.code !== '23505') {
                console.error('作成者のメンバー追加再試行エラー:', retryError);
            } else if (!retryError) {
                console.log('✅ 作成者のメンバーシップを追加しました（再試行）');
                // 再追加後、もう少し待機
                await new Promise(resolve => setTimeout(resolve, 300));
            }
        } else {
            console.log('✅ 作成者のメンバーシップを確認:', creatorMembership);
        }

        console.log('✅ プロジェクト作成完了:', {
            projectId: project.id,
            owners: {
                pingus0428: pingus0428User.id,
                itagawa: itagawaUser?.id || 'not found',
                itakawayoshito: itakawayoshitoUser?.id || 'not found'
            },
            creator: appState.currentUser.id,
            creatorRole: 'member',
            creatorMembership: creatorMembership ? 'confirmed' : 'missing'
        });

        return project;
    } catch (error) {
        console.error('プロジェクト作成エラー:', error);
        throw error;
    } finally {
        // フラグをリセット
        isCreatingProject = false;
        console.log('🔄 プロジェクト作成フラグをリセット');
    }
}

// プロジェクト削除確認モーダルを表示
function showDeleteProjectModal(projectId, projectName) {
    const modal = document.getElementById('delete-project-modal');
    const projectNameEl = document.getElementById('delete-project-name');
    const confirmInput = document.getElementById('delete-confirmation-input');
    const confirmBtn = document.getElementById('confirm-delete-project');

    projectNameEl.textContent = projectName;
    confirmInput.value = '';
    confirmBtn.disabled = true;
    confirmBtn.dataset.projectId = projectId;

    modal.style.display = 'flex';
}

// プロジェクト削除中のフラグ（二重実行を防ぐ）
let isDeletingProject = false;

// プロジェクトを削除
async function deleteProject(projectId) {
    // 既に削除処理が実行中の場合はスキップ
    if (isDeletingProject) {
        console.warn('プロジェクト削除は既に実行中です');
        return;
    }

    isDeletingProject = true;
    
    try {
        // 削除ボタンを無効化
        const confirmDeleteProject = document.getElementById('confirm-delete-project');
        if (confirmDeleteProject) {
            confirmDeleteProject.disabled = true;
            confirmDeleteProject.textContent = '削除中...';
        }

        const { error } = await supabase
            .from('projects')
            .delete()
            .eq('id', projectId);

        if (error) throw error;

        // モーダルを閉じる
        const modal = document.getElementById('delete-project-modal');
        if (modal) {
            modal.style.display = 'none';
        }

        // プロジェクト一覧を再表示
        await displayProjects();

        // 削除完了メッセージ
        alert('プロジェクトを削除しました');
    } catch (error) {
        console.error('プロジェクト削除エラー:', error);
        alert('プロジェクトの削除に失敗しました');
        
        // エラー時もボタンを再有効化
        const confirmDeleteProject = document.getElementById('confirm-delete-project');
        if (confirmDeleteProject) {
            confirmDeleteProject.disabled = false;
            confirmDeleteProject.textContent = '削除する';
        }
    } finally {
        isDeletingProject = false;
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
        const displayName = appState.currentUser.display_name || appState.currentUser.username || appState.currentUser.email;
        console.log('👤 プロジェクト選択画面に表示するユーザー名:', {
            display_name: appState.currentUser.display_name,
            username: appState.currentUser.username,
            email: appState.currentUser.email,
            finalDisplayName: displayName
        });
        // モバイルでは短縮表示
        const isMobile = window.innerWidth <= 480;
        projectUserName.textContent = isMobile && displayName.length > 8 ? displayName.substring(0, 8) + '...' : displayName;
    } else {
        console.warn('⚠️ projectUserNameまたはappState.currentUserが未設定:', { projectUserName, currentUser: appState.currentUser });
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

    // フォーム送信（重複登録を防ぐ）
    if (newProjectForm && !newProjectForm.dataset.listenerAttached) {
        newProjectForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            // 二重送信を防ぐ
            const submitBtn = newProjectForm.querySelector('button[type="submit"]');
            if (submitBtn?.disabled) {
                console.log('プロジェクト作成処理は既に実行中です');
                return;
            }
            
            // ボタンを無効化
            if (submitBtn) {
                submitBtn.disabled = true;
                const originalText = submitBtn.textContent;
                submitBtn.textContent = '作成中...';
                
                try {
                    const name = document.getElementById('new-project-name').value.trim();
                    const description = document.getElementById('new-project-description').value.trim();

                    if (!name) {
                        alert('プロジェクト名を入力してください');
                        return;
                    }

                    await createProject(name, description);
                    
                    // プロジェクト一覧を更新（データベースの反映を待つため、少し待機）
                    await new Promise(resolve => setTimeout(resolve, 300));
                    
                    // プロジェクト一覧を再読み込み
                    await displayProjects();
                    
                    alert('プロジェクトを作成しました');
                    createProjectForm.style.display = 'none';
                    newProjectForm.reset();
                } catch (error) {
                    console.error('プロジェクト作成エラー:', error);
                    alert('プロジェクトの作成に失敗しました');
                } finally {
                    // ボタンを再有効化
                    if (submitBtn) {
                        submitBtn.disabled = false;
                        submitBtn.textContent = originalText;
                    }
                }
            }
        });
        newProjectForm.dataset.listenerAttached = 'true';
    }

    // ログアウトボタン
    const projectLogoutBtn = document.getElementById('project-logout-btn');
    projectLogoutBtn?.addEventListener('click', () => {
        sessionStorage.removeItem('currentUser');
        sessionStorage.removeItem('currentProjectId');
        sessionStorage.removeItem('currentProjectName');
        appState.currentUser = null;
        appState.currentProject = null;
        window.currentProject = null;
        showScreen('login-screen');
    });

    // 削除モーダルのイベントリスナー（重複登録を防ぐ）
    const deleteModal = document.getElementById('delete-project-modal');
    const closeDeleteProject = document.getElementById('close-delete-project');
    const cancelDeleteProject = document.getElementById('cancel-delete-project');
    const confirmDeleteProject = document.getElementById('confirm-delete-project');
    const deleteConfirmationInput = document.getElementById('delete-confirmation-input');

    // モーダルを閉じる（既にリスナーが付いている場合はスキップ）
    if (closeDeleteProject && !closeDeleteProject.dataset.listenerAttached) {
        closeDeleteProject.addEventListener('click', () => {
            deleteModal.style.display = 'none';
        });
        closeDeleteProject.dataset.listenerAttached = 'true';
    }

    if (cancelDeleteProject && !cancelDeleteProject.dataset.listenerAttached) {
        cancelDeleteProject.addEventListener('click', () => {
            deleteModal.style.display = 'none';
        });
        cancelDeleteProject.dataset.listenerAttached = 'true';
    }

    // 入力欄の監視（既にリスナーが付いている場合はスキップ）
    if (deleteConfirmationInput && !deleteConfirmationInput.dataset.listenerAttached) {
        deleteConfirmationInput.addEventListener('input', (e) => {
            const value = e.target.value.trim();
            if (confirmDeleteProject) {
                confirmDeleteProject.disabled = value !== 'delete';
            }
        });
        deleteConfirmationInput.dataset.listenerAttached = 'true';
    }

    // 削除実行（既にリスナーが付いている場合はスキップ）
    if (confirmDeleteProject && !confirmDeleteProject.dataset.listenerAttached) {
        confirmDeleteProject.addEventListener('click', async () => {
            const projectId = confirmDeleteProject.dataset.projectId;
            if (projectId) {
                await deleteProject(projectId);
            }
        });
        confirmDeleteProject.dataset.listenerAttached = 'true';
    }
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
