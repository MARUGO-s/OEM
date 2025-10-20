// コメント・意見交換管理

// コメント一覧の読み込み
async function loadComments() {
    try {
        console.log('Supabaseからコメントを読み込み中...');
        
        // Supabaseからコメントを読み込み
        const { data: comments, error } = await supabase
            .from('comments')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) {
            console.error('コメント読み込みエラー:', error);
            throw error;
        }
        
        console.log('Supabaseから取得したコメント:', comments);
        appState.comments = comments || [];
        
        renderComments();
        // タイムライン側も最新コメントで再描画
        if (typeof renderTasks === 'function') {
            renderTasks();
        }
        
        console.log('コメント読み込み完了:', appState.comments.length, '個のコメント');
        
    } catch (error) {
        console.error('コメント読み込みエラー:', error);
        appState.comments = [];
        renderComments();
        if (typeof renderTasks === 'function') {
            renderTasks();
        }
    }
}

// コメントの表示
function renderComments() {
    const container = document.getElementById('comments-container');
    
    if (appState.comments.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: var(--text-secondary);">まだコメントがありません。最初のコメントを投稿してください。</p>';
        return;
    }

    container.innerHTML = appState.comments.map(comment => {
        const timeAgo = getTimeAgo(new Date(comment.created_at));
        
        return `
            <div class="comment-item">
                <div class="comment-header">
                    <span class="comment-author">${escapeHtml(comment.author_username || 'anonymous')}</span>
                    <span class="comment-time">${timeAgo}</span>
                </div>
                <div class="comment-text">${escapeHtml(comment.content)}</div>
            </div>
        `;
    }).join('');
}

function generateCommentId() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }
    return `comment_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// コメント投稿
async function postComment(content) {
    try {
        // ユーザープロファイルの存在確認と作成
        if (appState.currentUser && appState.currentUser.username !== 'anonymous') {
            try {
                // まずメールアドレスで確認
                const email = appState.currentUser.email || `${appState.currentUser.username}@hotmail.com`;
                const { data: existingByEmail, error: emailError } = await supabase
                    .from('user_profiles')
                    .select('id, username')
                    .eq('email', email)
                    .maybeSingle();

                // ユーザー名で確認
                const { data: existingByUsername, error: usernameError } = await supabase
                    .from('user_profiles')
                    .select('id, email')
                    .eq('username', appState.currentUser.username)
                    .maybeSingle();

                // 既存のプロファイルがない場合のみ作成
                if (!existingByEmail && !existingByUsername) {
                    const { error: insertError } = await supabase
                        .from('user_profiles')
                        .insert({
                            id: appState.currentUser.id,
                            username: appState.currentUser.username,
                            display_name: appState.currentUser.username,
                            email: email
                        });

                    if (insertError) {
                        console.error('ユーザープロファイル作成エラー:', insertError);
                        // エラーが発生してもコメント投稿を続行
                    } else {
                        console.log('ユーザープロファイルを作成しました:', appState.currentUser.username);
                    }
                } else {
                    console.log('ユーザープロファイルは既に存在します:', appState.currentUser.username);
                }
            } catch (profileError) {
                console.error('プロファイル処理エラー:', profileError);
                // エラーが発生してもコメント投稿を続行
            }
        }

        // コメント投稿前にユーザープロファイルの存在を最終確認
        if (appState.currentUser && appState.currentUser.username !== 'anonymous') {
            const { data: finalCheck, error: finalError } = await supabase
                .from('user_profiles')
                .select('id')
                .eq('username', appState.currentUser.username)
                .maybeSingle();

            if (finalError) {
                console.error('最終確認エラー:', finalError);
            }

            if (!finalCheck) {
                console.log('ユーザープロファイルが存在しないため、強制作成します:', appState.currentUser.username);
                const { error: forceInsertError } = await supabase
                    .from('user_profiles')
                    .insert({
                        id: appState.currentUser.id,
                        username: appState.currentUser.username,
                        display_name: appState.currentUser.username,
                        email: appState.currentUser.email || `${appState.currentUser.username}@hotmail.com`
                    });

                if (forceInsertError) {
                    console.error('強制作成エラー:', forceInsertError);
                    alert('ユーザープロファイルの作成に失敗しました。ログインし直してください。');
                    return;
                }
            }
        }

        // 新しいコメントを作成
        const newComment = {
            id: generateCommentId(),
            content: content,
            author_id: appState.currentUser.id,
            author_username: appState.currentUser.username,
            task_id: null,
            created_at: new Date().toISOString()
        };

        // Supabaseに保存（insertを使用して外部キー制約を確実にチェック）
        try {
            const { data, error } = await supabase
                .from('comments')
                .insert([newComment])
                .select();

            if (error) {
                console.error('コメント投稿エラー:', error);
                
                // 外部キー制約エラーの場合は特別処理
                if (error.code === '23503') {
                    console.log('外部キー制約エラーが発生しました。ユーザープロファイルを再確認します...');
                    
                    // ユーザープロファイルを強制作成
                    const { error: profileError } = await supabase
                        .from('user_profiles')
                        .insert({
                            id: appState.currentUser.id,
                            username: appState.currentUser.username,
                            display_name: appState.currentUser.username,
                            email: appState.currentUser.email || `${appState.currentUser.username}@hotmail.com`
                        });

                    if (profileError) {
                        console.error('プロファイル強制作成エラー:', profileError);
                    }

                    // 再度コメント投稿を試行
                    const { data: retryData, error: retryError } = await supabase
                        .from('comments')
                        .insert([newComment])
                        .select();

                    if (retryError) {
                        console.error('再試行でもエラー:', retryError);
                        alert('コメントの投稿に失敗しました。しばらく待ってから再度お試しください。');
                        return;
                    }
                } else {
                    alert('コメントの投稿に失敗しました。しばらく待ってから再度お試しください。');
                    return;
                }
            }
        } catch (insertError) {
            console.error('コメント投稿例外:', insertError);
            alert('コメントの投稿に失敗しました。しばらく待ってから再度お試しください。');
            return;
        }

        // コメントを再読み込み
        await loadComments();

        // 通知を送信
        await createNotification({
            type: 'new_comment',
            message: `${appState.currentUser.username}さんがコメントしました: ${content.substring(0, 50)}...`,
            related_id: newComment.id
        });

        // 入力欄をクリア
        document.getElementById('comment-input').value = '';
        
        console.log('コメント投稿完了:', data);
        
    } catch (error) {
        console.error('コメント投稿エラー:', error);
        alert('コメントの投稿に失敗しました');
    }
}

// 相対時間の取得
function getTimeAgo(date) {
    const now = new Date();
    const diff = now - date;
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) {
        return `${days}日前`;
    } else if (hours > 0) {
        return `${hours}時間前`;
    } else if (minutes > 0) {
        return `${minutes}分前`;
    } else {
        return '今';
    }
}

// イベントリスナー
document.getElementById('post-comment-btn').addEventListener('click', async () => {
    const content = document.getElementById('comment-input').value.trim();
    
    if (!content) {
        alert('コメントを入力してください');
        return;
    }

    await postComment(content);
});

// Enterキーで投稿（Shift+Enterで改行）
document.getElementById('comment-input').addEventListener('keydown', async (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        const content = e.target.value.trim();
        
        if (content) {
            await postComment(content);
        }
    }
});

// リアルタイム更新のサブスクリプション
function subscribeToComments() {
    const channel = supabase
        .channel('comments-changes')
        .on('postgres_changes',
            { event: '*', schema: 'public', table: 'comments' },
            (payload) => {
                console.log('コメント変更検知:', payload);
                loadComments();
            }
        )
        .subscribe();

    appState.subscriptions.push(channel);
}
