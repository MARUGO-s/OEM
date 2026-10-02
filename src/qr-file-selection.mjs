import { fileSpecification } from "../supabase/functions/_shared/qr-files.mjs";

// The picker and drop zone share exactly the same client-side restrictions.
// Contents are still verified on publish, both in the client and on the server.
export function selectedQrFile(files, blocked = false) {
  if (blocked) throw new Error("処理中のファイルは変更できません。");
  const values = Array.from(files ?? []);
  if (!values.length) return null;
  if (values.length !== 1)
    throw new Error("ファイルは1つずつ選択してください。");
  const file = values[0];
  fileSpecification(file.name, file.size);
  return file;
}
export function isFileDrag(transfer) {
  return Array.from(transfer?.types ?? []).includes("Files");
}
