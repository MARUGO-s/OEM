-- Notifications table and Meetings extensions

-- 通知テーブル
CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY DEFAULT concat('notification_', to_char(EXTRACT(EPOCH FROM now())*1000, 'FM999999999999999')),
  type TEXT NOT NULL DEFAULT 'general',
  message TEXT NOT NULL,
  related_id TEXT,
  recipient TEXT,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
  read BOOLEAN NOT NULL DEFAULT false
);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to notifications" ON notifications FOR ALL USING (true) WITH CHECK (true);
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;

CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(read);

-- 会議テーブルの拡張列（テーブルが存在する場合のみ）
DO $$
BEGIN
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'meetings') THEN
        ALTER TABLE meetings ADD COLUMN IF NOT EXISTS meeting_code TEXT;
        ALTER TABLE meetings ADD COLUMN IF NOT EXISTS calendar_event_id TEXT;
        ALTER TABLE meetings ADD COLUMN IF NOT EXISTS created_by UUID;
    END IF;
END $$;



