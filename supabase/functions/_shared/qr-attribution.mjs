export const QR_SOURCES = ["qr", "button", "link", "unknown"];
export function accessDevice(userAgent) {
  if (!userAgent) return "unknown";
  if (/bot|crawler|spider|headless|preview|slurp/i.test(userAgent))
    return "bot";
  if (/ipad|tablet|android(?!.*mobile)/i.test(userAgent)) return "tablet";
  if (/iphone|ipod|android|mobile/i.test(userAgent)) return "mobile";
  if (/windows|macintosh|x11|linux/i.test(userAgent)) return "desktop";
  return "unknown";
}
export function accessBrowser(userAgent) {
  if (!userAgent) return "unknown";
  if (/edg\/|edgios\/|edga\//i.test(userAgent)) return "edge";
  if (/firefox\/|fxios\//i.test(userAgent)) return "firefox";
  if (/chrome\/|crios\//i.test(userAgent)) return "chrome";
  if (/safari\//i.test(userAgent)) return "safari";
  return "other";
}
