# OEM開発管理アプリ

## 📱 アクセス方法
1. URLにアクセス（GitHub Pages）
2. ブラウザで「ホーム画面に追加」を実行するとPWAとして利用できます

## ✨ 主な機能（最新）
- **ロードマップ表示**: タスクの進行状況をタイムラインで可視化
- **ドラッグ＆ドロップ並び替え**: タスクをつかんで上下に入れ替え可能（順序はDBに保存）
- **コメント機能**: タスクごとのコメント（タスク用と意見交換用は分離）
- **会議管理**: Google Meetの予定作成・一覧
- **通知**:
  - 新規タスク/コメント/会議などの通知
  - 通知の既読はユーザーごとに管理（`notification_read_status`）
  - 通知一覧から個別削除が可能（×ボタン）
  - パネル外クリックで閉じる
- **認証**: `appState.currentUser` による認証・プロフィール連携
- **モバイル最適化**: スマートフォンのログインフォームに余白追加、入力しやすさを改善

## 🔁 並び順の基準（ロードマップ）
1. `display_order` が設定されているタスクを最優先（小さいほど上）
2. 一方のみ `display_order` がある場合は、設定済みを優先
3. どちらも未設定のときは `deadline`（期限）昇順
4. 期限が無い場合は `created_at`（作成日時）昇順

> 並び替えはドラッグ＆ドロップで行え、結果は `tasks.display_order` に保存されます。

## 🔔 通知の仕様（要点）
- 種別例: `task_created`, `new_discussion_comment`, `task_comment_deleted`, `meeting_scheduled` など
- 既読管理: `notification_read_status(notification_id, user_id, read_at)` でユーザー別に保持
- 一括既読は安全なUPSERT＋フォールバック処理に対応
- 通知一覧から個別削除（Supabaseの `notifications` からDELETE）

## 🧪 既知の改善点/配慮
- モバイルでの描画遅延に備え、コメント追加等で軽微な遅延再描画を実施
- リアルタイムチャネルの `CHANNEL_ERROR/TIMED_OUT/CLOSED` に自動再接続

## 🧩 任意機能: ロードマップのPDF出力
- `html2canvas` + `jsPDF` により、ロードマップを高解像度でPDF化可能
- コメントやタグの文字が読みやすいよう、DPIスケールを上げてキャプチャ
- ページをまたぐ縦長のレイアウトは自動でページ分割

現在はUIボタンを非表示にしていますが、以下で有効化できます。
1. `index.html` に以下のスクリプトを読み込む
   - `html2canvas`（CDN）
   - `jsPDF`（CDN）
   - `./js/roadmap-export.js`
2. ロードマップ見出しにボタンを追加
   - `<button id="export-roadmap-pdf-btn" class="btn btn-secondary">📄 PDFダウンロード</button>`

> 直接APIを呼ぶ場合は `window.exportRoadmapToPDF()` を実行してください。

## 🗄️ データストレージ/セキュリティ
- データベース: Supabase PostgreSQL
- セッション: `sessionStorage`（タブを閉じると削除）
- `localStorage` は未使用
- 通信はSupabaseの暗号化経由

## 🛠️ 開発/デプロイ
- ホスティング: GitHub Pages（mainブランチの`/`）
- デプロイ手順:
```bash
git add .
git commit -m "update"
git pull origin main  # 競合回避
git push origin main  # 自動でPagesに反映（数分）
```
- 反映されない場合はブラウザキャッシュ/Pagesのビルド状況をご確認ください

## 🆘 サポート
- 画面が更新されない場合はリロード
- それでも解消しない場合はコンソールログと発生手順をご共有ください

---
**OEM開発管理アプリ v1.2**
