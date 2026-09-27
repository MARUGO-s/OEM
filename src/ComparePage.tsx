import { useState } from "react";
import { Check, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { formatDate, type Meeting } from "./types";
import { meetingDuration, durationStats, formatDuration } from "../supabase/functions/_shared/duration.mjs";

export function ComparePage({ meetings }: { meetings: Meeting[] }) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [compareMode, setCompareMode] = useState<"actions" | "participants" | "duration">("actions");

  const selectedMeetings = meetings.filter((m) => selectedIds.includes(m.id));

  const toggleSelection = (id: string) => {
    setSelectedIds((prev) => {
      const available = prev.filter((selected) => meetings.some((m) => m.id === selected));
      return available.includes(id)
        ? available.filter((selected) => selected !== id)
        : [...available, id].slice(0, 5);
    });
  };

  const compareActions = () => {
    const data = selectedMeetings.map((m) => ({
      meeting: m,
      total: m.minutes?.actions?.length || 0,
      completed: m.completedActions?.length || 0,
      pending: (m.minutes?.actions?.length || 0) - (m.completedActions?.length || 0),
    }));

    const avgCompletion = data.length > 0
      ? data.reduce((sum, d) => sum + (d.total > 0 ? (d.completed / d.total) * 100 : 0), 0) / data.length
      : 0;

    return { data, avgCompletion };
  };

  const compareParticipants = () => {
    const data = selectedMeetings.map((m) => ({
      meeting: m,
      participants: m.participants.split(/[、,]/).map(p => p.trim()).filter(p => p),
    }));

    const allParticipants = new Set<string>();
    data.forEach((d) => d.participants.forEach((p) => allParticipants.add(p)));

    return { data, allParticipants: Array.from(allParticipants) };
  };

  const compareDuration = () => {
    const data = selectedMeetings.map((m) => ({
      meeting: m,
      duration: meetingDuration(m),
    }));

    const { average: avgDuration, unknownCount } = durationStats(data.map(d => d.duration));

    return { data, avgDuration, unknownCount };
  };

  return (
    <div className="compare-page">
      <div className="compare-header">
        <h2>会議比較</h2>
        <button className="button secondary small" disabled={!selectedMeetings.length} onClick={() => setSelectedIds([])}>
          選択をクリア
        </button>
      </div>

      <p className="muted">比較する会議を2〜5つ選択してください（{selectedMeetings.length}/5件）</p>
      <div className="meeting-selector">
        {meetings.map((m) => (
          <button
            key={m.id}
            className={`meeting-select-card ${selectedIds.includes(m.id) ? "selected" : ""}`}
            aria-pressed={selectedIds.includes(m.id)}
            disabled={selectedMeetings.length >= 5 && !selectedIds.includes(m.id)}
            onClick={() => toggleSelection(m.id)}
          >
            <div className="select-icon">
              {selectedIds.includes(m.id) ? <Check size={20} /> : <div className="empty-check" />}
            </div>
            <div className="meeting-info">
              <strong>{m.title}</strong>
              <small>{formatDate(m.date)}</small>
            </div>
          </button>
        ))}
      </div>

      {selectedMeetings.length >= 2 && <>
      <div className="compare-modes">
        <button
          className={compareMode === "actions" ? "active" : ""}
          onClick={() => setCompareMode("actions")}
        >
          アクション比較
        </button>
        <button
          className={compareMode === "participants" ? "active" : ""}
          onClick={() => setCompareMode("participants")}
        >
          参加者比較
        </button>
        <button
          className={compareMode === "duration" ? "active" : ""}
          onClick={() => setCompareMode("duration")}
        >
          時間比較
        </button>
      </div>

      {compareMode === "actions" && (() => {
        const { data, avgCompletion } = compareActions();
        return (
          <div className="compare-content">
            <div className="compare-summary">
              <div className="summary-card">
                <span className="summary-label">平均完了率</span>
                <span className="summary-value">{avgCompletion.toFixed(1)}%</span>
              </div>
              <div className="summary-card">
                <span className="summary-label">総アクション数</span>
                <span className="summary-value">{data.reduce((sum, d) => sum + d.total, 0)}</span>
              </div>
            </div>
            <div className="compare-table">
              <table>
                <thead>
                  <tr>
                    <th>会議</th>
                    <th>総数</th>
                    <th>完了</th>
                    <th>未完了</th>
                    <th>完了率</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((d) => (
                    <tr key={d.meeting.id}>
                      <td>{d.meeting.title}</td>
                      <td>{d.total}</td>
                      <td>{d.completed}</td>
                      <td>{d.pending}</td>
                      <td>{d.total > 0 ? ((d.completed / d.total) * 100).toFixed(1) : 0}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })()}

      {compareMode === "participants" && (() => {
        const { data, allParticipants } = compareParticipants();
        return (
          <div className="compare-content">
            <div className="compare-summary">
              <div className="summary-card">
                <span className="summary-label">総参加者数</span>
                <span className="summary-value">{allParticipants.length}</span>
              </div>
            </div>
            <div className="participant-matrix">
              <table>
                <thead>
                  <tr>
                    <th>参加者</th>
                    {data.map((d) => (
                      <th key={d.meeting.id}>{d.meeting.title}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {allParticipants.map((p) => (
                    <tr key={p}>
                      <td>{p}</td>
                      {data.map((d) => (
                        <td key={d.meeting.id}>
                          {d.participants.includes(p) ? <Check size={16} className="green" /> : <Minus size={16} className="gray" />}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })()}

      {compareMode === "duration" && (() => {
        const { data, avgDuration, unknownCount } = compareDuration();
        const maxDuration = Math.max(0, ...data.map(d => d.duration ?? 0));
        return (
          <div className="compare-content">
            <div className="compare-summary">
              <div className="summary-card">
                <span className="summary-label">平均時間</span>
                <span className="summary-value">{formatDuration(avgDuration)}</span>
              </div>
            </div>
            {unknownCount > 0 && <p className="muted">時間が未取得の{unknownCount}件は平均に含めていません。</p>}
            <div className="duration-chart">
              {data.map((d) => {
                const percent = d.duration !== null && maxDuration > 0 ? (d.duration / maxDuration) * 100 : 0;
                const diff = d.duration !== null && avgDuration !== null ? d.duration - avgDuration : 0;
                return (
                  <div key={d.meeting.id} className="duration-bar">
                    <div className="duration-info">
                      <strong>{d.meeting.title}</strong>
                      <span>{formatDuration(d.duration)}</span>
                    </div>
                    <div className="duration-track">{d.duration !== null && <div className="duration-fill" style={{ width: `${percent}%` }} title={diff > 0 ? "平均より長い" : diff < 0 ? "平均より短い" : "平均と同じ"}>
                      {diff > 0 ? <TrendingUp size={16} /> : diff < 0 ? <TrendingDown size={16} /> : <Minus size={16} />}
                    </div>}</div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}
      </>}
    </div>
  );
}
