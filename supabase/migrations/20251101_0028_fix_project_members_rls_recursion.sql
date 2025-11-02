-- project_membersテーブルのRLSポリシーで循環参照を解決
-- セキュリティ関数を使用してRLSの再帰的評価を回避

-- 既存のSELECTポリシーをすべて削除
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

-- セキュリティ関数を作成（RLSの再帰的評価を回避）
-- プロジェクトの作成者かオーナー/管理者かをチェック
CREATE OR REPLACE FUNCTION public.is_project_creator_or_admin(project_uuid UUID, user_uuid UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
BEGIN
    -- SECURITY DEFINERにより、この関数はRLSをバイパスしてテーブルにアクセス可能
    
    -- プロジェクト作成者かチェック
    IF EXISTS (
        SELECT 1 FROM public.projects
        WHERE id = project_uuid
        AND created_by = user_uuid
    ) THEN
        RETURN TRUE;
    END IF;
    
    -- オーナーまたは管理者かチェック
    RETURN EXISTS (
        SELECT 1 FROM public.project_members
        WHERE project_id = project_uuid
        AND user_id = user_uuid
        AND role IN ('owner', 'admin')
    );
END;
$$;

-- シンプルなポリシー：自分のメンバーシップのみ閲覧可能
CREATE POLICY "users_can_view_own_membership" ON project_members
    FOR SELECT USING (user_id = auth.uid());
    
-- プロジェクト作成者は自分が作成したプロジェクトの全メンバーを閲覧可能
-- セキュリティ関数を使用して循環参照を回避
CREATE POLICY "project_creators_can_view_all_members" ON project_members
    FOR SELECT USING (
        public.is_project_creator_or_admin(project_id, auth.uid())
    );

