-- シンプル版：リアルタイム機能の基本確認

-- ========================================
-- 1. パブリケーションの基本情報
-- ========================================
SELECT 
    'パブリケーション' as "項目",
    pubname as "名前",
    CASE 
        WHEN puballtables THEN 'すべてのテーブル'
        ELSE '特定のテーブルのみ'
    END as "対象"
FROM pg_publication 
WHERE pubname = 'supabase_realtime';

-- ========================================
-- 2. パブリケーションに含まれるテーブル一覧
-- ========================================
SELECT 
    'テーブル' as "項目",
    tablename as "名前",
    '✅ 含まれている' as "状態"
FROM pg_publication_tables 
WHERE pubname = 'supabase_realtime'
ORDER BY tablename;

-- ========================================
-- 3. テーブルのREPLICA IDENTITY設定
-- ========================================
SELECT 
    'テーブル' as "項目",
    c.relname as "名前",
    CASE c.relreplident
        WHEN 'f' THEN '✅ Full'
        WHEN 'd' THEN '⚠️ Default'
        WHEN 'n' THEN '❌ Nothing'
        ELSE '❓ Unknown'
    END as "REPLICA IDENTITY"
FROM pg_class c 
JOIN pg_namespace n ON n.oid = c.relnamespace 
WHERE n.nspname = 'public' 
AND c.relname IN ('tasks', 'comments', 'notifications', 'meetings')
ORDER BY c.relname;

-- ========================================
-- 4. リアルタイムポリシーの確認
-- ========================================
SELECT 
    'ポリシー' as "項目",
    tablename as "テーブル",
    policyname as "名前",
    '✅ 存在' as "状態"
FROM pg_policies 
WHERE schemaname = 'public' 
AND tablename IN ('tasks', 'comments', 'notifications', 'meetings')
AND policyname LIKE '%realtime%'
ORDER BY tablename;

-- ========================================
-- 5. 最終的な状態確認
-- ========================================
SELECT 
    '🎯 リアルタイム機能の状態' as "確認項目",
    CASE 
        WHEN EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
        THEN '✅ パブリケーション存在'
        ELSE '❌ パブリケーション不在'
    END as "パブリケーション",
    CASE 
        WHEN EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename IN ('tasks', 'comments', 'notifications', 'meetings'))
        THEN '✅ テーブル含まれている'
        ELSE '❌ テーブル含まれていない'
    END as "テーブル",
    CASE 
        WHEN EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename IN ('tasks', 'comments', 'notifications', 'meetings') AND policyname LIKE '%realtime%')
        THEN '✅ ポリシー存在'
        ELSE '❌ ポリシー不在'
    END as "ポリシー";
