# 公開・運用メモ

## 対象

- GitHub: `MARUGO-s/OEM`、Pages `/OEM/`、`main` のGitHub Actionsでフロントを公開。
- Supabase: `Recipe-Management` / `hjhkccbktkscwtgzxjfq`。他アプリと共用。
- 追加領域: `kotonoha.meetings`、`kotonoha.settings`、`kotonoha.access_config`、`kotonoha.sessions`、`kotonoha.login_attempts`、service_role限定RPC `public.kotonoha_store` / `public.kotonoha_auth`、非公開バケット `kotonoha-audio`、Edge Function `kotonoha-api`。
- Authユーザー・設定・既存のOpenAIキーは変更しない。フロントにあるのは公開用publishable keyのみ。

## 更新

フロントは `main` に反映するとビルド・テスト後にPagesへ公開します。Supabaseの自動マイグレーションはしません。

AAC・複数録音対応はEdge Functionとフロントの更新のみで、DBマイグレーションは不要です。専用会議documentの `audioParts` に順序・保存パス・完了済み文字起こしを保持します。旧 `audio_path` は先頭音声を指し、既存単一録音にはフォールバックします。AACは保存前にM4Aへ変換するため、既存バケットのMIME制限・容量設定も変更しません。ロールバックする際は複数録音に対応した版を維持してください（旧版では先頭以外の録音を処理できません）。

```sh
supabase functions deploy kotonoha-api --project-ref hjhkccbktkscwtgzxjfq --no-verify-jwt
```

`verify_jwt=false` は会議データの公開を意味しません。ログインとプリフライトのみ未認証で利用できます。データ要求のBearerトークンは `kotonoha_auth` で専用セッションのハッシュ・有効期限・失効を検証します。全セッションに同じworkspace_idを付与し、既存Supabase Authトークンは受け付けません。

共通ログインの設定は `node scripts/configure-shared-login.mjs` を実行し、標準入力へ `loginId` / `password` のJSONを1行渡します（TTY入力は非表示）。パスワードをソース、コマンド引数、GitHubへ保存しないでください。設定時は会議録の既存セッションだけを失効させます。他アプリのAuthユーザー・セッションは変更しません。

初回の専用暗号化鍵のみ、`node scripts/init-cloud-secret.mjs` で作成できます。すでにある場合は変更しません。鍵をローテーションすると既存の暗号文を読めなくなるため、無断で変更しないでください。

## DB変更の注意

**`supabase db push` / `db reset` をこの共用プロジェクトで実行しないでください。** 他アプリの履歴とローカル履歴は一致しません。SQLをレビューし、会議録用の対象マイグレーション1件のみを明示的に適用します。初期マイグレーションは再実行用ではありません。

既存DBを変更しないことを、追加前後の定義ハッシュで照合しました（2026-09-23）。既存テーブル内の業務データは更新していません。

| 比較対象                                             | 件数 | MD5（定義比較用）                |
| ---------------------------------------------------- | ---: | -------------------------------- |
| publicの列定義                                       |  318 | b779f5e2187d7ec891d0f77dbb73ee88 |
| 既存public関数（kotonoha_store / kotonoha_auth除外） |   74 | 7c76ace151d6e5d4d7a6027a33012a95 |
| 既存Storageポリシー                                  |    5 | ba55e1dd66a64e922137bf55e02e6189 |

DB実動確認は `tests/cloud-database.sql` を使用します。専用領域にランダムなテスト所有者で書き込み、所有者分離・編集・削除・古いジョブの上書き拒否を確認後、トランザクションをROLLBACKします。Authユーザーや他アプリの行は作成しません。

共有認証のDB実動確認は `tests/shared-auth-database.sql` で行います。共通パスワード・セッションをトランザクション内で仮設定し、ログイン失敗制限・共有閲覧・失効・期限切れを検証後に必ずROLLBACKします。個別利用者ではなく、DBが生成した共通workspace_idで会議を保存します。共通化マイグレーションは会議レコードのみ移管し、個人APIキーは転用しません。

## 復旧

旧OEMの全Git履歴を `codex/backup-oem-before-kotonoha-20260923` に退避しています。置き換え前のコミットは `ec92fbfd9727024afac239a350cf955d075d59c8`。旧画面へ戻す場合は、この退避ブランチから内容を復元する新しいコミットを作成してください。共有DBはリセットしません。

会議の削除は `kotonoha.meetings.deleted_at` に削除日時を設定します。管理者は本人・会議IDを照合したうえで、その1行のみ `deleted_at = null` に戻して復元できます。完全消去は対象の会議ID・所有者ID・audio_path・document.audioPartsの全保存パスを照合し、対象音声と会議行のみを削除します。DBスキーマやバケット全体の削除は行わないでください。

ログインできない場合は、共通IDの入力、パスワード、試行回数制限を確認してください。共用Supabase Authのユーザー・パスワード・メール設定を変更してはいけません。
