// Explicit live verification: ONE billable summary of synthetic conversation.
// Credentials via hidden stdin; saved OpenAI key stays inside the Edge Function.
import assert from "node:assert/strict";
import { setTimeout } from "node:timers/promises";
import { meetingEvents } from "../supabase/functions/_shared/calendar.mjs";
import { editFields } from "../tests/fixtures/calendar.mjs";
if (process.stdin.isTTY) process.stdin.setRawMode(true);
const credentials = await new Promise((resolve) => {
  let text = "";
  process.stdin.on("data", (chunk) => {
    text += chunk.toString();
    if (/[\r\n]/.test(text)) {
      process.stdin.pause();
      if (process.stdin.isTTY) process.stdin.setRawMode(false);
      resolve(text.trim());
    }
  });
  process.stdin.on("end", () => resolve(text.trim()));
});
const base =
    "https://hjhkccbktkscwtgzxjfq.supabase.co/functions/v1/kotonoha-api",
  tokens = [];
let meeting;
const call = (route, options = {}, token = tokens[0]) =>
  fetch(base + route, {
    ...options,
    headers: {
      Origin: "https://marugo-s.github.io",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.body instanceof FormData
        ? {}
        : { "Content-Type": "application/json" }),
    },
    signal: AbortSignal.timeout(60000),
  });
const patch = (value) => ({ method: "PATCH", body: JSON.stringify(value) });
try {
  for (let n = 0; n < 2; n++) {
    const r = await call(
      "/auth/login",
      { method: "POST", body: credentials },
      null,
    );
    assert.equal(r.status, 200);
    tokens.push((await r.json()).token);
  }
  const config = await (await call("/settings")).json();
  assert.ok(config.configured);
  const body = new FormData();
  body.set("title", "検証用・カレンダーと本文編集（架空）");
  body.set("date", "2026-09-23");
  body.set(
    "transcript",
    "田中：10月1日の旧日程は中止です。検証打合せは2026年10月15日14時から15時、本社会議室で行うことに決定します。担当は佐藤さんです。佐藤：承知しました。企画書は明日の9月24日までに田中さんが提出することで決定しました。田中：はい。取引先訪問は来週までに日程を調整しますが、開催日は未定です。鈴木：パッケージ確認会を2026年10月18日に開催する案を提案します。田中：その案はまだ決定せず、次回検討します。",
  );
  const created = await call("/meetings", { method: "POST", body });
  assert.equal(created.status, 202, await created.clone().text());
  meeting = await created.json();
  console.log(
    JSON.stringify({ testMeetingId: meeting.id, model: config.model }),
  );
  for (let n = 0; n < 72 && !["done", "error"].includes(meeting.status); n++) {
    await setTimeout(5000);
    const r = await call("/meetings", {}, tokens[1]);
    assert.equal(r.status, 200);
    meeting = (await r.json()).find((m) => m.id === meeting.id);
    assert.ok(meeting);
    if (n % 6 === 0)
      console.log(
        JSON.stringify({ status: meeting.status, elapsedSeconds: (n + 1) * 5 }),
      );
  }
  assert.equal(
    meeting.status,
    "done",
    meeting.error || "AI completion timed out",
  );
  console.log(
    JSON.stringify({ events: meeting.minutes.scheduleEvents }, null, 2),
  );
  const events = meetingEvents(meeting),
    confirmed = events.find(
      (e) => e.date === "2026-10-15" && e.status === "confirmed",
    ),
    deadline = events.find(
      (e) => e.kind === "deadline" && e.date === "2026-09-24",
    );
  assert.ok(confirmed);
  assert.equal(confirmed.startTime, "14:00");
  assert.equal(confirmed.endTime, "15:00");
  assert.match(confirmed.location, /本社/);
  assert.ok(deadline);
  assert.ok(events.some((e) => !e.date && e.status === "needs_confirmation"));
  assert.ok(
    events.some((e) => e.date === "2026-10-18" && e.status === "tentative"),
  );
  assert.ok(!events.some((e) => e.date === "2026-10-01"));
  const route = `/meetings/${meeting.id}`,
    edit = {
      ...editFields(confirmed),
      date: "2026-10-16",
      owner: "検証担当",
      location: "オンライン検証",
    };
  assert.equal(
    (await call(`${route}/calendar/${confirmed.id}`, patch(edit), null)).status,
    401,
  );
  // Two distinct events updated by separate sessions; neither may clobber the other.
  for (const [e, value, token] of [
    [confirmed, edit, tokens[0]],
    [deadline, { ...editFields(deadline), date: "2026-09-25" }, tokens[1]],
  ]) {
    const r = await call(`${route}/calendar/${e.id}`, patch(value), token);
    assert.equal(r.status, 200, await r.clone().text());
  }
  let shared = await (await call(route, {}, tokens[1])).json();
  assert.equal(shared.calendarOverrides[confirmed.id].event.date, "2026-10-16");
  assert.equal(shared.calendarOverrides[deadline.id].event.date, "2026-09-25");
  assert.equal(
    shared.calendarOverrides[confirmed.id].original.date,
    "2026-10-15",
  );
  assert.equal(
    (
      await call(
        route,
        patch({ markdown: "# 手動修正の議事録\n共有保存の動作検証です。" }),
        tokens[1],
      )
    ).status,
    200,
  );
  shared = await (await call(route)).json();
  assert.match(shared.markdown, /手動修正/);
  assert.equal(shared.calendarOverrides[confirmed.id].event.date, "2026-10-16");
  assert.equal(
    (
      await call(
        `${route}/calendar/${confirmed.id}`,
        patch({ ...edit, date: "2026-02-30" }),
      )
    ).status,
    400,
  );
  assert.equal(
    (await call(`${route}/calendar/0000000000000000`, patch(edit))).status,
    404,
  );
  assert.equal(
    (
      await call(
        `${route}/calendar/${confirmed.id}`,
        { method: "DELETE" },
        tokens[1],
      )
    ).status,
    200,
  );
  shared = await (await call(route)).json();
  assert.equal(shared.calendarOverrides[confirmed.id], undefined);
  assert.equal(shared.calendarOverrides[deadline.id].event.date, "2026-09-25");
  console.log(
    JSON.stringify({
      passed: true,
      realAiDates: true,
      sharedManualEdits: true,
      independentEvents: true,
      bodySaved: true,
      originalPreserved: true,
      resetOnlyOne: true,
    }),
  );
} finally {
  if (meeting && ["done", "error", "uploading"].includes(meeting.status)) {
    assert.equal(
      (await call(`/meetings/${meeting.id}`, { method: "DELETE" })).status,
      204,
    );
    console.log(
      "Synthetic meeting soft-deleted (recoverable). No original user records changed.",
    );
  }
  for (const token of tokens)
    await call("/auth/logout", { method: "POST" }, token);
}
