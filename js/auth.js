// 認証管理（Supabase完全復活版）

// Supabaseでは有効なドメイン形式のメールアドレスが必要なため、
// 実際のメール入力が無い場合はこのドメインを付けて擬似アドレスを生成する。
const AUTH_EMAIL_DOMAIN = 'hotmail.com';

// ログイン情報の保存・読み込み機能
const LOGIN_STORAGE_KEY = 'marugo_oem_login_info';

// UTF-8対応のBase64エンコード（日本語対応）
function encodeBase64(str) {
    try {
        return btoa(encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, (match, p1) => {
            return String.fromCharCode(parseInt(p1, 16));
        }));
    } catch (error) {
        console.error('Base64エンコードエラー:', error);
        return '';
    }
}

// UTF-8対応のBase64デコード（日本語対応）
function decodeBase64(str) {
    try {
        return decodeURIComponent(Array.prototype.map.call(atob(str), (c) => {
            return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
        }).join(''));
    } catch (error) {
        console.error('Base64デコードエラー:', error);
        return '';
    }
}

function saveLoginInfo(username, password) {
    try {
        const loginInfo = {
            username: encodeBase64(username), // UTF-8対応Base64エンコード
            password: encodeBase64(password), // UTF-8対応Base64エンコード
            timestamp: Date.now()
        };
        localStorage.setItem(LOGIN_STORAGE_KEY, JSON.stringify(loginInfo));
        console.log('✅ ログイン情報を保存しました', { key: LOGIN_STORAGE_KEY, username });

        // 確認のため読み込んでみる
        const verify = localStorage.getItem(LOGIN_STORAGE_KEY);
        console.log('保存確認:', verify ? 'OK' : 'NG');
    } catch (error) {
        console.error('❌ ログイン情報の保存に失敗:', error);
    }
}

function loadLoginInfo() {
    try {
        console.log('ログイン情報の読み込みを試行...');
        const saved = localStorage.getItem(LOGIN_STORAGE_KEY);
        console.log('localStorage取得結果:', saved ? '見つかりました' : '見つかりません');

        if (!saved) return null;

        const loginInfo = JSON.parse(saved);
        const decoded = {
            username: decodeBase64(loginInfo.username), // UTF-8対応Base64デコード
            password: decodeBase64(loginInfo.password), // UTF-8対応Base64デコード
            timestamp: loginInfo.timestamp
        };
        console.log('✅ ログイン情報を読み込みました:', { username: decoded.username, timestamp: new Date(decoded.timestamp) });
        return decoded;
    } catch (error) {
        console.error('❌ ログイン情報の読み込みに失敗:', error);
        return null;
    }
}

function clearLoginInfo() {
    try {
        localStorage.removeItem(LOGIN_STORAGE_KEY);
        console.log('🗑️ ログイン情報をクリアしました');

        // 確認のため読み込んでみる
        const verify = localStorage.getItem(LOGIN_STORAGE_KEY);
        console.log('クリア確認:', verify ? 'まだ残っている' : 'OK');
    } catch (error) {
        console.error('❌ ログイン情報のクリアに失敗:', error);
    }
}

// loadAllData 安全呼び出しラッパー（読み込み順の差異に強い）
function callLoadAllDataSafely(maxRetries = 20, intervalMs = 100) {
    return new Promise((resolve) => {
        let attempts = 0;
        const tryCall = () => {
            // 必要なDOM要素が存在するかチェック
            const roadmapContainer = document.getElementById('roadmap-container');
            const totalTasksElement = document.getElementById('total-tasks');
            
            if (typeof window.loadAllData === 'function' && roadmapContainer && totalTasksElement) {
                try {
                    console.log('DOM要素の準備が完了、データ読み込みを開始');
                    window.loadAllData();
                } finally {
                    resolve();
                }
                return;
            }
            
            attempts += 1;
            if (attempts >= maxRetries) {
                console.error('DOM要素の準備が完了しませんでした');
                resolve();
                return;
            }
            
            console.log('DOM要素の準備待機中... (試行回数:', attempts, ')');
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
    // 英数字と._-のみの場合はそのまま使用
    if (/^[a-z0-9._-]+$/.test(normalized)) {
        return `${normalized}@${AUTH_EMAIL_DOMAIN}`;
    }
    // 日本語などが含まれる場合はランダムな文字列を生成
    const randomStr = 'user_' + Date.now() + '_' + Math.random().toString(36).substring(2, 10);
    return `${randomStr}@${AUTH_EMAIL_DOMAIN}`;
}

function isValidEmail(email) {
    if (!email) return false;
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

// Supabaseからユーザー情報を取得
async function refreshCurrentUser() {
    try {
        console.log('🔄 refreshCurrentUser開始');
        const { data: { user }, error } = await supabase.auth.getUser();
        if (error) {
            console.error('❌ ユーザー情報取得エラー:', error);
            appState.currentUser = null;
            return null;
        }

        if (!user) {
            console.log('❌ ユーザー情報が存在しません');
            appState.currentUser = null;
            return null;
        }

        console.log('✅ Supabase Authユーザー取得:', { id: user.id, email: user.email, metadata: user.user_metadata });

        // プロファイルを取得
        const { data: profileData, error: profileError } = await supabase
            .from('user_profiles')
            .select('id, username, display_name, email')
            .eq('id', user.id)
            .maybeSingle();
        
        console.log('📋 プロファイル取得結果:', { profileData, profileError });

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

        console.log('✅ appState.currentUser設定:', {
            id: appState.currentUser.id,
            username: appState.currentUser.username,
            display_name: appState.currentUser.display_name,
            email: appState.currentUser.email
        });

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
            return false;
        }

        const trimmedIdentifier = username.trim();
        let email;

        if (trimmedIdentifier.includes('@')) {
            if (!isValidEmail(trimmedIdentifier)) {
                showError('有効なメールアドレスを入力してください');
                return false;
            }
            email = trimmedIdentifier.toLowerCase();
            console.log('📧 メールアドレスでログイン:', email);
        } else {
            // ユーザー名からuser_profilesテーブルを検索してメールアドレスを取得
            const { data: profile, error: profileError } = await supabase
                .from('user_profiles')
                .select('email')
                .eq('username', trimmedIdentifier.toLowerCase())
                .maybeSingle();

            if (profileError || !profile) {
                showError('ユーザーが見つかりません');
                return false;
            }

            email = profile.email;
            console.log('👤 ユーザー名からメールアドレスを取得:', { username: trimmedIdentifier, email });
        }

        console.log('🔐 ログイン試行:', { email, passwordLength: password.length });
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
                    message = 'メール確認が必要です。Supabase設定でメール確認を無効化するか、管理者にお問い合わせください。';
                } else {
                    message = `ログインに失敗しました: ${error.message}`;
                }
            showError(message);
            return false;
        }

        console.log('✅ Supabaseログイン成功:', {
            userId: data?.user?.id,
            email: data?.user?.email,
            metadata: data?.user?.user_metadata
        });
        const refreshedUser = await refreshCurrentUser();
        console.log('✅ refreshCurrentUser完了:', refreshedUser);
        console.log('プロジェクト選択画面に切り替え中...');
        showProjectSelectScreen();
        console.log('プロジェクト一覧を読み込み中...');
        if (typeof initProjectSelectScreen === 'function') {
            initProjectSelectScreen();
        }

        return true; // ログイン成功

    } catch (error) {
        console.error('Supabaseログインエラー:', error);
        showError('ログインに失敗しました: ' + error.message);
        return false;
    }
}

// 新規登録処理（Supabase復活版）
async function register(username, password) {
    console.log('Supabase登録処理開始:', { username });
    
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

        // スペースのみのチェック（その他の文字は許可）
        if (trimmedUsername.length === 0) {
            showError('ユーザー名を入力してください');
            return;
        }

        const emailInput = document.getElementById('reg-email');
        const rawEmail = emailInput ? emailInput.value.trim() : '';

        let email = '';
        if (rawEmail) {
            if (!isValidEmail(rawEmail)) {
                showError('有効なメールアドレスを入力してください');
                return;
            }
            email = rawEmail.toLowerCase();
        } else {
            email = buildEmailFromUsername(trimmedUsername);
        }

        const normalizedUsername = trimmedUsername.toLowerCase();

        // 既存ユーザーのチェック（Supabase）
        const { data: existingProfile, error: existingError } = await supabase
            .from('user_profiles')
            .select('id')
            .eq('username', normalizedUsername)
            .maybeSingle();

        if (existingError && existingError.code !== 'PGRST116') {
            console.error('既存ユーザーチェックエラー:', existingError);
            showError('登録処理中にエラーが発生しました');
            return;
        }

        if (existingProfile) {
            showError('このユーザー名は既に使用されています');
            return;
        }

        const { data, error } = await supabase.auth.signUp({
            email,
            password,
            options: {
                data: {
                    username: normalizedUsername,
                    display_name: trimmedUsername
                },
                emailRedirectTo: undefined,
                captchaToken: undefined
            }
        });

        if (error) {
            console.error('Supabase登録エラー:', error);
            showError(`登録に失敗しました: ${error.message}`);
            return;
        }

        const authUser = data?.user;
        if (authUser) {
            try {
                const { error: profileInsertError } = await supabase
                    .from('user_profiles')
                    .upsert({
                        id: authUser.id,
                        username: normalizedUsername,
                        display_name: trimmedUsername,
                        email: email,
                        test_password: password // テスト用パスワードを保存
                    }, {
                        onConflict: 'id'
                    });

                if (profileInsertError) {
                    console.error('プロファイル保存エラー:', profileInsertError);
                    // エラーが発生しても登録処理を続行
                } else {
                    console.log('プロファイル保存成功:', { username: normalizedUsername, email: email });
                }
            } catch (profileError) {
                console.error('プロファイル保存例外:', profileError);
                // 例外が発生しても登録処理を続行
            }
        }

                if (data?.session) {
                    await refreshCurrentUser();
                    // プロジェクト選択画面に遷移（新規ユーザーはプロジェクトにメンバーとして追加されていない）
                    showProjectSelectScreen();
                    initProjectSelectScreen();
                    showError('登録とログインが完了しました！', 'success');
                } else {
                    // メール確認が不要な場合でも、自動的にログインを試行
                    console.log('自動ログインを試行します');
                    try {
                        // 少し待ってからログインを試行（ユーザー作成の完了を待つ）
                        await new Promise(resolve => setTimeout(resolve, 1000));
                        
                        const { data: loginData, error: loginError } = await supabase.auth.signInWithPassword({
                            email,
                            password
                        });
                        
                        if (loginError) {
                            console.log('自動ログイン失敗:', loginError.message);
                            if (loginError.message === 'Email not confirmed') {
                                // メール確認エラーの場合は、ユーザーに直接ログインしてもらう
                                showError('登録が完了しました！ユーザー名とパスワードでログインしてください。', 'success');
                            } else {
                                showError('登録が完了しました！ログインしてください。', 'success');
                            }
                            showLoginForm();
                        } else {
                            await refreshCurrentUser();
                            // プロジェクト選択画面に遷移（新規ユーザーはプロジェクトにメンバーとして追加されていない）
                            showProjectSelectScreen();
                            initProjectSelectScreen();
                            showError('登録とログインが完了しました！', 'success');
                        }
                    } catch (autoLoginError) {
                        console.log('自動ログイン例外:', autoLoginError.message);
                        showError('登録が完了しました！ログインしてください。', 'success');
                        showLoginForm();
                    }
                }
        
    } catch (error) {
        console.error('Supabase登録エラー:', error);
        showError('登録に失敗しました: ' + error.message);
    }
}

// ログアウト処理（Supabase復活版）
async function logout() {
    try {
        // リアルタイムサブスクリプションの解除
        appState.subscriptions.forEach(sub => {
            supabase.removeChannel(sub);
        });
        appState.subscriptions = [];
        await supabase.auth.signOut();

        appState.currentUser = null;
        appState.tasks = [];
        appState.comments = [];
        appState.notifications = [];
        appState.brainstormIdeas = [];
        appState.brainstormVotes = [];
        appState.brainstormFilter = 'all';
        appState.brainstormSubscribed = false;

        // ログイン情報は保持（チェックがついていた場合は無期限で記憶）

        console.log('Supabaseログアウト完了');
        showLoginScreen();
        
    } catch (error) {
        console.error('Supabaseログアウトエラー:', error);
    }
}

// セッションチェック（Supabase復活版）
async function checkSession() {
    console.log('Supabaseセッションチェック開始');
    
    try {
        const { data: { session }, error } = await supabase.auth.getSession();

        if (error) {
            console.error('セッション取得エラー:', error);
            showLoginScreen();
            return;
        }

        if (session) {
            console.log('Supabaseセッション存在:', session);
            await refreshCurrentUser();
            
            // 常にログイン画面から開始
            console.log('ログイン画面を表示します');
            showLoginScreen();
        } else {
            console.log('Supabaseセッションなし');
            showLoginScreen();
        }
    } catch (error) {
        console.error('Supabaseセッションチェックエラー:', error);
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

function showProjectSelectScreen() {
    console.log('プロジェクト選択画面を表示');
    const loginScreen = document.getElementById('login-screen');
    const projectScreen = document.getElementById('project-select-screen');
    const mainScreen = document.getElementById('main-screen');

    if (loginScreen) loginScreen.classList.remove('active');
    if (projectScreen) projectScreen.classList.add('active');
    if (mainScreen) mainScreen.classList.remove('active');

    console.log('プロジェクト選択画面を表示しました');
}

function showMainScreen() {
    console.log('メイン画面を表示');
    
    // プロジェクトが選択されていない場合は、プロジェクト選択画面に遷移
    if (!appState.currentProject) {
        console.log('プロジェクトが選択されていないため、プロジェクト選択画面に遷移');
        showProjectSelectScreen();
        initProjectSelectScreen();
        return;
    }
    
    const loginScreen = document.getElementById('login-screen');
    const projectScreen = document.getElementById('project-select-screen');
    const mainScreen = document.getElementById('main-screen');

    console.log('ログイン画面要素:', loginScreen);
    console.log('メイン画面要素:', mainScreen);

    if (loginScreen) loginScreen.classList.remove('active');
    if (projectScreen) projectScreen.classList.remove('active');
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
            console.log('🏠 メイン画面に表示するユーザー名:', {
                display_name: appState.currentUser.display_name,
                username: appState.currentUser.username,
                email: appState.currentUser.email,
                finalUsername: username,
                userId: appState.currentUser.id
            });
            userNameElement.textContent = username;
        } else {
            console.error('ユーザー名要素が見つかりません');
        }
    }
    
    // 注意: showMainScreenは画面表示のみを行う。
    // データ読み込みは呼び出し元で実行すること。
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

    // 保存されたログイン情報を自動入力
    const savedLoginInfo = loadLoginInfo();
    if (savedLoginInfo) {
        console.log('保存されたログイン情報を読み込みました');
        const usernameInput = document.getElementById('username');
        const passwordInput = document.getElementById('password');
        const rememberCheckbox = document.getElementById('remember-login');

        if (usernameInput && passwordInput && rememberCheckbox) {
            usernameInput.value = savedLoginInfo.username;
            passwordInput.value = savedLoginInfo.password;
            rememberCheckbox.checked = true;
            console.log('ログイン情報を自動入力しました');
        }
    }

    const loginForm = document.getElementById('login-form');
    if (loginForm) {
        console.log('ログインフォームが見つかりました');
        loginForm.addEventListener('submit', async (e) => {
            console.log('ログインフォーム送信イベント発生');
            e.preventDefault();

            const username = document.getElementById('username').value;
            const password = document.getElementById('password').value;
            const rememberLogin = document.getElementById('remember-login').checked;

            console.log('フォームデータ:', { username, rememberLogin });

            // ログイン実行
            const success = await login(username, password);
            console.log('ログイン結果:', success);

            // ログイン成功時の処理
            if (success) {
                console.log('ログイン成功 - 記憶設定を確認:', rememberLogin);
                if (rememberLogin) {
                    console.log('ログイン情報を保存します');
                    saveLoginInfo(username, password);
                } else {
                    console.log('ログイン情報をクリアします');
                    clearLoginInfo();
                }
            } else {
                console.log('ログイン失敗 - 情報は保存されません');
            }
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
