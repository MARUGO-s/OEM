-- Supabaseリアルタイム機能の状態確認

-- 1. リアルタイム機能が有効なテーブルの確認
SELECT 
    schemaname,
    tablename,
    rowsecurity
FROM pg_tables 
WHERE schemaname = 'public' 
AND tablename IN ('tasks', 'comments', 'notifications', 'meetings');

-- 2. リアルタイム機能の設定確認
SELECT 
    name,
    setting,
    unit,
    context
FROM pg_settings 
WHERE name LIKE '%realtime%' OR name LIKE '%logical%';

-- 3. パブリケーションの確認（PostgreSQLの論理レプリケーション）
SELECT 
    pubname,
    puballtables,
    pubinsert,
    pubupdate,
    pubdelete,
    pubtruncate
FROM pg_publication;

-- 4. テーブルのレプリケーション設定確認
SELECT 
    schemaname,
    tablename,
    hasindexes,
    hasrules,
    hastriggers
FROM pg_tables 
WHERE schemaname = 'public' 
AND tablename IN ('tasks', 'comments', 'notifications', 'meetings');

-- 5. 拡張機能の確認
SELECT 
    extname,
    extversion,
    extrelocatable
FROM pg_extension 
WHERE extname IN ('supabase_realtime', 'pg_cron', 'pg_stat_statements');
