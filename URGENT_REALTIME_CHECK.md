# 🚨 緊急：Supabaseリアルタイム機能の確認事項

## 発見された問題
Supabaseダッシュボードで「Coming Soon」と「Early Access」が表示されており、リアルタイム機能が制限されている可能性があります。

## 確認すべき項目

### 1. Publication設定の確認
- **アクセス**: Supabaseダッシュボード → Database → Publications
- **確認項目**: 
  - `supabase_realtime` パブリケーションが存在するか
  - `tasks`, `comments`, `notifications`, `meetings` テーブルが含まれているか

### 2. リアルタイム機能の有効化
- **アクセス**: Supabaseダッシュボード → Database → Replication
- **確認項目**:
  - 「Request early access」ボタンをクリック
  - リアルタイム機能の早期アクセスを申請

### 3. テーブルレベルの設定確認
- **アクセス**: Supabaseダッシュボード → Database → Tables
- **確認項目**:
  - 各テーブルで「Row Level Security (RLS)」が有効になっているか
  - リアルタイム機能が有効になっているか

## 緊急対処法

### 1. リアルタイム機能の手動有効化
```sql
-- リアルタイム機能を有効化
ALTER PUBLICATION supabase_realtime ADD TABLE tasks;
ALTER PUBLICATION supabase_realtime ADD TABLE comments;
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE meetings;
```

### 2. パブリケーションの確認
```sql
-- 現在のパブリケーション設定を確認
SELECT * FROM pg_publication WHERE pubname = 'supabase_realtime';
SELECT * FROM pg_publication_tables WHERE pubname = 'supabase_realtime';
```

### 3. テーブルレベルの設定
```sql
-- 各テーブルでリアルタイム機能を有効化
ALTER TABLE tasks REPLICA IDENTITY FULL;
ALTER TABLE comments REPLICA IDENTITY FULL;
ALTER TABLE notifications REPLICA IDENTITY FULL;
ALTER TABLE meetings REPLICA IDENTITY FULL;
```

## 次のステップ

1. **Supabaseダッシュボードで「Request early access」をクリック**
2. **Database → Publications で設定を確認**
3. **必要に応じて上記のSQLを実行**
4. **アプリをリロードしてテスト**

## 注意事項
- これらの設定変更はSupabaseダッシュボードのSQL Editorで実行可能
- 変更後はアプリの完全リロードが必要
- モバイル環境でのテストを必ず実施
