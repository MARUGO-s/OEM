# 🔔 プッシュ通知トラブルシューティングガイド

## 🚨 プッシュ通知が来ない問題の診断手順

### 1. ブラウザ環境の確認

#### **基本的なサポート確認**
```javascript
// ブラウザの開発者ツール（Console）で実行
console.log('Notification API:', 'Notification' in window);
console.log('Service Worker:', 'serviceWorker' in navigator);
console.log('PushManager:', 'PushManager' in window);
console.log('Secure Context:', window.isSecureContext);
console.log('Protocol:', window.location.protocol);
```

#### **期待される結果**
- ✅ `Notification API: true`
- ✅ `Service Worker: true`
- ✅ `PushManager: true`
- ✅ `Secure Context: true`
- ✅ `Protocol: https:`

### 2. 通知許可の確認

#### **許可状況の確認**
```javascript
// ブラウザの開発者ツール（Console）で実行
console.log('Notification Permission:', Notification.permission);
```

#### **許可状況の意味**
- ✅ `granted`: 通知が許可されている
- ❌ `denied`: 通知が拒否されている
- ⚠️ `default`: まだ許可をリクエストしていない

#### **通知許可のリクエスト**
```javascript
// ブラウザの開発者ツール（Console）で実行
Notification.requestPermission().then(permission => {
    console.log('Permission result:', permission);
});
```

### 3. Service Workerの確認

#### **Service Workerの状態確認**
```javascript
// ブラウザの開発者ツール（Console）で実行
navigator.serviceWorker.ready.then(registration => {
    console.log('Service Worker scope:', registration.scope);
    console.log('Service Worker active:', registration.active);
    console.log('Service Worker installing:', registration.installing);
    console.log('Service Worker waiting:', registration.waiting);
});
```

#### **期待される結果**
- ✅ `Service Worker active: ServiceWorker` (null ではない)
- ✅ `Service Worker scope: https://marugo-s.github.io/OEM/`

### 4. アプリの通知設定確認

#### **アプリ内での通知設定**
1. **アプリを開く**
2. **通知パネル（ベルアイコン）をクリック**
3. **「🔔 プッシュ通知を有効化」ボタンをクリック**
4. **ブラウザで「許可」を選択**

#### **設定確認**
```javascript
// ブラウザの開発者ツール（Console）で実行
console.log('Local Storage - pushNotificationsEnabled:', localStorage.getItem('pushNotificationsEnabled'));
console.log('Local Storage - notificationPermission:', localStorage.getItem('notificationPermission'));
```

### 5. リアルタイム機能の確認

#### **リアルタイムサブスクリプションの確認**
```javascript
// ブラウザの開発者ツール（Console）で実行
console.log('App State Subscriptions:', window.appState?.subscriptions?.length);
console.log('App State Notifications:', window.appState?.notifications?.length);
```

#### **期待される結果**
- ✅ `App State Subscriptions: 3` (タスク、コメント、通知のサブスクリプション)
- ✅ `App State Notifications: 数値` (通知の数)

### 6. 通知の流れをデバッグ

#### **通知作成のテスト**
1. **別のブラウザ/タブでアプリを開く**
2. **コメントを投稿**
3. **元のブラウザでリアルタイム更新を確認**

#### **コンソールログの確認**
以下のログが表示されることを確認：
```
🔔 新しい通知を受信: {通知データ}
📡 Service Workerにプッシュ通知を送信します...
✅ Service Workerに通知メッセージを送信しました
```

### 7. よくある問題と対処法

#### **問題1: 通知が許可されていない**
**症状**: 通知が全く届かない
**対処法**:
1. ブラウザの設定で通知を許可
2. アプリで「🔔 プッシュ通知を有効化」をクリック
3. ブラウザで「許可」を選択

#### **問題2: Service Workerが登録されていない**
**症状**: アプリがPWAとして動作しない
**対処法**:
1. アプリを完全にリロード
2. ブラウザの開発者ツール → Application → Service Workers で確認
3. 必要に応じてService Workerをリセット

#### **問題3: リアルタイム機能が動作していない**
**症状**: データベースの変更が反映されない
**対処法**:
1. Supabaseダッシュボードでリアルタイム設定を確認
2. アプリを完全にリロード
3. ネットワーク接続を確認

#### **問題4: アプリがフォアグラウンドにいる**
**症状**: アプリを開いている時は通知が届かない
**対処法**:
1. アプリを最小化または別のタブに移動
2. 別のアプリに切り替える
3. スマートフォンの場合はホーム画面に戻る

### 8. デバッグツールの使用方法

#### **専用デバッグツール**
1. **ファイル**: `debug_push_notifications.html` を開く
2. **各ボタンを順番にクリック**
3. **結果を確認して問題を特定**

#### **デバッグツールの機能**
- 📊 ブラウザ環境の確認
- 🔐 通知許可の確認・リクエスト
- ⚙️ Service Workerの確認
- 🧪 テスト通知の送信
- 📡 Supabase接続の確認
- 🔍 通知の流れをデバッグ

### 9. 緊急時の対処法

#### **完全リセット**
1. **ブラウザのキャッシュをクリア**
2. **Service Workerをリセット**
3. **アプリを完全にリロード**
4. **通知許可を再度リクエスト**

#### **Service Workerのリセット**
1. ブラウザの開発者ツール → Application → Service Workers
2. 「Unregister」をクリック
3. ページをリロード

### 10. 成功の確認方法

#### **正常に動作している場合のログ**
```
✅ ブラウザサポートOK
✅ 通知許可OK
✅ Service Worker OK
✅ Supabase接続OK
✅ リアルタイム更新が有効になりました
🔔 新しい通知を受信: {通知データ}
📡 Service Workerにプッシュ通知を送信します...
✅ プッシュ通知を送信しました
```

#### **テスト手順**
1. **PCとスマートフォンで同時にアプリを開く**
2. **PCでコメントを投稿**
3. **スマートフォンで通知が届くことを確認**
4. **通知をクリックしてアプリが開くことを確認**

## 📱 モバイル環境での特別な注意事項

### 1. ブラウザの制限
- **Safari**: プッシュ通知の制限が厳しい
- **Chrome**: 最も互換性が高い
- **Firefox**: 基本的な機能は動作

### 2. ネットワーク環境
- **WiFi**: 最も安定
- **モバイルデータ**: 接続が不安定な場合がある
- **機内モード**: 完全に動作しない

### 3. バックグラウンド制限
- **アプリ切り替え**: 一時的に接続が切れる場合がある
- **画面ロック**: 通知が制限される場合がある
- **省電力モード**: 通知が制限される場合がある

## 🎯 最終確認チェックリスト

- [ ] ブラウザで通知が許可されている
- [ ] Service Workerが登録されている
- [ ] リアルタイム機能が動作している
- [ ] アプリがバックグラウンドにある
- [ ] ネットワーク接続が安定している
- [ ] テスト通知が届く
- [ ] PCとスマートフォン間でリアルタイム更新が動作する
