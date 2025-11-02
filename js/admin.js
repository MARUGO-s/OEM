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

    // 管理者権限のチェックとボタン表示
    checkAdminAccess();

    // 管理画面を開く
    adminPanelBtn?.addEventListener('click', () => {
        adminPanel.classList.add('open');
        loadMembersList();
        loadAllUsersList();
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
        if (!appState.currentUser || !appState.currentProject) {
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

        const isAdmin = data && (data.role === 'owner' || data.role === 'admin');
        const adminPanelBtn = document.getElementById('admin-panel-btn');

        if (isAdmin && adminPanelBtn) {
            adminPanelBtn.style.display = 'inline-block';
        } else if (adminPanelBtn) {
            adminPanelBtn.style.display = 'none';
        }
    } catch (error) {
        console.error('管理者権限チェックエラー:', error);
    }
}

// プロジェクトメンバー一覧を読み込む
async function loadMembersList() {
    try {
        const membersList = document.getElementById('members-list');
        if (!membersList || !appState.currentProject) return;

        const { data: members, error } = await supabase
            .from('project_members')
            .select(`
                *,
                user:user_profiles!user_id(id, username, display_name, email)
            `)
            .eq('project_id', appState.currentProject.id)
            .order('role', { ascending: false });

        if (error) throw error;

        if (!members || members.length === 0) {
            membersList.innerHTML = '<p style="text-align: center; color: var(--text-secondary); padding: 2rem;">メンバーがいません</p>';
            return;
        }

        membersList.innerHTML = members.map(member => {
            const userName = member.user?.display_name || member.user?.username || '不明';
            const userEmail = member.user?.email || '';
            const isOwner = member.role === 'owner';
            const canDelete = appState.currentUser.role === 'owner' || appState.currentUser.role === 'admin';

            return `
                <div class="member-item">
                    <div class="member-info">
                        <div class="member-name">${escapeHtml(userName)}</div>
                        ${userEmail ? `<div class="member-email">${escapeHtml(userEmail)}</div>` : ''}
                    </div>
                    <div class="member-role ${member.role}">${getRoleLabel(member.role)}</div>
                    <div class="member-actions">
                        ${!isOwner && canDelete ? `
                            <button class="btn btn-sm btn-secondary change-role-btn" data-user-id="${member.user_id}" data-current-role="${member.role}">
                                変更
                            </button>
                            <button class="btn btn-sm btn-danger remove-member-btn" data-user-id="${member.user_id}">
                                削除
                            </button>
                        ` : ''}
                    </div>
                </div>
            `;
        }).join('');

        // イベントリスナーを追加
        attachMemberEventListeners();
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
                        ${isMember ? '<span style="color: var(--text-secondary); font-size: 0.875rem;">メンバー</span>' : ''}
                        ${isCurrentUser ? '<span style="color: var(--text-secondary); font-size: 0.875rem;">自分</span>' : ''}
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

        const userName = member?.user?.display_name || member?.user?.username || '不明';
        const currentRoleLabel = getRoleLabel(currentRole);

        // シンプルな確認ダイアログ
        const roles = ['member', 'admin', 'viewer'];
        const roleLabels = {
            'member': 'メンバー',
            'admin': '管理者',
            'viewer': '閲覧者'
        };

        let options = '現在の権限: ' + currentRoleLabel + '\n\n新しい権限を選択してください:\n';
        roles.forEach((role, index) => {
            options += `${index + 1}. ${roleLabels[role]}\n`;
        });

        const newRoleIndex = prompt(options + '\n番号を入力:');
        
        if (newRoleIndex === null) return; // キャンセル

        const newRole = roles[parseInt(newRoleIndex) - 1];

        if (!newRole) {
            alert('無効な選択です');
            return;
        }

        if (newRole === currentRole) {
            alert('同じ権限が選択されています');
            return;
        }

        // 権限を更新
        await updateMemberRole(userId, newRole);
    } catch (error) {
        console.error('権限変更モーダル表示エラー:', error);
        alert('エラーが発生しました: ' + error.message);
    }
}

// メンバー権限を更新
async function updateMemberRole(userId, newRole) {
    try {
        const { error } = await supabase
            .from('project_members')
            .update({ role: newRole })
            .eq('project_id', appState.currentProject.id)
            .eq('user_id', userId);

        if (error) throw error;

        alert('権限を変更しました');
        await loadMembersList();
        await loadAllUsersList();
    } catch (error) {
        console.error('権限更新エラー:', error);
        alert('権限変更に失敗しました: ' + error.message);
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

