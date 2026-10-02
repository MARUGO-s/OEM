import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "./cloud";
import "./qr-file-viewer.css";
type PublicFile = {
  title: string;
  fileName: string;
  mime: string;
  size: number;
  url: string;
  downloadUrl: string;
  expiresAt: string;
};
function PublicQrFile() {
  const code = new URLSearchParams(location.search).get("file") ?? "";
  const [file, setFile] = useState<PublicFile | null>(null);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let alive = true;
    const abort = new AbortController();
    setLoading(true);
    setError("");
    setFile(null);
    (async () => {
      if (!/^[A-Za-z0-9_-]{12}$/.test(code))
        throw new Error("ファイルのURLが正しくありません。");
      const response = await fetch(
        `${SUPABASE_URL}/functions/v1/marugo-qr/files/${code}`,
        {
          headers: { apikey: SUPABASE_PUBLISHABLE_KEY },
          signal: AbortSignal.any([abort.signal, AbortSignal.timeout(20000)]),
        },
      );
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "ファイルを開けませんでした。");
      if (alive) {
        setFile(data);
        document.title = `${data.title} — MARUGO QR`;
      }
    })()
      .catch((e) => {
        if (alive)
          setError(
            e instanceof Error ? e.message : "ファイルを開けませんでした。",
          );
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
      abort.abort();
    };
  }, [code, reload]);
  return (
    <main className="public-qr-file">
      <header>
        <small>MARUGO QR</small>
        <h1>{file?.title || "公開ファイル"}</h1>
        {file && (
          <p>
            {file.fileName} · {(file.size / 1024 / 1024).toFixed(2)} MB
          </p>
        )}
      </header>
      {loading && <p role="status">ファイルを準備しています…</p>}
      {error && (
        <section role="alert">
          <p>{error}</p>
          <button onClick={() => setReload((n) => n + 1)}>もう一度試す</button>
        </section>
      )}
      {file && (
        <>
          <nav>
            <a href={file.url} target="_blank" rel="noopener noreferrer">
              別画面で開く
            </a>
            <a
              href={file.downloadUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              ダウンロード
            </a>
            <button onClick={() => setReload((n) => n + 1)}>表示を更新</button>
          </nav>
          {file.mime === "application/pdf" ? (
            <iframe
              key={file.url}
              src={file.url}
              title={`${file.title}のPDF`}
              referrerPolicy="no-referrer"
            />
          ) : (
            <img src={file.url} alt={file.title} referrerPolicy="no-referrer" />
          )}
          <p className="public-file-note">
            PDFが表示されない端末では「別画面で開く」または「ダウンロード」をお使いください。リンクが期限切れの場合は「表示を更新」で読み直せます。
          </p>
        </>
      )}
    </main>
  );
}
createRoot(document.getElementById("root")!).render(<PublicQrFile />);
