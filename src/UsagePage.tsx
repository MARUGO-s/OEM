import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, RefreshCw, ReceiptText } from "lucide-react";
import { api } from "./api";
import { groupUsageEvents } from "../supabase/functions/_shared/usage-groups.mjs";
import { modelName, transcriptionModelName, type Meeting, type UsageEvent, type UsageMonth } from "./types";

const monthNow = () => new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit",
}).format(new Date());
const rateKey = (month: string) => `kotonoha-usd-jpy-${month}`;
function savedRate(month: string): number | null {
  try {
    const raw = localStorage.getItem(rateKey(month));
    const value = raw === null ? null : Number(raw);
    return value !== null && Number.isFinite(value) && value > 0 && value <= 10000 ? value : null;
  } catch { return null; }
}
const integer = (value: number | null) => value === null ? "—" : value.toLocaleString("ja-JP");
const yen = (usd: number, rate: number | null) => {
  if (rate === null) return "—";
  const value = usd * rate;
  if (value > 0 && value < 0.0001) return "¥0.0001未満";
  return new Intl.NumberFormat("ja-JP", {
    style: "currency", currency: "JPY", minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(value);
};
const when = (value: string) => new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo", month: "numeric", day: "numeric",
  hour: "2-digit", minute: "2-digit",
}).format(new Date(value));
const PAGE_SIZE = 20;

export function UsagePage({ meetings }: { meetings: Meeting[] }) {
  const [month, setMonth] = useState(monthNow);
  const [page, setPage] = useState(0);
  const [revision, setRevision] = useState(0);
  const [data, setData] = useState<UsageMonth | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [rate, setRate] = useState<number | null>(() => savedRate(monthNow()));
  const [rateDraft, setRateDraft] = useState(() => String(savedRate(monthNow()) ?? ""));
  const [rateError, setRateError] = useState("");
  const meetingNames = new Map(meetings.map((meeting) => [meeting.id, meeting.title]));
  const groups = useMemo(() => groupUsageEvents(data?.events || []) as Array<{
    id: string; meetingId: string; legacy: boolean; createdAt: string;
    totalUsd: number; unpricedCount: number; inputTokens: number;
    outputTokens: number; audioSeconds: number; events: UsageEvent[];
  }>, [data]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setData(null);
    (async () => {
      const first = await api<UsageMonth>(`/usage?month=${encodeURIComponent(month)}&page=0`);
      const events = [...first.events];
      const pages = Math.ceil(first.eventCount / 100);
      for (let offset = 1; offset < pages; offset += 5) {
        if (!active) return;
        const chunk = await Promise.all(Array.from({ length: Math.min(5, pages - offset) }, (_, index) =>
          api<UsageMonth>(`/usage?month=${encodeURIComponent(month)}&page=${offset + index}`)));
        for (const result of chunk) events.push(...result.events);
      }
      if (active) { setData({ ...first, events }); setError(""); }
    })().catch((cause) => { if (active) setError((cause as Error).message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [month, revision]);

  function changeMonth(next: string) {
    setMonth(next);
    setPage(0);
    const saved = savedRate(next);
    setRate(saved);
    setRateDraft(String(saved ?? ""));
    setRateError("");
  }
  function saveRate() {
    const value = Number(rateDraft);
    if (rateDraft.trim() === "" || !Number.isFinite(value) || value <= 0 || value > 10000) {
      setRateError("1ドルあたりの円額を、0より大きい数値で入力してください。");
      return;
    }
    try {
      localStorage.setItem(rateKey(month), String(value));
      setRate(value);
      setRateError("");
    } catch { setRateError("このブラウザーに為替レートを保存できませんでした。"); }
  }

  return (
    <div className="usage-page">
      <div className="page-heading">
        <div>
          <div className="eyebrow">API USAGE.</div>
          <h1>API使用料</h1>
          <p>解析1回ごとの概算料金を円で確認できます。内訳を開くと各API呼び出しの利用量が表示されます。</p>
        </div>
      </div>
      <div className="usage-toolbar">
        <label>対象月（日本時間）
          <input type="month" value={month} max={monthNow()} onChange={(event) => changeMonth(event.target.value)} />
        </label>
        <label>この月の為替レート（1 USD = 何円）
          <input type="number" value={rateDraft} min="0.0001" max="10000" step="0.0001"
            placeholder="例: 150" onChange={(event) => setRateDraft(event.target.value)} />
        </label>
        <button className="button secondary" onClick={saveRate}>レートを保存</button>
        <button className="button secondary" onClick={() => setRevision((value) => value + 1)}>
          <RefreshCw size={16} /> 更新
        </button>
      </div>
      {rateError && <p className="error-message" role="alert">{rateError}</p>}
      {error && <p className="error-message" role="alert">{error}</p>}
      {loading && !data ? <p className="usage-muted">読み込み中…</p> : data && (
        <>
          <div className="usage-summary">
            <div><span>対象月の概算合計</span><strong>{data.eventCount > 0 && data.eventCount === data.unpricedCount ? "算出不可" : yen(data.totalUsd, rate)}</strong></div>
            <div><span>解析回数</span><strong>{integer(groups.length)} 回</strong></div>
            <div><span>API呼び出し</span><strong>{integer(data.eventCount)} 件</strong></div>
            <div><span>料金を算出できない呼び出し</span><strong>{integer(data.unpricedCount)} 件</strong></div>
          </div>
          <p className="usage-note">{rate === null ? "円表示には、この月の為替レートを入力・保存してください。" : `1 USD = ${rate.toLocaleString("ja-JP")} 円で換算。`}レートはこのブラウザーに月ごとに保存され、同じ月の全呼び出しに適用されます。請求時の実際の為替・無料枠・税は反映しません。料金不明の呼び出しは合計に含みません。「推定」は音声時間などから算出した料金です。旧履歴の解析単位は会議と処理順からの推定で、月をまたぐ処理も月別に分かれます。記録開始前の利用は表示できません。実際の請求額は各社の請求画面で確認してください。</p>
          {data.eventCount === 0 ? (
            <div className="empty-state standalone">
              <ReceiptText size={36} />
              <h3>この月の利用履歴はありません</h3>
              <p>新しく文字起こしや議事録を生成すると、ここに記録されます。</p>
            </div>
          ) : (
            <>
              <div className="usage-groups">
                {groups.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).map((group) => (
                  <details className="usage-group" key={group.id}>
                    <summary>
                      <span><strong>{meetingNames.get(group.meetingId) || group.events.at(-1)?.meetingTitle}</strong><small>{when(group.createdAt)} ・ {group.events.length} 呼び出し{group.legacy ? " ・ 旧履歴（まとめ方は推定）" : ""}</small></span>
                      <span className="usage-group-total"><strong>{group.unpricedCount === group.events.length ? "算出不可" : yen(group.totalUsd, rate)}</strong>{group.unpricedCount > 0 && group.unpricedCount < group.events.length && <small>算出不可 {group.unpricedCount} 件を除く</small>}</span>
                    </summary>
                    <div className="usage-group-meta">入力 {integer(group.inputTokens)} token ・ 出力 {integer(group.outputTokens)} token{group.audioSeconds > 0 && ` ・ 音声 ${(group.audioSeconds / 60).toFixed(1)} 分`}</div>
                    <div className="usage-table-wrap">
                      <table className="usage-table">
                        <thead><tr><th>日時</th><th>処理</th><th>モデル</th><th>コンテキスト・出力</th><th>料金</th></tr></thead>
                        <tbody>{group.events.map((event) => (
                          <tr key={event.id}>
                            <td>{when(event.createdAt)}</td>
                            <td>{event.kind === "minutes" ? "会話解析・議事録" : "文字起こし"}</td>
                            <td>{event.kind === "minutes" ? modelName(event.model) : transcriptionModelName(event.model)}<small>{event.provider}</small></td>
                            <td>
                              <span>入力 {integer(event.inputTokens)} token</span>
                              <span>出力 {integer(event.outputTokens)} token</span>
                              {event.cachedInputTokens !== null && event.cachedInputTokens > 0 && <span>うちキャッシュ {integer(event.cachedInputTokens)}</span>}
                              {event.reasoningTokens !== null && event.reasoningTokens > 0 && <span>うち推論 {integer(event.reasoningTokens)}</span>}
                              {event.audioSeconds !== null && <span>音声 {(event.audioSeconds / 60).toFixed(1)} 分</span>}
                            </td>
                            <td><strong>{event.costUsd === null ? "算出不可" : yen(event.costUsd, rate)}</strong>{event.estimated && <small>推定</small>}</td>
                          </tr>
                        ))}</tbody>
                      </table>
                    </div>
                  </details>
                ))}
              </div>
              {groups.length > PAGE_SIZE && <div className="usage-pagination">
                <span>{page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, groups.length)} / {groups.length} 回</span>
                <button className="button secondary" disabled={page === 0} onClick={() => setPage((value) => value - 1)}><ArrowLeft size={15} /> 前へ</button>
                <button className="button secondary" disabled={(page + 1) * PAGE_SIZE >= groups.length} onClick={() => setPage((value) => value + 1)}>次へ <ArrowRight size={15} /></button>
              </div>}
            </>
          )}
        </>
      )}
    </div>
  );
}
