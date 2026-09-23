import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import {
  encryptApiKey,
  decryptApiKey,
} from "../supabase/functions/_shared/key-crypto.mjs";

test("クラウドAPIキーを暗号化し、指定のワークスペースにだけ復号できる", async () => {
  const secret = randomBytes(32).toString("base64");
  const key = "sk-fake-test-key-never-call-api";
  const encrypted = await encryptApiKey(key, "owner-a", secret);
  assert.ok(!encrypted.includes(key));
  assert.equal(await decryptApiKey(encrypted, "owner-a", secret), key);
  assert.notEqual(await encryptApiKey(key, "owner-a", secret), encrypted);
  await assert.rejects(decryptApiKey(encrypted, "owner-b", secret));
  await assert.rejects(
    decryptApiKey(encrypted, "owner-a", randomBytes(32).toString("base64")),
  );
  const [version, iv, value] = encrypted.split(".");
  await assert.rejects(
    decryptApiKey(
      `${version}.${iv}.${value.slice(0, 4)}AAAA${value.slice(8)}`,
      "owner-a",
      secret,
    ),
  );
});
