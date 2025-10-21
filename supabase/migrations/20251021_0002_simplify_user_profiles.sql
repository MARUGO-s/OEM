-- ユーザープロファイルテーブルの簡素化
-- email の UNIQUE制約を削除して競合を回避

-- 既存の制約を削除
ALTER TABLE user_profiles DROP CONSTRAINT IF EXISTS user_profiles_email_key;

-- email カラムを NULL 許可に変更（重複を許可）
ALTER TABLE user_profiles ALTER COLUMN email DROP NOT NULL;

-- インデックスを追加（パフォーマンス向上）
CREATE INDEX IF NOT EXISTS idx_user_profiles_username ON user_profiles(username);
CREATE INDEX IF NOT EXISTS idx_user_profiles_email ON user_profiles(email);

-- 既存データのemail重複を解決
UPDATE user_profiles 
SET email = CONCAT(username, '_', SUBSTRING(id::text, 1, 8), '@hotmail.com')
WHERE email IN (
    SELECT email FROM user_profiles 
    WHERE email IS NOT NULL 
    GROUP BY email 
    HAVING COUNT(*) > 1
);
