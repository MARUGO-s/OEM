import { useEffect, useRef, useState } from "react";
import { Paperclip, Download, LoaderCircle, X, FileText, UploadCloud } from "lucide-react";
import {
  attachmentTypes,
  validateAttachments,
} from "../supabase/functions/_shared/attachments.mjs";
import { api } from "./api";
import { isCloud } from "./cloud";
import type { Attachment, Meeting } from "./types";

const fileSize = (bytes: number) =>
  bytes < 1_000_000
    ? `${Math.max(1, Math.round(bytes / 1000))} KB`
    : `${(bytes / 1_000_000).toFixed(2)} MB`;

export function AttachmentNotice() {
  return (
    <p className="field-hint attachment-notice">
      資料は解析時にOpenAIへ送信され、追加のAPI利用料がかかります。Excel・CSVは各シート先頭1,000行までの解析です。Word・Excel・PowerPointの図表や画像が重要な場合はPDFも添付してください。パスワード付きの資料は解除してから選んでください。
    </p>
  );
}
export function AttachmentPicker({
  files,
  onChange,
  disabled = false,
  existing = [],
}: {
  files: File[];
  onChange: (files: File[]) => void;
  disabled?: boolean;
  existing?: Attachment[];
}) {
  const input = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState("");
  function addFiles(incoming: FileList | null) {
    if (disabled || !incoming?.length) return;
    const selected = [...files, ...Array.from(incoming)];
    try {
      validateAttachments([...existing, ...selected]);
      onChange(selected);
      setError("");
    } catch (error) {
      setError((error as Error).message);
    }
  }
  return (
    <div
      className={`attachment-picker ${dragging && !disabled ? "drag" : ""}`}
      onDragEnter={(event) => {
        if (disabled || !event.dataTransfer.types.includes("Files")) return;
        event.preventDefault();
        dragDepth.current += 1;
        setDragging(true);
      }}
      onDragOver={(event) => {
        if (disabled || !event.dataTransfer.types.includes("Files")) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
      }}
      onDragLeave={() => {
        dragDepth.current = Math.max(0, dragDepth.current - 1);
        if (dragDepth.current === 0) setDragging(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        dragDepth.current = 0;
        setDragging(false);
        addFiles(event.dataTransfer.files);
      }}
    >
      <div className="attachment-heading">
        <strong>
          <Paperclip size={17} />
          会議の添付資料 <span className="optional">任意</span>
        </strong>
        <button
          type="button"
          className="button secondary small"
          disabled={disabled}
          onClick={() => input.current?.click()}
        >
          資料ファイルを選択
        </button>
      </div>
      <p className="field-hint">
        Excel・Word・PDF・PowerPoint・CSV・TXT ／ 最大5ファイル・各10 MB・合計25
        MB（録音とは別枠）
      </p>
      <div className="attachment-drop-hint">
        <UploadCloud size={19} />
        <span>資料をここにドラッグ＆ドロップ、または上のボタンから選択</span>
      </div>
      <input
        hidden
        type="file"
        ref={input}
        accept={Object.keys(attachmentTypes).join(",")}
        multiple
        disabled={disabled}
        onChange={(event) => {
          addFiles(event.target.files);
          event.target.value = "";
        }}
      />
      {files.map((file, index) => (
        <div className="attachment-row" key={`${index}-${file.name}`}>
          <FileText size={18} />
          <span className="attachment-name">
            {file.name}
            <small>{fileSize(file.size)}</small>
          </span>
          <button
            type="button"
            className="icon-button"
            disabled={disabled}
            aria-label={`${file.name}の選択を解除`}
            onClick={() => {
              onChange(files.filter((_, i) => i !== index));
              setError("");
            }}
          >
            <X size={16} />
          </button>
        </div>
      ))}
      {error && (
        <p className="error-message" role="alert">
          {error}
        </p>
      )}
      <AttachmentNotice />
    </div>
  );
}

export function AttachmentPanel({
  meeting,
  locked,
  onChange,
  onBusyChange,
  notify,
}: {
  meeting: Meeting;
  locked: boolean;
  onChange: (m: Meeting) => void;
  onBusyChange: (v: boolean) => void;
  notify: (s: string) => void;
}) {
  const [files, setFiles] = useState<File[]>([]),
    [busy, setBusy] = useState(false),
    [confirm, setConfirm] = useState<string | null>(null),
    [error, setError] = useState("");
  const saved = meeting.attachments || [];
  useEffect(() => {
    if (!busy) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [busy]);
  async function save() {
    setBusy(true);
    onBusyChange(true);
    setError("");
    try {
      validateAttachments([...saved, ...files]);
      for (const file of files) {
        const form = new FormData();
        form.set("id", crypto.randomUUID());
        form.set("attachment", file);
        onChange(
          await api<Meeting>(`/meetings/${meeting.id}/attachments`, {
            method: "POST",
            body: form,
          }),
        );
        setFiles((current) => current.slice(1));
      }
      notify("資料を保存しました。「議事録を再生成」で解析に反映できます。");
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
      onBusyChange(false);
    }
  }
  async function remove(id: string) {
    setBusy(true);
    onBusyChange(true);
    setError("");
    try {
      onChange(
        await api<Meeting>(`/meetings/${meeting.id}/attachments/${id}`, {
          method: "DELETE",
        }),
      );
      setConfirm(null);
      notify(
        "資料の関連付けを解除しました。議事録を再生成すると反映されます。",
      );
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
      onBusyChange(false);
    }
  }
  async function download(file: Attachment) {
    try {
      const route = `/meetings/${meeting.id}/attachments/${file.id}`;
      const url = isCloud
        ? (await api<{ url: string }>(route)).url
        : `/api${route}`;
      const a = document.createElement("a");
      a.href = url;
      a.download = file.name;
      a.rel = "noopener noreferrer";
      a.click();
    } catch (error) {
      setError((error as Error).message);
    }
  }
  return (
    <section className="attachment-panel" aria-label="保存した添付資料">
      <div className="attachment-heading">
        <h3>
          <Paperclip size={19} />
          添付資料 <span>{saved.length}</span>
        </h3>
        <span className="field-hint">
          {isCloud ? "ログインした全員で共有" : "このPCに保存"}
        </span>
      </div>
      {!saved.length && (
        <p className="field-hint">
          関連資料を保存すると、会話との関連性・相違点を照合した議事録を作れます。
        </p>
      )}
      {saved.map((file) => {
        const review = meeting.minutes?.documentReview?.find(
          (r) => r.attachmentId === file.id,
        );
        return (
          <div className="attachment-item" key={file.id}>
            <div className="attachment-row">
              <FileText size={19} />
              <span className="attachment-name">
                {file.name}
                <small>
                  {fileSize(file.size)}
                  {review
                    ? ` · ${meeting.minutesStale ? "以前の解析：" : ""}${review.relevance}`
                    : " · 未解析"}
                </small>
              </span>
              <button
                className="text-button"
                disabled={busy}
                onClick={() => void download(file)}
              >
                <Download size={15} />
                ダウンロード
              </button>
              <button
                className="icon-button"
                aria-label={`${file.name}の関連付けを解除`}
                disabled={locked || busy}
                onClick={() => setConfirm(file.id)}
              >
                <X size={16} />
              </button>
            </div>
            {confirm === file.id && (
              <div className="notice">
                この会議の解析対象から外します。保存ファイルは保持され、管理者による復元が可能です。
                <button
                  className="text-button"
                  disabled={busy}
                  onClick={() => setConfirm(null)}
                >
                  取消
                </button>
                <button
                  className="text-button"
                  disabled={busy}
                  onClick={() => void remove(file.id)}
                >
                  関連付けを解除する
                </button>
              </div>
            )}
          </div>
        );
      })}
      {!meeting.isDemo && (
        <>
          <AttachmentPicker
            files={files}
            onChange={setFiles}
            disabled={locked || busy}
            existing={saved}
          />
          {!!files.length && (
            <button
              className="button secondary small"
              disabled={locked || busy}
              onClick={() => void save()}
            >
              {busy && <LoaderCircle size={16} className="spin" />}
              選択した資料を保存
            </button>
          )}
          {!!saved.length && (
            <p className="field-hint">
              保存だけではAI解析は実行しません。「議事録を再生成」で全資料を会話と一緒に解析します。照合結果は議事録の「添付資料との照合」に表示されます。
            </p>
          )}
        </>
      )}
      {error && (
        <p className="error-message" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
