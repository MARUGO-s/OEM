// Live Edge/storage check with NO OpenAI requests: a valid large first recording
// is followed by a deliberately broken AAC. Upload validation must reject the
// batch and clean temporary storage before creating any meeting or AI job.
import assert from "node:assert/strict";
import { aacFixture } from "../tests/fixtures/aac.mjs";
if (process.stdin.isTTY) process.stdin.setRawMode(true);
const input = await new Promise((resolve) => {
  let text = "";
  process.stdin.on("data", (chunk) => {
    text += chunk.toString();
    if (text.includes("\n") || text.includes("\r")) {
      process.stdin.pause();
      if (process.stdin.isTTY) process.stdin.setRawMode(false);
      resolve(text.trim());
    }
  });
  process.stdin.on("end", () => resolve(text.trim()));
});
const base =
  "https://hjhkccbktkscwtgzxjfq.supabase.co/functions/v1/kotonoha-api";
let token;
async function call(route, options = {}) {
  return fetch(`${base}${route}`, {
    ...options,
    headers: {
      Origin: "https://marugo-s.github.io",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.body instanceof FormData
        ? {}
        : { "Content-Type": "application/json" }),
    },
    signal: AbortSignal.timeout(120000),
  });
}
try {
  const login = await call("/auth/login", { method: "POST", body: input });
  assert.equal(login.status, 200, "login must succeed");
  token = (await login.json()).token;
  const settings = await (await call("/settings")).json();
  if (!settings.configured)
    throw new Error(
      "共有APIキー未設定のため、実環境の取り込み検証は実行できません。",
    );
  const before = (await (await call("/meetings")).json())
    .map((meeting) => meeting.id)
    .sort();
  const audio = new File(
    [Buffer.concat(Array.from({ length: 30000 }, () => aacFixture))],
    "検証用の長い録音.aac",
  );
  const form = new FormData();
  form.set("title", "入力検証のみ・会議は作成しません");
  form.set("date", "2026-09-23");
  form.append("audio", audio);
  form.append("audio", new File([aacFixture.slice(0, -1)], "欠損AAC.aac"));
  const started = Date.now();
  const response = await call("/meetings", { method: "POST", body: form });
  const result = await response.json();
  assert.equal(
    response.status,
    400,
    `Expected invalid AAC rejection, got ${response.status}`,
  );
  assert.match(result.error, /AACを読み込めません/);
  const after = (await (await call("/meetings")).json())
    .map((meeting) => meeting.id)
    .sort();
  assert.deepEqual(after, before, "must not create meeting or AI job");
  console.log(
    JSON.stringify({
      passed: true,
      largeAacBytes: audio.size,
      elapsedMs: Date.now() - started,
      meetingsUnchanged: true,
      openaiRequests: 0,
    }),
  );
} finally {
  if (token) await call("/auth/logout", { method: "POST" });
}
