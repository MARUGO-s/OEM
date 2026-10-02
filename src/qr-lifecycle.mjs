/** @param {string} id @param {'trash'|'restore'|'purge'} action @param {boolean} confirmed */
export function lifecycleRequest(id, action, confirmed = false) {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      id,
    )
  ) {
    throw new Error("QRコードの指定が正しくありません。");
  }
  if (!["trash", "restore", "purge"].includes(action))
    throw new Error("操作の指定が正しくありません。");
  if (action === "purge") {
    if (!confirmed) throw new Error("復元できないことを確認してください。");
    return {
      path: `/links/${id}`,
      method: "DELETE",
      body: JSON.stringify({ confirmId: id }),
    };
  }
  return { path: `/links/${id}/${action}`, method: "POST" };
}
