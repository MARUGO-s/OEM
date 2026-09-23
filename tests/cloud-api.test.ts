import assert from "node:assert/strict";
import { createDemo } from "../supabase/functions/_shared/demo.mjs";
import { decryptApiKey } from "../supabase/functions/_shared/key-crypto.mjs";
import { aacFixture } from "./fixtures/aac.mjs";
import { documentFixtures, reviewFixture } from "./fixtures/documents.mjs";
import {
  calendarMeeting,
  calendarEvent,
  editFields,
} from "./fixtures/calendar.mjs";
import { eventKey } from "../supabase/functions/_shared/calendar.mjs";
import {
  createToken,
  hashToken,
} from "../supabase/functions/_shared/session.mjs";

// No network permission is granted to these tests. Every outbound request is mocked.
const owner = "00000000-0000-4000-8000-000000000001";
const tokenA = createToken();
const tokenB = createToken();
const sessions = new Map<string, any>([
  [
    await hashToken(tokenA),
    {
      workspaceId: owner,
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
    },
  ],
  [
    await hashToken(tokenB),
    {
      workspaceId: owner,
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
    },
  ],
]);
const secret = btoa(
  String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))),
);
const apiKey = "sk-fake-only-not-a-real-api-key";
const geminiApiKey = "AIza-fake-only-not-a-real-gemini-key";
const rows = new Map<string, any>();
const configs = new Map<string, any>();
const jobs: Promise<unknown>[] = [];
const calls: { route: string; body: any }[] = [];
const audioObjects = new Map<string, Blob>();
const responses = new Map<string, any>();
let failSecondRecording = false;
let geminiFailures = 0;
let geminiDailyLimit = false;
let clockOffset = 0;
const realNow = Date.now;
Date.now = () => realNow() + clockOffset;
const geminiGates = new Map<string, any>();
const realFetch = globalThis.fetch;
const json = (value: unknown, status = 200) => Response.json(value, { status });

Deno.env.set("SUPABASE_URL", "https://kotonoha-test.invalid");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "test-server-only");
Deno.env.set("KOTONOHA_KEY_ENCRYPTION_SECRET", secret);
(globalThis as any).EdgeRuntime = {
  waitUntil: (job: Promise<unknown>) => jobs.push(job),
};
globalThis.fetch = async (input, init: any) => {
  const url = new URL(
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.href
        : input.url,
  );
  const headers = new Headers(init?.headers);
  if (url.pathname === "/rest/v1/rpc/kotonoha_auth") {
    const { p_operation: operation, p_payload: payload } = JSON.parse(
      init.body,
    );
    if (operation === "login") {
      if (
        payload.loginId !== "test-shared" ||
        payload.password !== "test-password-only"
      )
        return json({ error: "INVALID_CREDENTIALS" });
      const session = {
        workspaceId: owner,
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
      };
      sessions.set(payload.tokenHash, session);
      return json(session);
    }
    if (operation === "logout") {
      sessions.delete(payload.tokenHash);
      return json({ ok: true });
    }
    return json(sessions.get(payload.tokenHash) || { error: "INVALID_TOKEN" });
  }
  if (
    [
      "/rest/v1/rpc/kotonoha_store",
      "/rest/v1/rpc/kotonoha_settings",
      "/rest/v1/rpc/kotonoha_audio_upload",
      "/rest/v1/rpc/kotonoha_attachments",
      "/rest/v1/rpc/kotonoha_calendar",
      "/rest/v1/rpc/kotonoha_gemini_gate",
    ].includes(url.pathname)
  ) {
    const {
      p_operation: op,
      p_owner: user,
      p_id: id,
      p_payload: payload,
    } = JSON.parse(init?.body as string);
    const config = configs.get(user) || {
      model: "gpt-6-astra",
      encryptedKey: null,
      transcriptionModel: "gpt-transcribe",
      encryptedGeminiKey: null,
    };
    if (url.pathname.endsWith("kotonoha_settings") && op === "get")
      return json(config);
    if (url.pathname.endsWith("kotonoha_settings") && op === "put") {
      configs.set(user, { ...config, ...payload });
      return json(configs.get(user));
    }
    if (op === "list")
      return json([...rows.values()].filter((row) => row.owner === user));
    if (op === "create") {
      const row = {
        owner: user,
        document: payload.document,
        audioPath: payload.audioPath || null,
        responseId: null,
        leaseUntil: new Date(Date.now() + 240000).toISOString(),
      };
      rows.set(id, row);
      return json(row);
    }
    const row = rows.get(id);
    if (!row || row.owner !== user)
      return json({ message: "NOT_FOUND", code: "P0002" }, 404);
    if (url.pathname.endsWith("kotonoha_gemini_gate")) {
      const gate = geminiGates.get(user) || {
        next: 0,
        active: null,
        reason: "spacing",
      };
      geminiGates.set(user, gate);
      if (op === "reserve") {
        if (
          row.document.runId !== payload.runId ||
          row.document.status !== "transcribing"
        )
          return json(null);
        if (gate.active || gate.next > Date.now())
          return json({
            allowed: false,
            until: new Date(
              Math.max(gate.next, Date.now() + (gate.active ? 10000 : 0)),
            ).toISOString(),
            reason: gate.reason,
          });
        gate.active = payload.runId;
        return json({ allowed: true });
      }
      if (op === "finish") {
        if (gate.active !== payload.runId) return json(null);
        gate.active = null;
        gate.next = Date.now() + Math.max(30000, payload.delayMs || 0);
        gate.reason = payload.reason || "spacing";
        return json({
          until: new Date(gate.next).toISOString(),
          reason: gate.reason,
        });
      }
      assert.fail("Unexpected Gemini gate operation");
    }
    if (url.pathname.endsWith("kotonoha_calendar")) {
      if (
        ["uploading", "transcribing", "analyzing"].includes(row.document.status)
      )
        return json({ message: "BUSY" }, 400);
      row.document.calendarOverrides ||= {};
      if (op === "set")
        row.document.calendarOverrides[payload.eventId] = payload.value;
      else if (op === "reset")
        delete row.document.calendarOverrides[payload.eventId];
      else throw new Error("Unexpected calendar operation");
      return json(row);
    }
    if (
      url.pathname.endsWith("kotonoha_attachments") &&
      ["add", "remove"].includes(op)
    ) {
      if (["transcribing", "analyzing"].includes(row.document.status))
        return json({ message: "BUSY" }, 400);
      const files = row.document.attachments || [];
      if (op === "add") {
        row.document.attachments = [...files, payload.attachment];
      }
      if (op === "remove") {
        if (row.document.status === "uploading")
          return json({ message: "BUSY" }, 400);
        row.document.removedAttachments = [
          ...(row.document.removedAttachments || []),
          files.find((f: any) => f.id === payload.attachmentId),
        ];
        row.document.attachments = files.filter(
          (f: any) => f.id !== payload.attachmentId,
        );
      }
      row.document.minutesStale = Boolean(row.document.markdown);
    }
    if (op === "append") {
      if (
        row.document.status !== "uploading" ||
        payload.index !== row.document.audioParts.length
      )
        return json({ message: "UPLOAD_ORDER" }, 400);
      row.document.audioParts.push(payload.part);
      row.audioPath ||= payload.part.audioPath;
    }
    if (op === "complete" && row.document.status === "uploading") {
      if (
        row.document.audioParts.length !== row.document.uploadPlan.length ||
        (row.document.attachments || []).length !==
          (row.document.attachmentPlan || []).length
      )
        return json({ message: "UPLOAD_INCOMPLETE" }, 400);
      Object.assign(row.document, {
        status: row.document.audioParts.length ? "transcribing" : "analyzing",
        partReady: true,
        runId: payload.runId,
      });
    }
    if (op === "next") {
      if (
        !row.document.partReady ||
        !["transcribing", "analyzing"].includes(row.document.status)
      )
        return json(null);
      Object.assign(row.document, { partReady: false, runId: payload.runId });
    }
    if (op === "job_update" && row.document.runId === payload.runId) {
      Object.assign(row.document, payload.patch);
      if ("responseId" in payload) row.responseId = payload.responseId;
    }
    if (op === "claim" || op === "patch") Object.assign(row.document, payload);
    if (op === "claim") row.responseId = null;
    if (op === "delete") {
      rows.delete(id);
      return json({ deleted: true });
    }
    return json(row);
  }
  if (
    url.hostname === "generativelanguage.googleapis.com" &&
    url.pathname === "/upload/v1beta/files"
  ) {
    assert.equal(url.searchParams.get("key"), geminiApiKey);
    calls.push({ route: url.pathname, body: "start" });
    return new Response(null, {
      headers: {
        "x-goog-upload-url": "https://gemini-upload.invalid/session",
      },
    });
  }
  if (url.hostname === "gemini-upload.invalid") {
    assert.equal(headers.get("x-goog-upload-command"), "upload, finalize");
    calls.push({ route: url.pathname, body: "upload" });
    return json({
      file: {
        name: "files/test-audio",
        uri: "https://generativelanguage.googleapis.com/v1beta/files/test-audio",
      },
    });
  }
  if (
    url.hostname === "generativelanguage.googleapis.com" &&
    url.pathname === "/v1beta/interactions"
  ) {
    assert.equal(headers.get("x-goog-api-key"), geminiApiKey);
    const body = JSON.parse(init.body);
    assert.deepEqual(
      body.generation_config.transcription_config.language_codes,
      ["ja-JP"],
    );
    assert.equal(body.model, "gemini-3.5-transcribe");
    assert.equal(body.store, false);
    assert.equal(body.input[0].type, "audio");
    assert.equal(body.input[0].mime_type, "audio/wav");
    assert.equal(
      body.input[0].uri,
      "https://generativelanguage.googleapis.com/v1beta/files/test-audio",
    );
    calls.push({ route: url.pathname, body });
    if (geminiFailures > 0) {
      geminiFailures--;
      return json(
        {
          error: {
            status: "RESOURCE_EXHAUSTED",
            details: geminiDailyLimit
              ? [
                  {
                    "@type": "type.googleapis.com/google.rpc.QuotaFailure",
                    violations: [{ quotaId: "TranscribeRequestsPerDay" }],
                  },
                ]
              : [
                  {
                    "@type": "type.googleapis.com/google.rpc.RetryInfo",
                    retryDelay: "90s",
                  },
                ],
          },
        },
        429,
      );
    }
    return json({
      status: "completed",
      steps: [
        {
          type: "model_output",
          content: [{ type: "text", text: "Geminiで文字起こししました。" }],
        },
      ],
    });
  }
  if (
    url.hostname === "generativelanguage.googleapis.com" &&
    url.pathname === "/v1beta/files/test-audio" &&
    init?.method === "DELETE"
  ) {
    assert.equal(url.searchParams.get("key"), geminiApiKey);
    calls.push({ route: url.pathname, body: "delete" });
    return json({});
  }
  if (url.hostname === "api.openai.com") {
    assert.equal(headers.get("authorization"), `Bearer ${apiKey}`);
    if (url.pathname === "/v1/audio/transcriptions") {
      const form = init?.body as FormData;
      assert.equal(form.get("model"), "gpt-transcribe");
      assert.deepEqual(form.getAll("languages[]"), ["ja"]);
      assert.equal(form.get("language"), null);
      assert.equal(form.get("response_format"), "json");
      const file = form.get("file") as File;
      assert.ok(file instanceof File);
      calls.push({
        route: url.pathname,
        body: { name: file.name, type: file.type, prompt: form.get("prompt") },
      });
      if (file.name.endsWith(".m4a")) {
        assert.equal(file.type, "audio/mp4");
        assert.equal(
          new TextDecoder().decode(
            new Uint8Array(await file.arrayBuffer()).slice(4, 8),
          ),
          "ftyp",
        );
      }
      if (
        (file.name.startsWith("recording-2") ||
          file.name.endsWith("recording-1-2.wav")) &&
        failSecondRecording
      )
        return json({ error: { message: "test-only failure" } }, 429);
      return json({
        text: file.name.startsWith("recording-2")
          ? "後半で実施が決定しました。"
          : "佐藤さんが来週までに企画書を作成します。",
      });
    }
    if (init?.method === "POST" && url.pathname === "/v1/responses") {
      const body = JSON.parse(init.body as string);
      calls.push({ route: url.pathname, body });
      assert.equal(body.background, true);
      assert.equal(body.store, true);
      assert.equal(body.text.format.type, "json_schema");
      assert.equal(body.text.format.strict, true);
      const id = `resp-${calls.length}`;
      const attachments = Array.isArray(body.input[1].content)
        ? body.input[1].content
            .filter((c: any) => c.type === "input_text")
            .map((c: any) => JSON.parse(c.text))
            .filter((c: any) => c.attachmentId)
            .map((c: any) => ({ id: c.attachmentId, name: c.fileName }))
        : [];
      responses.set(id, {
        ...(createDemo() as any).minutes,
        ...(attachments.length
          ? { documentReview: attachments.map(reviewFixture) }
          : {}),
      });
      return json({ id, status: "queued" });
    }
    return json({
      status: "completed",
      output: [
        {
          type: "message",
          content: [
            {
              type: "output_text",
              text: JSON.stringify(
                responses.get(url.pathname.split("/").pop()!),
              ),
            },
          ],
        },
      ],
    });
  }
  if (url.pathname.startsWith("/storage/v1/object/")) {
    if (url.pathname.includes("/sign/"))
      return json({
        signedURL: `/object/signed/${url.pathname.split("/").pop()}?token=test`,
      });
    if (init?.method === "DELETE") {
      for (const prefix of JSON.parse(init.body).prefixes)
        audioObjects.delete(`${url.pathname}/${prefix}`);
      return json([]);
    }
    if (init?.method === "POST") {
      const body = init.body;
      const blob =
        body instanceof FormData
          ? [...body.values()].find((value) => value instanceof Blob)
          : body;
      assert.ok(blob instanceof Blob);
      audioObjects.set(url.pathname, blob);
      return json({ Key: "saved" });
    }
    const blob = audioObjects.get(url.pathname);
    assert.ok(blob, `stored audio missing: ${url.pathname}`);
    return new Response(blob);
  }
  throw new Error(`Unexpected network request: ${url.pathname}`);
};
const { handler } =
  await import("../supabase/functions/kotonoha-api/handler.ts");

function request(route: string, token = "valid-a", init: RequestInit = {}) {
  token = token === "valid-a" ? tokenA : token === "valid-b" ? tokenB : token;
  return handler(
    new Request(
      `https://kotonoha-test.invalid/functions/v1/kotonoha-api${route}`,
      {
        ...init,
        headers: {
          Authorization: `Bearer ${token}`,
          Origin: "https://marugo-s.github.io",
          ...(init.body instanceof FormData
            ? {}
            : { "Content-Type": "application/json" }),
          ...init.headers,
        },
      },
    ),
  );
}
async function drain() {
  await Promise.all(jobs.splice(0));
}

Deno.test(
  "Cloud HTTP: fixed login, shared sessions, encrypted settings, upload, GPT pipeline and edits",
  async () => {
    try {
      const calendar = calendarMeeting(),
        eventId = eventKey(calendarEvent),
        calRoute = `/meetings/${calendar.id}`;
      rows.set(calendar.id, {
        owner,
        document: calendar,
        audioPath: null,
        responseId: null,
      });
      const patch = {
        method: "PATCH",
        body: JSON.stringify({
          ...editFields(calendarEvent),
          date: "2026-10-16",
          owner: "田中",
        }),
      };
      assert.equal(
        (await request(`${calRoute}/calendar/${eventId}`, "anonymous", patch))
          .status,
        401,
      );
      assert.equal(
        (await request(`${calRoute}/calendar/${eventId}`, "valid-a", patch))
          .status,
        200,
      );
      const fromB = await (await request(calRoute, "valid-b")).json();
      assert.equal(fromB.calendarOverrides[eventId].event.date, "2026-10-16");
      assert.equal(
        fromB.calendarOverrides[eventId].original.date,
        "2026-10-15",
      );
      assert.equal(
        (
          await request(calRoute, "valid-b", {
            method: "PATCH",
            body: JSON.stringify({ markdown: "# 全員に共有する手動の本文" }),
          })
        ).status,
        200,
      );
      assert.equal(
        (await (await request(calRoute, "valid-a")).json()).markdown,
        "# 全員に共有する手動の本文",
      );
      assert.equal(
        rows.get(calendar.id).document.calendarOverrides[eventId].event.owner,
        "田中",
      );
      assert.equal(
        (
          await request(
            `${calRoute}/calendar/0000000000000000`,
            "valid-a",
            patch,
          )
        ).status,
        404,
      );
      assert.equal(
        (
          await request(`${calRoute}/calendar/${eventId}`, "valid-b", {
            method: "PATCH",
            body: JSON.stringify({
              ...editFields(calendarEvent),
              date: "2026-02-30",
            }),
          })
        ).status,
        400,
      );
      assert.equal(calls.length, 0, "manual edits must never call OpenAI");
      assert.equal(
        (
          await request(`${calRoute}/calendar/${eventId}`, "valid-b", {
            method: "DELETE",
          })
        ).status,
        200,
      );
      assert.deepEqual(rows.get(calendar.id).document.calendarOverrides, {});
      rows.delete(calendar.id);
      assert.equal((await request("/meetings", "invalid")).status, 401);
      assert.equal((await request("/meetings", "anonymous")).status, 401);
      assert.equal((await request("/meetings", createToken())).status, 401);
      const invalidLogin = await request("/auth/login", "", {
        method: "POST",
        body: JSON.stringify({
          loginId: "test-shared",
          password: "wrong-password",
        }),
      });
      assert.equal(invalidLogin.status, 401);
      const loggedIn = await request("/auth/login", "", {
        method: "POST",
        body: JSON.stringify({
          loginId: "test-shared",
          password: "test-password-only",
        }),
      });
      assert.equal(loggedIn.status, 200);
      const loginSession = await loggedIn.json();
      assert.ok(loginSession.token.startsWith("ktn_"));
      assert.equal(loginSession.workspaceId, undefined);
      assert.equal(
        (await request("/auth/session", loginSession.token)).status,
        200,
      );
      assert.equal(
        (
          await handler(
            new Request(
              "https://kotonoha-test.invalid/functions/v1/kotonoha-api/meetings",
            ),
          )
        ).status,
        401,
      );
      assert.equal(
        (
          await request("/meetings", "valid-a", {
            headers: { Origin: "https://untrusted.invalid" },
          })
        ).status,
        403,
      );
      const options = await request("/settings", "", { method: "OPTIONS" });
      assert.equal(options.status, 204);
      assert.equal(
        options.headers.get("Access-Control-Allow-Origin"),
        "https://marugo-s.github.io",
      );
      const save = await request("/settings", "valid-a", {
        method: "PUT",
        body: JSON.stringify({ model: "gpt-6-astra", apiKey }),
      });
      assert.equal(save.status, 200);
      assert.ok(!(await save.text()).includes(apiKey));
      assert.equal(
        await decryptApiKey(configs.get(owner).encryptedKey, owner, secret),
        apiKey,
      );
      assert.equal(
        (await (await request("/settings", "valid-b")).json()).configured,
        true,
      );
      const geminiSave = await request("/settings", "valid-a", {
        method: "PUT",
        body: JSON.stringify({
          model: "gpt-6-astra",
          transcriptionModel: "gemini-3.5-transcribe",
          geminiApiKey,
        }),
      });
      assert.equal(geminiSave.status, 200);
      const geminiSettings = await geminiSave.json();
      assert.equal(geminiSettings.geminiConfigured, true);
      assert.ok(!JSON.stringify(geminiSettings).includes(geminiApiKey));
      assert.equal(
        await decryptApiKey(
          configs.get(owner).encryptedGeminiKey,
          owner,
          secret,
        ),
        geminiApiKey,
      );
      const geminiForm = new FormData();
      geminiForm.set("title", "Gemini文字起こし会議");
      geminiForm.set("date", "2026-09-24");
      geminiForm.set(
        "audio",
        new File([new Uint8Array(44)], "gemini.wav", {
          type: "audio/wav",
        }),
      );
      const geminiCreated = await request("/meetings", "valid-a", {
        method: "POST",
        body: geminiForm,
      });
      assert.equal(
        geminiCreated.status,
        202,
        await geminiCreated.clone().text(),
      );
      const geminiMeeting = await geminiCreated.json();
      await drain();
      await request("/meetings");
      await drain();
      await request("/meetings");
      const geminiDone = await (
        await request(`/meetings/${geminiMeeting.id}`)
      ).json();
      assert.equal(geminiDone.status, "done");
      assert.equal(geminiDone.transcriptionModel, "gemini-3.5-transcribe");
      assert.equal(geminiDone.transcript, "Geminiで文字起こししました。");
      assert.ok(calls.some((c) => c.route === "/v1beta/interactions"));
      assert.ok(
        calls.some(
          (c) => c.route === "/v1beta/files/test-audio" && c.body === "delete",
        ),
      );
      assert.equal(
        (
          await request(`/meetings/${geminiMeeting.id}`, "valid-a", {
            method: "DELETE",
          })
        ).status,
        204,
      );
      // Seven chunks represent 65 minutes. Audio inference is mocked; ordering,
      // durable cooldowns, browser reload and quota limits exercise the real handler.
      const geminiCount = () =>
        calls.filter((c) => c.route === "/v1beta/interactions").length;
      async function createGeminiUpload(count: number) {
        const response = await request("/uploads", "valid-a", {
          method: "POST",
          body: JSON.stringify({
            metadata: { title: "Gemini再開テスト", date: "2026-09-24" },
            sources: [{ name: "65-minutes.wav", size: 62_400_044 }],
            parts: Array.from({ length: count }, (_, i) => ({
              name: `recording-1-${i + 1}.wav`,
              size: 44,
              sourceIndex: 0,
              partNumber: i + 1,
              duration: i === 6 ? 300 : 600,
            })),
          }),
        });
        assert.equal(response.status, 201, await response.clone().text());
        const draft = await response.json();
        for (let i = 0; i < count; i++)
          assert.equal(
            (
              await request(
                `/meetings/${draft.id}/parts?index=${i}`,
                "valid-b",
                {
                  method: "POST",
                  body: new Blob([new Uint8Array(44)], { type: "audio/wav" }),
                  headers: { "Content-Type": "audio/wav" },
                },
              )
            ).status,
            200,
          );
        assert.equal(
          (
            await request(`/meetings/${draft.id}/complete`, "valid-a", {
              method: "POST",
            })
          ).status,
          202,
        );
        await drain();
        return draft.id;
      }
      async function pollTogether() {
        await Promise.all([
          request("/meetings", "valid-a"),
          request("/meetings", "valid-b"),
        ]);
        await drain();
      }
      function advanceWait(id: string) {
        const until = rows.get(id).document.transcriptionWait?.until;
        assert.ok(until, "expected durable wait");
        clockOffset += Math.max(0, Date.parse(until) - Date.now()) + 1;
      }
      const longStart = geminiCount();
      const longId = await createGeminiUpload(7);
      // Previous meeting left the shared gate in its 30 second cooldown.
      assert.equal(
        rows.get(longId).document.transcriptionWait.reason,
        "spacing",
      );
      await pollTogether();
      assert.equal(geminiCount(), longStart, "no requests before cooldown");
      advanceWait(longId);
      await pollTogether();
      assert.equal(geminiCount(), longStart + 1);
      assert.equal(
        rows.get(longId).document.audioParts[0].transcript,
        "Geminiで文字起こししました。",
      );
      await pollTogether(); // persist the next spacing wait
      advanceWait(longId);
      geminiFailures = 1;
      await pollTogether();
      const rateWait = rows.get(longId).document.transcriptionWait;
      assert.equal(rateWait.reason, "rate_limit");
      assert.equal(rateWait.attempt, 1);
      assert.ok(
        Date.parse(rateWait.until) - Date.now() > 89_000,
        "honor Google's 90s RetryInfo",
      );
      assert.equal(
        rows.get(longId).document.audioParts.filter((p: any) => p.transcript)
          .length,
        1,
      );
      // A new session/page read does not re-send a paid request while waiting.
      const beforeReload = geminiCount();
      await request(`/meetings/${longId}`, "valid-b");
      await pollTogether();
      assert.equal(geminiCount(), beforeReload);
      assert.equal(
        (
          await request(`/meetings/${longId}/retry`, "valid-a", {
            method: "POST",
          })
        ).status,
        409,
      );
      advanceWait(longId);
      await pollTogether();
      assert.equal(rows.get(longId).document.geminiRetryCount, 0);
      for (
        let guard = 0;
        guard < 30 && rows.get(longId).document.status !== "done";
        guard++
      ) {
        if (rows.get(longId).document.transcriptionWait) advanceWait(longId);
        await pollTogether();
      }
      assert.equal(rows.get(longId).document.status, "done");
      assert.equal(
        rows.get(longId).document.audioParts.filter((p: any) => p.transcript)
          .length,
        7,
      );
      assert.equal(
        geminiCount() - longStart,
        8,
        "7 chunks plus only the failed chunk once more",
      );
      assert.equal(
        (await request(`/meetings/${longId}`, "valid-a", { method: "DELETE" }))
          .status,
        204,
      );

      // Two meetings share one workspace throttle, including the failure cooldown.
      const parallelStart = geminiCount();
      const parallelA = await createGeminiUpload(1);
      const parallelB = await createGeminiUpload(1);
      advanceWait(parallelA);
      await pollTogether();
      assert.equal(geminiCount(), parallelStart + 1);
      assert.equal(
        rows.get(parallelB).document.transcriptionWait.reason,
        "spacing",
      );
      await pollTogether();
      advanceWait(parallelB);
      await pollTogether();
      await pollTogether();
      await pollTogether();
      for (const id of [parallelA, parallelB]) {
        assert.equal(rows.get(id).document.status, "done");
        assert.equal(
          (await request(`/meetings/${id}`, "valid-a", { method: "DELETE" }))
            .status,
          204,
        );
      }
      assert.equal(geminiCount(), parallelStart + 2);

      const exhaustedStart = geminiCount();
      geminiFailures = 6;
      const exhaustedId = await createGeminiUpload(1);
      for (let i = 0; i < 6; i++) {
        advanceWait(exhaustedId);
        await pollTogether();
        if (i < 5) {
          const m = rows.get(exhaustedId).document;
          assert.equal(m.status, "transcribing");
          assert.equal(m.transcriptionWait.attempt, i + 1);
          // Late retries exceed the usual 4-minute lease but must not time out.
          if (i === 4) {
            clockOffset += 240_001;
            await pollTogether();
            assert.equal(rows.get(exhaustedId).document.status, "transcribing");
          }
        }
      }
      assert.equal(rows.get(exhaustedId).document.status, "error");
      assert.equal(
        rows.get(exhaustedId).document.diagnosticCode,
        "GEMINI_RETRIES_EXHAUSTED",
      );
      await pollTogether();
      assert.equal(geminiCount() - exhaustedStart, 6);
      assert.equal(
        (
          await request(`/meetings/${exhaustedId}`, "valid-a", {
            method: "DELETE",
          })
        ).status,
        204,
      );
      geminiFailures = 1;
      geminiDailyLimit = true;
      const dailyId = await createGeminiUpload(1);
      advanceWait(dailyId);
      await pollTogether();
      assert.equal(rows.get(dailyId).document.status, "error");
      assert.equal(
        rows.get(dailyId).document.diagnosticCode,
        "GEMINI_QUOTA_EXHAUSTED",
      );
      assert.equal(rows.get(dailyId).document.transcriptionWait, null);
      assert.equal(
        (await request(`/meetings/${dailyId}`, "valid-a", { method: "DELETE" }))
          .status,
        204,
      );
      geminiDailyLimit = false;
      clockOffset = 0;
      for (const model of ["gpt-6-astra", "gpt-6-sol"]) {
        await request("/settings", "valid-a", {
          method: "PUT",
          body: JSON.stringify({
            model,
            transcriptionModel: "gpt-transcribe",
          }),
        });
        const form = new FormData();
        form.set("title", "テスト会議");
        form.set("date", "2026-09-23");
        if (model === "gpt-6-sol")
          form.set(
            "audio",
            new File([new Uint8Array(44)], "meeting.wav", {
              type: "audio/wav",
            }),
          );
        else form.set("transcript", "議論の結果、来週から開始します。");
        const created = await request("/meetings", "valid-a", {
          method: "POST",
          body: form,
        });
        assert.equal(created.status, 202, await created.clone().text());
        const meeting = await created.json();
        assert.equal(meeting.runId, undefined);
        await drain();
        assert.equal(
          calls.filter((c) => c.route === "/v1/responses").at(-1)?.body.model,
          model,
        );
        assert.equal(
          (await request(`/meetings/${meeting.id}`, "valid-b")).status,
          200,
        );
        const list = await (await request("/meetings")).json();
        const done = list.find((m: any) => m.id === meeting.id);
        assert.equal(done.status, "done");
        assert.ok(done.markdown.includes("決定事項"));
        assert.ok(done.transcript.length);
        assert.equal(done.hasAudio, model === "gpt-6-sol");
        assert.equal(
          (await (await request("/meetings", "valid-b")).json()).length,
          1,
        );
        const edited = await request(`/meetings/${meeting.id}`, "valid-a", {
          method: "PATCH",
          body: JSON.stringify({ markdown: "手動修正" }),
        });
        assert.equal((await edited.json()).markdown, "手動修正");
        assert.equal(
          (await (await request(`/meetings/${meeting.id}`, "valid-b")).json())
            .markdown,
          "手動修正",
        );
        assert.equal(
          (
            await request(`/meetings/${meeting.id}`, "valid-b", {
              method: "DELETE",
            })
          ).status,
          204,
        );
      }
      assert.equal(
        calls.filter((c) => c.route === "/v1/audio/transcriptions").length,
        1,
      );
      // Same workspace, mixed formats, durable partial results and retry only missing parts.
      const combined = new FormData();
      combined.set("title", "分割録音の統合テスト");
      combined.set("date", "2026-09-23");
      combined.append("audio", new File([aacFixture], "前半.AAC"));
      combined.append(
        "audio",
        new File([new Uint8Array(44)], "後半.wav", { type: "audio/wav" }),
      );
      failSecondRecording = true;
      const batchResponse = await request("/meetings", "valid-a", {
        method: "POST",
        body: combined,
      });
      assert.equal(
        batchResponse.status,
        202,
        await batchResponse.clone().text(),
      );
      const batch = await batchResponse.json();
      assert.equal(batch.audioParts, undefined);
      assert.deepEqual(
        batch.recordings.map((part: any) => part.fileName),
        ["前半.AAC", "後半.wav"],
      );
      await drain();
      const failed = await (
        await request(`/meetings/${batch.id}`, "valid-b")
      ).json();
      assert.equal(failed.status, "error");
      assert.match(failed.error, /録音2/);
      assert.deepEqual(
        failed.recordings.map((part: any) => part.transcribed),
        [true, false],
      );
      const beforeRetry = calls.length;
      failSecondRecording = false;
      assert.equal(
        (
          await request(`/meetings/${batch.id}/retry`, "valid-b", {
            method: "POST",
          })
        ).status,
        202,
      );
      await drain();
      const retriedCalls = calls.slice(beforeRetry);
      assert.equal(
        retriedCalls.filter((call) => call.route === "/v1/audio/transcriptions")
          .length,
        1,
      );
      assert.equal(retriedCalls[0].body.name, "recording-2.wav");
      const summaryInput = retriedCalls.find(
        (call) => call.route === "/v1/responses",
      )!.body.input[1].content;
      assert.match(summaryInput, /【録音 1】.*佐藤.*【録音 2】.*後半/);
      const batchDone = (
        await (await request("/meetings", "valid-b")).json()
      ).find((m: any) => m.id === batch.id);
      assert.equal(batchDone.status, "done");
      assert.deepEqual(
        batchDone.recordings.map((part: any) => part.transcribed),
        [true, true],
      );
      assert.match(
        (await (await request(`/meetings/${batch.id}/audio?part=0`)).json())
          .url,
        /recording-1.m4a/,
      );
      assert.match(
        (await (await request(`/meetings/${batch.id}/audio?part=1`)).json())
          .url,
        /recording-2.wav/,
      );
      assert.equal(
        (await request(`/meetings/${batch.id}/audio?part=2`)).status,
        404,
      );
      assert.equal(
        (await request(`/meetings/${batch.id}/audio?part=-1`)).status,
        404,
      );

      const beforeFiles = audioObjects.size;
      const beforeMeetings = rows.size;
      const broken = new FormData();
      broken.set("title", "失敗テスト");
      broken.set("date", "2026-09-23");
      broken.append("audio", new File([aacFixture], "valid.aac"));
      broken.append(
        "audio",
        new File([aacFixture.slice(0, -1)], "truncated.aac"),
      );
      assert.equal(
        (
          await request("/meetings", "valid-a", {
            method: "POST",
            body: broken,
          })
        ).status,
        400,
      );
      assert.equal(
        audioObjects.size,
        beforeFiles,
        "cleanup all previously uploaded parts",
      );
      assert.equal(rows.size, beforeMeetings);
      const tooMany = new FormData();
      tooMany.set("title", "上限テスト");
      tooMany.set("date", "2026-09-23");
      for (let i = 0; i < 6; i++)
        tooMany.append("audio", new File([aacFixture], `${i}.aac`));
      assert.equal(
        (
          await request("/meetings", "valid-a", {
            method: "POST",
            body: tooMany,
          })
        ).status,
        400,
      );
      // New staged protocol: upload all parts first, then one transcription per
      // worker lease. Concurrent polling must not duplicate OpenAI requests.
      const plan = {
        metadata: { title: "100MB境界", date: "2026-09-23" },
        sources: [{ name: "large.wav", size: 100_000_000 }],
        parts: Array.from({ length: 7 }, (_, i) => ({
          name: `recording-1-${i + 1}.wav`,
          size: 44,
          sourceIndex: 0,
          partNumber: i + 1,
          duration: 1,
        })),
      };
      const createUpload = () =>
        request("/uploads", "valid-a", {
          method: "POST",
          body: JSON.stringify(plan),
        });
      const draftResponse = await createUpload();
      assert.equal(draftResponse.status, 201);
      const draft = await draftResponse.json();
      assert.equal(draft.uploadPlan, undefined);
      assert.equal(draft.status, "uploading");
      assert.equal(
        (
          await request(`/meetings/${draft.id}/complete`, "valid-a", {
            method: "POST",
          })
        ).status,
        409,
      );
      assert.equal(
        (
          await request(`/meetings/${draft.id}/retry`, "valid-a", {
            method: "POST",
          })
        ).status,
        409,
      );
      const putPart = (index: number, bytes = 44) =>
        request(`/meetings/${draft.id}/parts?index=${index}`, "valid-b", {
          method: "POST",
          body: new Blob([new Uint8Array(bytes)], { type: "audio/wav" }),
          headers: { "Content-Type": "audio/wav" },
        });
      assert.equal((await putPart(1)).status, 409);
      assert.equal((await putPart(0, 43)).status, 400);
      const transcriptionCount = () =>
        calls.filter((c) => c.route.endsWith("/transcriptions")).length;
      const beforeCount = transcriptionCount();
      for (let i = 0; i < 7; i++) assert.equal((await putPart(i)).status, 200);
      assert.equal((await putPart(6)).status, 409);
      assert.equal(
        transcriptionCount(),
        beforeCount,
        "upload does not call OpenAI",
      );
      assert.equal(
        (
          await request(`/meetings/${draft.id}/complete`, "valid-a", {
            method: "POST",
          })
        ).status,
        202,
      );
      await drain();
      assert.equal(transcriptionCount(), beforeCount + 1);
      failSecondRecording = true;
      await Promise.all([
        request("/meetings"),
        request("/meetings", "valid-b"),
      ]);
      await drain();
      assert.equal(
        transcriptionCount(),
        beforeCount + 2,
        "one claim even with concurrent shared sessions",
      );
      assert.equal(rows.get(draft.id).document.status, "error");
      assert.ok(rows.get(draft.id).document.audioParts[0].transcript);
      failSecondRecording = false;
      assert.equal(
        (
          await request(`/meetings/${draft.id}/retry`, "valid-b", {
            method: "POST",
          })
        ).status,
        202,
      );
      await drain();
      for (let i = 0; i < 8; i++) {
        await request("/meetings");
        await drain();
      }
      assert.equal(rows.get(draft.id).document.status, "done");
      assert.equal(
        transcriptionCount(),
        beforeCount + 8,
        "7 successful calls and 1 failed; no re-transcription of saved chunks",
      );
      assert.ok(
        calls.filter((c) => c.route.endsWith("/transcriptions")).at(-1)!.body
          .prompt,
      );
      assert.ok(rows.get(draft.id).document.transcript.includes("【録音 7】"));
      const abandoned = await (await createUpload()).json();
      const filesBefore = audioObjects.size;
      await request(`/meetings/${abandoned.id}/parts?index=0`, "valid-a", {
        method: "POST",
        body: new Blob([new Uint8Array(44)]),
        headers: { "Content-Type": "application/octet-stream" },
      });
      assert.equal(audioObjects.size, filesBefore + 1);
      await request(`/meetings/${abandoned.id}`, "valid-b", {
        method: "DELETE",
      });
      assert.equal(
        audioObjects.size,
        filesBefore,
        "abandoned upload audio cleaned up",
      );
      plan.sources[0].size++;
      assert.equal((await createUpload()).status, 400);
      // Real PDF/DOCX/XLSX fixtures, shared access, private signed native file inputs.
      const documents = documentFixtures();
      const attachments = documents.map((f: any) => ({
        id: crypto.randomUUID(),
        name: f.name,
        size: f.size,
      }));
      const docCreate = await request("/uploads", "valid-a", {
        method: "POST",
        body: JSON.stringify({
          metadata: { title: "資料照合テスト", date: "2026-09-23" },
          sources: [{ name: "添付会議.wav", size: 44 }],
          parts: [
            {
              name: "recording-1-1.wav",
              size: 44,
              sourceIndex: 0,
              partNumber: 1,
              duration: 1,
            },
          ],
          attachments,
        }),
      });
      assert.equal(docCreate.status, 201, await docCreate.clone().text());
      const documentMeeting = await docCreate.json();
      const docRoute = `/meetings/${documentMeeting.id}`;
      assert.equal(documentMeeting.attachmentPlan, undefined);
      assert.equal(
        (
          await request(`${docRoute}/parts?index=0`, "valid-a", {
            method: "POST",
            body: new Blob([new Uint8Array(44)], { type: "audio/wav" }),
            headers: { "Content-Type": "audio/wav" },
          })
        ).status,
        200,
      );
      const uploadDocument = (file: File, id: string, token = "valid-a") => {
        const form = new FormData();
        form.set("attachment", file);
        form.set("id", id);
        return request(`${docRoute}/attachments`, token, {
          method: "POST",
          body: form,
        });
      };
      assert.equal(
        (await request(`${docRoute}/complete`, "valid-a", { method: "POST" }))
          .status,
        409,
      );
      assert.equal(
        (await uploadDocument(documents[0], attachments[0].id, "invalid"))
          .status,
        401,
      );
      const aiBefore = calls.length;
      for (const [index, file] of documents.entries()) {
        const result = await uploadDocument(file, attachments[index].id);
        assert.equal(result.status, 201, await result.clone().text());
        const saved = await result.json();
        assert.equal(saved.attachments[index].storagePath, undefined);
        assert.equal(saved.attachments[index].name, file.name);
        const path = rows.get(documentMeeting.id).document.attachments[index]
          .storagePath;
        const stored = audioObjects.get(
          `/storage/v1/object/kotonoha-documents/${path}`,
        )!;
        assert.deepEqual(
          new Uint8Array(await stored.arrayBuffer()),
          new Uint8Array(await file.arrayBuffer()),
        );
      }
      assert.equal(calls.length, aiBefore, "saving must not invoke AI");
      assert.equal(
        (await uploadDocument(documents[0], attachments[0].id)).status,
        409,
      );
      const sharedDocs = await (await request(docRoute, "valid-b")).json();
      assert.equal(sharedDocs.attachments.length, 3);
      assert.equal(
        (
          await request(
            `${docRoute}/attachments/${attachments[0].id}`,
            "invalid",
          )
        ).status,
        401,
      );
      assert.match(
        (
          await (
            await request(
              `${docRoute}/attachments/${attachments[0].id}`,
              "valid-b",
            )
          ).json()
        ).url,
        /signed/,
      );
      assert.equal(
        (await request(`${docRoute}/complete`, "valid-b", { method: "POST" }))
          .status,
        202,
      );
      await drain();
      await request("/meetings");
      await drain();
      assert.equal(
        (
          await uploadDocument(
            new File(["追加"], "note.txt"),
            crypto.randomUUID(),
          )
        ).status,
        409,
      );
      assert.equal(
        (
          await request(
            `${docRoute}/attachments/${attachments[0].id}`,
            "valid-a",
            { method: "DELETE" },
          )
        ).status,
        409,
      );
      const responseInput = calls
        .filter((c) => c.route === "/v1/responses")
        .at(-1)!.body;
      const nativeFiles = responseInput.input[1].content.filter(
        (c: any) => c.type === "input_file",
      );
      assert.equal(nativeFiles.length, 3);
      assert.ok(
        nativeFiles.every(
          (c: any) => c.file_url.includes("?token=test") && !c.file_data,
        ),
      );
      assert.ok(
        responseInput.text.format.schema.required.includes("documentReview"),
      );
      await request("/meetings");
      await drain();
      const finished = await (await request(docRoute, "valid-b")).json();
      assert.equal(finished.status, "done");
      assert.equal(finished.minutes.documentReview.length, 3);
      assert.match(finished.markdown, /添付資料との照合/);
      const objectsBeforeUnlink = audioObjects.size;
      const detached = await request(
        `${docRoute}/attachments/${attachments[0].id}`,
        "valid-b",
        { method: "DELETE" },
      );
      assert.equal(detached.status, 200);
      const changed = await detached.json();
      assert.equal(changed.attachments.length, 2);
      assert.equal(changed.minutesStale, true);
      assert.equal(changed.removedAttachments, undefined);
      assert.equal(
        audioObjects.size,
        objectsBeforeUnlink,
        "unlink retains originals",
      );
      assert.equal(
        (await request(`${docRoute}/attachments/${attachments[0].id}`)).status,
        404,
      );
      const transcribedBefore = calls.filter((c) =>
        c.route.endsWith("/transcriptions"),
      ).length;
      assert.equal(
        (await request(`${docRoute}/retry`, "valid-b", { method: "POST" }))
          .status,
        202,
      );
      await drain();
      await request("/meetings");
      await drain();
      assert.equal(
        rows.get(documentMeeting.id).document.minutes.documentReview.length,
        2,
      );
      assert.equal(rows.get(documentMeeting.id).document.minutesStale, false);
      assert.equal(
        calls.filter((c) => c.route.endsWith("/transcriptions")).length,
        transcribedBefore,
      );
      assert.equal(
        (await request("/auth/logout", loginSession.token, { method: "POST" }))
          .status,
        204,
      );
      assert.equal(
        (await request("/meetings", loginSession.token)).status,
        401,
      );
      assert.equal((await request("/meetings", "valid-a")).status, 200);
      assert.equal((await request("/meetings", "valid-b")).status, 200);
    } finally {
      await drain();
      globalThis.fetch = realFetch;
      Date.now = realNow;
    }
  },
);
