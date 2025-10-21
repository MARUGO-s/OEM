-- Add read column to notifications table
-- This is a simple fix for the missing read column

-- 1. readカラムが存在しない場合に追加
DO $$
BEGIN
    -- readカラムが存在しない場合のみ追加
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'notifications' 
        AND column_name = 'read'
    ) THEN
        ALTER TABLE notifications ADD COLUMN read BOOLEAN NOT NULL DEFAULT false;
        RAISE NOTICE 'Added read column to notifications table';
    ELSE
        RAISE NOTICE 'Read column already exists in notifications table';
    END IF;
END $$;

-- 2. 既存の通知データのreadカラムをfalseに設定
UPDATE notifications SET read = false WHERE read IS NULL;

-- 3. インデックスを作成（存在しない場合のみ）
CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(read);

-- 4. 確認クエリ
SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_name = 'notifications'
ORDER BY ordinal_position;
