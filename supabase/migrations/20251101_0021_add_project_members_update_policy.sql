-- project_membersテーブルに対するUPDATE権限を追加
-- 権限変更機能を有効にするため

-- 既存のUPDATEポリシーを削除（念のため）
DROP POLICY IF EXISTS "オーナーまたは管理者はメンバー権限を更新可能" ON project_members;

-- UPDATEポリシーを追加
CREATE POLICY "オーナーまたは管理者はメンバー権限を更新可能" ON project_members
    FOR UPDATE USING (
        project_id IN (
            SELECT project_id FROM project_members
            WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
        )
    )
    WITH CHECK (
        project_id IN (
            SELECT project_id FROM project_members
            WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
        )
    );

COMMENT ON POLICY "オーナーまたは管理者はメンバー権限を更新可能" ON project_members IS 
'プロジェクトのオーナーまたは管理者は、メンバーの権限（role）を更新可能';

