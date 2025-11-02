-- ⚠️ このマイグレーションは無限再帰を引き起こすため、無効化されました
-- 代わりに 20251102_0003_complete_fix_project_members_rls.sql を使用してください

-- project_membersテーブルのRLSポリシーを修正
-- メンバーは自分の所属プロジェクトの他のメンバー（特にオーナー）の情報を閲覧可能にする

-- ⚠️ 注意：このポリシーは循環参照を引き起こすため、実行しないでください
-- 以下のコードは参考用にコメントアウトされています

/*
-- メンバーは自分の所属プロジェクトの全メンバーを閲覧可能
DROP POLICY IF EXISTS "members_can_view_project_members" ON project_members;

CREATE POLICY "members_can_view_project_members" ON project_members
    FOR SELECT USING (
        -- 自分がメンバーとして登録されているプロジェクトのメンバー情報を閲覧可能
        project_id IN (
            SELECT project_id FROM project_members
            WHERE user_id = auth.uid()
        )
    );

-- 既存のポリシーも保持（プロジェクト作成者・オーナー・管理者用）
-- project_creators_can_view_all_members は既に存在するため、そのまま使用
*/

