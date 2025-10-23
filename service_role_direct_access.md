# 🔑 Service Role Key を使用した直接アクセス方法

## Service Role Key の情報
```
Key: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1yam9jamNwcGpuanh0dWRlYnRhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MDg1OTk0OSwiZXhwIjoyMDc2NDM1OTQ5fQ.JRjv6UowDMwLQ1sIKTSK1_04PXmIL5JQk91u8MDMy9c
```

## 直接アクセス可能な機能

### 1. ブラウザでの直接テスト
- **ファイル**: `direct_realtime_fix.html` を開く
- **機能**: Service Role Key でリアルタイム機能を直接テスト
- **確認項目**: データベース接続、リアルタイムサブスクリプション、テストデータ挿入

### 2. Supabaseダッシュボードでの直接設定

#### **API設定の確認・修正**
1. **アクセス**: [Supabaseダッシュボード](https://supabase.com/dashboard)
2. **プロジェクト**: `mrjocjcppjnjxtudebta` を選択
3. **Settings** → **API** をクリック
4. **「Exposed schemas」** に `public` が含まれているか確認
5. 含まれていない場合は `public` を追加

#### **Realtime設定の確認・修正**
1. **Realtime** → **Settings** をクリック
2. **「Enable Realtime service」** が ON になっているか確認
3. **「Allow public access」** が ON になっているか確認

#### **Policies設定の確認・修正**
1. **Realtime** → **Policies** をクリック
2. **「Create policy」** をクリック
3. 以下のポリシーを作成：

```sql
-- タスクテーブルのリアルタイムアクセス許可
CREATE POLICY "Enable realtime for tasks" ON tasks
FOR ALL USING (true);

-- コメントテーブルのリアルタイムアクセス許可
CREATE POLICY "Enable realtime for comments" ON comments
FOR ALL USING (true);

-- 通知テーブルのリアルタイムアクセス許可
CREATE POLICY "Enable realtime for notifications" ON notifications
FOR ALL USING (true);

-- 会議テーブルのリアルタイムアクセス許可
CREATE POLICY "Enable realtime for meetings" ON meetings
FOR ALL USING (true);
```

### 3. データベース設定の確認

#### **テーブルレベルの設定**
1. **Database** → **Tables** をクリック
2. 各テーブル（`tasks`, `comments`, `notifications`, `meetings`）で以下を確認：
   - **Row Level Security (RLS)**: 有効になっているか
   - **Replica Identity**: `FULL` に設定されているか

#### **Publications設定の確認**
1. **Database** → **Publications** をクリック
2. **`supabase_realtime`** パブリケーションが存在するか確認
3. 対象テーブルが含まれているか確認

### 4. 直接SQL実行（SQL Editor）

#### **アクセス方法**
1. **Supabaseダッシュボード** → **SQL Editor**
2. 以下のSQLを実行：

```sql
-- 1. テーブルのREPLICA IDENTITYを確認・設定
ALTER TABLE tasks REPLICA IDENTITY FULL;
ALTER TABLE comments REPLICA IDENTITY FULL;
ALTER TABLE notifications REPLICA IDENTITY FULL;
ALTER TABLE meetings REPLICA IDENTITY FULL;

-- 2. パブリケーションにテーブルを追加
ALTER PUBLICATION supabase_realtime ADD TABLE tasks;
ALTER PUBLICATION supabase_realtime ADD TABLE comments;
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE meetings;

-- 3. リアルタイムポリシーを作成
CREATE POLICY IF NOT EXISTS "Enable realtime for tasks" ON tasks
FOR ALL USING (true);

CREATE POLICY IF NOT EXISTS "Enable realtime for comments" ON comments
FOR ALL USING (true);

CREATE POLICY IF NOT EXISTS "Enable realtime for notifications" ON notifications
FOR ALL USING (true);

CREATE POLICY IF NOT EXISTS "Enable realtime for meetings" ON meetings
FOR ALL USING (true);
```

### 5. 設定確認用SQL

```sql
-- パブリケーションの確認
SELECT * FROM pg_publication WHERE pubname = 'supabase_realtime';

-- パブリケーションに含まれるテーブルの確認
SELECT * FROM pg_publication_tables WHERE pubname = 'supabase_realtime';

-- テーブルのREPLICA IDENTITY確認
SELECT schemaname, tablename, relreplident 
FROM pg_class c 
JOIN pg_namespace n ON n.oid = c.relnamespace 
WHERE n.nspname = 'public' 
AND c.relname IN ('tasks', 'comments', 'notifications', 'meetings');

-- ポリシーの確認
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual 
FROM pg_policies 
WHERE schemaname = 'public' 
AND tablename IN ('tasks', 'comments', 'notifications', 'meetings');
```

## 修正後の確認手順

### 1. アプリの完全リロード
- ブラウザのキャッシュをクリア
- アプリを完全にリロード
- ログインし直す

### 2. リアルタイム機能のテスト
- PCとスマートフォンで同時にアプリを開く
- PCでコメントやタスクを追加
- スマートフォンでリアルタイム更新を確認

### 3. コンソールログの確認
```javascript
// 以下のログが表示されることを確認
✅ タスクのリアルタイム更新が有効になりました
✅ コメントのリアルタイム更新が有効になりました
✅ 通知のリアルタイム更新が有効になりました
```

## 重要な注意事項

### 1. Service Role Key の権限
- **管理者権限**: データベースのすべての操作が可能
- **セキュリティ**: このキーは絶対に公開しないでください
- **使用目的**: 開発・デバッグ用途のみ

### 2. 設定変更の影響
- **即座に反映**: 設定変更後は即座にアプリに反映されます
- **テスト必須**: 変更後は必ずPCとスマートフォンでテストしてください

### 3. 問題が解決しない場合
- **ブラウザキャッシュ**: 完全にクリアしてください
- **Service Worker**: リセットしてください
- **アプリリロード**: 完全にリロードしてください
