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
            .select(`
                *,
                user:user_profiles!user_id(username, display_name)
            `)
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
    const userNameMap = {};

    reactions.forEach(reaction => {
        if (!summary[reaction.reaction]) {
            summary[reaction.reaction] = 0;
            userMap[reaction.reaction] = [];
            userNameMap[reaction.reaction] = [];
        }
        summary[reaction.reaction]++;
        userMap[reaction.reaction].push(reaction.user_id);
        
        // ユーザー名を取得
        const userName = reaction.user?.username || reaction.user?.display_name || '不明';
        userNameMap[reaction.reaction].push(userName);
    });

    return { summary, userMap, userNameMap };
}

// リアクションUIを生成
function createReactionUI(commentId, commentType, reactions) {
    const { summary, userMap, userNameMap } = summarizeReactions(reactions);
    const currentUserId = appState.currentUser?.id;

    let html = `<div class="reaction-container" data-comment-id="${commentId}" data-comment-type="${commentType}" style="display: flex; flex-wrap: wrap; gap: 0.5rem; margin-top: 0.75rem; align-items: center;">`;

    // 既存のリアクションを表示
    Object.entries(REACTION_TYPES).forEach(([type, emoji]) => {
        const count = summary[type] || 0;
        const isActive = userMap[type]?.includes(currentUserId);
        const userNames = userNameMap[type] || [];

        if (count > 0) {
            html += `
                <div style="position: relative; display: inline-block;">
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
                            transition: transform 0.1s, opacity 0.1s;
                        "
                    >
                        <span>${emoji}</span>
                        <span style="font-weight: 500;">${count}</span>
                    </button>
                    <div class="reaction-tooltip" style="position: absolute; bottom: 100%; left: 50%; transform: translateX(-50%); margin-bottom: 0.25rem; padding: 0.5rem 0.75rem; background: #1f2937; color: white; border-radius: 0.375rem; font-size: 0.75rem; white-space: nowrap; pointer-events: none; opacity: 0; transition: opacity 0.1s; z-index: 1000;">
                        ${escapeHtml(userNames.join(', '))}
                        <div style="position: absolute; top: 100%; left: 50%; transform: translateX(-50%); width: 0; height: 0; border-left: 5px solid transparent; border-right: 5px solid transparent; border-top: 5px solid #1f2937;"></div>
                    </div>
                </div>
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
    console.log('🎨 showReactionPicker開始:', { commentId, commentType, buttonElement });
    
    // 既存のピッカーを削除
    const existingPicker = document.querySelector('.reaction-picker');
    if (existingPicker) {
        console.log('既存のピッカーを削除します');
        existingPicker.remove();
        // 既存のピッカーが閉じられただけの場合は終了しない（新しいピッカーを表示する）
        // return; // この行をコメントアウト
    }

    // ピッカーを作成
    const picker = document.createElement('div');
    picker.className = 'reaction-picker';
    picker.style.cssText = `
        position: fixed;
        background: white;
        border: 1px solid #cbd5e1;
        border-radius: 0.5rem;
        padding: 0.5rem;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        display: flex;
        gap: 0.5rem;
        z-index: 3000;
        animation: fadeIn 0.2s ease;
        pointer-events: auto;
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
            pointer-events: auto;
        `;
        btn.onmouseover = () => btn.style.transform = 'scale(1.3)';
        btn.onmouseout = () => btn.style.transform = 'scale(1)';
        btn.onclick = async (e) => {
            e.stopPropagation();
            console.log('リアクション選択:', { type, emoji, commentId, commentType });
            const success = await addReaction(commentId, commentType, type);
            if (success) {
                console.log('✅ リアクション追加成功。UIを更新します');
                // リアクションUIを更新（少し遅延させて確実に更新）
                await new Promise(resolve => setTimeout(resolve, 100));
                await refreshReactionUI(commentId, commentType);
                console.log('✅ リアクションUI更新完了');
            } else {
                console.error('❌ リアクション追加失敗');
            }
            picker.remove();
        };
        picker.appendChild(btn);
    });

    // まずDOMに追加してから位置を計算（offsetHeightを正しく取得するため）
    picker.style.visibility = 'hidden'; // 一時的に非表示にしてレイアウトを計算
    document.body.appendChild(picker);

    // ボタンの位置を取得
    const rect = buttonElement.getBoundingClientRect();
    const pickerHeight = picker.offsetHeight;
    const pickerWidth = picker.offsetWidth;
    
    // ボタンの真上に表示（ボタンの上端からピッカーの高さ分上）
    let top = rect.top - pickerHeight - 5;
    let left = rect.left;
    
    // 画面からはみ出さないように調整
    if (top < 0) {
        // 上にはみ出す場合は、ボタンの下に表示
        top = rect.bottom + 5;
    }
    if (left + pickerWidth > window.innerWidth) {
        // 右にはみ出す場合は左にシフト
        left = window.innerWidth - pickerWidth - 10;
    }
    if (left < 0) {
        left = 10;
    }
    
    console.log('🎨 ピッカー位置計算:', {
        buttonRect: { top: rect.top, left: rect.left, bottom: rect.bottom, right: rect.right },
        pickerSize: { width: pickerWidth, height: pickerHeight },
        calculatedPosition: { top, left }
    });
    
    picker.style.top = `${top}px`;
    picker.style.left = `${left}px`;
    picker.style.visibility = 'visible'; // 表示

    console.log('✅ リアクションピッカーを表示しました:', {
        top: picker.style.top,
        left: picker.style.left,
        zIndex: picker.style.zIndex,
        picker: picker
    });

    // 外部クリックで閉じる
    setTimeout(() => {
        const closePickerOnOutsideClick = (e) => {
            if (!picker.contains(e.target) && e.target !== buttonElement && !buttonElement.contains(e.target)) {
                console.log('外部クリックでピッカーを閉じます');
                picker.remove();
                document.removeEventListener('click', closePickerOnOutsideClick);
            }
        };
        document.addEventListener('click', closePickerOnOutsideClick);
    }, 100);
}

// リアクションUIを更新
async function refreshReactionUI(commentId, commentType) {
    console.log('🔄 refreshReactionUI開始:', { commentId, commentType });
    
    const reactions = await loadReactions(commentId, commentType);
    console.log('📊 取得したリアクション:', { count: reactions.length, reactions });
    
    // 全てのリアクションコンテナを検索（ポップアップ内、通常のビュー、返信内など）
    const containers = document.querySelectorAll(`.reaction-container[data-comment-id="${commentId}"][data-comment-type="${commentType}"]`);
    console.log('🔍 リアクションコンテナ検索結果:', { 
        count: containers.length,
        containers: Array.from(containers).map(c => ({
            className: c.className,
            parentElement: c.parentElement?.className,
            isInPopup: !!c.closest('.comment-popup')
        }))
    });

    if (containers.length === 0) {
        console.warn('⚠️ リアクションコンテナが見つかりません');
        return;
    }

    const newUI = createReactionUI(commentId, commentType, reactions);
    console.log('✅ 新しいリアクションUIを生成:', { 
        htmlLength: newUI.length,
        includesAddButton: newUI.includes('add-reaction-btn')
    });

    // 全てのコンテナを更新
    containers.forEach((container, index) => {
        console.log(`🔄 コンテナ #${index + 1} を更新中...`);
        const parent = container.parentElement;
        if (parent) {
            container.outerHTML = newUI;
            
            // 新しく作成したUIにイベントリスナーを付与
            const newContainer = parent.querySelector(`.reaction-container[data-comment-id="${commentId}"][data-comment-type="${commentType}"]`);
            if (newContainer) {
                console.log(`✅ コンテナ #${index + 1} のイベントリスナーを付与`);
                attachReactionListenersToContainer(newContainer);
            } else {
                console.warn(`⚠️ コンテナ #${index + 1} の更新後の要素が見つかりません`);
            }
        }
    });
    
    console.log('✅ refreshReactionUI完了');
    
    // ポップアップが開いている場合、返信のリアクションUIも更新
    const popup = document.querySelector('.comment-popup');
    if (popup) {
        console.log('🔄 ポップアップ内の返信リアクションUIも更新します');
        const replyPlaceholders = popup.querySelectorAll('.comment-replies .reaction-placeholder');
        replyPlaceholders.forEach(async (placeholder) => {
            const replyCommentId = placeholder.dataset.commentId;
            const replyCommentType = placeholder.dataset.commentType;
            if (replyCommentId && replyCommentType && typeof window.loadReactionUI === 'function') {
                console.log('🔄 返信リアクションUIを更新:', { replyCommentId, replyCommentType });
                await window.loadReactionUI(placeholder, replyCommentId, replyCommentType);
            }
        });
    }
}

// 特定のコンテナにのみイベントリスナーを付与（再レンダリング時の再登録用）
function attachReactionListenersToContainer(container) {
    // リアクションボタンのクリック（トグル）
    container.querySelectorAll('.reaction-btn').forEach(btn => {
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
    container.querySelectorAll('.add-reaction-btn').forEach(btn => {
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
    
    // ツールチップ表示イベントとホバーエフェクト
    container.querySelectorAll('.reaction-btn').forEach(btn => {
        const tooltip = btn.parentElement?.querySelector('.reaction-tooltip');
        if (!btn.dataset.tooltipListenerAttached) {
            btn.addEventListener('mouseenter', () => {
                btn.style.transform = 'scale(1.1)';
                if (tooltip) tooltip.style.opacity = '1';
            });
            btn.addEventListener('mouseleave', () => {
                btn.style.transform = 'scale(1)';
                if (tooltip) tooltip.style.opacity = '0';
            });
            btn.dataset.tooltipListenerAttached = 'true';
        }
    });
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
    
    // ツールチップ表示イベントとホバーエフェクト
    document.querySelectorAll('.reaction-btn').forEach(btn => {
        const tooltip = btn.parentElement?.querySelector('.reaction-tooltip');
        if (!btn.dataset.tooltipListenerAttached) {
            btn.addEventListener('mouseenter', () => {
                btn.style.transform = 'scale(1.1)';
                if (tooltip) tooltip.style.opacity = '1';
            });
            btn.addEventListener('mouseleave', () => {
                btn.style.transform = 'scale(1)';
                if (tooltip) tooltip.style.opacity = '0';
            });
            btn.dataset.tooltipListenerAttached = 'true';
        }
    });
}

// プレースホルダーにリアクションUIをロード
async function loadReactionUI(placeholder, commentId, commentType) {
    try {
        const reactions = await loadReactions(commentId, commentType);
        const reactionUI = createReactionUI(commentId, commentType, reactions);
        placeholder.innerHTML = reactionUI;

        // イベントリスナーをアタッチ
        const container = placeholder.querySelector('.reaction-container');
        if (container) {
            attachReactionListenersToContainer(container);
        }
    } catch (error) {
        console.error('リアクションUI読み込みエラー:', error);
    }
}

// グローバル関数として公開
window.loadReactions = loadReactions;
window.addReaction = addReaction;
window.removeReaction = removeReaction;
window.createReactionUI = createReactionUI;
window.refreshReactionUI = refreshReactionUI;
window.attachReactionListeners = attachReactionListeners;
window.attachReactionListenersToContainer = attachReactionListenersToContainer;
window.loadReactionUI = loadReactionUI;
window.showReactionPicker = showReactionPicker;
