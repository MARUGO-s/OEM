-- 会議議事録アップロード機能のためのテーブル拡張とストレージ設定

ALTER TABLE public.meetings
    ADD COLUMN IF NOT EXISTS minutes_path TEXT,
    ADD COLUMN IF NOT EXISTS minutes_public_url TEXT,
    ADD COLUMN IF NOT EXISTS minutes_file_name TEXT,
    ADD COLUMN IF NOT EXISTS minutes_uploaded_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS minutes_uploaded_by UUID,
    ADD COLUMN IF NOT EXISTS minutes_history JSONB DEFAULT '[]'::jsonb;

INSERT INTO storage.buckets (id, name, public)
VALUES ('meeting-minutes', 'meeting-minutes', true)
ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'storage'
          AND tablename = 'objects'
          AND policyname = 'Allow authenticated upload meeting minutes'
    ) THEN
        CREATE POLICY "Allow authenticated upload meeting minutes"
        ON storage.objects
        FOR INSERT
        WITH CHECK (
            bucket_id = 'meeting-minutes'
            AND auth.role() = 'authenticated'
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'storage'
          AND tablename = 'objects'
          AND policyname = 'Allow authenticated delete meeting minutes'
    ) THEN
        CREATE POLICY "Allow authenticated delete meeting minutes"
        ON storage.objects
        FOR DELETE
        USING (
            bucket_id = 'meeting-minutes'
            AND auth.role() = 'authenticated'
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'storage'
          AND tablename = 'objects'
          AND policyname = 'Allow public read meeting minutes'
    ) THEN
        CREATE POLICY "Allow public read meeting minutes"
        ON storage.objects
        FOR SELECT
        USING (
            bucket_id = 'meeting-minutes'
        );
    END IF;
END $$;

