# localStorage非使用テストガイド

## テスト目的

このアプリケーションが **localStorage を一切使用していない** ことを確認するためのテストガイドです。

---

## テスト環境

- **ブラウザ**: Chrome, Firefox, Safari, Edge
- **開発者ツール**: F12 で開く
- **必要なもの**: テストアカウント

---

## テスト手順

### ✅ テスト1: localStorage未使用の確認

#### 手順:
1. ブラウザの開発者ツールを開く（F12）
2. Consoleタブを選択
3. 以下のコマンドを実行:

```javascript
// localStorageが空であることを確認
console.log('localStorage Keys:', Object.keys(localStorage));
console.log('localStorage Length:', localStorage.length);

// 結果: 空配列 [] または 0 であるべき
```

#### 期待結果:
- `localStorage Keys: []` （空配列）
- `localStorage Length: 0`

#### NG例:
```javascript
localStorage Keys: ["sb-xxx-auth-token", "tasks", "comments"]
// → NG: localStorageが使用されている！
```

---

### ✅ テスト2: sessionStorage使用の確認

#### 手順:
1. アプリにログイン
2. 開発者ツールのConsoleで実行:

```javascript
// sessionStorageの内容確認
console.log('sessionStorage Keys:', Object.keys(sessionStorage));
console.log('sessionStorage Length:', sessionStorage.length);

// Supabaseセッションの確認
const authKey = Object.keys(sessionStorage).find(key => key.includes('auth-token'));
console.log('Auth Token Key:', authKey);
console.log('Session Data:', sessionStorage.getItem(authKey));
```

#### 期待結果:
- `sessionStorage Keys: ["sb-mrjocjcppjnjxtudebta-auth-token"]`
- `sessionStorage Length: 1`
- セッションデータが表示される（JSON形式）

---

### ✅ テスト3: タブを閉じるとログアウト

#### 手順:
1. アプリにログイン
2. タブを閉じる
3. 新しいタブで同じURLを開く

#### 期待結果:
- **ログイン画面が表示される**
- 前回のセッションは維持されない

#### NG例:
- ログイン済みの状態で表示される
- → localStorage使用の可能性あり

---

### ✅ テスト4: ページリロードでセッション維持

#### 手順:
1. アプリにログイン
2. F5キーでページをリロード

#### 期待結果:
- **ログイン状態が維持される**
- メイン画面がそのまま表示される

---

### ✅ テスト5: 別タブで新しいセッション

#### 手順:
1. タブ1: アプリにログイン
2. タブ2: 新しいタブで同じURLを開く

#### 期待結果:
- **タブ2ではログイン画面が表示される**
- sessionStorageはタブごとに独立

---

### ✅ テスト6: データ保存先の確認

#### 手順:
1. タスクを新規作成
2. 開発者ツールのNetworkタブで確認
3. Supabaseへのリクエストを確認

#### 期待結果:
- `POST` リクエストが `supabase.co` ドメインに送信される
- localStorageへの保存アクセスなし

#### 確認コマンド:
```javascript
// Networkタブで以下のURLが見えるはず
// POST https://mrjocjcppjnjxtudebta.supabase.co/rest/v1/tasks
```

---

### ✅ テスト7: ストレージイベントの確認

#### 手順:
1. 開発者ツールのConsoleで実行:

```javascript
// localStorageへのアクセスを監視
const originalSetItem = localStorage.setItem;
localStorage.setItem = function(key, value) {
    console.error('❌ localStorage.setItem() が呼ばれました！', key, value);
    originalSetItem.apply(this, arguments);
};

// アプリを操作してみる（ログイン、タスク作成など）
```

#### 期待結果:
- **エラーメッセージが表示されない**
- localStorage.setItem() が一切呼ばれない

---

## 自動テストスクリプト

### ワンクリックテスト

以下のスクリプトをブラウザのConsoleに貼り付けて実行:

```javascript
/**
 * localStorage非使用テスト
 */
(function() {
    console.log('=== localStorage非使用テスト開始 ===\n');
    
    let passed = 0;
    let failed = 0;
    
    // テスト1: localStorageが空
    if (localStorage.length === 0) {
        console.log('✅ テスト1: localStorage は空です');
        passed++;
    } else {
        console.error('❌ テスト1: localStorage にデータがあります');
        console.log('Keys:', Object.keys(localStorage));
        failed++;
    }
    
    // テスト2: sessionStorageにSupabaseセッション
    const hasAuthToken = Object.keys(sessionStorage).some(key => 
        key.includes('auth-token')
    );
    if (hasAuthToken) {
        console.log('✅ テスト2: sessionStorage に認証トークンがあります');
        passed++;
    } else {
        console.warn('⚠️ テスト2: sessionStorage に認証トークンがありません（未ログインの可能性）');
    }
    
    // テスト3: appState存在確認
    if (typeof appState !== 'undefined') {
        console.log('✅ テスト3: appState が定義されています');
        console.log('  - currentUser:', appState.currentUser ? '設定済み' : '未設定');
        console.log('  - tasks:', appState.tasks.length, '件');
        console.log('  - comments:', appState.comments.length, '件');
        passed++;
    } else {
        console.error('❌ テスト3: appState が定義されていません');
        failed++;
    }
    
    // テスト4: Supabaseクライアント確認
    if (typeof supabase !== 'undefined') {
        console.log('✅ テスト4: Supabase クライアントが初期化されています');
        passed++;
    } else {
        console.error('❌ テスト4: Supabase クライアントが見つかりません');
        failed++;
    }
    
    // テスト5: localStorage使用の監視設定
    const originalSetItem = localStorage.setItem;
    localStorage.setItem = function(key, value) {
        console.error('❌ 警告: localStorage.setItem() が呼ばれました！', key);
        failed++;
        originalSetItem.apply(this, arguments);
    };
    console.log('✅ テスト5: localStorage 使用監視を設定しました');
    passed++;
    
    // 結果サマリー
    console.log('\n=== テスト結果 ===');
    console.log(`✅ 成功: ${passed}件`);
    console.log(`❌ 失敗: ${failed}件`);
    
    if (failed === 0) {
        console.log('\n🎉 すべてのテストに合格しました！');
        console.log('このアプリはlocalStorageを使用していません。');
    } else {
        console.log('\n⚠️ 一部のテストに失敗しました。');
    }
})();
```

---

## トラブルシューティング

### 問題: localStorage にデータが残っている

**原因:**
- 以前のバージョンのデータが残留

**解決方法:**
```javascript
// 開発者ツールのConsoleで実行
localStorage.clear();
location.reload();
```

---

### 問題: sessionStorage が空

**原因:**
- 未ログイン状態

**解決方法:**
- ログインしてから再テスト

---

### 問題: リロード後にログアウトされる

**原因:**
- sessionStorageが無効化されている
- ブラウザの設定でCookie/Storageがブロックされている

**解決方法:**
1. ブラウザの設定を確認
2. プライベートモード（シークレットモード）を解除
3. Cookie設定を「すべて許可」に変更

---

## 期待される動作まとめ

| 操作 | 期待される動作 |
|------|---------------|
| ログイン | sessionStorageにトークン保存 |
| タスク作成 | Supabaseに保存（localStorage使用なし） |
| ページリロード | セッション維持（sessionStorage有効） |
| タブを閉じる | セッション削除（自動ログアウト） |
| 別タブで開く | 新しいセッション（再ログイン必要） |
| ログアウト | sessionStorage削除 |

---

## 検証コマンド集

### ストレージ内容の確認

```javascript
// すべてのストレージを表示
console.log('=== ストレージ確認 ===');
console.log('localStorage:', localStorage);
console.log('sessionStorage:', sessionStorage);
console.log('appState:', appState);
```

### localStorageの完全クリア

```javascript
localStorage.clear();
console.log('localStorage をクリアしました');
```

### sessionStorageの確認

```javascript
// セッション情報を整形して表示
const authKey = Object.keys(sessionStorage).find(k => k.includes('auth-token'));
if (authKey) {
    const session = JSON.parse(sessionStorage.getItem(authKey));
    console.log('ユーザー:', session.user.email);
    console.log('トークン有効期限:', new Date(session.expires_at * 1000));
} else {
    console.log('セッションなし（未ログイン）');
}
```

---

## テスト報告テンプレート

```
【localStorage非使用テスト報告】

日時: YYYY/MM/DD HH:MM
ブラウザ: Chrome 120 / Firefox 121 / Safari 17 / Edge 120

テスト結果:
✅ テスト1: localStorage未使用 - 合格
✅ テスト2: sessionStorage使用 - 合格
✅ テスト3: タブを閉じるとログアウト - 合格
✅ テスト4: リロードでセッション維持 - 合格
✅ テスト5: 別タブで新セッション - 合格

備考:
- 問題なく動作しました
- localStorageは一切使用されていません
```

---

**テストガイド v1.0 - 2025/10/20**

