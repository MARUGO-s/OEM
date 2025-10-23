-- 安全なマイグレーション（既存の状況を確認してから実行）

-- 1. 現在のテーブル状況を確認
DO $$ 
BEGIN
    -- commentsテーブルが存在するかチェック
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'comments' AND table_schema = 'public') THEN
        RAISE NOTICE 'commentsテーブルが存在します。task_commentsにリネームします。';
        ALTER TABLE comments RENAME TO task_comments;
        RAISE NOTICE 'commentsテーブルをtask_commentsにリネームしました。';
    ELSE
        RAISE NOTICE 'commentsテーブルは存在しません。';
    END IF;
    
    -- task_commentsテーブルが存在するかチェック
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'task_comments' AND table_schema = 'public') THEN
        RAISE NOTICE 'task_commentsテーブルが存在します。';
    ELSE
        RAISE NOTICE 'task_commentsテーブルは存在しません。';
    END IF;
    
    -- discussion_commentsテーブルが存在するかチェック
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'discussion_comments' AND table_schema = 'public') THEN
        RAISE NOTICE 'discussion_commentsテーブルが存在します。';
    ELSE
        RAISE NOTICE 'discussion_commentsテーブルは存在しません。';
    END IF;
END $$;

-- 2. discussion_commentsテーブルを作成（存在しない場合のみ）
CREATE TABLE IF NOT EXISTS discussion_comments (
    id TEXT PRIMARY KEY,
    author_id UUID REFERENCES user_profiles(id) ON DELETE SET NULL,
    author_username TEXT,
    content TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

-- 3. インデックスを作成
CREATE INDEX IF NOT EXISTS idx_discussion_comments_created_at ON discussion_comments(created_at);
CREATE INDEX IF NOT EXISTS idx_discussion_comments_author_id ON discussion_comments(author_id);

-- task_commentsテーブルが存在する場合のみインデックスを作成
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'task_comments' AND table_schema = 'public') THEN
        CREATE INDEX IF NOT EXISTS idx_task_comments_task_id ON task_comments(task_id);
        CREATE INDEX IF NOT EXISTS idx_task_comments_created_at ON task_comments(created_at);
        RAISE NOTICE 'task_commentsテーブルのインデックスを作成しました。';
    END IF;
END $$;

-- 4. リアルタイム機能を有効化
ALTER TABLE discussion_comments REPLICA IDENTITY FULL;

-- task_commentsテーブルが存在する場合のみリアルタイム機能を有効化
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'task_comments' AND table_schema = 'public') THEN
        ALTER TABLE task_comments REPLICA IDENTITY FULL;
        RAISE NOTICE 'task_commentsテーブルのリアルタイム機能を有効化しました。';
    END IF;
END $$;

-- 5. 権限設定
GRANT ALL ON discussion_comments TO authenticated;

-- task_commentsテーブルが存在する場合のみ権限設定
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'task_comments' AND table_schema = 'public') THEN
        GRANT ALL ON task_comments TO authenticated;
        RAISE NOTICE 'task_commentsテーブルの権限を設定しました。';
    END IF;
END $$;

-- 6. RLS (Row Level Security) を有効化
ALTER TABLE discussion_comments ENABLE ROW LEVEL SECURITY;

-- task_commentsテーブルが存在する場合のみRLSを有効化
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'task_comments' AND table_schema = 'public') THEN
        ALTER TABLE task_comments ENABLE ROW LEVEL SECURITY;
        RAISE NOTICE 'task_commentsテーブルのRLSを有効化しました。';
    END IF;
END $$;

-- 7. ポリシーを作成
CREATE POLICY IF NOT EXISTS "認証されたユーザーは意見交換コメントを閲覧可能" ON discussion_comments
    FOR ALL USING (auth.role() = 'authenticated');

-- task_commentsテーブルが存在する場合のみポリシーを作成
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'task_comments' AND table_schema = 'public') THEN
        CREATE POLICY IF NOT EXISTS "認証されたユーザーはタスクコメントを閲覧可能" ON task_comments
            FOR ALL USING (auth.role() = 'authenticated');
        RAISE NOTICE 'task_commentsテーブルのポリシーを作成しました。';
    END IF;
END $$;

-- 8. リアルタイム公開設定
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE discussion_comments;
        RAISE NOTICE 'discussion_commentsテーブルをリアルタイム公開に追加しました。';
        
        -- task_commentsテーブルが存在する場合のみリアルタイム公開に追加
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'task_comments' AND table_schema = 'public') THEN
            ALTER PUBLICATION supabase_realtime ADD TABLE task_comments;
            RAISE NOTICE 'task_commentsテーブルをリアルタイム公開に追加しました。';
        END IF;
    END IF;
EXCEPTION
    WHEN duplicate_object THEN
        RAISE NOTICE 'テーブルは既にリアルタイム公開に追加されています。';
    WHEN OTHERS THEN
        RAISE NOTICE 'リアルタイム公開設定でエラーが発生しました: %', SQLERRM;
END $$;

-- 9. サンプルデータを追加（意見交換コメント）
INSERT INTO discussion_comments (id, author_id, author_username, content) VALUES
('discussion_001', '550e8400-e29b-41d4-a716-446655440001', 'itagawa', '新しいメニューのアイデアについて議論しましょう！'),
('discussion_002', '550e8400-e29b-41d4-a716-446655440002', 'tanaka', '季節の食材を活用した料理の提案があります'),
('discussion_003', '550e8400-e29b-41d4-a716-446655440003', 'chef', 'コストパフォーマンスを考慮したメニュー構成を検討中です')
ON CONFLICT (id) DO NOTHING;

-- 10. 最終確認
SELECT 
    'Migration completed successfully' as status,
    (SELECT COUNT(*) FROM discussion_comments) as discussion_comments_count,
    (SELECT COUNT(*) FROM task_comments) as task_comments_count;
