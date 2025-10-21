// 認証管理（Supabase完全復活版）

// Supabaseでは有効なドメイン形式のメールアドレスが必要なため、
// 実際のメール入力が無い場合はこのドメインを付けて擬似アドレスを生成する。
const AUTH_EMAIL_DOMAIN = 'hotmail.com';
const USERNAME_PATTERN = /^[a-zA-Z0-9._-]+$/;

// loadAllData 安全呼び出しラッパー（読み込み順の差異に強い）
function callLoadAllDataSafely(maxRetries = 20, intervalMs = 100) {
    return new Promise((resolve) => {
        let attempts = 0;
        const tryCall = () => {
            if (typeof window.loadAllData === 'function') {
                try {
                    window.loadAllData();
                } finally {
                    resolve();
                }
                return;
            }
            attempts += 1;
            if (attempts >= maxRetries) {
                resolve();
                return;
            }
            setTimeout(tryCall, intervalMs);
        };
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', tryCall, { once: true });
        } else {
            tryCall();
        }
    });
}

// 万一どこかで直接 loadAllData() が呼ばれても未定義エラーにならないように即時スタブを用意
if (typeof window !== 'undefined' && typeof window.loadAllData !== 'function') {
    window.loadAllData = function() { return callLoadAllDataSafely(); };
}

function buildEmailFromUsername(rawUsername) {
    const normalized = rawUsername.trim().toLowerCase();
    return `${normalized}@${AUTH_EMAIL_DOMAIN}`;
}

function isValidEmail(email) {
    if (!email) return false;
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

// Supabaseからユーザー情報を取得
async function refreshCurrentUser() {
    try {
        const { data: { user }, error } = await supabase.auth.getUser();
        if (error) {
            console.error('ユーザー情報取得エラー:', error);
            appState.currentUser = null;
            return null;
        }

        if (!user) {
            appState.currentUser = null;
            return null;
        }

        // プロファイルを取得
        const { data: profileData, error: profileError } = await supabase
            .from('user_profiles')
            .select('id, username, display_name, email')
            .eq('id', user.id)
            .maybeSingle();

        if (profileError && profileError.code !== 'PGRST116') {
            console.error('プロファイル取得エラー:', profileError);
        }

        let profile = profileData || null;
        const fallbackUsername = user.user_metadata?.username || (user.email ? user.email.split('@')[0] : 'user');
        const username = (profile && profile.username) ? profile.username : fallbackUsername;
        const displayName = (profile && profile.display_name) ? profile.display_name : username;
        const email = (profile && profile.email) ? profile.email : (user.email || buildEmailFromUsername(username));

        // プロファイルが無ければ作成
        if (!profile) {
            try {
                const { data: upserted, error: upsertError } = await supabase
                    .from('user_profiles')
                    .upsert({
                        id: user.id,
                        username: username.toLowerCase(),
                        display_name: displayName,
                        email: email
                    }, {
                        onConflict: 'id'
                    })
                    .select()
                    .maybeSingle();
                
                if (upsertError) {
                    console.error('プロファイル自動作成エラー:', upsertError);
                    // エラーが発生してもフォールバックでプロファイルを作成
                    profile = { id: user.id, username, display_name: displayName, email };
                } else {
                    profile = upserted || { id: user.id, username, display_name: displayName, email };
                }
            } catch (profileError) {
                console.error('プロファイル作成例外:', profileError);
                // 例外が発生してもフォールバックでプロファイルを作成
                profile = { id: user.id, username, display_name: displayName, email };
            }
        }

        appState.currentUser = {
            id: user.id,
            username,
            display_name: displayName,
            email,
            rawUser: user
        };

        return appState.currentUser;
    } catch (error) {
        console.error('ユーザー情報更新エラー:', error);
        appState.currentUser = null;
        return null;
    }
}

// ログイン処理（Supabase復活版）
async function login(username, password) {
    console.log('Supabaseログイン処理開始:', { username });
    
    try {
        if (!username || !password) {
            showError('ユーザー名とパスワードを入力してください');
            return;
        }

        const trimmedIdentifier = username.trim();
        let email;

        if (trimmedIdentifier.includes('@')) {
            if (!isValidEmail(trimmedIdentifier)) {
                showError('有効なメールアドレスを入力してください');
                return;
            }
            email = trimmedIdentifier.toLowerCase();
        } else {
            if (!USERNAME_PATTERN.test(trimmedIdentifier)) {
                showError('ユーザー名は英数字と._-のみ使用できます');
                return;
            }
            email = buildEmailFromUsername(trimmedIdentifier);
        }

        const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password
        });

        if (error) {
            console.error('Supabaseログインエラー:', error);
            let message;
            if (error.message === 'Invalid login credentials') {
                message = 'ユーザー名またはパスワードが正しくありません。';
            } else if (error.message === 'Email not confirmed') {
                message = 'メール確認が完了していません。しばらく待ってから再度お試しください。';
            } else {
                message = `ログインに失敗しました: ${error.message}`;
            }
            showError(message);
            return;
        }

        console.log('Supabaseログイン成功:', data);
        await refreshCurrentUser();
        console.log('メイン画面に切り替え中...');
        showMainScreen();
        console.log('データ読み込み中...');
        await callLoadAllDataSafely();
        
    } catch (error) {
        console.error('Supabaseログインエラー:', error);
        showError('ログインに失敗しました: ' + error.message);
    }
}

// 新規登録処理（ローカルストレージベース）
async function register(username, password) {
    console.log('ローカル登録処理開始:', { username });
    
    try {
        // ユーザー名のバリデーション
        if (!username || username.length < 3) {
            showError('ユーザー名は3文字以上で入力してください');
            return;
        }
        
        if (username.length > 20) {
            showError('ユーザー名は20文字以内で入力してください');
            return;
        }
        
        // パスワードのバリデーション
        if (!password || password.length < 6) {
            showError('パスワードは6文字以上で入力してください');
            return;
        }
        
        const trimmedUsername = username.trim();

        if (!USERNAME_PATTERN.test(trimmedUsername)) {
            showError('ユーザー名は英数字と._-のみ使用できます');
            return;
        }

        const normalizedUsername = trimmedUsername.toLowerCase();

        // 既存ユーザーのチェック（ローカルストレージ）
        const usersData = localStorage.getItem('local_users');
        const users = usersData ? JSON.parse(usersData) : {};
        
        if (users[normalizedUsername]) {
            showError('このユーザー名は既に使用されています');
            return;
        }

        // 新しいユーザーを作成
        const userId = `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const email = buildEmailFromUsername(trimmedUsername);
        
        const newUser = {
            id: userId,
            username: normalizedUsername,
            display_name: trimmedUsername,
            email: email,
            password: password, // 実際のプロジェクトではハッシュ化が必要
            created_at: new Date().toISOString()
        };

        // ローカルストレージに保存
        users[normalizedUsername] = newUser;
        localStorage.setItem('local_users', JSON.stringify(users));

        // セッションを作成
        const session = {
            user: {
                id: newUser.id,
                username: newUser.username,
                display_name: newUser.display_name,
                email: newUser.email,
                created_at: newUser.created_at
            },
            expires: Date.now() + (24 * 60 * 60 * 1000) // 24時間
        };

        sessionStorage.setItem('local_auth_session', JSON.stringify(session));
        appState.currentUser = session.user;

        console.log('ローカル登録成功:', newUser);
        showMainScreen();
        await callLoadAllDataSafely();
        showError('登録とログインが完了しました！', 'success');
        
    } catch (error) {
        console.error('ローカル登録エラー:', error);
        showError('登録に失敗しました: ' + error.message);
    }
}

// ログアウト処理（ローカルストレージベース）
async function logout() {
    try {
        // セッションストレージをクリア
        sessionStorage.removeItem('local_auth_session');
        
        // アプリケーション状態をリセット
        appState.currentUser = null;
        appState.tasks = [];
        appState.comments = [];
        appState.notifications = [];
        appState.brainstormIdeas = [];
        appState.brainstormVotes = [];
        appState.brainstormFilter = 'all';
        appState.brainstormSubscribed = false;
        
        console.log('ローカルログアウト完了');
        showLoginScreen();
        
    } catch (error) {
        console.error('ローカルログアウトエラー:', error);
    }
}

// セッションチェック（ローカルストレージベース）
async function checkSession() {
    console.log('ローカルセッションチェック開始');
    
    try {
        const sessionData = sessionStorage.getItem('local_auth_session');
        if (!sessionData) {
            console.log('ローカルセッションなし');
            showLoginScreen();
            return;
        }

        const session = JSON.parse(sessionData);
        
        // セッションの有効期限をチェック
        if (session.expires && session.expires < Date.now()) {
            console.log('ローカルセッション期限切れ');
            sessionStorage.removeItem('local_auth_session');
            showLoginScreen();
            return;
        }

        console.log('ローカルセッション存在:', session);
        await refreshCurrentUser();
        showMainScreen();
        await callLoadAllDataSafely();
    } catch (error) {
        console.error('ローカルセッションチェックエラー:', error);
        showLoginScreen();
    }
}

// 画面切り替え
function showLoginScreen() {
    console.log('ログイン画面を表示');
    const loginScreen = document.getElementById('login-screen');
    const mainScreen = document.getElementById('main-screen');
    
    console.log('ログイン画面要素:', loginScreen);
    console.log('メイン画面要素:', mainScreen);
    
    if (loginScreen) loginScreen.classList.add('active');
    if (mainScreen) mainScreen.classList.remove('active');
    
    console.log('ログイン画面クラス:', loginScreen?.classList.toString());
    console.log('メイン画面クラス:', mainScreen?.classList.toString());
}

function showMainScreen() {
    console.log('メイン画面を表示');
    const loginScreen = document.getElementById('login-screen');
    const mainScreen = document.getElementById('main-screen');
    
    console.log('ログイン画面要素:', loginScreen);
    console.log('メイン画面要素:', mainScreen);
    
    if (loginScreen) loginScreen.classList.remove('active');
    if (mainScreen) mainScreen.classList.add('active');
    
    console.log('ログイン画面クラス:', loginScreen?.classList.toString());
    console.log('メイン画面クラス:', mainScreen?.classList.toString());
    
    if (appState.currentUser) {
        const userNameElement = document.getElementById('user-name');
        if (userNameElement) {
            // 現在のユーザーデータから表示名を取得
            const username = appState.currentUser.display_name ||
                           appState.currentUser.username ||
                           appState.currentUser.email.split('@')[0];
            userNameElement.textContent = username;
            console.log('ユーザー名を設定:', username);
        } else {
            console.error('ユーザー名要素が見つかりません');
        }
    }
}

// エラー表示
function showError(message, type = 'error') {
    const errorDiv = document.getElementById('auth-error');
    errorDiv.textContent = message;
    errorDiv.className = `error-message ${type}`;
    errorDiv.classList.add('show');
    
    setTimeout(() => {
        errorDiv.classList.remove('show');
    }, 5000);
}

// フォーム切り替え
function showLoginForm() {
    document.getElementById('login-form').style.display = 'block';
    document.getElementById('register-form').style.display = 'none';
    document.querySelector('.auth-switch').style.display = 'block';
    document.getElementById('register-switch').style.display = 'none';
}

function showRegisterForm() {
    document.getElementById('login-form').style.display = 'none';
    document.getElementById('register-form').style.display = 'block';
    document.querySelector('.auth-switch').style.display = 'none';
    document.getElementById('register-switch').style.display = 'block';
}

// イベントリスナー設定
document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM読み込み完了');
    
    const loginForm = document.getElementById('login-form');
    if (loginForm) {
        console.log('ログインフォームが見つかりました');
        loginForm.addEventListener('submit', async (e) => {
            console.log('ログインフォーム送信イベント発生');
            e.preventDefault();
            
            const username = document.getElementById('username').value;
            const password = document.getElementById('password').value;
            
            console.log('フォームデータ:', { username, password });
            await login(username, password);
        });
    } else {
        console.error('ログインフォームが見つかりません');
    }
    
    // 新規登録フォーム
    const registerForm = document.getElementById('register-form');
    if (registerForm) {
        console.log('新規登録フォームが見つかりました');
        registerForm.addEventListener('submit', async (e) => {
            console.log('新規登録フォーム送信イベント発生');
            e.preventDefault();
            
            const username = document.getElementById('reg-username').value;
            const password = document.getElementById('reg-password').value;
            const passwordConfirm = document.getElementById('reg-password-confirm').value;
            
            if (password !== passwordConfirm) {
                showError('パスワードが一致しません');
                return;
            }
            
            if (password.length < 6) {
                showError('パスワードは6文字以上で入力してください');
                return;
            }
            
            console.log('フォームデータ:', { username, password });
            await register(username, password);
        });
    } else {
        console.error('新規登録フォームが見つかりません');
    }
    
    // フォーム切り替えイベント
    document.getElementById('show-register').addEventListener('click', (e) => {
        e.preventDefault();
        showRegisterForm();
    });
    
    document.getElementById('show-login').addEventListener('click', (e) => {
        e.preventDefault();
        showLoginForm();
    });
    
    // ログインボタンのクリックイベントも追加
    const loginButton = document.querySelector('#login-form button[type="submit"]');
    if (loginButton) {
        console.log('ログインボタンが見つかりました');
        loginButton.addEventListener('click', function(e) {
            console.log('ログインボタンクリックイベント発生');
        });
    } else {
        console.error('ログインボタンが見つかりません');
    }
});

document.getElementById('logout-btn').addEventListener('click', logout);

// 初期化時にセッションチェック
checkSession();
