import { test } from "node:test";
import assert from "node:assert/strict";
import {
  validDate,
  monthDays,
  addDays,
  legacyDate,
  normalizeScheduleEvents,
  meetingEvents,
  allCalendarEvents,
  hiddenCalendarEvents,
  eventKey,
  calendarChange,
  calendarHide,
  calendarRestore,
  CalendarEditSchema,
  occursOn,
  overlapsMonth,
} from "../supabase/functions/_shared/calendar.mjs";
import {
  CalendarMinutesSchema,
  parseMinutes,
  summaryInput,
} from "../supabase/functions/_shared/summary.mjs";
import {
  calendarEvent as event,
  calendarMeeting,
  editFields,
} from "./fixtures/calendar.mjs";

test("カレンダーの日付・閏年・年境界・月曜始まり・包含範囲", () => {
  assert.equal(validDate("2024-02-29"), true);
  for (const date of [
    "2026-02-29",
    "2026-04-31",
    "2200-01-01",
    "1899-12-31",
    "bad",
  ])
    assert.equal(validDate(date), false);
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
  const cells = monthDays("2026-02");
  assert.equal(cells.length, 42);
  assert.equal(cells[0], "2026-01-26");
  assert.equal(cells[41], "2026-03-08");
  const range = { date: "2026-09-29", endDate: "2026-10-02" };
  assert.equal(occursOn(range, "2026-10-02"), true);
  assert.equal(occursOn(range, "2026-10-03"), false);
  assert.equal(overlapsMonth(range, "2026-10"), true);
  assert.equal(overlapsMonth(range, "2026-11"), false);
});
test("旧議事録は確定せず、曖昧・複数日・繰り返しは日付未定", () => {
  assert.equal(legacyDate("１０月１５日まで", "2026-09-23"), "2026-10-15");
  for (const text of [
    "来週までに提出",
    "月末",
    "毎月10月15日",
    "10月1日から10月15日",
    "2月30日",
  ])
    assert.equal(legacyDate(text, "2026-09-23"), null);
  const m = calendarMeeting();
  delete m.minutes.scheduleEvents;
  m.minutes.decisions = ["10月15日に開催"];
  m.minutes.actions = [{ task: "資料提出", owner: "佐藤", due: "来週まで" }];
  const result = meetingEvents(m);
  assert.equal(result.length, 2);
  assert.ok(result.every((e) => e.status === "needs_confirmation" && e.legacy));
  assert.equal(result[1].date, null);
});
test("AIの会話根拠と日付矛盾、資料のみの合意を検証", () => {
  const m = calendarMeeting();
  assert.deepEqual(normalizeScheduleEvents(m, [event]), [event]);
  for (const change of [
    { evidence: "存在しない発言" },
    { date: "2026-02-30" },
    { date: "2026-10-16" },
    { dateText: "来週までに提出" },
    { dateText: "月末" },
    { dateText: "毎週金曜" },
  ]) {
    const [e] = normalizeScheduleEvents(m, [{ ...event, ...change }]);
    assert.equal(e.date, null);
    assert.equal(e.status, "needs_confirmation");
    assert.equal(e.startTime, null);
  }
  const doc = { ...event, source: "document", attachmentId: "doc" };
  assert.equal(normalizeScheduleEvents(m, [doc])[0].date, null);
  assert.equal(
    normalizeScheduleEvents({ ...m, attachments: [{ id: "doc" }] }, [doc])[0]
      .status,
    "tentative",
  );
  const [tomorrow] = normalizeScheduleEvents(m, [
    { ...event, dateText: "明日", date: "2026-09-24" },
  ]);
  assert.equal(tomorrow.date, "2026-09-24");
  assert.equal(
    normalizeScheduleEvents(m, [
      { ...event, dateText: "明日", date: "2026-09-25" },
    ])[0].date,
    null,
  );
});
test("手動変更は再解析・並び替え・元の予定削除後も残り、確認して保存できる", () => {
  const m = calendarMeeting(),
    id = eventKey(event),
    edit = { ...editFields(event), date: "2026-10-16", owner: "田中" };
  m.calendarOverrides = { [id]: calendarChange(m, id, edit) };
  const originalMarkdown = m.markdown;
  assert.equal(meetingEvents(m)[0].date, "2026-10-16");
  assert.equal(meetingEvents(m)[0].original.date, "2026-10-15");
  m.minutes.scheduleEvents = [{ ...event, title: "別の会議" }, event];
  assert.equal(meetingEvents(m).find((e) => e.id === id).owner, "田中");
  m.minutes.scheduleEvents = [];
  let e = meetingEvents(m)[0];
  assert.equal(e.orphan, true);
  assert.equal(e.date, "2026-10-16");
  assert.equal(e.status, "needs_confirmation");
  m.calendarOverrides[id] = calendarChange(m, id, edit);
  e = meetingEvents(m)[0];
  assert.equal(e.status, "confirmed");
  assert.equal(m.markdown, originalMarkdown);
  assert.equal(allCalendarEvents([{ ...m, isDemo: true }]).length, 0);
  m.minutesStale = true;
  assert.equal(meetingEvents(m)[0].status, "needs_confirmation");
  assert.throws(
    () => calendarChange(m, "0000000000000000", edit),
    /予定が見つかりません/,
  );
});
test("予定の削除は根拠を保ったまま非表示にし、再生成後も復元できる", () => {
  const meeting = calendarMeeting();
  const id = eventKey(event);
  meeting.calendarOverrides = { [id]: calendarHide(meeting, id) };
  assert.equal(meetingEvents(meeting).length, 0);
  assert.equal(hiddenCalendarEvents([meeting])[0].title, event.title);
  assert.equal(meeting.minutes.scheduleEvents.length, 1, "AI抽出結果は消さない");
  meeting.minutes = { ...meeting.minutes, summary: "再生成した要約" };
  assert.equal(meetingEvents(meeting).length, 0);
  assert.equal(calendarRestore(meeting, id), null);
  delete meeting.calendarOverrides[id];
  assert.equal(meetingEvents(meeting).length, 1);

  meeting.calendarOverrides = { [id]: calendarChange(meeting, id, {
    ...editFields(event), title: "手動で直した予定",
  }) };
  meeting.calendarOverrides[id] = calendarHide(meeting, id);
  assert.equal(meetingEvents(meeting).length, 0);
  meeting.calendarOverrides[id] = calendarRestore(meeting, id);
  assert.equal(meetingEvents(meeting)[0].title, "手動で直した予定");

  meeting.calendarOverrides[id] = calendarHide(meeting, id);
  meeting.minutes.scheduleEvents = [];
  meeting.calendarOverrides[id] = calendarRestore(meeting, id);
  assert.equal(meetingEvents(meeting)[0].orphan, true);
  assert.throws(() => calendarRestore(meeting, id), /予定が見つかりません/);
});
test("編集値の検証と厳密なフィールド制限", () => {
  const edit = editFields(event);
  assert.deepEqual(CalendarEditSchema.parse(edit), edit);
  for (const change of [
    { date: "2026-02-29" },
    { endDate: "2026-10-14" },
    { endTime: "13:00" },
    { startTime: "24:00" },
    { date: null },
    { title: " " },
    { evidence: "改ざん" },
  ])
    assert.equal(
      CalendarEditSchema.safeParse({ ...edit, ...change }).success,
      false,
    );
  assert.equal(
    CalendarEditSchema.safeParse({
      ...edit,
      endDate: "2026-10-16",
      startTime: "23:00",
      endTime: "01:00",
    }).success,
    true,
  );
  assert.equal(
    CalendarEditSchema.safeParse({
      ...edit,
      date: null,
      endDate: null,
      startTime: null,
      endTime: null,
      status: "needs_confirmation",
    }).success,
    true,
  );
});
test("予定の構造化スキーマ・旧API実行中の結果との互換", () => {
  const m = calendarMeeting();
  assert.ok(CalendarMinutesSchema.shape.scheduleEvents);
  assert.match(summaryInput(m)[0].content, /来週まで/);
  assert.deepEqual(parseMinutes(m, m.minutes).scheduleEvents, [event]);
  delete m.minutes.scheduleEvents;
  assert.equal(
    Object.hasOwn(parseMinutes(m, m.minutes), "scheduleEvents"),
    false,
  );
});
