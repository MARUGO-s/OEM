// リアクション機能
// コメントへのリアクション（いいね、ハートなど）を管理

// リアクションの種類と絵文字のマッピング
const REACTION_TYPES = {
    thumbs_up: '👍',
    heart: '❤️',
    celebration: '🎉',
    eyes: '👀',
    rocket: '🚀',
    fire: '🔥'
};

// リアクションキャッシュ（パフォーマンス向上）
let reactionCache = new Map();

// リアクションを読み込み
async function loadReactions(commentId, commentType) {
    const cacheKey = `${commentType}_${commentId}`;

    try {
        const projectId = sessionStorage.getItem('currentProjectId');
        if (!projectId) {
            console.error('プロジェクトIDが設定されていません');
            return [];
        }

        const { data: reactions, error } = await supabase
            .from('comment_reactions')
            .select('*')
            .eq('comment_id', commentId)
            .eq('comment_type', commentType)
            .eq('project_id', projectId);

        if (error) {
            console.error('リアクション読み込みエラー:', error);
            return [];
        }

        // キャッシュに保存
        reactionCache.set(cacheKey, reactions || []);
        return reactions || [];
    } catch (error) {
        console.error('リアクション読み込み例外:', error);
        return [];
    }
}

// リアクションを追加
async function addReaction(commentId, commentType, reactionType) {
    try {
        if (!appState.currentUser || !appState.currentUser.id) {
            alert('リアクションするにはログインが必要です');
            return false;
        }

        const projectId = sessionStorage.getItem('currentProjectId');
        if (!projectId) {
            alert('プロジェクトが選択されていません');
            return false;
        }

        const newReaction = {
            comment_id: commentId,
            comment_type: commentType,
            user_id: appState.currentUser.id,
            reaction: reactionType,
            project_id: projectId
        };

        const { data, error } = await supabase
            .from('comment_reactions')
            .insert([newReaction])
            .select();

        if (error) {
            // 既に同じリアクションが存在する場合は削除（トグル動作）
            if (error.code === '23505') {
                return await removeReaction(commentId, commentType, reactionType);
            }
            console.error('リアクション追加エラー:', error);
            return false;
        }

        // キャッシュを更新
        const cacheKey = `${commentType}_${commentId}`;
        const cached = reactionCache.get(cacheKey) || [];
        reactionCache.set(cacheKey, [...cached, data[0]]);

        return true;
    } catch (error) {
        console.error('リアクション追加例外:', error);
        return false;
    }
}

// リアクションを削除
async function removeReaction(commentId, commentType, reactionType) {
    try {
        if (!appState.currentUser || !appState.currentUser.id) {
            return false;
        }

        const { error } = await supabase
            .from('comment_reactions')
            .delete()
            .eq('comment_id', commentId)
            .eq('comment_type', commentType)
            .eq('user_id', appState.currentUser.id)
            .eq('reaction', reactionType);

        if (error) {
            console.error('リアクション削除エラー:', error);
            return false;
        }

        // キャッシュを更新
        const cacheKey = `${commentType}_${commentId}`;
        const cached = reactionCache.get(cacheKey) || [];
        reactionCache.set(cacheKey, cached.filter(r =>
            !(r.user_id === appState.currentUser.id && r.reaction === reactionType)
        ));

        return true;
    } catch (error) {
        console.error('リアクション削除例外:', error);
        return false;
    }
}

// リアクション集計（reaction_type -> count のマップ）
function summarizeReactions(reactions) {
    const summary = {};
    const userMap = {};

    reactions.forEach(reaction => {
        if (!summary[reaction.reaction]) {
            summary[reaction.reaction] = 0;
            userMap[reaction.reaction] = [];
        }
        summary[reaction.reaction]++;
        userMap[reaction.reaction].push(reaction.user_id);
    });

    return { summary, userMap };
}

// リアクションUIを生成
function createReactionUI(commentId, commentType, reactions) {
    const { summary, userMap } = summarizeReactions(reactions);
    const currentUserId = appState.currentUser?.id;

    let html = `<div class="reaction-container" data-comment-id="${commentId}" data-comment-type="${commentType}" style="display: flex; flex-wrap: wrap; gap: 0.5rem; margin-top: 0.75rem; align-items: center;">`;

    // 既存のリアクションを表示
    Object.entries(REACTION_TYPES).forEach(([type, emoji]) => {
        const count = summary[type] || 0;
        const isActive = userMap[type]?.includes(currentUserId);

        if (count > 0) {
            html += `
                <button
                    class="reaction-btn ${isActive ? 'active' : ''}"
                    data-comment-id="${commentId}"
                    data-comment-type="${commentType}"
                    data-reaction="${type}"
                    style="
                        background: ${isActive ? '#dbeafe' : '#f1f5f9'};
                        border: 1px solid ${isActive ? '#3b82f6' : '#cbd5e1'};
                        color: ${isActive ? '#1e40af' : '#475569'};
                        padding: 0.25rem 0.5rem;
                        border-radius: 1rem;
                        font-size: 0.875rem;
                        cursor: pointer;
                        display: flex;
                        align-items: center;
                        gap: 0.25rem;
                        transition: all 0.2s;
                    "
                    onmouseover="this.style.transform='scale(1.1)'"
                    onmouseout="this.style.transform='scale(1)'"
                    title="${getUsernames(userMap[type]).join(', ')}"
                >
                    <span>${emoji}</span>
                    <span style="font-weight: 500;">${count}</span>
                </button>
            `;
        }
    });

    // リアクション追加ボタン
    html += `
        <button
            class="add-reaction-btn"
            data-comment-id="${commentId}"
            data-comment-type="${commentType}"
            style="
                background: transparent;
                border: 1px dashed #cbd5e1;
                color: #64748b;
                padding: 0.25rem 0.5rem;
                border-radius: 1rem;
                font-size: 0.875rem;
                cursor: pointer;
                transition: all 0.2s;
            "
            onmouseover="this.style.borderColor='#3b82f6'; this.style.color='#3b82f6'"
            onmouseout="this.style.borderColor='#cbd5e1'; this.style.color='#64748b'"
            title="リアクションを追加"
        >
            + 😊
        </button>
    `;

    html += '</div>';
    return html;
}

// リアクションピッカーを表示
function showReactionPicker(commentId, commentType, buttonElement) {
    // 既存のピッカーを削除
    const existingPicker = document.querySelector('.reaction-picker');
    if (existingPicker) {
        existingPicker.remove();
        return;
    }

    // ピッカーを作成
    const picker = document.createElement('div');
    picker.className = 'reaction-picker';
    picker.style.cssText = `
        position: absolute;
        background: white;
        border: 1px solid #cbd5e1;
        border-radius: 0.5rem;
        padding: 0.5rem;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        display: flex;
        gap: 0.5rem;
        z-index: 1000;
        animation: fadeIn 0.2s ease;
    `;

    Object.entries(REACTION_TYPES).forEach(([type, emoji]) => {
        const btn = document.createElement('button');
        btn.textContent = emoji;
        btn.style.cssText = `
            background: transparent;
            border: none;
            font-size: 1.5rem;
            cursor: pointer;
            padding: 0.25rem;
            border-radius: 0.25rem;
            transition: transform 0.2s;
        `;
        btn.onmouseover = () => btn.style.transform = 'scale(1.3)';
        btn.onmouseout = () => btn.style.transform = 'scale(1)';
        btn.onclick = async () => {
            const success = await addReaction(commentId, commentType, type);
            if (success) {
                // リアクションUIを更新
                await refreshReactionUI(commentId, commentType);
            }
            picker.remove();
        };
        picker.appendChild(btn);
    });

    // ボタンの位置にピッカーを配置
    const rect = buttonElement.getBoundingClientRect();
    picker.style.top = `${rect.top - picker.offsetHeight - 5}px`;
    picker.style.left = `${rect.left}px`;

    document.body.appendChild(picker);

    // 外部クリックで閉じる
    setTimeout(() => {
        document.addEventListener('click', function closePickerOnOutsideClick(e) {
            if (!picker.contains(e.target) && e.target !== buttonElement) {
                picker.remove();
                document.removeEventListener('click', closePickerOnOutsideClick);
            }
        });
    }, 100);
}

// リアクションUIを更新
async function refreshReactionUI(commentId, commentType) {
    const reactions = await loadReactions(commentId, commentType);
    const container = document.querySelector(`.reaction-container[data-comment-id="${commentId}"][data-comment-type="${commentType}"]`);

    if (container) {
        const newUI = createReactionUI(commentId, commentType, reactions);
        container.outerHTML = newUI;
        attachReactionListeners();
    }
}

// ユーザー名を取得（userIdsの配列からユーザー名の配列を返す）
function getUsernames(userIds) {
    if (!userIds || userIds.length === 0) return [];

    // appState.projectMembers からユーザー名を取得
    // TODO: プロジェクトメンバー情報を事前にロードしておく必要がある
    return userIds.map(id => {
        // 暫定的に現在のユーザーの場合は「あなた」と表示
        if (id === appState.currentUser?.id) return 'あなた';
        return 'ユーザー';
    });
}

// リアクションボタンのイベントリスナーを設定
function attachReactionListeners() {
    // リアクションボタンのクリック（トグル）
    document.querySelectorAll('.reaction-btn').forEach(btn => {
        if (!btn.dataset.listenerAttached) {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const commentId = btn.dataset.commentId;
                const commentType = btn.dataset.commentType;
                const reactionType = btn.dataset.reaction;

                const isActive = btn.classList.contains('active');
                let success;

                if (isActive) {
                    success = await removeReaction(commentId, commentType, reactionType);
                } else {
                    success = await addReaction(commentId, commentType, reactionType);
                }

                if (success) {
                    await refreshReactionUI(commentId, commentType);
                }
            });
            btn.dataset.listenerAttached = 'true';
        }
    });

    // リアクション追加ボタンのクリック
    document.querySelectorAll('.add-reaction-btn').forEach(btn => {
        if (!btn.dataset.listenerAttached) {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const commentId = btn.dataset.commentId;
                const commentType = btn.dataset.commentType;
                showReactionPicker(commentId, commentType, btn);
            });
            btn.dataset.listenerAttached = 'true';
        }
    });
}

// グローバル関数として公開
window.loadReactions = loadReactions;
window.addReaction = addReaction;
window.removeReaction = removeReaction;
window.createReactionUI = createReactionUI;
window.refreshReactionUI = refreshReactionUI;
window.attachReactionListeners = attachReactionListeners;
