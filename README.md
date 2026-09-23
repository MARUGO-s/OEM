# kotonoha — 会議録ワークスペース

録音済みの音声を取り込み、文字起こし → 会話解析 → 議事録作成まで一括で行う日本語Webアプリです。リアルタイム録音ではありません。

公開先: [kotonoha](https://marugo-s.github.io/OEM/)

## 使い始める

1. 共通ID `marugo` と管理者から受け取ったパスワードでログインします。全員が同じ会議・音声・議事録を閲覧・編集します。既存Supabaseアカウントは使いません。
2. 左下の「接続設定」に、ワークスペース共通のOpenAI APIキーを入力します。ログインした全員の解析にこのキーを使います。文字起こしは `gpt-4o-transcribe`、議事録は `gpt-6-astra` または `gpt-6-sol` を使います。対象モデルの権限・利用枠が必要です。設定保存は疎通確認を意味しません。
3. 録音ファイル、または文字起こし済みのトークを取り込みます。会議名、開催日、参加者、議事録の詳しさを指定できます。
4. 「議事録」「文字起こし」「アクション」で確認・編集します。文字起こし修正後の再生成、音声再生、アクションの完了チェックもできます。
5. Markdown・テキスト・JSONで書き出せます。印刷画面からPDFにも保存できます。

ログイン後の「サンプルを開く」はOpenAIキー不要です。架空の固定データであり、AI処理をしたふりはしません。

## データと安全性

- Supabaseプロジェクト `hjhkccbktkscwtgzxjfq`（Recipe-Management）に間借りしています。会議録専用の非公開 `kotonoha` スキーマを使い、既存の業務テーブル・関数・Storageポリシー・Auth設定を変更しません。
- 会議・音声・設定・追加・編集・削除は全員共通です。他の人の変更は約10秒ごとに一覧へ反映します（本文編集中を除く）。同じ内容を同時に編集した場合は最後の保存が優先されます。
- 共通パスワードはbcryptハッシュとして専用DBに保存し、公開コードには含めません。認証成功時にランダムな12時間のセッションを発行し、DBにはそのSHA-256ハッシュのみ保存します。ログアウトはそのセッションを失効させます。失敗が続くと15分のログイン制限がかかります。
- ブラウザからテーブルや保存RPCを直接呼べません。`kotonoha-api` が専用セッションを検証してから、全員共通のワークスペースを操作します。共用Supabase Authにはユーザー追加や設定変更を行いません。
- 音声は非公開バケット `kotonoha-audio` に保存し、ログイン済み利用者に1時間の署名付き再生URLを発行します。URLは外部へ共有しないでください。
- OpenAIキーはワークスペース共通でAES-256-GCM暗号化し、会議録専用のサーバー鍵で保存します。他アプリの `OPENAI_API_KEY` は使用・変更しません。旧個人キーは共通キーへ自動転用しません。
- AI解析時は音声とテキストをOpenAIへ送信します。議事録はResponses APIのStructured Outputs（medium）を使用。クラウド版は長い生成に対応するため `background: true, store: true` です。結果取得に必要なデータがOpenAI側にも保存されます。機密情報の利用可否を確認してください。
- 削除は論理削除で、通常画面から非表示になります。音声は保持します。復元・完全消去は管理者対応で、自動消去はありません。
- Supabaseの計算資源は共用なので、負荷や利用枠まで完全に分離するものではありません。同時AI処理は共有ワークスペース全体で2件です。
- 共通ログイン情報を知っている人は全記録と設定を操作できます。利用者ごとの権限・監査ログはありません。共用端末では利用後にログアウトしてください。

## 対応範囲と制限

- MP3 / M4A / WAV / MP4 / MPEG / MPGA / WebM / OGG / FLAC、1ファイル24 MBまで。
- 自動圧縮・自動分割は未実装です。大きな録音、文字起こしが時間切れになる長い録音は、圧縮または分割してください。クラウドの文字起こし待機上限は110秒です。
- トーク貼り付けは10万文字まで。共有ワークスペース全体で最大1,000会議。
- GPT-4o Transcribeの出力に、話者名・発言時刻を推測で付けません。サンプルの話者と時刻は説明用の固定データです。
- AIには決定と提案を区別し、明示されていない担当・期限を「未定」にするよう指示します。出力は必ず録音と照合してください。
- 議事録本文の編集と、構造化された要点・決定事項・アクションは別に保存されます。本文の編集だけでは解析結果欄は変わりません。再生成は本文と解析結果を更新し、完了チェックをリセットします。
- 文字起こし完了時に一度保存します。議事録だけ失敗した場合は保存済みテキストから再試行し、文字起こしを繰り返しません。クラウドは画面を閉じてもAI生成を続け、次回画面を開いた際に結果を取り込みます。長期間開かなかった場合など結果を取得できなければ再生成が必要です。

## ローカル開発

Node.js 22.18以上。

```sh
npm ci
npm run dev
```

開発画面: http://127.0.0.1:5188 。開発時はローカルモードで、会議・音声を `.data/` に保存します。キーはサーバーのメモリだけに保持し、再起動時は再設定が必要です。環境変数でも設定できます（`.env.example`）。Dropbox配下での開発は `.data` や `.env` が同期される可能性に注意してください。

ローカルで削除した記録は `.data/trash/<ID>/` に移動します。復元時はサーバーを停止し、`meeting.json` を `.data/meetings/<ID>.json`、音声を元の `.data/audio/` へ戻します。

クラウド接続の開発画面:

```sh
VITE_STORAGE_MODE=supabase npx vite --port 5189
```

`npm run build` はGitHub Pages `/OEM/` 用クラウド版です。`npm start` はローカルAPIサーバー用です（公開環境には不要）。

## 検証

```sh
npm run check
deno check --config supabase/functions/kotonoha-api/deno.json supabase/functions/kotonoha-api/index.ts
deno test --allow-env --config supabase/functions/kotonoha-api/deno.json tests/cloud-api.test.ts
```

Nodeテストはアップロード・保存・再試行・編集・削除・アクセス制限・APIモデル指定・キー暗号化を確認します。EdgeテストはHTTP通信を模擬し、共通ログイン、未認証拒否、別セッションでの同一データ閲覧・編集、ログアウト、Astra/Sol生成、結果取得、音声の取り込みを確認します。OpenAI実課金リクエストは実行しません。

デプロイ・復旧手順と既存DBの照合情報は [DEPLOYMENT.md](DEPLOYMENT.md) を参照してください。

## 公式仕様

- [Speech to text](https://developers.openai.com/api/docs/guides/speech-to-text)
- [Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs)
- [Background mode](https://developers.openai.com/api/docs/guides/background)
- [GPT-4o Transcribe](https://developers.openai.com/api/docs/models/gpt-4o-transcribe)
- [GPT-6 Astra](https://developers.openai.com/api/docs/models/gpt-6-astra) / [GPT-6 Sol](https://developers.openai.com/api/docs/models/gpt-6-sol)
