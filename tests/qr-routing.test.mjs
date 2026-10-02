import assert from "node:assert/strict";
import { test } from "node:test";
import { buildTrackingUrl, isTrackingNavigation } from "../src/qr-routing.mjs";

test("QR URL uses the project root without a second marugo path", () => {
  assert.equal(
    buildTrackingUrl("/OEM/", "https://marugo-s.github.io", "EN_Sqs7WzH3q"),
    "https://marugo-s.github.io/OEM/#EN_Sqs7WzH3q",
  );
  assert.equal(
    buildTrackingUrl("/", "http://localhost:5188", "abcdefgh1234"),
    "http://localhost:5188/#abcdefgh1234",
  );
  assert.throws(() =>
    buildTrackingUrl("/OEM/", "https://marugo-s.github.io", "bad"),
  );
});
test("Root tracking URLs bypass the workspace; empty fragments show app selection", () => {
  assert.equal(isTrackingNavigation(""), false);
  assert.equal(isTrackingNavigation("#"), false);
  assert.equal(isTrackingNavigation("#abcdefgh1234"), true);
  assert.equal(isTrackingNavigation("#bad"), true);
});
