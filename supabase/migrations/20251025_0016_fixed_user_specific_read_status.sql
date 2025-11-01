-- ユーザー別の通知既読状態管理（修正版）

-- 通知の既読状態をユーザー別に管理するテーブル
CREATE TABLE IF NOT EXISTS notification_read_status (
    id TEXT PRIMARY KEY DEFAULT concat('read_status_', to_char(EXTRACT(EPOCH FROM now())*1000, 'FM999999999999999')),
    notification_id TEXT NOT NULL,
    user_id UUID NOT NULL,
    read_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
    UNIQUE(notification_id, user_id)
);

-- 外部キー制約を後で追加（テーブル作成後に）
ALTER TABLE notification_read_status 
ADD CONSTRAINT fk_notification_read_status_notification_id 
FOREIGN KEY (notification_id) REFERENCES notifications(id) ON DELETE CASCADE;

ALTER TABLE notification_read_status 
ADD CONSTRAINT fk_notification_read_status_user_id 
FOREIGN KEY (user_id) REFERENCES user_profiles(id) ON DELETE CASCADE;

-- インデックスを作成
CREATE INDEX IF NOT EXISTS idx_notification_read_status_notification_id ON notification_read_status(notification_id);
CREATE INDEX IF NOT EXISTS idx_notification_read_status_user_id ON notification_read_status(user_id);
CREATE INDEX IF NOT EXISTS idx_notification_read_status_read_at ON notification_read_status(read_at);

-- RLSを有効化
ALTER TABLE notification_read_status ENABLE ROW LEVEL SECURITY;

-- 認証されたユーザーは自分の既読状態のみアクセス可能
CREATE POLICY "ユーザーは自分の既読状態のみアクセス可能" ON notification_read_status
    FOR ALL USING (auth.uid() = user_id);

-- リアルタイム機能を有効化
ALTER TABLE notification_read_status REPLICA IDENTITY FULL;

-- 権限設定
GRANT ALL ON notification_read_status TO authenticated;

-- 既存の通知データを新しい構造に移行
-- 既存のread=trueの通知に対して、作成者以外の全ユーザーの既読状態を作成
DO $$
DECLARE
    notification_record RECORD;
    user_record RECORD;
BEGIN
    -- 既存のread=trueの通知を取得
    FOR notification_record IN 
        SELECT id, created_by, created_at
        FROM notifications 
        WHERE read = true
    LOOP
        -- 全ユーザーを取得
        FOR user_record IN 
            SELECT id FROM user_profiles
        LOOP
            -- 作成者以外のユーザーに対して既読状態を作成
            IF user_record.id != notification_record.created_by THEN
                INSERT INTO notification_read_status (notification_id, user_id, read_at)
                VALUES (notification_record.id, user_record.id, notification_record.created_at)
                ON CONFLICT (notification_id, user_id) DO NOTHING;
            END IF;
        END LOOP;
    END LOOP;
END $$;

-- 古いreadカラムを削除（オプション - 後で削除可能）
-- ALTER TABLE notifications DROP COLUMN IF EXISTS read;

