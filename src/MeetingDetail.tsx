import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Check,
  CheckCheck,
  ChevronDown,
  Clipboard,
  Clock3,
  Download,
  FileText,
  ListTodo,
  LoaderCircle,
  MessageSquareText,
  Pencil,
  RefreshCw,
  Save,
  Sparkles,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { api, download, audioUrl } from "./api";
import {
  clock,
  isWorking,
  modelName,
  transcriptionModelName,
  type Meeting,
} from "./types";
import { Modal } from "./Modal";
import { AttachmentPanel } from "./Attachments";
import { MeetingSchedule } from "./Calendar";

function Markdown({ content }: { content: string }) {
  return (
    <div className="markdown">
      {content.split("\n").map((line, i) => {
        if (line.startsWith("# ")) return <h1 key={i}>{line.slice(2)}</h1>;
        if (line.startsWith("## ")) return <h2 key={i}>{line.slice(3)}</h2>;
        if (line.startsWith("### ")) return <h3 key={i}>{line.slice(4)}</h3>;
        if (/^- \[[ x]\] /.test(line))
          return (
            <p className="md-list" key={i}>
              <span>{line.startsWith("- [x]") ? "☑" : "☐"}</span>
              {line.slice(6)}
            </p>
          );
        if (line.startsWith("- "))
          return (
            <p className="md-list" key={i}>
              <span>•</span>
              {line.slice(2)}
            </p>
          );
        return line.trim() ? (
          <p key={i}>{line}</p>
        ) : (
          <div className="md-space" key={i} />
        );
      })}
    </div>
  );
}

export function ActionList({
  meeting,
  onChange,
  notify,
  disabled = false,
}: {
  meeting: Meeting;
  onChange: (m: Meeting) => void;
  notify: (s: string) => void;
  disabled?: boolean;
}) {
  const [saving, setSaving] = useState(false);
  const actions = meeting.minutes?.actions || [];
  async function toggle(index: number) {
    setSaving(true);
    try {
      const complete = new Set(meeting.completedActions);
      if (complete.has(index)) complete.delete(index);
      else complete.add(index);
      onChange(
        await api<Meeting>(`/meetings/${meeting.id}`, {
          method: "PATCH",
          body: JSON.stringify({ completedActions: [...complete] }),
        }),
      );
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setSaving(false);
    }
  }
  return (
    <div className="action-list">
      {actions.length ? (
        actions.map((action, i) => (
          <div
            className={`action-item ${meeting.completedActions.includes(i) ? "completed" : ""}`}
            key={i}
          >
            <button
              className="task-checkbox"
              disabled={disabled || saving || isWorking(meeting)}
              role="checkbox"
              aria-checked={meeting.completedActions.includes(i)}
              aria-label={`${action.task}を${meeting.completedActions.includes(i) ? "未完了" : "完了"}にする`}
              onClick={() => toggle(i)}
            >
              {meeting.completedActions.includes(i) && <Check size={13} />}
            </button>
            <div>
              <strong>{action.task}</strong>
              <span>
                <span className="person-dot">
                  {action.owner.slice(0, 1) || "?"}
                </span>
                {action.owner || "未定"}
                <span className="action-due">
                  <CalendarDays size={12} />
                  {action.due || "未定"}
                </span>
              </span>
            </div>
          </div>
        ))
      ) : (
        <p className="muted empty-inline">アクションアイテムはありません。</p>
      )}
    </div>
  );
}

export function MeetingDetail({
  meeting: m,
  onBack,
  backLabel,
  onCalendar,
  onChange,
  onDelete,
  notify,
  onEditingChange,
}: {
  meeting: Meeting;
  onBack: () => void;
  backLabel: string;
  onCalendar: (date?: string) => void;
  onChange: (m: Meeting) => void;
  onDelete: (id: string) => void;
  notify: (s: string) => void;
  onEditingChange: (value: boolean) => void;
}) {
  const [tab, setTab] = useState<"minutes" | "transcript" | "actions">(
    "minutes",
  );
  const [editing, setEditing] = useState(false);
  const [attachmentsBusy, setAttachmentsBusy] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<"delete" | "regenerate" | null>(null);
  const audio = useRef<HTMLAudioElement>(null);
  const [audioSource, setAudioSource] = useState("");
  const [audioPart, setAudioPart] = useState(0);
  const recordings = m.recordings?.length
    ? m.recordings
    : [{ fileName: m.fileName || "録音", transcribed: Boolean(m.transcript) }];
  useEffect(() => {
    onEditingChange(editing || attachmentsBusy);
    return () => onEditingChange(false);
  }, [editing, attachmentsBusy, onEditingChange]);
  useEffect(() => {
    if (!m.hasAudio || tab !== "transcript") return;
    let alive = true;
    setAudioSource("");
    void audioUrl(m.id, audioPart)
      .then((url) => {
        if (alive) setAudioSource(url);
      })
      .catch((e) => {
        if (alive) notify(e.message);
      });
    return () => {
      alive = false;
    };
  }, [m.id, m.hasAudio, tab, notify, audioPart]);
  const processing = isWorking(m);
  useEffect(() => {
    if (!editing) return;
    const prevent = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", prevent);
    return () => window.removeEventListener("beforeunload", prevent);
  }, [editing]);
  function beginEdit() {
    setDraft(tab === "minutes" ? m.markdown : m.transcript);
    setEditing(true);
  }
  async function save() {
    setBusy(true);
    try {
      onChange(
        await api<Meeting>(`/meetings/${m.id}`, {
          method: "PATCH",
          body: JSON.stringify(
            tab === "minutes" ? { markdown: draft } : { transcript: draft },
          ),
        }),
      );
      setEditing(false);
      notify("変更を保存しました。全員の共有内容に反映されます。");
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function regenerate() {
    setBusy(true);
    try {
      onChange(
        await api<Meeting>(`/meetings/${m.id}/retry`, { method: "POST" }),
      );
      setConfirm(null);
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    setBusy(true);
    try {
      await api(`/meetings/${m.id}`, { method: "DELETE" });
      onDelete(m.id);
      notify("会議をゴミ箱に移動しました");
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const displayText = tab === "transcript" ? m.transcript : m.markdown;
  return (
    <>
      <div className="detail-top">
        <button
          className="text-button"
          disabled={editing || attachmentsBusy}
          onClick={onBack}
        >
          <ArrowLeft size={16} />
          {backLabel}
        </button>
        <div className="detail-tools">
          <span className="autosave">
            <Check size={13} />
            {editing ? "編集中・未保存" : "保存済み"}
          </span>
          <details className="export-menu">
            <summary className="button secondary small">
              <Download size={15} />
              書き出す
              <ChevronDown size={13} />
            </summary>
            <div>
              {[
                [
                  "議事録（Markdown）",
                  () => download(`${m.title}.md`, m.markdown),
                ],
                [
                  "文字起こし（テキスト）",
                  () => download(`${m.title}_文字起こし.txt`, m.transcript),
                ],
                [
                  "すべてのデータ（JSON）",
                  () =>
                    download(
                      `${m.title}.json`,
                      JSON.stringify(m, null, 2),
                      "application/json",
                    ),
                ],
                ["印刷・PDFに保存", () => window.print()],
              ].map(([label, run]) => (
                <button
                  key={label as string}
                  onClick={(e) => {
                    (run as () => void)();
                    e.currentTarget.closest("details")?.removeAttribute("open");
                  }}
                >
                  {label as string}
                </button>
              ))}
            </div>
          </details>
        </div>
      </div>
      <header className="meeting-heading">
        <div className="eyebrow">
          <span
            className={`badge ${m.isDemo ? "sample" : m.status === "done" ? "success" : "neutral"}`}
          >
            {m.isDemo
              ? "サンプル会議"
              : m.status === "done"
                ? "作成完了"
                : m.status === "error"
                  ? "要確認"
                  : m.status === "uploading"
                    ? "取り込み途中"
                    : "AI処理中"}
          </span>
          <span>MEETING NOTES</span>
        </div>
        <h1>{m.title}</h1>
        <div className="meeting-meta">
          <span>
            <CalendarDays size={15} />
            {m.date.replaceAll("-", ".")}
          </span>
          <span>
            <Users size={15} />
            {m.participants || "参加者未記入"}
          </span>
          {m.duration !== null && (
            <span>
              <Clock3 size={15} />
              {clock(m.duration)}
            </span>
          )}
        </div>
      </header>
      {m.isDemo && (
        <div className="sample-note">
          <Sparkles size={15} />
          操作確認用の架空の会議です。実際の録音を解析した結果ではありません。
        </div>
      )}
      {m.status === "uploading" && (
        <div className="notice" role="status">
          音声の取り込み途中です。送信中の画面で完了をお待ちください。送信を中断した場合は、この会議を削除してファイルを選び直してください。
        </div>
      )}
      {processing && (
        <div className="progress-panel" role="status">
          <LoaderCircle className="spin" size={23} />
          <div>
            <strong>
              {m.status === "transcribing"
                ? `録音を文字起こししています${recordings.length > 1 ? `（${recordings.filter((part) => part.transcribed).length}/${recordings.length} 完了）` : ""}`
                : m.attachments?.length
                  ? "会話と添付資料を照合して議事録を作成しています"
                  : "会話を解析して議事録を作成しています"}
            </strong>
            <p>
              {m.status === "transcribing"
                ? `${transcriptionModelName(m.transcriptionModel)}が音声を読み取っています。`
                : `${modelName(m.minutesModel)}が議題・決定事項・アクションを整理しています。`}{" "}
              完了分は保存されます。アプリを閉じた場合、残りの処理は次回開いたときに再開します。
            </p>
          </div>
        </div>
      )}
      {m.error && (
        <div className="error-message detail-error" role="alert">
          <span>{m.error}</span>
          <button
            className="button secondary small"
            onClick={regenerate}
            disabled={busy}
          >
            <RefreshCw size={14} />
            再試行
          </button>
        </div>
      )}
      {m.minutesStale && (
        <div className="notice">
          文字起こし、または添付資料が変更されています。現在の議事録は変更前の内容です。反映するには「再生成」を実行してください。
        </div>
      )}
      {!m.isDemo && (
        <MeetingSchedule
          meeting={m}
          onOpen={onCalendar}
          disabled={editing || attachmentsBusy || busy}
        />
      )}
      <AttachmentPanel
        meeting={m}
        locked={processing || editing || busy || m.status === "uploading"}
        onChange={onChange}
        onBusyChange={setAttachmentsBusy}
        notify={notify}
      />
      <div className="detail-grid">
        <section className="document-panel">
          <div className="document-tabs">
            {(
              [
                ["minutes", FileText, "議事録"],
                ["transcript", MessageSquareText, "文字起こし"],
                ["actions", ListTodo, "アクション"],
              ] as const
            ).map(([id, Icon, label]) => (
              <button
                key={id}
                disabled={editing}
                className={tab === id ? "active" : ""}
                onClick={() => setTab(id)}
              >
                <Icon size={16} />
                {label}
                {id === "actions" && (
                  <span>{m.minutes?.actions.length || 0}</span>
                )}
              </button>
            ))}
          </div>
          <div className="document-toolbar">
            <span>
              {tab === "minutes"
                ? "会議の内容を、ひとつの記録に。"
                : tab === "transcript"
                  ? "取り込んだ会話の全文"
                  : "次にやることを明確に。"}
            </span>
            <div>
              {tab !== "actions" && (displayText || m.minutes || editing) && (
                <>
                  {editing ? (
                    <>
                      <button
                        className="text-button"
                        onClick={() => {
                          if (
                            draft === displayText ||
                            window.confirm(
                              "保存していない本文の変更を破棄しますか？",
                            )
                          )
                            setEditing(false);
                        }}
                        disabled={busy}
                      >
                        <X size={14} />
                        取消
                      </button>
                      <button
                        className="button primary small"
                        onClick={save}
                        disabled={
                          busy || (tab === "transcript" && !draft.trim())
                        }
                      >
                        <Save size={14} />
                        保存
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        className="icon-button"
                        aria-label="内容をコピー"
                        onClick={() =>
                          navigator.clipboard
                            .writeText(displayText)
                            .then(() => notify("コピーしました"))
                            .catch(() =>
                              notify(
                                "コピーできませんでした。書き出しをご利用ください。",
                              ),
                            )
                        }
                      >
                        <Clipboard size={15} />
                      </button>
                      <button
                        className="text-button"
                        onClick={beginEdit}
                        disabled={processing || attachmentsBusy}
                      >
                        <Pencil size={14} />
                        {tab === "minutes"
                          ? "議事録を編集"
                          : "文字起こしを編集"}
                      </button>
                    </>
                  )}
                </>
              )}
            </div>
          </div>
          {editing ? (
            <div className="editor-wrap">
              <p>
                {tab === "minutes"
                  ? "見出しは「## 」、箇条書きは「- 」で記入できます。「保存」で全員に共有します。カレンダー・AI抽出の要点・決定事項・アクションは別管理のため、本文の変更は自動反映しません。再生成すると編集した本文は上書きされます。"
                  : "文字起こしの修正後、議事録を再生成できます。"}
              </p>
              <textarea
                className="document-editor"
                aria-label={
                  tab === "minutes" ? "議事録を編集" : "文字起こしを編集"
                }
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                maxLength={tab === "minutes" ? 150000 : 100000}
              />
            </div>
          ) : tab === "minutes" ? (
            m.markdown ? (
              <Markdown content={m.markdown} />
            ) : (
              <div className="document-empty">
                <FileText size={36} />
                <h3>
                  {processing
                    ? "議事録を準備しています"
                    : "議事録はまだありません"}
                </h3>
                <p>解析が完了すると、ここに議事録が表示されます。</p>
              </div>
            )
          ) : tab === "transcript" ? (
            <div className="transcript-content">
              {m.hasAudio && (
                <>
                  {recordings.length > 1 && (
                    <label className="field">
                      再生する録音（全{recordings.length}ファイル）
                      <select
                        value={audioPart}
                        onChange={(e) => setAudioPart(Number(e.target.value))}
                      >
                        {recordings.map((part, index) => (
                          <option key={index} value={index}>
                            {index + 1}. {part.fileName}
                            {part.transcribed ? "" : "（文字起こし未完了）"}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  <audio
                    key={`${m.id}-${audioPart}`}
                    ref={audio}
                    controls
                    src={audioSource || undefined}
                    preload="metadata"
                  />
                </>
              )}
              {m.segments.length ? (
                m.segments.map((s, i) => (
                  <div className="transcript-segment" key={i}>
                    <div>
                      <span className={`speaker-avatar color-${i % 3}`}>
                        {s.speaker.slice(0, 1)}
                      </span>
                      <strong>{m.speakerNames[s.speaker] || s.speaker}</strong>
                      {s.start !== null && (
                        <span className="time-code">{clock(s.start)}</span>
                      )}
                    </div>
                    <p>{s.text}</p>
                  </div>
                ))
              ) : m.transcript ? (
                <>
                  {m.source === "audio" && (
                    <p className="transcript-note">
                      {transcriptionModelName(m.transcriptionModel)}
                      Transcribeの出力です。話者名・タイムスタンプは付与していません。
                    </p>
                  )}
                  <p className="transcript-text">{m.transcript}</p>
                </>
              ) : (
                <div className="document-empty">
                  <MessageSquareText size={32} />
                  <p>文字起こしの完了をお待ちください。</p>
                </div>
              )}
            </div>
          ) : (
            <div className="actions-content">
              <ActionList
                meeting={m}
                onChange={onChange}
                notify={notify}
                disabled={editing || busy || attachmentsBusy}
              />
            </div>
          )}
        </section>
        <aside className="meeting-insights">
          <div className="insight-card">
            <h3>
              <Sparkles size={17} />
              会議のポイント（AI抽出）
            </h3>
            <p>
              {m.minutes?.summary ||
                "解析後に、会議の要点がここにまとまります。"}
            </p>
          </div>
          <div className="insight-card">
            <h3>
              <CheckCheck size={17} />
              決まったこと（AI抽出）
              <span>{m.minutes?.decisions.length || 0}</span>
            </h3>
            {m.minutes?.decisions.length ? (
              <ul className="decision-list">
                {m.minutes.decisions.map((d, i) => (
                  <li key={i}>
                    <Check size={14} />
                    {d}
                  </li>
                ))}
              </ul>
            ) : (
              <p>決定事項はまだありません。</p>
            )}
          </div>
          <div className="insight-card">
            <h3>
              <ListTodo size={17} />
              次のアクション<span>{m.minutes?.actions.length || 0}</span>
            </h3>
            <ActionList
              meeting={m}
              onChange={onChange}
              notify={notify}
              disabled={editing || busy || attachmentsBusy}
            />
            <button
              className="text-button purple"
              onClick={() => setTab("actions")}
              disabled={editing}
            >
              アクションを確認
              <ArrowRight size={14} />
            </button>
          </div>
          <div className="source-note">
            <span>解析モデル</span>
            <strong>
              {m.isDemo ? "サンプルデータ" : modelName(m.minutesModel)}
            </strong>
            <small>
              {m.hasAudio
                ? `文字起こし: ${transcriptionModelName(m.transcriptionModel)}。`
                : "文字起こし済みテキストを使用。"}
              AIの出力は元の会話と照合し、必要に応じて編集してください。
            </small>
          </div>
          <div className="meeting-manage">
            {!m.isDemo && (
              <button
                className="text-button"
                disabled={
                  processing ||
                  busy ||
                  editing ||
                  attachmentsBusy ||
                  m.status === "uploading"
                }
                onClick={() => setConfirm("regenerate")}
              >
                <RefreshCw size={14} />
                議事録を再生成
              </button>
            )}
            <button
              className="text-button delete-button"
              disabled={processing || editing || attachmentsBusy}
              onClick={() => setConfirm("delete")}
            >
              <Trash2 size={14} />
              会議を削除
            </button>
          </div>
        </aside>
      </div>
      {confirm && (
        <Modal
          title={
            confirm === "delete"
              ? "この会議を削除しますか？"
              : "議事録を再生成しますか？"
          }
          onClose={() => setConfirm(null)}
          locked={busy}
        >
          <p className="confirm-copy">
            {confirm === "delete"
              ? m.status === "uploading"
                ? "取り込み途中の会議を一覧から取り除きます。クラウドに送信済みの未完了音声は完全に削除され、元に戻せません。元の録音ファイルから再度取り込めます。"
                : "会議と音声を一覧から取り除き、アプリの保存先にあるゴミ箱へ移動します。"
              : "現在の文字起こし・全添付資料と接続設定のモデルで再解析します。編集した議事録本文とアクションの完了状態は上書きされます。カレンダーの手動変更は保持します。API利用料がかかります。"}
          </p>
          <div className="modal-footer">
            <button
              className="button secondary"
              onClick={() => setConfirm(null)}
              disabled={busy}
            >
              キャンセル
            </button>
            <button
              className={`button ${confirm === "delete" ? "danger" : "primary"}`}
              disabled={busy}
              onClick={confirm === "delete" ? remove : regenerate}
            >
              {busy && <LoaderCircle size={15} className="spin" />}
              {confirm === "delete" ? "ゴミ箱へ移動" : "再生成する"}
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
