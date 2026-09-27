import { useMemo, useState } from "react";
import {
  CalendarDays,
  Clock,
  CheckCircle,
  Users,
  Sparkles,
  LoaderCircle,
} from "lucide-react";
import { type Meeting } from "./types";
import { api } from "./api";
import { summaryRange as resolveSummaryRange } from "../supabase/functions/_shared/insights.mjs";
import { SummaryMarkdown } from "./SummaryMarkdown.mjs";
import { durationStats, formatDuration } from "../supabase/functions/_shared/duration.mjs";

type SummaryPeriod = "month" | "lastMonth" | "week" | "custom";
const periods: [SummaryPeriod, string][] = [
  ["month", "今月"],
  ["lastMonth", "先月"],
  ["week", "直近7日"],
  ["custom", "期間指定"],
];

export function StatsPage({ meetings }: { meetings: Meeting[] }) {
  const [summaryPeriod, setSummaryPeriod] = useState<SummaryPeriod>("month");
  const today = resolveSummaryRange("month").end;
  const [startDate, setStartDate] = useState(
    () => resolveSummaryRange("month").start,
  );
  const [endDate, setEndDate] = useState(
    () => resolveSummaryRange("month").end,
  );
  const [summary, setSummary] = useState("");
  const [generatingSummary, setGeneratingSummary] = useState(false);
  const [showSummary, setShowSummary] = useState(false);
  const [summaryError, setSummaryError] = useState("");
  const [summaryRange, setSummaryRange] = useState("");
  const selection =
    summaryPeriod === "custom"
      ? { period: summaryPeriod, start: startDate, end: endDate }
      : { period: summaryPeriod };
  let selectedRange: { start: string; end: string } | null = null;
  let rangeError = "";
  if (summaryPeriod === "custom" && (!startDate || !endDate))
    rangeError = "開始日と終了日を入力してください。";
  else if (summaryPeriod === "custom" && startDate > endDate)
    rangeError = "開始日は終了日以前にしてください。";
  else if (summaryPeriod === "custom" && endDate > today)
    rangeError = "終了日は日本時間の今日以前にしてください。";
  else {
    try {
      selectedRange = resolveSummaryRange(selection);
    } catch {
      rangeError = "有効な開始日と終了日を入力してください。";
    }
  }

  const stats = useMemo(() => {
    const realMeetings = meetings.filter((m) => !m.isDemo);

    // 基本統計
    const totalMeetings = realMeetings.length;
    const { total: totalDuration, unknownCount } = durationStats(realMeetings.map(m => m.duration));

    // 月次統計
    const monthlyData = new Map<string, number>();
    realMeetings.forEach((m) => {
      const month = m.date.substring(0, 7); // YYYY-MM
      monthlyData.set(month, (monthlyData.get(month) || 0) + 1);
    });

    // 参加者統計
    const participantData = new Map<string, number>();
    realMeetings.forEach((m) => {
      const participants = m.participants
        .split(/[、,]/)
        .map((p) => p.trim())
        .filter((p) => p);
      participants.forEach((p) => {
        participantData.set(p, (participantData.get(p) || 0) + 1);
      });
    });

    // アクション統計
    const totalActions = realMeetings.reduce(
      (sum, m) => sum + (m.minutes?.actions?.length || 0),
      0,
    );
    const completedActions = realMeetings.reduce(
      (sum, m) => sum + (m.completedActions?.length || 0),
      0,
    );
    const completionRate =
      totalActions > 0 ? (completedActions / totalActions) * 100 : 0;

    // ステータス統計
    const statusCounts = {
      done: realMeetings.filter((m) => m.status === "done").length,
      working: realMeetings.filter(
        (m) => m.status === "transcribing" || m.status === "analyzing",
      ).length,
      error: realMeetings.filter((m) => m.status === "error").length,
    };

    return {
      totalMeetings,
      totalDuration,
      unknownCount,
      monthlyData: Array.from(monthlyData.entries()).sort((a, b) =>
        b[0].localeCompare(a[0]),
      ),
      participantData: Array.from(participantData.entries()).sort(
        (a, b) => b[1] - a[1],
      ),
      totalActions,
      completedActions,
      completionRate,
      statusCounts,
    };
  }, [meetings]);

  async function generateSummary() {
    if (rangeError || generatingSummary) return;
    setGeneratingSummary(true);
    setShowSummary(true);
    setSummary("");
    setSummaryError("");
    setSummaryRange("");
    try {
      const result = await api<{
        summary: string;
        meetingCount: number;
        period: string;
        start: string;
        end: string;
      }>("/summary", {
        method: "POST",
        body: JSON.stringify(selection),
      });
      setSummary(result.summary);
      setSummaryRange(
        `${result.start}〜${result.end}・${result.meetingCount}件`,
      );
    } catch (error) {
      setSummaryError(
        error instanceof Error
          ? error.message
          : "サマリーの生成に失敗しました。",
      );
    } finally {
      setGeneratingSummary(false);
    }
  }

  return (
    <div className="stats-page">
      <div className="stats-header">
        <h2>統計ダッシュボード</h2>
        <p className="muted">会議データの概要と分析</p>
      </div>

      <div className="summary-section">
        <div className="summary-controls">
          <div
            className="period-selector"
            role="group"
            aria-label="サマリーの対象期間"
          >
            {periods.map(([period, label]) => (
              <button
                key={period}
                className={summaryPeriod === period ? "active" : ""}
                aria-pressed={summaryPeriod === period}
                disabled={generatingSummary}
                onClick={() => setSummaryPeriod(period)}
              >
                {label}
              </button>
            ))}
          </div>
          <button
            className="button primary"
            onClick={generateSummary}
            disabled={generatingSummary || !!rangeError}
          >
            {generatingSummary ? (
              <>
                <LoaderCircle size={16} className="spin" />
                生成中...
              </>
            ) : (
              <>
                <Sparkles size={16} />
                AIサマリー生成
              </>
            )}
          </button>
        </div>
        {summaryPeriod === "custom" && (
          <div className="summary-date-range">
            <label>
              開始日
              <input
                type="date"
                value={startDate}
                max={endDate || today}
                disabled={generatingSummary}
                aria-invalid={!!rangeError}
                aria-describedby="summary-range-status"
                onChange={(event) => setStartDate(event.target.value)}
              />
            </label>
            <span aria-hidden="true">〜</span>
            <label>
              終了日
              <input
                type="date"
                value={endDate}
                min={startDate}
                max={today}
                disabled={generatingSummary}
                aria-invalid={!!rangeError}
                aria-describedby="summary-range-status"
                onChange={(event) => setEndDate(event.target.value)}
              />
            </label>
          </div>
        )}
        <p
          id="summary-range-status"
          className={
            rangeError ? "summary-range-error" : "summary-range-preview"
          }
          aria-live="polite"
        >
          {rangeError ||
            `対象：${selectedRange?.start} 〜 ${selectedRange?.end}（日本時間・両端の日付を含む）`}
        </p>
        <p className="muted summary-notice">
          指定期間に開催した完了済み会議が対象です（今日まで・サンプルを除く）。結果はこの画面を閉じると消えます。
        </p>
        {showSummary && (
          <div className="summary-content">
            <div className="summary-header">
              <div>
                <h3>AI生成サマリー</h3>
                {summaryRange && (
                  <p className="summary-result-range">{summaryRange}</p>
                )}
              </div>
              <button
                className="icon-button"
                aria-label="サマリーを閉じる"
                onClick={() => setShowSummary(false)}
              >
                ✕
              </button>
            </div>
            <div className="summary-text">
              {summaryError && <p role="alert">{summaryError}</p>}
              {generatingSummary && (
                <p role="status">サマリーを生成しています…</p>
              )}
              {summary && <SummaryMarkdown content={summary} />}
            </div>
          </div>
        )}
      </div>

      <div className="stats-cards">
        <div className="stat-card">
          <div className="stat-icon">
            <CalendarDays size={24} />
          </div>
          <div className="stat-content">
            <div className="stat-value">{stats.totalMeetings}</div>
            <div className="stat-label">総会議数</div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon">
            <Clock size={24} />
          </div>
          <div className="stat-content">
            <div className="stat-value">
              {formatDuration(stats.totalDuration)}
            </div>
            <div className="stat-label">総録音時間</div>
            {stats.unknownCount > 0 && <small className="muted">未取得{stats.unknownCount}件を除く</small>}
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon">
            <Users size={24} />
          </div>
          <div className="stat-content">
            <div className="stat-value">{stats.participantData.length}</div>
            <div className="stat-label">参加者数</div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon">
            <CheckCircle size={24} />
          </div>
          <div className="stat-content">
            <div className="stat-value">{stats.completionRate.toFixed(1)}%</div>
            <div className="stat-label">アクション完了率</div>
          </div>
        </div>
      </div>

      <div className="stats-sections">
        <div className="stats-section">
          <h3>月次会議数</h3>
          <div className="stats-chart">
            {stats.monthlyData.length > 0 ? (
              stats.monthlyData.map(([month, count]) => (
                <div key={month} className="chart-bar">
                  <div
                    className="bar-fill"
                    style={{
                      width: `${(count / Math.max(...stats.monthlyData.map(([, c]) => c))) * 100}%`,
                    }}
                  />
                  <div className="bar-label">{month}</div>
                  <div className="bar-value">{count}</div>
                </div>
              ))
            ) : (
              <p className="muted">データがありません</p>
            )}
          </div>
        </div>

        <div className="stats-section">
          <h3>参加者別頻度</h3>
          <div className="participant-list">
            {stats.participantData.length > 0 ? (
              stats.participantData.slice(0, 10).map(([name, count]) => (
                <div key={name} className="participant-item">
                  <span className="participant-name">{name}</span>
                  <span className="participant-count">{count}回</span>
                </div>
              ))
            ) : (
              <p className="muted">データがありません</p>
            )}
          </div>
        </div>

        <div className="stats-section">
          <h3>ステータス別会議数</h3>
          <div className="status-stats">
            <div className="status-item">
              <span className="status-label">完了</span>
              <span className="status-value">{stats.statusCounts.done}</span>
            </div>
            <div className="status-item">
              <span className="status-label">処理中</span>
              <span className="status-value">{stats.statusCounts.working}</span>
            </div>
            <div className="status-item">
              <span className="status-label">エラー</span>
              <span className="status-value">{stats.statusCounts.error}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
