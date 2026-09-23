import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { UsageStore } from "../server/usage-store.mjs";
import { summaryUsage, transcriptionUsage, usageEvent } from "../supabase/functions/_shared/usage.mjs";

test("API応答のトークン・キャッシュ・音声時間で料金を計算し、不明な料金をゼロにしない", () => {
  const minutes = summaryUsage("gpt-6-sol", {
    usage: { input_tokens: 1000, output_tokens: 200,
      input_tokens_details: { cached_tokens: 100, cache_write_tokens: 50 },
      output_tokens_details: { reasoning_tokens: 40 } },
  });
  assert.equal(minutes.costUsd, (850 * 2 + 100 * 0.2 + 50 * 2.5 + 200 * 10) / 1_000_000);
  assert.equal(minutes.inputTokens, 1000);
  assert.equal(minutes.reasoningTokens, 40);
  assert.equal(transcriptionUsage("gpt-transcribe", { usage: { seconds: 60 } }).costUsd, 0.0045);
  assert.equal(transcriptionUsage("gpt-transcribe", {}, 60).estimated, true);
  assert.equal(transcriptionUsage("gpt-transcribe", {}).costUsd, null);
  assert.equal(transcriptionUsage("gemini-3.5-transcribe", {
    usage: { total_input_tokens: 1500, total_output_tokens: 175 },
  }).costUsd, (1500 * 2 + 175 * 12) / 1_000_000);
});

test("ローカル利用履歴は再起動後も月別で読み取れ、重複記録しない", async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), "kotonoha-usage-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const first = new UsageStore(directory);
  await first.init();
  const event = usageEvent({ id: "00000000-0000-4000-8000-000000000001",
    meetingId: "meeting", meetingTitle: "会議", kind: "minutes",
    model: "gpt-6-sol", response: { usage: { input_tokens: 1000, output_tokens: 200 } } });
  await first.record(event);
  await first.record(event);
  const second = new UsageStore(directory);
  await second.init();
  const month = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit",
  }).format(new Date());
  const result = second.month(month, 0);
  assert.equal(result.eventCount, 1);
  assert.equal(result.events[0].meetingTitle, "会議");
  assert.equal(result.totalUsd, 0.004);
});
