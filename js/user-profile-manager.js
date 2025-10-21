// ユーザープロファイル管理（ローカル優先）
class UserProfileManager {
    constructor() {
        this.localProfiles = new Map();
        this.loadLocalProfiles();
    }

    // ローカルプロファイルの読み込み
    loadLocalProfiles() {
        try {
            const stored = sessionStorage.getItem('user_profiles');
            if (stored) {
                const profiles = JSON.parse(stored);
                this.localProfiles = new Map(profiles);
            }
        } catch (error) {
            console.error('ローカルプロファイル読み込みエラー:', error);
        }
    }

    // ローカルプロファイルの保存
    saveLocalProfiles() {
        try {
            const profiles = Array.from(this.localProfiles.entries());
            sessionStorage.setItem('user_profiles', JSON.stringify(profiles));
        } catch (error) {
            console.error('ローカルプロファイル保存エラー:', error);
        }
    }

    // プロファイルの取得（ローカル優先）
    getProfile(userId) {
        return this.localProfiles.get(userId) || null;
    }

    // プロファイルの作成（ローカルのみ）
    createProfile(userId, username, email) {
        const profile = {
            id: userId,
            username: username.toLowerCase(),
            display_name: username,
            email: email || `${username}@hotmail.com`,
            created_at: new Date().toISOString()
        };
        
        this.localProfiles.set(userId, profile);
        this.saveLocalProfiles();
        
        console.log('ローカルプロファイル作成:', profile);
        return profile;
    }

    // プロファイルの更新（ローカルのみ）
    updateProfile(userId, updates) {
        const existing = this.localProfiles.get(userId);
        if (existing) {
            const updated = { ...existing, ...updates };
            this.localProfiles.set(userId, updated);
            this.saveLocalProfiles();
            return updated;
        }
        return null;
    }

    // プロファイルの削除（ローカルのみ）
    deleteProfile(userId) {
        this.localProfiles.delete(userId);
        this.saveLocalProfiles();
    }

    // すべてのプロファイルを取得
    getAllProfiles() {
        return Array.from(this.localProfiles.values());
    }
}

// グローバルインスタンス
window.userProfileManager = new UserProfileManager();
