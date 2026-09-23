import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  ArrowRight,
  ArrowUp,
  ArrowDown,
  Check,
  FileAudio,
  FileText,
  LoaderCircle,
  UploadCloud,
  X,
} from "lucide-react";
import { Modal } from "./Modal";
import { AttachmentPicker } from "./Attachments";
import { today, modelName, type Settings } from "./types";

const LIMIT = 100_000_000;
const ACCEPT = ".mp3,.mp4,.mpeg,.mpga,.m4a,.aac,.wav,.webm,.ogg,.flac";
export function NewMeeting({
  settings,
  onClose,
  onCreate,
  onSettings,
}: {
  settings: Settings | null;
  onClose: () => void;
  onCreate: (
    data: FormData,
    progress: (message: string) => void,
  ) => Promise<void>;
  onSettings: () => void;
}) {
  const [mode, setMode] = useState<"file" | "text">("file");
  const [files, setFiles] = useState<File[]>([]);
  const [attachments, setAttachments] = useState<File[]>([]);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(today());
  const [participants, setParticipants] = useState("");
  const [template, setTemplate] = useState("standard");
  const [transcript, setTranscript] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [drag, setDrag] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!busy) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [busy]);
  function chooseFiles(selected: FileList | null) {
    if (!selected?.length) return;
    const next = [...files, ...Array.from(selected)];
    if (
      next.some(
        (file) =>
          !ACCEPT.split(",").includes(
            `.${file.name.split(".").pop()?.toLowerCase()}`,
          ),
      )
    ) {
      setError("AAC、MP3、M4A、WAVなどの対応音声ファイルを選んでください。");
      return;
    }
    if (next.length > 5) {
      setError("1つの会議に取り込める録音は5ファイルまでです。");
      return;
    }
    if (
      next.some((file) => file.size === 0) ||
      next.reduce((n, file) => n + file.size, 0) > LIMIT
    ) {
      setError("空ではない音声ファイルを、合計100 MB以下で選んでください。");
      return;
    }
    setFiles(next);
    setError("");
    if (!title) setTitle(next[0].name.replace(/\.[^.]+$/, ""));
  }
  function moveFile(index: number, direction: number) {
    setFiles((current) => {
      const next = [...current];
      [next[index], next[index + direction]] = [
        next[index + direction],
        next[index],
      ];
      return next;
    });
  }
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const data = new FormData();
      data.set("title", title);
      data.set("date", date);
      data.set("participants", participants);
      data.set("template", template);
      if (mode === "text") data.set("transcript", transcript);
      else files.forEach((file) => data.append("audio", file));
      attachments.forEach((file) => data.append("attachment", file));
      await onCreate(data, setProgress);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title="録音から議事録を作成"
      subtitle="分かれた録音も、順番につないで1つの議事録に。"
      onClose={onClose}
      locked={busy}
      wide
    >
      <form onSubmit={submit}>
        <div className="input-tabs">
          {(
            [
              ["file", UploadCloud, "録音ファイル"],
              ["text", FileText, "文字起こし済みテキスト"],
            ] as const
          ).map(([id, Icon, label]) => (
            <button
              type="button"
              key={id}
              className={mode === id ? "active" : ""}
              disabled={busy}
              onClick={() => {
                setMode(id);
                setError("");
              }}
            >
              <Icon size={17} />
              {label}
            </button>
          ))}
        </div>
        {mode === "file" && (
          <div
            className={`drop-zone ${drag ? "drag" : ""}`}
            onDragOver={(e) => {
              e.preventDefault();
              setDrag(true);
            }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDrag(false);
              if (!busy) chooseFiles(e.dataTransfer.files);
            }}
          >
            <UploadCloud size={32} />
            <strong>録音ファイルをここにドロップ</strong>
            <span>または</span>
            <button
              type="button"
              className="button secondary small"
              disabled={busy}
              onClick={() => input.current?.click()}
            >
              {files.length ? "ファイルを追加" : "ファイルを選択"}
            </button>
            <small>AAC / MP3 / M4A / WAV / MP4 / WebM / OGG / FLAC</small>
            <small>最大5ファイル・合計100 MBまで · 大きな録音は自動分割</small>
            <input
              ref={input}
              type="file"
              multiple
              disabled={busy}
              accept={ACCEPT}
              hidden
              onChange={(e) => {
                chooseFiles(e.target.files);
                e.target.value = "";
              }}
            />
          </div>
        )}
        {mode === "text" && (
          <label className="field">
            会話テキスト
            <textarea
              value={transcript}
              onChange={(e) => setTranscript(e.target.value)}
              placeholder="文字起こし済みの会話や、トーク履歴を貼り付けてください。"
              rows={7}
              maxLength={100000}
              required
            />
            <span className="field-hint">
              {transcript.length.toLocaleString()} / 100,000文字
            </span>
          </label>
        )}
        {files.length > 0 && mode === "file" && (
          <div className="recording-list">
            <p className="field-hint">
              上から録音順に並べてください。{files.length}ファイル / 合計
              {(
                files.reduce((n, file) => n + file.size, 0) / 1_000_000
              ).toFixed(2)}{" "}
              MB
            </p>
            {files.map((file, index) => (
              <div className="selected-audio" key={`${index}-${file.name}`}>
                <div>
                  <FileAudio size={21} />
                  <span>
                    <strong>
                      {index + 1}. {file.name}
                    </strong>
                    <small>
                      {(file.size / 1_000_000).toFixed(2)} MB
                      {file.name.toLowerCase().endsWith(".aac")
                        ? " · M4Aへ自動変換"
                        : ""}
                    </small>
                  </span>
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={`録音${index + 1}を上へ`}
                    disabled={busy || index === 0}
                    onClick={() => moveFile(index, -1)}
                  >
                    <ArrowUp size={17} />
                  </button>
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={`録音${index + 1}を下へ`}
                    disabled={busy || index === files.length - 1}
                    onClick={() => moveFile(index, 1)}
                  >
                    <ArrowDown size={17} />
                  </button>
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={`録音${index + 1}を解除`}
                    onClick={() => {
                      setFiles(files.filter((_, i) => i !== index));
                      setError("");
                    }}
                    disabled={busy}
                  >
                    <X size={17} />
                  </button>
                </div>
              </div>
            ))}
            <p className="field-hint">
              音声を自動分割し、この順番で1つの議事録にまとめます。切れた間の会話は補完しません。AACは再圧縮せずM4Aに変換します。送信完了まで画面を開いたままにしてください。
            </p>
          </div>
        )}
        <AttachmentPicker
          files={attachments}
          onChange={setAttachments}
          disabled={busy}
        />
        <div className="form-grid">
          <label className="field full">
            会議名
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={160}
              placeholder="例：新サービスのリリース定例"
              required
            />
          </label>
          <label className="field">
            開催日
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
            />
          </label>
          <label className="field">
            議事録の詳しさ
            <select
              value={template}
              onChange={(e) => setTemplate(e.target.value)}
            >
              <option value="standard">標準</option>
              <option value="brief">要点を簡潔に</option>
              <option value="detailed">背景も詳しく</option>
            </select>
          </label>
          <label className="field full">
            参加者 <span className="optional">任意</span>
            <input
              value={participants}
              onChange={(e) => setParticipants(e.target.value)}
              maxLength={2000}
              placeholder="例：田中、佐藤、鈴木"
            />
          </label>
        </div>
        <p className="processing-note">
          <Check size={15} />
          {mode === "file"
            ? `GPT-4o Transcribe → ${modelName(settings?.model)}`
            : modelName(settings?.model)}
          <br />
          <span>
            音声・テキスト・添付資料をOpenAIに送信して処理します。API利用料がかかります。
          </span>
        </p>
        {!settings?.configured && (
          <div className="notice">
            AIを使うにはAPIキーの設定が必要です。
            <button type="button" onClick={onSettings}>
              接続設定を開く
              <ArrowRight size={14} />
            </button>
          </div>
        )}
        {busy && (
          <p className="notice" role="status" aria-live="polite">
            {progress || "取り込み中…"}
            <br />
            送信完了までこの画面を開いておいてください。
          </p>
        )}
        {error && (
          <div className="error-message" role="alert">
            {error}
          </div>
        )}
        <div className="modal-footer">
          <span>取り込んだ音声はあとから再生できます</span>
          <button
            className="button primary"
            disabled={
              busy ||
              !settings?.configured ||
              (mode === "text" ? !transcript.trim() : !files.length)
            }
          >
            {busy ? (
              <LoaderCircle size={17} className="spin" />
            ) : (
              <span className="sparkle">✧</span>
            )}
            {busy ? "取り込み中…" : "解析して議事録を作成"}
            <ArrowRight size={16} />
          </button>
        </div>
      </form>
    </Modal>
  );
}
