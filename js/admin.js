// 管理画面機能

// 管理画面の初期化
function initAdminPanel() {
    const adminPanelBtn = document.getElementById('admin-panel-btn');
    const adminPanel = document.getElementById('admin-panel');
    const closeAdminPanel = document.getElementById('close-admin-panel');
    const inviteUserBtn = document.getElementById('invite-user-btn');
    const inviteUserModal = document.getElementById('invite-user-modal');
    const closeInviteModal = document.getElementById('close-invite-modal');
    const cancelInvite = document.getElementById('cancel-invite');
    const inviteUserForm = document.getElementById('invite-user-form');

    // 注意: checkAdminAccessは呼び出さない（projects.jsのselectProjectで呼び出される）

    // 管理画面パスワードモーダルの要素を取得
    const adminPasswordModal = document.getElementById('admin-password-modal');
    const adminPasswordForm = document.getElementById('admin-password-form');
    const closeAdminPasswordModal = document.getElementById('close-admin-password-modal');
    const cancelAdminPassword = document.getElementById('cancel-admin-password');
    const adminPasswordInput = document.getElementById('admin-password-input');

    // 権限変更モーダルの要素を取得
    const changeRoleModal = document.getElementById('change-role-modal');
    const changeRoleForm = document.getElementById('change-role-form');
    const closeChangeRoleModal = document.getElementById('close-change-role-modal');
    const cancelChangeRole = document.getElementById('cancel-change-role');

    // 管理画面を開く（パスワード認証付き）
    adminPanelBtn?.addEventListener('click', () => {
        if (adminPasswordModal) {
            adminPasswordModal.classList.add('active');
            if (adminPasswordInput) {
                adminPasswordInput.value = '';
                adminPasswordInput.focus();
            }
        } else {
            // パスワードモーダルがない場合は直接開く（フォールバック）
            adminPanel.classList.add('open');
            loadMembersList();
            loadAllUsersList();
        }
    });

    // パスワード認証フォーム
    adminPasswordForm?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const password = adminPasswordInput?.value;
        if (password === 'yoshito') {
            adminPasswordModal?.classList.remove('active');
            adminPanel.classList.add('open');
            loadMembersList();
            loadAllUsersList();
        } else {
            alert('パスワードが正しくありません');
            if (adminPasswordInput) {
                adminPasswordInput.value = '';
                adminPasswordInput.focus();
            }
        }
    });

    // パスワードモーダルを閉じる
    closeAdminPasswordModal?.addEventListener('click', () => {
        adminPasswordModal?.classList.remove('active');
    });

    cancelAdminPassword?.addEventListener('click', () => {
        adminPasswordModal?.classList.remove('active');
    });

    // 権限変更フォーム
    changeRoleForm?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const userId = changeRoleForm.dataset.userId;
        const newRole = document.getElementById('change-role-select')?.value;
        console.log('権限変更フォーム送信:', { userId, newRole });
        
        if (!userId) {
            alert('ユーザーIDが設定されていません');
            return;
        }
        
        if (!newRole) {
            alert('権限が選択されていません');
            return;
        }
        
        try {
            await updateMemberRole(userId, newRole);
            changeRoleModal?.classList.remove('active');
        } catch (error) {
            console.error('権限変更エラー:', error);
            alert('権限変更に失敗しました: ' + error.message);
        }
    });

    // 権限変更モーダルを閉じる
    closeChangeRoleModal?.addEventListener('click', () => {
        changeRoleModal?.classList.remove('active');
    });

    cancelChangeRole?.addEventListener('click', () => {
        changeRoleModal?.classList.remove('active');
    });

    // モーダル外クリックで閉じる
    adminPasswordModal?.addEventListener('click', (e) => {
        if (e.target === adminPasswordModal) {
            adminPasswordModal.classList.remove('active');
        }
    });

    changeRoleModal?.addEventListener('click', (e) => {
        if (e.target === changeRoleModal) {
            changeRoleModal.classList.remove('active');
        }
    });

    // 管理画面を閉じる
    closeAdminPanel?.addEventListener('click', () => {
        adminPanel.classList.remove('open');
    });

    // ユーザー招待モーダルを開く
    inviteUserBtn?.addEventListener('click', () => {
        inviteUserModal.classList.add('active');
    });

    // ユーザー招待モーダルを閉じる
    closeInviteModal?.addEventListener('click', () => {
        inviteUserModal.classList.remove('active');
    });

    cancelInvite?.addEventListener('click', () => {
        inviteUserModal.classList.remove('active');
    });

    // ユーザー招待フォーム送信
    inviteUserForm?.addEventListener('submit', async (e) => {
        e.preventDefault();
        await handleInviteUser(e);
    });

    // モーダル外クリックで閉じる
    inviteUserModal?.addEventListener('click', (e) => {
        if (e.target === inviteUserModal) {
            inviteUserModal.classList.remove('active');
        }
    });

    adminPanel?.addEventListener('click', (e) => {
        if (e.target === adminPanel) {
            adminPanel.classList.remove('open');
        }
    });
}

// 管理者権限のチェック
async function checkAdminAccess() {
    try {
        console.log('🔍 管理者権限チェック開始');
        console.log('currentUser:', appState.currentUser);
        console.log('currentProject:', appState.currentProject);

        if (!appState.currentUser || !appState.currentProject) {
            console.log('❌ currentUserまたはcurrentProjectが未設定');
            return;
        }

        // 現在のユーザーがプロジェクトのオーナーまたは管理者かチェック
        const { data, error } = await supabase
            .from('project_members')
            .select('role')
            .eq('project_id', appState.currentProject.id)
            .eq('user_id', appState.currentUser.id)
            .maybeSingle();

        if (error) throw error;

        console.log('project_membersデータ:', data);
        const isAdmin = data && (data.role === 'owner' || data.role === 'admin');
        console.log('isAdmin:', isAdmin);

        const adminPanelBtn = document.getElementById('admin-panel-btn');
        console.log('adminPanelBtn:', adminPanelBtn);

        if (isAdmin && adminPanelBtn) {
            adminPanelBtn.style.display = 'inline-block';
            console.log('✅ 管理画面ボタンを表示');
        } else if (adminPanelBtn) {
            adminPanelBtn.style.display = 'none';
            console.log('❌ 管理画面ボタンを非表示');
        }
    } catch (error) {
        console.error('管理者権限チェックエラー:', error);
    }
}

// プロジェクトメンバー一覧を読み込む
async function loadMembersList() {
    try {
        console.log('📋 loadMembersList開始');
        const membersList = document.getElementById('members-list');
        if (!membersList || !appState.currentProject) {
            console.log('❌ membersListまたはcurrentProjectが未設定');
            return;
        }

        console.log('データベースからメンバーを取得中...', { projectId: appState.currentProject.id });
        const { data: members, error } = await supabase
            .from('project_members')
            .select(`
                *,
                user:user_profiles!user_id(id, username, display_name, email)
            `)
            .eq('project_id', appState.currentProject.id)
            .order('role', { ascending: false });

        if (error) {
            console.error('メンバー取得エラー:', error);
            throw error;
        }

        console.log('取得したメンバー:', members);

        if (!members || members.length === 0) {
            membersList.innerHTML = '<p style="text-align: center; color: var(--text-secondary); padding: 2rem;">メンバーがいません</p>';
            return;
        }

        // 現在のユーザーのロールを取得
        const currentUserMember = members.find(m => m.user_id === appState.currentUser?.id);
        const currentUserRole = currentUserMember?.role || 'viewer';
        const canManage = currentUserRole === 'owner' || currentUserRole === 'admin';

        // 各メンバーのロールをログに出力（デバッグ用）
        members.forEach(member => {
            const userName = member.user?.display_name || member.user?.username || '不明';
            console.log(`  - ${userName}: ${member.role}`);
        });

        console.log('HTMLを更新します');
        membersList.innerHTML = members.map(member => {
            const userName = member.user?.display_name || member.user?.username || '不明';
            const userEmail = member.user?.email || '';
            const isOwner = member.role === 'owner';

            return `
                <div class="member-item">
                    <div class="member-info">
                        <div class="member-name">${escapeHtml(userName)}</div>
                        ${userEmail ? `<div class="member-email">${escapeHtml(userEmail)}</div>` : ''}
                    </div>
                    <div class="member-role ${member.role}">${getRoleLabel(member.role)}</div>
                    <div class="member-actions">
                        ${canManage ? `
                            <button class="btn btn-sm btn-secondary change-role-btn" data-user-id="${member.user_id}" data-current-role="${member.role}">
                                変更
                            </button>
                            ${!isOwner ? `
                                <button class="btn btn-sm btn-danger remove-member-btn" data-user-id="${member.user_id}">
                                    削除
                                </button>
                            ` : ''}
                        ` : ''}
                    </div>
                </div>
            `;
        }).join('');

        console.log('✅ HTML更新完了、イベントリスナーを追加します');
        // イベントリスナーを追加
        attachMemberEventListeners();
        console.log('✅ メンバーリストの読み込み完了');
    } catch (error) {
        console.error('メンバー一覧読み込みエラー:', error);
        const membersList = document.getElementById('members-list');
        if (membersList) {
            membersList.innerHTML = '<p style="text-align: center; color: var(--danger-color); padding: 2rem;">読み込みエラーが発生しました</p>';
        }
    }
}

// 全ユーザー一覧を読み込む
async function loadAllUsersList() {
    try {
        const allUsersList = document.getElementById('all-users-list');
        if (!allUsersList || !appState.currentProject) return;

        const { data: users, error } = await supabase
            .from('user_profiles')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(50);

        if (error) throw error;

        // 現在のプロジェクトのメンバーIDを取得
        const { data: members } = await supabase
            .from('project_members')
            .select('user_id')
            .eq('project_id', appState.currentProject.id);

        const memberIds = new Set(members?.map(m => m.user_id) || []);

        if (!users || users.length === 0) {
            allUsersList.innerHTML = '<p style="text-align: center; color: var(--text-secondary); padding: 2rem;">ユーザーがいません</p>';
            return;
        }

        allUsersList.innerHTML = users.map(user => {
            const userName = user.display_name || user.username || '不明';
            const userEmail = user.email || '';
            const isMember = memberIds.has(user.id);
            const isCurrentUser = user.id === appState.currentUser.id;

            return `
                <div class="user-item">
                    <div class="user-info-item">
                        <div class="user-name">${escapeHtml(userName)}</div>
                        ${userEmail ? `<div class="user-email">${escapeHtml(userEmail)}</div>` : ''}
                    </div>
                    <div class="user-actions">
                        ${isMember ? '<span style="color: var(--text-secondary); font-size: 0.875rem;">メンバー</span>' : '<span style="color: #94a3b8; font-size: 0.875rem;">未招待</span>'}
                        ${isCurrentUser ? '<span style="color: var(--text-secondary); font-size: 0.875rem; margin-left: 0.5rem;">自分</span>' : ''}
                    </div>
                </div>
            `;
        }).join('');
    } catch (error) {
        console.error('全ユーザー一覧読み込みエラー:', error);
        const allUsersList = document.getElementById('all-users-list');
        if (allUsersList) {
            allUsersList.innerHTML = '<p style="text-align: center; color: var(--danger-color); padding: 2rem;">読み込みエラーが発生しました</p>';
        }
    }
}

// メンバーイベントリスナーを追加
function attachMemberEventListeners() {
    // 権限変更ボタン
    document.querySelectorAll('.change-role-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const userId = e.target.dataset.userId;
            const currentRole = e.target.dataset.currentRole;
            await showChangeRoleModal(userId, currentRole);
        });
    });

    // メンバー削除ボタン
    document.querySelectorAll('.remove-member-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const userId = e.target.dataset.userId;
            await handleRemoveMember(userId);
        });
    });
}

// ユーザー招待処理
async function handleInviteUser(e) {
    try {
        const username = document.getElementById('invite-username').value.trim();
        const role = document.getElementById('invite-role').value;

        if (!username) {
            alert('ユーザー名を入力してください');
            return;
        }

        // ユーザーを検索
        const { data: user, error: userError } = await supabase
            .from('user_profiles')
            .select('*')
            .eq('username', username)
            .maybeSingle();

        if (userError) throw userError;

        if (!user) {
            alert('ユーザーが見つかりません');
            return;
        }

        // プロジェクトメンバーを追加
        const { error: memberError } = await supabase
            .from('project_members')
            .insert([{
                project_id: appState.currentProject.id,
                user_id: user.id,
                role: role
            }]);

        if (memberError) {
            if (memberError.code === '23505') {
                alert('このユーザーは既にメンバーです');
            } else {
                throw memberError;
            }
            return;
        }

        alert('ユーザーを招待しました');
        document.getElementById('invite-user-modal').classList.remove('active');
        document.getElementById('invite-user-form').reset();
        await loadMembersList();
        await loadAllUsersList();
    } catch (error) {
        console.error('ユーザー招待エラー:', error);
        alert('招待に失敗しました: ' + error.message);
    }
}

// メンバー削除処理
async function handleRemoveMember(userId) {
    try {
        if (!confirm('本当にこのメンバーを削除しますか？')) {
            return;
        }

        const { error } = await supabase
            .from('project_members')
            .delete()
            .eq('project_id', appState.currentProject.id)
            .eq('user_id', userId);

        if (error) throw error;

        alert('メンバーを削除しました');
        await loadMembersList();
        await loadAllUsersList();
    } catch (error) {
        console.error('メンバー削除エラー:', error);
        alert('削除に失敗しました: ' + error.message);
    }
}

// 権限変更モーダルを表示
async function showChangeRoleModal(userId, currentRole) {
    try {
        // ユーザー情報を取得
        const { data: member, error } = await supabase
            .from('project_members')
            .select(`
                *,
                user:user_profiles!user_id(username, display_name)
            `)
            .eq('project_id', appState.currentProject.id)
            .eq('user_id', userId)
            .maybeSingle();

        if (error) throw error;

        if (!member) {
            alert('メンバー情報が見つかりません');
            return;
        }

        const userName = member?.user?.display_name || member?.user?.username || '不明';
        const changeRoleModal = document.getElementById('change-role-modal');
        const changeRoleForm = document.getElementById('change-role-form');
        const changeRoleUserName = document.getElementById('change-role-user-name');
        const changeRoleSelect = document.getElementById('change-role-select');

        if (!changeRoleModal || !changeRoleForm || !changeRoleUserName || !changeRoleSelect) {
            alert('権限変更モーダルの要素が見つかりません');
            return;
        }

        // フォームにデータを設定
        changeRoleUserName.value = userName;
        changeRoleSelect.value = currentRole;
        changeRoleForm.dataset.userId = userId;
        console.log('権限変更モーダル設定:', { userId, userName, currentRole });

        // モーダルを表示
        changeRoleModal.classList.add('active');
    } catch (error) {
        console.error('権限変更モーダル表示エラー:', error);
        alert('エラーが発生しました: ' + error.message);
    }
}

// メンバー権限を更新
async function updateMemberRole(userId, newRole) {
    try {
        console.log('権限更新開始:', { userId, newRole, projectId: appState.currentProject?.id });
        
        const { data, error } = await supabase
            .from('project_members')
            .update({ role: newRole })
            .eq('project_id', appState.currentProject.id)
            .eq('user_id', userId)
            .select();

        if (error) {
            console.error('Supabase権限更新エラー:', error);
            throw error;
        }

        console.log('権限更新成功:', data);
        
        // 更新を確実に反映させるため、少し待機してから再読み込み
        await new Promise(resolve => setTimeout(resolve, 300));
        
        alert('権限を変更しました');
        
        // メンバーリストを再読み込み（明示的にキャッシュを無効化）
        console.log('メンバーリストを再読み込みします');
        await loadMembersList();
        await loadAllUsersList();
        
        console.log('メンバーリストの再読み込み完了');
    } catch (error) {
        console.error('権限更新エラー:', error);
        alert('権限変更に失敗しました: ' + error.message);
        throw error; // エラーを再スローして呼び出し元で処理できるようにする
    }
}

// ロールラベルの取得
function getRoleLabel(role) {
    const labels = {
        'owner': 'オーナー',
        'admin': '管理者',
        'member': 'メンバー',
        'viewer': '閲覧者'
    };
    return labels[role] || role;
}

// HTMLエスケープ
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// 初期化を実行
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAdminPanel);
} else {
    initAdminPanel();
}

