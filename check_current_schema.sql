-- 現在のデータベーススキーマの確認
-- SupabaseのSQLエディターで実行してください

-- 1. テーブルの存在確認
SELECT 
    table_name,
    table_type
FROM information_schema.tables 
WHERE table_schema = 'public' 
    AND table_name IN ('user_profiles', 'tasks', 'comments', 'meetings', 'notifications')
ORDER BY table_name;

-- 2. user_profilesテーブルの構造確認
SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_name = 'user_profiles' 
    AND table_schema = 'public'
ORDER BY ordinal_position;

-- 3. tasksテーブルの構造確認
SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_name = 'tasks' 
    AND table_schema = 'public'
ORDER BY ordinal_position;

-- 4. commentsテーブルの構造確認
SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_name = 'comments' 
    AND table_schema = 'public'
ORDER BY ordinal_position;

-- 5. 外部キー制約の確認
SELECT
    tc.table_name,
    tc.constraint_name,
    tc.constraint_type,
    kcu.column_name,
    ccu.table_name AS foreign_table_name,
    ccu.column_name AS foreign_column_name
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
    ON tc.constraint_name = kcu.constraint_name
    AND tc.table_schema = kcu.table_schema
JOIN information_schema.constraint_column_usage AS ccu
    ON ccu.constraint_name = tc.constraint_name
    AND ccu.table_schema = tc.table_schema
WHERE tc.constraint_type = 'FOREIGN KEY'
    AND tc.table_schema = 'public'
    AND tc.table_name IN ('user_profiles', 'tasks', 'comments', 'meetings', 'notifications')
ORDER BY tc.table_name, tc.constraint_name;

-- 6. インデックスの確認
SELECT
    schemaname,
    tablename,
    indexname,
    indexdef
FROM pg_indexes
WHERE schemaname = 'public'
    AND tablename IN ('user_profiles', 'tasks', 'comments', 'meetings', 'notifications')
ORDER BY tablename, indexname;

-- 7. RLSポリシーの確認
SELECT
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual,
    with_check
FROM pg_policies
WHERE schemaname = 'public'
    AND tablename IN ('user_profiles', 'tasks', 'comments', 'meetings', 'notifications')
ORDER BY tablename, policyname;

-- 8. データの件数確認
SELECT 'user_profiles' as table_name, COUNT(*) as count FROM user_profiles
UNION ALL
SELECT 'tasks' as table_name, COUNT(*) as count FROM tasks
UNION ALL
SELECT 'comments' as table_name, COUNT(*) as count FROM comments
UNION ALL
SELECT 'meetings' as table_name, COUNT(*) as count FROM meetings
UNION ALL
SELECT 'notifications' as table_name, COUNT(*) as count FROM notifications
ORDER BY table_name;
