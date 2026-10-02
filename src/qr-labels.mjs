/** @type {Record<string,string>} */
export const sourceLabels = {
  all: "すべて",
  qr: "QRコード",
  button: "リンクボタン",
  link: "通常のリンク",
  unknown: "不明・旧URL",
};
/** @type {Record<string,string>} */
export const deviceLabels = {
  desktop: "PC",
  mobile: "スマートフォン",
  tablet: "タブレット",
  bot: "ボット等",
  unknown: "不明",
};
/** @type {Record<string,string>} */
export const browserLabels = {
  chrome: "Chrome",
  safari: "Safari",
  edge: "Edge",
  firefox: "Firefox",
  other: "その他",
  unknown: "不明",
};
export function buttonHtml(url, title) {
  const escape = (text) =>
    text
      .replaceAll("&", "&amp;")
      .replaceAll('"', "&quot;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;");
  return `<a href="${escape(url)}" style="display:inline-block;padding:12px 24px;background:#6960d8;color:#fff;border-radius:8px;text-decoration:none">${escape(title)}</a>`;
}
