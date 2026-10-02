export function isTrackingNavigation(hash) {
  return typeof hash === "string" && hash.length > 1;
}
export function buildTrackingUrl(baseUrl, origin, code, source = "unknown") {
  if (!/^[A-Za-z0-9_-]{12}$/.test(code)) throw new Error("Invalid QR code");
  const url = new URL(baseUrl, origin);
  const marker = { qr: "q", button: "b", link: "l" }[source];
  if (marker) url.searchParams.set("s", marker);
  url.hash = code;
  return url.href;
}
