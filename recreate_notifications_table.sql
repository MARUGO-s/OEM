-- Recreate notifications table with proper schema
-- This file completely recreates the notifications table

-- 1. 既存の通知テーブルを削除（データも削除される）
DROP TABLE IF EXISTS notifications CASCADE;

-- 2. 通知テーブルを再作成
CREATE TABLE notifications (
    id TEXT PRIMARY KEY DEFAULT concat('notification_', to_char(EXTRACT(EPOCH FROM now())*1000, 'FM999999999999999')),
    type TEXT NOT NULL DEFAULT 'general',
    message TEXT NOT NULL,
    related_id TEXT,
    recipient TEXT,
    created_by UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
    read BOOLEAN NOT NULL DEFAULT false
);

-- 3. RLSを有効化
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- 4. RLSポリシーを作成
CREATE POLICY "Allow all access to notifications" ON notifications 
FOR ALL USING (true) WITH CHECK (true);

-- 5. インデックスを作成
CREATE INDEX idx_notifications_created_at ON notifications(created_at);
CREATE INDEX idx_notifications_read ON notifications(read);

-- 6. リアルタイム購読を有効化
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;

-- 7. サンプル通知データを挿入（テスト用）
INSERT INTO notifications (id, type, message, read) VALUES 
('notification_1734567890123456', 'general', 'テスト通知1', false),
('notification_1734567890123457', 'task_created', '新しいタスクが作成されました', false),
('notification_1734567890123458', 'new_comment', '新しいコメントが追加されました', true);

-- 8. 作成確認
SELECT 'Notifications table recreated successfully' as status;
