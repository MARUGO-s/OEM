import { test } from "node:test";
import assert from "node:assert/strict";
import {
  periodMeetings,
  parseInsight,
  insightRequest,
  summaryRange,
  SummaryRequest,
} from "../supabase/functions/_shared/insights.mjs";
import {
  exportMultipleMeetings,
  exportToICS,
} from "../src/meeting-exports.mjs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SummaryMarkdown } from "../src/SummaryMarkdown.mjs";

test("先月は年越し・閏年・日本時間の月境界を正しく扱う", () => {
  assert.deepEqual(
    summaryRange("lastMonth", new Date("2025-12-31T15:00:00Z")),
    { start: "2025-12-01", end: "2025-12-31" },
  );
  assert.deepEqual(
    summaryRange("lastMonth", new Date("2024-02-29T15:00:00Z")),
    { start: "2024-02-01", end: "2024-02-29" },
  );
  assert.deepEqual(
    summaryRange("lastMonth", new Date("2026-02-28T15:00:00Z")),
    { start: "2026-02-01", end: "2026-02-28" },
  );
});
test("指定期間は両端を含み、欠落・逆転・無効日・未来日を拒否する", () => {
  const now = new Date("2026-09-28T00:00:00Z");
  const selection = {
    period: "custom",
    start: "2026-08-31",
    end: "2026-09-02",
  };
  const meetings = [
    "2026-08-30",
    "2026-08-31",
    "2026-09-01",
    "2026-09-02",
    "2026-09-03",
  ].map((date) => ({ date, status: "done" }));
  assert.equal(periodMeetings(meetings, selection, now).meetings.length, 3);
  assert.equal(
    periodMeetings(meetings, { ...selection, start: selection.end }, now)
      .meetings.length,
    1,
  );
  for (const bad of [
    { period: "custom" },
    { ...selection, start: "2026-02-30" },
    { ...selection, start: "2026-09-03" },
    { period: "month", start: selection.start },
    { ...selection, end: "2026-09-29" },
  ]) {
    assert.throws(() => summaryRange(bad, now));
  }
  assert.equal(SummaryRequest.safeParse({ period: "lastMonth" }).success, true);
});
test("サマリーを見出し・段落・リスト・太字にし、AIのHTMLを実行しない", () => {
  const html = renderToStaticMarkup(
    createElement(SummaryMarkdown, {
      content:
        "## 要約\n\n全体の概観。\n\n### 定例会議\n短い段落。\n続きの文。\n\n## 決定事項\n- **担当：田中**\n  補足。\n- __期限：月末__\n\n1. 確認する\n2. `共有`する\n\n<script>alert(1)</script>\n<img src=x onerror=alert(1)>",
    }),
  );
  assert.match(html, /<h4>要約<\/h4>/);
  assert.match(html, /<h5>定例会議<\/h5>/);
  assert.match(html, /<p>短い段落。\n続きの文。<\/p>/);
  assert.match(html, /<ul><li><strong>担当：田中<\/strong>\n補足。<\/li>/);
  assert.match(html, /<ol><li>確認する<\/li>/);
  assert.match(html, /<code>共有<\/code>/);
  assert.ok(!html.includes("<script>") && !html.includes("<img"));
  assert.ok(!html.includes("**担当"));
  const unfinished = renderToStaticMarkup(createElement(SummaryMarkdown, { content: "**閉じていない強調\n\n`" }));
  assert.match(unfinished, /\*\*閉じていない強調/);
  assert.match(unfinished, /<p>`<\/p>/);
});

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
