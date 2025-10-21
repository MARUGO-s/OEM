-- Initial schema migration extracted from supabase-clean-schema.sql
-- Generated on 2025-10-20

-- Supabaseスキーマ定義（OEM開発プロジェクト管理アプリ）

-- 既存のテーブルを削除（クリーンスタート）
DROP TABLE IF EXISTS meetings CASCADE;
DROP TABLE IF EXISTS comments CASCADE;
DROP TABLE IF EXISTS tasks CASCADE;
DROP TABLE IF EXISTS user_profiles CASCADE;

-- ユーザープロファイルテーブル
CREATE TABLE IF NOT EXISTS user_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username TEXT UNIQUE NOT NULL,
    display_name TEXT,
    email TEXT UNIQUE,
    password TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

-- タスクテーブル
CREATE TABLE IF NOT EXISTS tasks (
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

-- コメントテーブル
CREATE TABLE IF NOT EXISTS comments (
    id TEXT PRIMARY KEY,
    task_id TEXT REFERENCES tasks(id) ON DELETE CASCADE,
    author_id UUID REFERENCES user_profiles(id) ON DELETE SET NULL,
    author_username TEXT,
    content TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

-- 会議テーブル
CREATE TABLE IF NOT EXISTS meetings (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    start_time TIMESTAMP WITH TIME ZONE NOT NULL,
    duration INTEGER NOT NULL,
    participants TEXT[] NOT NULL,
    meet_url TEXT,
    status TEXT NOT NULL DEFAULT 'scheduled',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

-- インデックスの作成
CREATE INDEX IF NOT EXISTS idx_tasks_created_by ON tasks(created_by);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_deadline ON tasks(deadline);
CREATE INDEX IF NOT EXISTS idx_comments_task_id ON comments(task_id);
CREATE INDEX IF NOT EXISTS idx_comments_author_id ON comments(author_id);
CREATE INDEX IF NOT EXISTS idx_meetings_start_time ON meetings(start_time);

-- RLS（Row Level Security）の有効化
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE meetings ENABLE ROW LEVEL SECURITY;

-- RLSポリシー（全員が読み取り・書き込み可能）
CREATE POLICY "Allow all access to user_profiles" ON user_profiles FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to tasks" ON tasks FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to comments" ON comments FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to meetings" ON meetings FOR ALL USING (true) WITH CHECK (true);

-- リアルタイム機能の有効化
ALTER PUBLICATION supabase_realtime ADD TABLE tasks;
ALTER PUBLICATION supabase_realtime ADD TABLE comments;
ALTER PUBLICATION supabase_realtime ADD TABLE meetings;

-- サンプルデータの挿入
INSERT INTO user_profiles (username, display_name, email) VALUES
('manager', 'マネージャー', 'manager@oem-restaurant.local'),
('procurement', '調達担当', 'procurement@oem-restaurant.local'),
('chef', 'シェフ', 'chef@oem-restaurant.local'),
('quality', '品質管理', 'quality@oem-restaurant.local'),
('production', '製造担当', 'production@oem-restaurant.local'),
('design', 'デザイナー', 'design@oem-restaurant.local'),
('testing', 'テスト担当', 'testing@oem-restaurant.local'),
('logistics', '物流担当', 'logistics@oem-restaurant.local'),
('marketing', 'マーケティング', 'marketing@oem-restaurant.local'),
('final', '最終確認担当', 'final@oem-restaurant.local')
ON CONFLICT (username) DO NOTHING;

-- サンプルタスクの挿入
INSERT INTO tasks (id, title, description, status, priority, deadline, created_by, created_at, updated_at) VALUES
('task-1', '市場調査・ニーズ分析', 'ターゲット市場の調査と顧客ニーズの分析を行い、OEM商品の方向性を決定する', 'completed', 'high', '2025-10-15', (SELECT id FROM user_profiles WHERE username = 'manager'), '2025-10-01 09:00:00+00', '2025-10-15 17:00:00+00'),
('task-2', '原材料の選定・調達', '品質基準に合致する原材料の選定と安定供給体制の構築', 'in_progress', 'high', '2025-10-25', (SELECT id FROM user_profiles WHERE username = 'procurement'), '2025-10-02 09:00:00+00', '2025-10-20 14:30:00+00'),
('task-3', 'レシピ開発・試作', 'OEM商品のレシピ開発と試作品の作成・評価', 'in_progress', 'high', '2025-11-05', (SELECT id FROM user_profiles WHERE username = 'chef'), '2025-10-03 09:00:00+00', '2025-10-22 16:45:00+00'),
('task-4', '品質管理基準設定', 'OEM商品の品質管理基準とチェックリストの策定', 'pending', 'medium', '2025-11-10', (SELECT id FROM user_profiles WHERE username = 'quality'), '2025-10-04 09:00:00+00', '2025-10-04 09:00:00+00'),
('task-5', '製造ライン設計', '効率的な製造ラインの設計と設備配置の最適化', 'pending', 'high', '2025-11-15', (SELECT id FROM user_profiles WHERE username = 'production'), '2025-10-05 09:00:00+00', '2025-10-05 09:00:00+00'),
('task-6', 'パッケージング設計', 'OEM商品のパッケージデザインと梱包仕様の決定', 'pending', 'medium', '2025-11-20', (SELECT id FROM user_profiles WHERE username = 'design'), '2025-10-06 09:00:00+00', '2025-10-06 09:00:00+00'),
('task-7', '品質テスト・検証', '完成品の品質テストと顧客満足度の検証', 'pending', 'high', '2025-11-25', (SELECT id FROM user_profiles WHERE username = 'testing'), '2025-10-07 09:00:00+00', '2025-10-07 09:00:00+00'),
('task-8', '出荷プロセス構築', '効率的な出荷プロセスと物流システムの構築', 'pending', 'medium', '2025-11-30', (SELECT id FROM user_profiles WHERE username = 'logistics'), '2025-10-08 09:00:00+00', '2025-10-08 09:00:00+00'),
('task-9', 'マーケティング準備', 'OEM商品のマーケティング戦略と販促資料の準備', 'pending', 'low', '2025-12-05', (SELECT id FROM user_profiles WHERE username = 'marketing'), '2025-10-09 09:00:00+00', '2025-10-09 09:00:00+00'),
('task-10', '最終品質確認・納品開始', '最終品質確認と顧客への納品開始', 'pending', 'high', '2025-12-10', (SELECT id FROM user_profiles WHERE username = 'final'), '2025-10-10 09:00:00+00', '2025-10-10 09:00:00+00')
ON CONFLICT (id) DO NOTHING;

-- サンプルコメントの挿入（author_idは実際のuser_profilesのidを使用）
INSERT INTO comments (id, task_id, author_id, author_username, content, created_at) VALUES
('comment-1', 'task-1', (SELECT id FROM user_profiles WHERE username = 'manager'), 'manager', '市場調査が完了しました。ターゲット顧客のニーズが明確になりました。', '2025-10-15 10:30:00+00'),
('comment-2', 'task-1', (SELECT id FROM user_profiles WHERE username = 'manager'), 'manager', '競合他社の分析結果を共有します。差別化ポイントが見えてきました。', '2025-10-15 14:20:00+00'),
('comment-3', 'task-2', (SELECT id FROM user_profiles WHERE username = 'procurement'), 'procurement', '原材料のサンプルを複数業者から取得しました。品質比較を開始します。', '2025-10-20 09:15:00+00'),
('comment-4', 'task-2', (SELECT id FROM user_profiles WHERE username = 'quality'), 'quality', '原材料の品質基準を設定しました。コストと品質のバランスを検討中です。', '2025-10-21 11:45:00+00'),
('comment-5', 'task-3', (SELECT id FROM user_profiles WHERE username = 'chef'), 'chef', 'レシピの第一版が完成しました。試作品の味見を実施予定です。', '2025-10-22 16:30:00+00'),
('comment-6', 'task-3', (SELECT id FROM user_profiles WHERE username = 'chef'), 'chef', '試作品の味見結果を共有します。調整が必要な点がいくつかあります。', '2025-10-23 13:20:00+00'),
('comment-7', 'task-4', (SELECT id FROM user_profiles WHERE username = 'quality'), 'quality', '品質管理基準の草案を作成しました。レビューをお願いします。', '2025-10-24 10:00:00+00'),
('comment-8', 'task-5', (SELECT id FROM user_profiles WHERE username = 'production'), 'production', '製造ラインの設計図を作成中です。効率性を重視したレイアウトを検討しています。', '2025-10-25 14:15:00+00'),
('comment-9', 'task-6', (SELECT id FROM user_profiles WHERE username = 'design'), 'design', 'パッケージデザインのコンセプトを検討中です。ブランドイメージを重視します。', '2025-10-26 09:30:00+00'),
('comment-10', 'task-7', (SELECT id FROM user_profiles WHERE username = 'testing'), 'testing', '品質テストの計画を策定しました。包括的なテスト項目を準備中です。', '2025-10-27 11:45:00+00'),
('comment-11', 'task-8', (SELECT id FROM user_profiles WHERE username = 'logistics'), 'logistics', '出荷プロセスの効率化を検討中です。自動化できる部分を特定しています。', '2025-10-28 15:20:00+00'),
('comment-12', 'task-9', (SELECT id FROM user_profiles WHERE username = 'marketing'), 'marketing', 'ブランド戦略の方向性を検討中です。差別化ポイントを明確にします。', '2025-10-29 10:30:00+00'),
('comment-13', 'task-10', (SELECT id FROM user_profiles WHERE username = 'final'), 'final', '納品スケジュールの調整を行っています。顧客の要求に柔軟に対応します。', '2025-11-09 09:30:00+00')
ON CONFLICT (id) DO NOTHING;

-- サンプル会議の挿入
INSERT INTO meetings (id, title, start_time, duration, participants, meet_url, status, created_at, updated_at) VALUES
('meeting-1', 'OEM開発プロジェクト キックオフ会議', '2025-10-15 10:00:00+00', 90, ARRAY['manager', 'chef', 'procurement'], 'https://meet.google.com/abc-defg-hij', 'scheduled', '2025-10-01 09:00:00+00', '2025-10-01 09:00:00+00'),
('meeting-2', '原材料選定 検討会議', '2025-10-25 14:00:00+00', 60, ARRAY['procurement', 'quality', 'chef'], 'https://meet.google.com/xyz-uvwx-rst', 'scheduled', '2025-10-20 10:30:00+00', '2025-10-20 10:30:00+00'),
('meeting-3', 'レシピ開発 進捗報告会', '2025-11-05 11:00:00+00', 45, ARRAY['chef', 'quality', 'manager'], 'https://meet.google.com/mno-pqrs-tuv', 'scheduled', '2025-10-22 15:45:00+00', '2025-10-22 15:45:00+00'),
('meeting-4', '品質管理基準 レビュー会議', '2025-11-10 15:00:00+00', 75, ARRAY['quality', 'production', 'testing'], 'https://meet.google.com/ghi-jklm-nop', 'scheduled', '2025-10-24 11:20:00+00', '2025-10-24 11:20:00+00'),
('meeting-5', '最終品質確認 準備会議', '2025-12-05 09:00:00+00', 120, ARRAY['final', 'testing', 'logistics'], 'https://meet.google.com/qrs-tuvw-xyz', 'scheduled', '2025-10-30 16:00:00+00', '2025-10-30 16:00:00+00')
ON CONFLICT (id) DO NOTHING;



