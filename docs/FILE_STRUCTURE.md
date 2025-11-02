# 📁 ファイル構造

## プロジェクト全体構造

```
OEM/
├── README.md                    # プロジェクト概要（トップページ）
├── index.html                   # メインHTML
├── manifest.json                # PWA設定
├── sw.js                        # Service Worker
├── docs/                        # 📚 ドキュメント
│   ├── QUICK_GUIDE.md           # 簡単操作ガイド
│   ├── USER_MANUAL.md           # 詳細ユーザーマニュアル
│   ├── DATABASE_SCHEMA.md       # データベーススキーマ
│   ├── ROLE_PERMISSIONS.md      # 権限管理
│   ├── MIGRATION_INSTRUCTIONS.md # マイグレーション手順
│   ├── PRODUCTION_CHECKLIST.md  # 本番環境チェックリスト
│   ├── PWA_CHECKLIST.md         # PWA対応チェックリスト
│   └── STORAGE_POLICY.md        # ストレージポリシー
├── js/                          # 💻 JavaScriptファイル
│   ├── app.js                   # アプリケーションメイン
│   ├── auth.js                  # 認証機能
│   ├── tasks.js                 # タスク管理
│   ├── comments.js              # コメント機能
│   ├── roadmap-comments.js      # ロードマップコメント
│   ├── discussion-comments.js   # 意見交換コメント
│   ├── reactions.js             # リアクション機能
│   ├── mentions.js              # メンション機能
│   ├── notifications.js         # 通知機能
│   ├── meetings.js              # 会議スケジュール
│   ├── projects.js              # プロジェクト管理
│   ├── admin.js                 # 管理画面
│   ├── roadmap-export.js        # PDFエクスポート
│   └── config.js                # 設定（Supabase接続情報）
├── styles/                      # 🎨 CSSファイル
│   └── main.css                 # メインスタイル
└── supabase/                    # 🗄️ Supabaseバックエンド
    ├── functions/               # Edge Functions（将来使用予定）
    └── migrations/              # データベースマイグレーション
        ├── 20251020_0001_init.sql
        ├── 20251101_0003_discussion_features.sql
        └── （その他のマイグレーションファイル）
```

---

## 📚 ドキュメントの使い分け

### すぐに使いたい
→ **[QUICK_GUIDE.md](QUICK_GUIDE.md)**
- 最小限の操作説明
- 図解なしのシンプル版

### 詳しく知りたい
→ **[USER_MANUAL.md](USER_MANUAL.md)**
- 全機能の詳細説明
- トラブルシューティング含む

### 開発・運用
→ **[DATABASE_SCHEMA.md](DATABASE_SCHEMA.md)**, **[MIGRATION_INSTRUCTIONS.md](MIGRATION_INSTRUCTIONS.md)**
- データベース構造
- マイグレーション手順

---

## 💻 主要JavaScriptファイル

### コア機能
- **app.js**: アプリケーション全体の制御、状態管理
- **auth.js**: ログイン、新規登録、セッション管理
- **config.js**: Supabase接続設定

### タスク・コメント
- **tasks.js**: タスクのCRUD、ステータス管理、ドラッグ&ドロップ
- **comments.js**: 基本コメント機能
- **roadmap-comments.js**: ロードマップ用コメント（スレッド表示）
- **discussion-comments.js**: 意見交換用コメント

### 高度な機能
- **reactions.js**: リアクション機能（👍❤️🎉👀🚀🔥）
- **mentions.js**: メンション機能（@username）
- **notifications.js**: 通知の生成・表示・管理

### その他
- **meetings.js**: 会議スケジュール管理
- **projects.js**: プロジェクト作成・切り替え
- **admin.js**: 管理画面（ユーザー・権限管理）
- **roadmap-export.js**: ロードマップのPDF出力

---

## 🗄️ データベースマイグレーション

### 管理場所
`supabase/migrations/` フォルダ内

### 命名規則
```
YYYYMMDD_NNNN_description.sql
```

### 主要マイグレーション
- **20251020_0001_init.sql**: 初期スキーマ
- **20251101_0003_discussion_features.sql**: リアクション・スレッド・メンション機能
- **20251102_0001_add_itagawa_as_owner_to_all_projects.sql**: オーナー自動追加
- **20251103_0001_add_lively_comments_new_store_project.sql**: 最新機能

### 実行方法
詳細は [MIGRATION_INSTRUCTIONS.md](MIGRATION_INSTRUCTIONS.md) を参照

---

## 🎨 スタイル

### CSSファイル
- **styles/main.css**: 全てのスタイルを一元管理

### 構造
```css
/* 変数定義 */
:root { ... }

/* 基本スタイル */
body, html { ... }

/* コンポーネント */
.btn { ... }
.modal { ... }
.comment { ... }

/* レスポンシブ */
@media (max-width: 768px) { ... }
```

---

## 🔧 設定ファイル

### manifest.json
PWA設定（アイコン、表示名、スプラッシュ画面など）

### sw.js
Service Worker（オフライン対応、キャッシュ管理）

### js/config.js
Supabase接続情報
```javascript
const SUPABASE_URL = 'https://...';
const SUPABASE_ANON_KEY = '...';
```

---

## 📝 更新履歴

- **2025/11/03**: ドキュメントフォルダ作成、構造整理
- **2025/10/21**: 初期リリース

---

**© 2025 MARUGO OEM商品企画管理システム**
