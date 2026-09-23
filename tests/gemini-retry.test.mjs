import { test } from "node:test";
import assert from "node:assert/strict";
import {
  geminiRateLimit,
  geminiRetryPlan,
  createLocalGeminiGate,
} from "../supabase/functions/_shared/gemini-retry.mjs";

const error = { provider: "gemini", status: 429 };
test("Gemini 429だけ再試行し、指数バックオフ・揺らぎ・上限5回を守る", () => {
  assert.equal(geminiRetryPlan({ status: 429 }), null);
  assert.equal(geminiRetryPlan({ ...error, status: 403 }), null);
  for (let i = 0; i < 5; i++) {
    const plan = geminiRetryPlan(error, i, 0, () => 0.5);
    assert.equal(plan.delayMs, 60_000 * 2 ** i + 2500);
    assert.equal(plan.attempt, i + 1);
    assert.equal(Date.parse(plan.until), plan.delayMs);
  }
  assert.equal(geminiRetryPlan(error, 5).stop, "GEMINI_RETRIES_EXHAUSTED");
  assert.equal(
    geminiRetryPlan({ ...error, retryAfterMs: 180_000 }, 0, 0, () => 0).delayMs,
    180_000,
  );
  assert.equal(
    geminiRetryPlan({ ...error, retryAfterMs: 90_000_000 }).stop,
    "GEMINI_QUOTA_EXHAUSTED",
  );
  assert.equal(
    geminiRetryPlan({ ...error, quotaExhausted: true }).stop,
    "GEMINI_QUOTA_EXHAUSTED",
  );
});
test("Retry-AfterとRetryInfoの長い方を尊重し、日次・ゼロ上限を識別する", () => {
  const retry = (header, details = []) =>
    geminiRateLimit(
      new Response(null, {
        status: 429,
        headers: header ? { "Retry-After": header } : {},
      }),
      { error: { details } },
      0,
    );
  const info = {
    "@type": "type.googleapis.com/google.rpc.RetryInfo",
    retryDelay: "95.25s",
  };
  assert.equal(retry("30", [info]).retryAfterMs, 95250);
  assert.equal(retry("120", [info]).retryAfterMs, 120000);
  assert.equal(retry("Thu, 01 Jan 1970 00:02:00 GMT").retryAfterMs, 120000);
  assert.equal(retry("invalid").retryAfterMs, 0);
  for (const violation of [
    { quotaId: "TranscribeRequestsPerDay" },
    { quotaMetric: "requests_per_day" },
    { quotaId: "x", quotaValue: "0" },
  ]) {
    assert.equal(
      retry(null, [
        {
          "@type": "type.googleapis.com/google.rpc.QuotaFailure",
          violations: [violation],
        },
      ]).quotaExhausted,
      true,
    );
  }
  assert.equal(
    retry(null, [
      {
        "@type": "type.googleapis.com/google.rpc.QuotaFailure",
        violations: [{ quotaId: "RequestsPerMinute", quotaValue: "10" }],
      },
    ]).quotaExhausted,
    false,
  );
});
test("ローカルの複数会議は直列化し、30秒間隔と429の共有待機を維持する", async () => {
  let now = 1000;
  const waits = [];
  const gate = createLocalGeminiGate({
    now: () => now,
    sleep: async (ms) => {
      now += ms;
    },
  });
  const record = async (until, reason) =>
    waits.push({ until: Date.parse(until), reason });
  const first = await gate(record);
  let entered = false;
  const pending = gate(record).then((release) => {
    entered = true;
    return release;
  });
  await Promise.resolve();
  assert.equal(entered, false);
  first(90_000, "rate_limit");
  const second = await pending;
  assert.equal(now, 91000);
  assert.deepEqual(waits, [{ until: 91000, reason: "rate_limit" }]);
  second();
  const third = await gate(record);
  assert.equal(now, 121000);
  assert.equal(waits[1].reason, "spacing");
  third();
});
