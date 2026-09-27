import {
  isCloud,
  getSession,
  clearSession,
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY,
} from "./cloud";

// リトライ設定
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000; // 1秒

// ネットワークエラーかどうかを判定
function isNetworkError(error: unknown): boolean {
  if (error instanceof TypeError) {
    return error.message.includes('fetch') || 
           error.message.includes('network') ||
           error.message.includes('Failed to fetch');
  }
  return false;
}

// ユーザーフレンドリーなエラーメッセージ
function getUserFriendlyError(error: unknown, isCloudMode: boolean): string {
  if (isNetworkError(error)) {
    return isCloudMode 
      ? "ネットワーク接続エラーです。インターネット接続を確認してください。"
      : "ローカルサーバーに接続できません。npm run dev を実行しているか確認してください。";
  }
  
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    
    if (message.includes('timeout') || message.includes('timed out')) {
      return "処理がタイムアウトしました。もう一度お試しください。";
    }
    
    if (message.includes('auth') || message.includes('unauthorized')) {
      return "認証エラーです。再度ログインしてください。";
    }
    
    if (message.includes('permission') || message.includes('forbidden')) {
      return "アクセス権限がありません。";
    }
    
    if (message.includes('not found') || message.includes('404')) {
      return "要求されたリソースが見つかりません。";
    }
    
    if (message.includes('server') || message.includes('500')) {
      return "サーバーエラーが発生しました。しばらく待ってからもう一度お試しください。";
    }
  }
  
  return isCloudMode
    ? "エラーが発生しました。もう一度お試しください。"
    : "エラーが発生しました。ローカルサーバーを確認してください。";
}

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function api<T>(
  path: string,
  options: RequestInit = {},
  retryCount: number = 0,
): Promise<T> {
  let token = "";
  if (isCloud) {
    const session = getSession();
    if (!session)
      throw new Error("ログインが必要です。再度ログインしてください。");
    token = session.token;
  }
  const base = isCloud ? `${SUPABASE_URL}/functions/v1/kotonoha-api` : "/api";
  
  try {
    const response = await fetch(`${base}${path}`, {
      ...options,
      headers: {
        ...(options.body instanceof FormData || options.body instanceof Blob
          ? {}
          : { "Content-Type": "application/json" }),
        "X-Kotonoha": "1",
        ...(isCloud
          ? { Authorization: `Bearer ${token}`, apikey: SUPABASE_PUBLISHABLE_KEY }
          : {}),
        ...options.headers,
      },
    });
    
    if (response.status === 204) return undefined as T;
    if (isCloud && response.status === 401) {
      clearSession();
      throw new Error("ログインセッションが切れました。再度ログインしてください。");
    }
    
    let data;
    try {
      data = await response.json();
    } catch {
      if (!response.ok) {
        throw new Error(getUserFriendlyError(
          new Error(`HTTP ${response.status}`),
          isCloud
        ));
      }
      throw new Error(
        isCloud
          ? "サーバーからの応答を解析できません。"
          : "ローカルサーバーからの応答を解析できません。"
      );
    }
    
    if (!response.ok) {
      throw new Error(data.error || getUserFriendlyError(
        new Error(`HTTP ${response.status}: ${data.message || response.statusText}`),
        isCloud
      ));
    }
    
    return data as T;
  } catch (error) {
    // ネットワークエラーの場合はリトライ
    if (isNetworkError(error) && retryCount < MAX_RETRIES) {
      console.debug(`リトライ中... (${retryCount + 1}/${MAX_RETRIES})`);
      await sleep(RETRY_DELAY * (retryCount + 1)); // 指数バックオフ
      return api<T>(path, options, retryCount + 1);
    }
    
    // リトライ回数を超えた場合やその他のエラー
    throw new Error(getUserFriendlyError(error, isCloud));
  }
}

export async function audioUrl(id: string, part = 0) {
  const path = `/meetings/${id}/audio?part=${part}`;
  if (!isCloud) return `/api${path}`;
  return (await api<{ url: string }>(path)).url;
}

export function download(
  name: string,
  content: string,
  type = "text/plain;charset=utf-8",
) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name.replace(/[\\/:*?"<>|]/g, "_");
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// iCal (.ics) 形式でエクスポート
export function exportToICS(meetings: any[]): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Kotonoha//Meeting Minutes//JA",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
  ];
  
  meetings.forEach((m) => {
    const startTime = `${m.date}T09:00:00`;
    const endTime = `${m.date}T10:00:00`;
    const now = new Date().toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
    
    lines.push("BEGIN:VEVENT");
    lines.push(`DTSTART:${startTime.replace(/[-:]/g, "")}`);
    lines.push(`DTEND:${endTime.replace(/[-:]/g, "")}`);
    lines.push(`DTSTAMP:${now}`);
    lines.push(`UID:${m.id}@kotonoha`);
    lines.push(`SUMMARY:${m.title}`);
    lines.push(`DESCRIPTION:${m.participants}\\n\\n${m.minutes?.summary || "議事録がありません"}`);
    lines.push("END:VEVENT");
  });
  
  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}

// 複数会議を一括エクスポート
export function exportMultipleMeetings(meetings: any[], format: "markdown" | "json" | "ics"): string {
  if (format === "ics") {
    return exportToICS(meetings);
  }
  
  if (format === "json") {
    return JSON.stringify(meetings, null, 2);
  }
  
  // Markdown format
  const lines = ["# 会議録一括エクスポート", `エクスポート日時: ${new Date().toLocaleString("ja-JP")}`, ""];
  
  meetings.forEach((m, index) => {
    lines.push(`## ${index + 1}. ${m.title}`);
    lines.push(`**日付**: ${m.date}`);
    lines.push(`**参加者**: ${m.participants}`);
    lines.push("");
    
    if (m.minutes?.summary) {
      lines.push("### 要約");
      lines.push(m.minutes.summary);
      lines.push("");
    }
    
    if (m.minutes?.actions?.length) {
      lines.push("### アクションアイテム");
      m.minutes.actions.forEach((action: any, i: number) => {
        const completed = m.completedActions?.includes(i) ? "✓" : "○";
        lines.push(`${completed} **${action.task}** - ${action.owner} (${action.due || "期限未定"})`);
      });
      lines.push("");
    }
    
    lines.push("---");
    lines.push("");
  });
  
  return lines.join("\n");
}
