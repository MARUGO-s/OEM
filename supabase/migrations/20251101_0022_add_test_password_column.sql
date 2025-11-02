-- ユーザープロファイルテーブルにテスト用パスワードカラムを追加
-- 管理画面でユーザーのパスワードを表示するために使用

-- test_password カラムを追加（NULL許可、テスト用の平文パスワードを保存）
ALTER TABLE user_profiles 
ADD COLUMN IF NOT EXISTS test_password TEXT;

-- 既存ユーザーにデフォルトパスワードを設定
-- ユーザー名をベースにパスワードを設定（例: usernameと同じ）
UPDATE user_profiles 
SET test_password = username
WHERE test_password IS NULL;

