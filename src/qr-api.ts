import {
  clearSession,
  getSession,
  SUPABASE_PUBLISHABLE_KEY,
  SUPABASE_URL,
} from "./cloud";

export type QrLink = {
  id: string;
  code: string;
  title: string;
  target_url: string;
  scan_count: number;
  active: boolean;
  created_at: string;
  last_accessed_at: string | null;
};
export type QrHistory = {
  events: { id: number; accessed_at: string; user_agent: string | null }[];
  total: number;
};
export function trackingUrl(code: string) {
  return `${
    new URL(`${import.meta.env.BASE_URL}marugo/`, location.origin).href
  }#${code}`;
}
export async function qrApi<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const session = getSession();
  if (!session) {
    throw new Error("QR管理には共有ワークスペースへのログインが必要です。");
  }
  const response = await fetch(
    `${SUPABASE_URL}/functions/v1/marugo-qr${path}`,
    {
      ...options,
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_PUBLISHABLE_KEY,
        Authorization: `Bearer ${session.token}`,
      },
      signal: AbortSignal.timeout(15000),
    },
  );
  if (response.status === 401) {
    clearSession();
    throw new Error("ログインの有効期限が切れました。");
  }
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || "通信結果を確認できませんでした。");
  }
  return data as T;
}
