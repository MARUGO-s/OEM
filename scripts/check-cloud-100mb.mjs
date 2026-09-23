// Live storage verification only. Never call /complete: no OpenAI charge.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { splitRecordings } from "../src/split-recordings.mjs";
import { waveFile } from "../tests/fixtures/wav.mjs";
if (process.stdin.isTTY) process.stdin.setRawMode(true);
const credentials = await new Promise((resolve) => {
  let text = "";
  process.stdin.on("data", (chunk) => {
    text += chunk.toString();
    if (/[\r\n]/.test(text)) {
      process.stdin.pause();
      if (process.stdin.isTTY) process.stdin.setRawMode(false);
      resolve(text.trim());
    }
  });
  process.stdin.on("end", () => resolve(text.trim()));
});
const base =
  "https://hjhkccbktkscwtgzxjfq.supabase.co/functions/v1/kotonoha-api";
let token, draft;
const call = (route, options = {}) =>
  fetch(base + route, {
    ...options,
    headers: {
      Origin: "https://marugo-s.github.io",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.body instanceof Blob
        ? {}
        : { "Content-Type": "application/json" }),
      ...options.headers,
    },
    signal: AbortSignal.timeout(120000),
  });
const hash = async (blob) =>
  createHash("sha256")
    .update(new Uint8Array(await blob.arrayBuffer()))
    .digest("hex");
try {
  const login = await call("/auth/login", {
    method: "POST",
    body: credentials,
  });
  assert.equal(login.status, 200);
  token = (await login.json()).token;
  const file = waveFile();
  const parts = await splitRecordings([file]);
  const response = await call("/uploads", {
    method: "POST",
    body: JSON.stringify({
      metadata: { title: "検証用100MB・AI実行なし", date: "2026-09-23" },
      sources: [{ name: file.name, size: file.size }],
      parts: parts.map(({ name, blob, sourceIndex, partNumber, duration }) => ({
        name,
        size: blob.size,
        sourceIndex,
        partNumber,
        duration,
      })),
    }),
  });
  assert.equal(response.status, 201, `draft status ${response.status}`);
  draft = await response.json();
  const started = Date.now();
  for (const [index, part] of parts.entries()) {
    const result = await call(`/meetings/${draft.id}/parts?index=${index}`, {
      method: "POST",
      body: part.blob,
    });
    assert.equal(
      result.status,
      200,
      `upload part ${index + 1}: ${result.status}`,
    );
    const saved = await result.json();
    assert.equal(saved.status, "uploading");
    console.log(
      JSON.stringify({
        part: index + 1,
        total: parts.length,
        bytes: part.blob.size,
      }),
    );
  }
  for (const index of [0, parts.length - 1]) {
    const signed = await (
      await call(`/meetings/${draft.id}/audio?part=${index}`)
    ).json();
    const result = await fetch(signed.url);
    assert.equal(result.status, 200);
    assert.equal(
      await hash(await result.blob()),
      await hash(parts[index].blob),
    );
  }
  const rejected = await call("/uploads", {
    method: "POST",
    body: JSON.stringify({
      metadata: { title: "上限確認", date: "2026-09-23" },
      sources: [{ name: file.name, size: 100_000_001 }],
      parts: [
        {
          name: "recording-1-1.wav",
          size: 100,
          sourceIndex: 0,
          partNumber: 1,
          duration: 1,
        },
      ],
    }),
  });
  assert.equal(rejected.status, 400);
  console.log(
    JSON.stringify({
      passed: true,
      originalBytes: file.size,
      parts: parts.length,
      storedBytes: parts.reduce((n, p) => n + p.blob.size, 0),
      elapsedMs: Date.now() - started,
      verifiedFirstAndLastHashes: true,
      openaiRequests: 0,
    }),
  );
} finally {
  if (draft) {
    const removed = await call(`/meetings/${draft.id}`, { method: "DELETE" });
    assert.equal(removed.status, 204);
    console.log("Test-only upload discarded; no original user data touched.");
  }
  if (token) await call("/auth/logout", { method: "POST" });
}
