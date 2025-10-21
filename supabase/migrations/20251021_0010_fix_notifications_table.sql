-- notifications テーブルの完全修復
-- エラー: 22P02 (notifications テーブル不存在) を解決

-- 1. 既存の notifications テーブルを削除（存在する場合のみ）
DROP TABLE IF EXISTS notifications CASCADE;

-- 2. notifications テーブルを再作成（完全版）
CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    type TEXT NOT NULL,
    message TEXT NOT NULL,
    related_id TEXT,
    created_by UUID REFERENCES user_profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

-- 3. インデックスの作成
CREATE INDEX IF NOT EXISTS idx_notifications_created_by ON notifications(created_by);
CREATE INDEX IF NOT EXISTS idx_notifications_type ON notifications(type);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at);

-- 4. RLS（Row Level Security）の有効化
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- 5. RLSポリシーの作成
CREATE POLICY "Allow all access to notifications" ON notifications FOR ALL USING (true) WITH CHECK (true);

-- 6. リアルタイム機能の有効化
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;

-- 7. サンプルデータの挿入
INSERT INTO notifications (id, type, message, related_id, created_by, created_at) VALUES
('notif-1', 'new_comment', '新しいコメントが投稿されました', 'comment-1', (SELECT id FROM user_profiles WHERE username = 'manager' LIMIT 1), '2025-10-20 09:00:00+00'),
('notif-2', 'meeting_reminder', '会議のリマインダーです', 'meeting-1', (SELECT id FROM user_profiles WHERE username = 'manager' LIMIT 1), '2025-10-20 09:00:00+00'),
('notif-3', 'task_update', 'タスクが更新されました', 'task-1', (SELECT id FROM user_profiles WHERE username = 'manager' LIMIT 1), '2025-10-20 09:00:00+00')
ON CONFLICT (id) DO NOTHING;

