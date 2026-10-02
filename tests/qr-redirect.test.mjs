import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const source = readFileSync(
  new URL("../public/marugo/redirect.js", import.meta.url),
  "utf8",
).replace("export async function scan", "async function scan");
async function setup(hash, responses) {
  const calls = [];
  const destinations = [];
  const elements = new Map(
    ["#status", "#retry", "#heading"].map(
      (id) => [id, { textContent: "", hidden: true, addEventListener() {} }],
    ),
  );
  const context = vm.createContext({
    location: { hash, replace: (url) => destinations.push(url) },
    document: { querySelector: (id) => elements.get(id) },
    crypto: { randomUUID: () => "00000000-0000-4000-8000-000000000001" },
    URL,
    AbortSignal,
    fetch: async (_, args) => {
      calls.push(JSON.parse(args.body));
      const value = responses.shift();
      if (value instanceof Error) throw value;
      return {
        ok: value.status === 200,
        status: value.status,
        json: async () => value.body,
      };
    },
  });
  vm.runInContext(source, context);
  await new Promise((resolve) => setImmediate(resolve));
  return { context, calls, destinations, elements };
}
test("Public QR: redirects only after recording and reuses event ID on a lost response", async () => {
  const state = await setup("#abcdefgh1234", [new Error("response lost"), {
    status: 200,
    body: { targetUrl: "https://example.com/landing" },
  }]);
  assert.equal(state.destinations.length, 0);
  assert.equal(state.elements.get("#retry").hidden, false);
  await vm.runInContext("scan()", state.context);
  assert.deepEqual(state.calls[0], state.calls[1]);
  assert.deepEqual(state.destinations, ["https://example.com/landing"]);
});
test("Public QR: invalid code and stopped links never redirect", async () => {
  const invalid = await setup("#bad", []);
  assert.equal(invalid.calls.length, 0);
  const paused = await setup("#abcdefgh1234", [{
    status: 410,
    body: { error: "停止中" },
  }]);
  assert.equal(paused.destinations.length, 0);
  assert.equal(paused.elements.get("#retry").hidden, true);
});
test("Public QR: non-http destination is rejected", async () => {
  const state = await setup("#abcdefgh1234", [{
    status: 200,
    body: { targetUrl: "javascript:alert(1)" },
  }]);
  assert.equal(state.destinations.length, 0);
  assert.equal(state.elements.get("#retry").hidden, false);
});
