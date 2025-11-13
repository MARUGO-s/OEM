-- プロジェクトファイルとタスクの紐付け機能を追加するマイグレーション
-- 実行日: 2025-11-12

-- 1. project_filesテーブルにtask_idカラムを追加（TEXT型で追加）
ALTER TABLE project_files
ADD COLUMN task_id TEXT NULL;

-- 2. tasksテーブルへの外部キー制約を追加（カスケード削除）
ALTER TABLE project_files
ADD CONSTRAINT fk_project_files_task
FOREIGN KEY (task_id)
REFERENCES tasks(id)
ON DELETE SET NULL;  -- タスクが削除された場合、紐付きをNULLにする

-- 3. パフォーマンス向上のためのインデックス追加
CREATE INDEX idx_project_files_task_id ON project_files(task_id);
CREATE INDEX idx_project_files_project_task ON project_files(project_id, task_id);

-- 4. コメント追加（テーブル説明）
COMMENT ON COLUMN project_files.task_id IS 'タスクとの紐付け（NULL=紐付きなし）';

-- ロールバック用SQL（必要な場合のみ実行）
-- DROP INDEX IF EXISTS idx_project_files_project_task;
-- DROP INDEX IF EXISTS idx_project_files_task_id;
-- ALTER TABLE project_files DROP CONSTRAINT IF EXISTS fk_project_files_task;
-- ALTER TABLE project_files DROP COLUMN IF EXISTS task_id;
