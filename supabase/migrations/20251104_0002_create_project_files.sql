-- プロジェクト資料ファイル管理テーブルとストレージ設定

CREATE TABLE IF NOT EXISTS public.project_files (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    file_name TEXT NOT NULL,
    file_type TEXT NOT NULL,
    file_size BIGINT NOT NULL,
    storage_path TEXT NOT NULL UNIQUE,
    public_url TEXT,
    memo TEXT,
    uploaded_by UUID REFERENCES public.user_profiles(id),
    uploaded_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_project_files_project_id
    ON public.project_files(project_id);

CREATE INDEX IF NOT EXISTS idx_project_files_project_id_uploaded_at
    ON public.project_files(project_id, uploaded_at DESC);

ALTER TABLE public.project_files ENABLE ROW LEVEL SECURITY;

INSERT INTO storage.buckets (id, name, public)
VALUES ('project-files', 'project-files', true)
ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'project_files'
          AND policyname = 'project_files_select_members'
    ) THEN
        CREATE POLICY project_files_select_members
        ON public.project_files
        FOR SELECT
        USING (
            EXISTS (
                SELECT 1 FROM public.project_members
                WHERE project_members.project_id = project_files.project_id
                  AND project_members.user_id = auth.uid()
            )
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'project_files'
          AND policyname = 'project_files_insert_owner_member'
    ) THEN
        CREATE POLICY project_files_insert_owner_member
        ON public.project_files
        FOR INSERT
        WITH CHECK (
            EXISTS (
                SELECT 1 FROM public.project_members
                WHERE project_members.project_id = project_files.project_id
                  AND project_members.user_id = auth.uid()
                  AND project_members.role IN ('owner', 'member')
            )
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'project_files'
          AND policyname = 'project_files_update_owner_member'
    ) THEN
        CREATE POLICY project_files_update_owner_member
        ON public.project_files
        FOR UPDATE
        USING (
            EXISTS (
                SELECT 1 FROM public.project_members
                WHERE project_members.project_id = project_files.project_id
                  AND project_members.user_id = auth.uid()
                  AND project_members.role IN ('owner', 'member')
            )
        )
        WITH CHECK (
            EXISTS (
                SELECT 1 FROM public.project_members
                WHERE project_members.project_id = project_files.project_id
                  AND project_members.user_id = auth.uid()
                  AND project_members.role IN ('owner', 'member')
            )
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'project_files'
          AND policyname = 'project_files_delete_owner_member'
    ) THEN
        CREATE POLICY project_files_delete_owner_member
        ON public.project_files
        FOR DELETE
        USING (
            EXISTS (
                SELECT 1 FROM public.project_members
                WHERE project_members.project_id = project_files.project_id
                  AND project_members.user_id = auth.uid()
                  AND project_members.role IN ('owner', 'member')
            )
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'storage'
          AND tablename = 'objects'
          AND policyname = 'project_files_storage_insert'
    ) THEN
        CREATE POLICY project_files_storage_insert
        ON storage.objects
        FOR INSERT
        WITH CHECK (
            bucket_id = 'project-files'
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
          AND policyname = 'project_files_storage_delete'
    ) THEN
        CREATE POLICY project_files_storage_delete
        ON storage.objects
        FOR DELETE
        USING (
            bucket_id = 'project-files'
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
          AND policyname = 'project_files_storage_select'
    ) THEN
        CREATE POLICY project_files_storage_select
        ON storage.objects
        FOR SELECT
        USING (
            bucket_id = 'project-files'
        );
    END IF;
END $$;
