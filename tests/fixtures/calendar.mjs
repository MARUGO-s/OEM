import { createDemo } from "../../supabase/functions/_shared/demo.mjs";
export const calendarEvent = {
  title: "検証打合せ",
  kind: "event",
  date: "2026-10-15",
  endDate: null,
  startTime: "14:00",
  endTime: "15:00",
  dateText: "2026年10月15日14時から15時",
  status: "confirmed",
  source: "conversation",
  attachmentId: null,
  location: "本社会議室",
  owner: "佐藤",
  evidence:
    "2026年10月15日14時から15時、本社会議室で検証打合せを行います。担当は佐藤です。",
};
export function calendarMeeting() {
  return {
    ...createDemo(),
    isDemo: false,
    title: "検証用・共有予定",
    date: "2026-09-23",
    transcript: calendarEvent.evidence,
    minutesStale: false,
    minutes: {
      ...createDemo().minutes,
      scheduleEvents: [structuredClone(calendarEvent)],
    },
  };
}
export const editFields = (e) =>
  Object.fromEntries(
    [
      "title",
      "kind",
      "date",
      "endDate",
      "startTime",
      "endTime",
      "status",
      "location",
      "owner",
    ].map((key) => [key, e[key]]),
  );
