-- 修正版：現在のリアルタイム機能の設定状況を確認

-- ========================================
-- 1. パブリケーションの確認
-- ========================================
SELECT 
    '📋 パブリケーション情報' as "Section",
    pubname as "Publication Name",
    puballtables as "All Tables",
    pubinsert as "Insert",
    pubupdate as "Update", 
    pubdelete as "Delete",
    pubtruncate as "Truncate"
FROM pg_publication 
WHERE pubname = 'supabase_realtime';

-- ========================================
-- 2. パブリケーションに含まれるテーブルの確認
-- ========================================
SELECT 
    '📊 パブリケーション内のテーブル' as "Section",
    pubname as "Publication",
    schemaname as "Schema",
    tablename as "Table"
FROM pg_publication_tables 
WHERE pubname = 'supabase_realtime'
ORDER BY tablename;

-- ========================================
-- 3. テーブルのREPLICA IDENTITY確認（修正版）
-- ========================================
SELECT 
    '🔧 テーブルのREPLICA IDENTITY設定' as "Section",
    n.nspname as "Schema",
    c.relname as "Table",
    CASE c.relreplident
        WHEN 'd' THEN 'Default (Primary Key)'
        WHEN 'n' THEN 'Nothing'
        WHEN 'f' THEN 'Full ✅'
        WHEN 'i' THEN 'Index'
        ELSE 'Unknown'
    END as "Replica Identity"
FROM pg_class c 
JOIN pg_namespace n ON n.oid = c.relnamespace 
WHERE n.nspname = 'public' 
AND c.relname IN ('tasks', 'comments', 'notifications', 'meetings')
ORDER BY c.relname;

-- ========================================
-- 4. ポリシーの確認
-- ========================================
SELECT 
    '🛡️ リアルタイムポリシー' as "Section",
    schemaname as "Schema",
    tablename as "Table",
    policyname as "Policy Name",
    permissive as "Permissive",
    roles as "Roles",
    cmd as "Command",
    qual as "Condition"
FROM pg_policies 
WHERE schemaname = 'public' 
AND tablename IN ('tasks', 'comments', 'notifications', 'meetings')
AND policyname LIKE '%realtime%'
ORDER BY tablename, policyname;

-- ========================================
-- 5. テーブルの存在確認
-- ========================================
SELECT 
    '📋 テーブル存在確認' as "Section",
    table_name as "Table Name",
    table_type as "Table Type",
    '✅ 存在' as "Status"
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('tasks', 'comments', 'notifications', 'meetings')
ORDER BY table_name;

-- ========================================
-- 6. リアルタイム機能の全体的な状態確認
-- ========================================
SELECT 
    '🎯 リアルタイム機能の状態' as "Check",
    CASE 
        WHEN EXISTS (
            SELECT 1 FROM pg_publication 
            WHERE pubname = 'supabase_realtime'
        ) THEN '✅ Publication exists'
        ELSE '❌ Publication missing'
    END as "Publication",
    CASE 
        WHEN EXISTS (
            SELECT 1 FROM pg_publication_tables 
            WHERE pubname = 'supabase_realtime'
            AND tablename IN ('tasks', 'comments', 'notifications', 'meetings')
        ) THEN '✅ Tables in publication'
        ELSE '❌ Tables not in publication'
    END as "Tables",
    CASE 
        WHEN EXISTS (
            SELECT 1 FROM pg_policies 
            WHERE schemaname = 'public'
            AND tablename IN ('tasks', 'comments', 'notifications', 'meetings')
            AND policyname LIKE '%realtime%'
        ) THEN '✅ Realtime policies exist'
        ELSE '❌ Realtime policies missing'
    END as "Policies",
    CASE 
        WHEN EXISTS (
            SELECT 1 FROM pg_class c 
            JOIN pg_namespace n ON n.oid = c.relnamespace 
            WHERE n.nspname = 'public' 
            AND c.relname IN ('tasks', 'comments', 'notifications', 'meetings')
            AND c.relreplident = 'f'
        ) THEN '✅ Replica Identity set to FULL'
        ELSE '❌ Replica Identity not set to FULL'
    END as "Replica Identity";
