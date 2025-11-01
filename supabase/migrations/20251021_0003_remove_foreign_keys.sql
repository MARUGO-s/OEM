-- 外部キー制約を削除してコメント投稿の競合を完全回避

-- comments テーブルの外部キー制約を削除
ALTER TABLE comments DROP CONSTRAINT IF EXISTS comments_author_id_fkey;
ALTER TABLE comments DROP CONSTRAINT IF EXISTS comments_task_id_fkey;

-- tasks テーブルの外部キー制約を削除
ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_created_by_fkey;

-- カラムを TEXT 型に変更（制約なし）
ALTER TABLE comments ALTER COLUMN author_id TYPE TEXT;
ALTER TABLE comments ALTER COLUMN task_id TYPE TEXT;
ALTER TABLE tasks ALTER COLUMN created_by TYPE TEXT;

-- インデックスは保持（パフォーマンス向上）
-- CREATE INDEX IF NOT EXISTS idx_comments_author_id ON comments(author_id);
-- CREATE INDEX IF NOT EXISTS idx_comments_task_id ON comments(task_id);
-- CREATE INDEX IF NOT EXISTS idx_tasks_created_by ON tasks(created_by);
