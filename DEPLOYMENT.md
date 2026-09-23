# 公開・運用メモ

## 対象

- GitHub: `MARUGO-s/OEM`、Pages `/OEM/`、`main` のGitHub Actionsでフロントを公開。
- Supabase: `Recipe-Management` / `hjhkccbktkscwtgzxjfq`。他アプリと共用。
- 追加領域: `kotonoha.meetings`、`kotonoha.settings`、service_role限定RPC `public.kotonoha_store`、非公開バケット `kotonoha-audio`、Edge Function `kotonoha-api`。
- Authユーザー・設定・既存のOpenAIキーは変更しない。フロントにあるのは公開用publishable keyのみ。

## 更新

フロントは `main` に反映するとビルド・テスト後にPagesへ公開します。Supabaseの自動マイグレーションはしません。

```sh
supabase functions deploy kotonoha-api --project-ref hjhkccbktkscwtgzxjfq --no-verify-jwt
```

`verify_jwt=false` は公開APIという意味ではありません。関数内ですべてのデータ要求のBearerトークンを `auth.getUser(token)` で検証し、匿名ログインも拒否します。Supabaseの新しいキー形式に対応するためのカスタム認証です。プリフライト以外は認証必須です。

初回の専用暗号化鍵のみ、`node scripts/init-cloud-secret.mjs` で作成できます。すでにある場合は変更しません。鍵をローテーションすると既存の暗号文を読めなくなるため、無断で変更しないでください。

## DB変更の注意

**`supabase db push` / `db reset` をこの共用プロジェクトで実行しないでください。** 他アプリの履歴とローカル履歴は一致しません。SQLをレビューし、会議録用の対象マイグレーション1件のみを明示的に適用します。初期マイグレーションは再実行用ではありません。

既存DBを変更しないことを、追加前後の定義ハッシュで照合しました（2026-09-23）。既存テーブル内の業務データは更新していません。

| 比較対象                             | 件数 | MD5（定義比較用）                |
| ------------------------------------ | ---: | -------------------------------- |
| publicの列定義                       |  318 | b779f5e2187d7ec891d0f77dbb73ee88 |
| 既存public関数（kotonoha_store除外） |   74 | 7c76ace151d6e5d4d7a6027a33012a95 |
| 既存Storageポリシー                  |    5 | ba55e1dd66a64e922137bf55e02e6189 |

DB実動確認は `tests/cloud-database.sql` を使用します。専用領域にランダムなテスト所有者で書き込み、所有者分離・編集・削除・古いジョブの上書き拒否を確認後、トランザクションをROLLBACKします。Authユーザーや他アプリの行は作成しません。

## 復旧

旧OEMの全Git履歴を `codex/backup-oem-before-kotonoha-20260923` に退避しています。置き換え前のコミットは `ec92fbfd9727024afac239a350cf955d075d59c8`。旧画面へ戻す場合は、この退避ブランチから内容を復元する新しいコミットを作成してください。共有DBはリセットしません。

会議の削除は `kotonoha.meetings.deleted_at` に削除日時を設定します。管理者は本人・会議IDを照合したうえで、その1行のみ `deleted_at = null` に戻して復元できます。完全消去は対象の会議ID・所有者ID・audio_pathを照合し、対象音声と会議行のみを削除します。DBスキーマやバケット全体の削除は行わないでください。

既存アカウントでログインできない場合は、既存管理者に確認してください。このアプリから共用Authのユーザー作成・パスワード変更・メール設定変更は行いません。
