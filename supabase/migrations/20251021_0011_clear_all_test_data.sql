-- テストデータの完全削除
-- すべてのサンプルデータを削除してクリーンな状態にする

-- 1. すべてのコメントを削除
DELETE FROM comments;

-- 2. すべての会議を削除
DELETE FROM meetings;

-- 3. すべてのタスクを削除
DELETE FROM tasks;

-- 4. すべてのユーザープロファイルを削除（auth.usersは残す）
DELETE FROM user_profiles;

-- 5. シーケンスをリセット（UUIDは自動生成なので不要）
-- 必要に応じて、カスタムシーケンスがあればリセット

-- 6. 確認用のクエリ（実行後、すべて0件になることを確認）
-- SELECT COUNT(*) as user_count FROM user_profiles;
-- SELECT COUNT(*) as task_count FROM tasks;
-- SELECT COUNT(*) as comment_count FROM comments;
-- SELECT COUNT(*) as meeting_count FROM meetings;

-- 完了メッセージ
SELECT 'All test data has been cleared successfully' as status;

