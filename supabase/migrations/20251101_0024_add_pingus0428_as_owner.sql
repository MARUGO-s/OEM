-- pingus0428@gmail.com を「パテ・ド・カンパーニュ OEM開発」プロジェクトのオーナーとして追加

DO $$
DECLARE
    target_project_id UUID;
    target_user_id UUID;
BEGIN
    -- プロジェクトIDを取得
    SELECT id INTO target_project_id
    FROM projects
    WHERE name = 'パテ・ド・カンパーニュ OEM開発'
    LIMIT 1;

    IF target_project_id IS NULL THEN
        RAISE EXCEPTION 'プロジェクト「パテ・ド・カンパーニュ OEM開発」が見つかりません';
    END IF;

    -- ユーザーIDを取得（user_profilesテーブルからemailで検索）
    SELECT id INTO target_user_id
    FROM user_profiles
    WHERE email = 'pingus0428@gmail.com'
    LIMIT 1;

    IF target_user_id IS NULL THEN
        RAISE EXCEPTION 'メールアドレス pingus0428@gmail.com のユーザーが見つかりません。まずユーザー登録を行ってください。';
    END IF;

    -- 既にメンバーとして登録されているかチェック
    IF EXISTS (
        SELECT 1 FROM project_members
        WHERE project_id = target_project_id
        AND user_id = target_user_id
    ) THEN
        -- 既にメンバーとして登録されている場合は、ロールをオーナーに更新
        UPDATE project_members
        SET role = 'owner'
        WHERE project_id = target_project_id
        AND user_id = target_user_id;
        
        RAISE NOTICE 'ユーザーは既にメンバーとして登録されています。ロールをオーナーに更新しました。';
    ELSE
        -- メンバーとして登録されていない場合は、オーナーとして追加
        INSERT INTO project_members (project_id, user_id, role)
        VALUES (target_project_id, target_user_id, 'owner')
        ON CONFLICT (project_id, user_id) DO UPDATE
        SET role = 'owner';
        
        RAISE NOTICE 'ユーザーをオーナーとして追加しました。';
    END IF;

END $$;

