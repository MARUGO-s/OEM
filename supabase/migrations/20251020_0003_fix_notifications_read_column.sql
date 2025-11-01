-- Fix notifications table - add read column if missing
-- Generated on 2025-10-20

-- 通知テーブルにreadカラムが存在しない場合に追加
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
        CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(read);
        RAISE NOTICE 'Added read column to notifications table';
    ELSE
        RAISE NOTICE 'Read column already exists in notifications table';
    END IF;
END $$;

-- 既存の通知データのreadカラムをfalseに設定（念のため）
UPDATE notifications SET read = false WHERE read IS NULL;

-- 通知テーブルのRLSポリシーを確認・更新
DO $$
BEGIN
    -- 既存のポリシーを削除
    DROP POLICY IF EXISTS "Allow all access to notifications" ON notifications;
    
    -- 新しいポリシーを作成
    CREATE POLICY "Allow all access to notifications" ON notifications 
    FOR ALL USING (true) WITH CHECK (true);
    
    RAISE NOTICE 'Updated RLS policy for notifications table';
END $$;
