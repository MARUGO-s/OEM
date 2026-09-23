import assert from "node:assert/strict";
import { createDemo } from "../supabase/functions/_shared/demo.mjs";
import { decryptApiKey } from "../supabase/functions/_shared/key-crypto.mjs";
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
const rows = new Map<string, any>();
const configs = new Map<string, any>();
const jobs: Promise<unknown>[] = [];
const calls: { route: string; body: any }[] = [];
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
  if (url.pathname === "/rest/v1/rpc/kotonoha_store") {
    const {
      p_operation: op,
      p_owner: user,
      p_id: id,
      p_payload: payload,
    } = JSON.parse(init?.body as string);
    const config = configs.get(user) || {
      model: "gpt-6-astra",
      encryptedKey: null,
    };
    if (op === "settings_get") return json(config);
    if (op === "settings_put") {
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
    if (op === "job_update" && row.document.runId === payload.runId) {
      Object.assign(row.document, payload.patch);
      if ("responseId" in payload) row.responseId = payload.responseId;
    }
    if (op === "claim" || op === "patch") Object.assign(row.document, payload);
    if (op === "delete") {
      rows.delete(id);
      return json({ deleted: true });
    }
    return json(row);
  }
  if (url.hostname === "api.openai.com") {
    assert.equal(headers.get("authorization"), `Bearer ${apiKey}`);
    if (url.pathname === "/v1/audio/transcriptions") {
      const form = init?.body as FormData;
      assert.equal(form.get("model"), "gpt-4o-transcribe");
      assert.equal(form.get("response_format"), "json");
      assert.ok(form.get("file") instanceof File);
      calls.push({ route: url.pathname, body: null });
      return json({ text: "佐藤さんが来週までに企画書を作成します。" });
    }
    if (init?.method === "POST" && url.pathname === "/v1/responses") {
      const body = JSON.parse(init.body as string);
      calls.push({ route: url.pathname, body });
      assert.equal(body.background, true);
      assert.equal(body.store, true);
      assert.equal(body.text.format.type, "json_schema");
      assert.equal(body.text.format.strict, true);
      return json({ id: `resp-${calls.length}`, status: "queued" });
    }
    return json({
      status: "completed",
      output: [
        {
          type: "message",
          content: [
            {
              type: "output_text",
              text: JSON.stringify((createDemo() as any).minutes),
            },
          ],
        },
      ],
    });
  }
  if (url.pathname.startsWith("/storage/v1/object/")) {
    if (init?.method === "POST") return json({ Key: "saved" });
    return new Response(new Uint8Array(44), {
      headers: { "content-type": "audio/wav" },
    });
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
      for (const model of ["gpt-6-astra", "gpt-6-sol"]) {
        await request("/settings", "valid-a", {
          method: "PUT",
          body: JSON.stringify({ model }),
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
    }
  },
);
