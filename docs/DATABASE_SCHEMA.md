# 📊 OEM開発管理アプリ データベーススキーマ

## 概要

このドキュメントは、Supabase PostgreSQLデータベースの最新のテーブル構造をまとめたものです。
最終更新: 2025-11-01

---

## テーブル一覧

### 1. 認証・ユーザー管理

#### `user_profiles`
ユーザープロファイル情報を管理

| カラム名 | 型 | 制約 | 説明 |
|---------|-----|------|------|
| id | UUID | PRIMARY KEY | ユーザーID (auth.users.idと連携) |
| username | TEXT | UNIQUE NOT NULL | ユーザー名 |
| display_name | TEXT | | 表示名 |
| email | TEXT | UNIQUE | メールアドレス |
| created_at | TIMESTAMP | DEFAULT now() | 作成日時 |
| updated_at | TIMESTAMP | DEFAULT now() | 更新日時 |

**インデックス**:
- `idx_user_profiles_username` ON username

**RLSポリシー**:
- 認証済みユーザーは全員が閲覧・作成可能

---

### 2. プロジェクト管理

#### `projects`
プロジェクト情報を管理

| カラム名 | 型 | 制約 | 説明 |
|---------|-----|------|------|
| id | UUID | PRIMARY KEY | プロジェクトID |
| name | TEXT | NOT NULL | プロジェクト名 |
| description | TEXT | | 説明 |
| created_by | UUID | REFERENCES user_profiles | 作成者 |
| created_at | TIMESTAMP | DEFAULT now() | 作成日時 |
| updated_at | TIMESTAMP | DEFAULT now() | 更新日時 |

**インデックス**:
- `idx_projects_created_by` ON created_by

**RLSポリシー**:
- 閲覧: プロジェクトメンバーのみ
- 作成: 認証済みユーザー誰でも
- 更新: オーナー・管理者のみ
- 削除: オーナーのみ

---

#### `project_members`
プロジェクトメンバーを管理

| カラム名 | 型 | 制約 | 説明 |
|---------|-----|------|------|
| id | UUID | PRIMARY KEY | メンバーシップID |
| project_id | UUID | REFERENCES projects | プロジェクトID |
| user_id | UUID | REFERENCES user_profiles | ユーザーID |
| role | TEXT | DEFAULT 'member' | 役割 ('owner', 'admin', 'member', 'viewer') |
| joined_at | TIMESTAMP | DEFAULT now() | 参加日時 |

**制約**:
- UNIQUE(project_id, user_id)

**インデックス**:
- `idx_project_members_project_id` ON project_id
- `idx_project_members_user_id` ON user_id

**RLSポリシー**:
- 閲覧: プロジェクトメンバーのみ
- 追加: オーナー・管理者のみ
- 削除: オーナー・管理者のみ

---

### 3. タスク管理

#### `tasks`
タスク情報を管理

| カラム名 | 型 | 制約 | 説明 |
|---------|-----|------|------|
| id | TEXT | PRIMARY KEY | タスクID |
| title | TEXT | NOT NULL | タイトル |
| description | TEXT | | 説明 |
| status | TEXT | DEFAULT 'pending' | ステータス ('pending', 'in_progress', 'completed') |
| priority | TEXT | DEFAULT 'medium' | 優先度 ('low', 'medium', 'high') |
| deadline | DATE | | 期限 |
| display_order | INTEGER | | 表示順序 |
| project_id | UUID | REFERENCES projects NOT NULL | プロジェクトID |
| created_by | UUID | REFERENCES user_profiles | 作成者 |
| created_at | TIMESTAMP | DEFAULT now() | 作成日時 |
| updated_at | TIMESTAMP | DEFAULT now() | 更新日時 |

**インデックス**:
- `idx_tasks_created_by` ON created_by
- `idx_tasks_status` ON status
- `idx_tasks_deadline` ON deadline
- `idx_tasks_project_id` ON project_id
- `idx_tasks_display_order` ON display_order

**RLSポリシー**:
- プロジェクトメンバーは全アクセス可能

---

### 4. コメント管理

#### `task_comments`
タスクへのコメントを管理

| カラム名 | 型 | 制約 | 説明 |
|---------|-----|------|------|
| id | TEXT | PRIMARY KEY | コメントID |
| task_id | TEXT | REFERENCES tasks | タスクID |
| project_id | UUID | REFERENCES projects | プロジェクトID |
| author_id | UUID | REFERENCES user_profiles | 作成者ID |
| author_username | TEXT | | 作成者名 |
| content | TEXT | NOT NULL | コメント内容 |
| parent_id | TEXT | REFERENCES task_comments | 返信元コメントID |
| mentions | TEXT[] | DEFAULT '{}' | メンションされたユーザーID |
| created_at | TIMESTAMP | DEFAULT now() | 作成日時 |

**インデックス**:
- `idx_task_comments_task_id` ON task_id
- `idx_task_comments_created_at` ON created_at
- `idx_task_comments_project_id` ON project_id
- `idx_task_comments_parent` ON parent_id WHERE parent_id IS NOT NULL

**RLSポリシー**:
- プロジェクトメンバーは全アクセス可能

---

#### `discussion_comments`
意見交換コメントを管理

| カラム名 | 型 | 制約 | 説明 |
|---------|-----|------|------|
| id | TEXT | PRIMARY KEY | コメントID |
| project_id | UUID | REFERENCES projects | プロジェクトID |
| author_id | UUID | REFERENCES user_profiles | 作成者ID |
| author_username | TEXT | | 作成者名 |
| content | TEXT | NOT NULL | コメント内容 |
| parent_id | TEXT | REFERENCES discussion_comments | 返信元コメントID |
| mentions | TEXT[] | DEFAULT '{}' | メンションされたユーザーID |
| created_at | TIMESTAMP | DEFAULT now() | 作成日時 |
| updated_at | TIMESTAMP | DEFAULT now() | 更新日時 |

**インデックス**:
- `idx_discussion_comments_created_at` ON created_at
- `idx_discussion_comments_author_id` ON author_id
- `idx_discussion_comments_project_id` ON project_id
- `idx_discussion_comments_parent` ON parent_id WHERE parent_id IS NOT NULL

**RLSポリシー**:
- プロジェクトメンバーは全アクセス可能

---

### 5. リアクション・未読管理

#### `comment_reactions`
コメントへのリアクションを管理

| カラム名 | 型 | 制約 | 説明 |
|---------|-----|------|------|
| id | UUID | PRIMARY KEY | リアクションID |
| comment_id | UUID | NOT NULL | コメントID |
| comment_type | TEXT | CHECK IN | コメント種別 ('task_comment', 'discussion_comment') |
| user_id | UUID | REFERENCES user_profiles | リアクションしたユーザー |
| reaction | TEXT | CHECK IN | リアクション種別 ('thumbs_up', 'heart', 'celebration', 'eyes', 'rocket', 'fire') |
| project_id | UUID | REFERENCES projects | プロジェクトID |
| created_at | TIMESTAMP | DEFAULT now() | 作成日時 |

**制約**:
- UNIQUE(comment_id, comment_type, user_id, reaction)

**インデックス**:
- `idx_comment_reactions_comment` ON (comment_id, comment_type)
- `idx_comment_reactions_user` ON (user_id, project_id)

**RLSポリシー**:
- 閲覧: プロジェクトメンバー
- 追加: プロジェクトメンバー（自分のみ）
- 削除: 自分のリアクションのみ

---

#### `comment_read_status`
コメントの既読状態を管理

| カラム名 | 型 | 制約 | 説明 |
|---------|-----|------|------|
| id | UUID | PRIMARY KEY | 既読状態ID |
| comment_id | UUID | NOT NULL | コメントID |
| comment_type | TEXT | CHECK IN | コメント種別 |
| user_id | UUID | REFERENCES user_profiles | ユーザーID |
| project_id | UUID | REFERENCES projects | プロジェクトID |
| is_read | BOOLEAN | DEFAULT false | 既読フラグ |
| read_at | TIMESTAMP | | 既読日時 |
| created_at | TIMESTAMP | DEFAULT now() | 作成日時 |

**制約**:
- UNIQUE(comment_id, comment_type, user_id)

**インデックス**:
- `idx_comment_read_status_user` ON (user_id, project_id, is_read)
- `idx_comment_read_status_comment` ON (comment_id, comment_type)

**RLSポリシー**:
- 自分の既読状態のみアクセス可能

---

### 6. 通知管理

#### `notifications`
通知情報を管理

| カラム名 | 型 | 制約 | 説明 |
|---------|-----|------|------|
| id | TEXT | PRIMARY KEY | 通知ID |
| type | TEXT | NOT NULL | 通知種別 |
| message | TEXT | NOT NULL | 通知メッセージ |
| related_id | TEXT | | 関連ID |
| recipient | TEXT | | 受信者 |
| project_id | UUID | REFERENCES projects | プロジェクトID |
| created_by | UUID | | 作成者 |
| created_at | TIMESTAMP | DEFAULT now() | 作成日時 |
| read | BOOLEAN | DEFAULT false | 既読フラグ（レガシー） |

**インデックス**:
- `idx_notifications_created_at` ON created_at
- `idx_notifications_read` ON read
- `idx_notifications_project_id` ON project_id

**RLSポリシー**:
- すべての認証済みユーザーがアクセス可能（一時的）

---

#### `notification_read_status`
通知のユーザー別既読状態を管理

| カラム名 | 型 | 制約 | 説明 |
|---------|-----|------|------|
| id | TEXT | PRIMARY KEY | 既読状態ID |
| notification_id | TEXT | NOT NULL | 通知ID |
| user_id | UUID | NOT NULL | ユーザーID |
| read_at | TIMESTAMP | DEFAULT now() | 既読日時 |
| created_at | TIMESTAMP | DEFAULT now() | 作成日時 |

**制約**:
- UNIQUE(notification_id, user_id)

**インデックス**:
- `idx_notification_read_status_notification_id` ON notification_id
- `idx_notification_read_status_user_id` ON user_id
- `idx_notification_read_status_read_at` ON read_at

**RLSポリシー**:
- 自分の既読状態のみアクセス可能

---

### 7. プッシュ通知

#### `push_subscriptions`
Web Push通知のサブスクリプションを管理

| カラム名 | 型 | 制約 | 説明 |
|---------|-----|------|------|
| id | UUID | PRIMARY KEY | サブスクリプションID |
| user_id | UUID | REFERENCES auth.users | ユーザーID |
| endpoint | TEXT | UNIQUE NOT NULL | Push通知エンドポイント |
| p256dh | TEXT | NOT NULL | 公開鍵 |
| auth | TEXT | NOT NULL | 認証トークン |
| expiration_time | TIMESTAMP | | 有効期限 |
| user_agent | TEXT | | ユーザーエージェント |
| platform | TEXT | | プラットフォーム |
| created_at | TIMESTAMP | DEFAULT now() | 作成日時 |
| updated_at | TIMESTAMP | DEFAULT now() | 更新日時 |
| last_notified_at | TIMESTAMP | | 最終通知日時 |
| last_error | TEXT | | 最終エラー |
| last_error_at | TIMESTAMP | | 最終エラー日時 |

**インデックス**:
- `idx_push_subscriptions_user` ON user_id
- `idx_push_subscriptions_created_at` ON created_at DESC

**RLSポリシー**:
- 自分のサブスクリプションのみアクセス可能

---

### 8. 会議管理

#### `meetings`
会議スケジュールを管理

| カラム名 | 型 | 制約 | 説明 |
|---------|-----|------|------|
| id | TEXT | PRIMARY KEY | 会議ID |
| title | TEXT | NOT NULL | タイトル |
| start_time | TIMESTAMP | NOT NULL | 開始時刻 |
| duration | INTEGER | NOT NULL | 時間（分） |
| participants | TEXT[] | NOT NULL | 参加者一覧 |
| meet_url | TEXT | | Google Meet URL |
| status | TEXT | DEFAULT 'scheduled' | ステータス |
| project_id | UUID | REFERENCES projects | プロジェクトID |
| created_by | UUID | REFERENCES user_profiles | 作成者 |
| created_at | TIMESTAMP | DEFAULT now() | 作成日時 |
| updated_at | TIMESTAMP | DEFAULT now() | 更新日時 |
| meeting_code | TEXT | | ミーティングコード |
| calendar_event_id | TEXT | | カレンダーイベントID |

**インデックス**:
- `idx_meetings_start_time` ON start_time
- `idx_meetings_created_by` ON created_by
- `idx_meetings_status` ON status
- `idx_meetings_project_id` ON project_id

**RLSポリシー**:
- プロジェクトメンバーは全アクセス可能

---

## ビュー

### `comment_reaction_summary`
リアクション集計ビュー

```sql
SELECT
    comment_id,
    comment_type,
    reaction,
    COUNT(*) as count,
    ARRAY_AGG(user_id) as user_ids
FROM comment_reactions
GROUP BY comment_id, comment_type, reaction;
```

---

## 関数

### `get_unread_comment_count(p_user_id UUID, p_project_id UUID)`
未読コメント数を取得

**戻り値**:
- `task_comment_count`: タスクコメント未読数
- `discussion_comment_count`: 意見交換コメント未読数
- `total_count`: 総未読数

---

## リアルタイム機能

以下のテーブルがSupabase Realtimeで有効化されています：

1. `projects`
2. `project_members`
3. `tasks`
4. `task_comments`
5. `discussion_comments`
6. `notifications`
7. `notification_read_status`
8. `meetings`
9. `comment_reactions`
10. `comment_read_status`

---

## 主な制約

### 外部キー制約
- すべての`project_id`は`projects`テーブルを参照
- `created_by`カラムは`user_profiles`テーブルを参照
- `parent_id`カラムは各コメントテーブル内で自己参照

### CHECK制約
- `status`: 'pending', 'in_progress', 'completed'
- `priority`: 'low', 'medium', 'high'
- `role`: 'owner', 'admin', 'member', 'viewer'
- `comment_type`: 'task_comment', 'discussion_comment'
- `reaction`: 'thumbs_up', 'heart', 'celebration', 'eyes', 'rocket', 'fire'

### UNIQUE制約
- `user_profiles.username`
- `user_profiles.email`
- `project_members(project_id, user_id)`
- `comment_reactions(comment_id, comment_type, user_id, reaction)`
- `comment_read_status(comment_id, comment_type, user_id)`
- `notification_read_status(notification_id, user_id)`
- `push_subscriptions.endpoint`

---

## データ移行履歴

1. **2025-10-20**: 初期スキーマ作成
2. **2025-10-21**: 通知・会議テーブル追加
3. **2025-10-21**: コメント分離（task_comments, discussion_comments）
4. **2025-10-24**: Push通知サブスクリプション追加
5. **2025-10-25**: 通知既読状態管理追加
6. **2025-11-01**: 複数プロジェクト対応
7. **2025-11-01**: リアクション・スレッド・メンション機能追加

---

## 備考

- すべてのテーブルでRow Level Security (RLS) が有効化されています
- `localStorage`は一切使用せず、`sessionStorage`のみ使用
- データの永続化はすべてSupabase PostgreSQLで管理
- リアルタイム同期はSupabase Realtimeで実現

---

**最終更新**: 2025-11-01
**Supabase プロジェクトID**: mrjocjcppjnjxtudebta

