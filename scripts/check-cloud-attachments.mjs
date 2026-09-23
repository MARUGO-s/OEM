// Explicit live smoke check: one real, billable summary using small synthetic docs.
// Credentials enter hidden stdin, never command args/logs; saved keys stay in Edge.
import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { setTimeout } from "node:timers/promises";
import { documentFixtures } from "../tests/fixtures/documents.mjs";
if (process.stdin.isTTY) process.stdin.setRawMode(true);
const credentials = await new Promise((resolve) => {
  let value = "";
  process.stdin.on("data", (chunk) => {
    value += chunk.toString();
    if (/[\r\n]/.test(value)) {
      process.stdin.pause();
      if (process.stdin.isTTY) process.stdin.setRawMode(false);
      resolve(value.trim());
    }
  });
  process.stdin.on("end", () => resolve(value.trim()));
});
const base =
  "https://hjhkccbktkscwtgzxjfq.supabase.co/functions/v1/kotonoha-api";
const tokens = [];
let meeting;
const call = (route, options = {}, token = tokens[0]) =>
  fetch(base + route, {
    ...options,
    headers: {
      Origin: "https://marugo-s.github.io",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.body instanceof FormData
        ? {}
        : { "Content-Type": "application/json" }),
      ...options.headers,
    },
    signal: AbortSignal.timeout(120000),
  });
const sha = (bytes) =>
  createHash("sha256").update(new Uint8Array(bytes)).digest("hex");
try {
  for (let i = 0; i < 2; i++) {
    const response = await call(
      "/auth/login",
      { method: "POST", body: credentials },
      null,
    );
    assert.equal(response.status, 200);
    tokens.push((await response.json()).token);
  }
  const settings = await (await call("/settings")).json();
  assert.ok(settings.configured);
  const files = documentFixtures(),
    attachments = files.map((f) => ({
      id: randomUUID(),
      name: f.name,
      size: f.size,
    }));
  const response = await call("/uploads", {
    method: "POST",
    body: JSON.stringify({
      metadata: {
        title: "検証用・添付資料の実AI照合（架空）",
        date: "2026-09-23",
      },
      sources: [],
      parts: [],
      attachments,
      transcript:
        "田中：新商品の検証について決めます。資料の開始日は10月1日ですが、本日の会議では10月15日へ変更することに決定します。佐藤：予算案は80万円でしたが、今回の上限は60万円で合意します。田中：佐藤さん、来週までに企画書の日付と予算を修正してください。佐藤：承知しました。田中：テレビ広告の案は今回は決めず、継続検討とします。",
    }),
  });
  assert.equal(response.status, 201, await response.clone().text());
  meeting = await response.json();
  console.log(
    JSON.stringify({
      testMeetingId: meeting.id,
      model: settings.model,
      documents: files.map((f) => ({ name: f.name, bytes: f.size })),
    }),
  );
  assert.equal(
    (await call(`/meetings/${meeting.id}/complete`, { method: "POST" })).status,
    409,
  );
  for (const [index, file] of files.entries()) {
    const body = new FormData();
    body.set("id", attachments[index].id);
    body.set("attachment", file);
    const result = await call(`/meetings/${meeting.id}/attachments`, {
      method: "POST",
      body,
    });
    assert.equal(result.status, 201, await result.clone().text());
    meeting = await result.json();
    assert.equal(meeting.attachments[index].storagePath, undefined);
    const route = `/meetings/${meeting.id}/attachments/${attachments[index].id}`;
    assert.equal((await call(route, {}, null)).status, 401);
    const signed = await (await call(route, {}, tokens[1])).json();
    const downloaded = await fetch(signed.url);
    assert.equal(downloaded.status, 200);
    assert.equal(
      sha(await downloaded.arrayBuffer()),
      sha(await file.arrayBuffer()),
    );
  }
  const start = await call(`/meetings/${meeting.id}/complete`, {
    method: "POST",
  });
  assert.equal(start.status, 202, await start.clone().text());
  meeting = await start.json();
  for (let n = 0; n < 72 && !["done", "error"].includes(meeting.status); n++) {
    await setTimeout(5000);
    const result = await call("/meetings", {}, tokens[1]);
    assert.equal(result.status, 200);
    meeting = (await result.json()).find((item) => item.id === meeting.id);
    assert.ok(meeting, "Synthetic meeting remains visible while processing");
    if (n % 6 === 0)
      console.log(
        JSON.stringify({ status: meeting.status, elapsedSeconds: (n + 1) * 5 }),
      );
  }
  assert.equal(
    meeting.status,
    "done",
    meeting.error || "AI completion timed out",
  );
  assert.equal(meeting.minutesModel, settings.model);
  assert.equal(meeting.minutes.documentReview.length, 3);
  assert.deepEqual(
    meeting.minutes.documentReview.map((r) => r.attachmentId).sort(),
    attachments.map((a) => a.id).sort(),
  );
  assert.match(meeting.markdown, /添付資料との照合/);
  console.log(
    JSON.stringify(
      {
        passed: true,
        originalDownloadHashes: true,
        sharedSessionAccess: true,
        summary: meeting.minutes.summary,
        decisions: meeting.minutes.decisions,
        actions: meeting.minutes.actions,
        openQuestions: meeting.minutes.openQuestions,
        documentReview: meeting.minutes.documentReview,
      },
      null,
      2,
    ),
  );
} finally {
  if (meeting && ["done", "error", "uploading"].includes(meeting.status)) {
    const removed = await call(`/meetings/${meeting.id}`, { method: "DELETE" });
    assert.equal(removed.status, 204);
    console.log(
      "Synthetic meeting soft-deleted; small test documents retained recoverably. No user originals changed.",
    );
  }
  for (const token of tokens)
    await call("/auth/logout", { method: "POST" }, token);
}
