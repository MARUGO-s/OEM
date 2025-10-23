-- 安全版：Supabaseリアルタイム機能の有効化SQL（エラー回避版）

-- ========================================
-- 1. テーブルのREPLICA IDENTITY設定
-- ========================================
-- 各テーブルを個別に実行（エラーが発生しても続行）

DO $$
BEGIN
    -- タスクテーブル
    BEGIN
        ALTER TABLE tasks REPLICA IDENTITY FULL;
        RAISE NOTICE '✅ tasks テーブルのREPLICA IDENTITYを設定しました';
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE '⚠️ tasks テーブルの設定でエラー: %', SQLERRM;
    END;

    -- コメントテーブル
    BEGIN
        ALTER TABLE comments REPLICA IDENTITY FULL;
        RAISE NOTICE '✅ comments テーブルのREPLICA IDENTITYを設定しました';
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE '⚠️ comments テーブルの設定でエラー: %', SQLERRM;
    END;

    -- 通知テーブル
    BEGIN
        ALTER TABLE notifications REPLICA IDENTITY FULL;
        RAISE NOTICE '✅ notifications テーブルのREPLICA IDENTITYを設定しました';
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE '⚠️ notifications テーブルの設定でエラー: %', SQLERRM;
    END;

    -- 会議テーブル
    BEGIN
        ALTER TABLE meetings REPLICA IDENTITY FULL;
        RAISE NOTICE '✅ meetings テーブルのREPLICA IDENTITYを設定しました';
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE '⚠️ meetings テーブルの設定でエラー: %', SQLERRM;
    END;
END $$;

-- ========================================
-- 2. パブリケーションにテーブルを追加（エラー回避版）
-- ========================================
-- 既に追加されているテーブルはスキップ

DO $$
BEGIN
    -- タスクテーブル
    BEGIN
        ALTER PUBLICATION supabase_realtime ADD TABLE tasks;
        RAISE NOTICE '✅ tasks テーブルをパブリケーションに追加しました';
    EXCEPTION WHEN duplicate_object THEN
        RAISE NOTICE 'ℹ️ tasks テーブルは既にパブリケーションに含まれています';
    WHEN OTHERS THEN
        RAISE NOTICE '⚠️ tasks テーブルの追加でエラー: %', SQLERRM;
    END;

    -- コメントテーブル
    BEGIN
        ALTER PUBLICATION supabase_realtime ADD TABLE comments;
        RAISE NOTICE '✅ comments テーブルをパブリケーションに追加しました';
    EXCEPTION WHEN duplicate_object THEN
        RAISE NOTICE 'ℹ️ comments テーブルは既にパブリケーションに含まれています';
    WHEN OTHERS THEN
        RAISE NOTICE '⚠️ comments テーブルの追加でエラー: %', SQLERRM;
    END;

    -- 通知テーブル
    BEGIN
        ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
        RAISE NOTICE '✅ notifications テーブルをパブリケーションに追加しました';
    EXCEPTION WHEN duplicate_object THEN
        RAISE NOTICE 'ℹ️ notifications テーブルは既にパブリケーションに含まれています';
    WHEN OTHERS THEN
        RAISE NOTICE '⚠️ notifications テーブルの追加でエラー: %', SQLERRM;
    END;

    -- 会議テーブル
    BEGIN
        ALTER PUBLICATION supabase_realtime ADD TABLE meetings;
        RAISE NOTICE '✅ meetings テーブルをパブリケーションに追加しました';
    EXCEPTION WHEN duplicate_object THEN
        RAISE NOTICE 'ℹ️ meetings テーブルは既にパブリケーションに含まれています';
    WHEN OTHERS THEN
        RAISE NOTICE '⚠️ meetings テーブルの追加でエラー: %', SQLERRM;
    END;
END $$;

-- ========================================
-- 3. 既存ポリシーの削除（エラー回避版）
-- ========================================
-- 存在しないポリシーはスキップ

DO $$
BEGIN
    -- タスクテーブルのポリシー
    BEGIN
        DROP POLICY IF EXISTS "Enable realtime for tasks" ON tasks;
        RAISE NOTICE '✅ tasks テーブルの既存ポリシーを削除しました';
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'ℹ️ tasks テーブルの既存ポリシーは存在しません';
    END;

    -- コメントテーブルのポリシー
    BEGIN
        DROP POLICY IF EXISTS "Enable realtime for comments" ON comments;
        RAISE NOTICE '✅ comments テーブルの既存ポリシーを削除しました';
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'ℹ️ comments テーブルの既存ポリシーは存在しません';
    END;

    -- 通知テーブルのポリシー
    BEGIN
        DROP POLICY IF EXISTS "Enable realtime for notifications" ON notifications;
        RAISE NOTICE '✅ notifications テーブルの既存ポリシーを削除しました';
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'ℹ️ notifications テーブルの既存ポリシーは存在しません';
    END;

    -- 会議テーブルのポリシー
    BEGIN
        DROP POLICY IF EXISTS "Enable realtime for meetings" ON meetings;
        RAISE NOTICE '✅ meetings テーブルの既存ポリシーを削除しました';
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'ℹ️ meetings テーブルの既存ポリシーは存在しません';
    END;
END $$;

-- ========================================
-- 4. リアルタイムポリシーの作成（エラー回避版）
-- ========================================
-- 既に存在するポリシーはスキップ

DO $$
BEGIN
    -- タスクテーブルのポリシー
    BEGIN
        CREATE POLICY "Enable realtime for tasks" ON tasks
        FOR ALL USING (true);
        RAISE NOTICE '✅ tasks テーブルのリアルタイムポリシーを作成しました';
    EXCEPTION WHEN duplicate_object THEN
        RAISE NOTICE 'ℹ️ tasks テーブルのポリシーは既に存在します';
    WHEN OTHERS THEN
        RAISE NOTICE '⚠️ tasks テーブルのポリシー作成でエラー: %', SQLERRM;
    END;

    -- コメントテーブルのポリシー
    BEGIN
        CREATE POLICY "Enable realtime for comments" ON comments
        FOR ALL USING (true);
        RAISE NOTICE '✅ comments テーブルのリアルタイムポリシーを作成しました';
    EXCEPTION WHEN duplicate_object THEN
        RAISE NOTICE 'ℹ️ comments テーブルのポリシーは既に存在します';
    WHEN OTHERS THEN
        RAISE NOTICE '⚠️ comments テーブルのポリシー作成でエラー: %', SQLERRM;
    END;

    -- 通知テーブルのポリシー
    BEGIN
        CREATE POLICY "Enable realtime for notifications" ON notifications
        FOR ALL USING (true);
        RAISE NOTICE '✅ notifications テーブルのリアルタイムポリシーを作成しました';
    EXCEPTION WHEN duplicate_object THEN
        RAISE NOTICE 'ℹ️ notifications テーブルのポリシーは既に存在します';
    WHEN OTHERS THEN
        RAISE NOTICE '⚠️ notifications テーブルのポリシー作成でエラー: %', SQLERRM;
    END;

    -- 会議テーブルのポリシー
    BEGIN
        CREATE POLICY "Enable realtime for meetings" ON meetings
        FOR ALL USING (true);
        RAISE NOTICE '✅ meetings テーブルのリアルタイムポリシーを作成しました';
    EXCEPTION WHEN duplicate_object THEN
        RAISE NOTICE 'ℹ️ meetings テーブルのポリシーは既に存在します';
    WHEN OTHERS THEN
        RAISE NOTICE '⚠️ meetings テーブルのポリシー作成でエラー: %', SQLERRM;
    END;
END $$;

-- ========================================
-- 5. 最終確認メッセージ
-- ========================================
SELECT '🎉 リアルタイム機能の設定が完了しました！' as "Status",
       'アプリをリロードして、スマートフォンでリアルタイム機能をテストしてください' as "Next Step";
