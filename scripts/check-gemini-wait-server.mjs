// Isolated UI fixture: the second chunk fails once with 429, then succeeds.
// No real provider requests, stored credentials or production meetings are used.
import { createApp } from "../server/app.mjs";
import { createDemo } from "../server/demo.mjs";
import { createServer } from "vite";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";

const dataDir = await mkdtemp(path.join(tmpdir(), "kotonoha-gemini-wait-ui-"));
let calls = 0;
const { app, store } = await createApp({
  dataDir,
  apiKey: "test-openai-never-sent",
  geminiApiKey: "test-google-never-sent",
  transcriptionModel: "gemini-3.5-transcribe",
  aiFactory: () => ({
    async transcribe() {
      calls++;
      if (calls === 1)
        throw Object.assign(new Error("Mock 429"), {
          provider: "gemini",
          status: 429,
        });
      return { transcript: "後半の確認事項です。" };
    },
    async summarize() {
      return {
        ...createDemo().minutes,
        summary: "動作確認用の架空の議事録です。",
      };
    },
  }),
});
const sample = createDemo();
await store.save({
  ...sample,
  id: randomUUID(),
  isDemo: false,
  title: "自動再開の画面検証（架空）",
  status: "error",
  error: "検証用です。「再試行」で模擬429を1回発生させます。",
  minutes: null,
  markdown: "",
  transcript: "",
  transcriptionModel: "gemini-3.5-transcribe",
  audioParts: [
    {
      fileName: "前半.wav",
      audioFile: "fixture-first.wav",
      transcript: "保存済みの前半です。",
    },
    { fileName: "後半.wav", audioFile: "fixture-last.wav", transcript: "" },
  ],
});
app.listen(5193, "127.0.0.1");
const vite = await createServer({
  server: {
    port: 5194,
    strictPort: true,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:5193",
        changeOrigin: true,
        configure(proxy) {
          proxy.on("proxyReq", (req) =>
            req.setHeader("Origin", "http://127.0.0.1:5193"),
          );
        },
      },
    },
  },
});
await vite.listen();
console.log(
  JSON.stringify({ url: "http://127.0.0.1:5194/", mockAI: true, dataDir }),
);
