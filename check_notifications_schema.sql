-- Check notifications table schema
-- This file helps diagnose the notifications table structure

-- 1. 通知テーブルの存在確認
SELECT 
    table_name,
    table_type
FROM information_schema.tables 
WHERE table_name = 'notifications';

-- 2. 通知テーブルのカラム一覧
SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_name = 'notifications'
ORDER BY ordinal_position;

-- 3. 通知テーブルの制約確認
SELECT 
    constraint_name,
    constraint_type
FROM information_schema.table_constraints 
WHERE table_name = 'notifications';

-- 4. 通知テーブルのインデックス確認
SELECT 
    indexname,
    indexdef
FROM pg_indexes 
WHERE tablename = 'notifications';

-- 5. 通知データのサンプル（存在する場合）
SELECT 
    id,
    type,
    message,
    read,
    created_at
FROM notifications 
LIMIT 5;
