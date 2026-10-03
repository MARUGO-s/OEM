import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import * as routing from "../src/qr-account-routing.mjs";
function harness(url, { recovery = false, failure = false } = {}) {
  const callbacks = new Set();
  let exchanges = 0;
  let clientOptions;
  const changes = [];
  const module = { exports: {} };
  const auth = {
    onAuthStateChange(fn) {
      callbacks.add(fn);
      return {
        data: {
          subscription: {
            unsubscribe() {
              callbacks.delete(fn);
            },
          },
        },
      };
    },
    async exchangeCodeForSession(code) {
      exchanges++;
      assert.equal(code, "one-use");
      if (failure)
        return { data: { session: null }, error: new Error("internal") };
      for (const fn of callbacks)
        fn(recovery ? "PASSWORD_RECOVERY" : "SIGNED_IN");
      return { data: { session: { user: { id: "test" } } }, error: null };
    },
  };
  const source = ts.transpileModule(
    readFileSync(
      new URL("../src/qr-account-client.ts", import.meta.url),
      "utf8",
    ).replaceAll("import.meta.env.BASE_URL", JSON.stringify("/multiapp/")),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    },
  ).outputText;
  vm.runInNewContext(source, {
    module,
    exports: module.exports,
    URL,
    Promise,
    Error,
    location: new URL(url),
    history: {
      replaceState(...args) {
        changes.push(args[2]);
      },
    },
    require(name) {
      if (name === "@supabase/supabase-js")
        return {
          createClient(_url, _key, options) {
            clientOptions = options;
            return { auth };
          },
        };
      if (name === "./cloud")
        return {
          SUPABASE_URL: "https://test.invalid",
          SUPABASE_PUBLISHABLE_KEY: "public-only",
        };
      if (name === "./qr-account-routing.mjs") return routing;
      throw new Error(name);
    },
  });
  return {
    client: module.exports,
    changes,
    get exchanges() {
      return exchanges;
    },
    get options() {
      return clientOptions;
    },
  };
}
test("QR Auth uses isolated storage and explicit PKCE callbacks", async () => {
  const h = harness(
    "https://marugo-s.github.io/multiapp/?account=confirm&code=one-use",
  );
  assert.equal(h.options.auth.storageKey, "marugo-qr-auth");
  assert.equal(h.options.auth.flowType, "pkce");
  assert.equal(h.options.auth.detectSessionInUrl, false);
  const [a, b] = await Promise.all([
    h.client.finishAccountCallback(),
    h.client.finishAccountCallback(),
  ]);
  assert.equal(h.exchanges, 1);
  assert.equal(a.recovery, false);
  assert.equal(b.recovery, false);
  assert.deepEqual(h.changes, ["/multiapp/"]);
});
test("Recovery mode is authorized by the SDK event, not an attacker-controlled query", async () => {
  const fake = harness(
    "https://marugo-s.github.io/multiapp/?account=recovery&code=one-use",
  );
  assert.equal((await fake.client.finishAccountCallback()).recovery, false);
  const real = harness(
    "https://marugo-s.github.io/multiapp/?account=recovery&code=one-use",
    { recovery: true },
  );
  assert.equal((await real.client.finishAccountCallback()).recovery, true);
  real.client.completeAccountRecovery();
  assert.equal((await real.client.finishAccountCallback()).recovery, false);
});
test("Expired/implicit links strip sensitive URLs and fail closed", async () => {
  const expired = harness(
    "https://marugo-s.github.io/multiapp/?account=recovery&code=one-use",
    { failure: true },
  );
  await assert.rejects(
    expired.client.finishAccountCallback(),
    /利用できません/,
  );
  assert.deepEqual(expired.changes, ["/multiapp/"]);
  const implicit = harness(
    "https://marugo-s.github.io/multiapp/#access_token=secret&refresh_token=private&type=recovery",
  );
  await assert.rejects(implicit.client.finishAccountCallback(), /無効/);
  assert.equal(implicit.exchanges, 0);
  assert.deepEqual(implicit.changes, ["/multiapp/"]);
});
test("Every QR path is bound to the immutable selected store", () => {
  const id = "00000000-0000-4000-8000-000000000103";
  assert.equal(
    routing.scopedQrPath("/links?page=2&storeId=forged", id),
    `/links?page=2&storeId=${id}`,
  );
  assert.equal(
    routing.scopedQrPath("/uploads/123/complete", id),
    `/uploads/123/complete?storeId=${id}`,
  );
  assert.throws(() => routing.scopedQrPath("https://evil.invalid/upload", id));
  assert.throws(() => routing.scopedQrPath("//evil.invalid", id));
  assert.throws(() => routing.scopedQrPath("/links", ""));
  assert.match(routing.passwordProblem("short", "short"), /12文字/);
  assert.match(routing.passwordProblem("longpassword123", "different"), /一致/);
  assert.equal(
    routing.passwordProblem("longpassword123", "longpassword123"),
    "",
  );
});
