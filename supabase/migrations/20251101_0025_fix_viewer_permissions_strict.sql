-- 閲覧者（viewer）の編集権限を厳密に制限
-- FOR ALLではなく、INSERT/UPDATE/DELETEを個別に制限する

-- 1. tasks テーブルのポリシーを修正
-- 既存のポリシーをすべて削除
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (SELECT policyname FROM pg_policies WHERE tablename = 'tasks') LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON tasks', r.policyname);
    END LOOP;
END $$;

-- SELECTは全員（viewer含む）が可能
CREATE POLICY "tasks_viewer_select" ON tasks
    FOR SELECT USING (
        project_id IN (
            SELECT project_id FROM project_members WHERE user_id = auth.uid()
        )
    );

-- INSERT/UPDATE/DELETEはmember以上のみ
CREATE POLICY "tasks_member_insert" ON tasks
    FOR INSERT WITH CHECK (
        project_id IN (
            SELECT project_id FROM project_members 
            WHERE user_id = auth.uid() AND role IN ('owner', 'admin', 'member')
        )
    );

CREATE POLICY "tasks_member_update" ON tasks
    FOR UPDATE USING (
        project_id IN (
            SELECT project_id FROM project_members 
            WHERE user_id = auth.uid() AND role IN ('owner', 'admin', 'member')
        )
    );

CREATE POLICY "tasks_member_delete" ON tasks
    FOR DELETE USING (
        project_id IN (
            SELECT project_id FROM project_members 
            WHERE user_id = auth.uid() AND role IN ('owner', 'admin', 'member')
        )
    );

-- 2. task_comments テーブルのポリシーを修正
-- 既存のポリシーをすべて削除（名前に部分一致するものも含む）
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (SELECT policyname FROM pg_policies WHERE tablename = 'task_comments') LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON task_comments', r.policyname);
    END LOOP;
END $$;

CREATE POLICY "task_comments_viewer_select" ON task_comments
    FOR SELECT USING (
        project_id IN (
            SELECT project_id FROM project_members WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "task_comments_member_insert" ON task_comments
    FOR INSERT WITH CHECK (
        project_id IN (
            SELECT project_id FROM project_members 
            WHERE user_id = auth.uid() AND role IN ('owner', 'admin', 'member')
        )
    );

CREATE POLICY "task_comments_member_update" ON task_comments
    FOR UPDATE USING (
        project_id IN (
            SELECT project_id FROM project_members 
            WHERE user_id = auth.uid() AND role IN ('owner', 'admin', 'member')
        )
    );

CREATE POLICY "task_comments_member_delete" ON task_comments
    FOR DELETE USING (
        project_id IN (
            SELECT project_id FROM project_members 
            WHERE user_id = auth.uid() AND role IN ('owner', 'admin', 'member')
        )
    );

-- 3. discussion_comments テーブルのポリシーを修正
-- 既存のポリシーをすべて削除
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (SELECT policyname FROM pg_policies WHERE tablename = 'discussion_comments') LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON discussion_comments', r.policyname);
    END LOOP;
END $$;

CREATE POLICY "discussion_comments_viewer_select" ON discussion_comments
    FOR SELECT USING (
        project_id IN (
            SELECT project_id FROM project_members WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "discussion_comments_member_insert" ON discussion_comments
    FOR INSERT WITH CHECK (
        project_id IN (
            SELECT project_id FROM project_members 
            WHERE user_id = auth.uid() AND role IN ('owner', 'admin', 'member')
        )
    );

CREATE POLICY "discussion_comments_member_update" ON discussion_comments
    FOR UPDATE USING (
        project_id IN (
            SELECT project_id FROM project_members 
            WHERE user_id = auth.uid() AND role IN ('owner', 'admin', 'member')
        )
    );

CREATE POLICY "discussion_comments_member_delete" ON discussion_comments
    FOR DELETE USING (
        project_id IN (
            SELECT project_id FROM project_members 
            WHERE user_id = auth.uid() AND role IN ('owner', 'admin', 'member')
        )
    );

-- 4. meetings テーブルのポリシーを修正
-- 既存のポリシーをすべて削除
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (SELECT policyname FROM pg_policies WHERE tablename = 'meetings') LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON meetings', r.policyname);
    END LOOP;
END $$;

CREATE POLICY "meetings_viewer_select" ON meetings
    FOR SELECT USING (
        project_id IN (
            SELECT project_id FROM project_members WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "meetings_member_insert" ON meetings
    FOR INSERT WITH CHECK (
        project_id IN (
            SELECT project_id FROM project_members 
            WHERE user_id = auth.uid() AND role IN ('owner', 'admin', 'member')
        )
    );

CREATE POLICY "meetings_member_update" ON meetings
    FOR UPDATE USING (
        project_id IN (
            SELECT project_id FROM project_members 
            WHERE user_id = auth.uid() AND role IN ('owner', 'admin', 'member')
        )
    );

CREATE POLICY "meetings_member_delete" ON meetings
    FOR DELETE USING (
        project_id IN (
            SELECT project_id FROM project_members 
            WHERE user_id = auth.uid() AND role IN ('owner', 'admin', 'member')
        )
    );

-- 5. comment_reactions テーブルのポリシーを修正
-- SELECTとINSERTは既存のポリシーを使用、DELETEのみ修正
DROP POLICY IF EXISTS "ユーザーは自分のリアクションを削除可能" ON comment_reactions;
DROP POLICY IF EXISTS "プロジェクトメンバー以上は自分のリアクションを削除可能" ON comment_reactions;

CREATE POLICY "comment_reactions_member_delete" ON comment_reactions
    FOR DELETE USING (
        user_id = auth.uid() AND
        project_id IN (
            SELECT project_id FROM project_members 
            WHERE user_id = auth.uid() AND role IN ('owner', 'admin', 'member')
        )
    );

-- 6. notifications テーブル（もし存在する場合）
DO $$
DECLARE
    r RECORD;
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'notifications') THEN
        -- 既存のポリシーをすべて削除
        FOR r IN (SELECT policyname FROM pg_policies WHERE tablename = 'notifications') LOOP
            EXECUTE format('DROP POLICY IF EXISTS %I ON notifications', r.policyname);
        END LOOP;
        
        CREATE POLICY "notifications_viewer_select" ON notifications
            FOR SELECT USING (
                project_id IS NULL OR project_id IN (
                    SELECT project_id FROM project_members WHERE user_id = auth.uid()
                )
            );
        
        CREATE POLICY "notifications_member_insert" ON notifications
            FOR INSERT WITH CHECK (
                project_id IS NULL OR project_id IN (
                    SELECT project_id FROM project_members 
                    WHERE user_id = auth.uid() AND role IN ('owner', 'admin', 'member')
                )
            );
        
        CREATE POLICY "notifications_member_update" ON notifications
            FOR UPDATE USING (
                project_id IS NULL OR project_id IN (
                    SELECT project_id FROM project_members 
                    WHERE user_id = auth.uid() AND role IN ('owner', 'admin', 'member')
                )
            );
        
        CREATE POLICY "notifications_member_delete" ON notifications
            FOR DELETE USING (
                project_id IS NULL OR project_id IN (
                    SELECT project_id FROM project_members 
                    WHERE user_id = auth.uid() AND role IN ('owner', 'admin', 'member')
                )
            );
    END IF;
END $$;

