-- メール確認を無効化するための設定
-- 注意: このマイグレーションは Supabase Dashboard での手動設定が必要

-- 1. Supabase Dashboard → Authentication → Settings で以下を設定:
--    - "Enable email confirmations" を OFF にする
--    - "Enable email change confirmations" を OFF にする

-- 2. 既存の "Waiting for verification" ユーザーを確認済み状態に更新
UPDATE auth.users 
SET email_confirmed_at = NOW(),
    confirmed_at = NOW()
WHERE email_confirmed_at IS NULL 
  AND confirmed_at IS NULL;

-- 3. ユーザープロファイルテーブルも更新
UPDATE user_profiles 
SET updated_at = NOW()
WHERE id IN (
    SELECT id FROM auth.users 
    WHERE email_confirmed_at IS NULL 
      AND confirmed_at IS NULL
);

