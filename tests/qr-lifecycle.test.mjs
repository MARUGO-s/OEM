import assert from "node:assert/strict";
import { test } from "node:test";
import { lifecycleRequest } from "../src/qr-lifecycle.mjs";

const id = "00000000-0000-4000-8000-000000000002";
test("QR soft deletion and restoration call separate authenticated lifecycle endpoints", () => {
  assert.deepEqual(lifecycleRequest(id, "trash"), {
    path: `/links/${id}/trash`,
    method: "POST",
  });
  assert.deepEqual(lifecycleRequest(id, "restore"), {
    path: `/links/${id}/restore`,
    method: "POST",
  });
});
test("Permanent deletion requires acknowledgement and confirms exactly one QR ID", () => {
  assert.throws(() => lifecycleRequest(id, "purge"), /確認/);
  assert.throws(() => lifecycleRequest(id, "purge", false), /確認/);
  const request = lifecycleRequest(id, "purge", true);
  assert.equal(request.method, "DELETE");
  assert.equal(request.path, `/links/${id}`);
  assert.deepEqual(JSON.parse(request.body), { confirmId: id });
});
test("Invalid identifiers or actions cannot create a deletion request", () => {
  assert.throws(() => lifecycleRequest("../links/all", "purge", true));
  assert.throws(() => lifecycleRequest(id, "all", true));
});
