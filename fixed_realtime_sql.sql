-- 修正版：Supabaseリアルタイム機能の有効化SQL

-- 1. テーブルのREPLICA IDENTITY設定
ALTER TABLE tasks REPLICA IDENTITY FULL;
ALTER TABLE comments REPLICA IDENTITY FULL;
ALTER TABLE notifications REPLICA IDENTITY FULL;
ALTER TABLE meetings REPLICA IDENTITY FULL;

-- 2. パブリケーションにテーブルを追加
ALTER PUBLICATION supabase_realtime ADD TABLE tasks;
ALTER PUBLICATION supabase_realtime ADD TABLE comments;
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE meetings;

-- 3. 既存のポリシーを削除してから新しく作成（エラー回避）
DROP POLICY IF EXISTS "Enable realtime for tasks" ON tasks;
DROP POLICY IF EXISTS "Enable realtime for comments" ON comments;
DROP POLICY IF EXISTS "Enable realtime for notifications" ON notifications;
DROP POLICY IF EXISTS "Enable realtime for meetings" ON meetings;

-- 4. リアルタイムポリシーを作成
CREATE POLICY "Enable realtime for tasks" ON tasks
FOR ALL USING (true);

CREATE POLICY "Enable realtime for comments" ON comments
FOR ALL USING (true);

CREATE POLICY "Enable realtime for notifications" ON notifications
FOR ALL USING (true);

CREATE POLICY "Enable realtime for meetings" ON meetings
FOR ALL USING (true);
