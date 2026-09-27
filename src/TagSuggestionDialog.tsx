import { useEffect, useRef, useState } from "react";
import { LoaderCircle } from "lucide-react";
import { Modal } from "./Modal";
import { type Meeting } from "./types";

export function TagSuggestionDialog({
  meeting,
  load,
  save,
  onClose,
}: {
  meeting: Meeting;
  load: (retry?: boolean) => Promise<string[]>;
  save: (tags: string[]) => Promise<void>;
  onClose: () => void;
}) {
  const [candidates, setCandidates] = useState<string[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const saveLock = useRef(false);
  // The parent caches the request, including across StrictMode effect replays.
  const loadRef = useRef(load);
  loadRef.current = load;
  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadError("");
    void loadRef
      .current(attempt > 0)
      .then((tags) => {
        if (active) setCandidates(tags);
      })
      .catch((error) => {
        if (active)
          setLoadError(
            error instanceof Error
              ? error.message
              : "候補を取得できませんでした。",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [attempt]);

  const additions = selected.filter((tag) => !meeting.tags?.includes(tag));
  async function submit() {
    if (saveLock.current || !additions.length) return;
    saveLock.current = true;
    setSaving(true);
    setSaveError("");
    try {
      await save(additions);
      onClose();
    } catch (error) {
      setSaveError(
        error instanceof Error ? error.message : "タグを保存できませんでした。",
      );
    } finally {
      saveLock.current = false;
      setSaving(false);
    }
  }

  return (
    <Modal
      title="AIタグ候補を選択"
      subtitle={meeting.title}
      onClose={onClose}
      locked={saving}
    >
      <p>
        議事録に付けたいタグを選び、「選んだタグを保存」を押してください。既存のタグは残ります。
      </p>
      <p className="muted">
        選ぶだけでは保存されません。
      </p>
      {loading && (
        <p role="status">
          <LoaderCircle size={16} className="spin" /> タグ候補を生成しています…
        </p>
      )}
      {loadError && (
        <div role="alert">
          <p>{loadError}</p>
          <p>議事録は完成しています。タグを付けずに閉じても問題ありません。</p>
          <button
            className="button secondary"
            onClick={() => setAttempt((value) => value + 1)}
          >
            候補を再取得
          </button>
        </div>
      )}
      {!loading && !loadError && (
        <>
          {candidates.length ? (
            <fieldset className="ai-tag-options">
              <legend>タグ候補（複数選択可）</legend>
              {candidates.map((tag) => {
                const assigned = meeting.tags?.includes(tag) || false;
                return (
                  <label key={tag} className="ai-tag-option">
                    <input
                      type="checkbox"
                      checked={assigned || selected.includes(tag)}
                      disabled={assigned || saving}
                      onChange={(event) =>
                        setSelected((prev) =>
                          event.target.checked
                            ? [...prev, tag]
                            : prev.filter((value) => value !== tag),
                        )
                      }
                    />
                    <span>
                      {tag}
                      {assigned ? "（登録済み）" : ""}
                    </span>
                  </label>
                );
              })}
            </fieldset>
          ) : (
            <p>
              今回の議事録にはタグ候補がありませんでした。手動でタグを追加できます。
            </p>
          )}
        </>
      )}
      {saveError && <p role="alert">{saveError}</p>}
      <div className="modal-footer">
        <button
          className="button secondary"
          onClick={onClose}
          disabled={saving}
        >
          今は付けない
        </button>
        <button
          className="button primary"
          onClick={submit}
          disabled={loading || !!loadError || !additions.length || saving}
        >
          {saving ? "保存中…" : `選んだタグを保存（${additions.length}件）`}
        </button>
      </div>
    </Modal>
  );
}
