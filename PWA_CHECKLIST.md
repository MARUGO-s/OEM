# PWA インストール条件チェックリスト

## ✅ 必須要件

### 1. HTTPS配信
- ✅ GitHub Pagesで自動的にHTTPS有効化
- URL: https://marugo-s.github.io/OEM/

### 2. Web App Manifest
- ✅ manifest.json が存在
- ✅ `name`: "OEM商品企画管理システム"
- ✅ `short_name`: "OEM管理"
- ✅ `start_url`: "/OEM/"
- ✅ `display`: "standalone"
- ✅ `icons`: 192x192 と 512x512 の両方
- ✅ `theme_color`: "#2563eb"
- ✅ `background_color`: "#ffffff"
- ✅ `scope`: "/OEM/"
- ✅ `id`: "/OEM/" (一意な識別子)

### 3. Service Worker
- ✅ sw.js が存在し、正しく登録されている
- ✅ スコープ: "/OEM/"
- ✅ fetch イベントハンドラが実装されている
- ✅ install イベントでキャッシュを作成
- ✅ activate イベントで古いキャッシュを削除
- ✅ skipWaiting() と clients.claim() を実装

### 4. アイコン
- ✅ 192x192px アイコン (any + maskable)
- ✅ 512x512px アイコン (any + maskable)
- ✅ apple-touch-icon 設定済み
- ✅ favicon.ico と favicon.svg

### 5. パス設定
- ✅ すべてのリソースが絶対パス (/OEM/)
- ✅ HTML内のスクリプト、スタイルシート
- ✅ Service Worker のキャッシュURL
- ✅ manifest.json のアイコンパス

## ✅ 推奨要件

### 6. メタタグ
- ✅ theme-color (ライト/ダークモード対応)
- ✅ mobile-web-app-capable
- ✅ apple-mobile-web-app-capable
- ✅ apple-mobile-web-app-status-bar-style
- ✅ apple-mobile-web-app-title
- ✅ msapplication-TileColor
- ✅ format-detection

### 7. オフライン機能
- ✅ オフラインページ (offline.html)
- ✅ ネットワークエラー時のフォールバック
- ✅ キャッシュファースト戦略

### 8. ユーザー体験
- ✅ ローディング画面
- ✅ エラーハンドリング
- ✅ プッシュ通知サポート

## 📱 プラットフォーム別対応

### Chrome (Android/Desktop)
- ✅ manifest.json 完全対応
- ✅ Service Worker 完全対応
- ✅ インストールプロンプト自動表示

### Safari (iOS)
- ✅ apple-mobile-web-app メタタグ
- ✅ apple-touch-icon
- ✅ Service Worker 対応
- ⚠️ manifest.json は部分的にサポート

### Edge/Firefox
- ✅ 標準PWA対応
- ✅ manifest.json 完全対応

## 🔧 最新の修正内容 (v32)

1. **index.html の絶対パス化**
   - すべてのCSS/JSファイルを `/OEM/` プレフィックスに変更
   - manifest.json のパスを絶対パスに変更

2. **Service Worker の改善**
   - activate イベントの追加（古いキャッシュ自動削除）
   - skipWaiting() と clients.claim() の実装
   - 詳細なログ出力

3. **manifest.json の最適化**
   - `id` プロパティ追加
   - `display_override` 追加
   - アイコンの `purpose` を分離 (any/maskable)

4. **モバイルメタタグの拡張**
   - ダークモード対応の theme-color
   - Microsoft タイル対応
   - format-detection 設定

## ✅ 最終確認

すべての必須要件と推奨要件を満たしています。
PWAとしてホーム画面にインストール可能です。



