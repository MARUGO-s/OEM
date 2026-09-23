import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import {
  AudioLines,
  ArrowRight,
  LoaderCircle,
  LockKeyhole,
  ShieldCheck,
} from "lucide-react";
import type { Session } from "@supabase/supabase-js";
import { isCloud, supabase } from "./cloud";

export function AuthGate({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(isCloud);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!isCloud) return;
    let alive = true;
    void supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (alive) {
          setSession(data.session);
          setLoading(false);
          if (error)
            setError(
              "ログイン情報を確認できませんでした。再度ログインしてください。",
            );
        }
      })
      .catch(() => {
        if (alive) {
          setLoading(false);
          setError("接続状態を確認して再度ログインしてください。");
        }
      });
    const { data } = supabase.auth.onAuthStateChange((_event, value) => {
      setSession(value);
      setLoading(false);
    });
    return () => {
      alive = false;
      data.subscription.unsubscribe();
    };
  }, []);
  async function login(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) throw error;
      setPassword("");
    } catch {
      setError(
        "ログインできませんでした。メールアドレスとパスワード、接続状態を確認してください。",
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
            メールアドレス
            <input
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="you@example.com"
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
              Recipe-Managementでお使いのアカウントでログインできます。会議録は専用領域に保存され、ご自身の記録だけが表示されます。アカウントがない場合は管理者にお問い合わせください。
            </p>
          </div>
        </form>
      </section>
    </div>
  );
}
