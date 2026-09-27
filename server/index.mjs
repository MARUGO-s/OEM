import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createApp } from "./app.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const port = Number(process.env.PORT || 4318);
const { app } = await createApp({
  dataDir: path.join(root, ".data"),
  staticDir: path.join(root, "dist"),
  apiKey: process.env.OPENAI_API_KEY || "",
  geminiApiKey: process.env.GEMINI_API_KEY || "",
  model: process.env.OPENAI_MINUTES_MODEL || "gpt-6-astra",
  transcriptionModel: process.env.TRANSCRIPTION_MODEL || "gpt-transcribe",
});
// Express 5 passes listen errors (such as a port in use) to this callback.
app.listen(port, "127.0.0.1", (error) => {
  if (error) {
    console.error(
      error.code === "EADDRINUSE"
        ? `Port ${port} is already in use. Stop the other app (or the previous kotonoha) and start again.`
        : `kotonoha could not start: ${error.message}`,
    );
    process.exit(1);
  }
  console.log(`kotonoha is running at http://127.0.0.1:${port}`);
});
