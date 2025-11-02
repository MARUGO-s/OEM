-- プロジェクト作成時のメンバー追加権限を修正
-- 新規プロジェクト作成者がメンバーを追加できるようにする

-- 既存のINSERTポリシーをすべて削除（ポリシー名のバリエーションに対応）
DROP POLICY IF EXISTS "オーナーまたは管理者はメンバーを追加可能" ON project_members;
DROP POLICY IF EXISTS "プロジェクト作成者または管理者はメンバーを追加可能" ON project_members;
DROP POLICY IF EXISTS "プロジェクト作成者または管理者はメンバーを" ON project_members;

-- 既存のポリシーをすべて削除（動的削除）
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (
        SELECT policyname 
        FROM pg_policies 
        WHERE tablename = 'project_members' 
        AND cmd = 'INSERT'
    ) LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON project_members', r.policyname);
    END LOOP;
END $$;

-- プロジェクト作成者は自分が作成したプロジェクトにメンバーを追加可能
-- 既存のオーナーまたは管理者はメンバーを追加可能
CREATE POLICY "project_creators_or_admins_can_add_members" ON project_members
    FOR INSERT WITH CHECK (
        -- 自分が作成したプロジェクトの場合（プロジェクト作成者）
        project_id IN (
            SELECT id FROM projects WHERE created_by = auth.uid()
        )
        OR
        -- 自分がオーナーまたは管理者であるプロジェクトの場合
        project_id IN (
            SELECT project_id FROM project_members
            WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
        )
    );

-- プロジェクトメンバーのSELECTポリシーをすべて削除（動的削除）
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (
        SELECT policyname 
        FROM pg_policies 
        WHERE tablename = 'project_members' 
        AND cmd = 'SELECT'
    ) LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON project_members', r.policyname);
    END LOOP;
END $$;

-- シンプルなポリシー：自分のメンバーシップのみ閲覧可能
-- プロジェクト一覧表示にはこれで十分（loadProjects関数は自分のメンバーシップのみ取得）
CREATE POLICY "users_can_view_own_membership" ON project_members
    FOR SELECT USING (user_id = auth.uid());
    
-- プロジェクト作成者は自分が作成したプロジェクトの全メンバーを閲覧可能
-- 循環参照を避けるため、projectsテーブル経由でチェック
CREATE POLICY "project_creators_can_view_all_members" ON project_members
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM projects p
            WHERE p.id = project_members.project_id
            AND p.created_by = auth.uid()
        )
    );
    
-- 注意：循環参照を避けるため、オーナー/管理者用のポリシーは削除
-- 代わりに、プロジェクト作成者のポリシーでカバーされる（プロジェクト作成者は通常オーナーとして追加される）

