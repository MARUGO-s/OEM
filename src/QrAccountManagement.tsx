import { useCallback, useEffect, useRef, useState } from "react";
import { Modal } from "./Modal";
import {
  accountApi,
  AccountResultUnconfirmedError,
  type QrMember,
  type QrStore,
} from "./qr-account-client";
type Action =
  "approve" | "suspend" | "grant_admin" | "revoke_admin" | "assign_store";
const labels: Record<Action, string> = {
  approve: "所属を承認・利用再開",
  suspend: "利用停止",
  grant_admin: "全店舗管理者を付与",
  revoke_admin: "管理者を取り消す",
  assign_store: "所属店舗を変更",
};

export function QrAccountManagement({
  stores,
  currentUserId,
  notify,
}: {
  stores: QrStore[];
  currentUserId: string;
  notify: (message: string) => void;
}) {
  const [filter, setFilter] = useState("");
  const [page, setPage] = useState(0);
  const [members, setMembers] = useState<QrMember[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [uncertain, setUncertain] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmation, setConfirmation] = useState<{
    member: QrMember;
    action: Action;
  } | null>(null);
  const [storeId, setStoreId] = useState("");
  const request = useRef(0);
  const lock = useRef(false);
  const refresh = useCallback(async () => {
    const id = ++request.current;
    setLoading(true);
    setError("");
    setUncertain(false);
    try {
      const result = await accountApi<{ members: QrMember[]; total: number }>(
        `/members?page=${page}${filter ? `&storeId=${encodeURIComponent(filter)}` : ""}`,
      );
      if (id === request.current) {
        setMembers(result.members);
        setTotal(result.total);
      }
    } catch (e) {
      if (id === request.current) {
        setMembers([]);
        setError(
          `一覧を更新できませんでした。${e instanceof Error ? e.message : "接続を確認してください。"}`,
        );
      }
    } finally {
      if (id === request.current) setLoading(false);
    }
  }, [page, filter]);
  useEffect(() => {
    setMembers([]);
    void refresh();
    return () => {
      ++request.current;
    };
  }, [refresh]);
  async function update() {
    if (!confirmation || lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await accountApi(`/members/${confirmation.member.user_id}`, {
        method: "POST",
        body: JSON.stringify({
          action: confirmation.action,
          ...(confirmation.action === "assign_store" ? { storeId } : {}),
        }),
      });
      setConfirmation(null);
      notify("アカウントの設定を保存しました。");
      await refresh();
    } catch (e) {
      setUncertain(e instanceof AccountResultUnconfirmedError);
      setError(
        e instanceof Error
          ? e.message
          : "変更結果を確認できませんでした。一覧を更新して確認してください。",
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <section className="qr-account-management">
      <div className="qr-store-heading">
        <div>
          <h2>アカウント管理</h2>
          <p>登録ID・所属店舗・承認状態・全店舗管理者権限を管理します。</p>
        </div>
        <label className="field">
          所属店舗で絞り込む
          <select
            value={filter}
            onChange={(e) => {
              setFilter(e.target.value);
              setPage(0);
            }}
            disabled={busy}
          >
            <option value="">すべての店舗</option>
            {stores.map((store) => (
              <option value={store.id} key={store.id}>
                {store.name}
              </option>
            ))}
          </select>
        </label>
        <button
          className="button secondary"
          onClick={() => void refresh()}
          disabled={busy || loading}
        >
          一覧を更新
        </button>
      </div>
      {error && (
        <div
          className={
            uncertain ? "qr-account-message qr-result-unknown" : "error-message"
          }
          role="alert"
        >
          {error}
        </div>
      )}
      {loading ? (
        <p role="status">アカウントを取得しています…</p>
      ) : (
        <div className="qr-account-table">
          <table>
            <thead>
              <tr>
                <th>登録ID / メールアドレス</th>
                <th>所属店舗</th>
                <th>利用状態</th>
                <th>権限</th>
                <th>管理操作</th>
              </tr>
            </thead>
            <tbody>
              {members.map((member) => (
                <tr key={member.user_id}>
                  <td>
                    <strong>{member.email}</strong>
                    <small>{member.user_id}</small>
                    <small>
                      {member.email_verified
                        ? "メール確認済み"
                        : "メール未確認"}
                    </small>
                  </td>
                  <td>{member.store_name || "未割当"}</td>
                  <td>
                    {
                      {
                        pending: "承認待ち",
                        active: "利用中",
                        suspended: "停止中",
                      }[member.status]
                    }
                  </td>
                  <td>
                    {member.role === "admin" ? "全店舗管理者" : "店舗メンバー"}
                  </td>
                  <td>
                    {member.user_id === currentUserId ? (
                      "本人の設定は変更できません"
                    ) : (
                      <div className="qr-member-actions">
                        {(
                          [
                            "assign_store",
                            ...(member.status === "active"
                              ? ["suspend"]
                              : ["approve"]),
                            ...(member.role === "admin"
                              ? ["revoke_admin"]
                              : member.status === "active"
                                ? ["grant_admin"]
                                : []),
                          ] as Action[]
                        ).map((action) => (
                          <button
                            type="button"
                            className="button secondary"
                            key={action}
                            disabled={
                              busy ||
                              uncertain ||
                              ((action === "approve" ||
                                action === "grant_admin") &&
                                !member.email_verified)
                            }
                            onClick={() => {
                              setError("");
                              setStoreId(member.store_id || "");
                              setConfirmation({ member, action });
                            }}
                          >
                            {labels[action]}
                          </button>
                        ))}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {members.length === 0 && <p>登録アカウントはありません。</p>}
        </div>
      )}
      <div className="qr-account-pagination">
        <span>
          {total}件 / {page + 1}ページ
        </span>
        <button
          className="button secondary"
          disabled={page === 0 || busy || loading}
          onClick={() => setPage((value) => value - 1)}
        >
          前へ
        </button>
        <button
          className="button secondary"
          disabled={(page + 1) * 50 >= total || busy || loading}
          onClick={() => setPage((value) => value + 1)}
        >
          次へ
        </button>
      </div>
      {confirmation && (
        <Modal
          title={labels[confirmation.action]}
          locked={busy}
          onClose={() => {
            if (!busy) setConfirmation(null);
          }}
        >
          <p>{confirmation.member.email}</p>
          <small>{confirmation.member.user_id}</small>
          {confirmation.action === "grant_admin" && (
            <div className="qr-account-message">
              全店舗のQR・ファイル・アクセス履歴と登録アカウントを閲覧・管理できる権限を付与します。本人と権限の必要性を確認してください。
            </div>
          )}
          {confirmation.action === "assign_store" ? (
            <label className="field">
              変更先の店舗
              <select
                required
                value={storeId}
                onChange={(e) => setStoreId(e.target.value)}
                disabled={busy}
              >
                <option value="">店舗を選択してください</option>
                {stores.map((store) => (
                  <option value={store.id} key={store.id}>
                    {store.name}
                  </option>
                ))}
              </select>
              <small>
                既存QRを移動する操作ではありません。以後この店舗のデータを利用します。
              </small>
            </label>
          ) : (
            <p>この操作を実行しますか？変更履歴は記録されます。</p>
          )}
          {error && (
            <div
              className={
                uncertain
                  ? "qr-account-message qr-result-unknown"
                  : "error-message"
              }
              role="alert"
            >
              {error}
            </div>
          )}
          <div className="qr-admin-tabs">
            {uncertain && (
              <button
                className="button secondary"
                onClick={() => {
                  setConfirmation(null);
                  void refresh();
                }}
              >
                一覧で保存結果を確認
              </button>
            )}
            <button
              className="button secondary"
              disabled={busy}
              onClick={() => setConfirmation(null)}
            >
              キャンセル
            </button>
            <button
              className="button primary"
              disabled={
                busy ||
                uncertain ||
                (confirmation.action === "assign_store" && !storeId)
              }
              onClick={() => void update()}
            >
              {busy ? "保存しています…" : "確認して実行"}
            </button>
          </div>
        </Modal>
      )}
    </section>
  );
}
