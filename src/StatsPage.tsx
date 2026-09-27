import { useMemo, useState } from "react";
import { CalendarDays, Clock, CheckCircle, Users, TrendingUp, Sparkles, LoaderCircle } from "lucide-react";
import { formatDate, type Meeting } from "./types";
import { api } from "./api";

export function StatsPage({ meetings }: { meetings: Meeting[] }) {
  const [summaryPeriod, setSummaryPeriod] = useState<"month" | "week">("month");
  const [summary, setSummary] = useState("");
  const [generatingSummary, setGeneratingSummary] = useState(false);
  const [showSummary, setShowSummary] = useState(false);

  const stats = useMemo(() => {
    const realMeetings = meetings.filter((m) => !m.isDemo);
    
    // 基本統計
    const totalMeetings = realMeetings.length;
    const totalDuration = realMeetings.reduce((sum, m) => sum + (m.duration || 0), 0);
    const avgDuration = totalMeetings > 0 ? totalDuration / totalMeetings : 0;
    
    // 月次統計
    const monthlyData = new Map<string, number>();
    realMeetings.forEach((m) => {
      const month = m.date.substring(0, 7); // YYYY-MM
      monthlyData.set(month, (monthlyData.get(month) || 0) + 1);
    });
    
    // 参加者統計
    const participantData = new Map<string, number>();
    realMeetings.forEach((m) => {
      const participants = m.participants.split(/[、,]/).map(p => p.trim()).filter(p => p);
      participants.forEach((p) => {
        participantData.set(p, (participantData.get(p) || 0) + 1);
      });
    });
    
    // アクション統計
    const totalActions = realMeetings.reduce((sum, m) => sum + (m.minutes?.actions?.length || 0), 0);
    const completedActions = realMeetings.reduce((sum, m) => sum + (m.completedActions?.length || 0), 0);
    const completionRate = totalActions > 0 ? (completedActions / totalActions) * 100 : 0;
    
    // ステータス統計
    const statusCounts = {
      done: realMeetings.filter(m => m.status === "done").length,
      working: realMeetings.filter(m => m.status === "transcribing" || m.status === "analyzing").length,
      error: realMeetings.filter(m => m.status === "error").length,
    };
    
    return {
      totalMeetings,
      totalDuration,
      avgDuration,
      monthlyData: Array.from(monthlyData.entries()).sort((a, b) => b[0].localeCompare(a[0])),
      participantData: Array.from(participantData.entries()).sort((a, b) => b[1] - a[1]),
      totalActions,
      completedActions,
      completionRate,
      statusCounts,
    };
  }, [meetings]);
  
  async function generateSummary() {
    setGeneratingSummary(true);
    setShowSummary(true);
    try {
      const result = await api<{ summary: string; meetingCount: number; period: string }>(`/summary?period=${summaryPeriod}`);
      setSummary(result.summary);
    } catch (error) {
      setSummary("サマリーの生成に失敗しました。もう一度お試しください。");
    } finally {
      setGeneratingSummary(false);
    }
  }
  
  const formatDuration = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) return `${hours}時間${minutes}分`;
    return `${minutes}分`;
  };
  
  return (
    <div className="stats-page">
      <div className="stats-header">
        <h2>統計ダッシュボード</h2>
        <p className="muted">会議データの概要と分析</p>
      </div>
      
      <div className="summary-section">
        <div className="summary-controls">
          <div className="period-selector">
            <button
              className={summaryPeriod === "month" ? "active" : ""}
              onClick={() => setSummaryPeriod("month")}
            >
              月次
            </button>
            <button
              className={summaryPeriod === "week" ? "active" : ""}
              onClick={() => setSummaryPeriod("week")}
            >
              週次
            </button>
          </div>
          <button
            className="button primary"
            onClick={generateSummary}
            disabled={generatingSummary}
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
        {showSummary && (
          <div className="summary-content">
            <div className="summary-header">
              <h3>AI生成サマリー</h3>
              <button
                className="icon-button"
                onClick={() => setShowSummary(false)}
              >
                ✕
              </button>
            </div>
            <div className="summary-text">
              {summary.split("\n").map((line, i) => {
                if (line.startsWith("##")) {
                  return <h4 key={i}>{line.replace("##", "").trim()}</h4>;
                }
                if (line.startsWith("-")) {
                  return <li key={i}>{line.replace("-", "").trim()}</li>;
                }
                return <p key={i}>{line}</p>;
              })}
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
            <div className="stat-value">{formatDuration(stats.totalDuration)}</div>
            <div className="stat-label">総録音時間</div>
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
                  <div className="bar-fill" style={{ width: `${(count / Math.max(...stats.monthlyData.map(([, c]) => c))) * 100}%` }} />
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
