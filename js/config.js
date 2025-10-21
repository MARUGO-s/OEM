// Supabase設定
// 注意: 本番環境では環境変数から読み込むようにしてください
const SUPABASE_URL = 'https://mrjocjcppjnjxtudebta.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1yam9jamNwcGpuanh0dWRlYnRhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA4NTk5NDksImV4cCI6MjA3NjQzNTk0OX0.jflBtUsb7Qq4-p-e-XDUb1DoxHbwjG1DFXPXDC-sN2E';

/**
 * カスタムストレージアダプター（Safari対応）
 * 
 * このアプリケーションはlocalStorageを一切使用しません。
 * Supabase Authのセッション管理にsessionStorageを使用します。
 * 
 * Safari対応:
 * - プライベートブラウジングモードでのsessionStorageエラーをハンドリング
 * - フォールバックとしてメモリストレージを使用
 * 
 * sessionStorageの特徴:
 * - タブ/ウィンドウを閉じるとデータが自動削除される
 * - ページリロード（F5）ではデータが維持される
 * - 別タブで開くと新しいセッションになる（再ログイン必要）
 * 
 * セキュリティ上の利点:
 * - 共有端末でも安全（自動ログアウト）
 * - データの永続化による情報漏洩リスクなし
 * - プライバシー保護の強化
 */

// メモリストレージのフォールバック（Safari プライベートモード用）
const memoryStorage = {};

// sessionStorage が利用可能かチェック
function isSessionStorageAvailable() {
    try {
        const testKey = '__test__';
        sessionStorage.setItem(testKey, 'test');
        sessionStorage.removeItem(testKey);
        return true;
    } catch (e) {
        console.warn('sessionStorage is not available, using memory storage fallback');
        return false;
    }
}

const sessionStorageAvailable = isSessionStorageAvailable();

const sessionStorageAdapter = {
    getItem: (key) => {
        try {
            if (sessionStorageAvailable) {
                return sessionStorage.getItem(key);
            } else {
                return memoryStorage[key] || null;
            }
        } catch (e) {
            console.error('Storage getItem error:', e);
            return memoryStorage[key] || null;
        }
    },
    setItem: (key, value) => {
        try {
            if (sessionStorageAvailable) {
                sessionStorage.setItem(key, value);
            } else {
                memoryStorage[key] = value;
            }
        } catch (e) {
            console.error('Storage setItem error:', e);
            memoryStorage[key] = value;
        }
    },
    removeItem: (key) => {
        try {
            if (sessionStorageAvailable) {
                sessionStorage.removeItem(key);
            } else {
                delete memoryStorage[key];
            }
        } catch (e) {
            console.error('Storage removeItem error:', e);
            delete memoryStorage[key];
        }
    }
};

// Supabaseクライアントの初期化（sessionStorageを使用、localStorageは使用しない）
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
        storage: sessionStorageAdapter,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true
    }
});

// グローバル状態
const appState = {
    currentUser: null,
    tasks: [],
    comments: [],
    notifications: [],
    meetings: [],
    brainstormIdeas: [],
    brainstormVotes: [],
    brainstormFilter: 'all',
    brainstormSubscribed: false,
    subscriptions: []
};
