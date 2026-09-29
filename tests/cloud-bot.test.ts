import assert from "node:assert/strict";
import { createDemo } from "../supabase/functions/_shared/demo.mjs";
import { encryptApiKey } from "../supabase/functions/_shared/key-crypto.mjs";
import { createToken, hashToken } from "../supabase/functions/_shared/session.mjs";

// Meet bot flow against the real Edge Function handler: bot request -> webhook -> upload-token
// status / uploads / parts / complete -> server-side ticks -> done. Supabase RPC/Storage, OpenAI
// and the bot webhook receiver are mocked in memory; the kotonoha_bot mock mirrors the SQL rules
// (checked separately by scripts/check-bot-migration.sh). No network permission is granted.
const owner = "00000000-0000-4000-8000-000000000001";
const session = createToken();
const tickSecret = "tick-secret-for-tests-only-0123456789abcdef";
const webhookUrl = "https://meetbot.invalid/hooks/kotonoha";
const webhookSecret = "meetbot-webhook-secret-for-tests";
const secret = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))));
const apiKey = "sk-fake-only-not-a-real-api-key";
let clockOffset = 0;
const realNow = Date.now;
Date.now = () => realNow() + clockOffset;
const iso = (ms: number) => new Date(Date.now() + ms).toISOString();
Deno.env.set("SUPABASE_URL", "https://kotonoha-bot.invalid");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "test-server-only");
Deno.env.set("KOTONOHA_KEY_ENCRYPTION_SECRET", secret);
Deno.env.set("KOTONOHA_TICK_SECRET", tickSecret);
const jobs: Promise<unknown>[] = [];
(globalThis as any).EdgeRuntime = { waitUntil: (job: Promise<unknown>) => jobs.push(job) };
const sessions = new Map([[await hashToken(session), { workspaceId: owner, expiresAt: iso(3600000) }]]);
const config: any = {
  model: "gpt-6-astra",
  transcriptionModel: "gpt-transcribe",
  encryptedKey: await encryptApiKey(apiKey, owner, secret),
  encryptedGeminiKey: null,
};
const rows = new Map<string, any>();
const botRequests = new Map<string, any>(); // tokenHash -> row
const objects = new Map<string, Blob>();
const responses = new Map<string, any>();
const webhooks: { headers: Headers; body: any }[] = [];
let webhookStatus = 200;
const json = (value: unknown, status = 200) => Response.json(value, { status });
const leased = (row: any) =>
  ["transcribing", "analyzing"].includes(row.document.status) && Date.parse(row.leaseUntil) > Date.now();
const get = (id: string) => {
  const r = rows.get(id);
  return {
    document: structuredClone(r.document),
    audioPath: r.audioPath,
    responseId: r.responseId,
    leaseUntil: r.leaseUntil,
    updatedAt: r.updatedAt,
  };
};
const raise = (message: string) => json({ message }, 400);

function botRpc(op: string, user: string | null, id: string | null, payload: any) {
  if (op === "auth") {
    const r = botRequests.get(payload.tokenHash);
    const m = r && rows.get(r.meetingId);
    if (!r || r.usedAt || Date.parse(r.expiresAt) <= Date.now() || !m || m.deleted ||
      !["bot", "uploading"].includes(m.document.status)) return json({ error: "INVALID_TOKEN" });
    return json({ workspaceId: r.owner, meetingId: r.meetingId, requestId: r.id, expiresAt: r.expiresAt });
  }
  assert.equal(user, owner);
  if (op === "create") {
    if ([...rows.values()].filter((r) => !r.deleted && r.document.status === "bot").length >= 5) return raise("BOT_LIMIT");
    rows.set(id!, { document: { ...payload.document, id }, audioPath: null, responseId: null, leaseUntil: null, updatedAt: iso(0) });
    botRequests.set(payload.tokenHash, {
      id: payload.document.bot.requestId, owner: user, meetingId: id,
      expiresAt: payload.document.bot.expiresAt, usedAt: null,
    });
    return json(get(id!));
  }
  const row = rows.get(id!);
  if (!row || row.deleted || !row.document.bot) return raise("NOT_FOUND");
  const now = new Date(Date.now()).toISOString();
  if (op === "status") {
    if (!["bot", "uploading"].includes(row.document.status)) return raise("BOT_CLOSED");
    Object.assign(row.document.bot, { state: payload.state, message: payload.message, updatedAt: now });
  } else if (op === "plan") {
    if (!(row.document.status === "bot" || (row.document.status === "uploading" && !row.document.audioParts.length)))
      return raise("UPLOAD_ORDER");
    if ([...rows.entries()].filter(([k, r]) => k !== id && !r.deleted && r.document.status === "uploading").length >= 2)
      return raise("UPLOAD_LIMIT");
    const { id: _i, createdAt: _c, bot: _b, attachments: _a, attachmentPlan: _p, ...rest } = payload.document;
    Object.assign(row.document, rest, {
      status: "uploading",
      attachmentPlan: (row.document.attachments || []).map(({ id, name, size }: any) => ({ id, name, size })),
      bot: { ...row.document.bot, state: "uploading", message: null, updatedAt: now },
    });
  } else if (op === "revoke") {
    for (const r of botRequests.values()) if (r.meetingId === id) r.usedAt ||= now;
    row.document.bot.completedAt = now;
  } else if (op === "discard") {
    if (row.document.status !== "bot") return raise("BOT_CLOSED");
    for (const r of botRequests.values()) if (r.meetingId === id) r.usedAt ||= now;
    row.deleted = true;
    return json({ deleted: true });
  } else throw new Error(`unexpected kotonoha_bot/${op}`);
  return json(get(id!));
}

globalThis.fetch = async (input: any, init: any = {}) => {
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
  if (url.href === webhookUrl) {
    webhooks.push({ headers: new Headers(init.headers), body: JSON.parse(init.body) });
    return new Response(webhookStatus < 300 ? '{"accepted":true}' : "down", { status: webhookStatus });
  }
  if (url.pathname === "/rest/v1/rpc/kotonoha_auth") {
    const { p_payload: p } = JSON.parse(init.body);
    return json(sessions.get(p.tokenHash) || { error: "INVALID_TOKEN" });
  }
  if (url.pathname === "/rest/v1/rpc/kotonoha_tick") return json({ workspaceId: owner });
  if (url.pathname.startsWith("/rest/v1/rpc/")) {
    const rpc = url.pathname.split("/").pop();
    const { p_operation: op, p_owner: user, p_id: id, p_payload: payload } = JSON.parse(init.body);
    if (rpc === "kotonoha_bot") return botRpc(op, user, id, payload);
    assert.equal(user, owner);
    if (rpc === "kotonoha_usage") return json({ recorded: true });
    if (rpc === "kotonoha_settings") return json(config);
    if (op === "list")
      return json([...rows.keys()].filter((k) => !rows.get(k).deleted).map(get)
        .sort((a, b) => b.document.createdAt.localeCompare(a.document.createdAt)));
    if (op === "create") {
      rows.set(id, { document: { ...payload.document, id }, audioPath: null, responseId: null, leaseUntil: iso(240000), updatedAt: iso(0) });
      return json(get(id));
    }
    const row = rows.get(id);
    if (!row || row.deleted) return raise("NOT_FOUND");
    if (op === "append") {
      if (row.document.status !== "uploading" || payload.index !== row.document.audioParts.length) return raise("UPLOAD_ORDER");
      row.document.audioParts.push(payload.part);
      row.audioPath ||= payload.part.audioPath;
    } else if (op === "complete") {
      if (row.document.status === "uploading") {
        if (row.document.audioParts.length !== row.document.uploadPlan.length ||
          (row.document.attachments || []).length !== (row.document.attachmentPlan || []).length) return raise("UPLOAD_INCOMPLETE");
        if ([...rows.entries()].filter(([k, r]) => k !== id && leased(r)).length >= 2) return raise("CONCURRENCY_LIMIT");
        Object.assign(row.document, { status: "transcribing", partReady: true, runId: payload.runId, error: null });
        row.responseId = null;
        row.leaseUntil = iso(240000);
      }
    } else if (op === "next") {
      if (!["transcribing", "analyzing"].includes(row.document.status) || !row.document.partReady) return json(null);
      Object.assign(row.document, { partReady: false, runId: payload.runId });
      row.leaseUntil = iso(240000);
    } else if (op === "job_update") {
      if (row.document.runId === payload.runId && ["transcribing", "analyzing"].includes(row.document.status)) {
        Object.assign(row.document, payload.patch);
        if ("responseId" in payload) row.responseId = payload.responseId;
        row.leaseUntil = iso("responseId" in payload ? 1800000 : 240000);
      }
    } else if (op === "delete") {
      row.deleted = true;
      return json({ deleted: true });
    } else if (op !== "get") throw new Error(`unexpected RPC ${rpc}/${op}`);
    row.updatedAt = iso(0);
    return json(get(id));
  }
  if (url.hostname === "api.openai.com") {
    if (url.pathname === "/v1/audio/transcriptions")
      return json({ id: `t-${crypto.randomUUID()}`, usage: { type: "duration", seconds: 60 }, text: "Botが録音した発言です。" });
    if (init.method === "POST" && url.pathname === "/v1/responses") {
      const rid = `resp-${responses.size + 1}`;
      responses.set(rid, (createDemo() as any).minutes);
      return json({ id: rid, status: "queued" });
    }
    const rid = url.pathname.split("/").pop()!;
    return json({ id: rid, status: "completed", usage: { input_tokens: 1, output_tokens: 1 },
      output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(responses.get(rid)) }] }] });
  }
  if (url.pathname.startsWith("/storage/v1/object/")) {
    const key = url.pathname.replace(/^\/storage\/v1\/object\/(authenticated\/)?/, "");
    if (init.method === "POST") {
      objects.set(key, init.body instanceof FormData ? ([...init.body.values()].find((v) => v instanceof Blob) as Blob) : init.body);
      return json({ Key: key });
    }
    if (init.method === "DELETE") return json([]);
    return new Response(objects.get(key));
  }
  throw new Error(`Unexpected network request: ${url.href}`);
};
const { handler } = await import("../supabase/functions/kotonoha-api/handler.ts");
const base = "https://kotonoha-bot.invalid/functions/v1/kotonoha-api";
const call = (route: string, init: RequestInit = {}) => handler(new Request(`${base}${route}`, init));
const api = (route: string, init: RequestInit = {}) =>
  call(route, { ...init, headers: { Authorization: `Bearer ${session}`, ...(init.headers || {}) } });
const bot = (token: string, route: string, init: RequestInit = {}, header: "bearer" | "x" = "bearer") =>
  call(route, {
    ...init,
    headers: { ...(header === "x" ? { "X-Upload-Token": token } : { Authorization: `Bearer ${token}` }), ...(init.headers || {}) },
  });
const drain = async () => { while (jobs.length) await Promise.all(jobs.splice(0)); };
const tick = () => call("/internal/tick", { method: "POST", headers: { "x-kotonoha-tick": tickSecret } });
const metadata = { title: "週次定例（Bot）", date: "2026-09-30", participants: "田中, 佐藤", template: "standard" };
const requestBot = (meetUrl = "https://meet.google.com/abc-defg-hij?authuser=0", extra: any = {}) =>
  api("/bot/requests", { method: "POST", body: JSON.stringify({ meetUrl, metadata, ...extra }) });
const partsBody = (bytes: Uint8Array[]) => ({
  // Same body shape the uploader sends to POST /uploads (metadata is ignored for bots).
  metadata: { ...metadata, title: "bot側の名前は使わない" },
  sources: [{ name: "meet.ogg", size: bytes.reduce((n, b) => n + b.length, 0) }],
  parts: bytes.map((b, i) => ({ name: `recording-1-${i + 1}.ogg`, size: b.length, sourceIndex: 0, partNumber: i + 1, duration: 600 })),
  transcript: "",
  attachments: [],
});
async function newBot() {
  webhooks.length = 0;
  const res = await requestBot();
  assert.equal(res.status, 201);
  const meeting = await res.json();
  assert.equal(webhooks.length, 1);
  return { meeting, token: webhooks[0].body.uploadToken as string, hook: webhooks[0] };
}

Deno.test("bot request: needs MEETBOT_WEBHOOK_URL, a session and a valid Meet URL", async () => {
  Deno.env.delete("MEETBOT_WEBHOOK_URL");
  const res = await requestBot();
  assert.equal(res.status, 503);
  assert.match((await res.json()).error, /MEETBOT_WEBHOOK_URL/);
  assert.equal(rows.size, 0);
  Deno.env.set("MEETBOT_WEBHOOK_URL", webhookUrl);
  Deno.env.set("MEETBOT_WEBHOOK_SECRET", webhookSecret);
  assert.equal((await call("/bot/requests", { method: "POST", body: "{}" })).status, 401);
  for (const bad of [
    "http://meet.google.com/abc-defg-hij", "https://meet.google.com.evil.example/abc-defg-hij",
    "https://evil.example/https://meet.google.com/abc-defg-hij", "https://meet.google.com/abcdefghij",
    "https://meet.google.com/abc-defg-hij/extra", "https://user@meet.google.com/abc-defg-hij", "javascript:alert(1)",
  ]) assert.equal((await requestBot(bad)).status, 400, bad);
  assert.equal((await requestBot(undefined, { uploadToken: "x" })).status, 400); // strict body
  assert.equal(rows.size, 0);
  assert.equal(webhooks.length, 0);
});

Deno.test("bot request: pre-creates the meeting, stores only the token hash and posts the webhook", async () => {
  const { meeting, token, hook } = await newBot();
  assert.equal(meeting.status, "bot");
  assert.equal(meeting.title, metadata.title);
  assert.equal(meeting.bot.meetUrl, "https://meet.google.com/abc-defg-hij");
  assert.equal(meeting.bot.state, "waiting");
  const ttl = Date.parse(meeting.bot.expiresAt) - Date.parse(meeting.bot.requestedAt);
  assert.equal(ttl, 6 * 3600 * 1000);
  assert.equal(hook.headers.get("x-meetbot-secret"), webhookSecret);
  assert.equal(hook.headers.get("content-type"), "application/json");
  assert.deepEqual(Object.keys(hook.body).sort(), [
    "apiBaseUrl", "date", "event", "expiresAt", "meetUrl", "meetingId", "participants", "requestId", "requestedAt", "template", "title", "uploadToken",
  ]);
  assert.equal(hook.body.event, "bot.join");
  assert.equal(hook.body.meetingId, meeting.id);
  assert.equal(hook.body.meetUrl, "https://meet.google.com/abc-defg-hij");
  assert.equal(hook.body.participants, "田中, 佐藤");
  assert.equal(hook.body.apiBaseUrl, "https://kotonoha-bot.invalid/functions/v1/kotonoha-api");
  assert.match(token, /^ktu_[0-9a-f]{64}$/);
  // The plain token is never stored or returned to the browser.
  assert.ok(!JSON.stringify([...rows.values()]).includes(token));
  assert.ok(!JSON.stringify(meeting).includes(token));
  assert.ok(botRequests.has(await hashToken(token)));
  const status = await (await api(`/meetings/${meeting.id}/bot`)).json();
  assert.equal(status.phase, "waiting");
  assert.equal(status.label, "待機中");
  const list = await (await api("/meetings")).json();
  assert.equal(list.find((m: any) => m.id === meeting.id).bot.state, "waiting");
});

Deno.test("bot token: status, upload, parts and complete for its own meeting only; revoked after complete", async () => {
  const a = await newBot();
  const b = await newBot();
  for (const [state, phase] of [["joining", "参加中"], ["recording", "録音中"]]) {
    const r = await bot(a.token, `/bot/meetings/${a.meeting.id}/status`, { method: "POST", body: JSON.stringify({ state, message: "ok" }) });
    assert.equal(r.status, 200);
    assert.equal((await (await api(`/meetings/${a.meeting.id}/bot`)).json()).label, phase);
  }
  assert.equal((await bot(a.token, `/bot/meetings/${a.meeting.id}/status`, { method: "POST", body: '{"state":"done"}' })).status, 400);
  // Scope: other meeting, session token, upload token on user routes, missing token.
  assert.equal((await bot(a.token, `/bot/meetings/${b.meeting.id}/status`, { method: "POST", body: '{"state":"joining"}' })).status, 403);
  assert.equal((await bot(session, `/bot/meetings/${a.meeting.id}/status`, { method: "POST", body: '{"state":"joining"}' })).status, 401);
  assert.equal((await call(`/bot/meetings/${a.meeting.id}`)).status, 401);
  for (const route of ["/meetings", `/meetings/${a.meeting.id}`, "/settings", "/bot/requests"])
    assert.equal((await bot(a.token, route)).status, 401, route);
  assert.equal((await bot(a.token, `/meetings/${a.meeting.id}/complete`, { method: "POST" })).status, 401);
  assert.equal((await bot(`ktu_${"0".repeat(64)}`, `/bot/meetings/${a.meeting.id}`)).status, 401);

  const bytes = [new Uint8Array(1500).fill(1), new Uint8Array(900).fill(2)];
  // Parts before the plan are refused (meeting still "bot").
  assert.equal((await bot(a.token, `/bot/meetings/${a.meeting.id}/parts?index=0`, { method: "POST", body: bytes[0] })).status, 409);
  const planned = await bot(a.token, `/bot/meetings/${a.meeting.id}/uploads`, { method: "POST", body: JSON.stringify(partsBody(bytes)) }, "x");
  assert.equal(planned.status, 201);
  assert.deepEqual(await planned.json(), {
    id: a.meeting.id, status: "uploading", uploadedParts: 0, plannedParts: 2,
    bot: { ...(await (await api(`/meetings/${a.meeting.id}/bot`)).json()) },
  });
  assert.equal(rows.get(a.meeting.id).document.title, metadata.title); // user's metadata wins
  assert.equal((await (await api(`/meetings/${a.meeting.id}/bot`)).json()).label, "アップロード中");
  // Text transcripts / attachments cannot be pushed with a bot token.
  assert.equal((await bot(a.token, `/bot/meetings/${a.meeting.id}/uploads`, { method: "POST", body: JSON.stringify({ ...partsBody(bytes), transcript: "x" }) })).status, 400);
  assert.equal((await bot(a.token, `/bot/meetings/${a.meeting.id}/parts?index=1`, { method: "POST", body: bytes[1] })).status, 409);
  for (const [index, body] of bytes.entries()) {
    const r = await bot(a.token, `/bot/meetings/${a.meeting.id}/parts?index=${index}`, { method: "POST", body });
    assert.equal(r.status, 200);
    assert.equal((await r.json()).uploadedParts, index + 1);
  }
  assert.equal((await (await bot(a.token, `/bot/meetings/${a.meeting.id}`)).json()).uploadedParts, 2);
  const done = await bot(a.token, `/bot/meetings/${a.meeting.id}/complete`, { method: "POST" });
  assert.equal(done.status, 202);
  assert.equal((await done.json()).status, "transcribing");
  assert.ok(rows.get(a.meeting.id).document.bot.completedAt);
  assert.ok([...botRequests.values()].find((r) => r.meetingId === a.meeting.id).usedAt);
  // Token is single-purpose: nothing works after complete.
  assert.equal((await bot(a.token, `/bot/meetings/${a.meeting.id}/complete`, { method: "POST" })).status, 401);
  assert.equal((await bot(a.token, `/bot/meetings/${a.meeting.id}/status`, { method: "POST", body: '{"state":"error"}' })).status, 401);
  await drain();
  assert.equal((await (await api(`/meetings/${a.meeting.id}/bot`)).json()).label, "議事録作成中");
  for (let i = 0; i < 6 && rows.get(a.meeting.id).document.status !== "done"; i++) {
    await tick();
    await drain();
  }
  const final = await (await api(`/meetings/${a.meeting.id}/bot`)).json();
  assert.equal(final.phase, "done");
  assert.equal(final.label, "完了");
  const doc = rows.get(a.meeting.id).document;
  assert.equal(doc.audioParts.length, 2);
  assert.ok(doc.transcript.includes("Botが録音した発言です"));
});

Deno.test("bot token: error status is shown, token expires after 6 hours", async () => {
  const { meeting, token } = await newBot();
  const r = await bot(token, `/bot/meetings/${meeting.id}/status`, {
    method: "POST", body: JSON.stringify({ state: "error", message: "Meetに参加できませんでした（入室が拒否されました）" }),
  });
  assert.equal(r.status, 200);
  const view = await (await api(`/meetings/${meeting.id}/bot`)).json();
  assert.equal(view.label, "エラー");
  assert.match(view.message, /入室が拒否/);
  // Retry is not offered for a meeting that never received audio.
  assert.equal((await api(`/meetings/${meeting.id}/retry`, { method: "POST" })).status, 409);
  clockOffset += 6 * 3600 * 1000 + 1000;
  try {
    assert.equal((await bot(token, `/bot/meetings/${meeting.id}/status`, { method: "POST", body: '{"state":"recording"}' })).status, 401);
    const expired = await (await api(`/meetings/${meeting.id}/bot`)).json();
    assert.equal(expired.phase, "error");
  } finally {
    clockOffset = 0;
  }
  assert.equal((await api(`/meetings/${meeting.id}`, { method: "DELETE" })).status, 204);
  assert.equal((await api(`/meetings/${meeting.id}/bot`)).status, 404);
});

Deno.test("bot request: webhook failure removes the placeholder and invalidates the token", async () => {
  const before = [...rows.values()].filter((r) => !r.deleted).length;
  webhooks.length = 0;
  webhookStatus = 500;
  try {
    const res = await requestBot();
    assert.equal(res.status, 502);
    assert.match((await res.json()).error, /Bot/);
  } finally {
    webhookStatus = 200;
  }
  assert.equal([...rows.values()].filter((r) => !r.deleted).length, before);
  const token = webhooks[0].body.uploadToken;
  assert.equal((await bot(token, `/bot/meetings/${webhooks[0].body.meetingId}`)).status, 401);
  // Without a secret no secret header is sent.
  Deno.env.delete("MEETBOT_WEBHOOK_SECRET");
  const { hook } = await newBot();
  assert.equal(hook.headers.get("x-meetbot-secret"), null);
  Deno.env.set("MEETBOT_WEBHOOK_SECRET", webhookSecret);
});

Deno.test("password flow: the logged-in /uploads -> parts -> complete path is unchanged", async () => {
  const body = new Uint8Array(1200).fill(7);
  const created = await api("/uploads", { method: "POST", body: JSON.stringify(partsBody([body])) });
  assert.equal(created.status, 201);
  const { id, bot: botField } = await created.json();
  assert.equal(botField, undefined);
  assert.equal((await api(`/meetings/${id}/parts?index=0`, { method: "POST", body })).status, 200);
  assert.equal((await api(`/meetings/${id}/complete`, { method: "POST" })).status, 202);
  assert.equal((await api(`/meetings/${id}/bot`)).status, 404);
  await drain();
});
