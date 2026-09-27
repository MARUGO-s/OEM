import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createTagCompletionTracker,
  createTagSuggestionCache,
} from "../src/tag-suggestions.mjs";

const meeting = (id, status, extra = {}) => ({
  id,
  status,
  isDemo: false,
  minutes: status === "done" ? { summary: "議事録" } : null,
  ...extra,
});

test("既存完了会議は自動提案せず、処理中から完了になった会議を1回だけ通知する", () => {
  const tracker = createTagCompletionTracker();
  assert.deepEqual(
    tracker.observe([meeting("old", "done"), meeting("new", "transcribing")]),
    [],
  );
  assert.deepEqual(
    tracker.observe([meeting("old", "done"), meeting("new", "analyzing")]),
    [],
  );
  const completed = [meeting("old", "done"), meeting("new", "done")];
  assert.deepEqual(tracker.observe(completed), [{ id: "new", key: "new:1" }]);
  assert.deepEqual(tracker.observe(completed), []);
  assert.deepEqual(
    tracker.observe(completed.map((m) => ({ ...m, tags: ["手動タグ"] }))),
    [],
  );
});

test("高速完了・複数会議・再解析を扱い、失敗・サンプル・未生成は除外する", () => {
  const tracker = createTagCompletionTracker();
  tracker.expect("fast");
  assert.deepEqual(tracker.observe([meeting("fast", "done")]), [
    { id: "fast", key: "fast:1" },
  ]);
  tracker.observe([
    meeting("fast", "analyzing"),
    meeting("two", "uploading"),
    meeting("demo", "analyzing", { isDemo: true }),
    meeting("error", "analyzing"),
    meeting("empty", "analyzing"),
  ]);
  assert.deepEqual(
    tracker.observe([
      meeting("fast", "done"),
      meeting("two", "done"),
      meeting("demo", "done", { isDemo: true }),
      meeting("error", "error"),
      meeting("empty", "done", { minutes: null }),
    ]),
    [
      { id: "fast", key: "fast:2" },
      { id: "two", key: "two:1" },
    ],
  );
  assert.equal(tracker.key("fast"), "fast:2");
  tracker.observe([]);
  assert.deepEqual(tracker.observe([meeting("fast", "done")]), []);
});

test("同じ完了の候補は再表示・二重effectでも1回だけ生成し、失敗時も自動再送しない", async () => {
  const cached = createTagSuggestionCache();
  let calls = 0;
  const generate = async () => {
    calls++;
    return ["候補"];
  };
  assert.deepEqual(
    await Promise.all([cached("a:1", generate), cached("a:1", generate)]),
    [["候補"], ["候補"]],
  );
  await cached("a:1", generate);
  assert.equal(calls, 1);
  await cached("a:2", generate);
  assert.equal(calls, 2);
  const fail = async () => {
    calls++;
    throw new Error("通信失敗");
  };
  await assert.rejects(cached("b:1", fail));
  await assert.rejects(cached("b:1", fail));
  assert.equal(calls, 3);
  await cached("b:1", generate, true);
  assert.equal(calls, 4);
});
