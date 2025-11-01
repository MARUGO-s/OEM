-- 閲覧者（viewer）ロールの権限制限を追加
-- viewer は閲覧のみ可能、member/admin/owner は全操作可能

-- 1. tasks テーブルのポリシーを修正
DROP POLICY IF EXISTS "プロジェクトメンバーはタスクにアクセス可能" ON tasks;

-- viewer は閲覧のみ、それ以外は全操作可能
CREATE POLICY "プロジェクト閲覧者はタスクを閲覧可能" ON tasks
    FOR SELECT USING (
        project_id IN (
            SELECT project_id FROM project_members WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "プロジェクトメンバー以上はタスクを作成・更新・削除可能" ON tasks
    FOR ALL USING (
        project_id IN (
            SELECT project_id FROM project_members 
            WHERE user_id = auth.uid() AND role IN ('owner', 'admin', 'member')
        )
    );

-- 2. task_comments テーブルのポリシーを修正
DROP POLICY IF EXISTS "プロジェクトメンバーはタスクコメントにアクセス可能" ON task_comments;

CREATE POLICY "プロジェクト閲覧者はタスクコメントを閲覧可能" ON task_comments
    FOR SELECT USING (
        project_id IN (
            SELECT project_id FROM project_members WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "プロジェクトメンバー以上はタスクコメントを作成・更新・削除可能" ON task_comments
    FOR ALL USING (
        project_id IN (
            SELECT project_id FROM project_members 
            WHERE user_id = auth.uid() AND role IN ('owner', 'admin', 'member')
        )
    );

-- 3. discussion_comments テーブルのポリシーを修正
DROP POLICY IF EXISTS "プロジェクトメンバーは意見交換コメントにアクセス可能" ON discussion_comments;

CREATE POLICY "プロジェクト閲覧者は意見交換コメントを閲覧可能" ON discussion_comments
    FOR SELECT USING (
        project_id IN (
            SELECT project_id FROM project_members WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "プロジェクトメンバー以上は意見交換コメントを作成・更新・削除可能" ON discussion_comments
    FOR ALL USING (
        project_id IN (
            SELECT project_id FROM project_members 
            WHERE user_id = auth.uid() AND role IN ('owner', 'admin', 'member')
        )
    );

-- 4. meetings テーブルのポリシーを修正
DROP POLICY IF EXISTS "プロジェクトメンバーは会議にアクセス可能" ON meetings;

CREATE POLICY "プロジェクト閲覧者は会議を閲覧可能" ON meetings
    FOR SELECT USING (
        project_id IN (
            SELECT project_id FROM project_members WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "プロジェクトメンバー以上は会議を作成・更新・削除可能" ON meetings
    FOR ALL USING (
        project_id IN (
            SELECT project_id FROM project_members 
            WHERE user_id = auth.uid() AND role IN ('owner', 'admin', 'member')
        )
    );

-- 5. comment_reactions テーブルのポリシーを修正
DROP POLICY IF EXISTS "ユーザーはリアクションを追加可能" ON comment_reactions;

CREATE POLICY "プロジェクト閲覧者はリアクションを閲覧可能" ON comment_reactions
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM project_members
            WHERE project_members.project_id = comment_reactions.project_id
            AND project_members.user_id = auth.uid()
        )
    );

CREATE POLICY "プロジェクトメンバー以上はリアクションを追加可能" ON comment_reactions
    FOR INSERT WITH CHECK (
        user_id = auth.uid() AND
        project_id IN (
            SELECT project_id FROM project_members 
            WHERE user_id = auth.uid() AND role IN ('owner', 'admin', 'member')
        )
    );

-- 6. comment_read_status は全員が利用可能（既読状態は個人のデータ）
-- 既存のポリシーのまま

-- 7. notifications テーブル（もし存在する場合）
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'notifications') THEN
        DROP POLICY IF EXISTS "Allow all access to notifications" ON notifications;
        
        CREATE POLICY "プロジェクト閲覧者は通知を閲覧可能" ON notifications
            FOR SELECT USING (
                project_id IS NULL OR project_id IN (
                    SELECT project_id FROM project_members WHERE user_id = auth.uid()
                )
            );
        
        CREATE POLICY "プロジェクトメンバー以上は通知を作成・更新・削除可能" ON notifications
            FOR ALL USING (
                project_id IS NULL OR project_id IN (
                    SELECT project_id FROM project_members 
                    WHERE user_id = auth.uid() AND role IN ('owner', 'admin', 'member')
                )
            );
    END IF;
END $$;

-- コメント
COMMENT ON COLUMN project_members.role IS '役割: owner(削除可能) > admin(メンバー管理) > member(編集可能) > viewer(閲覧のみ)';

