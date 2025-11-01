-- 複数プロジェクト対応のためのマイグレーション
-- Generated on 2025-11-01

-- プロジェクトテーブルの作成
CREATE TABLE IF NOT EXISTS projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    created_by UUID REFERENCES user_profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

-- プロジェクトメンバーテーブルの作成
CREATE TABLE IF NOT EXISTS project_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    user_id UUID REFERENCES user_profiles(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'member', -- 'owner', 'admin', 'member', 'viewer'
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
    UNIQUE(project_id, user_id)
);

-- 既存のテーブルにproject_idカラムを追加
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id) ON DELETE CASCADE;
ALTER TABLE task_comments ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id) ON DELETE CASCADE;
ALTER TABLE discussion_comments ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id) ON DELETE CASCADE;
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id) ON DELETE CASCADE;

-- 通知テーブルにもproject_idを追加（既存のnotificationsテーブルがある場合）
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'notifications') THEN
        ALTER TABLE notifications ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id) ON DELETE CASCADE;
    END IF;
END $$;

-- インデックスの作成
CREATE INDEX IF NOT EXISTS idx_projects_created_by ON projects(created_by);
CREATE INDEX IF NOT EXISTS idx_project_members_project_id ON project_members(project_id);
CREATE INDEX IF NOT EXISTS idx_project_members_user_id ON project_members(user_id);
CREATE INDEX IF NOT EXISTS idx_tasks_project_id ON tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_task_comments_project_id ON task_comments(project_id);
CREATE INDEX IF NOT EXISTS idx_discussion_comments_project_id ON discussion_comments(project_id);
CREATE INDEX IF NOT EXISTS idx_meetings_project_id ON meetings(project_id);

-- RLS（Row Level Security）の有効化
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_members ENABLE ROW LEVEL SECURITY;

-- RLSポリシー（プロジェクトメンバーのみアクセス可能）
CREATE POLICY "ユーザーは所属プロジェクトを閲覧可能" ON projects
    FOR SELECT USING (
        id IN (
            SELECT project_id FROM project_members WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "ユーザーはプロジェクトを作成可能" ON projects
    FOR INSERT WITH CHECK (created_by = auth.uid());

CREATE POLICY "プロジェクトオーナーまたは管理者は更新可能" ON projects
    FOR UPDATE USING (
        id IN (
            SELECT project_id FROM project_members
            WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
        )
    );

CREATE POLICY "プロジェクトオーナーは削除可能" ON projects
    FOR DELETE USING (
        id IN (
            SELECT project_id FROM project_members
            WHERE user_id = auth.uid() AND role = 'owner'
        )
    );

-- プロジェクトメンバーのRLSポリシー
CREATE POLICY "メンバーは所属プロジェクトのメンバーリストを閲覧可能" ON project_members
    FOR SELECT USING (
        project_id IN (
            SELECT project_id FROM project_members WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "オーナーまたは管理者はメンバーを追加可能" ON project_members
    FOR INSERT WITH CHECK (
        project_id IN (
            SELECT project_id FROM project_members
            WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
        )
    );

CREATE POLICY "オーナーまたは管理者はメンバーを削除可能" ON project_members
    FOR DELETE USING (
        project_id IN (
            SELECT project_id FROM project_members
            WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
        )
    );

-- 既存テーブルのRLSポリシーを更新（プロジェクトメンバーのみアクセス可能に）
DROP POLICY IF EXISTS "Allow all access to tasks" ON tasks;
CREATE POLICY "プロジェクトメンバーはタスクにアクセス可能" ON tasks
    FOR ALL USING (
        project_id IN (
            SELECT project_id FROM project_members WHERE user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Allow all access to comments" ON task_comments;
DROP POLICY IF EXISTS "認証されたユーザーはタスクコメントを閲覧可能" ON task_comments;
CREATE POLICY "プロジェクトメンバーはタスクコメントにアクセス可能" ON task_comments
    FOR ALL USING (
        project_id IN (
            SELECT project_id FROM project_members WHERE user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "認証されたユーザーは意見交換コメントを閲覧可能" ON discussion_comments;
CREATE POLICY "プロジェクトメンバーは意見交換コメントにアクセス可能" ON discussion_comments
    FOR ALL USING (
        project_id IN (
            SELECT project_id FROM project_members WHERE user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Allow all access to meetings" ON meetings;
CREATE POLICY "プロジェクトメンバーは会議にアクセス可能" ON meetings
    FOR ALL USING (
        project_id IN (
            SELECT project_id FROM project_members WHERE user_id = auth.uid()
        )
    );

-- リアルタイム機能の有効化
ALTER PUBLICATION supabase_realtime ADD TABLE projects;
ALTER PUBLICATION supabase_realtime ADD TABLE project_members;

-- 既存データをデフォルトプロジェクトに移行
DO $$
DECLARE
    default_project_id UUID;
    manager_user_id UUID;
BEGIN
    -- マネージャーユーザーを取得
    SELECT id INTO manager_user_id FROM user_profiles WHERE username = 'manager' LIMIT 1;

    -- デフォルトプロジェクトを作成
    INSERT INTO projects (name, description, created_by)
    VALUES (
        'パテ・ド・カンパーニュ OEM開発',
        'MARUGOオリジナルフード商品企画管理（デフォルトプロジェクト）',
        manager_user_id
    )
    RETURNING id INTO default_project_id;

    -- 全ユーザーをデフォルトプロジェクトのメンバーとして追加
    INSERT INTO project_members (project_id, user_id, role)
    SELECT default_project_id, id,
        CASE
            WHEN username = 'manager' THEN 'owner'
            ELSE 'member'
        END
    FROM user_profiles;

    -- 既存のタスクをデフォルトプロジェクトに紐付け
    UPDATE tasks SET project_id = default_project_id WHERE project_id IS NULL;

    -- 既存のコメントをデフォルトプロジェクトに紐付け
    UPDATE task_comments SET project_id = default_project_id WHERE project_id IS NULL;
    UPDATE discussion_comments SET project_id = default_project_id WHERE project_id IS NULL;

    -- 既存の会議をデフォルトプロジェクトに紐付け
    UPDATE meetings SET project_id = default_project_id WHERE project_id IS NULL;

    -- 既存の通知をデフォルトプロジェクトに紐付け（テーブルが存在する場合）
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'notifications') THEN
        EXECUTE 'UPDATE notifications SET project_id = $1 WHERE project_id IS NULL' USING default_project_id;
    END IF;
END $$;

-- project_idをNOT NULLに変更（既存データの移行後）
ALTER TABLE tasks ALTER COLUMN project_id SET NOT NULL;
ALTER TABLE task_comments ALTER COLUMN project_id SET NOT NULL;
ALTER TABLE discussion_comments ALTER COLUMN project_id SET NOT NULL;
ALTER TABLE meetings ALTER COLUMN project_id SET NOT NULL;
