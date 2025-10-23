-- 意見交換コメントとタスクコメントを分離するマイグレーション
-- Generated on 2025-10-21

-- 新しい意見交換コメントテーブルを作成
CREATE TABLE IF NOT EXISTS discussion_comments (
    id TEXT PRIMARY KEY,
    author_id UUID REFERENCES user_profiles(id) ON DELETE SET NULL,
    author_username TEXT,
    content TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

-- 既存のcommentsテーブルをtask_commentsにリネーム
ALTER TABLE comments RENAME TO task_comments;

-- インデックスを作成
CREATE INDEX IF NOT EXISTS idx_discussion_comments_created_at ON discussion_comments(created_at);
CREATE INDEX IF NOT EXISTS idx_discussion_comments_author_id ON discussion_comments(author_id);
CREATE INDEX IF NOT EXISTS idx_task_comments_task_id ON task_comments(task_id);
CREATE INDEX IF NOT EXISTS idx_task_comments_created_at ON task_comments(created_at);

-- リアルタイム機能を有効化
ALTER TABLE discussion_comments REPLICA IDENTITY FULL;
ALTER TABLE task_comments REPLICA IDENTITY FULL;

-- 既存のcommentsテーブルのリアルタイム設定を維持
-- (task_commentsとして継続)

-- サンプルデータを追加（意見交換コメント）
INSERT INTO discussion_comments (id, author_id, author_username, content) VALUES
('discussion_001', '550e8400-e29b-41d4-a716-446655440001', 'itagawa', '新しいメニューのアイデアについて議論しましょう！'),
('discussion_002', '550e8400-e29b-41d4-a716-446655440002', 'tanaka', '季節の食材を活用した料理の提案があります'),
('discussion_003', '550e8400-e29b-41d4-a716-446655440003', 'chef', 'コストパフォーマンスを考慮したメニュー構成を検討中です');

-- 権限設定
GRANT ALL ON discussion_comments TO authenticated;
GRANT ALL ON task_comments TO authenticated;

-- RLS (Row Level Security) を有効化
ALTER TABLE discussion_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_comments ENABLE ROW LEVEL SECURITY;

-- 認証されたユーザーは全データにアクセス可能
CREATE POLICY "認証されたユーザーは意見交換コメントを閲覧可能" ON discussion_comments
    FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "認証されたユーザーはタスクコメントを閲覧可能" ON task_comments
    FOR ALL USING (auth.role() = 'authenticated');

-- リアルタイム公開設定
-- discussion_commentsをsupabase_realtimeに追加
DO $$ 
BEGIN
    -- 既存のpublicationに追加
    IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE discussion_comments;
    END IF;
EXCEPTION
    WHEN duplicate_object THEN
        -- 既に追加されている場合は無視
        NULL;
END $$;
