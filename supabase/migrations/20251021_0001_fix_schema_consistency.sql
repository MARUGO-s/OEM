-- スキーマ整合性修正マイグレーション
-- 2025-10-21: tasks.created_by を username から id 参照に変更

-- 既存の外部キー制約を削除
ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_created_by_fkey;

-- created_by カラムを UUID 型に変更
ALTER TABLE tasks ALTER COLUMN created_by TYPE UUID USING (
    SELECT id FROM user_profiles WHERE username = tasks.created_by
);

-- 新しい外部キー制約を追加
ALTER TABLE tasks ADD CONSTRAINT tasks_created_by_fkey 
    FOREIGN KEY (created_by) REFERENCES user_profiles(id) ON DELETE SET NULL;

-- 既存データの更新（username から id に変換）
UPDATE tasks SET created_by = (
    SELECT id FROM user_profiles WHERE username = tasks.created_by
) WHERE created_by IS NOT NULL AND created_by::text ~ '^[a-zA-Z_][a-zA-Z0-9_]*$';

-- インデックスの再作成
DROP INDEX IF EXISTS idx_tasks_created_by;
CREATE INDEX IF NOT EXISTS idx_tasks_created_by ON tasks(created_by);
