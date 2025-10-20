-- Supabaseエラー修正用SQL
-- 段階的に実行してください

-- 1. 既存のcommentsテーブルの構造を確認
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'comments' 
ORDER BY ordinal_position;

-- 2. commentsテーブルにcreated_byカラムを追加（存在しない場合のみ）
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'comments' AND column_name = 'created_by'
    ) THEN
        ALTER TABLE comments ADD COLUMN created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;
        RAISE NOTICE 'created_by column added to comments table';
    ELSE
        RAISE NOTICE 'created_by column already exists in comments table';
    END IF;
END $$;

-- 3. 既存のコメントにデフォルトユーザーを設定（必要に応じて）
-- UPDATE comments SET created_by = (SELECT id FROM auth.users LIMIT 1) WHERE created_by IS NULL;

-- 4. created_byカラムが存在する場合のみインデックスを作成
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'comments' AND column_name = 'created_by'
    ) THEN
        CREATE INDEX IF NOT EXISTS idx_comments_created_by ON comments(created_by);
        RAISE NOTICE 'Index created for comments.created_by';
    ELSE
        RAISE NOTICE 'created_by column does not exist, skipping index creation';
    END IF;
END $$;

-- 5. テーブル構造の最終確認
SELECT 
    t.table_name,
    c.column_name,
    c.data_type,
    c.is_nullable
FROM information_schema.tables t
JOIN information_schema.columns c ON t.table_name = c.table_name
WHERE t.table_name IN ('tasks', 'comments', 'meetings', 'user_profiles')
ORDER BY t.table_name, c.ordinal_position;
