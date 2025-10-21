-- Safe check for notifications table structure
-- This file safely checks the table structure without causing errors

-- 1. 通知テーブルの存在確認
SELECT 
    CASE 
        WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'notifications')
        THEN 'notifications table exists'
        ELSE 'notifications table does not exist'
    END as table_status;

-- 2. 通知テーブルのカラム一覧（安全な方法）
SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_name = 'notifications'
ORDER BY ordinal_position;

-- 3. readカラムの存在確認
SELECT 
    CASE 
        WHEN EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'notifications' AND column_name = 'read'
        )
        THEN 'read column exists'
        ELSE 'read column does not exist'
    END as read_column_status;

-- 4. 通知データの件数（readカラムなしでも安全）
SELECT 
    COUNT(*) as total_notifications
FROM notifications;

-- 5. 通知データのサンプル（readカラムが存在する場合のみ）
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'notifications' AND column_name = 'read'
    ) THEN
        -- readカラムが存在する場合のクエリ
        RAISE NOTICE 'Read column exists, showing sample data with read status';
    ELSE
        -- readカラムが存在しない場合のクエリ
        RAISE NOTICE 'Read column does not exist, showing sample data without read status';
    END IF;
END $$;
