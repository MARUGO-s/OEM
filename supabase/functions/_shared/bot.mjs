// Google Meet recording bot helpers shared by the Edge Function, the web app and tests.
// A logged-in user asks for a bot; the server pre-creates the meeting (status "bot") and hands
// the bot a single-purpose upload token that only works for that one meeting.
import { z } from "zod";
import { MetadataSchema } from "./domain.mjs";

export const UPLOAD_TOKEN_TTL_MS = 6 * 60 * 60 * 1000;
export const UPLOAD_TOKEN_HEADER = "x-upload-token";
export const WEBHOOK_SECRET_HEADER = "x-meetbot-secret";
export const WEBHOOK_TIMEOUT_MS = 10_000;
/** States the bot itself may report. "waiting" is the initial state set by the server. */
export const BOT_STATES = ["waiting", "joining", "recording", "uploading", "error"];
/** Phases shown to users: bot states plus the meeting's own processing result. */
export const BOT_PHASES = ["waiting", "joining", "recording", "uploading", "processing", "done", "error"];
export const BOT_PHASE_LABELS = {
  waiting: "待機中",
  joining: "参加中",
  recording: "録音中",
  uploading: "アップロード中",
  processing: "議事録作成中",
  done: "完了",
  error: "エラー",
};

const MEET_CODE = /^\/([a-z]{3}-[a-z]{4}-[a-z]{3})\/?$/;
/** Canonical https://meet.google.com/xxx-xxxx-xxx or null. Query/fragment (e.g. ?authuser=1) are dropped. */
export function normalizeMeetUrl(value) {
  if (typeof value !== "string" || value.length > 500) return null;
  let url;
  try {
    url = new URL(value.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.hostname.toLowerCase() !== "meet.google.com") return null;
  if (url.username || url.password || url.port) return null;
  const code = MEET_CODE.exec(url.pathname.toLowerCase())?.[1];
  return code ? `https://meet.google.com/${code}` : null;
}

export const MeetUrlSchema = z
  .string()
  .transform((value, ctx) => {
    const url = normalizeMeetUrl(value);
    if (!url) {
      ctx.addIssue({ code: "custom", message: "Google MeetのURL（https://meet.google.com/xxx-xxxx-xxx）を入力してください。" });
      return z.NEVER;
    }
    return url;
  });

export const BotRequestSchema = z
  .object({ meetUrl: MeetUrlSchema, metadata: MetadataSchema })
  .strict();

export const BotStatusSchema = z
  .object({
    state: z.enum(["joining", "recording", "uploading", "error"]),
    message: z.string().trim().max(500).optional(),
  })
  .strict();

/** The bot may resend the full /uploads body; metadata always comes from the user's request. */
export const BotUploadSchema = z
  .object({
    sources: z.array(z.unknown()).min(1).max(5),
    parts: z.array(z.unknown()).min(1).max(512),
    metadata: z.unknown().optional(),
    transcript: z.literal("").optional(),
    attachments: z.array(z.unknown()).max(0).optional(),
  })
  .strict()
  .transform(({ sources, parts }) => ({ sources, parts }));

export function createUploadToken() {
  return `ktu_${Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("")}`;
}
export function validUploadTokenFormat(value) {
  return typeof value === "string" && /^ktu_[0-9a-f]{64}$/.test(value);
}
/** Upload token from `Authorization: Bearer <token>` or `X-Upload-Token: <token>`. */
export function uploadTokenFrom(headers) {
  const bearer = headers.get("authorization")?.match(/^Bearer (.+)$/i)?.[1]?.trim();
  const value = headers.get(UPLOAD_TOKEN_HEADER)?.trim() || bearer;
  return validUploadTokenFormat(value) ? value : null;
}

/** The document fields a bot request adds to a pre-created meeting (status "bot"). */
export function botDocument({ id, requestId, meetUrl, metadata, model, transcriptionModel, now = new Date() }) {
  const requestedAt = now.toISOString();
  return {
    ...metadata,
    id,
    createdAt: requestedAt,
    status: "bot",
    source: "audio",
    isDemo: false,
    fileName: null,
    audioParts: [],
    attachments: [],
    duration: null,
    transcript: "",
    segments: [],
    minutes: null,
    markdown: "",
    speakerNames: {},
    completedActions: [],
    error: null,
    minutesStale: false,
    minutesModel: model,
    transcriptionModel,
    bot: {
      requestId,
      meetUrl,
      state: "waiting",
      message: null,
      requestedAt,
      updatedAt: requestedAt,
      expiresAt: new Date(now.getTime() + UPLOAD_TOKEN_TTL_MS).toISOString(),
    },
  };
}

/** Phase shown in the UI for a meeting created by a bot request (null for other meetings). */
export function botPhase(meeting, now = Date.now()) {
  const bot = meeting?.bot;
  if (!bot) return null;
  if (meeting.status === "done") return "done";
  if (meeting.status === "error") return "error";
  if (["transcribing", "analyzing"].includes(meeting.status)) return "processing";
  if (bot.state === "error") return "error";
  if (Date.parse(bot.expiresAt || "") <= now) return "error";
  if (meeting.status === "uploading") return "uploading";
  return BOT_STATES.includes(bot.state) ? bot.state : "waiting";
}
export function botPhaseMessage(meeting, now = Date.now()) {
  const bot = meeting?.bot;
  if (!bot) return null;
  const phase = botPhase(meeting, now);
  if (phase !== "error") return bot.state === "error" ? null : bot.message || null;
  if (meeting.status === "error") return meeting.error || "議事録を作成できませんでした。";
  if (bot.state === "error") return bot.message || "Botでエラーが発生しました。";
  return "Botの受付期限（6時間）が過ぎました。録音を取り込めなかった場合は、この会議を削除して再度Botを呼んでください。";
}
/** Public bot status for GET /meetings/:id/bot. Contains no token material. */
export function botView(meeting, now = Date.now()) {
  const bot = meeting?.bot;
  if (!bot) return null;
  const phase = botPhase(meeting, now);
  return {
    meetingId: meeting.id,
    requestId: bot.requestId,
    meetUrl: bot.meetUrl,
    state: bot.state,
    phase,
    label: BOT_PHASE_LABELS[phase],
    message: botPhaseMessage(meeting, now),
    meetingStatus: meeting.status,
    requestedAt: bot.requestedAt,
    updatedAt: bot.updatedAt,
    expiresAt: bot.expiresAt,
  };
}
/** True while the bot side (not the AI processing) may still change the meeting. */
export function botActive(meeting, now = Date.now()) {
  return ["waiting", "joining", "recording", "uploading"].includes(botPhase(meeting, now));
}

/** JSON body POSTed to MEETBOT_WEBHOOK_URL. The upload token appears only here, never in storage. */
export function webhookPayload({ meeting, uploadToken, apiBaseUrl }) {
  return {
    event: "bot.join",
    requestId: meeting.bot.requestId,
    meetingId: meeting.id,
    meetUrl: meeting.bot.meetUrl,
    title: meeting.title,
    date: meeting.date,
    participants: meeting.participants || "",
    template: meeting.template,
    requestedAt: meeting.bot.requestedAt,
    expiresAt: meeting.bot.expiresAt,
    apiBaseUrl,
    uploadToken,
  };
}
