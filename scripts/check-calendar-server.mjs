// Isolated, synthetic UI fixtures. No real API key, files or production data.
import { createApp } from "../server/app.mjs";
import { createServer } from "vite";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { calendarMeeting, calendarEvent } from "../tests/fixtures/calendar.mjs";
import {
  tokyoToday,
  addDays,
} from "../supabase/functions/_shared/calendar.mjs";
const dir = await mkdtemp(path.join(tmpdir(), "kotonoha-calendar-ui-"));
const { app, store } = await createApp({
  dataDir: dir,
  apiKey: "",
  aiFactory: () => {
    throw new Error("UI test must not call OpenAI");
  },
});
const today = tokyoToday(),
  m = calendarMeeting();
m.title = "商品企画ミーティング（操作検証用）";
m.date = today;
m.minutes.scheduleEvents = [
  {
    ...calendarEvent,
    date: today,
    title: "新商品企画のレビュー",
    dateText: today,
    owner: "佐藤",
    location: "本社 2F 会議室",
  },
  {
    ...calendarEvent,
    date: addDays(today, 1),
    title: "企画書の提出",
    kind: "deadline",
    startTime: null,
    endTime: null,
    dateText: "明日",
    owner: "田中",
  },
  {
    ...calendarEvent,
    date: addDays(today, 3),
    title: "パッケージ確認会",
    dateText: "開催候補日",
    status: "tentative",
    location: "オンライン",
  },
  {
    ...calendarEvent,
    date: null,
    title: "次回の取引先訪問",
    dateText: "来週までに調整",
    startTime: null,
    endTime: null,
    status: "needs_confirmation",
    owner: "鈴木",
    location: "",
  },
];
m.transcript = m.minutes.scheduleEvents.map((e) => e.evidence).join("\n");
await store.save(m);
const old = calendarMeeting();
old.id = randomUUID();
old.date = today;
old.title = "販売準備ミーティング（旧形式の検証）";
delete old.minutes.scheduleEvents;
old.minutes.decisions = [];
old.minutes.actions = [
  {
    task: "販売計画の確認",
    owner: "山本",
    due: `${Number(today.slice(5, 7))}月${Number(today.slice(-2))}日`,
  },
];
await store.save(old);
const server = app.listen(5191, "127.0.0.1");
const vite = await createServer({
  server: {
    port: 5192,
    strictPort: true,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:5191",
        changeOrigin: true,
        configure(proxy) {
          proxy.on("proxyReq", (req) =>
            req.setHeader("Origin", "http://127.0.0.1:5191"),
          );
        },
      },
    },
  },
});
await vite.listen();
console.log(
  JSON.stringify({
    url: "http://127.0.0.1:5192/",
    dataDir: dir,
    pid: process.pid,
    mockAI: true,
  }),
);
async function close() {
  await vite.close();
  await new Promise((r) => server.close(r));
  await rm(dir, { recursive: true, force: true });
  process.exit(0);
}
process.once("SIGINT", close);
process.once("SIGTERM", close);
