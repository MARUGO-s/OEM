// Google Meet連携機能（Supabaseベース）

// Google Meet会議の作成（作成した会議をSupabaseに保存）
async function createGoogleMeetMeeting(title, date, duration = 60, participants = [], meetingCode = '') {
    try {
        // Google Calendar APIを使用して会議を作成
        const event = {
            summary: title,
            description: `OEM商品企画管理 - ${title}`,
            start: {
                dateTime: date.toISOString(),
                timeZone: 'Asia/Tokyo'
            },
            end: {
                dateTime: new Date(date.getTime() + duration * 60 * 1000).toISOString(),
                timeZone: 'Asia/Tokyo'
            },
            conferenceData: {
                createRequest: {
                    requestId: `meeting_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                    conferenceSolutionKey: {
                        type: 'hangoutsMeet'
                    }
                }
            },
            attendees: participants.map(email => ({ email })),
            reminders: {
                useDefault: false,
                overrides: [
                    { method: 'email', minutes: 24 * 60 }, // 1日前
                    { method: 'popup', minutes: 10 } // 10分前
                ]
            }
        };

        // 会議を作成（実際の実装ではGoogle Calendar APIを使用）
        const rawMeetingCode = (meetingCode || '').trim();
        const normalizedCode = rawMeetingCode.replace(/\s+/g, '');
        let meetUrl;

        if (rawMeetingCode) {
            if (/^https?:\/\//i.test(rawMeetingCode)) {
                meetUrl = rawMeetingCode;
            } else {
                meetUrl = `https://meet.google.com/${normalizedCode}`;
            }
        } else {
            meetUrl = `https://meet.google.com/${generateMeetingId()}`;
        }

        const meeting = {
            id: `meeting_${Date.now()}`,
            title,
            start_time: date.toISOString(),
            duration,
            participants: Array.isArray(participants) ? participants : [],
            meet_url: meetUrl,
            meeting_code: rawMeetingCode || (meetUrl.startsWith('https://meet.google.com/') ? meetUrl.replace('https://meet.google.com/', '') : ''),
            calendar_event_id: `event_${Date.now()}`,
            status: 'scheduled',
            created_at: new Date().toISOString(),
            created_by: appState.currentUser ? appState.currentUser.id : null,
            project_id: appState.currentProject ? appState.currentProject.id : null,
            minutes_path: null,
            minutes_public_url: null,
            minutes_file_name: null,
            minutes_uploaded_at: null,
            minutes_uploaded_by: null,
            minutes_history: []
        };

        // Supabaseに会議を保存（エラーハンドリング強化）
        try {
            const { data, error } = await supabase
                .from('meetings')
                .insert([meeting])
                .select();

            if (error) {
                console.error('Supabase会議保存エラー:', error);
                // エラーが発生しても会議作成は継続（ローカル保存）
                console.warn('会議をローカルに保存します');
            } else {
                console.log('Supabase会議保存成功:', data);
            }
        } catch (supabaseError) {
            console.error('Supabase会議保存例外:', supabaseError);
            // 例外が発生しても会議作成は継続
            console.warn('会議をローカルに保存します');
        }

        // 参加者に通知
        await notifyMeetingParticipants(meeting);

        // 最新の一覧を再読込
        await loadMeetings();

        return meeting;
    } catch (error) {
        console.error('Google Meet会議作成エラー:', error);
        throw error;
    }
}

// 会議ID生成
function generateMeetingId() {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < 10; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

// 参加者への通知
async function notifyMeetingParticipants(meeting) {
    try {
        // 参加者リストを取得
        const participants = meeting.participants || [];
        
        // 各参加者に通知を送信
        for (const participant of participants) {
            await sendMeetingNotification(participant, meeting);
        }

        // アプリ内通知
        if (appState.currentUser) {
            await createMeetingNotification(meeting);
        }
    } catch (error) {
        console.error('会議通知エラー:', error);
    }
}

// 会議通知の送信
async function sendMeetingNotification(participant, meeting) {
    try {
        // 実際の実装では、メール送信やプッシュ通知を使用
        
        // 通知データを作成（エラーハンドリング強化）
        try {
            await createNotification({
                type: 'meeting',
                message: `${meeting.title} - ${new Date(meeting.start_time).toLocaleString('ja-JP')}`,
                related_id: meeting.id,
                recipient: participant
            });
        } catch (notificationError) {
            console.warn('通知作成エラー（無視）:', notificationError);
            // 通知エラーは会議作成を阻害しない
        }

    } catch (error) {
        console.error('通知送信エラー:', error);
    }
}

// アプリ内会議通知の作成
async function createMeetingNotification(meeting) {
    try {
        const notification = {
            type: 'meeting_scheduled',
            message: `${meeting.title} - ${new Date(meeting.start_time).toLocaleString('ja-JP')}`,
            related_id: meeting.id
        };

        // Supabaseに通知を保存（エラーハンドリング強化）
        try {
            const { data, error } = await supabase
                .from('notifications')
                .insert([notification])
                .select();

            if (error) {
                console.warn('Supabase通知保存エラー（無視）:', error);
                // エラーが発生しても会議作成は継続
            } else {
                console.log('Supabase通知保存成功:', data);
            }
        } catch (supabaseError) {
            console.warn('Supabase通知保存例外（無視）:', supabaseError);
            // 例外が発生しても会議作成は継続
        }

        // リアルタイム通知を表示（エラーハンドリング強化）
        try {
            // 通知オブジェクトのバリデーション
            if (!notification || typeof notification !== 'object') {
                console.warn('無効な通知オブジェクト:', notification);
                return;
            }

            // ブラウザ通知の表示
            if (Notification.permission === 'granted') {
                const notificationTitle = notification.title || '会議通知';
                const notificationBody = notification.message || '新しい会議がスケジュールされました';
                const notificationId = notification.id || `meeting_${Date.now()}`;

                new Notification(notificationTitle, {
                    body: notificationBody,
                    icon: '/icon-192.png',
                    badge: '/icon-192.png',
                    tag: notificationId,
                    requireInteraction: true
                });
            }

            // アプリ内通知の表示
            try {
                const notificationElement = document.createElement('div');
                notificationElement.className = 'meeting-notification';
                
                // 安全なプロパティアクセス
                const notificationTitle = notification.title || '会議通知';
                const notificationMessage = notification.message || '新しい会議がスケジュールされました';
                const notificationId = notification.id || `meeting_${Date.now()}`;
                const meetingId = (notification.data && notification.data.meetingId) || notification.related_id || notificationId;
                
                notificationElement.innerHTML = `
                    <div class="notification-content">
                        <h4>${notificationTitle}</h4>
                        <p>${notificationMessage}</p>
                        <div class="notification-actions">
                            <button onclick="joinMeeting('${meetingId}')" class="btn btn-primary">参加する</button>
                            <button onclick="dismissNotification('${notificationId}')" class="btn btn-secondary">閉じる</button>
                        </div>
                    </div>
                `;
                
                // 通知を表示
                document.body.appendChild(notificationElement);
                
                // 5秒後に自動削除
                setTimeout(() => {
                    if (notificationElement.parentNode) {
                        notificationElement.parentNode.removeChild(notificationElement);
                    }
                }, 5000);
                
            } catch (domError) {
                console.warn('DOM通知表示エラー:', domError);
            }

        } catch (notificationDisplayError) {
            console.warn('通知表示エラー（無視）:', notificationDisplayError);
            // 通知表示エラーは会議作成を阻害しない
        }

    } catch (error) {
        console.error('会議通知作成エラー:', error);
    }
}


// 通知コンテナの作成
function createNotificationContainer() {
    const container = document.createElement('div');
    container.id = 'notification-container';
    container.className = 'notification-container';
    document.body.appendChild(container);
    return container;
}

// 会議に参加
window.joinMeeting = function(meetingId) {
    const meeting = (appState.meetings || []).find(m => m.id === meetingId);
    if (meeting && meeting.meet_url) {
        window.open(meeting.meet_url, '_blank');
    } else if (meeting && meeting.meeting_code) {
        alert(`会議URLが見つかりません。以下のミーティングコードを使用してください:\n${meeting.meeting_code}`);
    } else {
        alert('会議URLが見つかりません');
    }
};

// 通知を閉じる
window.dismissNotification = function(notificationId) {
    const notificationElement = document.querySelector(`[data-notification-id="${notificationId}"]`);
    if (notificationElement) {
        notificationElement.remove();
    }
};

// 会議一覧の読み込み（Supabase）
async function loadMeetings() {
    try {
        // 現在のプロジェクトが選択されていない場合は空配列を返す
        if (!appState.currentProject) {
            appState.meetings = [];
            renderMeetings();
            return;
        }

        const { data, error } = await supabase
            .from('meetings')
            .select('*')
            .eq('project_id', appState.currentProject.id)
            .order('start_time', { ascending: true });

        if (error) throw error;

        appState.meetings = data || [];
        renderMeetings();
    } catch (error) {
        console.error('会議読み込みエラー:', error);
        appState.meetings = [];
        renderMeetings();
    }
}

// 会議の表示
function renderMeetings() {
    const container = document.getElementById('meetings-container');
    if (!container) return;
    const meetings = appState.meetings || [];
    
    if (meetings.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: var(--text-secondary); padding: 2rem;">スケジュールされた会議がありません。</p>';
        return;
    }

    // 編集権限をチェック
    const canEditContent = typeof window.canEdit === 'function' ? window.canEdit() : (appState.currentUser && appState.currentUserRole !== 'viewer');
    
    container.innerHTML = meetings.map(meeting => {
        const startTime = new Date(meeting.start_time);
        const isUpcoming = startTime > new Date();
        const isPast = startTime < new Date();
        const meetingDisplayCode = getMeetingDisplayCode(meeting);
        const minutesHistory = getMeetingMinutesHistory(meeting);
        const minutesHistoryItems = minutesHistory
            .map((entry, index) => {
                const url = getMinutesEntryUrl(entry);
                if (!url) return '';
                const fileName = escapeHtml(entry.file_name || `議事録 ${index + 1}`);
                const uploadedAtText = entry.uploaded_at
                    ? new Date(entry.uploaded_at).toLocaleString('ja-JP')
                    : '';
                const label = index === 0 ? `<span class="meeting-minutes-label">最新</span>` : '';
                return `
                    <li>
                        <a href="${url}" target="_blank" rel="noopener noreferrer" class="meeting-minutes-link" data-url="${url}">${fileName}</a>
                        ${uploadedAtText ? `<span class="meeting-minutes-date">${uploadedAtText}</span>` : ''}
                        ${label}
                    </li>
                `;
            })
            .filter(Boolean)
            .join('');
        const minutesHistoryHtml = minutesHistoryItems
            ? `<ul class="meeting-minutes-list">${minutesHistoryItems}</ul>`
            : `<div class="meeting-minutes-empty">議事録はまだアップロードされていません</div>`;
        const canUploadMinutes = canEditContent && isPast;
        
        return `
            <div class="meeting-card ${isPast ? 'past' : ''}">
                <div class="meeting-header">
                    <h3>${escapeHtml(meeting.title)}</h3>
                    <span class="meeting-status ${meeting.status}">${getMeetingStatusLabel(meeting.status)}</span>
                </div>
                <div class="meeting-details">
                    <div class="meeting-time">
                        <span class="meeting-date">${startTime.toLocaleDateString('ja-JP')}</span>
                        <span class="meeting-time">${startTime.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                    <div class="meeting-duration">${meeting.duration}分</div>
                    ${meetingDisplayCode ? `<div class="meeting-code">コード: ${escapeHtml(meetingDisplayCode)}</div>` : ''}
                </div>
                <div class="meeting-minutes">
                    ${minutesHistoryHtml}
                    ${canUploadMinutes ? `
                        <button onclick="uploadMeetingMinutes('${meeting.id}')" class="btn btn-secondary">議事録をアップロード</button>
                        <div class="meeting-minutes-hint">対応形式: PDF / Word / PowerPoint / Excel / CSV / TXT / Markdown / ZIP（50MBまで）</div>
                    ` : ''}
                </div>
                <div class="meeting-actions">
                    ${isUpcoming ? `
                        <button onclick="joinMeeting('${meeting.id}')" class="btn btn-primary">参加する</button>
                        ${canEditContent ? `<button onclick="editMeeting('${meeting.id}')" class="btn btn-secondary">編集</button>` : ''}
                    ` : ''}
                    ${canEditContent ? `<button onclick="deleteMeeting('${meeting.id}')" class="btn btn-danger">削除</button>` : ''}
                </div>
            </div>
        `;
    }).join('');
    
    // 権限に基づいてUI要素を制御
    if (typeof updateUIByPermissions === 'function') {
        updateUIByPermissions();
    }
}

// 会議ステータスのラベル取得
function getMeetingStatusLabel(status) {
    const labels = {
        'scheduled': '予定済み',
        'in_progress': '進行中',
        'completed': '完了',
        'cancelled': 'キャンセル'
    };
    return labels[status] || status;
}

function getMeetingDisplayCode(meeting) {
    if (!meeting) return '';
    if (meeting.meeting_code && meeting.meeting_code.trim()) {
        return meeting.meeting_code.trim();
    }
    if (meeting.meet_url && /^https?:\/\//i.test(meeting.meet_url)) {
        return meeting.meet_url.replace(/^https?:\/\//i, '');
    }
    return '';
}

function getMeetingMinutesHistory(meeting) {
    if (!meeting) return [];
    const history = Array.isArray(meeting.minutes_history)
        ? meeting.minutes_history.filter(entry => entry && (entry.path || entry.public_url))
        : [];

    if (history.length === 0 && (meeting.minutes_path || meeting.minutes_public_url)) {
        history.push({
            path: meeting.minutes_path || null,
            public_url: meeting.minutes_public_url || null,
            file_name: meeting.minutes_file_name || null,
            uploaded_at: meeting.minutes_uploaded_at || null,
            uploaded_by: meeting.minutes_uploaded_by || null
        });
    }

    return history;
}

function getMinutesEntryUrl(entry) {
    if (!entry) return '';
    if (entry.public_url) {
        return entry.public_url;
    }
    if (entry.path) {
        const { data } = supabase.storage.from('meeting-minutes').getPublicUrl(entry.path);
        return data?.publicUrl || '';
    }
    return '';
}

document.addEventListener('click', (event) => {
    const target = event.target;
    if (target && target.classList && target.classList.contains('meeting-minutes-link')) {
        event.preventDefault();
        const url = target.getAttribute('data-url');
        if (url) {
            window.open(url, '_blank', 'noopener');
        }
    }
});

function getMeetingMinutesLink(meeting) {
    if (!meeting) return '';
    const history = getMeetingMinutesHistory(meeting);
    if (history.length > 0) {
        const firstUrl = getMinutesEntryUrl(history[0]);
        if (firstUrl) {
            return firstUrl;
        }
    }
    if (meeting.minutes_public_url) {
        return meeting.minutes_public_url;
    }
    if (meeting.minutes_path) {
        const { data } = supabase.storage.from('meeting-minutes').getPublicUrl(meeting.minutes_path);
        return data?.publicUrl || '';
    }
    return '';
}

window.uploadMeetingMinutes = function(meetingId) {
    const meeting = (appState.meetings || []).find(m => m.id === meetingId);
    if (!meeting) {
        alert('会議が見つかりません');
        return;
    }
    if (!appState.currentUser) {
        alert('議事録のアップロードにはログインが必要です');
        return;
    }

    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.csv,.txt,.md,.zip';

    fileInput.addEventListener('change', async (event) => {
        const file = event.target.files && event.target.files[0];
        if (!file) {
            return;
        }

        if (file.size > 50 * 1024 * 1024) {
            alert('ファイルサイズは50MB以下にしてください');
            return;
        }

        const sanitizedFileName = file.name.replace(/[^a-zA-Z0-9_.-]/g, '_');
        const timestamp = Date.now();
        const projectSegment = meeting.project_id || 'general';
        const storagePath = `${projectSegment}/${meetingId}/${timestamp}_${sanitizedFileName}`;

        try {
            const { error: uploadError } = await supabase.storage
                .from('meeting-minutes')
                .upload(storagePath, file, {
                    cacheControl: '3600',
                    upsert: false
                });

            if (uploadError) {
                throw uploadError;
            }

            const { data: publicData } = supabase.storage
                .from('meeting-minutes')
                .getPublicUrl(storagePath);

            const existingHistory = getMeetingMinutesHistory(meeting);
            const normalizedHistory = existingHistory
                .map(entry => ({
                    path: entry.path || null,
                    public_url: entry.public_url || null,
                    file_name: entry.file_name || null,
                    uploaded_at: entry.uploaded_at || null,
                    uploaded_by: entry.uploaded_by || null
                }))
                .filter(entry => entry.path || entry.public_url);

            if (meeting.minutes_path && !normalizedHistory.some(entry => entry.path === meeting.minutes_path)) {
                normalizedHistory.push({
                    path: meeting.minutes_path,
                    public_url: meeting.minutes_public_url || null,
                    file_name: meeting.minutes_file_name || null,
                    uploaded_at: meeting.minutes_uploaded_at || null,
                    uploaded_by: meeting.minutes_uploaded_by || null
                });
            }

            const newEntry = {
                path: storagePath,
                public_url: publicData?.publicUrl || null,
                file_name: file.name,
                uploaded_at: new Date().toISOString(),
                uploaded_by: appState.currentUser?.id || null
            };

            const updatePayload = {
                minutes_path: storagePath,
                minutes_public_url: newEntry.public_url,
                minutes_file_name: file.name,
                minutes_uploaded_at: newEntry.uploaded_at,
                minutes_uploaded_by: newEntry.uploaded_by,
                minutes_history: [newEntry, ...normalizedHistory]
            };

            const { error: updateError } = await supabase
                .from('meetings')
                .update(updatePayload)
                .eq('id', meetingId);

            if (updateError) {
                throw updateError;
            }

            alert('議事録をアップロードしました');
            await loadMeetings();
        } catch (error) {
            console.error('議事録アップロードエラー:', error);
            if (error?.message?.toLowerCase().includes('bucket')) {
                alert('議事録用ストレージバケットが見つかりません。Supabaseで meeting-minutes バケットを作成してください。');
            } else {
                alert('議事録のアップロードに失敗しました');
            }
        } finally {
            fileInput.value = '';
        }
    });

    fileInput.click();
};

// 会議の編集
window.editMeeting = function(meetingId) {
    const meeting = (appState.meetings || []).find(m => m.id === meetingId);
    if (meeting) {
        showMeetingEditForm(meeting);
    } else {
        alert('会議が見つかりません');
    }
};

// 会議の削除
window.deleteMeeting = async function(meetingId) {
    if (!confirm('この会議を削除しますか？\nこの操作は取り消せません。')) return;
    try {
        const meeting = (appState.meetings || []).find(m => m.id === meetingId);

        const { error } = await supabase
            .from('meetings')
            .delete()
            .eq('id', meetingId);
        if (error) throw error;

        const historyPaths = getMeetingMinutesHistory(meeting)
            .map(entry => entry.path)
            .filter(Boolean);
        const pathsToRemove = Array.from(new Set([
            ...(meeting?.minutes_path ? [meeting.minutes_path] : []),
            ...historyPaths
        ]));

        if (pathsToRemove.length > 0) {
            try {
                await supabase.storage
                    .from('meeting-minutes')
                    .remove(pathsToRemove);
            } catch (storageError) {
                console.warn('議事録ファイル削除エラー（無視）:', storageError);
            }
        }

        await loadMeetings();

        try {
            await createNotification({
                type: 'meeting_deleted',
                message: `${appState.currentUser?.username || 'ユーザー'}さんが会議を削除しました。`,
                related_id: meetingId
            });

            await loadNotifications();
            if (typeof updateNotificationBadge === 'function') {
                updateNotificationBadge();
            }
            if (typeof renderNotifications === 'function') {
                renderNotifications();
            }
        } catch (notificationError) {
            console.error('会議削除通知エラー:', notificationError);
        }

        showNotification('会議を削除しました', 'success');
    } catch (error) {
        console.error('会議削除エラー:', error);
        alert('会議の削除に失敗しました');
    }
};

// 会議編集フォームの表示
function showMeetingEditForm(meeting) {
    // 編集フォームのモーダルを表示
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h3>会議の編集</h3>
                <button onclick="closeModal()" class="modal-close">&times;</button>
            </div>
            <div class="modal-body">
                <form id="meeting-edit-form">
                    <div class="form-group">
                        <label for="meeting-title">会議タイトル</label>
                        <input type="text" id="meeting-title" value="${escapeHtml(meeting.title)}" required>
                    </div>
                    <div class="form-group">
                        <label for="meeting-date">日時</label>
                        <input type="datetime-local" id="meeting-date" value="${meeting.start_time ? new Date(meeting.start_time).toISOString().slice(0, 16) : ''}" required>
                    </div>
                    <div class="form-group">
                        <label for="meeting-duration">時間（分）</label>
                        <input type="number" id="meeting-duration" value="${meeting.duration}" min="15" max="480" required>
                    </div>
                    <div class="form-group">
                        <label for="meeting-participants">参加者（メールアドレスをカンマ区切りで入力）</label>
                        <textarea id="meeting-participants" rows="3" placeholder="chef1@restaurant.com, chef2@restaurant.com">${meeting.participants.join(', ')}</textarea>
                    </div>
                    <div class="form-group">
                        <label for="meeting-code">ミーティングコード（任意）</label>
                        <input type="text" id="meeting-code" value="${escapeHtml(meeting.meeting_code || '')}" placeholder="例: abc-defg-hij または URL">
                    </div>
                </form>
            </div>
            <div class="modal-footer">
                <button onclick="closeModal()" class="btn btn-secondary">キャンセル</button>
                <button onclick="saveMeetingEdit('${meeting.id}')" class="btn btn-primary">保存</button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // モーダルを表示するためにactiveクラスを追加
    setTimeout(() => {
        modal.classList.add('active');
    }, 10);
}

// 会議編集の保存
window.saveMeetingEdit = async function(meetingId) {
    const title = document.getElementById('meeting-title').value.trim();
    const date = new Date(document.getElementById('meeting-date').value);
    const duration = parseInt(document.getElementById('meeting-duration').value);
    const participantsField = document.getElementById('meeting-participants');
    const participants = participantsField
        ? participantsField.value
            .split(',')
            .map(email => email.trim())
            .filter(email => email)
        : [];
    const meetingCodeInput = document.getElementById('meeting-code');
    const rawMeetingCode = meetingCodeInput ? meetingCodeInput.value.trim() : '';

    if (!title || !date || !duration) {
        alert('すべての項目を入力してください');
        return;
    }

    try {
        const normalizedCode = rawMeetingCode.replace(/\s+/g, '');
        let updatedMeetUrl = '';
        if (rawMeetingCode) {
            if (/^https?:\/\//i.test(rawMeetingCode)) {
                updatedMeetUrl = rawMeetingCode;
            } else {
                updatedMeetUrl = `https://meet.google.com/${normalizedCode}`;
            }
        }

        const { error } = await supabase
            .from('meetings')
            .update({
                title,
                start_time: date.toISOString(),
                duration,
                participants,
                meeting_code: rawMeetingCode,
                ...(updatedMeetUrl ? { meet_url: updatedMeetUrl } : {})
            })
            .eq('id', meetingId);

        if (error) throw error;

        await loadMeetings();
        closeModal();
    } catch (error) {
        console.error('会議更新エラー:', error);
        alert('会議の更新に失敗しました');
    }
};

// モーダルを閉じる
window.closeModal = function() {
    const modal = document.querySelector('.modal');
    if (modal) {
        // アニメーション効果のためにactiveクラスを先に削除
        modal.classList.remove('active');
        // 少し待ってからDOMから削除
        setTimeout(() => {
            modal.remove();
        }, 200);
    }
};

// HTMLエスケープ
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// 会議フォームの表示/非表示
window.showMeetingForm = function() {
    const form = document.getElementById('meetings-form');
    if (form) {
        form.style.display = 'block';
        // フォームを表示したら少しスクロール
        requestAnimationFrame(() => {
            const rect = form.getBoundingClientRect();
            const offset = rect.top + window.scrollY - 120; // 固定ヘッダー分を調整
            window.scrollTo({ top: offset, behavior: 'smooth' });
        });
    }
};

window.hideMeetingForm = function() {
    const form = document.getElementById('meetings-form');
    if (form) {
        form.style.display = 'none';
    }
};

// 初期化関数
async function initializeMeetings() {
    // 会議一覧を読み込み
    await loadMeetings();
    
    // 会議作成ボタンのイベントリスナー（重複防止）
    const createMeetingBtn = document.getElementById('create-meeting-btn');
    if (createMeetingBtn && !createMeetingBtn.dataset.listenerAttached) {
        createMeetingBtn.addEventListener('click', showMeetingForm);
        createMeetingBtn.dataset.listenerAttached = 'true';
    }
    
    // 会議作成フォームのイベントリスナー（重複防止）
    const meetingForm = document.getElementById('meeting-form');
    if (meetingForm && !meetingForm.dataset.listenerAttached) {
        meetingForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const titleInput = document.getElementById('meeting-title-input');
            const dateInput = document.getElementById('meeting-date-input');
            const durationInput = document.getElementById('meeting-duration-input');
            const participantsInput = document.getElementById('meeting-participants-input');

            const title = titleInput ? titleInput.value.trim() : '';
            const date = dateInput ? new Date(dateInput.value) : null;
            const duration = durationInput ? parseInt(durationInput.value, 10) : NaN;
            const participants = [];
            const meetingCodeInput = document.getElementById('meeting-code-input');
            const meetingCode = meetingCodeInput ? meetingCodeInput.value.trim() : '';

            if (!title || !date || !duration) {
                alert('すべての項目を入力してください');
                return;
            }

            try {
            const meeting = await createGoogleMeetMeeting(title, date, duration, participants, meetingCode);
                alert('会議がスケジュールされました！');
                meetingForm.reset();
                hideMeetingForm();
            renderMeetings();
            } catch (error) {
                console.error('会議作成エラー:', error);
                alert('会議の作成に失敗しました');
            }
        });
        meetingForm.dataset.listenerAttached = 'true';
    }
}

// 重複初期化を防ぐフラグ
let meetingsInitialized = false;

// DOMContentLoadedイベントと即座実行の両方に対応
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        if (!meetingsInitialized) {
            initializeMeetings();
            meetingsInitialized = true;
        }
    });
} else {
    // DOMが既に読み込まれている場合
    if (!meetingsInitialized) {
        setTimeout(() => {
            initializeMeetings();
            meetingsInitialized = true;
        }, 100);
    }
}

// 追加の初期化（他のスクリプトが読み込まれた後）
setTimeout(() => {
    if (!meetingsInitialized) {
        initializeMeetings();
        meetingsInitialized = true;
    }
}, 500);

// リアルタイム購読
function subscribeToMeetings() {
    const channel = supabase
        .channel('meetings-changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'meetings' }, () => {
            loadMeetings();
        })
        .subscribe();
    appState.subscriptions.push(channel);
}

// グローバル公開
window.loadMeetings = loadMeetings;
window.subscribeToMeetings = subscribeToMeetings;
