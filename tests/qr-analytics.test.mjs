import assert from "node:assert/strict";
import { test } from "node:test";
import { chartGeometry } from "../src/qr-chart.mjs";
import { buttonHtml } from "../src/qr-labels.mjs";
import { buildTrackingUrl } from "../src/qr-routing.mjs";
import {
  accessBrowser,
  accessDevice,
} from "../supabase/functions/_shared/qr-attribution.mjs";

test("Daily chart includes zero days with a zero baseline and integer scale", () => {
  const chart = chartGeometry([
    { date: "2026-10-01", count: 0 },
    { date: "2026-10-02", count: 1 },
  ]);
  assert.equal(chart.ticks[0].value, 0);
  assert.equal(chart.points[0].y, chart.height - chart.bottom);
  assert.ok(chart.points[1].y < chart.points[0].y);
  assert.ok(chart.ticks.every((tick) => Number.isInteger(tick.value)));
  assert.ok(!chart.polyline.includes("NaN"));
});
test("Charts safely render empty, flat, and large-count series", () => {
  for (const counts of [[], [0], [0, 0, 0], [10000, 1, 2000000]]) {
    const chart = chartGeometry(
      counts.map((count, i) => ({ date: `day-${i}`, count })),
    );
    assert.ok(chart.maximum > 0);
    assert.ok(
      chart.points.every(
        (point) =>
          Number.isFinite(point.x) &&
          Number.isFinite(point.y) &&
          point.y >= chart.top,
      ),
    );
  }
});
test("One redirect code has distinct, short QR/button/link attribution URLs", () => {
  const args = ["/multiapp/", "https://marugo-s.github.io", "abcdefgh1234"];
  assert.equal(
    buildTrackingUrl(...args, "qr"),
    "https://marugo-s.github.io/multiapp/?s=q#abcdefgh1234",
  );
  assert.equal(
    buildTrackingUrl(...args, "button"),
    "https://marugo-s.github.io/multiapp/?s=b#abcdefgh1234",
  );
  assert.equal(
    buildTrackingUrl(...args, "link"),
    "https://marugo-s.github.io/multiapp/?s=l#abcdefgh1234",
  );
});
test("Link button HTML escapes names and attributes", () => {
  const html = buttonHtml(
    'https://example.com/?a=1&b="x"',
    "<img src=x onerror=alert(1)>",
  );
  assert.ok(!html.includes("<img"));
  assert.ok(html.includes("&amp;"));
  assert.ok(html.includes("&quot;"));
});
test("Device and browser classification is conservative and mobile-aware", () => {
  assert.equal(accessDevice(""), "unknown");
  assert.equal(accessDevice("Googlebot Chrome/100"), "bot");
  assert.equal(accessDevice("Mozilla iPad Safari/605"), "tablet");
  assert.equal(accessDevice("Mozilla Android Mobile Chrome/100"), "mobile");
  assert.equal(accessDevice("Mozilla Macintosh Chrome/100"), "desktop");
  assert.equal(accessBrowser("Chrome/100 Edg/100"), "edge");
  assert.equal(accessBrowser("Mozilla iPhone CriOS/100 Safari/605"), "chrome");
  assert.equal(accessBrowser("Firefox/100"), "firefox");
  assert.equal(accessBrowser("Safari/605"), "safari");
  assert.equal(accessBrowser(""), "unknown");
});
