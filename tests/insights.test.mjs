import { test } from "node:test";
import assert from "node:assert/strict";
import {
  periodMeetings,
  parseInsight,
  insightRequest,
} from "../supabase/functions/_shared/insights.mjs";
import {
  exportMultipleMeetings,
  exportToICS,
} from "../src/meeting-exports.mjs";

test("期間サマリーは日本時間の日境界・7日間・実会議だけを含む", () => {
  const meetings = ["2026-09-24", "2026-09-25", "2026-10-01", "2026-10-02"].map(
    (date) => ({ date, status: "done" }),
  );
  meetings.push(
    { date: "2026-10-01", status: "done", isDemo: true },
    { date: "2026-10-01", status: "error" },
  );
  const now = new Date("2026-09-30T15:00:00Z");
  assert.deepEqual(
    periodMeetings(meetings, "week", now).meetings.map((m) => m.date),
    ["2026-09-25", "2026-10-01"],
  );
  assert.deepEqual(
    periodMeetings(meetings, "month", now).meetings.map((m) => m.date),
    ["2026-10-01"],
  );
});
test("AI不完全・不正形式は成功扱いせず、完了済み作業も入力へ渡す", () => {
  const response = (text) => ({
    status: "completed",
    output: [{ type: "message", content: [{ type: "output_text", text }] }],
  });
  assert.throws(() =>
    parseInsight({ ...response("partial"), status: "incomplete" }, "summary"),
  );
  assert.throws(() => parseInsight(response('{"tags":"文字列"}'), "tags"));
  assert.deepEqual(parseInsight(response('{"tags":["企画","企画"]}'), "tags"), {
    tags: ["企画"],
  });
  const request = insightRequest("gpt-6-luna", "summary", [
    {
      markdown: "手動本文",
      minutes: { actions: [{ task: "確認" }] },
      completedActions: [0],
    },
  ]);
  assert.equal(
    JSON.parse(request.input[1].content).meetings[0].actions[0].completed,
    true,
  );
  assert.throws(() =>
    insightRequest("gpt-6-luna", "summary", [{ markdown: "a".repeat(100001) }]),
  );
});
test("一括出力は手動編集本文を保持し、ICSは日時を捏造せず改行と日本語を保持", () => {
  const meeting = {
    id: "test",
    date: "2026-12-31",
    title: "会議,企画;確認\n次の行".repeat(15),
    participants: "田中",
    markdown: "# 修正済み\n決定事項と詳細",
    minutes: { summary: "要約" },
  };
  assert.match(exportMultipleMeetings([meeting], "markdown"), /決定事項と詳細/);
  const ics = exportToICS([meeting]);
  assert.match(ics, /DTSTART;VALUE=DATE:20261231/);
  assert.match(ics, /DTEND;VALUE=DATE:20270101/);
  assert.ok(!ics.includes("T090000"));
  assert.ok(ics.split("\r\n").every((line) => Buffer.byteLength(line) <= 75));
  assert.match(ics.replace(/\r\n /g, ""), /会議\\,企画\\;確認\\n次の行/);
});
