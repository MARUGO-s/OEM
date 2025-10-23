-- 段階的実行版：Supabaseリアルタイム機能の有効化

-- ========================================
-- ステップ1: テーブルのREPLICA IDENTITY設定
-- ========================================
-- 各テーブルを個別に実行してください

-- タスクテーブル
ALTER TABLE tasks REPLICA IDENTITY FULL;

-- コメントテーブル
ALTER TABLE comments REPLICA IDENTITY FULL;

-- 通知テーブル
ALTER TABLE notifications REPLICA IDENTITY FULL;

-- 会議テーブル
ALTER TABLE meetings REPLICA IDENTITY FULL;

-- ========================================
-- ステップ2: パブリケーションにテーブルを追加
-- ========================================
-- 各テーブルを個別に実行してください

-- タスクテーブルをパブリケーションに追加
ALTER PUBLICATION supabase_realtime ADD TABLE tasks;

-- コメントテーブルをパブリケーションに追加
ALTER PUBLICATION supabase_realtime ADD TABLE comments;

-- 通知テーブルをパブリケーションに追加
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;

-- 会議テーブルをパブリケーションに追加
ALTER PUBLICATION supabase_realtime ADD TABLE meetings;

-- ========================================
-- ステップ3: 既存ポリシーの削除
-- ========================================
-- 既存のポリシーを削除（エラーを避けるため）

DROP POLICY IF EXISTS "Enable realtime for tasks" ON tasks;
DROP POLICY IF EXISTS "Enable realtime for comments" ON comments;
DROP POLICY IF EXISTS "Enable realtime for notifications" ON notifications;
DROP POLICY IF EXISTS "Enable realtime for meetings" ON meetings;

-- ========================================
-- ステップ4: リアルタイムポリシーの作成
-- ========================================
-- 各ポリシーを個別に実行してください

-- タスクテーブルのリアルタイムポリシー
CREATE POLICY "Enable realtime for tasks" ON tasks
FOR ALL USING (true);

-- コメントテーブルのリアルタイムポリシー
CREATE POLICY "Enable realtime for comments" ON comments
FOR ALL USING (true);

-- 通知テーブルのリアルタイムポリシー
CREATE POLICY "Enable realtime for notifications" ON notifications
FOR ALL USING (true);

-- 会議テーブルのリアルタイムポリシー
CREATE POLICY "Enable realtime for meetings" ON meetings
FOR ALL USING (true);
