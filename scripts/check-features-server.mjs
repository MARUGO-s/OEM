// Isolated UI smoke server: fixture meetings and fake AI; no saved keys or live requests.
import { createApp } from "../server/app.mjs";
import { createDemo } from "../server/demo.mjs";
import { UsageStore } from "../server/usage-store.mjs";
import { createServer } from "vite";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { summaryRange } from "../supabase/functions/_shared/insights.mjs";

const dataDir = await mkdtemp(path.join(tmpdir(), "kotonoha-features-ui-"));
const date = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Asia/Tokyo",
}).format(new Date());
const failedTagMeetings = new Set();
const usageMeetingId = randomUUID();
const analysisRunId = randomUUID();
const fixtureUsage = new UsageStore(path.join(dataDir, "usage"));
await fixtureUsage.init();
for (const [index, costUsd] of [0.030004, 0.001684, 0.001303925, 0.00018505].entries()) {
  await fixtureUsage.record({
    id: randomUUID(), meetingId: usageMeetingId, meetingTitle: "検証会議1",
    runId: index === 3 ? randomUUID() : analysisRunId,
    kind: index < 2 ? "transcription" : "minutes",
    ...(index === 3 ? { operation: "tags" } : {}),
    model: index < 2 ? "gemini-3.5-transcribe" : "gpt-6-luna",
    provider: index < 2 ? "Google" : "OpenAI",
    createdAt: new Date(`${date}T05:54:0${index}+09:00`).toISOString(),
    inputTokens: [15002, 842, 4500, 1313][index],
    outputTokens: [0, 0, 1483, 42][index],
    audioSeconds: index === 0 ? 600 : index === 1 ? 33.626 : null,
    cachedInputTokens: 0, reasoningTokens: null, estimated: false, costUsd,
  });
}
const { app, store } = await createApp({
  dataDir,
  apiKey: "sk-fixture-never-sent",
  aiFactory: () => ({
    async summarize(meeting) {
      await new Promise(resolve => setTimeout(resolve, 700));
      return { ...createDemo().minutes, summary: `詳しさ「${meeting.template}」で再生成した検証用議事録です（模擬AI）。` };
    },
    async insight(request, onUsage) {
      const input = JSON.parse(request.input[1].content);
      const meeting = input.meetings[0];
      if (request.text && meeting.title.includes("候補失敗") && !failedTagMeetings.has(meeting.id)) {
        failedTagMeetings.add(meeting.id);
        throw new Error("検証用のタグ候補エラー");
      }
      const response = {
        status: "completed",
        usage: { input_tokens: 100, output_tokens: 100 },
        output: [
          {
            type: "message",
            content: [
              {
                type: "output_text",
                text: request.text
                  ? JSON.stringify({ tags: meeting.title.includes("候補なし") ? [] : ["検証", "計画", "共有"] })
                  : "## 要約\n\n検証会議の期間サマリーです（模擬AI）。進捗と次の行動を整理しました。\n\n### 定例会議：進捗確認\n\n準備状況を共有し、担当者間で次の作業を確認しました。詳細は元の会議録で確認できます。\n\n### 企画会議：今後の計画\n\n次月の企画案を検討しました。最終決定は次回の会議で行います。\n\n## 重要な決定事項\n\n- **定例会議**：確認用の資料を共有する。\n- **担当：担当A**、**期限：未定**。\n\n## 主なアクションアイテム\n\n1. 担当Bが資料を確認する。\n2. 次回の日程を調整する。\n\n## 課題・懸念事項\n\n予算と期限は未定です。元の会話を確認して確定してください。",
              },
            ],
          },
        ],
      };
      await onUsage(response);
      return response;
    },
  }),
});
for (let index = 1; index <= 6; index++) {
  await store.save({
    ...createDemo(),
    id: index === 1 ? usageMeetingId : randomUUID(),
    isDemo: false,
    status: "done",
    title: `検証会議${index}`,
    date: index >= 5 ? summaryRange("lastMonth").end : date,
    participants: "担当A、担当B",
    tags: [],
    duration: null,
    audioParts: index <= 2 ? [{ duration: 600 }, { duration: index === 1 ? 33.626122 : 789.435646 }] : [],
    markdown: `# 検証会議${index}\n\n編集済み本文${index}。`,
  });
}
const server = app.listen(5197, "127.0.0.1");
const vite = await createServer({
  define: { "import.meta.env.VITE_STORAGE_MODE": JSON.stringify("local") },
  server: {
    port: 5198,
    strictPort: true,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:5197",
        changeOrigin: true,
        configure(proxy) {
          proxy.on("proxyReq", (request) =>
            request.setHeader("Origin", "http://127.0.0.1:5197"),
          );
        },
      },
    },
  },
});
await vite.listen();
console.log(
  JSON.stringify({ url: "http://127.0.0.1:5198/", dataDir, mockAI: true }),
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.once(signal, async () => {
    await vite.close();
    server.close(() => process.exit(0));
  });
