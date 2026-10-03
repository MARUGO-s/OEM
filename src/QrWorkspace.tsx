import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, LogOut, QrCode } from "lucide-react";
import { QrPage } from "./QrPage";
import { QrAccountManagement } from "./QrAccountManagement";
import { QrScopeContext } from "./qr-api";
import {
  accountApi,
  qrAuth,
  type QrAccountContext,
  type QrStore,
} from "./qr-account-client";

export function QrWorkspace({ onChooseApp }: { onChooseApp: () => void }) {
  const [context, setContext] = useState<QrAccountContext | null>(null);
  const [storeId, setStoreId] = useState("");
  const [tab, setTab] = useState<"qr" | "accounts">("qr");
  const [stores, setStores] = useState<QrStore[]>([]);
  const [requestedStore, setRequestedStore] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [qrBusy, setQrBusy] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const revision = useRef(0);
  const identity = useRef<string | null>(null);
  const chooseRef = useRef(onChooseApp);
  chooseRef.current = onChooseApp;
  const refresh = useCallback(async () => {
    const request = ++revision.current;
    try {
      const {
        data: { session },
      } = await qrAuth.auth.getSession();
      if (!session) {
        chooseRef.current();
        return;
      }
      identity.current = session.user.id;
      let next = await accountApi<QrAccountContext>("/context");
      const requested = session.user.user_metadata?.marugo_qr_store_id;
      if (
        !next.member &&
        typeof requested === "string" &&
        /^[0-9a-f-]{36}$/i.test(requested)
      )
        next = await accountApi<QrAccountContext>("/register", {
          method: "POST",
          body: JSON.stringify({ storeId: requested }),
        });
      if (request !== revision.current) return;
      setContext(next);
      setError("");
      setStoreId((previous) =>
        next.stores.some((store) => store.id === previous)
          ? previous
          : next.stores.find((store) => store.legacy)?.id ||
            next.stores[0]?.id ||
            "",
      );
      if (!next.member) {
        const list = await accountApi<{ stores: QrStore[] }>(
          "/stores",
          {},
          true,
        );
        if (request === revision.current) setStores(list.stores);
      }
    } catch (e) {
      if (request === revision.current) {
        setContext(null);
        setError(
          e instanceof Error ? e.message : "所属を確認できませんでした。",
        );
      }
    } finally {
      if (request === revision.current) setLoading(false);
    }
  }, []);
  useEffect(() => {
    void refresh();
    const {
      data: { subscription },
    } = qrAuth.auth.onAuthStateChange((event, session) => {
      if (
        event === "SIGNED_OUT" ||
        (event === "SIGNED_IN" && session?.user.id !== identity.current)
      ) {
        identity.current = session?.user.id || null;
        ++revision.current;
        setContext(null);
        setLoading(true);
        // Do not await Auth inside the SDK's locked auth-event callback.
        setTimeout(() => {
          void refresh();
        }, 0);
      }
    });
    const interval = setInterval(() => {
      if (!document.hidden) void refresh();
    }, 30000);
    return () => {
      ++revision.current;
      subscription.unsubscribe();
      clearInterval(interval);
    };
  }, [refresh]);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  function notify(message: string) {
    setToast(message);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(""), 5000);
  }
  const scope = useMemo(
    () =>
      context?.member && storeId
        ? { userId: context.member.user_id, storeId }
        : null,
    [context?.member?.user_id, storeId],
  );
  const active = context?.member?.status === "active";
  const admin = active && context?.member?.role === "admin";
  const selected = context?.stores.find((store) => store.id === storeId);
  return (
    <div className="qr-workspace">
      <header className="qr-workspace-header">
        <div className="brand">
          <span className="brand-symbol">
            <QrCode size={24} />
          </span>
          <span>
            MARUGO QR<small>店舗別 QRコード作成・アクセス分析</small>
          </span>
        </div>
        <div className="qr-workspace-tools">
          <button
            className="button secondary"
            onClick={onChooseApp}
            disabled={qrBusy}
          >
            <ArrowLeft size={17} />
            アプリ選択に戻る
          </button>
          <button
            className="button secondary"
            disabled={qrBusy}
            onClick={async () => {
              const { error: failure } = await qrAuth.auth.signOut({
                scope: "local",
              });
              if (failure)
                notify("ログアウトできませんでした。再度お試しください。");
              else {
                setContext(null);
                onChooseApp();
              }
            }}
          >
            <LogOut size={17} />
            ログアウト
          </button>
        </div>
      </header>
      <main className="qr-workspace-main">
        {loading ? (
          <p role="status">所属店舗を確認しています…</p>
        ) : (
          <>
            {error && (
              <div className="error-message" role="alert">
                {error}
                <button
                  className="button secondary"
                  onClick={() => void refresh()}
                >
                  もう一度確認
                </button>
              </div>
            )}
            {context && (
              <section className="qr-store-heading">
                <div>
                  <span className="eyebrow">
                    {admin
                      ? "ALL STORES / 全店舗管理者"
                      : "MY STORE / 所属店舗"}
                  </span>
                  <h1>
                    {active
                      ? selected?.name || "店舗を選択してください"
                      : context.member?.status === "suspended"
                        ? "利用停止中"
                        : "所属店舗の承認待ち"}
                  </h1>
                  <p>{context.email}</p>
                </div>
                {admin && (
                  <label className="field">
                    表示する店舗
                    <select
                      value={storeId}
                      disabled={qrBusy}
                      onChange={(e) => {
                        setStoreId(e.target.value);
                        setToast("");
                      }}
                    >
                      <option value="" disabled>
                        店舗を選択
                      </option>
                      {context.stores.map((store) => (
                        <option value={store.id} key={store.id}>
                          {store.name}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </section>
            )}
            {context && !context.member && (
              <form
                className="qr-affiliation-form"
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (busy) return;
                  setBusy(true);
                  setError("");
                  try {
                    await accountApi("/register", {
                      method: "POST",
                      body: JSON.stringify({ storeId: requestedStore }),
                    });
                    await refresh();
                  } catch (failure) {
                    setError(
                      failure instanceof Error
                        ? failure.message
                        : "所属を登録できませんでした。",
                    );
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <p>
                  初めてQRを利用する方は所属店舗を申請してください。管理者の承認後に利用できます。
                </p>
                <label className="field">
                  所属店舗
                  <select
                    required
                    value={requestedStore}
                    onChange={(e) => setRequestedStore(e.target.value)}
                    disabled={busy}
                  >
                    <option value="">店舗を選択してください</option>
                    {stores.map((store) => (
                      <option key={store.id} value={store.id}>
                        {store.name}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  className="button primary"
                  disabled={busy || !requestedStore}
                >
                  {busy ? "申請中…" : "所属店舗を申請"}
                </button>
              </form>
            )}
            {context?.member && !active && (
              <div className="qr-account-message">
                {context.member.status === "pending"
                  ? `${context.member.store_name || "申請した店舗"}の所属確認を管理者へ依頼してください。承認されるまでQR・アクセス履歴・ファイルは表示されません。`
                  : "利用状態について管理者へお問い合わせください。"}
                <button
                  className="button secondary"
                  onClick={() => void refresh()}
                >
                  承認状態を更新
                </button>
              </div>
            )}
            {admin && (
              <nav className="qr-admin-tabs" aria-label="管理画面">
                <button
                  className={`button ${tab === "qr" ? "primary" : "secondary"}`}
                  onClick={() => setTab("qr")}
                  disabled={qrBusy}
                >
                  店舗のQR・アクセス分析
                </button>
                <button
                  className={`button ${tab === "accounts" ? "primary" : "secondary"}`}
                  onClick={() => setTab("accounts")}
                  disabled={qrBusy}
                >
                  アカウント管理
                </button>
              </nav>
            )}
            {admin && tab === "accounts" ? (
              <QrAccountManagement
                stores={context!.stores.filter((store) => !store.legacy)}
                currentUserId={context!.member!.user_id}
                notify={notify}
              />
            ) : (
              active &&
              selected &&
              scope && (
                <QrScopeContext.Provider value={scope}>
                  <QrPage
                    key={`${scope.userId}:${scope.storeId}`}
                    notify={notify}
                    onBusyChange={setQrBusy}
                  />
                </QrScopeContext.Provider>
              )
            )}
          </>
        )}
      </main>
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </div>
  );
}
