-- データベーススキーマの直接修正
-- SupabaseのSQLエディターで実行してください

BEGIN;

-- 1. 既存のテーブルとポリシーを削除（安全に）
DROP TABLE IF EXISTS notifications CASCADE;
DROP TABLE IF EXISTS meetings CASCADE;
DROP TABLE IF EXISTS comments CASCADE;
DROP TABLE IF EXISTS tasks CASCADE;
DROP TABLE IF EXISTS user_profiles CASCADE;

-- 2. user_profilesテーブルを作成
CREATE TABLE user_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username TEXT UNIQUE NOT NULL,
    display_name TEXT,
    email TEXT UNIQUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

-- 3. tasksテーブルを作成
CREATE TABLE tasks (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    priority TEXT NOT NULL DEFAULT 'medium',
    deadline DATE,
    created_by UUID REFERENCES user_profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

-- 4. commentsテーブルを作成
CREATE TABLE comments (
    id TEXT PRIMARY KEY,
    task_id TEXT REFERENCES tasks(id) ON DELETE CASCADE,
    author_id UUID REFERENCES user_profiles(id) ON DELETE SET NULL,
    author_username TEXT,
    content TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

-- 5. meetingsテーブルを作成
CREATE TABLE meetings (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    start_time TIMESTAMP WITH TIME ZONE NOT NULL,
    duration INTEGER NOT NULL,
    participants TEXT[] NOT NULL,
    meet_url TEXT,
    status TEXT NOT NULL DEFAULT 'scheduled',
    created_by UUID REFERENCES user_profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
    meeting_code TEXT,
    calendar_event_id TEXT
);

-- 6. notificationsテーブルを作成
CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type TEXT NOT NULL,
    message TEXT NOT NULL,
    related_id TEXT,
    created_by UUID REFERENCES user_profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

-- 7. インデックスの作成
CREATE INDEX idx_tasks_created_by ON tasks(created_by);
CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_tasks_deadline ON tasks(deadline);
CREATE INDEX idx_comments_task_id ON comments(task_id);
CREATE INDEX idx_comments_author_id ON comments(author_id);
CREATE INDEX idx_meetings_start_time ON meetings(start_time);
CREATE INDEX idx_meetings_created_by ON meetings(created_by);
CREATE INDEX idx_notifications_created_by ON notifications(created_by);
CREATE INDEX idx_notifications_type ON notifications(type);

-- 8. RLS（Row Level Security）の有効化
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE meetings ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- 9. RLSポリシーの作成
CREATE POLICY "Allow all access to user_profiles" ON user_profiles FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to tasks" ON tasks FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to comments" ON comments FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to meetings" ON meetings FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to notifications" ON notifications FOR ALL USING (true) WITH CHECK (true);

-- 10. リアルタイム機能の有効化
ALTER PUBLICATION supabase_realtime ADD TABLE tasks;
ALTER PUBLICATION supabase_realtime ADD TABLE comments;
ALTER PUBLICATION supabase_realtime ADD TABLE meetings;
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;

COMMIT;

-- 完了メッセージ
SELECT 'Schema has been successfully recreated' as status;
