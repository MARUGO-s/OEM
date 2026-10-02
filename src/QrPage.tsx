import {
  type FormEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import QRCode from "qrcode";
import {
  ArrowDownToLine,
  Copy,
  LoaderCircle,
  Pause,
  Play,
  QrCode,
  RefreshCw,
  X,
} from "lucide-react";
import { qrApi, type QrHistory, type QrLink, trackingUrl } from "./qr-api";
import { isCloud } from "./cloud";
import { QrAnalytics } from "./QrAnalytics";
import {
  sourceLabels,
  deviceLabels,
  browserLabels,
  buttonHtml,
} from "./qr-labels.mjs";

const dateTime = (value: string) =>
  new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    dateStyle: "short",
    timeStyle: "medium",
  }).format(new Date(value));
const errorText = (error: unknown) =>
  error instanceof Error ? error.message : "通信結果を確認できませんでした。";

export function QrPage({ notify }: { notify: (message: string) => void }) {
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [links, setLinks] = useState<QrLink[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<QrLink | null>(null);
  const [qr, setQr] = useState("");
  const [qrError, setQrError] = useState("");
  const [history, setHistory] = useState<QrHistory | null>(null);
  const [historyPage, setHistoryPage] = useState(0);
  const [historyError, setHistoryError] = useState("");
  const [detailRefreshKey, setDetailRefreshKey] = useState(0);
  const createRequest = useRef<{
    id: string;
    title: string;
    targetUrl: string;
  } | null>(null);
  const mounted = useRef(true);
  const currentPage = useRef(page);
  currentPage.current = page;
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const refresh = useCallback(async () => {
    const requestedPage = page;
    try {
      const data = await qrApi<{ links: QrLink[]; total: number }>(
        `/links?page=${page}`,
      );
      if (!mounted.current || currentPage.current !== requestedPage) return;
      setLinks(data.links);
      setTotal(data.total);
      setError("");
      setSelected((prev) =>
        prev ? data.links.find((link) => link.id === prev.id) || prev : null,
      );
    } catch (e) {
      if (mounted.current) setError(errorText(e));
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [page]);
  useEffect(() => {
    if (!isCloud) {
      setLoading(false);
      return;
    }
    setLoading(true);
    void refresh();
    const timer = setInterval(() => {
      if (!document.hidden) void refresh();
    }, 10000);
    return () => clearInterval(timer);
  }, [refresh]);
  useEffect(() => {
    let alive = true;
    setQr("");
    setQrError("");
    if (selected) {
      QRCode.toDataURL(trackingUrl(selected.code, "qr"), {
        width: 640,
        margin: 4,
        errorCorrectionLevel: "M",
      })
        .then((value) => {
          if (alive) setQr(value);
        })
        .catch(() => {
          if (alive) {
            setQrError(
              "QR画像を生成できませんでした。別のリンクを選ぶか画面を開き直してください。",
            );
          }
        });
    }
    return () => {
      alive = false;
    };
  }, [selected?.code]);
  useEffect(() => {
    let alive = true;
    setHistory(null);
    setHistoryError("");
    if (!selected) return;
    const load = () =>
      qrApi<QrHistory>(`/links/${selected.id}/history?page=${historyPage}`)
        .then((value) => {
          if (alive) {
            setHistory(value);
            setHistoryError("");
          }
        })
        .catch((e) => {
          if (alive) setHistoryError(errorText(e));
        });
    void load();
    const timer = setInterval(() => {
      if (!document.hidden) void load();
    }, 10000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [selected?.id, historyPage, detailRefreshKey]);
  async function create(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    const fields = { title: title.trim(), targetUrl: url.trim() };
    if (
      !createRequest.current ||
      createRequest.current.title !== fields.title ||
      createRequest.current.targetUrl !== fields.targetUrl
    ) {
      createRequest.current = { id: crypto.randomUUID(), ...fields };
    }
    setBusy(true);
    setError("");
    try {
      const link = await qrApi<QrLink>("/links", {
        method: "POST",
        body: JSON.stringify(createRequest.current),
      });
      createRequest.current = null;
      setTitle("");
      setUrl("");
      setSelected(link);
      setHistoryPage(0);
      setPage(0);
      notify("QRコードを作成しました。");
      void refresh();
    } catch (e) {
      setError(`${errorText(e)} 同じ内容で再試行しても重複登録しません。`);
    } finally {
      setBusy(false);
    }
  }
  async function copy(
    link: QrLink,
    source: "qr" | "button" | "link" = "button",
  ) {
    try {
      await navigator.clipboard.writeText(trackingUrl(link.code, source));
      notify("計測用URLをコピーしました。");
    } catch {
      notify(
        "コピーできませんでした。表示されたURLを選択してコピーしてください。",
      );
    }
  }
  async function toggle(link: QrLink) {
    if (busy) return;
    setBusy(true);
    try {
      const updated = await qrApi<QrLink>(`/links/${link.id}`, {
        method: "PATCH",
        body: JSON.stringify({ active: !link.active }),
      });
      setSelected((prev) => (prev?.id === link.id ? updated : prev));
      await refresh();
      notify(
        updated.active
          ? "QRコードを再開しました。"
          : "QRコードを停止しました。読み込んでも転送されません。",
      );
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="qr-page">
      <div className="page-heading">
        <div>
          <div className="eyebrow">MARUGO QR TRACK</div>
          <h1>QR・短縮URLのアクセス分析</h1>
          <p>
            QRとリンクボタンを作成し、アクセスの推移・流入元を確認できます。
          </p>
        </div>
        <button
          className="button secondary"
          onClick={() => {
            void refresh();
            setDetailRefreshKey((n) => n + 1);
          }}
          disabled={loading || !isCloud}
        >
          <RefreshCw size={16} />
          更新
        </button>
      </div>
      {!isCloud ? (
        <div className="empty-state">
          QR機能は共有ワークスペースで利用できます。公開サイトへログインしてください。
        </div>
      ) : (
        <>
          {error && (
            <div className="error-message" role="alert">
              {error}
            </div>
          )}
          <form className="qr-create-card" onSubmit={create}>
            <label>
              管理用の名前
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={120}
                placeholder="例：店頭ポスター・秋のキャンペーン"
                required
                disabled={busy}
              />
            </label>
            <label>
              リンク先URL
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                maxLength={2048}
                placeholder="https://example.com/"
                required
                disabled={busy}
              />
            </label>
            <button className="button primary" disabled={busy}>
              {busy ? (
                <LoaderCircle size={17} className="spin" />
              ) : (
                <QrCode size={17} />
              )}
              QRコードを作成
            </button>
            <p>
              QRには短い計測用URLが入ります。開くとアクセスを記録し、リンク先へ自動転送します。
            </p>
          </form>
          <p className="qr-measure-note">
            QR用・ボタン用・通常リンク用のURLで経路を識別します。回数には再読み込み・直接クリック・ボットも含み、人数や移動先の表示完了は計測しません。流入元が渡されない場合や以前のURLは「不明」です。端末・ブラウザーは推定です。
          </p>
          {selected && (
            <section className="qr-detail-card" aria-label="QRコードの詳細">
              <div className="qr-preview">
                {qr ? (
                  <img src={qr} alt={`${selected.title}のQRコード`} />
                ) : qrError ? (
                  <p role="alert">{qrError}</p>
                ) : (
                  <LoaderCircle className="spin" />
                )}
                <a
                  className={`button secondary ${!qr ? "qr-disabled" : ""}`}
                  href={qr || undefined}
                  download={`marugo-qr-${selected.code}.png`}
                  aria-disabled={!qr}
                  onClick={(e) => {
                    if (!qr) {
                      e.preventDefault();
                    }
                  }}
                >
                  <ArrowDownToLine size={16} />
                  PNGを保存
                </a>
              </div>
              <div className="qr-detail-body">
                <div className="qr-detail-heading">
                  <h2>{selected.title}</h2>
                  <button
                    type="button"
                    className="icon-button"
                    aria-label="QR詳細を閉じる"
                    onClick={() => setSelected(null)}
                  >
                    <X size={18} />
                  </button>
                </div>
                <span
                  className={`qr-status ${selected.active ? "" : "paused"}`}
                >
                  {selected.active ? "転送中" : "停止中"}
                </span>
                <p className="qr-count">
                  {selected.scan_count.toLocaleString()}
                  <small>回のアクセス</small>
                </p>
                <label>
                  ボタン用の短縮URL
                  <div className="qr-copy-row">
                    <input
                      readOnly
                      value={trackingUrl(selected.code, "button")}
                      onFocus={(e) => e.target.select()}
                    />
                    <button
                      type="button"
                      className="button secondary"
                      onClick={() => void copy(selected)}
                    >
                      <Copy size={15} />
                      コピー
                    </button>
                  </div>
                </label>
                <label>
                  QR用の短縮URL
                  <div className="qr-copy-row">
                    <input
                      readOnly
                      value={trackingUrl(selected.code, "qr")}
                      onFocus={(e) => e.target.select()}
                    />
                    <button
                      type="button"
                      className="button secondary"
                      onClick={() => void copy(selected, "qr")}
                    >
                      QR用をコピー
                    </button>
                  </div>
                </label>
                <div className="qr-link-tools">
                  <button
                    type="button"
                    className="button secondary"
                    onClick={() => void copy(selected, "link")}
                  >
                    通常リンク用をコピー
                  </button>
                  <button
                    type="button"
                    className="button secondary"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(
                          buttonHtml(
                            trackingUrl(selected.code, "button"),
                            selected.title,
                          ),
                        );
                        notify(
                          "リンクボタンのHTMLをコピーしました。サイトのHTMLに貼り付けて使えます。",
                        );
                      } catch {
                        notify(
                          "HTMLをコピーできませんでした。ボタン用のURLをサイトのリンク先に指定してください。",
                        );
                      }
                    }}
                  >
                    リンクボタンのHTMLをコピー
                  </button>
                </div>
                <p className="qr-analysis-meta">
                  QR画像はQR用URLを使用します。ボタンにはボタン用URLを指定してください。URLの識別情報で分類するため、QR用URLをボタンに使うとQR経由として計上されます。
                </p>
                <p className="qr-target">転送先：{selected.target_url}</p>
                <button
                  className="button secondary"
                  onClick={() => void toggle(selected)}
                  disabled={busy}
                >
                  {selected.active ? <Pause size={15} /> : <Play size={15} />}
                  {selected.active ? "転送を停止" : "転送を再開"}
                </button>
                <h3>
                  アクセス履歴 <small>日本時間</small>
                </h3>
                {historyError ? (
                  <p className="error-message" role="alert">
                    {historyError}
                  </p>
                ) : !history ? (
                  <p>履歴を読み込み中…</p>
                ) : (
                  <>
                    {!history.events.length ? (
                      <p>まだアクセス履歴がありません。</p>
                    ) : (
                      <div
                        className="qr-table-scroll"
                        role="region"
                        aria-label="アクセス履歴の表"
                        tabIndex={0}
                      >
                        <table className="qr-data-table">
                          <caption>
                            個別のアクセス履歴（最新順・日本時間）
                          </caption>
                          <thead>
                            <tr>
                              <th scope="col">日時</th>
                              <th scope="col">経路</th>
                              <th scope="col">流入元サイト</th>
                              <th scope="col">端末</th>
                              <th scope="col">ブラウザー</th>
                            </tr>
                          </thead>
                          <tbody>
                            {history.events.map((event) => (
                              <tr key={event.id}>
                                <td>
                                  <time dateTime={event.accessed_at}>
                                    {dateTime(event.accessed_at)}
                                  </time>
                                </td>
                                <td>{sourceLabels[event.source] ?? "不明"}</td>
                                <td>
                                  {event.referrer_host || "不明／直接アクセス"}
                                </td>
                                <td>{deviceLabels[event.device] ?? "不明"}</td>
                                <td title={event.user_agent || ""}>
                                  {browserLabels[event.browser] ?? "不明"}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                    {history.total > 30 && (
                      <div className="qr-pagination">
                        <button
                          className="button secondary"
                          disabled={historyPage === 0}
                          onClick={() => setHistoryPage((p) => p - 1)}
                        >
                          前へ
                        </button>
                        <span>
                          {historyPage + 1} / {Math.ceil(history.total / 30)}
                        </span>
                        <button
                          className="button secondary"
                          disabled={(historyPage + 1) * 30 >= history.total}
                          onClick={() => setHistoryPage((p) => p + 1)}
                        >
                          次へ
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            </section>
          )}
          {selected && (
            <QrAnalytics linkId={selected.id} refreshKey={detailRefreshKey} />
          )}
          <div className="qr-list-heading">
            <h2>登録済みQRコード</h2>
            <span>{total}件</span>
          </div>
          {loading ? (
            <p>
              <LoaderCircle size={18} className="spin" />
              読み込み中…
            </p>
          ) : !links.length ? (
            <div className="empty-state">
              名前とURLを入力して、最初のQRコードを作成してください。
            </div>
          ) : (
            <div className="qr-link-list">
              {links.map((link) => (
                <button
                  key={link.id}
                  className={`qr-link-row ${
                    selected?.id === link.id ? "selected" : ""
                  }`}
                  onClick={() => {
                    setSelected(link);
                    setHistoryPage(0);
                  }}
                >
                  <span className="qr-link-icon">
                    <QrCode size={24} />
                  </span>
                  <span className="qr-link-title">
                    <b>{link.title}</b>
                    <small>{link.target_url}</small>
                    <small>作成 {dateTime(link.created_at)}</small>
                  </span>
                  <span className={`qr-status ${link.active ? "" : "paused"}`}>
                    {link.active ? "転送中" : "停止中"}
                  </span>
                  <span className="qr-row-count">
                    {link.scan_count.toLocaleString()}
                    <small>アクセス</small>
                  </span>
                </button>
              ))}
            </div>
          )}
          {total > 50 && (
            <div className="qr-pagination">
              <button
                className="button secondary"
                disabled={!page}
                onClick={() => setPage((p) => p - 1)}
              >
                前へ
              </button>
              <span>
                {page + 1} / {Math.ceil(total / 50)}
              </span>
              <button
                className="button secondary"
                disabled={(page + 1) * 50 >= total}
                onClick={() => setPage((p) => p + 1)}
              >
                次へ
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
