// Isolated UI smoke server: synthetic audio + fake AI, never uses saved keys.
import { createApp } from "../server/app.mjs";
import { createDemo } from "../server/demo.mjs";
import { createServer } from "vite";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { waveFile } from "../tests/fixtures/wav.mjs";
const dir = await mkdtemp(path.join(tmpdir(), "kotonoha-100mb-ui-"));
await writeFile(
  path.join(dir, "100MB.wav"),
  new Uint8Array(await waveFile().arrayBuffer()),
);
let calls = 0;
const { app } = await createApp({
  dataDir: dir,
  apiKey: "sk-mock-test-only-never-sent",
  aiFactory: () => ({
    transcribe: async () => ({
      transcript: `検証音声${++calls}。確認用の架空の会話です。`,
    }),
    summarize: async () => ({
      ...createDemo().minutes,
      summary: `100 MBの分割送信を${calls}部分で確認しました。実際のAI解析ではありません。`,
    }),
  }),
});
app.listen(5191, "127.0.0.1");
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
    file: path.join(dir, "100MB.wav"),
    mockAI: true,
  }),
);
