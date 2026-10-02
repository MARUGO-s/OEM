import { useEffect, useRef, useState } from "react";
import { ArrowLeft, LogOut, QrCode } from "lucide-react";
import { QrPage } from "./QrPage";
import { isCloud, signOut } from "./cloud";

export function QrWorkspace({ onChooseApp }: { onChooseApp: () => void }) {
  const [toast, setToast] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function notify(message: string) {
    setToast(message);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(""), 5000);
  }
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  return (
    <div className="qr-workspace">
      <header className="qr-workspace-header">
        <div className="brand">
          <span className="brand-symbol">
            <QrCode size={24} />
          </span>
          <span>
            MARUGO QR<small>QRコード作成・アクセス分析</small>
          </span>
        </div>
        <div className="qr-workspace-tools">
          <button className="button secondary" onClick={onChooseApp}>
            <ArrowLeft size={17} />
            アプリ選択に戻る
          </button>
          {isCloud && (
            <button
              className="button secondary"
              onClick={async () => {
                try {
                  await signOut();
                } catch {
                  notify("ログアウトできませんでした。再度お試しください。");
                }
              }}
            >
              <LogOut size={17} />
              ログアウト
            </button>
          )}
        </div>
      </header>
      <main className="qr-workspace-main">
        <QrPage notify={notify} />
      </main>
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </div>
  );
}
