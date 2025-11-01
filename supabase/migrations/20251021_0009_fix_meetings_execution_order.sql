-- meetings テーブルの完全修復（正しい実行順序）
-- エラー: 42P01 "relation meetings does not exist" を解決

-- 1. 既存の meetings テーブルを削除（存在する場合のみ）
DROP TABLE IF EXISTS meetings CASCADE;

-- 2. meetings テーブルを再作成（完全版）
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

-- 3. インデックスの作成
CREATE INDEX IF NOT EXISTS idx_meetings_start_time ON meetings(start_time);
CREATE INDEX IF NOT EXISTS idx_meetings_created_by ON meetings(created_by);
CREATE INDEX IF NOT EXISTS idx_meetings_status ON meetings(status);

-- 4. RLS（Row Level Security）の有効化
ALTER TABLE meetings ENABLE ROW LEVEL SECURITY;

-- 5. RLSポリシーの作成
CREATE POLICY "Allow all access to meetings" ON meetings FOR ALL USING (true) WITH CHECK (true);

-- 6. リアルタイム機能の有効化
ALTER PUBLICATION supabase_realtime ADD TABLE meetings;

-- 7. サンプルデータの挿入
INSERT INTO meetings (id, title, start_time, duration, participants, meet_url, status, created_by, created_at, updated_at) VALUES
('meeting-1', 'OEM商品企画会議', '2025-10-25 10:00:00+00', 60, ARRAY['manager', 'designer', 'engineer'], 'https://meet.google.com/abc-defg-hij', 'scheduled', (SELECT id FROM user_profiles WHERE username = 'manager' LIMIT 1), '2025-10-20 09:00:00+00', '2025-10-20 09:00:00+00'),
('meeting-2', '品質管理レビュー', '2025-10-26 14:00:00+00', 90, ARRAY['manager', 'quality'], 'https://meet.google.com/xyz-uvwx-rst', 'scheduled', (SELECT id FROM user_profiles WHERE username = 'manager' LIMIT 1), '2025-10-20 09:00:00+00', '2025-10-20 09:00:00+00'),
('meeting-3', '市場調査結果報告', '2025-10-27 16:00:00+00', 45, ARRAY['manager', 'marketing'], 'https://meet.google.com/mno-pqrs-tuv', 'scheduled', (SELECT id FROM user_profiles WHERE username = 'manager' LIMIT 1), '2025-10-20 09:00:00+00', '2025-10-20 09:00:00+00')
ON CONFLICT (id) DO NOTHING;

