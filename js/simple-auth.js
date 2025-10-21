// シンプル認証システム（Supabase Auth回避）
class SimpleAuth {
    constructor() {
        this.currentUser = null;
        this.loadSession();
    }

    // セッションの読み込み
    loadSession() {
        try {
            const stored = sessionStorage.getItem('simple_auth_session');
            if (stored) {
                const session = JSON.parse(stored);
                if (session.expires > Date.now()) {
                    this.currentUser = session.user;
                } else {
                    this.clearSession();
                }
            }
        } catch (error) {
            console.error('セッション読み込みエラー:', error);
            this.clearSession();
        }
    }

    // セッションの保存
    saveSession(user, expiresInHours = 24) {
        try {
            const session = {
                user: user,
                expires: Date.now() + (expiresInHours * 60 * 60 * 1000)
            };
            sessionStorage.setItem('simple_auth_session', JSON.stringify(session));
            this.currentUser = user;
        } catch (error) {
            console.error('セッション保存エラー:', error);
        }
    }

    // セッションのクリア
    clearSession() {
        try {
            sessionStorage.removeItem('simple_auth_session');
            this.currentUser = null;
        } catch (error) {
            console.error('セッションクリアエラー:', error);
        }
    }

    // ログイン
    async login(username, password) {
        try {
            // シンプルな認証（実際のプロジェクトでは適切な認証を実装）
            if (username && password) {
                const user = {
                    id: `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                    username: username.toLowerCase(),
                    display_name: username,
                    email: `${username}@hotmail.com`,
                    created_at: new Date().toISOString()
                };

                // ローカルプロファイル管理に追加
                if (window.userProfileManager) {
                    window.userProfileManager.createProfile(user.id, user.username, user.email);
                }

                this.saveSession(user);
                return { success: true, user: user };
            }
            return { success: false, error: 'ユーザー名とパスワードを入力してください' };
        } catch (error) {
            console.error('ログインエラー:', error);
            return { success: false, error: error.message };
        }
    }

    // ログアウト
    async logout() {
        this.clearSession();
        if (window.userProfileManager) {
            window.userProfileManager.deleteProfile(this.currentUser?.id);
        }
    }

    // 現在のユーザーを取得
    getCurrentUser() {
        return this.currentUser;
    }

    // 認証状態をチェック
    isAuthenticated() {
        return this.currentUser !== null;
    }
}

// グローバルインスタンス
window.simpleAuth = new SimpleAuth();
