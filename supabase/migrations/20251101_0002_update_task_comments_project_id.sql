-- タスクコメントにproject_idを設定するマイグレーション
-- 既存のコメントに対して、関連するタスクのproject_idを設定

-- task_commentsテーブルにproject_id列が存在することを確認
-- (既に前回のマイグレーションで追加済みのはず)

-- 既存のコメントに対してproject_idを設定
UPDATE task_comments tc
SET project_id = t.project_id
FROM tasks t
WHERE tc.task_id = t.id
  AND tc.project_id IS NULL;

-- 確認用: 更新されたレコード数を表示
DO $$
DECLARE
    updated_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO updated_count
    FROM task_comments
    WHERE project_id IS NOT NULL;

    RAISE NOTICE 'project_idが設定されたコメント数: %', updated_count;
END $$;
