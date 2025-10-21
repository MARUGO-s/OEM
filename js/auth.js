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
                    message = 'メール確認が必要です。Supabase設定でメール確認を無効化するか、管理者にお問い合わせください。';
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

        if (!USERNAME_PATTERN.test(trimmedUsername)) {
            showError('ユーザー名は英数字と._-のみ使用できます');
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
                        email: email
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
                    showMainScreen();
                    await callLoadAllDataSafely();
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
                            showMainScreen();
                            await callLoadAllDataSafely();
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
            showMainScreen();
            await callLoadAllDataSafely();
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
