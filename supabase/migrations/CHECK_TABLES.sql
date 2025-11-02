-- Supabaseダッシュボードで実行してテーブル構造を確認するSQLクエリ

-- 1. すべてのテーブル一覧を確認
SELECT table_name, table_schema
FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;

-- 2. comment_reactions テーブルの構造を確認（重要！）
SELECT 
    column_name, 
    data_type, 
    character_maximum_length,
    is_nullable
FROM information_schema.columns 
WHERE table_name = 'comment_reactions' 
AND table_schema = 'public'
ORDER BY ordinal_position;

-- 3. comment_read_status テーブルの構造を確認
SELECT 
    column_name, 
    data_type, 
    character_maximum_length,
    is_nullable
FROM information_schema.columns 
WHERE table_name = 'comment_read_status' 
AND table_schema = 'public'
ORDER BY ordinal_position;

-- 4. task_comments テーブルの id カラムの型を確認
SELECT 
    column_name, 
    data_type, 
    character_maximum_length
FROM information_schema.columns 
WHERE table_name = 'task_comments' 
AND column_name = 'id'
AND table_schema = 'public';

-- 5. discussion_comments テーブルの id カラムの型を確認
SELECT 
    column_name, 
    data_type, 
    character_maximum_length
FROM information_schema.columns 
WHERE table_name = 'discussion_comments' 
AND column_name = 'id'
AND table_schema = 'public';

-- 6. データ型不一致をチェック
-- もし不一致があれば、マイグレーション 20251101_0018 を実行する必要があります
SELECT 
    'task_comments.id' as table_column,
    tc.data_type as data_type,
    CASE 
        WHEN tc.data_type = 'text' THEN '✅ 正しい'
        ELSE '❌ 修正が必要'
    END as status
FROM information_schema.columns tc
WHERE tc.table_name = 'task_comments' 
AND tc.column_name = 'id'
AND tc.table_schema = 'public'

UNION ALL

SELECT 
    'comment_reactions.comment_id' as table_column,
    cr.data_type as data_type,
    CASE 
        WHEN cr.data_type = 'text' THEN '✅ 正しい'
        ELSE '❌ 修正が必要（UUID型は使用不可）'
    END as status
FROM information_schema.columns cr
WHERE cr.table_name = 'comment_reactions' 
AND cr.column_name = 'comment_id'
AND cr.table_schema = 'public';

-- 7. 既存のリアクションデータがあるか確認
SELECT COUNT(*) as reaction_count
FROM comment_reactions;

-- 8. プロジェクト一覧を確認
SELECT id, name, created_at
FROM projects
ORDER BY created_at DESC;

-- 9. プロジェクトメンバー数を確認
SELECT 
    p.name as project_name,
    COUNT(pm.id) as member_count
FROM projects p
LEFT JOIN project_members pm ON p.id = pm.project_id
GROUP BY p.id, p.name
ORDER BY p.created_at DESC;

-- 10. 「新店舗出展計画 2025」プロジェクトがあるか確認
SELECT 
    id, 
    name, 
    description,
    created_at
FROM projects 
WHERE name = '新店舗出展計画 2025';

