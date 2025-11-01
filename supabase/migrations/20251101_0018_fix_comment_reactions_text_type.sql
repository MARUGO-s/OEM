-- コメントリアクション機能のデータ型修正
-- task_commentsとdiscussion_commentsのidはTEXT型のため、comment_reactionsとcomment_read_statusのcomment_idもTEXT型に変更

-- 1. 既存のデータをバックアップ（念のため）
-- 注意: 本番環境ではこのバックアップを適用してください

-- 2. comment_reactionsテーブルを再作成
DROP TABLE IF EXISTS comment_reactions CASCADE;

CREATE TABLE comment_reactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    comment_id TEXT NOT NULL,  -- TEXT型に変更
    comment_type TEXT NOT NULL CHECK (comment_type IN ('task_comment', 'discussion_comment')),
    user_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
    reaction TEXT NOT NULL CHECK (reaction IN ('thumbs_up', 'heart', 'celebration', 'eyes', 'rocket', 'fire')),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
    UNIQUE(comment_id, comment_type, user_id, reaction)
);

-- 3. comment_read_statusテーブルを再作成
DROP TABLE IF EXISTS comment_read_status CASCADE;

CREATE TABLE comment_read_status (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    comment_id TEXT NOT NULL,  -- TEXT型に変更
    comment_type TEXT NOT NULL CHECK (comment_type IN ('task_comment', 'discussion_comment')),
    user_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    is_read BOOLEAN DEFAULT FALSE,
    read_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
    UNIQUE(comment_id, comment_type, user_id)
);

-- 4. インデックスの作成
CREATE INDEX IF NOT EXISTS idx_comment_reactions_comment
ON comment_reactions(comment_id, comment_type);

CREATE INDEX IF NOT EXISTS idx_comment_reactions_user
ON comment_reactions(user_id, project_id);

CREATE INDEX IF NOT EXISTS idx_comment_read_status_user
ON comment_read_status(user_id, project_id, is_read);

CREATE INDEX IF NOT EXISTS idx_comment_read_status_comment
ON comment_read_status(comment_id, comment_type);

-- 5. RLSポリシーの設定

-- comment_reactions
ALTER TABLE comment_reactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ユーザーは所属プロジェクトのリアクションを閲覧可能" ON comment_reactions
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM project_members
            WHERE project_members.project_id = comment_reactions.project_id
            AND project_members.user_id = auth.uid()
        )
    );

CREATE POLICY "ユーザーはリアクションを追加可能" ON comment_reactions
    FOR INSERT WITH CHECK (
        user_id = auth.uid() AND
        EXISTS (
            SELECT 1 FROM project_members
            WHERE project_members.project_id = comment_reactions.project_id
            AND project_members.user_id = auth.uid()
        )
    );

CREATE POLICY "ユーザーは自分のリアクションを削除可能" ON comment_reactions
    FOR DELETE USING (user_id = auth.uid());

-- comment_read_status
ALTER TABLE comment_read_status ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ユーザーは自分の既読状態を閲覧可能" ON comment_read_status
    FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "ユーザーは既読状態を作成可能" ON comment_read_status
    FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "ユーザーは自分の既読状態を更新可能" ON comment_read_status
    FOR UPDATE USING (user_id = auth.uid());

-- 6. リアクション集計用のビュー（パフォーマンス向上）
CREATE OR REPLACE VIEW comment_reaction_summary AS
SELECT
    comment_id,
    comment_type,
    reaction,
    COUNT(*) as count,
    ARRAY_AGG(user_id) as user_ids
FROM comment_reactions
GROUP BY comment_id, comment_type, reaction;

-- 7. 未読コメント数を取得するための関数
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

-- 8. リアルタイム機能の有効化
ALTER TABLE comment_reactions REPLICA IDENTITY FULL;
ALTER TABLE comment_read_status REPLICA IDENTITY FULL;

ALTER PUBLICATION supabase_realtime ADD TABLE comment_reactions;
ALTER PUBLICATION supabase_realtime ADD TABLE comment_read_status;

-- 9. コメント
COMMENT ON TABLE comment_reactions IS 'コメントへのリアクション（いいね、ハートなど）。comment_idはTEXT型';
COMMENT ON TABLE comment_read_status IS 'コメントの既読/未読状態管理。comment_idはTEXT型';

