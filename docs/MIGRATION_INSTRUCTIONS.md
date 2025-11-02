# 🚀 マイグレーション実行手順

## 概要

このドキュメントは、Supabaseダッシュボードでマイグレーションを実行する手順を説明します。

**重要**: 以下の3つのマイグレーションは、**SupabaseダッシュボードのSQLエディタから手動で実行**する必要があります。

---

## 📋 実行が必要なマイグレーション

1. **`20251101_0018_fix_comment_reactions_text_type.sql`** - コメントリアクション機能のデータ型修正
2. **`20251101_0019_lively_new_store_project.sql`** - 新店舗出展計画 2025プロジェクトのサンプルデータ追加
3. **`20251101_0020_add_viewer_role_permissions.sql`** - 閲覧者ロールの権限制限を実装

---

## 🎯 実行手順

### 1. Supabaseダッシュボードにアクセス
- URL: https://supabase.com/dashboard
- プロジェクト: `mrjocjcppjnjxtudebta` を選択

### 2. SQLエディタを開く
- 左サイドバーから「SQL Editor」をクリック

### 3. 各マイグレーションを順番に実行

#### ✅ ステップ1: データ型修正のマイグレーション

**ファイル**: `supabase/migrations/20251101_0018_fix_comment_reactions_text_type.sql`

**注意事項**:
- ⚠️ **このマイグレーションは `DROP TABLE` を含みます**
- 既存のリアクションデータがすべて削除されます
- 新しく作られるテーブルは `comment_id` が TEXT型になります

**実行方法**:
1. SQLエディタで「New query」をクリック
2. ファイルの内容全体をコピー＆ペースト
3. 「Run」ボタンをクリック
4. エラーがなければ成功

**確認方法**:
```sql
-- テーブル構造を確認
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'comment_reactions' 
AND column_name = 'comment_id';
-- 結果: comment_id | text （これがTEXT型になっていればOK）
```

---

#### ✅ ステップ2: 新店舗プロジェクトのサンプルデータ追加

**ファイル**: `supabase/migrations/20251101_0019_lively_new_store_project.sql`

**内容**:
- プロジェクト「新店舗出展計画 2025」の作成
- 6つのタスク
- 8つのタスクコメント + 8つの返信
- 5つの意見交換コメント + 9つの返信
- 50以上のリアクション
- 5つの会議

**実行方法**:
1. SQLエディタで新しいクエリを作成
2. ファイルの内容全体をコピー＆ペースト
3. 「Run」ボタンをクリック
4. 成功メッセージが表示される

**確認方法**:
```sql
-- プロジェクトが作成されているか確認
SELECT id, name FROM projects WHERE name = '新店舗出展計画 2025';

-- タスク数を確認
SELECT COUNT(*) FROM tasks WHERE id LIKE 'newstore_%';

-- コメント数を確認
SELECT COUNT(*) FROM task_comments WHERE id LIKE 'newstore_%';

-- リアクション数を確認
SELECT COUNT(*) FROM comment_reactions WHERE comment_id LIKE 'newstore_%';
```

---

#### ✅ ステップ3: 閲覧者ロールの権限制限を実装

**ファイル**: `supabase/migrations/20251101_0020_add_viewer_role_permissions.sql`

**内容**:
- viewer は閲覧のみ、member/admin/owner は編集可能なようにRLSポリシーを分離
- tasks, task_comments, discussion_comments, meetings のポリシーを更新

**実行方法**:
1. SQLエディタで新しいクエリを作成
2. ファイルの内容全体をコピー＆ペースト
3. 「Run」ボタンをクリック
4. エラーがなければ成功

**確認方法**:
```sql
-- RLSポリシーが正しく設定されているか確認
SELECT * FROM pg_policies 
WHERE tablename = 'tasks' 
AND schemaname = 'public';

-- viewerロールのポリシーが存在するか確認（SELECTポリシー）
SELECT policyname, cmd 
FROM pg_policies 
WHERE tablename = 'tasks' 
AND cmd = 'SELECT';
-- 結果に「プロジェクト閲覧者はタスクを閲覧可能」が含まれていればOK
```

---

## 🛡️ 実行前の確認事項

### チェックリスト

- [ ] バックアップが必要な重要なデータは保存済み
- [ ] 本番環境ではなくテスト環境で実行（可能であれば）
- [ ] 実行するマイグレーションの内容を理解している
- [ ] エラーが発生した場合のロールバック方法を知っている

### 注意事項

1. **データ型変更（0018）**
   - 既存のリアクションデータはすべて削除されます
   - これは意図的な動作です（データ型が不一致のため）

2. **サンプルデータ追加（0019）**
   - 既にプロジェクトが存在する場合は何も実行されません（`ON CONFLICT DO NOTHING`）
   - 安全に複数回実行できます

3. **権限制限（0020）**
   - 既存のポリシーを上書きします
   - データは削除されません

---

## 🧪 動作確認

### 1. データ型修正の確認

```sql
-- comment_reactions のcomment_idがTEXT型か確認
SELECT 
    column_name, 
    data_type, 
    character_maximum_length
FROM information_schema.columns 
WHERE table_name = 'comment_reactions' 
AND column_name = 'comment_id';
```

**期待される結果**:
```
comment_id | text | NULL
```

### 2. 新店舗プロジェクトの確認

```sql
-- プロジェクトの存在確認
SELECT id, name, created_at FROM projects 
WHERE name = '新店舗出展計画 2025';

-- プロジェクトメンバーの確認
SELECT 
    pm.role,
    up.username,
    up.display_name
FROM project_members pm
JOIN user_profiles up ON pm.user_id = up.id
JOIN projects p ON pm.project_id = p.id
WHERE p.name = '新店舗出展計画 2025'
ORDER BY pm.role DESC;

-- タスクの確認
SELECT title, status, priority 
FROM tasks 
WHERE project_id IN (
    SELECT id FROM projects WHERE name = '新店舗出展計画 2025'
);

-- タスクコメントと返信の確認
SELECT 
    CASE WHEN parent_id IS NULL THEN '親コメント' ELSE '返信' END as type,
    COUNT(*) as count
FROM task_comments 
WHERE project_id IN (
    SELECT id FROM projects WHERE name = '新店舗出展計画 2025'
)
GROUP BY type;

-- リアクション数の確認
SELECT COUNT(*) as total_reactions
FROM comment_reactions 
WHERE comment_id LIKE 'newstore_%';
```

**期待される結果**:
- プロジェクトが1つ存在
- メンバーが4人（yoshito111:owner, itagawa:member, design:member, manager:admin）
- タスクが6個
- 親コメント8個、返信8個
- リアクションが50個以上

### 3. 閲覧者ロールの確認

```sql
-- tasksテーブルのポリシー確認
SELECT 
    policyname,
    cmd,
    qual,
    with_check
FROM pg_policies 
WHERE tablename = 'tasks' 
AND schemaname = 'public'
ORDER BY cmd, policyname;
```

**期待される結果**:
- `プロジェクト閲覧者はタスクを閲覧可能` (cmd: SELECT)
- `プロジェクトメンバー以上はタスクを作成・更新・削除可能` (cmd: ALL)

---

## ❌ エラーが発生した場合

### よくあるエラーと対処法

#### 1. "relation does not exist"
**原因**: テーブルが存在しない
**対処**: それより前のマイグレーションを実行していない可能性があります

```sql
-- テーブルの存在確認
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
ORDER BY table_name;
```

#### 2. "column ... does not exist"
**原因**: カラムが存在しない
**対処**: 必要なマイグレーションが実行されていない

#### 3. "permission denied"
**原因**: RLSポリシーの問題
**対処**: SQLエディタは管理者権限で実行されるため、通常は発生しません

---

## 📚 参考資料

- **データベーススキーマ**: `DATABASE_SCHEMA.md`
- **ロール権限**: `ROLE_PERMISSIONS.md`
- **Supabase公式ドキュメント**: https://supabase.com/docs/guides/database

---

## 🎉 実行後の確認

すべてのマイグレーションが成功したら、以下を確認してください：

1. ✅ `comment_reactions.comment_id` が TEXT型になっている
2. ✅ `comment_read_status.comment_id` が TEXT型になっている
3. ✅ 「新店舗出展計画 2025」プロジェクトが存在する
4. ✅ サンプルデータ（タスク、コメント、リアクション）が挿入されている
5. ✅ RLSポリシーが viewer と member で分離されている

これで、返信機能とリアクション機能が正常に動作するようになります！

---

**最終更新**: 2025-11-01

