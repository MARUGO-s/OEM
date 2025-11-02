-- 全ての既存プロジェクトにitagawaをオーナーとして追加

DO $$
DECLARE
    itagawa_user_id UUID;
    project_record RECORD;
    existing_member_count INTEGER;
BEGIN
    -- itagawaのユーザーIDを取得
    SELECT id INTO itagawa_user_id
    FROM user_profiles
    WHERE username = 'itagawa'
    LIMIT 1;

    IF itagawa_user_id IS NULL THEN
        RAISE EXCEPTION 'ユーザー名 "itagawa" のユーザーが見つかりません。まずユーザー登録を行ってください。';
    END IF;

    RAISE NOTICE 'itagawaのユーザーID: %', itagawa_user_id;

    -- 全てのプロジェクトを取得
    FOR project_record IN 
        SELECT id, name FROM projects
    LOOP
        -- 既にメンバーとして登録されているかチェック
        SELECT COUNT(*) INTO existing_member_count
        FROM project_members
        WHERE project_id = project_record.id
        AND user_id = itagawa_user_id;

        IF existing_member_count = 0 THEN
            -- メンバーとして登録されていない場合は、オーナーとして追加
            INSERT INTO project_members (project_id, user_id, role)
            VALUES (project_record.id, itagawa_user_id, 'owner')
            ON CONFLICT (project_id, user_id) DO UPDATE
            SET role = 'owner';
            
            RAISE NOTICE 'プロジェクト "%" (ID: %) にitagawaをオーナーとして追加しました', project_record.name, project_record.id;
        ELSE
            -- 既にメンバーとして登録されている場合は、ロールをオーナーに更新
            UPDATE project_members
            SET role = 'owner'
            WHERE project_id = project_record.id
            AND user_id = itagawa_user_id;
            
            RAISE NOTICE 'プロジェクト "%" (ID: %) のitagawaのロールをオーナーに更新しました', project_record.name, project_record.id;
        END IF;
    END LOOP;

    RAISE NOTICE '全てのプロジェクトへのitagawaの追加/更新が完了しました';
END $$;

