(function(){
    // ブラウザの印刷機能を使ったPDF出力（日本語完全対応）
    async function exportRoadmapToPDF() {
        try {
            // 最新のデータを取得
            console.log('PDF出力: 最新データを取得中...');

            // 会議データを取得
            let meetings = [];
            try {
                const { data: meetingsData, error: meetingsError } = await supabase
                    .from('meetings')
                    .select('*')
                    .order('start_time', { ascending: true });

                if (!meetingsError && meetingsData) {
                    meetings = meetingsData;
                    console.log('会議データ取得成功:', meetings.length, '件');
                }
            } catch (err) {
                console.error('会議データ取得エラー:', err);
            }

            // 意見交換データを取得
            let discussions = [];
            try {
                const { data: discussionsData, error: discussionsError } = await supabase
                    .from('discussion_comments')
                    .select('*')
                    .order('created_at', { ascending: false });

                if (!discussionsError && discussionsData) {
                    discussions = discussionsData;
                    console.log('意見交換データ取得成功:', discussions.length, '件');
                }
            } catch (err) {
                console.error('意見交換データ取得エラー:', err);
            }

            // データを確認
            console.log('PDF出力開始 - データ確認:', {
                tasks: appState.tasks?.length || 0,
                meetings: meetings.length,
                discussions: discussions.length
            });

            // タスク情報を取得
            const tasks = appState.tasks || [];

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

            // PDF用のHTMLを生成
            let html = `
<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>MARUGO OEM ロードマップ</title>
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
            border-left: 3px solid #3b82f6;
            border-radius: 3px;
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
    <h1>🍽️ MARUGO OEM ロードマップ</h1>
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

                // コメント取得
                const comments = (appState.comments || [])
                    .filter(comment => comment.task_id === task.id)
                    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

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

                if (comments.length > 0) {
                    html += `
        <div class="comments">
            <div class="comments-header">💬 コメント (${comments.length}件)</div>
`;

                    comments.forEach(comment => {
                        const commentDate = new Date(comment.created_at).toLocaleDateString('ja-JP');
                        const author = comment.author_username || '匿名';

                        html += `
            <div class="comment">
                <div class="comment-header">
                    <span class="comment-author">${escapeHtml(author)}</span> - ${commentDate}
                </div>
                <div class="comment-content">${escapeHtml(comment.content)}</div>
            </div>
`;
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
            const printWindow = window.open('', '_blank');
            printWindow.document.write(html);
            printWindow.document.close();

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
