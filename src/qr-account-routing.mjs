// Auth URLs must never be interpreted as public QR codes or sent to scan logs.
export function isAccountNavigation(search = "", hash = "") {
  const query = new URLSearchParams(search);
  return (
    [
      "account",
      "code",
      "token_hash",
      "access_token",
      "refresh_token",
      "error",
      "error_description",
    ].some((key) => query.has(key)) ||
    /(?:^#|&)(?:access_token|refresh_token|error|error_description|token_hash|type)=/.test(
      hash,
    )
  );
}
export function passwordProblem(password, confirmation) {
  if (password.length < 12) return "パスワードは12文字以上にしてください。";
  if (password.length > 128) return "パスワードは128文字以内にしてください。";
  if (password !== confirmation) return "確認用パスワードが一致していません。";
  return "";
}
export function scopedQrPath(path, storeId) {
  if (!/^[0-9a-f-]{36}$/i.test(storeId))
    throw new Error("所属店舗を選択してください。");
  const url = new URL(path, "https://qr.invalid");
  if (
    url.origin !== "https://qr.invalid" ||
    !path.startsWith("/") ||
    path.startsWith("//")
  )
    throw new Error("通信先が正しくありません。");
  url.searchParams.set("storeId", storeId);
  return url.pathname + url.search;
}
