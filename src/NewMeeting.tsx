import { useRef, useState, type FormEvent } from "react";
import {
  ArrowRight,
  Check,
  FileAudio,
  FileText,
  LoaderCircle,
  UploadCloud,
  X,
} from "lucide-react";
import { Modal } from "./Modal";
import { today, modelName, type Settings } from "./types";

const LIMIT = 24_000_000;
const ACCEPT = ".mp3,.mp4,.mpeg,.mpga,.m4a,.wav,.webm,.ogg,.flac";
export function NewMeeting({
  settings,
  onClose,
  onCreate,
  onSettings,
}: {
  settings: Settings | null;
  onClose: () => void;
  onCreate: (data: FormData) => Promise<void>;
  onSettings: () => void;
}) {
  const [mode, setMode] = useState<"file" | "text">("file");
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(today());
  const [participants, setParticipants] = useState("");
  const [template, setTemplate] = useState("standard");
  const [transcript, setTranscript] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  function chooseFile(next?: File) {
    if (!next) return;
    const extension = `.${next.name.split(".").pop()?.toLowerCase()}`;
    if (!ACCEPT.split(",").includes(extension)) {
      setError("MP3、M4A、WAVなどの対応音声ファイルを選んでください。");
      return;
    }
    if (next.size > LIMIT || next.size === 0) {
      setError(
        "音声は0バイトより大きく、24 MB以下のファイルを選んでください。",
      );
      return;
    }
    setFile(next);
    setError("");
    if (!title) setTitle(next.name.replace(/\.[^.]+$/, ""));
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
      else if (file) data.set("audio", file);
      await onCreate(data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title="録音から議事録を作成"
      subtitle="録音済みのファイルを取り込んで、会話を整理します。"
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
              if (!busy) chooseFile(e.dataTransfer.files[0]);
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
              ファイルを選択
            </button>
            <small>MP3 / M4A / WAV / MP4 / WebM / OGG / FLAC · 最大24 MB</small>
            <input
              ref={input}
              type="file"
              accept={ACCEPT}
              hidden
              onChange={(e) => chooseFile(e.target.files?.[0])}
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
        {file && mode === "file" && (
          <div className="selected-audio">
            <div>
              <FileAudio size={21} />
              <span>
                <strong>{file.name}</strong>
                <small>
                  {(file.size / 1_000_000).toFixed(2)} MB · 取り込み準備完了
                </small>
              </span>
              <button
                type="button"
                className="icon-button"
                aria-label="音声ファイルを解除"
                onClick={() => setFile(null)}
                disabled={busy}
              >
                <X size={17} />
              </button>
            </div>
          </div>
        )}
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
            音声・テキストをOpenAIに送信して処理します。API利用料がかかります。
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
              (mode === "text" ? !transcript.trim() : !file)
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
