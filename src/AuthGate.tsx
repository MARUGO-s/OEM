import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import {
  AudioLines,
  ArrowRight,
  LoaderCircle,
  LockKeyhole,
  ShieldCheck,
} from "lucide-react";
import {
  isCloud,
  getSession,
  SESSION_EVENT,
  signIn,
  clearSession,
  type SharedSession,
} from "./cloud";
import { api } from "./api";

export function AuthGate({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<SharedSession | null>(null);
  const [loading, setLoading] = useState(isCloud);
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!isCloud) return;
    let alive = true;
    const sync = () => {
      setSession(getSession());
      setLoading(false);
    };
    async function restore() {
      if (!getSession()) {
        if (alive) sync();
        return;
      }
      try {
        await api("/auth/session");
        if (alive) sync();
      } catch {
        if (alive) {
          setLoading(false);
          setError(
            "ログイン情報を確認できませんでした。再度ログインしてください。",
          );
        }
      }
    }
    void restore();
    window.addEventListener(SESSION_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      alive = false;
      window.removeEventListener(SESSION_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);
  useEffect(() => {
    if (!session) return;
    const timer = setTimeout(
      clearSession,
      Math.max(0, Date.parse(session.expiresAt) - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [session]);
  async function login(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await signIn(loginId.trim(), password);
      setPassword("");
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "ID・パスワードと接続状態を確認してください。",
      );
    } finally {
      setBusy(false);
    }
  }
  if (!isCloud || session) return <>{children}</>;
  if (loading)
    return (
      <div className="auth-loading">
        <LoaderCircle className="spin" size={26} />
        <span>ワークスペースを準備しています</span>
      </div>
    );
  return (
    <div className="login-page">
      <section className="login-story">
        <div className="brand">
          <span className="brand-symbol">
            <AudioLines size={24} />
          </span>
          <span>
            kotonoha<small>会話を、次の一歩に。</small>
          </span>
        </div>
        <div className="login-story-body">
          <span className="eyebrow">YOUR MEETING, CLEARLY.</span>
          <h1>
            話したことを、
            <br />
            使える記録に。
          </h1>
          <p>
            録音を渡すだけで、文字起こしから議事録まで。
            <br />
            会議の大切なことと、次にやることをひとつに。
          </p>
          <div className="login-flow">
            <span>録音ファイル</span>
            <ArrowRight size={16} />
            <span>文字起こし</span>
            <ArrowRight size={16} />
            <span>議事録</span>
          </div>
        </div>
        <span className="login-models">
          GPT-4o Transcribe × GPT-6 Astra / Sol
        </span>
      </section>
      <section className="login-form-panel">
        <form onSubmit={login}>
          <span className="login-lock">
            <LockKeyhole size={25} />
          </span>
          <h2>おかえりなさい。</h2>
          <p>ワークスペースにログインして、会議を整理しましょう。</p>
          <label className="field">
            ログインID
            <input
              type="text"
              autoComplete="username"
              value={loginId}
              onChange={(e) => setLoginId(e.target.value)}
              autoCapitalize="none"
              spellCheck={false}
              required
              placeholder="ログインIDを入力"
            />
          </label>
          <label className="field">
            パスワード
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>
          {error && (
            <div className="error-message" role="alert">
              {error}
            </div>
          )}
          <button className="button primary" disabled={busy}>
            {busy ? (
              <LoaderCircle size={17} className="spin" />
            ) : (
              <ArrowRight size={17} />
            )}
            {busy ? "ログインしています…" : "ログイン"}
          </button>
          <div className="login-account-note">
            <ShieldCheck size={17} />
            <p>
              共通のID・パスワードでログインします。ログインした全員が、同じ会議・音声・議事録を閲覧・編集できます。共用端末では利用後にログアウトしてください。
            </p>
          </div>
        </form>
      </section>
    </div>
  );
}
