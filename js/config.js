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

// モバイル環境の検出
const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
const isAndroid = /Android/.test(navigator.userAgent);

// モバイル環境でのSupabase設定を最適化
const supabaseConfig = {
    auth: {
        storage: sessionStorageAdapter,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true
    }
};

// モバイル環境での追加設定
if (isMobile) {
    console.log('📱 モバイル環境を検出、Supabase設定を最適化します');
    
    // モバイル環境でのリアルタイム設定
    supabaseConfig.realtime = {
        // モバイル環境での接続タイムアウトを延長
        timeout: 30000,
        // モバイル環境での再接続間隔を短縮
        heartbeatIntervalMs: 10000,
        // モバイル環境での接続リトライ回数を増加
        maxRetries: 5
    };
    
    // iOS環境での特別な設定
    if (isIOS) {
        console.log('🍎 iOS環境を検出、特別な設定を適用します');
        supabaseConfig.realtime.heartbeatIntervalMs = 15000; // iOSでは少し長めに
    }
    
    // Android環境での特別な設定
    if (isAndroid) {
        console.log('🤖 Android環境を検出、特別な設定を適用します');
        supabaseConfig.realtime.heartbeatIntervalMs = 8000; // Androidでは少し短めに
    }
}

// Supabaseクライアントの初期化（モバイル最適化版）
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, supabaseConfig);

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
