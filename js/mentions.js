// メンション機能
// @usernameでユーザーをメンションできる機能を提供

// プロジェクトメンバーのキャッシュ
let projectMembersCache = [];

// プロジェクトメンバーを読み込み
async function loadProjectMembers() {
    try {
        const projectId = sessionStorage.getItem('currentProjectId');
        if (!projectId) {
            console.error('プロジェクトIDが設定されていません');
            return [];
        }

        const { data: members, error } = await supabase
            .from('project_members')
            .select(`
                user_id,
                role,
                user_profiles (
                    id,
                    username,
                    display_name,
                    email
                )
            `)
            .eq('project_id', projectId);

        if (error) {
            console.error('プロジェクトメンバー読み込みエラー:', error);
            return [];
        }

        // フラット化
        projectMembersCache = members.map(m => ({
            id: m.user_profiles.id,
            username: m.user_profiles.username,
            display_name: m.user_profiles.display_name,
            email: m.user_profiles.email,
            role: m.role
        }));

        return projectMembersCache;
    } catch (error) {
        console.error('プロジェクトメンバー読み込み例外:', error);
        return [];
    }
}

// メンション候補リストを表示
async function showMentionSuggestions(inputElement, query = '') {
    // 既存の候補リストを削除
    const existingSuggestions = document.querySelector('.mention-suggestions');
    if (existingSuggestions) {
        existingSuggestions.remove();
    }

    // 最新のメンバーリストを取得（削除されたメンバーを除外）
    await loadProjectMembers();

    // クエリでフィルタリング
    const filteredMembers = projectMembersCache.filter(member =>
        member.username.toLowerCase().includes(query.toLowerCase()) ||
        (member.display_name && member.display_name.toLowerCase().includes(query.toLowerCase()))
    );

    if (filteredMembers.length === 0) {
        return;
    }

    // 候補リストを作成
    const suggestions = document.createElement('div');
    suggestions.className = 'mention-suggestions';
    suggestions.style.cssText = `
        position: absolute;
        background: white;
        border: 1px solid #cbd5e1;
        border-radius: 0.5rem;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        max-height: 200px;
        overflow-y: auto;
        z-index: 1000;
        min-width: 200px;
    `;

    filteredMembers.forEach((member, index) => {
        const item = document.createElement('div');
        item.className = 'mention-suggestion-item';
        item.style.cssText = `
            padding: 0.5rem 0.75rem;
            cursor: pointer;
            transition: background-color 0.2s;
            border-bottom: 1px solid #f1f5f9;
        `;
        item.innerHTML = `
            <div style="font-weight: 600; color: #1e293b;">@${escapeHtml(member.username)}</div>
            ${member.display_name ? `<div style="font-size: 0.75rem; color: #64748b;">${escapeHtml(member.display_name)}</div>` : ''}
        `;

        item.addEventListener('mouseover', () => {
            item.style.backgroundColor = '#f8fafc';
        });

        item.addEventListener('mouseout', () => {
            item.style.backgroundColor = 'white';
        });

        item.addEventListener('click', () => {
            insertMention(inputElement, member.username);
            suggestions.remove();
        });

        suggestions.appendChild(item);
    });

    // 入力欄の位置に候補リストを配置
    const rect = inputElement.getBoundingClientRect();
    const caretPosition = getCaretCoordinates(inputElement);

    suggestions.style.top = `${rect.top + caretPosition.top + 20}px`;
    suggestions.style.left = `${rect.left + caretPosition.left}px`;

    document.body.appendChild(suggestions);

    // 外部クリックで閉じる
    setTimeout(() => {
        document.addEventListener('click', function closeSuggestionsOnOutsideClick(e) {
            if (!suggestions.contains(e.target) && e.target !== inputElement) {
                suggestions.remove();
                document.removeEventListener('click', closeSuggestionsOnOutsideClick);
            }
        });
    }, 100);
}

// メンションを入力欄に挿入
function insertMention(inputElement, username) {
    const value = inputElement.value;
    const cursorPos = inputElement.selectionStart;

    // @の位置を探す
    let atPos = cursorPos - 1;
    while (atPos >= 0 && value[atPos] !== '@') {
        atPos--;
    }

    if (atPos < 0) return;

    // @から現在位置までを置換
    const before = value.substring(0, atPos);
    const after = value.substring(cursorPos);
    const newValue = `${before}@${username} ${after}`;

    inputElement.value = newValue;
    const newCursorPos = atPos + username.length + 2;
    inputElement.setSelectionRange(newCursorPos, newCursorPos);
    inputElement.focus();
}

// キャレット位置を取得（簡易版）
function getCaretCoordinates(element) {
    // 簡易実装: 常に入力欄の左下に表示
    return { top: 0, left: 0 };
}

// メンションされたユーザーIDを抽出
function extractMentions(content) {
    if (!content) return [];

    // @username パターンを探す
    const mentionPattern = /@(\w+)/g;
    const matches = content.matchAll(mentionPattern);
    const usernames = [...matches].map(match => match[1]);

    // ユーザー名からユーザーIDに変換
    const userIds = usernames
        .map(username => {
            const member = projectMembersCache.find(m => m.username === username);
            return member ? member.id : null;
        })
        .filter(id => id !== null);

    return userIds;
}

// 入力欄にメンション機能を追加
function attachMentionListener(inputElement) {
    if (!inputElement || inputElement.dataset.mentionListenerAttached) {
        return;
    }

    inputElement.addEventListener('input', async (e) => {
        const value = e.target.value;
        const cursorPos = e.target.selectionStart;

        // 現在の単語が@で始まるかチェック
        let startPos = cursorPos - 1;
        while (startPos >= 0 && value[startPos] !== ' ' && value[startPos] !== '\n') {
            startPos--;
        }
        startPos++;

        const currentWord = value.substring(startPos, cursorPos);

        if (currentWord.startsWith('@')) {
            const query = currentWord.substring(1);
            await showMentionSuggestions(e.target, query);
        } else {
            // 候補リストを閉じる
            const existingSuggestions = document.querySelector('.mention-suggestions');
            if (existingSuggestions) {
                existingSuggestions.remove();
            }
        }
    });

    inputElement.dataset.mentionListenerAttached = 'true';
}

// HTMLエスケープ
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// グローバル関数として公開
window.loadProjectMembers = loadProjectMembers;
window.extractMentions = extractMentions;
window.attachMentionListener = attachMentionListener;
