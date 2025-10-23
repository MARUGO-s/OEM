-- 現在のテーブル状況を確認
SELECT 
    schemaname,
    tablename,
    tableowner
FROM pg_tables 
WHERE schemaname = 'public' 
AND tablename IN ('comments', 'task_comments', 'discussion_comments')
ORDER BY tablename;
