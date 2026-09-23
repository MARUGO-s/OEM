import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, RefreshCw, ReceiptText } from "lucide-react";
import { api } from "./api";
import { modelName, transcriptionModelName, type UsageMonth } from "./types";

const monthNow = () => new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit",
}).format(new Date());
const integer = (value: number | null) => value === null ? "—" : value.toLocaleString("ja-JP");
const usd = (value: number) => `$${value.toFixed(6)}`;
const when = (value: string) => new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo", month: "numeric", day: "numeric",
  hour: "2-digit", minute: "2-digit",
}).format(new Date(value));

export function UsagePage() {
  const [month, setMonth] = useState(monthNow);
  const [page, setPage] = useState(0);
  const [revision, setRevision] = useState(0);
  const [data, setData] = useState<UsageMonth | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    setLoading(true);
    setData(null);
    api<UsageMonth>(`/usage?month=${encodeURIComponent(month)}&page=${page}`)
      .then((result) => {
        if (!active) return;
        setData(result);
        setError("");
      })
      .catch((cause) => {
        if (active) setError((cause as Error).message);
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [month, page, revision]);

  return (
    <div className="usage-page">
      <div className="page-heading">
        <div>
          <div className="eyebrow">API USAGE.</div>
          <h1>API使用料</h1>
          <p>文字起こしと議事録生成の利用量を、呼び出しごとに確認できます。</p>
        </div>
      </div>
      <div className="usage-toolbar">
        <label>対象月（日本時間）
          <input type="month" value={month} max={monthNow()} onChange={(event) => {
            setMonth(event.target.value); setPage(0);
          }} />
        </label>
        <button className="button secondary" onClick={() => setRevision((value) => value + 1)}>
          <RefreshCw size={16} /> 更新
        </button>
      </div>
      {error && <p className="error-message" role="alert">{error}</p>}
      {loading && !data ? <p className="usage-muted">読み込み中…</p> : data && (
        <>
          <div className="usage-summary">
            <div><span>対象月の概算合計</span><strong>{usd(data.totalUsd)}</strong></div>
            <div><span>API呼び出し</span><strong>{integer(data.eventCount)} 件</strong></div>
            <div><span>料金を算出できない呼び出し</span><strong>{integer(data.unpricedCount)} 件</strong></div>
          </div>
          <p className="usage-note">米ドル建ての概算です。APIの応答にある使用量を優先し、音声時間から算出した行には「推定」を付けます。無料枠・税・為替・後日の単価変更は反映しません。過去の利用は記録開始前に遡って表示できません。実際の請求額は各社の請求画面で確認してください。</p>
          {data.eventCount === 0 ? (
            <div className="empty-state standalone">
              <ReceiptText size={36} />
              <h3>この月の利用履歴はありません</h3>
              <p>新しく文字起こしや議事録を生成すると、ここに記録されます。</p>
            </div>
          ) : (
            <>
              <div className="usage-table-wrap">
                <table className="usage-table">
                  <thead><tr><th>日時</th><th>会議・処理</th><th>モデル</th><th>コンテキスト・出力</th><th>料金</th></tr></thead>
                  <tbody>{data.events.map((event) => (
                    <tr key={event.id}>
                      <td>{when(event.createdAt)}</td>
                      <td><strong>{event.meetingTitle}</strong><small>{event.kind === "minutes" ? "会話解析・議事録" : "文字起こし"}</small></td>
                      <td>{event.kind === "minutes" ? modelName(event.model) : transcriptionModelName(event.model)}<small>{event.provider}</small></td>
                      <td>
                        <span>入力 {integer(event.inputTokens)} token</span>
                        <span>出力 {integer(event.outputTokens)} token</span>
                        {event.cachedInputTokens !== null && event.cachedInputTokens > 0 && <span>うちキャッシュ {integer(event.cachedInputTokens)}</span>}
                        {event.reasoningTokens !== null && event.reasoningTokens > 0 && <span>うち推論 {integer(event.reasoningTokens)}</span>}
                        {event.audioSeconds !== null && <span>音声 {(event.audioSeconds / 60).toFixed(1)} 分</span>}
                      </td>
                      <td><strong>{event.costUsd === null ? "算出不可" : usd(event.costUsd)}</strong>{event.estimated && <small>推定</small>}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
              <div className="usage-pagination">
                <span>{page * 100 + 1}–{Math.min((page + 1) * 100, data.eventCount)} / {data.eventCount} 件</span>
                <button className="button secondary" disabled={page === 0} onClick={() => setPage((value) => value - 1)}><ArrowLeft size={15} /> 前へ</button>
                <button className="button secondary" disabled={(page + 1) * 100 >= data.eventCount} onClick={() => setPage((value) => value + 1)}>次へ <ArrowRight size={15} /></button>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
