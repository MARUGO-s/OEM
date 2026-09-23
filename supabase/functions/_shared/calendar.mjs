import { z } from "zod";

export const calendarPrompt = `\nカレンダー用のscheduleEventsに会議で言及された予定と作業期限を1件ずつ保存する。titleは予定名、kindはevent（行事・打合せ・公開等）またはdeadline（作業期限）。会話で合意済みの予定はconfirmed、候補・提案・資料だけの記載はtentative、日付や合意が不明なものはneeds_confirmation。変更前・中止済み・却下された日程を有効な予定として重複登録しない。単なる過去の出来事や、日付のない一般論は登録しない。作業期限が未定ならdate=null。会議そのものの開催日は新しい予定として登録しない。
date/endDateはYYYY-MM-DD、startTime/endTimeは24時間HH:mm。時刻がない場合はnullで、午前0時を補わない。日をまたぐ場合はendDateも設定する。期間の終了日は含む。単日のendDateはnull。年のない月日は入力の会議日から一意に判断できる場合だけ年を補う。明日・明後日など一意の相対日付は会議日を基準に解決するが、来週まで・月末・上旬・毎週など特定の1日でない表現は勝手に1日を選ばずdate=null,status=needs_confirmation。年跨ぎ・候補が複数・曜日が矛盾する場合も要確認。時刻は日本時間。外国のタイムゾーンが明記された予定は変換を推測せず日付要確認とし原文を残す。
dateTextには元の日付表現をそのまま保存する。owner/locationは明示された担当者・場所だけ（なければ空文字）。sourceはconversationかdocument。資料由来のみならattachmentIdを指定、会話由来ならnull。evidenceは根拠になる元の会話または資料から連続した短い一節をそのまま引用（要約・省略・話者の補完は禁止）。会話にない合意や時刻・場所を創作しない。該当する予定がなければscheduleEvents=[]。同一の予定を決定事項とアクションから二重登録しない。`;

export const ScheduleEventSchema = z.object({
  title: z.string(),
  kind: z.enum(["event", "deadline"]),
  date: z.string().nullable(),
  endDate: z.string().nullable(),
  startTime: z.string().nullable(),
  endTime: z.string().nullable(),
  dateText: z.string(),
  status: z.enum(["confirmed", "tentative", "needs_confirmation"]),
  source: z.enum(["conversation", "document"]),
  attachmentId: z.string().nullable(),
  location: z.string(),
  owner: z.string(),
  evidence: z.string(),
});
export const validDate = (value) =>
  typeof value === "string" &&
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  value >= "1900-01-01" &&
  value <= "2199-12-31" &&
  !Number.isNaN(Date.parse(value + "T00:00:00Z")) &&
  new Date(value + "T00:00:00Z").toISOString().slice(0, 10) === value;
const validTime = (value) =>
  typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
export const addDays = (date, days) =>
  new Date(Date.parse(date + "T12:00:00Z") + days * 86400000)
    .toISOString()
    .slice(0, 10);
export const tokyoToday = () =>
  new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo" }).format(
    new Date(),
  );
export const shortDate = (date) =>
  new Intl.DateTimeFormat("ja-JP", {
    month: "long",
    day: "numeric",
    weekday: "short",
    timeZone: "Asia/Tokyo",
  }).format(new Date(date + "T00:00:00Z"));
export const statusLabels = {
  confirmed: "確定",
  tentative: "予定案",
  needs_confirmation: "要確認",
};
export const kindLabels = { event: "予定", deadline: "期限" };
const ambiguousDate =
  /未定|頃|ごろ|上旬|中旬|下旬|毎週|毎月|毎年|調整中|月末|週末|[米英]国時間|現地時間|PST|PDT|EST|EDT/;
const vagueRelative =
  /(?:今週|来週|再来週|今月|来月|再来月)(?:中|末|まで)|年内|年度内|^(?:今週|来週|再来週|今月|来月|再来月)$/;
const dateHint =
  /\d{1,4}[年/.-]\d|\d{1,2}月\d{1,2}日|明日|明後日|来週|今週|来月|月末|未定|毎週/;
const compact = (s) => String(s || "").replace(/\s/g, "");
// Stable IDs do not depend on order or generated normalized dates. Never use a
// positional ID: regeneration can reorder/delete entries with manual changes.
export function fingerprint(value) {
  const text = JSON.stringify(value);
  let a = 2166136261,
    b = 2246822507;
  for (let i = 0; i < text.length; i++) {
    a = Math.imul(a ^ text.charCodeAt(i), 16777619);
    b = Math.imul(b ^ text.charCodeAt(i), 3266489909);
  }
  return (
    (a >>> 0).toString(16).padStart(8, "0") +
    (b >>> 0).toString(16).padStart(8, "0")
  );
}
export const eventKey = (e) =>
  fingerprint([
    e.source,
    e.kind,
    e.title,
    e.dateText,
    e.evidence,
    e.attachmentId,
  ]);
export function normalizeScheduleEvents(meeting, events) {
  return events.slice(0, 200).map((event) => {
    let e = { ...event };
    if (
      !validDate(e.date) ||
      ambiguousDate.test(e.dateText) ||
      vagueRelative.test(e.dateText.trim())
    )
      e = { ...e, date: null, endDate: null, status: "needs_confirmation" };
    // Reject a normalized start date that contradicts a single explicit date or
    // an unambiguous relative day. Other expressions remain AI interpreted.
    const explicit = legacyDate(e.dateText, meeting.date);
    const relative =
      validDate(meeting.date) &&
      (/明後日/.test(e.dateText)
        ? addDays(meeting.date, 2)
        : /明日/.test(e.dateText)
          ? addDays(meeting.date, 1)
          : null);
    if (
      e.date &&
      ((explicit && explicit !== e.date) || (relative && relative !== e.date))
    )
      e = { ...e, date: null, endDate: null, status: "needs_confirmation" };
    if (e.source === "document") {
      if (!meeting.attachments?.some((f) => f.id === e.attachmentId))
        e = { ...e, date: null, endDate: null, status: "needs_confirmation" };
      else if (e.status === "confirmed") e.status = "tentative";
    } else if (
      !compact(e.evidence) ||
      !compact(meeting.transcript).includes(compact(e.evidence))
    )
      e = { ...e, date: null, endDate: null, status: "needs_confirmation" };
    if (e.endDate && (!validDate(e.endDate) || !e.date || e.endDate < e.date))
      e = { ...e, endDate: null, status: "needs_confirmation" };
    if (e.startTime && !validTime(e.startTime))
      e = { ...e, startTime: null, status: "needs_confirmation" };
    if (
      e.endTime &&
      (!validTime(e.endTime) ||
        !e.startTime ||
        ((!e.endDate || e.endDate === e.date) && e.endTime <= e.startTime))
    )
      e = { ...e, endTime: null, status: "needs_confirmation" };
    if (!e.date) e = { ...e, startTime: null, endTime: null };
    return e;
  });
}
export const CalendarEditSchema = z
  .object({
    title: z.string().trim().min(1).max(300),
    kind: z.enum(["event", "deadline"]),
    date: z.iso.date().nullable(),
    endDate: z.iso.date().nullable(),
    startTime: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
      .nullable(),
    endTime: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
      .nullable(),
    status: z.enum(["confirmed", "tentative", "needs_confirmation"]),
    location: z.string().trim().max(300),
    owner: z.string().trim().max(200),
  })
  .strict()
  .superRefine((e, ctx) => {
    const bad = (message) => ctx.addIssue({ code: "custom", message });
    if (e.date && !validDate(e.date))
      bad("日付は1900年から2199年の範囲で入力してください。");
    if (
      !e.date &&
      (e.status !== "needs_confirmation" ||
        e.endDate ||
        e.startTime ||
        e.endTime)
    )
      bad("日付未定の場合は「要確認」にし、終了日・時刻を空欄にしてください。");
    if (e.endDate && (!validDate(e.endDate) || e.endDate < e.date))
      bad("終了日は開始日以降にしてください。");
    if (
      e.endTime &&
      (!e.startTime ||
        ((!e.endDate || e.endDate === e.date) && e.endTime <= e.startTime))
    )
      bad(
        "終了時刻は開始時刻より後にしてください。日をまたぐ予定は終了日も入力してください。",
      );
  });

// Conservative compatibility view: existing notes are never silently approved.
export function legacyDate(text, meetingDate) {
  const s = String(text || "").normalize("NFKC");
  if (ambiguousDate.test(s) || vagueRelative.test(s.trim())) return null;
  const matches = [
    ...s.matchAll(/(?:(\d{4})[年/.-])?(\d{1,2})[月/.-](\d{1,2})日?/g),
  ];
  if (matches.length !== 1) return null;
  const [, year, month, day] = matches[0];
  if (!year && !validDate(meetingDate)) return null;
  const date = `${year || meetingDate.slice(0, 4)}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  return validDate(date) ? date : null;
}
export function legacyEvents(meeting) {
  const defaults = {
    endDate: null,
    startTime: null,
    endTime: null,
    status: "needs_confirmation",
    source: "conversation",
    attachmentId: null,
    location: "",
    owner: "",
  };
  const decisions = (meeting.minutes?.decisions || [])
    .filter((s) => dateHint.test(s))
    .map((title) => ({
      ...defaults,
      title,
      kind: "event",
      date: legacyDate(title, meeting.date),
      dateText: title,
      evidence: title,
    }));
  const actions = (meeting.minutes?.actions || []).map((a) => ({
    ...defaults,
    title: a.task,
    kind: "deadline",
    date: legacyDate(a.due, meeting.date),
    dateText: a.due || "未定",
    owner: a.owner,
    evidence: `${a.task}（期限：${a.due}）`,
  }));
  return [...decisions, ...actions].slice(0, 200);
}
export function meetingEvents(meeting) {
  if (!meeting.minutes) return [];
  const legacy = !Array.isArray(meeting.minutes.scheduleEvents);
  const base = legacy ? legacyEvents(meeting) : meeting.minutes.scheduleEvents;
  const overrides = meeting.calendarOverrides || {};
  const version = fingerprint(meeting.minutes);
  const seen = new Set();
  const wrap = (original, id, orphan = false) => {
    const override = overrides[id];
    let event = { ...original, ...override?.event };
    const notes = [];
    const needsReview = orphan && override?.analysisVersion !== version;
    if (legacy && !override)
      notes.push(
        "以前の議事録から拾った候補です。年は会議の年を補っています。内容を確認して日付を保存してください。",
      );
    if (orphan)
      notes.push(
        "再解析で元の予定が変わりました。手動変更は保持しています。元の会議と照合してください。",
      );
    if (meeting.minutesStale)
      notes.push("会話または資料の変更が、議事録にまだ反映されていません。");
    if (
      needsReview ||
      meeting.minutesStale ||
      ["transcribing", "analyzing"].includes(meeting.status)
    )
      event.status = "needs_confirmation";
    if (!validDate(event.date))
      event = {
        ...event,
        date: null,
        endDate: null,
        startTime: null,
        endTime: null,
        status: "needs_confirmation",
      };
    const attachment = meeting.attachments?.find(
      (f) => f.id === original.attachmentId,
    );
    return {
      ...event,
      id,
      meetingId: meeting.id,
      meetingTitle: meeting.title,
      meetingDate: meeting.date,
      manual: Boolean(override),
      legacy,
      orphan,
      notes,
      original,
      sourceName: attachment?.name || "会話",
      updatedAt: override?.updatedAt || null,
    };
  };
  const events = base.flatMap((original) => {
    const id = eventKey(original);
    if (seen.has(id)) return [];
    seen.add(id);
    if (overrides[id]?.deleted) return [];
    return [wrap(original, id)];
  });
  for (const [id, override] of Object.entries(overrides))
    if (!seen.has(id) && override?.original && !override.deleted)
      events.push(wrap(override.original, id, true));
  return events;
}
export const allCalendarEvents = (meetings) =>
  meetings.filter((m) => !m.isDemo).flatMap(meetingEvents);
export const hiddenCalendarEvents = (meetings) =>
  meetings.filter((m) => !m.isDemo).flatMap((meeting) =>
    Object.entries(meeting.calendarOverrides || {}).flatMap(([id, value]) =>
      value?.deleted && value.original
        ? [{ id, meetingId: meeting.id, meetingTitle: meeting.title,
          title: value.event?.title || value.original.title,
          hiddenAt: value.updatedAt }]
        : [],
    ),
  );
export const occursOn = (event, date) =>
  Boolean(
    event.date && event.date <= date && (event.endDate || event.date) >= date,
  );
export const overlapsMonth = (event, month) =>
  Boolean(
    event.date &&
    event.date <= `${month}-31` &&
    (event.endDate || event.date) >= `${month}-01`,
  );
export function monthDays(month) {
  const first = month + "-01";
  if (!validDate(first)) return [];
  const offset = (new Date(first + "T12:00:00Z").getUTCDay() + 6) % 7;
  return Array.from({ length: 42 }, (_, i) => addDays(first, i - offset));
}
export function calendarChange(meeting, id, input) {
  const event = meetingEvents(meeting).find((e) => e.id === id);
  if (!event) throw missingEvent();
  return {
    event: CalendarEditSchema.parse(input),
    original: event.original,
    analysisVersion: fingerprint(meeting.minutes),
    updatedAt: new Date().toISOString(),
  };
}
const missingEvent = () => Object.assign(
  new Error("予定が見つかりません。画面を更新してください。"),
  { status: 404, publicMessage: "予定が見つかりません。画面を更新してください。" },
);
export function calendarHide(meeting, id) {
  const previous = meeting.calendarOverrides?.[id];
  if (previous?.deleted) return previous;
  const event = meetingEvents(meeting).find((entry) => entry.id === id);
  if (!event) throw missingEvent();
  return {
    ...(previous || {
      original: event.original,
      analysisVersion: fingerprint(meeting.minutes),
    }),
    deleted: true,
    updatedAt: new Date().toISOString(),
  };
}
export function calendarRestore(meeting, id) {
  const hidden = meeting.calendarOverrides?.[id];
  if (!hidden?.deleted || !hidden.original) throw missingEvent();
  const { deleted: _deleted, ...previous } = hidden;
  if (previous.event) return { ...previous, updatedAt: new Date().toISOString() };
  const base = Array.isArray(meeting.minutes?.scheduleEvents)
    ? meeting.minutes.scheduleEvents
    : legacyEvents(meeting);
  if (base.some((event) => eventKey(event) === id)) return null;
  const original = previous.original;
  return {
    ...previous,
    event: CalendarEditSchema.parse(Object.fromEntries(
      ["title", "kind", "date", "endDate", "startTime", "endTime",
        "status", "location", "owner"].map((key) => [key, original[key]]),
    )),
    updatedAt: new Date().toISOString(),
  };
}
