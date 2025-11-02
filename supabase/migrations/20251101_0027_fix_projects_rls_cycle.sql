-- projectsテーブルのRLSポリシーを修正して循環参照を解決
-- セキュリティ関数を使用してRLSの再帰的評価を回避

-- 既存のSELECTポリシーをすべて削除
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (
        SELECT policyname 
        FROM pg_policies 
        WHERE tablename = 'projects' 
        AND cmd = 'SELECT'
    ) LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON projects', r.policyname);
    END LOOP;
END $$;

-- セキュリティ関数を作成（RLSの再帰的評価を回避）
CREATE OR REPLACE FUNCTION public.is_project_member(project_uuid UUID, user_uuid UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
BEGIN
    -- SECURITY DEFINERにより、この関数はRLSをバイパスしてproject_membersテーブルにアクセス可能
    RETURN EXISTS (
        SELECT 1 FROM public.project_members
        WHERE project_id = project_uuid
        AND user_id = user_uuid
    );
END;
$$;

-- プロジェクト作成者は自分が作成したプロジェクトを閲覧可能
CREATE POLICY "project_creators_can_view_own_projects" ON projects
    FOR SELECT USING (created_by = auth.uid());

-- プロジェクトメンバーは所属プロジェクトを閲覧可能
-- セキュリティ関数を使用して循環参照を回避
CREATE POLICY "project_members_can_view_projects" ON projects
    FOR SELECT USING (
        public.is_project_member(projects.id, auth.uid())
    );

