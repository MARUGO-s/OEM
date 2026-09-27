import { test } from "node:test";
import assert from "node:assert/strict";
import { meetingDuration, durationStats, formatDuration } from "../supabase/functions/_shared/duration.mjs";

test("既存の分割音声の時間を合計し、保存済み合計がなくても表示できる", () => {
  const meeting = { duration: null, uploadPlan: [{}, {}], audioParts: [{ duration: 600 }, { duration: 33.626122 }] };
  assert.equal(meetingDuration(meeting), 633.626122);
  assert.equal(formatDuration(meetingDuration(meeting)), "10分34秒");
  assert.equal(meetingDuration({ ...meeting, duration: 600 }), 633.626122);
  assert.equal(meeting.duration, null); // Read-only; no migration/re-analysis needed.
  assert.equal(meetingDuration({ duration: 125 }), 125);
});

test("未完了アップロード・一部欠落・無効値を合計時間と誤認しない", () => {
  assert.equal(meetingDuration({ uploadPlan: [{}, {}], audioParts: [{ duration: 600 }] }), null);
  for (const duration of [undefined, null, 0, -1, NaN, Infinity, "600"]) {
    assert.equal(meetingDuration({ duration }), null);
    assert.equal(meetingDuration({ audioParts: [{ duration: 600 }, { duration }] }), null);
  }
  assert.equal(meetingDuration({ audioParts: [] }), null);
  assert.equal(meetingDuration({ duration: 120, audioParts: [{}] }), 120);
});

test("未取得の会議は平均の分母から除外し、全件未取得はゼロにしない", () => {
  assert.deepEqual(durationStats([600, null, 1200, 0, undefined]), { total: 1800, average: 900, knownCount: 2, unknownCount: 3 });
  assert.deepEqual(durationStats([null, null]), { total: null, average: null, knownCount: 0, unknownCount: 2 });
  assert.equal(durationStats([]).average, null);
  assert.equal(formatDuration(null), "未取得");
  assert.equal(formatDuration(0), "未取得");
  assert.equal(formatDuration(0.1), "1秒");
  assert.equal(formatDuration(59.9), "1分");
  assert.equal(formatDuration(1389.435646), "23分9秒");
  assert.equal(formatDuration(3661), "1時間1分1秒");
});
