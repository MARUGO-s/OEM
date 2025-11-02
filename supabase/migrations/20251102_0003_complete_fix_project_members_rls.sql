-- project_membersテーブルのRLSポリシーを完全に再構築
-- 無限再帰問題を根本的に解決

-- 1. 既存の全てのSELECTポリシーを削除
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
        RAISE NOTICE '削除されたポリシー: %', r.policyname;
    END LOOP;
END $$;

-- 2. is_project_member関数を作成または置き換え
-- この関数は20251101_0027_fix_projects_rls_cycle.sqlで定義されているが、念のため再定義
-- CREATE OR REPLACEにより、既に存在する場合は置き換えられる
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

-- 3. プロジェクト作成者チェック用関数を更新
-- 注意：この関数内でもproject_membersを参照するため、SECURITY DEFINERでRLSをバイパス
CREATE OR REPLACE FUNCTION public.is_project_creator_or_admin(project_uuid UUID, user_uuid UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
BEGIN
    -- SECURITY DEFINERにより、この関数内のクエリはRLSをバイパス
    
    -- プロジェクト作成者かチェック（projectsテーブルから直接）
    IF EXISTS (
        SELECT 1 FROM public.projects
        WHERE id = project_uuid
        AND created_by = user_uuid
    ) THEN
        RETURN TRUE;
    END IF;
    
    -- オーナーまたは管理者かチェック
    -- SECURITY DEFINERにより、RLSをバイパスしてproject_membersテーブルにアクセス可能
    RETURN EXISTS (
        SELECT 1 FROM public.project_members
        WHERE project_id = project_uuid
        AND user_id = user_uuid
        AND role IN ('owner', 'admin')
    );
END;
$$;

-- 4. 新しいRLSポリシーを定義（循環参照を回避）

-- 4-1. 自分のメンバーシップ情報は誰でも閲覧可能
CREATE POLICY "users_can_view_own_membership" ON project_members
    FOR SELECT USING (user_id = auth.uid());

-- 4-2. プロジェクトメンバーは自分の所属プロジェクトの他のメンバーも閲覧可能
-- SECURITY DEFINER関数を使用して循環参照を回避
CREATE POLICY "members_can_view_project_members" ON project_members
    FOR SELECT USING (
        public.is_project_member(project_id, auth.uid())
    );

-- 4-3. プロジェクト作成者・オーナー・管理者は全メンバーを閲覧可能
-- SECURITY DEFINER関数を使用して循環参照を回避
CREATE POLICY "project_creators_can_view_all_members" ON project_members
    FOR SELECT USING (
        public.is_project_creator_or_admin(project_id, auth.uid())
    );

-- 5. ポリシーの優先順位を確認
-- 複数のポリシーがマッチする場合、いずれかが許可されればアクセス可能（OR条件）
-- 上記の3つのポリシーは、いずれかが真であればSELECT可能

