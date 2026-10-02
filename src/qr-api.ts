import {
  clearSession,
  getSession,
  SUPABASE_PUBLISHABLE_KEY,
  SUPABASE_URL,
} from "./cloud";
import { buildTrackingUrl } from "./qr-routing.mjs";

export type QrLink = {
  id: string;
  code: string;
  title: string;
  target_url: string;
  scan_count: number;
  active: boolean;
  created_at: string;
  last_accessed_at: string | null;
  deleted_at: string | null;
};
export type QrHistory = {
  events: {
    id: number;
    accessed_at: string;
    user_agent: string | null;
    source: string;
    referrer_host: string | null;
    device: string;
    browser: string;
  }[];
  total: number;
};
export type QrAnalyticsData = {
  linkId: string;
  days: number;
  startDate: string;
  endDate: string;
  daily: { date: string; count: number }[];
  periodTotal: number;
  total: number;
  generatedAt: string;
  source: string;
  sources: { key: string; count: number }[];
  devices: { key: string; count: number }[];
  browsers: { key: string; count: number }[];
  referrers: { key: string; count: number }[];
};
export function trackingUrl(
  code: string,
  source: "qr" | "button" | "link" | "unknown" = "unknown",
) {
  return buildTrackingUrl(
    import.meta.env.BASE_URL,
    location.origin,
    code,
    source,
  );
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
