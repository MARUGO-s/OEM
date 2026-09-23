import express from "express";
import multer from "multer";
import { randomUUID } from "node:crypto";
import { mkdir, unlink, readFile, writeFile, rename } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { MeetingStore } from "./store.mjs";
import { createAI } from "./ai.mjs";
import { createDemo } from "./demo.mjs";
import {
  MAX_AUDIO_FILES,
  prepareAudio,
  validateRecordings,
  recordingsFor,
  publicRecordings,
  needsTranscription,
  transcribeRecordings,
} from "../supabase/functions/_shared/audio.mjs";
import {
  MAX_FILE_SIZE,
  MAX_TEXT_LENGTH,
  MetadataSchema,
  PatchSchema,
  audioExtensions,
  minutesToMarkdown,
  safeError,
  transcriptFromSegments,
} from "./domain.mjs";

const models = ["gpt-6-astra", "gpt-6-sol"];
const settingsSchema = z.object({
  apiKey: z.string().trim().min(20).max(500).optional(),
  model: z.enum(models),
});
const working = (status) => ["transcribing", "analyzing"].includes(status);
const fail = (status, message) =>
  Object.assign(new Error(message), { status, publicMessage: message });
const publicRecord = (record) => {
  const { audioFile, audioParts, ...rest } = record;
  const recordings = publicRecordings(recordingsFor(record));
  return { ...rest, hasAudio: recordings.length > 0, recordings };
};

export async function createApp({
  dataDir,
  apiKey = "",
  model = "gpt-6-astra",
  aiFactory = createAI,
  staticDir,
} = {}) {
  const app = express();
  const store = new MeetingStore(path.join(dataDir, "meetings"));
  await store.init();
  const uploadsDir = path.join(dataDir, "audio");
  await mkdir(uploadsDir, { recursive: true, mode: 0o700 });
  const configPath = path.join(dataDir, "config.json");
  try {
    const config = JSON.parse(await readFile(configPath, "utf8"));
    if (models.includes(config.model)) model = config.model;
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  if (!models.includes(model))
    throw new Error("OPENAI_MINUTES_MODEL must be gpt-6-astra or gpt-6-sol");
  let currentKey = apiKey;
  let currentModel = model;
  const busy = new Set();
  const jobs = new Set();
  let settingsBusy = false;

  app.disable("x-powered-by");
  app.use("/api", (req, res, next) => {
    res.set({
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    });
    if (!["localhost", "127.0.0.1", "[::1]"].includes(req.hostname))
      return next(fail(403, "ローカル環境からアクセスしてください。"));
    if (req.headers.origin) {
      const origin = req.headers.origin;
      const allowed = [
        `http://${req.headers.host}`,
        "http://127.0.0.1:5188",
        "http://localhost:5188",
      ];
      if (!allowed.includes(origin))
        return next(fail(403, "アクセス元を確認できません。"));
    }
    if (!["GET", "HEAD"].includes(req.method) && req.get("X-Kotonoha") !== "1")
      return next(fail(403, "アプリの画面から操作してください。"));
    next();
  });
  app.use(express.json({ limit: "2mb" }));

  const upload = multer({
    storage: multer.diskStorage({
      destination: uploadsDir,
      filename: (_req, file, callback) =>
        callback(
          null,
          `${randomUUID()}${path.extname(file.originalname).toLowerCase()}`,
        ),
    }),
    limits: {
      fileSize: MAX_FILE_SIZE,
      files: MAX_AUDIO_FILES,
      fields: 8,
      fieldSize: 400_000,
    },
    fileFilter: (_req, file, callback) =>
      audioExtensions.has(path.extname(file.originalname).toLowerCase())
        ? callback(null, true)
        : callback(
            fail(
              400,
              "対応する音声ファイル（AAC / MP3 / M4A / WAV / MP4 / WebM / OGG / FLAC）を選択してください。",
            ),
          ),
  });

  function requireKey(_req, _res, next) {
    if (!currentKey)
      return next(fail(428, "接続設定でOpenAI APIキーを設定してください。"));
    if (jobs.size >= 2)
      return next(
        fail(
          429,
          "同時に処理できる会議は2件までです。処理完了後に再度お試しください。",
        ),
      );
    next();
  }
  function getMeeting(id) {
    const meeting = store.get(id);
    if (!meeting) throw fail(404, "会議が見つかりません。");
    return meeting;
  }
  function lock(id) {
    if (busy.has(id))
      throw fail(
        409,
        "この会議は処理中です。完了後にもう一度操作してください。",
      );
    busy.add(id);
  }
  async function processMeeting(id, key, modelForJob) {
    try {
      const ai = aiFactory(key, modelForJob);
      let meeting = getMeeting(id);
      if (needsTranscription(meeting) || !meeting.transcript) {
        const transcript = await transcribeRecordings(
          recordingsFor(meeting),
          async (part) =>
            (await ai.transcribe(path.join(uploadsDir, part.audioFile)))
              .transcript,
          async (audioParts) => {
            meeting = await store.save({ ...meeting, audioParts });
          },
        );
        meeting = await store.save({
          ...meeting,
          transcript,
          segments: [],
          status: "analyzing",
          transcriptionModel: "gpt-4o-transcribe",
        });
      }
      const minutes = await ai.summarize(meeting);
      await store.save({
        ...meeting,
        status: "done",
        minutes,
        markdown: minutesToMarkdown(meeting, minutes),
        completedActions: [],
        error: null,
        minutesStale: false,
        minutesModel: modelForJob,
      });
    } catch (error) {
      const latest = store.get(id);
      if (latest)
        await store.save({
          ...latest,
          status: "error",
          error: error.publicMessage || safeError(error),
        });
      console.error(
        "Meeting processing failed:",
        error.name,
        error.status || error.code || "unknown",
      );
    } finally {
      busy.delete(id);
    }
  }
  function startJob(id) {
    const job = processMeeting(id, currentKey, currentModel);
    jobs.add(job);
    // A storage error must not become an unhandled rejection or expose API content.
    job
      .catch(() => console.error("Meeting result could not be saved."))
      .finally(() => jobs.delete(job));
  }

  app.get("/api/settings", (_req, res) =>
    res.json({
      configured: Boolean(currentKey),
      model: currentModel,
      transcriptionModel: "gpt-4o-transcribe",
      maxFileSize: MAX_FILE_SIZE,
    }),
  );
  app.put("/api/settings", async (req, res) => {
    const input = settingsSchema.parse(req.body);
    if (settingsBusy) throw fail(409, "設定を保存中です。");
    settingsBusy = true;
    try {
      const temp = `${configPath}.tmp`;
      await writeFile(temp, JSON.stringify({ model: input.model }), {
        mode: 0o600,
      });
      await rename(temp, configPath);
      if (input.apiKey) currentKey = input.apiKey;
      currentModel = input.model;
      res.json({
        configured: Boolean(currentKey),
        model: currentModel,
        transcriptionModel: "gpt-4o-transcribe",
        maxFileSize: MAX_FILE_SIZE,
      });
    } finally {
      settingsBusy = false;
    }
  });
  app.get("/api/meetings", (_req, res) =>
    res.json(store.list().map(publicRecord)),
  );
  app.get("/api/meetings/:id", (req, res) =>
    res.json(publicRecord(getMeeting(req.params.id))),
  );

  app.post("/api/demo", async (_req, res) => {
    const existing = store.list().find((m) => m.isDemo);
    const meeting = existing || (await store.save(createDemo()));
    res.status(existing ? 200 : 201).json(publicRecord(meeting));
  });
  app.post(
    "/api/meetings",
    requireKey,
    upload.array("audio", MAX_AUDIO_FILES),
    async (req, res) => {
      let accepted = false;
      const files = req.files || [];
      const cleanupPaths = new Set(files.map((file) => file.path));
      try {
        const metadata = MetadataSchema.parse(req.body);
        const transcript = z
          .string()
          .trim()
          .max(MAX_TEXT_LENGTH)
          .parse(req.body.transcript || "");
        if (!files.length && !transcript)
          throw fail(400, "音声ファイルまたは会話テキストを入力してください。");
        if (files.length && transcript)
          throw fail(400, "音声とテキストはどちらか一方を選択してください。");
        validateRecordings(
          files.map((file) => ({ name: file.originalname, size: file.size })),
        );
        if (jobs.size >= 2)
          throw fail(
            429,
            "処理中の会議が完了してから、もう一度お試しください。",
          );
        const audioParts = [];
        for (const file of files) {
          const fileName = Buffer.from(file.originalname, "latin1").toString(
            "utf8",
          );
          if (path.extname(file.filename) === ".aac") {
            const prepared = await prepareAudio(
              new File([await readFile(file.path)], fileName),
            );
            const filename = `${path.parse(file.filename).name}${prepared.extension}`;
            const destination = path.join(uploadsDir, filename);
            cleanupPaths.add(destination);
            await writeFile(
              destination,
              new Uint8Array(await prepared.blob.arrayBuffer()),
              { mode: 0o600 },
            );
            await unlink(file.path);
            file.filename = filename;
            file.path = destination;
          }
          audioParts.push({
            fileName,
            audioFile: file.filename,
            transcript: "",
          });
        }
        const meeting = {
          ...metadata,
          id: randomUUID(),
          createdAt: new Date().toISOString(),
          status: files.length ? "transcribing" : "analyzing",
          source: files.length ? "audio" : "text",
          isDemo: false,
          fileName: audioParts[0]?.fileName || null,
          audioFile: audioParts[0]?.audioFile || null,
          audioParts,
          transcript,
          segments: [],
          duration: null,
          minutes: null,
          markdown: "",
          speakerNames: {},
          completedActions: [],
          error: null,
          minutesStale: false,
          minutesModel: currentModel,
          transcriptionModel: files.length ? "gpt-4o-transcribe" : null,
        };
        lock(meeting.id);
        try {
          await store.save(meeting);
        } catch (error) {
          busy.delete(meeting.id);
          throw error;
        }
        accepted = true;
        startJob(meeting.id);
        res.status(202).json(publicRecord(meeting));
      } finally {
        if (!accepted)
          await Promise.all(
            [...cleanupPaths].map((file) => unlink(file).catch(() => {})),
          );
      }
    },
  );

  app.post("/api/meetings/:id/retry", requireKey, async (req, res) => {
    const meeting = getMeeting(req.params.id);
    if (meeting.isDemo)
      throw fail(
        400,
        "サンプル会議は再生成できません。新しい会議でお試しください。",
      );
    lock(meeting.id);
    try {
      const next = await store.save({
        ...meeting,
        status: needsTranscription(meeting) ? "transcribing" : "analyzing",
        error: null,
        minutesModel: currentModel,
      });
      startJob(meeting.id);
      res.status(202).json(publicRecord(next));
    } catch (error) {
      busy.delete(meeting.id);
      throw error;
    }
  });

  app.patch("/api/meetings/:id", async (req, res) => {
    const patch = PatchSchema.parse(req.body);
    const meeting = getMeeting(req.params.id);
    lock(meeting.id);
    try {
      let next = { ...meeting, ...patch };
      if (
        patch.completedActions?.some(
          (i) => i >= (meeting.minutes?.actions.length || 0),
        )
      )
        throw fail(400, "アクションが見つかりません。");
      if (
        patch.transcript !== undefined &&
        patch.transcript !== meeting.transcript
      )
        next = { ...next, segments: [], minutesStale: true };
      if (patch.speakerNames && meeting.segments.length)
        next = {
          ...next,
          transcript: transcriptFromSegments(
            meeting.segments,
            patch.speakerNames,
          ),
          minutesStale: true,
        };
      res.json(publicRecord(await store.save(next)));
    } finally {
      busy.delete(meeting.id);
    }
  });
  app.get("/api/meetings/:id/audio", (req, res) => {
    const meeting = getMeeting(req.params.id);
    const index = Number(req.query.part ?? 0);
    const part =
      Number.isInteger(index) && index >= 0
        ? recordingsFor(meeting)[index]
        : null;
    if (!part?.audioFile)
      throw fail(404, "この会議に音声ファイルはありません。");
    res.sendFile(part.audioFile, { root: uploadsDir, dotfiles: "deny" });
  });
  app.delete("/api/meetings/:id", async (req, res) => {
    const meeting = getMeeting(req.params.id);
    lock(meeting.id);
    try {
      if (working(meeting.status))
        throw fail(409, "処理中の会議は削除できません。");
      // Move to a local trash directory so accidental deletion is recoverable.
      const trashDir = path.join(dataDir, "trash", meeting.id);
      await mkdir(trashDir, { recursive: true, mode: 0o700 });
      await writeFile(
        path.join(trashDir, "meeting.json"),
        JSON.stringify(meeting, null, 2),
        { mode: 0o600 },
      );
      for (const part of recordingsFor(meeting))
        await rename(
          path.join(uploadsDir, part.audioFile),
          path.join(trashDir, part.audioFile),
        );
      await store.delete(meeting.id);
      res.status(204).end();
    } finally {
      busy.delete(meeting.id);
    }
  });
  app.use("/api", (_req, _res, next) =>
    next(fail(404, "APIが見つかりません。")),
  );
  if (staticDir) {
    app.use(express.static(staticDir));
    app.get("/", (_req, res) =>
      res.sendFile(path.join(staticDir, "index.html")),
    );
  }
  app.use((error, _req, res, _next) => {
    if (error instanceof z.ZodError)
      return res.status(400).json({
        error: `入力内容を確認してください。${error.issues[0]?.message || ""}`,
      });
    if (error instanceof multer.MulterError)
      return res.status(400).json({
        error:
          error.code === "LIMIT_FILE_SIZE"
            ? "音声ファイルは24 MB以下にしてください。"
            : "アップロードの制限を超えました。ファイルと入力内容をご確認ください。",
      });
    const status = error.status || 500;
    res.status(status).json({
      error:
        error.publicMessage ||
        (status === 413
          ? "入力データが大きすぎます。"
          : "処理に失敗しました。アプリを再読み込みしてお試しください。"),
    });
  });
  return { app, store, waitForJobs: () => Promise.allSettled([...jobs]) };
}
