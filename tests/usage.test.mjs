import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { UsageStore } from "../server/usage-store.mjs";
import { summaryUsage, transcriptionUsage, usageEvent } from "../supabase/functions/_shared/usage.mjs";
import { groupUsageEvents } from "../supabase/functions/_shared/usage-groups.mjs";

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

test("解析IDで分割録音と議事録を合算し、再生成は別の解析として扱う", () => {
  const base = { meetingId: "meeting", meetingTitle: "会議", inputTokens: 10,
    outputTokens: 5, audioSeconds: null, costUsd: 0.001 };
  const events = [
    { ...base, id: "a", runId: "run-1", kind: "transcription", createdAt: "2026-09-24T01:00:00Z" },
    { ...base, id: "b", runId: "run-1", kind: "transcription", createdAt: "2026-09-24T01:01:00Z" },
    { ...base, id: "c", runId: "run-1", kind: "minutes", createdAt: "2026-09-24T01:02:00Z" },
    { ...base, id: "d", runId: "run-2", kind: "minutes", costUsd: null, createdAt: "2026-09-24T02:00:00Z" },
  ];
  const groups = groupUsageEvents(events.reverse());
  assert.equal(groups.length, 2);
  assert.equal(groups[0].events.length, 1);
  assert.equal(groups[0].unpricedCount, 1);
  assert.equal(groups[1].events.length, 3);
  assert.equal(groups[1].totalUsd, 0.003);
  assert.equal(groups[1].inputTokens, 30);
});

test("解析IDのない旧履歴は議事録呼び出しで区切る", () => {
  const base = { meetingId: "meeting", costUsd: 0.01 };
  const events = [
    { ...base, id: "a", kind: "transcription", createdAt: "2026-09-24T01:00:00Z" },
    { ...base, id: "b", kind: "minutes", createdAt: "2026-09-24T01:01:00Z" },
    { ...base, id: "c", kind: "minutes", createdAt: "2026-09-24T02:00:00Z" },
  ];
  const groups = groupUsageEvents(events);
  assert.equal(groups.length, 2);
  assert.equal(groups[0].events.length, 1);
  assert.equal(groups[1].events.length, 2);
  assert.ok(groups.every((group) => group.legacy));
});
