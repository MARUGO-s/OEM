-- ディスカッション機能強化のマイグレーション
-- リアクション、スレッド、メンション、未読管理機能を追加

-- 1. リアクション機能のテーブル
CREATE TABLE IF NOT EXISTS comment_reactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    comment_id UUID NOT NULL,
    comment_type TEXT NOT NULL CHECK (comment_type IN ('task_comment', 'discussion_comment')),
    user_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
    reaction TEXT NOT NULL CHECK (reaction IN ('thumbs_up', 'heart', 'celebration', 'eyes', 'rocket', 'fire')),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
    UNIQUE(comment_id, comment_type, user_id, reaction)
);

-- 2. task_commentsにスレッドとメンション機能を追加
-- 注: idがTEXT型のため、parent_idもTEXT型にする
ALTER TABLE task_comments
ADD COLUMN IF NOT EXISTS parent_id TEXT REFERENCES task_comments(id) ON DELETE CASCADE,
ADD COLUMN IF NOT EXISTS mentions TEXT[] DEFAULT '{}';

-- 3. discussion_commentsにスレッドとメンション機能を追加
-- 注: idがTEXT型のため、parent_idもTEXT型にする
ALTER TABLE discussion_comments
ADD COLUMN IF NOT EXISTS parent_id TEXT REFERENCES discussion_comments(id) ON DELETE CASCADE,
ADD COLUMN IF NOT EXISTS mentions TEXT[] DEFAULT '{}';

-- 4. 未読管理テーブル
CREATE TABLE IF NOT EXISTS comment_read_status (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    comment_id UUID NOT NULL,
    comment_type TEXT NOT NULL CHECK (comment_type IN ('task_comment', 'discussion_comment')),
    user_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    is_read BOOLEAN DEFAULT FALSE,
    read_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
    UNIQUE(comment_id, comment_type, user_id)
);

-- インデックスの作成（パフォーマンス向上）
CREATE INDEX IF NOT EXISTS idx_comment_reactions_comment
ON comment_reactions(comment_id, comment_type);

CREATE INDEX IF NOT EXISTS idx_comment_reactions_user
ON comment_reactions(user_id, project_id);

CREATE INDEX IF NOT EXISTS idx_task_comments_parent
ON task_comments(parent_id) WHERE parent_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_discussion_comments_parent
ON discussion_comments(parent_id) WHERE parent_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_comment_read_status_user
ON comment_read_status(user_id, project_id, is_read);

CREATE INDEX IF NOT EXISTS idx_comment_read_status_comment
ON comment_read_status(comment_id, comment_type);

-- RLSポリシーの設定

-- comment_reactions
ALTER TABLE comment_reactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ユーザーは所属プロジェクトのリアクションを閲覧可能" ON comment_reactions;
CREATE POLICY "ユーザーは所属プロジェクトのリアクションを閲覧可能" ON comment_reactions
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM project_members
            WHERE project_members.project_id = comment_reactions.project_id
            AND project_members.user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "ユーザーはリアクションを追加可能" ON comment_reactions;
CREATE POLICY "ユーザーはリアクションを追加可能" ON comment_reactions
    FOR INSERT WITH CHECK (
        user_id = auth.uid() AND
        EXISTS (
            SELECT 1 FROM project_members
            WHERE project_members.project_id = comment_reactions.project_id
            AND project_members.user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "ユーザーは自分のリアクションを削除可能" ON comment_reactions;
CREATE POLICY "ユーザーは自分のリアクションを削除可能" ON comment_reactions
    FOR DELETE USING (user_id = auth.uid());

-- comment_read_status
ALTER TABLE comment_read_status ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ユーザーは自分の既読状態を閲覧可能" ON comment_read_status;
CREATE POLICY "ユーザーは自分の既読状態を閲覧可能" ON comment_read_status
    FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "ユーザーは既読状態を作成可能" ON comment_read_status;
CREATE POLICY "ユーザーは既読状態を作成可能" ON comment_read_status
    FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "ユーザーは自分の既読状態を更新可能" ON comment_read_status;
CREATE POLICY "ユーザーは自分の既読状態を更新可能" ON comment_read_status
    FOR UPDATE USING (user_id = auth.uid());

-- リアクション集計用のビュー（パフォーマンス向上）
CREATE OR REPLACE VIEW comment_reaction_summary AS
SELECT
    comment_id,
    comment_type,
    reaction,
    COUNT(*) as count,
    ARRAY_AGG(user_id) as user_ids
FROM comment_reactions
GROUP BY comment_id, comment_type, reaction;

-- 未読コメント数を取得するための関数
CREATE OR REPLACE FUNCTION get_unread_comment_count(p_user_id UUID, p_project_id UUID)
RETURNS TABLE(
    task_comment_count BIGINT,
    discussion_comment_count BIGINT,
    total_count BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        COUNT(*) FILTER (WHERE comment_type = 'task_comment' AND is_read = FALSE) as task_comment_count,
        COUNT(*) FILTER (WHERE comment_type = 'discussion_comment' AND is_read = FALSE) as discussion_comment_count,
        COUNT(*) FILTER (WHERE is_read = FALSE) as total_count
    FROM comment_read_status
    WHERE user_id = p_user_id
    AND project_id = p_project_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON TABLE comment_reactions IS 'コメントへのリアクション（いいね、ハートなど）';
COMMENT ON TABLE comment_read_status IS 'コメントの既読/未読状態管理';
COMMENT ON COLUMN task_comments.parent_id IS '返信元のコメントID（スレッド機能）';
COMMENT ON COLUMN task_comments.mentions IS 'メンションされたユーザーIDの配列';
COMMENT ON COLUMN discussion_comments.parent_id IS '返信元のコメントID（スレッド機能）';
COMMENT ON COLUMN discussion_comments.mentions IS 'メンションされたユーザーIDの配列';
