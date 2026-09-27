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
  const luna = summaryUsage("gpt-6-luna", {
    usage: { input_tokens: 1000, output_tokens: 200,
      input_tokens_details: { cached_tokens: 100, cache_write_tokens: 50 } },
  });
  assert.equal(luna.costUsd, (850 * 0.1 + 100 * 0.01 + 50 * 0.125 + 200 * 0.5) / 1_000_000);
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

test("既存の独立したタグ料金も直前の同一会議にまとめ、料金とトークンを保持する", () => {
  const base = { meetingId: "meeting", meetingTitle: "会議", inputTokens: 10, outputTokens: 5 };
  const events = [
    { ...base, id: "1", runId: "analysis", kind: "transcription", costUsd: 0.030004, audioSeconds: 600, createdAt: "2026-09-27T20:53:00Z" },
    { ...base, id: "2", runId: "analysis", kind: "transcription", costUsd: 0.001684, audioSeconds: 33.626, createdAt: "2026-09-27T20:53:39Z" },
    { ...base, id: "3", runId: "analysis", kind: "minutes", costUsd: 0.001303925, createdAt: "2026-09-27T20:54:03Z" },
    { ...base, id: "4", runId: "old-tag-request", kind: "minutes", operation: "tags", costUsd: 0.00018505, createdAt: "2026-09-27T20:54:07Z" },
  ];
  const [group] = groupUsageEvents(events.toReversed());
  assert.equal(groupUsageEvents(events).length, 1);
  assert.equal(group.events.length, 4);
  assert.equal(group.inferredTags, true);
  assert.equal((group.totalUsd * 160).toFixed(4), "5.3083");
  assert.equal(group.inputTokens, 40);
  assert.equal(group.outputTokens, 20);
  assert.equal(group.audioSeconds, 633.626);
});

test("タグの明示的な親解析を優先し、再生成・他会議・サマリーを混ぜない", () => {
  const base = { meetingId: "a", costUsd: 0.01, kind: "minutes" };
  const events = [
    { ...base, id: "m1", runId: "r1", createdAt: "2026-09-28T00:00:00Z" },
    { ...base, id: "t1", runId: "tag1", operation: "tags", createdAt: "2026-09-28T00:01:00Z" },
    { ...base, id: "m2", runId: "r2", createdAt: "2026-09-28T00:02:00Z" },
    { ...base, id: "late", runId: "r1", parentRunId: "r1", operation: "tags", createdAt: "2026-09-28T00:03:00Z" },
    { ...base, id: "t2", runId: "tag2", operation: "tags", createdAt: "2026-09-28T00:04:00Z" },
    { ...base, id: "other", meetingId: "b", runId: "tag3", operation: "tags", createdAt: "2026-09-28T00:05:00Z" },
    { ...base, id: "summary", runId: "r1", operation: "summary", createdAt: "2026-09-28T00:06:00Z" },
  ];
  const groups = groupUsageEvents(events);
  assert.equal(groups.length, 4);
  assert.deepEqual(groups.find(g => g.id === "a:r1").events.map(e => e.id), ["m1", "t1", "late"]);
  assert.deepEqual(groups.find(g => g.id === "a:r2").events.map(e => e.id), ["m2", "t2"]);
  assert.equal(groups.flatMap(g => g.events).length, events.length);
  assert.equal(groups.reduce((sum, g) => sum + g.totalUsd, 0).toFixed(2), "0.07");
});

test("タグの親が月内にない場合・未来の議事録・料金不明・解析IDなしの履歴", () => {
  const base = { meetingId: "a", kind: "minutes", costUsd: 0.01 };
  const events = [
    { ...base, id: "early-tag", operation: "tags", createdAt: "2026-09-28T00:00:00Z" },
    { ...base, id: "legacy", createdAt: "2026-09-28T00:01:00Z" },
    { ...base, id: "legacy-tag", operation: "tags", costUsd: null, createdAt: "2026-09-28T00:02:00Z" },
    { ...base, id: "missing-parent", parentRunId: "previous-month", operation: "tags", createdAt: "2026-09-28T00:03:00Z" },
  ];
  const groups = groupUsageEvents(events);
  assert.equal(groups.length, 3);
  const legacy = groups.find(g => g.legacy);
  assert.deepEqual(legacy.events.map(e => e.id), ["legacy", "legacy-tag"]);
  assert.equal(legacy.unpricedCount, 1);
  assert.equal(legacy.totalUsd, 0.01);
});
