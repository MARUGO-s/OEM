import assert from "node:assert/strict";
import { createDemo } from "../supabase/functions/_shared/demo.mjs";
import { encryptApiKey } from "../supabase/functions/_shared/key-crypto.mjs";
import {
  createToken,
  hashToken,
} from "../supabase/functions/_shared/session.mjs";

// Scheduled progression (POST /internal/tick) against the real Edge Function handler.
// Supabase RPC/Storage and OpenAI are mocked in memory; the RPC mock mirrors the SQL claim
// rules (partReady + runId + the 2 leased jobs limit). No network permission is granted.
const owner = "00000000-0000-4000-8000-000000000001";
const token = createToken();
const tickSecret = "tick-secret-for-tests-only-0123456789abcdef";
const secret = btoa(
  String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))),
);
const apiKey = "sk-fake-only-not-a-real-api-key";
let clockOffset = 0;
const realNow = Date.now;
Date.now = () => realNow() + clockOffset;
const iso = (ms: number) => new Date(Date.now() + ms).toISOString();
Deno.env.set("SUPABASE_URL", "https://kotonoha-tick.invalid");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "test-server-only");
Deno.env.set("KOTONOHA_KEY_ENCRYPTION_SECRET", secret);
Deno.env.set("KOTONOHA_TICK_SECRET", tickSecret);
const jobs: Promise<unknown>[] = [];
(globalThis as any).EdgeRuntime = {
  waitUntil: (job: Promise<unknown>) => jobs.push(job),
};
const sessions = new Map([
  [await hashToken(token), { workspaceId: owner, expiresAt: iso(3600000) }],
]);
const config: any = {
  model: "gpt-6-astra",
  transcriptionModel: "gpt-transcribe",
  encryptedKey: await encryptApiKey(apiKey, owner, secret),
  encryptedGeminiKey: null,
};
const rows = new Map<string, any>();
const objects = new Map<string, Blob>();
const responses = new Map<string, any>();
const transcribed: string[] = [];
let inFlight = 0,
  maxInFlight = 0,
  tickRpcAvailable = true;
let failRetrievals = 0;
const json = (value: unknown, status = 200) => Response.json(value, { status });
const leased = (row: any) =>
  ["transcribing", "analyzing"].includes(row.document.status) &&
  Date.parse(row.leaseUntil) > Date.now();
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
const touch = (row: any) =>
  (row.updatedAt = new Date(Date.now() + rows.size).toISOString());

globalThis.fetch = async (input: any, init: any = {}) => {
  const url = new URL(
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.href
        : input.url,
  );
  if (url.pathname === "/rest/v1/rpc/kotonoha_auth") {
    const { p_payload: p } = JSON.parse(init.body);
    return json(sessions.get(p.tokenHash) || { error: "INVALID_TOKEN" });
  }
  if (url.pathname === "/rest/v1/rpc/kotonoha_tick") {
    if (!tickRpcAvailable) return json({ message: "function not found" }, 404);
    return json({ workspaceId: owner });
  }
  if (url.pathname.startsWith("/rest/v1/rpc/")) {
    const rpc = url.pathname.split("/").pop();
    const {
      p_operation: op,
      p_owner: user,
      p_id: id,
      p_payload: payload,
    } = JSON.parse(init.body);
    assert.equal(user, owner);
    if (rpc === "kotonoha_usage") return json({ recorded: true });
    if (rpc === "kotonoha_settings") return json(config);
    if (op === "list")
      return json(
        [...rows.keys()]
          .map(get)
          .sort((a, b) =>
            b.document.createdAt.localeCompare(a.document.createdAt),
          ),
      );
    if (op === "create") {
      if (
        [...rows.values()].filter((r) => r.document.status === "uploading")
          .length >= 2
      )
        return json({ message: "UPLOAD_LIMIT" }, 400);
      rows.set(id, {
        document: { ...payload.document, id },
        audioPath: null,
        responseId: null,
        leaseUntil: iso(240000),
      });
      touch(rows.get(id));
      return json(get(id));
    }
    const row = rows.get(id);
    if (!row) return json({ message: "NOT_FOUND" }, 400);
    if (op === "append") {
      if (
        row.document.status !== "uploading" ||
        payload.index !== row.document.audioParts.length
      )
        return json({ message: "UPLOAD_ORDER" }, 400);
      row.document.audioParts.push(payload.part);
      row.audioPath ||= payload.part.audioPath;
    } else if (op === "complete") {
      if (row.document.status === "uploading") {
        const others = [...rows.entries()].filter(
          ([k, r]) => k !== id && leased(r),
        ).length;
        if (others >= 2) return json({ message: "CONCURRENCY_LIMIT" }, 400);
        Object.assign(row.document, {
          status: "transcribing",
          partReady: true,
          runId: payload.runId,
          error: null,
        });
        row.responseId = null;
        row.leaseUntil = iso(240000);
      }
    } else if (op === "next") {
      // Mirrors kotonoha_audio_upload('next'): exclusive, flag-based, limited to 2 leased jobs.
      if (
        !["transcribing", "analyzing"].includes(row.document.status) ||
        !row.document.partReady
      )
        return json(null);
      const others = [...rows.entries()].filter(
        ([k, r]) => k !== id && leased(r),
      ).length;
      if (others >= 2) return json(null);
      Object.assign(row.document, { partReady: false, runId: payload.runId });
      row.leaseUntil = iso(240000);
    } else if (op === "job_update") {
      if (
        row.document.runId === payload.runId &&
        ["transcribing", "analyzing"].includes(row.document.status)
      ) {
        Object.assign(row.document, payload.patch);
        if ("responseId" in payload) row.responseId = payload.responseId;
        row.leaseUntil = iso("responseId" in payload ? 1800000 : 240000);
      }
    } else if (op !== "get") {
      throw new Error(`unexpected RPC ${rpc}/${op}`);
    }
    touch(row);
    return json(get(id));
  }
  if (url.hostname === "api.openai.com") {
    assert.equal(
      new Headers(init.headers).get("authorization"),
      `Bearer ${apiKey}`,
    );
    if (url.pathname === "/v1/audio/transcriptions") {
      const file = (init.body as FormData).get("file") as File;
      transcribed.push(file.name.replace(/^[0-9a-f-]{37}/, ""));
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 20));
      inFlight--;
      return json({
        id: `t-${transcribed.length}`,
        usage: { type: "duration", seconds: 60 },
        text: `部分${transcribed.length}の発言です。`,
      });
    }
    if (init.method === "POST" && url.pathname === "/v1/responses") {
      const id = `resp-${responses.size + 1}`;
      responses.set(id, (createDemo() as any).minutes);
      return json({ id, status: "queued" });
    }
    const id = url.pathname.split("/").pop()!;
    if (failRetrievals > 0) {
      failRetrievals--;
      return json({ error: { message: "test-only outage" } }, 500);
    }
    return json({
      id,
      status: "completed",
      usage: { input_tokens: 10, output_tokens: 10 },
      output: [
        {
          type: "message",
          content: [
            { type: "output_text", text: JSON.stringify(responses.get(id)) },
          ],
        },
      ],
    });
  }
  if (url.pathname.startsWith("/storage/v1/object/")) {
    const key = url.pathname.replace(
      /^\/storage\/v1\/object\/(authenticated\/)?/,
      "",
    );
    if (init.method === "POST") {
      objects.set(
        key,
        init.body instanceof FormData
          ? ([...init.body.values()].find((v) => v instanceof Blob) as Blob)
          : init.body,
      );
      return json({ Key: key });
    }
    const blob = objects.get(key);
    assert.ok(blob, `missing object ${key}`);
    return new Response(blob);
  }
  throw new Error(`Unexpected network request: ${url.href}`);
};
const { handler } =
  await import("../supabase/functions/kotonoha-api/handler.ts");
const base = "https://kotonoha-tick.invalid/functions/v1/kotonoha-api";
const call = (route: string, init: RequestInit = {}) =>
  handler(new Request(`${base}${route}`, init));
const api = (route: string, init: RequestInit = {}) =>
  call(route, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...(init.headers || {}) },
  });
const tick = (value: string | null = tickSecret) =>
  call("/internal/tick", {
    method: "POST",
    headers: value === null ? {} : { "x-kotonoha-tick": value },
  });
const drain = async () => {
  while (jobs.length) await Promise.all(jobs.splice(0));
};

async function uploadMeeting(title: string, partCount: number) {
  const bytes = Array.from({ length: partCount }, (_, i) =>
    new Uint8Array(1000 + i).fill(i + 1),
  );
  const created = await api("/uploads", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      metadata: {
        title,
        date: "2026-09-30",
        participants: "田中, 佐藤",
        template: "standard",
      },
      sources: [
        { name: "meet.ogg", size: bytes.reduce((n, b) => n + b.length, 0) },
      ],
      parts: bytes.map((b, i) => ({
        name: `recording-1-${i + 1}.ogg`,
        size: b.length,
        sourceIndex: 0,
        partNumber: i + 1,
        duration: 600,
      })),
      transcript: "",
      attachments: [],
    }),
  });
  assert.equal(created.status, 201);
  const { id } = await created.json();
  for (const [index, body] of bytes.entries())
    assert.equal(
      (
        await api(`/meetings/${id}/parts?index=${index}`, {
          method: "POST",
          body,
        })
      ).status,
      200,
    );
  assert.equal(
    (await api(`/meetings/${id}/complete`, { method: "POST" })).status,
    202,
  );
  return id as string;
}

Deno.test(
  "tick: rejects missing, wrong or unconfigured secrets and user sessions",
  async () => {
    assert.equal((await tick(null)).status, 401);
    assert.equal(
      (await tick("wrong-secret-wrong-secret-wrong-secret")).status,
      401,
    );
    assert.equal((await tick(tickSecret.slice(0, -1))).status, 401);
    // A valid user session is not a tick credential.
    assert.equal((await api("/internal/tick", { method: "POST" })).status, 401);
    assert.equal(
      (
        await call("/internal/tick", {
          method: "GET",
          headers: { "x-kotonoha-tick": tickSecret },
        })
      ).status,
      405,
    );
    Deno.env.delete("KOTONOHA_TICK_SECRET");
    try {
      assert.equal((await tick()).status, 503);
      Deno.env.set("KOTONOHA_TICK_SECRET", "too-short");
      assert.equal((await tick("too-short")).status, 503); // short secrets are never accepted
    } finally {
      Deno.env.set("KOTONOHA_TICK_SECRET", tickSecret);
    }
    tickRpcAvailable = false;
    try {
      assert.equal((await tick()).status, 503);
    } finally {
      tickRpcAvailable = true;
    }
    assert.deepEqual(await (await tick()).json(), { meetings: 0, advanced: 0 });
  },
);

Deno.test(
  "tick: multi-part upload reaches done with ticks only (no client polling)",
  async () => {
    transcribed.length = 0;
    const id = await uploadMeeting("Botの録音", 3);
    await drain(); // part 1 started by /complete
    assert.equal(
      rows.get(id).document.audioParts.filter((p: any) => p.transcript).length,
      1,
    );
    // Without a tick or a list request nothing else happens.
    await new Promise((resolve) => setTimeout(resolve, 30));
    await drain();
    assert.equal(transcribed.length, 1);
    let ticks = 0;
    while (rows.get(id).document.status !== "done" && ticks < 10) {
      assert.equal((await tick()).status, 200);
      ticks++;
      await drain();
    }
    const doc = rows.get(id).document;
    assert.equal(doc.status, "done");
    assert.ok(doc.minutes && doc.markdown);
    assert.equal(
      doc.transcript.includes("部分1") && doc.transcript.includes("部分3"),
      true,
    );
    assert.deepEqual(transcribed, [
      "recording-1-1.ogg",
      "recording-1-2.ogg",
      "recording-1-3.ogg",
    ]);
    // 2 ticks for parts 2-3, 1 to start minutes, 1 to collect the background result.
    assert.equal(ticks, 4);
    assert.deepEqual(await (await tick()).json(), { meetings: 0, advanced: 0 });
  },
);

Deno.test(
  "tick: concurrent ticks and list requests never double-process a part",
  async () => {
    transcribed.length = 0;
    maxInFlight = 0;
    const a = await uploadMeeting("会議A", 4);
    const b = await uploadMeeting("会議B", 4);
    await drain();
    for (let round = 0; round < 12; round++) {
      const results = await Promise.all([
        tick(),
        tick(),
        api("/meetings"),
        tick(),
        api("/meetings"),
      ]);
      for (const r of results) assert.equal(r.status, 200);
      await drain();
      if (
        rows.get(a).document.status === "done" &&
        rows.get(b).document.status === "done"
      )
        break;
    }
    assert.equal(rows.get(a).document.status, "done");
    assert.equal(rows.get(b).document.status, "done");
    // Every part of both meetings was transcribed exactly once.
    assert.equal(transcribed.length, 8);
    assert.equal(responses.size, 1 + 2); // one per meeting (+1 from the previous test)
    assert.ok(
      maxInFlight <= 2,
      `at most 2 AI jobs at once, saw ${maxInFlight}`,
    );
  },
);

Deno.test(
  "tick: respects the 2-job limit and resumes after a saved transcription wait (Gemini backoff)",
  async () => {
    const first = await uploadMeeting("会議C", 2);
    const second = await uploadMeeting("会議D", 2);
    // A third meeting cannot start while two are leased; no tick changes that.
    const blocked = await api("/uploads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        metadata: { title: "会議E", date: "2026-09-30" },
        sources: [{ name: "e.ogg", size: 10 }],
        parts: [
          {
            name: "recording-1-1.ogg",
            size: 10,
            sourceIndex: 0,
            partNumber: 1,
            duration: 5,
          },
        ],
        transcript: "",
        attachments: [],
      }),
    });
    const third = (await blocked.json()).id;
    assert.equal(
      (
        await api(`/meetings/${third}/parts?index=0`, {
          method: "POST",
          body: new Uint8Array(10),
        })
      ).status,
      200,
    );
    assert.equal(
      (await api(`/meetings/${third}/complete`, { method: "POST" })).status,
      429,
    );
    await drain();
    // Simulate a saved Gemini backoff on meeting C: the tick must not claim it early.
    Object.assign(rows.get(first).document, {
      transcriptionWait: {
        until: iso(120000),
        reason: "rate_limit",
        attempt: 1,
      },
    });
    const before = rows.get(first).document.runId;
    await tick();
    await drain();
    assert.equal(rows.get(first).document.runId, before);
    assert.equal(rows.get(first).document.partReady, true);
    clockOffset += 121000;
    for (let i = 0; i < 6; i++) {
      await tick();
      await drain();
    }
    assert.equal(rows.get(first).document.status, "done");
    assert.equal(rows.get(second).document.status, "done");
    // Now the third meeting can complete and finish via ticks as well.
    assert.equal(
      (await api(`/meetings/${third}/complete`, { method: "POST" })).status,
      202,
    );
    await drain();
    for (let i = 0; i < 4 && rows.get(third).document.status !== "done"; i++) {
      await tick();
      await drain();
    }
    assert.equal(rows.get(third).document.status, "done");
  },
);

Deno.test(
  "tick: one meeting's transient AI failure does not block the others",
  async () => {
    const slow = await uploadMeeting("会議F", 1);
    await drain();
    await tick(); // starts minutes for F (background response)
    await drain();
    assert.ok(rows.get(slow).responseId);
    const other = await uploadMeeting("会議G", 2);
    await drain();
    failRetrievals = 1; // F's result lookup fails once on the next tick
    const response = await tick();
    assert.equal(response.status, 200);
    await drain();
    assert.equal(rows.get(slow).document.status, "analyzing"); // retried later, not failed
    assert.equal(
      rows.get(other).document.audioParts.filter((p: any) => p.transcript)
        .length,
      2,
    );
    for (let i = 0; i < 4; i++) {
      await tick();
      await drain();
    }
    assert.equal(rows.get(slow).document.status, "done");
    assert.equal(rows.get(other).document.status, "done");
  },
);
