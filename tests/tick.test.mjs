import assert from "node:assert/strict";
import test from "node:test";
import {
  MAX_TICK_MEETINGS,
  tickCandidates,
  verifyTickSecret,
} from "../supabase/functions/_shared/tick.mjs";

const secret = "a-long-tick-secret-used-only-in-tests-0123";

test("バックグラウンド処理の合言葉: 一致のみ許可し、未設定・短い合言葉は常に拒否", async () => {
  assert.equal(await verifyTickSecret(secret, secret), true);
  assert.equal(await verifyTickSecret(`${secret}x`, secret), false);
  assert.equal(await verifyTickSecret(secret.slice(0, -1), secret), false);
  assert.equal(await verifyTickSecret("", secret), false);
  assert.equal(await verifyTickSecret(null, secret), false);
  assert.equal(await verifyTickSecret(undefined, ""), false);
  assert.equal(await verifyTickSecret("", ""), false);
  assert.equal(await verifyTickSecret("short", "short"), false);
});

test("バックグラウンド処理の対象: 処理中の会議だけを古い順に上限件数まで", () => {
  const row = (status, updatedAt) => ({ document: { status }, updatedAt });
  const records = [
    row("done", "2026-09-30T00:00:00Z"),
    row("transcribing", "2026-09-30T00:03:00Z"),
    row("uploading", "2026-09-30T00:00:00Z"),
    row("analyzing", "2026-09-30T00:01:00Z"),
    row("error", "2026-09-30T00:00:00Z"),
  ];
  assert.deepEqual(
    tickCandidates(records).map((r) => r.document.status),
    ["analyzing", "transcribing"],
  );
  const many = Array.from({ length: 25 }, (_, i) =>
    row("transcribing", `2026-09-30T00:${String(59 - i).padStart(2, "0")}:00Z`),
  );
  const picked = tickCandidates(many);
  assert.equal(picked.length, MAX_TICK_MEETINGS);
  assert.equal(picked[0].updatedAt, "2026-09-30T00:35:00Z");
});
