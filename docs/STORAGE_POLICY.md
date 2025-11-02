# データストレージポリシー

## 概要

このアプリケーションは **localStorage を一切使用しない** 設計になっています。
すべてのデータはSupabase PostgreSQLデータベースに保存され、セッション管理のみsessionStorageを使用します。

---

## ストレージ仕様

### 1. **localStorage: 使用禁止**

❌ **使用しない理由:**
- 永続化によるセキュリティリスク
- データが削除されずに残り続ける
- プライバシー保護の観点から不適切

✅ **代替手段:**
- データベース: Supabase PostgreSQL
- セッション: sessionStorage（一時保存のみ）

---

### 2. **sessionStorage: 認証セッションのみ**

✅ **使用箇所:**
```javascript
// js/config.js
const sessionStorageAdapter = {
    getItem: (key) => sessionStorage.getItem(key),
    setItem: (key, value) => sessionStorage.setItem(key, value),
    removeItem: (key) => sessionStorage.removeItem(key)
};
```

**保存内容:**
- Supabase認証トークン（JWT）
- ユーザーセッション情報

**ライフサイクル:**
- タブ/ウィンドウを閉じると自動削除
- ページリロード: セッション維持
- 新しいタブ: 新規セッション（ログイン必要）

---

### 3. **Supabase PostgreSQL: メインストレージ**

✅ **保存データ:**

| テーブル | 用途 |
|---------|------|
| `user_profiles` | ユーザー情報 |
| `tasks` | タスク管理 |
| `comments` | コメント・意見 |
| `meetings` | 会議スケジュール |
| `notifications` | 通知 |

**特徴:**
- すべてのデータはサーバー側に保存
- リアルタイム同期
- 暗号化通信（HTTPS）
- Row Level Security（RLS）による制御

---

### 4. **メモリ内ストレージ: 一時キャッシュ**

✅ **appState オブジェクト:**
```javascript
// js/config.js
const appState = {
    currentUser: null,
    tasks: [],
    comments: [],
    notifications: [],
    meetings: [],
    subscriptions: []
};
```

**特徴:**
- ページリロードで消失
- データベースから再読み込み
- UIの高速描画用

---

## セキュリティ上の利点

### localStorage 非使用による効果

1. **自動セッション終了**
   - タブを閉じると即座にログアウト
   - 共有端末での情報漏洩防止

2. **データ残留なし**
   - ブラウザにデータが永続化されない
   - プライバシー保護の強化

3. **CSRF対策の向上**
   - セッションの有効期限が短い
   - 攻撃の時間的猶予を削減

4. **XSS攻撃のリスク軽減**
   - localStorageへのアクセス不可
   - JavaScript経由でのデータ窃取が困難

---

## 実装詳細

### Supabase Auth設定

```javascript
// js/config.js
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
        storage: sessionStorageAdapter,  // カスタムアダプター
        autoRefreshToken: true,          // 自動トークン更新
        persistSession: true,            // sessionStorage内で永続化
        detectSessionInUrl: true         // URLからセッション検出
    }
});
```

**設定の意味:**
- `storage`: sessionStorageを使用
- `autoRefreshToken`: トークン有効期限の自動延長
- `persistSession`: sessionStorage内でのみ永続化
- `detectSessionInUrl`: OAuth認証時のURL解析

---

## 開発者向けガイドライン

### ❌ 禁止事項

```javascript
// 絶対にこれを書かない
localStorage.setItem('data', value);
localStorage.getItem('data');
localStorage.removeItem('data');
```

### ✅ 推奨事項

**データ保存:**
```javascript
// Supabaseに保存
await supabase.from('tasks').insert([data]);
```

**データ読み込み:**
```javascript
// Supabaseから読み込み
const { data } = await supabase.from('tasks').select('*');
```

**一時的なキャッシュ:**
```javascript
// appStateに保存（メモリ内のみ）
appState.tasks = data;
```

---

## ユーザーへの影響

### 動作変更点

| 項目 | localStorage版 | sessionStorage版（現行） |
|------|----------------|------------------------|
| ログイン状態 | ブラウザ終了後も維持 | タブを閉じるとログアウト |
| セキュリティ | 低（データ残留） | 高（自動削除） |
| 利便性 | 高（自動ログイン） | 中（タブ内のみ維持） |
| プライバシー | 低（永続化） | 高（一時保存） |

### 推奨される利用方法

1. **作業中はタブを開いたまま**
   - タブを閉じるとログアウトします

2. **リロードは問題なし**
   - ページ更新でもセッション維持

3. **セキュリティ重視の環境に最適**
   - 共有端末、公共のパソコン
   - 複数人が使用する環境

---

## テスト方法

### sessionStorage確認

```javascript
// ブラウザのコンソールで実行
console.log('sessionStorage:', sessionStorage);
console.log('localStorage:', localStorage); // 空であるべき

// Supabaseセッション
console.log('Supabase session:', 
  sessionStorage.getItem('sb-mrjocjcppjnjxtudebta-auth-token')
);
```

### localStorage使用箇所の検証

```bash
# プロジェクト内でlocalStorage使用を検索
grep -r "localStorage" js/
# 結果: コメントのみ、実コードでは使用なし
```

---

## トラブルシューティング

### Q: ログインが維持されない

**A:** タブを閉じるとログアウトする仕様です。

- 対策1: 作業中はタブを開いたまま
- 対策2: ページリロード（F5）は使用可能

### Q: 別タブで開けない

**A:** sessionStorageはタブごとに独立しています。

- 新しいタブでは再ログインが必要
- セキュリティ上の仕様です

### Q: データが保存されない

**A:** localStorageは使用していません。

- すべてのデータはSupabaseに保存されます
- ネットワーク接続を確認してください

---

## 変更履歴

| バージョン | 日付 | 変更内容 |
|-----------|------|---------|
| v1.1 | 2025-10-20 | localStorage使用を全面禁止、sessionStorageのみ使用 |
| v1.0 | 2025-10-01 | 初版リリース（localStorage使用版） |

---

## 関連ファイル

- `js/config.js` - ストレージアダプターの定義
- `js/auth.js` - 認証処理
- `js/sample-data.js` - サンプルデータ（localStorage削除済み）
- `README.md` - 利用者向けドキュメント

---

**OEM開発管理アプリ - データストレージポリシー v1.1**

