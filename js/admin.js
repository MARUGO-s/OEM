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

    // 権限変更モーダルの要素を取得
    const changeRoleModal = document.getElementById('change-role-modal');
    const changeRoleForm = document.getElementById('change-role-form');
    const closeChangeRoleModal = document.getElementById('close-change-role-modal');
    const cancelChangeRole = document.getElementById('cancel-change-role');

    // 管理画面を開く
    adminPanelBtn?.addEventListener('click', () => {
        adminPanel.classList.add('open');
        loadMembersList();
        loadAllUsersList();
        setupAdminPanelOutsideClick();
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
            // 「未招待」が選択された場合はプロジェクトメンバーから削除
            if (newRole === 'uninvited') {
                await handleRemoveMember(userId);
            } else {
                await updateMemberRole(userId, newRole);
            }
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

    // 権限変更モーダル外クリックで閉じる
    changeRoleModal?.addEventListener('click', (e) => {
        if (e.target === changeRoleModal) {
            changeRoleModal.classList.remove('active');
        }
    });

    // 管理画面を閉じる
    closeAdminPanel?.addEventListener('click', () => {
        closeAdminPanelFunction();
    });

    // ユーザー招待モーダルを開く
    inviteUserBtn?.addEventListener('click', () => {
        inviteUserModal.classList.add('active');
    });

    // ユーザー招待モーダルを閉じる
    const closeInviteModalHandler = () => {
        inviteUserModal?.classList.remove('active');
        const inviteUsernameInput = document.getElementById('invite-username');
        if (inviteUsernameInput) {
            inviteUsernameInput.readOnly = false;
            delete inviteUsernameInput.dataset.targetUserId;
        }
    };

    closeInviteModal?.addEventListener('click', closeInviteModalHandler);

    cancelInvite?.addEventListener('click', closeInviteModalHandler);

    // モーダル外クリックで閉じる
    inviteUserModal?.addEventListener('click', (e) => {
        if (e.target === inviteUserModal) {
            closeInviteModalHandler();
        }
    });

    // ユーザー招待フォーム送信
    inviteUserForm?.addEventListener('submit', async (e) => {
        e.preventDefault();
        await handleInviteUser(e);
    });

    adminPanel?.addEventListener('click', (e) => {
        if (e.target === adminPanel) {
            adminPanel.classList.remove('open');
        }
    });
}

// 管理画面の外側クリックで閉じる設定
let adminPanelOutsideClickHandler = null;

function setupAdminPanelOutsideClick() {
    // 既存のリスナーを削除
    if (adminPanelOutsideClickHandler) {
        document.removeEventListener('click', adminPanelOutsideClickHandler);
        adminPanelOutsideClickHandler = null;
    }

    // 新しいリスナーを追加
    adminPanelOutsideClickHandler = (e) => {
        const adminPanel = document.getElementById('admin-panel');
        if (!adminPanel || !adminPanel.classList.contains('open')) {
            return;
        }

        // モーダルが開いている場合は閉じない
        const changeRoleModal = document.getElementById('change-role-modal');
        const inviteUserModal = document.getElementById('invite-user-modal');

        if (changeRoleModal?.classList.contains('active') || inviteUserModal?.classList.contains('active')) {
            return;
        }

        // クリックされた要素が管理画面パネル内でない場合
        if (!adminPanel.contains(e.target) && !e.target.closest('#admin-panel-btn')) {
            closeAdminPanelFunction();
        }
    };

    // イベントリスナーを追加（少し遅延させて、開くボタンのクリックイベントが処理される前に実行されないようにする）
    setTimeout(() => {
        document.addEventListener('click', adminPanelOutsideClickHandler);
    }, 100);
}

// 管理画面を閉じる関数
function closeAdminPanelFunction() {
    const adminPanel = document.getElementById('admin-panel');
    if (adminPanel) {
        adminPanel.classList.remove('open');
    }
    
    // 外側クリックのリスナーを削除
    if (adminPanelOutsideClickHandler) {
        document.removeEventListener('click', adminPanelOutsideClickHandler);
        adminPanelOutsideClickHandler = null;
    }
}

// 管理者権限のチェック
async function checkAdminAccess() {
    try {
        console.log('🔍 管理者権限チェック開始');
        console.log('currentUser:', appState.currentUser);
        console.log('currentProject:', appState.currentProject);

        const adminPanelBtn = document.getElementById('admin-panel-btn');
        
        if (!appState.currentUser || !appState.currentProject) {
            console.log('❌ currentUserまたはcurrentProjectが未設定');
            // プロジェクトが選択されていない場合はボタンを非表示
            if (adminPanelBtn) {
                adminPanelBtn.style.display = 'none';
                console.log('❌ プロジェクト未選択のため管理画面ボタンを非表示');
            }
            return;
        }

        // 現在のユーザーがプロジェクトのオーナーまたは管理者かチェック
        // getUserRole関数を使用してロールを取得（RLSポリシーを考慮）
        let userRole = null;
        if (typeof getUserRole === 'function') {
            userRole = await getUserRole(appState.currentProject.id);
            console.log('getUserRole結果:', userRole);
            // appState.currentUserRoleも更新
            appState.currentUserRole = userRole;
        } else {
            // getUserRoleが利用できない場合のフォールバック
            const { data, error } = await supabase
                .from('project_members')
                .select('role')
                .eq('project_id', appState.currentProject.id)
                .eq('user_id', appState.currentUser.id)
                .maybeSingle();

            if (error) {
                console.error('ロール取得エラー:', error);
                throw error;
            }

            userRole = data?.role || null;
            console.log('project_membersデータ:', data);
        }

        const isAdmin = userRole === 'owner' || userRole === 'admin';
        console.log('isAdmin:', isAdmin, 'userRole:', userRole);
        console.log('adminPanelBtn:', adminPanelBtn);

        if (isAdmin && adminPanelBtn) {
            adminPanelBtn.style.display = 'inline-block';
            console.log('✅ 管理画面ボタンを表示');
        } else if (adminPanelBtn) {
            adminPanelBtn.style.display = 'none';
            console.log('❌ 管理画面ボタンを非表示 (userRole:', userRole, ')');
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
                user:user_profiles!user_id(id, username, display_name, email, test_password)
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
            const testPassword = member.user?.test_password || '未設定';
            const isOwner = member.role === 'owner';

            return `
                <div class="member-item">
                    <div class="member-info">
                        <div class="member-name">${escapeHtml(userName)}</div>
                        ${userEmail ? `<div class="member-email">${escapeHtml(userEmail)}</div>` : ''}
                        <div class="member-password" style="font-size: 0.75rem; color: #64748b; margin-top: 0.25rem;">
                            パスワード: <code class="edit-password-btn" data-user-id="${member.user_id}" style="background: #f1f5f9; padding: 0.125rem 0.25rem; border-radius: 0.25rem; cursor: pointer; user-select: none;" title="クリックして編集">${escapeHtml(testPassword)}</code>
                        </div>
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

        // 現在のプロジェクトのメンバー情報を取得（ロール情報も含む）
        console.log('📋 全ユーザー一覧: プロジェクトメンバーを取得中...', { projectId: appState.currentProject.id });
        const { data: members, error: membersError } = await supabase
            .from('project_members')
            .select('user_id, role')
            .eq('project_id', appState.currentProject.id);

        if (membersError) {
            console.error('プロジェクトメンバー取得エラー:', membersError);
        }

        console.log('取得したメンバー数:', members?.length || 0);
        console.log('取得したメンバー詳細:', members);

        const memberMap = new Map();
        members?.forEach(m => {
            memberMap.set(m.user_id, m.role);
            console.log(`  - user_id: ${m.user_id}, role: ${m.role}`);
        });
        const memberIds = new Set(memberMap.keys());
        
        console.log('メンバーIDセット:', Array.from(memberIds));

        // 現在のユーザーのロールを取得
        const currentUserMember = members?.find(m => m.user_id === appState.currentUser?.id);
        const currentUserRole = currentUserMember?.role || 'viewer';
        const canManage = currentUserRole === 'owner' || currentUserRole === 'admin';

        if (!users || users.length === 0) {
            allUsersList.innerHTML = '<p style="text-align: center; color: var(--text-secondary); padding: 2rem;">ユーザーがいません</p>';
            return;
        }

        allUsersList.innerHTML = users.map(user => {
            const userName = user.display_name || user.username || '不明';
            const userEmail = user.email || '';
            const testPassword = user.test_password || '未設定';
            const isMember = memberIds.has(user.id);
            const isCurrentUser = user.id === appState.currentUser.id;
            const memberRole = memberMap.get(user.id);
            
            // デバッグログ
            if (userEmail === 'pingus0428@gmail.com') {
                console.log('🔍 pingus0428@gmail.com のチェック:', {
                    userId: user.id,
                    isMember,
                    memberRole,
                    memberIds: Array.from(memberIds),
                    memberMap: Array.from(memberMap.entries())
                });
            }

            return `
                <div class="user-item">
                    <div class="user-info-item">
                        <div class="user-name">${escapeHtml(userName)}</div>
                        ${userEmail ? `<div class="user-email">${escapeHtml(userEmail)}</div>` : ''}
                        <div class="user-password" style="font-size: 0.75rem; color: #64748b; margin-top: 0.25rem;">
                            パスワード: <code class="edit-password-btn" data-user-id="${user.id}" style="background: #f1f5f9; padding: 0.125rem 0.25rem; border-radius: 0.25rem; cursor: pointer; user-select: none;" title="クリックして編集">${escapeHtml(testPassword)}</code>
                        </div>
                    </div>
                    <div class="user-actions">
                        ${isMember ? `<span class="user-role ${memberRole}" style="margin-right: 0.5rem;">${getRoleLabel(memberRole)}</span>` : '<span style="color: #94a3b8; font-size: 0.875rem; margin-right: 0.5rem;">未招待</span>'}
                        ${isCurrentUser ? '<span style="color: var(--text-secondary); font-size: 0.875rem; margin-right: 0.5rem;">自分</span>' : ''}
                        ${canManage ? `
                            ${isMember ? `
                                <button class="btn btn-sm btn-secondary change-role-btn" data-user-id="${user.id}" data-current-role="${memberRole}">
                                    変更
                                </button>
                            ` : `
                                <button class="btn btn-sm btn-primary invite-from-list-btn" data-user-id="${user.id}" data-username="${escapeHtml(userName)}">
                                    招待
                                </button>
                                ${!isCurrentUser ? `
                                    <button class="btn btn-sm btn-danger delete-user-btn" data-user-id="${user.id}" data-username="${escapeHtml(userName)}">
                                        削除
                                    </button>
                                ` : ''}
                            `}
                        ` : ''}
                    </div>
                </div>
            `;
        }).join('');

        // 全ユーザー一覧のイベントリスナーを追加
        attachAllUsersEventListeners();
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
    // 権限変更ボタン（既にリスナーが付いている場合はスキップ）
    document.querySelectorAll('.change-role-btn').forEach(btn => {
        if (!btn.dataset.listenerAttached) {
            btn.addEventListener('click', async (e) => {
                const userId = e.target.dataset.userId;
                const currentRole = e.target.dataset.currentRole;
                await showChangeRoleModal(userId, currentRole);
            });
            btn.dataset.listenerAttached = 'true';
        }
    });

    // メンバー削除ボタン（既にリスナーが付いている場合はスキップ）
    document.querySelectorAll('.remove-member-btn').forEach(btn => {
        if (!btn.dataset.listenerAttached) {
            btn.addEventListener('click', async (e) => {
                const userId = e.target.dataset.userId;
                await handleRemoveMember(userId);
            });
            btn.dataset.listenerAttached = 'true';
        }
    });

    // パスワード編集ボタン（既にリスナーが付いている場合はスキップ）
    document.querySelectorAll('.edit-password-btn').forEach(btn => {
        if (!btn.dataset.listenerAttached) {
            btn.addEventListener('click', async (e) => {
                const userId = e.target.dataset.userId;
                await handleEditPassword(userId);
            });
            btn.dataset.listenerAttached = 'true';
        }
    });
}

// 全ユーザー一覧のイベントリスナーを追加
function attachAllUsersEventListeners() {
    // 権限変更ボタン（メンバーの場合）
    document.querySelectorAll('.change-role-btn').forEach(btn => {
        if (!btn.dataset.listenerAttached) {
            btn.addEventListener('click', async (e) => {
                const userId = e.target.dataset.userId;
                const currentRole = e.target.dataset.currentRole;
                await showChangeRoleModal(userId, currentRole);
            });
            btn.dataset.listenerAttached = 'true';
        }
    });

    // メンバー削除ボタン
    document.querySelectorAll('.remove-member-btn').forEach(btn => {
        if (!btn.dataset.listenerAttached) {
            btn.addEventListener('click', async (e) => {
                const userId = e.target.dataset.userId;
                await handleRemoveMember(userId);
            });
            btn.dataset.listenerAttached = 'true';
        }
    });

    // 招待ボタン（未招待の場合）
    document.querySelectorAll('.invite-from-list-btn').forEach(btn => {
        if (!btn.dataset.listenerAttached) {
            btn.addEventListener('click', async (e) => {
                const userId = e.target.dataset.userId;
                const username = e.target.dataset.username;
                await showInviteFromListModal(userId, username);
            });
            btn.dataset.listenerAttached = 'true';
        }
    });

    // パスワード編集ボタン（既にリスナーが付いている場合はスキップ）
    document.querySelectorAll('.edit-password-btn').forEach(btn => {
        if (!btn.dataset.listenerAttached) {
            btn.addEventListener('click', async (e) => {
                const userId = e.target.dataset.userId;
                await handleEditPassword(userId);
            });
            btn.dataset.listenerAttached = 'true';
        }
    });

    // ユーザー削除ボタン
    document.querySelectorAll('.delete-user-btn').forEach(btn => {
        if (!btn.dataset.listenerAttached) {
            btn.addEventListener('click', async (e) => {
                const userId = e.target.dataset.userId;
                const username = e.target.dataset.username;
                await handleDeleteUser(userId, username);
            });
            btn.dataset.listenerAttached = 'true';
        }
    });
}

// 全ユーザー一覧から招待するモーダルを表示
async function showInviteFromListModal(userId, username) {
    const inviteUserModal = document.getElementById('invite-user-modal');
    const inviteUsernameInput = document.getElementById('invite-username');
    const inviteRoleSelect = document.getElementById('invite-role');

    if (!inviteUserModal || !inviteUsernameInput || !inviteRoleSelect) {
        alert('招待モーダルの要素が見つかりません');
        return;
    }

    // フォームにデータを設定
    inviteUsernameInput.value = username;
    inviteRoleSelect.value = 'member'; // デフォルトはメンバー（オーナー/管理者は必要に応じて選択可能）

    // モーダルを表示
    inviteUserModal.classList.add('active');

    // ユーザー名フィールドを読み取り専用にして、userIdを保存
    inviteUsernameInput.readOnly = true;
    inviteUsernameInput.dataset.targetUserId = userId;
}

// ユーザー招待処理
async function handleInviteUser(e) {
    try {
        const inviteUsernameInput = document.getElementById('invite-username');
        const username = inviteUsernameInput.value.trim();
        const role = document.getElementById('invite-role').value;
        const targetUserId = inviteUsernameInput.dataset.targetUserId;

        let userId;

        // userIdが設定されている場合はそれを使用（全ユーザー一覧から招待の場合）
        if (targetUserId) {
            userId = targetUserId;
        } else {
            // ユーザー名から検索（従来の方法）
            if (!username) {
                alert('ユーザー名を入力してください');
                return;
            }

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

            userId = user.id;
        }

        // プロジェクトメンバーを追加
        const { error: memberError } = await supabase
            .from('project_members')
            .insert([{
                project_id: appState.currentProject.id,
                user_id: userId,
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
        const inviteUserModal = document.getElementById('invite-user-modal');
        const inviteUserForm = document.getElementById('invite-user-form');
        
        if (inviteUserModal) inviteUserModal.classList.remove('active');
        if (inviteUserForm) {
            inviteUserForm.reset();
            // readOnlyを解除
            if (inviteUsernameInput) {
                inviteUsernameInput.readOnly = false;
                delete inviteUsernameInput.dataset.targetUserId;
            }
        }
        
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

// パスワード編集処理
async function handleEditPassword(userId) {
    try {
        // 現在のパスワードを取得
        const { data: user, error: fetchError } = await supabase
            .from('user_profiles')
            .select('test_password, username, display_name')
            .eq('id', userId)
            .maybeSingle();

        if (fetchError) throw fetchError;
        if (!user) {
            alert('ユーザーが見つかりません');
            return;
        }

        const currentPassword = user.test_password || '';
        const userName = user.display_name || user.username || '不明';

        // パスワードを入力してもらう
        const newPassword = prompt(`${userName} のテスト用パスワードを入力してください:`, currentPassword);

        if (newPassword === null) {
            // キャンセルされた場合
            return;
        }

        if (newPassword.trim() === '') {
            alert('パスワードを入力してください');
            return;
        }

        // パスワードを更新
        const { error: updateError } = await supabase
            .from('user_profiles')
            .update({ test_password: newPassword.trim() })
            .eq('id', userId);

        if (updateError) throw updateError;

        alert('パスワードを更新しました');

        // リストを再読み込み
        await loadMembersList();
        await loadAllUsersList();
    } catch (error) {
        console.error('パスワード更新エラー:', error);
        alert('パスワード更新に失敗しました: ' + error.message);
    }
}

// ユーザー削除処理
async function handleDeleteUser(userId, username) {
    try {
        if (!confirm(`本当に ${username} をシステムから完全に削除しますか？\nこの操作は取り消せません。`)) {
            return;
        }

        const { error } = await supabase
            .from('user_profiles')
            .delete()
            .eq('id', userId);

        if (error) throw error;

        alert('ユーザーを削除しました');
        await loadMembersList();
        await loadAllUsersList();
    } catch (error) {
        console.error('ユーザー削除エラー:', error);
        alert('削除に失敗しました: ' + error.message);
    }
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

