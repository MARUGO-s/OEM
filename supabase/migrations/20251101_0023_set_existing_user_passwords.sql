-- 既存ユーザーにパスワードを設定
-- ユーザー名と同じ値をパスワードとして設定（テスト用）

UPDATE user_profiles 
SET test_password = username
WHERE test_password IS NULL;

-- または、すべてのユーザーに同じデフォルトパスワードを設定する場合：
-- UPDATE user_profiles 
-- SET test_password = 'password123' 
-- WHERE test_password IS NULL;

-- または、個別にパスワードを設定する場合：
-- UPDATE user_profiles 
-- SET test_password = 'custom_password' 
-- WHERE username = 'specific_username';

