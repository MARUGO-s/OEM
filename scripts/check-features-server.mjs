// Isolated UI smoke server: fixture meetings and fake AI; no saved keys or live requests.
import { createApp } from "../server/app.mjs";
import { createDemo } from "../server/demo.mjs";
import { createServer } from "vite";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";

const dataDir = await mkdtemp(path.join(tmpdir(), "kotonoha-features-ui-"));
const date = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Asia/Tokyo",
}).format(new Date());
const { app, store } = await createApp({
  dataDir,
  apiKey: "sk-fixture-never-sent",
  aiFactory: () => ({
    async insight(request, onUsage) {
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
                  ? JSON.stringify({ tags: ["検証", "計画", "共有"] })
                  : "## 要約\n検証会議の期間サマリーです（模擬AI）。\n## 重要な決定事項\n- 検証会議1：動作を確認する。",
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
    id: randomUUID(),
    isDemo: false,
    status: "done",
    title: `検証会議${index}`,
    date,
    participants: "担当A、担当B",
    tags: [],
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
