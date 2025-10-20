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
            participants,
            meet_url: meetUrl,
            meeting_code: rawMeetingCode || (meetUrl.startsWith('https://meet.google.com/') ? meetUrl.replace('https://meet.google.com/', '') : ''),
            calendar_event_id: `event_${Date.now()}`,
            status: 'scheduled',
            created_at: new Date().toISOString(),
            created_by: appState.currentUser ? appState.currentUser.id : null
        };

        const { error } = await supabase
            .from('meetings')
            .insert([meeting]);

        if (error) throw error;

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
        
        // 通知データを作成（アプリ内通知は既存の通知テーブルを使用）
        await createNotification({
            type: 'meeting',
            message: `${meeting.title} - ${new Date(meeting.start_time).toLocaleString('ja-JP')}`,
            related_id: meeting.id,
            recipient: participant
        });

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

        const { error } = await supabase
            .from('notifications')
            .insert([notification]);

        if (error) throw error;

        // リアルタイム通知を表示
        showMeetingNotification(notification);

    } catch (error) {
        console.error('会議通知作成エラー:', error);
    }
}

// 会議通知の表示
function showMeetingNotification(notification) {
    // ブラウザ通知の表示
    if (Notification.permission === 'granted') {
        new Notification(notification.title, {
            body: notification.message,
            icon: '/icon-192.png',
            badge: '/icon-192.png',
            tag: notification.id,
            requireInteraction: true,
            actions: [
                { action: 'join', title: '参加する' },
                { action: 'dismiss', title: '閉じる' }
            ]
        });
    }

    // アプリ内通知の表示
    const notificationElement = document.createElement('div');
    notificationElement.className = 'meeting-notification';
    notificationElement.innerHTML = `
        <div class="notification-content">
            <h4>${notification.title}</h4>
            <p>${notification.message}</p>
            <div class="notification-actions">
                <button onclick="joinMeeting('${notification.data.meetingId}')" class="btn btn-primary">参加する</button>
                <button onclick="dismissNotification('${notification.id}')" class="btn btn-secondary">閉じる</button>
            </div>
        </div>
    `;

    // 通知を表示
    const notificationContainer = document.getElementById('notification-container') || createNotificationContainer();
    notificationContainer.appendChild(notificationElement);

    // 自動で非表示（5秒後）
    setTimeout(() => {
        if (notificationElement.parentNode) {
            notificationElement.parentNode.removeChild(notificationElement);
        }
    }, 5000);
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
        const { data, error } = await supabase
            .from('meetings')
            .select('*')
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

    container.innerHTML = meetings.map(meeting => {
        const startTime = new Date(meeting.start_time);
        const isUpcoming = startTime > new Date();
        const isPast = startTime < new Date();
        const meetingDisplayCode = getMeetingDisplayCode(meeting);
        
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
                    <div class="meeting-participants">参加者: ${meeting.participants.length}名</div>
                    ${meetingDisplayCode ? `<div class="meeting-code">コード: ${escapeHtml(meetingDisplayCode)}</div>` : ''}
                </div>
                <div class="meeting-actions">
                    ${isUpcoming ? `
                        <button onclick="joinMeeting('${meeting.id}')" class="btn btn-primary">参加する</button>
                        <button onclick="editMeeting('${meeting.id}')" class="btn btn-secondary">編集</button>
                    ` : ''}
                    <button onclick="deleteMeeting('${meeting.id}')" class="btn btn-danger">削除</button>
                </div>
            </div>
        `;
    }).join('');
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
    if (!confirm('この会議を削除しますか？')) return;
    try {
        const { error } = await supabase
            .from('meetings')
            .delete()
            .eq('id', meetingId);
        if (error) throw error;
        await loadMeetings();
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
                        <input type="datetime-local" id="meeting-date" value="${new Date(meeting.startTime).toISOString().slice(0, 16)}" required>
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
    const participants = document.getElementById('meeting-participants').value
        .split(',')
        .map(email => email.trim())
        .filter(email => email);
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
        form.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
            
            const title = document.getElementById('meeting-title-input').value.trim();
            const date = new Date(document.getElementById('meeting-date-input').value);
            const duration = parseInt(document.getElementById('meeting-duration-input').value);
            const participants = document.getElementById('meeting-participants-input').value
                .split(',')
                .map(email => email.trim())
                .filter(email => email);
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
