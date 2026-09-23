import {
  isCloud,
  supabase,
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY,
} from "./cloud";

export async function api<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  let token = "";
  if (isCloud) {
    const { data } = await supabase.auth.getSession();
    if (!data.session)
      throw new Error("ログインが必要です。再度ログインしてください。");
    token = data.session.access_token;
  }
  const base = isCloud ? `${SUPABASE_URL}/functions/v1/kotonoha-api` : "/api";
  const response = await fetch(`${base}${path}`, {
    ...options,
    headers: {
      ...(options.body instanceof FormData
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
  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error(
      "サーバーに接続できません。アプリの起動状態を確認してください。",
    );
  }
  if (!response.ok) throw new Error(data.error || "処理に失敗しました。");
  return data as T;
}

export async function audioUrl(id: string) {
  if (!isCloud) return `/api/meetings/${id}/audio`;
  return (await api<{ url: string }>(`/meetings/${id}/audio`)).url;
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
