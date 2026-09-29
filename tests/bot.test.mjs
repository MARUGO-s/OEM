import assert from "node:assert/strict";
import test from "node:test";
import {
  BotRequestSchema,
  BotStatusSchema,
  botDocument,
  botPhase,
  botView,
  createUploadToken,
  normalizeMeetUrl,
  uploadTokenFrom,
  validUploadTokenFormat,
  webhookPayload,
} from "../supabase/functions/_shared/bot.mjs";
import { validTokenFormat } from "../supabase/functions/_shared/session.mjs";

test("Meet URLs are validated and normalized", () => {
  assert.equal(normalizeMeetUrl("https://meet.google.com/abc-defg-hij"), "https://meet.google.com/abc-defg-hij");
  assert.equal(normalizeMeetUrl(" https://meet.google.com/ABC-DEFG-HIJ/?authuser=1#x "), "https://meet.google.com/abc-defg-hij");
  for (const bad of ["http://meet.google.com/abc-defg-hij", "https://meet.google.com:444/abc-defg-hij",
    "https://meet.google.com.example/abc-defg-hij", "https://meet.google.com/lookup/abc", "https://meet.google.com/ab-defg-hij",
    "meet.google.com/abc-defg-hij", "", null, "https://x@meet.google.com/abc-defg-hij"])
    assert.equal(normalizeMeetUrl(bad), null, String(bad));
  const parsed = BotRequestSchema.parse({ meetUrl: "https://meet.google.com/abc-defg-hij?pli=1", metadata: { title: "定例", date: "2026-09-30" } });
  assert.equal(parsed.meetUrl, "https://meet.google.com/abc-defg-hij");
  assert.equal(parsed.metadata.template, "standard");
  assert.throws(() => BotRequestSchema.parse({ meetUrl: "https://zoom.us/j/1", metadata: { title: "x", date: "2026-09-30" } }));
  assert.throws(() => BotStatusSchema.parse({ state: "done" }));
  assert.throws(() => BotStatusSchema.parse({ state: "error", message: "x".repeat(501) }));
});

test("upload tokens are distinct from session tokens and read from either header", () => {
  const token = createUploadToken();
  assert.ok(validUploadTokenFormat(token));
  assert.equal(validTokenFormat(token), false); // never usable as a login session
  assert.notEqual(createUploadToken(), token);
  assert.equal(uploadTokenFrom(new Headers({ Authorization: `Bearer ${token}` })), token);
  assert.equal(uploadTokenFrom(new Headers({ "X-Upload-Token": token })), token);
  assert.equal(uploadTokenFrom(new Headers({ Authorization: "Bearer ktn_" + "0".repeat(64) })), null);
  assert.equal(uploadTokenFrom(new Headers()), null);
});

test("bot phases combine bot state, meeting status and expiry", () => {
  const now = Date.parse("2026-09-30T01:00:00Z");
  const doc = botDocument({ id: "m", requestId: "r", meetUrl: "https://meet.google.com/abc-defg-hij",
    metadata: { title: "定例", date: "2026-09-30", participants: "", template: "standard" }, model: "gpt-6-astra",
    transcriptionModel: "gpt-transcribe", now: new Date(now) });
  assert.equal(doc.status, "bot");
  assert.equal(Date.parse(doc.bot.expiresAt) - now, 6 * 3600e3);
  const at = (patch, bot = {}) => botPhase({ ...doc, ...patch, bot: { ...doc.bot, ...bot } }, now + 60e3);
  assert.equal(at({}), "waiting");
  assert.equal(at({}, { state: "joining" }), "joining");
  assert.equal(at({}, { state: "recording" }), "recording");
  assert.equal(at({ status: "uploading" }, { state: "uploading" }), "uploading");
  assert.equal(at({ status: "transcribing" }), "processing");
  assert.equal(at({ status: "analyzing" }), "processing");
  assert.equal(at({ status: "done" }), "done");
  assert.equal(at({ status: "error" }), "error");
  assert.equal(at({}, { state: "error" }), "error");
  assert.equal(botPhase(doc, now + 6 * 3600e3 + 1), "error");
  assert.equal(botPhase({ status: "done" }), null);
  const view = botView({ ...doc, bot: { ...doc.bot, state: "error", message: "入室拒否" } }, now);
  assert.equal(view.label, "エラー");
  assert.equal(view.message, "入室拒否");
  const payload = webhookPayload({ meeting: doc, uploadToken: "ktu_x", apiBaseUrl: "https://x/functions/v1/kotonoha-api" });
  assert.equal(payload.meetingId, "m");
  assert.equal(payload.uploadToken, "ktu_x");
});
