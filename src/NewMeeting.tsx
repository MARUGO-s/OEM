import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  ArrowRight,
  ArrowUp,
  ArrowDown,
  Check,
  FileAudio,
  FileText,
  LoaderCircle,
  Mic,
  Pause,
  Play,
  ScreenShare,
  Square,
  UploadCloud,
  X,
} from "lucide-react";
import { Modal } from "./Modal";
import { AttachmentPicker } from "./Attachments";
import {
  today,
  modelName,
  transcriptionModelName,
  type Settings,
} from "./types";
import {
  discardSession,
  getRecordingCapabilities,
  isMobileDevice,
  listRecoverableSessions,
  recoverSession,
  startRecording,
  type RecorderController,
  type RecordingMode,
  type RecordingSessionMeta,
} from "./recording";

const LIMIT = 100_000_000;
const ACCEPT = ".mp3,.mp4,.mpeg,.mpga,.m4a,.aac,.wav,.webm,.ogg,.flac";
function formatElapsed(totalSeconds: number) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}
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
  const [mode, setMode] = useState<"record" | "file" | "text">("file");
  const [files, setFiles] = useState<File[]>([]);
  const [attachments, setAttachments] = useState<File[]>([]);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(today());
  const [participants, setParticipants] = useState("");
  const [template, setTemplate] = useState("detailed");
  const [transcript, setTranscript] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [drag, setDrag] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const caps = getRecordingCapabilities();
  const isMobile = isMobileDevice();
  const [mobileWarning, setMobileWarning] = useState(false);
  const [recordingMode, setRecordingMode] = useState<RecordingMode>("mic");
  const [recordingState, setRecordingState] = useState<
    "idle" | "starting" | "recording" | "paused" | "stopping"
  >("idle");
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [recordingError, setRecordingError] = useState("");
  const [level, setLevel] = useState(0);
  const [recoverable, setRecoverable] = useState<RecordingSessionMeta[]>([]);
  const recorderRef = useRef<RecorderController | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  useEffect(() => {
    listRecoverableSessions()
      .then(setRecoverable)
      .catch(() => {});
  }, []);
  useEffect(
    () => () => {
      recorderRef.current?.cancel().catch(() => {});
    },
    [],
  );
  useEffect(() => {
    if (recordingState !== "recording" && recordingState !== "paused") return;
    let raf = 0;
    let last = 0;
    const data = new Uint8Array(analyserRef.current?.fftSize ?? 512);
    const loop = (time: number) => {
      const analyser = analyserRef.current;
      if (analyser && time - last > 100) {
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (const v of data) {
          const d = v - 128;
          sum += d * d;
        }
        setLevel(Math.min(1, (Math.sqrt(sum / data.length) / 128) * 4));
        last = time;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [recordingState]);
  useEffect(() => {
    if (!busy) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [busy]);
  async function startRec() {
    setRecordingError("");
    setRecordingState("starting");
    try {
      const controller = await startRecording(recordingMode, setRecordingSeconds);
      recorderRef.current = controller;
      analyserRef.current = controller.getAnalyser();
      setRecordingState("recording");
    } catch (e) {
      setRecordingError((e as Error).message);
      setRecordingState("idle");
    }
  }
  function pauseRec() {
    recorderRef.current?.pause();
    setRecordingState("paused");
  }
  function resumeRec() {
    recorderRef.current?.resume();
    setRecordingState("recording");
  }
  async function stopRec() {
    const controller = recorderRef.current;
    if (!controller) return;
    setRecordingState("stopping");
    try {
      const file = await controller.stop();
      chooseFiles([file]);
      setMode("file");
    } catch (e) {
      setRecordingError((e as Error).message);
    } finally {
      recorderRef.current = null;
      analyserRef.current = null;
      setRecordingState("idle");
      setRecordingSeconds(0);
      setLevel(0);
    }
  }
  async function cancelRec() {
    const controller = recorderRef.current;
    recorderRef.current = null;
    analyserRef.current = null;
    setRecordingState("idle");
    setRecordingSeconds(0);
    setLevel(0);
    await controller?.cancel().catch(() => {});
  }
  async function recoverOne(meta: RecordingSessionMeta) {
    try {
      const file = await recoverSession(meta.id);
      chooseFiles([file]);
      setMode("file");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRecoverable((current) => current.filter((s) => s.id !== meta.id));
    }
  }
  async function discardOne(id: string) {
    await discardSession(id).catch(() => {});
    setRecoverable((current) => current.filter((s) => s.id !== id));
  }
  function chooseFiles(selected: FileList | File[] | null) {
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
      onClose={() => {
        if (recorderRef.current) cancelRec();
        onClose();
      }}
      locked={busy}
      wide
    >
      <form onSubmit={submit}>
        {recoverable.length > 0 && (
          <div className="notice">
            前回中断した録音があります（
            {recoverable
              .map((s) => new Date(s.startedAt).toLocaleString("ja-JP"))
              .join("、")}
            ）。復元しますか？
            <span className="recover-actions">
              {recoverable.map((s) => (
                <span key={s.id}>
                  <button type="button" onClick={() => recoverOne(s)}>
                    復元して追加
                  </button>
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => discardOne(s.id)}
                  >
                    破棄
                  </button>
                </span>
              ))}
            </span>
          </div>
        )}
        <div className="input-tabs">
          {(
            [
              ["record", Mic, "その場で録音"],
              ["file", UploadCloud, "録音ファイル"],
              ["text", FileText, "文字起こし済みテキスト"],
            ] as const
          ).map(([id, Icon, label]) => (
            <button
              type="button"
              key={id}
              className={mode === id ? "active" : ""}
              disabled={busy || recordingState !== "idle"}
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
        {mode === "record" && (
          <div className="record-panel">
            {recordingState === "idle" && mobileWarning && (
              <div className="record-mobile-warning">
                <strong>録音中はこの画面を開いたままにしてください</strong>
                <p>
                  スマートフォン・タブレットでは、バックグラウンドでの録音はできません。アプリを閉じたり、他のアプリ・ホーム画面に切り替えたりすると、その時点で録音が止まります。
                </p>
                <div className="record-controls">
                  <button
                    type="button"
                    className="button secondary small"
                    onClick={() => setMobileWarning(false)}
                  >
                    キャンセル
                  </button>
                  <button
                    type="button"
                    className="button primary"
                    onClick={() => {
                      setMobileWarning(false);
                      startRec();
                    }}
                  >
                    <Mic size={17} />
                    了解して録音を開始
                  </button>
                </div>
              </div>
            )}
            {recordingState === "idle" && !mobileWarning && (
              <>
                <div className="record-mode-toggle">
                  <button
                    type="button"
                    className={recordingMode === "mic" ? "active" : ""}
                    onClick={() => setRecordingMode("mic")}
                  >
                    <Mic size={16} />
                    マイクのみ
                  </button>
                  {caps.canRecordMeeting && (
                    <button
                      type="button"
                      className={recordingMode === "mic+tab" ? "active" : ""}
                      onClick={() => setRecordingMode("mic+tab")}
                    >
                      <ScreenShare size={16} />
                      マイク＋会議の音声（ブラウザーのタブ）
                    </button>
                  )}
                </div>
                <p className="field-hint">
                  {recordingMode === "mic+tab"
                    ? "会議をブラウザーのタブで開いている場合のみ使えます（Google Meet、ブラウザー版Zoom/Teamsなど）。開始すると共有ダイアログが出るので「Chromeタブ」から会議のタブを選び、「タブの音声を共有」にチェックを入れてください。ZoomやTeamsの専用デスクトップアプリで参加している場合は音声を拾えません。"
                    : "この端末のマイクを録音します。オンライン会議の相手の声は、スピーカーの音量に左右されます。"}
                </p>
                {!caps.canRecordMic && (
                  <p className="error-message">
                    このブラウザー・端末は録音に対応していません。録音ファイルを選ぶか、テキストを貼り付けてください。
                  </p>
                )}
                <button
                  type="button"
                  className="button primary"
                  disabled={!caps.canRecordMic}
                  onClick={() => {
                    if (isMobile) setMobileWarning(true);
                    else startRec();
                  }}
                >
                  <Mic size={17} />
                  録音を開始
                </button>
              </>
            )}
            {recordingState === "starting" && (
              <p className="field-hint">
                <LoaderCircle size={15} className="spin" />{" "}
                {recordingMode === "mic+tab"
                  ? "共有するタブを選んでください…"
                  : "マイクを準備しています…"}
              </p>
            )}
            {(recordingState === "recording" ||
              recordingState === "paused" ||
              recordingState === "stopping") && (
              <div className="record-active">
                <div className="record-time">
                  {formatElapsed(recordingSeconds)}
                  {recordingState === "paused" && <span> ・一時停止中</span>}
                </div>
                <div className="record-level">
                  <div
                    className="record-level-bar"
                    style={{ width: `${level * 100}%` }}
                  />
                </div>
                <div className="record-controls">
                  {recordingState === "recording" && (
                    <button
                      type="button"
                      className="icon-button"
                      aria-label="一時停止"
                      onClick={pauseRec}
                    >
                      <Pause size={18} />
                    </button>
                  )}
                  {recordingState === "paused" && (
                    <button
                      type="button"
                      className="icon-button"
                      aria-label="再開"
                      onClick={resumeRec}
                    >
                      <Play size={18} />
                    </button>
                  )}
                  <button
                    type="button"
                    className="button danger"
                    disabled={recordingState === "stopping"}
                    onClick={stopRec}
                  >
                    {recordingState === "stopping" ? (
                      <LoaderCircle size={16} className="spin" />
                    ) : (
                      <Square size={16} />
                    )}
                    停止して追加
                  </button>
                  <button
                    type="button"
                    className="button secondary small"
                    disabled={recordingState === "stopping"}
                    onClick={cancelRec}
                  >
                    キャンセル
                  </button>
                </div>
                <p className="field-hint">
                  停止すると録音が取り込み一覧に追加されます。画面を閉じても直近の数秒分以外は保持されますが、送信まではこの画面を開いたままにしてください。
                </p>
              </div>
            )}
            {recordingError && (
              <div className="error-message" role="alert">
                {recordingError}
              </div>
            )}
          </div>
        )}
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
        {files.length > 0 && mode !== "text" && (
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
          {mode !== "text"
            ? `${transcriptionModelName(settings?.transcriptionModel)} → ${modelName(settings?.model)}`
            : modelName(settings?.model)}
          <br />
          <span>
            音声は選択した文字起こしサービスへ、テキストと添付資料はOpenAIへ送信して処理します。API利用料がかかります。
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
        {settings?.configured &&
          mode !== "text" &&
          settings.transcriptionModel === "gemini-3.5-transcribe" &&
          !settings.geminiConfigured && (
            <div className="notice">
              Gemini文字起こしを使うにはGemini APIキーが必要です。
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
              (mode !== "text" &&
                settings?.transcriptionModel === "gemini-3.5-transcribe" &&
                !settings?.geminiConfigured) ||
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
