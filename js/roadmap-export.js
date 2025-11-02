(function(){
    // ブラウザの印刷機能を使ったPDF出力（日本語完全対応）
    async function exportRoadmapToPDF() {
        try {
            // 最新のデータを取得
            console.log('PDF出力: 最新データを取得中...');

            // 現在のプロジェクトIDを取得
            const currentProjectId = appState.currentProject?.id || sessionStorage.getItem('currentProjectId');
            if (!currentProjectId) {
                console.error('PDF出力エラー: プロジェクトIDが設定されていません');
                alert('プロジェクトが選択されていません。');
                return;
            }
            console.log('PDF出力: プロジェクトIDでフィルタリング:', currentProjectId);

            // 会議データを取得（現在のプロジェクトのみ）
            let meetings = [];
            try {
                const { data: meetingsData, error: meetingsError } = await supabase
                    .from('meetings')
                    .select('*')
                    .eq('project_id', currentProjectId)
                    .order('start_time', { ascending: true });

                if (!meetingsError && meetingsData) {
                    meetings = meetingsData;
                    console.log('会議データ取得成功:', meetings.length, '件（プロジェクトID: ' + currentProjectId + '）');
                } else if (meetingsError) {
                    console.error('会議データ取得エラー:', meetingsError);
                }
            } catch (err) {
                console.error('会議データ取得エラー:', err);
            }

            // 意見交換データを取得（現在のプロジェクトのみ）
            let discussions = [];
            try {
                const { data: discussionsData, error: discussionsError } = await supabase
                    .from('discussion_comments')
                    .select('*')
                    .eq('project_id', currentProjectId)
                    .order('created_at', { ascending: false });

                if (!discussionsError && discussionsData) {
                    discussions = discussionsData;
                    console.log('意見交換データ取得成功:', discussions.length, '件（プロジェクトID: ' + currentProjectId + '）');
                } else if (discussionsError) {
                    console.error('意見交換データ取得エラー:', discussionsError);
                }
            } catch (err) {
                console.error('意見交換データ取得エラー:', err);
            }

            // タスク情報を取得（現在のプロジェクトのみ）
            // appState.tasksは既にプロジェクトIDでフィルタリングされているが、念のため再確認
            let tasks = (appState.tasks || []).filter(task => task.project_id === currentProjectId);
            
            // もしappState.tasksが空またはプロジェクトIDが一致しない場合は、直接データベースから取得
            if (tasks.length === 0 || tasks.some(task => !task.project_id || task.project_id !== currentProjectId)) {
                console.log('PDF出力: タスクをデータベースから直接取得します');
                try {
                    const { data: tasksData, error: tasksError } = await supabase
                        .from('tasks')
                        .select('*')
                        .eq('project_id', currentProjectId)
                        .order('created_at', { ascending: false });
                    
                    if (!tasksError && tasksData) {
                        tasks = tasksData;
                        console.log('タスクデータ取得成功:', tasks.length, '件（プロジェクトID: ' + currentProjectId + '）');
                    } else if (tasksError) {
                        console.error('タスクデータ取得エラー:', tasksError);
                        tasks = [];
                    }
                } catch (err) {
                    console.error('タスクデータ取得エラー:', err);
                    tasks = [];
                }
            } else {
                console.log('PDF出力: appState.tasksを使用:', tasks.length, '件（プロジェクトID: ' + currentProjectId + '）');
            }

            // コメント情報を取得（現在のプロジェクトのみ）
            // appState.commentsは既にプロジェクトIDでフィルタリングされているが、念のため再確認
            let comments = (appState.comments || []).filter(comment => comment.project_id === currentProjectId);
            
            // もしappState.commentsが空またはプロジェクトIDが一致しない場合は、直接データベースから取得
            if (comments.length === 0 || comments.some(comment => !comment.project_id || comment.project_id !== currentProjectId)) {
                console.log('PDF出力: コメントをデータベースから直接取得します');
                try {
                    const { data: commentsData, error: commentsError } = await supabase
                        .from('task_comments')
                        .select('*')
                        .eq('project_id', currentProjectId)
                        .order('created_at', { ascending: false });
                    
                    if (!commentsError && commentsData) {
                        comments = commentsData;
                        console.log('コメントデータ取得成功:', comments.length, '件（プロジェクトID: ' + currentProjectId + '）');
                    } else if (commentsError) {
                        console.error('コメントデータ取得エラー:', commentsError);
                        comments = [];
                    }
                } catch (err) {
                    console.error('コメントデータ取得エラー:', err);
                    comments = [];
                }
            } else {
                console.log('PDF出力: appState.commentsを使用:', comments.length, '件（プロジェクトID: ' + currentProjectId + '）');
            }

            // データを確認
            console.log('PDF出力開始 - データ確認:', {
                projectId: currentProjectId,
                tasks: tasks.length,
                meetings: meetings.length,
                discussions: discussions.length,
                comments: comments.length
            });

            if (tasks.length === 0) {
                alert('タスクがありません。');
                return;
            }

            // タスクを期限順にソート
            const sortedTasks = [...tasks].sort((a, b) => {
                if (a.deadline && b.deadline) {
                    return new Date(a.deadline) - new Date(b.deadline);
                }
                if (a.deadline) return -1;
                if (b.deadline) return 1;
                return new Date(a.created_at) - new Date(b.created_at);
            });

            // 現在のプロジェクト名を取得
            const projectName = sessionStorage.getItem('currentProjectName') || 'MARUGO OEM';

            // PDF用のHTMLを生成
            let html = `
<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHtml(projectName)} ロードマップ</title>
    <style>
        @page {
            size: A4;
            margin: 20mm;
        }

        body {
            font-family: "Hiragino Kaku Gothic ProN", "Hiragino Sans", "Yu Gothic", "Meiryo", sans-serif;
            font-size: 11pt;
            line-height: 1.6;
            color: #333;
            margin: 0;
            padding: 20px;
        }

        h1 {
            font-size: 20pt;
            font-weight: bold;
            margin-bottom: 10px;
            color: #8B4513;
            border-bottom: 3px solid #8B4513;
            padding-bottom: 10px;
        }

        .meta {
            font-size: 10pt;
            color: #666;
            margin-bottom: 30px;
        }

        .task {
            page-break-inside: avoid;
            margin-bottom: 25px;
            border: 1px solid #ddd;
            border-radius: 5px;
            padding: 15px;
            background: #fafafa;
        }

        .task-header {
            font-size: 14pt;
            font-weight: bold;
            margin-bottom: 10px;
            color: #333;
        }

        .task-status {
            display: inline-block;
            padding: 3px 10px;
            border-radius: 3px;
            font-size: 9pt;
            font-weight: bold;
            margin-right: 5px;
        }

        .task-status.completed {
            background: #22c55e;
            color: white;
        }

        .task-status.in_progress {
            background: #3b82f6;
            color: white;
        }

        .task-status.pending {
            background: #94a3b8;
            color: white;
        }

        .task-meta {
            font-size: 9pt;
            color: #666;
            margin-bottom: 10px;
            padding: 8px;
            background: white;
            border-radius: 3px;
        }

        .task-description {
            font-size: 10pt;
            margin-bottom: 10px;
            padding: 10px;
            background: white;
            border-radius: 3px;
            white-space: pre-wrap;
            word-wrap: break-word;
        }

        .comments {
            margin-top: 15px;
        }

        .comments-header {
            font-size: 11pt;
            font-weight: bold;
            margin-bottom: 10px;
            color: #555;
        }

        .comment {
            margin-bottom: 10px;
            padding: 10px;
            background: white;
            border-radius: 3px;
        }

        .comment-parent {
            border-left: 3px solid #3b82f6;
        }

        .comment-reply {
            border-left: 2px solid #94a3b8;
            background: #f8fafc;
        }

        .comment-header {
            font-size: 9pt;
            color: #666;
            margin-bottom: 5px;
        }

        .comment-author {
            font-weight: bold;
            color: #3b82f6;
        }

        .comment-content {
            font-size: 10pt;
            color: #333;
            white-space: pre-wrap;
            word-wrap: break-word;
        }

        .comment-replies {
            margin-top: 0.5rem;
        }

        @media print {
            body {
                padding: 0;
            }

            .task {
                page-break-inside: avoid;
            }
        }
    </style>
</head>
<body>
    <h1>🍽️ ${escapeHtml(projectName)} ロードマップ</h1>
    <div class="meta">
        出力日: ${new Date().toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' })}<br>
        総タスク数: ${tasks.length}件
    </div>
`;

            // 各タスクを追加
            sortedTasks.forEach((task, index) => {
                const statusLabel = task.status === 'completed' ? '完了' :
                                  task.status === 'in_progress' ? '進行中' : '未着手';

                const priority = task.priority === 'high' ? '高' :
                               task.priority === 'medium' ? '中' : '低';

                const deadline = task.deadline ?
                    new Date(task.deadline).toLocaleDateString('ja-JP') : '未設定';

                const createdAt = new Date(task.created_at).toLocaleDateString('ja-JP');

                let createdBy = 'システム';
                if (task.user_profiles && task.user_profiles.username) {
                    createdBy = task.user_profiles.username;
                } else if (task.created_by) {
                    createdBy = task.created_by;
                }

                // コメント取得（現在のプロジェクトのタスクのコメントのみ）
                const allTaskComments = (comments || [])
                    .filter(comment => comment.task_id === task.id && comment.project_id === currentProjectId);
                
                // 親コメントと子コメントを分離
                const parentComments = allTaskComments
                    .filter(comment => !comment.parent_id)
                    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at)); // 古い順
                
                const childComments = allTaskComments
                    .filter(comment => comment.parent_id)
                    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at)); // 古い順
                
                // 親コメントごとにグループ化（返信を含む）
                const commentGroups = parentComments.map(parent => {
                    const replies = childComments.filter(child => child.parent_id === parent.id);
                    return { parent, replies };
                });

                html += `
    <div class="task">
        <div class="task-header">
            <span class="task-status ${task.status}">${statusLabel}</span>
            ${index + 1}. ${escapeHtml(task.title)}
        </div>
        <div class="task-meta">
            優先度: ${priority} | 期限: ${deadline} | 作成日: ${createdAt} | 作成者: ${escapeHtml(createdBy)}
        </div>
`;

                if (task.description && task.description.trim()) {
                    html += `
        <div class="task-description">${escapeHtml(task.description)}</div>
`;
                }

                if (allTaskComments.length > 0) {
                    html += `
        <div class="comments">
            <div class="comments-header">💬 コメント (${allTaskComments.length}件)</div>
`;

                    // 親コメントとその返信を階層的に表示
                    commentGroups.forEach(group => {
                        const parentDate = new Date(group.parent.created_at).toLocaleDateString('ja-JP');
                        const parentAuthor = group.parent.author_username || '匿名';
                        
                        // 親コメント
                        html += `
            <div class="comment comment-parent" style="margin-bottom: ${group.replies.length > 0 ? '0.5rem' : '1rem'};">
                <div class="comment-header">
                    <span class="comment-author">${escapeHtml(parentAuthor)}</span> - ${parentDate}
                </div>
                <div class="comment-content">${escapeHtml(group.parent.content)}</div>
            </div>
`;
                        
                        // 返信（子コメント）を親の下にインデントして表示
                        if (group.replies.length > 0) {
                            html += `
            <div class="comment-replies" style="margin-left: 2rem; padding-left: 1rem; border-left: 2px solid #3b82f6; margin-bottom: 1rem;">
`;
                            
                            group.replies.forEach(reply => {
                                const replyDate = new Date(reply.created_at).toLocaleDateString('ja-JP');
                                const replyAuthor = reply.author_username || '匿名';
                                
                                html += `
                <div class="comment comment-reply" style="margin-bottom: 0.75rem;">
                    <div class="comment-header" style="font-size: 9pt; color: #666;">
                        <span class="comment-author" style="color: #3b82f6;">↳ ${escapeHtml(replyAuthor)}</span> - ${replyDate}
                    </div>
                    <div class="comment-content" style="color: #555;">${escapeHtml(reply.content)}</div>
                </div>
`;
                            });
                            
                            html += `
            </div>
`;
                        }
                    });

                    html += `
        </div>
`;
                }

                html += `
    </div>
`;
            });

            // オンライン会議情報を追加
            if (meetings.length > 0) {
                console.log('会議情報を追加:', meetings.length, '件');
                html += generateMeetingsSection(meetings);
            } else {
                console.log('会議情報なし');
            }

            // 意見交換情報を追加
            if (discussions.length > 0) {
                console.log('意見交換を追加:', discussions.length, '件');
                html += generateDiscussionsSection(discussions);
            } else {
                console.log('意見交換なし');
            }

            // HTMLを閉じる
            html += `
</body>
</html>`;

            // 新しいウィンドウで開いて印刷ダイアログを表示
            let printWindow = null;
            try {
                printWindow = window.open('', '_blank');
            } catch (e) {
                console.warn('window.open がブロックされました:', e);
            }

            // Safari等で window.open が null の場合は iframe フォールバック
            if (!printWindow || !printWindow.document) {
                console.log('Safariフォールバック: iframeで印刷処理を行います');
                const iframe = document.createElement('iframe');
                iframe.style.position = 'fixed';
                iframe.style.right = '0';
                iframe.style.bottom = '0';
                iframe.style.width = '0';
                iframe.style.height = '0';
                iframe.style.border = '0';
                document.body.appendChild(iframe);

                const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
                iframeDoc.open();
                iframeDoc.write(html);
                iframeDoc.close();

                // 印刷
                setTimeout(() => {
                    try {
                        (iframe.contentWindow || iframe).focus();
                        (iframe.contentWindow || iframe).print();
                        setTimeout(() => {
                            document.body.removeChild(iframe);
                        }, 1500);
                    } catch (err) {
                        console.error('iframe印刷エラー:', err);
                        alert('PDF出力中にエラーが発生しました: ' + err.message);
                    }
                }, 600);

                // 成功通知
                if (typeof showNotification === 'function') {
                    showNotification('印刷ダイアログを開きました。「PDFとして保存」を選択してください。', 'success');
                }
                return;
            }

            // 新しいウィンドウ方式
            printWindow.document.open();
            printWindow.document.write(html);
            printWindow.document.close();
            try { printWindow.focus(); } catch(_) {}

            // 印刷ダイアログを表示
            printWindow.onload = function() {
                setTimeout(() => {
                    printWindow.print();

                    // 成功通知
                    if (typeof showNotification === 'function') {
                        showNotification('印刷ダイアログを開きました。「PDFとして保存」を選択してください。', 'success');
                    }
                }, 500);
            };

        } catch (error) {
            console.error('PDF出力エラー:', error);
            alert('PDF出力中にエラーが発生しました: ' + error.message);
        }
    }

    // HTMLエスケープ関数
    function escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // オンライン会議セクションのHTML生成
    function generateMeetingsSection(meetings) {
        // 日付順にソート（新しい順）
        const sortedMeetings = [...meetings].sort((a, b) => {
            return new Date(b.start_time) - new Date(a.start_time);
        });

        let html = `
    <div style="page-break-before: always; margin-top: 30px;">
        <h2 style="font-size: 18pt; font-weight: bold; margin-bottom: 20px; color: #8B4513; border-bottom: 3px solid #8B4513; padding-bottom: 10px;">
            🎥 オンライン会議 (${meetings.length}件)
        </h2>
`;

        sortedMeetings.forEach((meeting, index) => {
            const startTime = new Date(meeting.start_time);
            const dateStr = startTime.toLocaleDateString('ja-JP', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                weekday: 'short'
            });
            const timeStr = startTime.toLocaleTimeString('ja-JP', {
                hour: '2-digit',
                minute: '2-digit'
            });

            const duration = meeting.duration || 60;
            const endTime = new Date(startTime.getTime() + duration * 60 * 1000);
            const endTimeStr = endTime.toLocaleTimeString('ja-JP', {
                hour: '2-digit',
                minute: '2-digit'
            });

            const participants = Array.isArray(meeting.participants) ?
                meeting.participants.join(', ') :
                (meeting.participants || '未設定');

            const statusLabel = meeting.status === 'completed' ? '終了' :
                              meeting.status === 'cancelled' ? 'キャンセル' : '予定';

            const statusColor = meeting.status === 'completed' ? '#22c55e' :
                              meeting.status === 'cancelled' ? '#ef4444' : '#3b82f6';

            html += `
        <div class="meeting" style="page-break-inside: avoid; margin-bottom: 20px; border: 1px solid #ddd; border-radius: 5px; padding: 15px; background: #fafafa;">
            <div style="font-size: 14pt; font-weight: bold; margin-bottom: 10px; color: #333;">
                <span style="display: inline-block; padding: 3px 10px; border-radius: 3px; font-size: 9pt; font-weight: bold; margin-right: 5px; background: ${statusColor}; color: white;">
                    ${statusLabel}
                </span>
                ${index + 1}. ${escapeHtml(meeting.title)}
            </div>
            <div style="font-size: 9pt; color: #666; margin-bottom: 10px; padding: 8px; background: white; border-radius: 3px;">
                📅 日時: ${dateStr} ${timeStr} - ${endTimeStr} (${duration}分間)<br>
                👥 参加者: ${escapeHtml(participants)}<br>
                🔗 Meeting URL: ${escapeHtml(meeting.meet_url || '未設定')}
            </div>
        </div>
`;
        });

        html += `
    </div>
`;

        return html;
    }

    // 意見交換セクションのHTML生成
    function generateDiscussionsSection(discussions) {
        // 日付順にソート（新しい順）
        const sortedDiscussions = [...discussions].sort((a, b) => {
            return new Date(b.created_at) - new Date(a.created_at);
        });

        let html = `
    <div style="page-break-before: always; margin-top: 30px;">
        <h2 style="font-size: 18pt; font-weight: bold; margin-bottom: 20px; color: #8B4513; border-bottom: 3px solid #8B4513; padding-bottom: 10px;">
            💬 意見交換 (${discussions.length}件)
        </h2>
`;

        sortedDiscussions.forEach((discussion, index) => {
            const createdAt = new Date(discussion.created_at).toLocaleString('ja-JP', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });

            const author = discussion.author_username || '匿名';

            html += `
        <div class="discussion" style="page-break-inside: avoid; margin-bottom: 15px; border-left: 3px solid #8B4513; padding: 15px; background: #fafafa; border-radius: 3px;">
            <div style="font-size: 9pt; color: #666; margin-bottom: 8px;">
                <span style="font-weight: bold; color: #8B4513;">${escapeHtml(author)}</span> - ${createdAt}
            </div>
            <div style="font-size: 10pt; color: #333; white-space: pre-wrap; word-wrap: break-word;">
                ${escapeHtml(discussion.content)}
            </div>
        </div>
`;
        });

        html += `
    </div>
`;

        return html;
    }

    // ボタンにイベントを割り当て
    document.addEventListener('DOMContentLoaded', () => {
        const btn = document.getElementById('export-roadmap-pdf-btn');
        if (btn && !btn.dataset.listenerAttached) {
            btn.addEventListener('click', exportRoadmapToPDF);
            btn.dataset.listenerAttached = 'true';
        }
    });

    // グローバル公開（必要なら）
    window.exportRoadmapToPDF = exportRoadmapToPDF;
})();
