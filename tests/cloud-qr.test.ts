import assert from "node:assert/strict";
import {
  handler,
  normalizeTarget,
} from "../supabase/functions/marugo-qr/handler.ts";
import {
  createToken,
  hashToken,
} from "../supabase/functions/_shared/session.mjs";

const owner = "00000000-0000-4000-8000-000000000001";
const id = "00000000-0000-4000-8000-000000000002";
const eventId = "00000000-0000-4000-8000-000000000003";
const token = createToken();
const tokenHash = await hashToken(token);
const calls: { name: string; args: any }[] = [];
const realFetch = globalThis.fetch;
Deno.env.set("SUPABASE_URL", "https://qr-test.invalid");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "test-key-only");
let failure = false;
let suspended = false;
globalThis.fetch = async (input, init: any) => {
  const url = new URL(String(input));
  const args = JSON.parse(init!.body as string);
  const name = url.pathname.split("/").pop()!;
  calls.push({ name, args });
  assert.equal(
    new Headers(init?.headers).get("authorization"),
    "Bearer test-key-only",
  );
  if (failure) {
    return Response.json({ message: "internal failure" }, { status: 500 });
  }
  if (name === "kotonoha_auth") {
    return Response.json(
      args.p_payload.tokenHash === tokenHash
        ? { workspaceId: owner }
        : { error: "INVALID_TOKEN" },
    );
  }
  assert.equal(name, "kotonoha_qr");
  if (args.p_operation === "scan") {
    assert.equal(args.p_owner, undefined);
    if (suspended) {
      return Response.json({ message: "INACTIVE" }, { status: 400 });
    }
    return Response.json({ targetUrl: "https://example.com/landing" });
  }
  assert.equal(args.p_owner, owner);
  return Response.json(
    args.p_operation === "list"
      ? { links: [], total: 0 }
      : args.p_operation === "history"
      ? { events: [], total: 0 }
      : { id, ...args.p_payload },
  );
};
function request(
  route: string,
  method = "GET",
  payload?: unknown,
  session?: string,
  origin = "https://marugo-s.github.io",
) {
  return new Request(`https://qr-test.invalid/functions/v1/marugo-qr${route}`, {
    method,
    headers: {
      origin,
      ...(session ? { Authorization: `Bearer ${session}` } : {}),
      ...(payload ? { "Content-Type": "application/json" } : {}),
    },
    ...(payload ? { body: JSON.stringify(payload) } : {}),
  });
}
Deno.test("QR API: public scan, shared authorization, validated URLs and safe failures", async () => {
  try {
    assert.equal((await handler(request("/links"))).status, 401);
    assert.equal(calls.length, 0);
    assert.equal(
      (await handler(request("/links", "GET", undefined, createToken())))
        .status,
      401,
    );
    assert.equal(
      (await handler(request("/links", "GET", undefined, token))).status,
      200,
    );
    assert.equal(
      (await handler(request("/links?page=-1", "GET", undefined, token)))
        .status,
      400,
    );
    assert.equal(
      (await handler(
        request("/links", "POST", {
          id,
          title: "poster",
          targetUrl: "javascript:alert(1)",
        }, token),
      )).status,
      400,
    );
    assert.equal(
      (await handler(
        request("/links", "POST", {
          id,
          title: "poster",
          targetUrl: "https://user:pass@example.com",
        }, token),
      )).status,
      400,
    );
    assert.equal(
      (await handler(
        request("/links", "POST", {
          id,
          title: "poster",
          targetUrl: "https://marugo-s.github.io/OEM/marugo/#abcdefgh1234",
        }, token),
      )).status,
      400,
    );
    const created = await handler(
      request("/links", "POST", {
        id,
        title: " poster ",
        targetUrl: "https://example.com",
      }, token),
    );
    assert.equal(created.status, 201);
    const row = await created.json();
    assert.match(row.code, /^[A-Za-z0-9_-]{12}$/);
    assert.equal(row.title, "poster");
    assert.equal(row.targetUrl, "https://example.com/");
    assert.equal(
      (await handler(request(`/links/${id}/history`, "GET", undefined, token)))
        .status,
      200,
    );
    assert.equal(
      (await handler(
        request(`/links/${id}`, "PATCH", { active: false }, token),
      )).status,
      200,
    );
    assert.equal(
      (await handler(
        request(`/links/${id}`, "PATCH", { active: "false" }, token),
      )).status,
      400,
    );
    const anonymous = await handler(
      request("/scan", "POST", { code: "abcdefgh1234", eventId }),
    );
    assert.equal(anonymous.status, 200);
    assert.deepEqual(await anonymous.json(), {
      targetUrl: "https://example.com/landing",
    });
    assert.equal(anonymous.headers.get("cache-control"), "no-store");
    assert.equal(
      anonymous.headers.get("access-control-allow-origin"),
      "https://marugo-s.github.io",
    );
    assert.equal((await handler(request("/scan", "GET"))).status, 405);
    assert.equal(
      (await handler(request("/scan", "POST", { code: "invalid", eventId })))
        .status,
      400,
    );
    assert.equal(
      (await handler(
        request("/scan", "POST", { code: "abcdefgh1234", eventId: "bad" }),
      )).status,
      400,
    );
    const before = calls.length;
    assert.equal(
      (await handler(
        request(
          "/scan",
          "POST",
          { code: "abcdefgh1234", eventId },
          undefined,
          "https://evil.invalid",
        ),
      )).status,
      403,
    );
    assert.equal(calls.length, before);
    assert.equal((await handler(request("/scan", "OPTIONS"))).status, 204);
    suspended = true;
    assert.equal(
      (await handler(
        request("/scan", "POST", { code: "abcdefgh1234", eventId }),
      )).status,
      410,
    );
    suspended = false;
    failure = true;
    const failed = await handler(
      request("/scan", "POST", { code: "abcdefgh1234", eventId }),
    );
    assert.equal(failed.status, 503);
    assert.equal((await failed.json()).targetUrl, undefined);
    assert.throws(() => normalizeTarget("https://example.com/\nheader"));
    assert.throws(() => normalizeTarget(null));
    assert.equal(
      normalizeTarget(" https://example.com/a?q=1#part "),
      "https://example.com/a?q=1#part",
    );
  } finally {
    globalThis.fetch = realFetch;
  }
});
