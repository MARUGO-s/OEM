export const QR_FILE_MAX_BYTES = 20 * 1024 * 1024;
export const QR_FILE_ACCEPT = ".pdf,.jpg,.jpeg,.png";
export function fileSpecification(name, size) {
  if (
    typeof name !== "string" ||
    !name.trim() ||
    name.length > 180 ||
    /[\u0000-\u001f\u007f/\\]/.test(name)
  )
    throw new Error("ファイル名を確認してください（180文字以内）。");
  if (!Number.isInteger(size) || size < 1 || size > QR_FILE_MAX_BYTES)
    throw new Error("ファイルは20MB以下にしてください。");
  const extension = name.split(".").at(-1)?.toLowerCase();
  const type = {
    pdf: "application/pdf",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
  }[extension];
  if (!type) throw new Error("PDF・JPG・PNGファイルを選択してください。");
  return {
    fileName: name.trim(),
    size,
    mime: type,
    extension: extension === "jpeg" ? "jpg" : extension,
  };
}
export function matchesFileSignature(mime, bytes) {
  if (mime === "application/pdf")
    return new TextDecoder().decode(bytes.subarray(0, 5)) === "%PDF-";
  if (mime === "image/jpeg")
    return bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  if (mime === "image/png")
    return [137, 80, 78, 71, 13, 10, 26, 10].every((n, i) => bytes[i] === n);
  return false;
}
