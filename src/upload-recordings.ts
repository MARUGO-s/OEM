import { api } from "./api";
import { attachmentDigest } from "../supabase/functions/_shared/attachments.mjs";
import type { Meeting } from "./types";
type Part = {
  blob: Blob;
  name: string;
  sourceIndex: number;
  partNumber: number;
  duration: number;
};
export async function uploadRecordings(
  data: FormData,
  progress: (message: string) => void,
) {
  const files = data.getAll("audio") as File[];
  const attachments = (data.getAll("attachment") as File[]).map((file) => ({
    file,
    id: crypto.randomUUID(),
  }));
  let parts: Part[] = [];
  if (files.length) {
    const worker = new Worker(new URL("./audio-worker.ts", import.meta.url), {
      type: "module",
    });
    progress("音声を確認し、自動分割しています…");
    try {
      parts = await new Promise<Part[]>((resolve, reject) => {
        worker.onmessage = ({ data }) => {
          if (data.error) reject(new Error(data.error));
          else if (data.parts) resolve(data.parts);
          else if (data.progress)
            progress(
              `録音${data.progress.sourceIndex + 1}/${files.length}を準備中 ${Math.round(data.progress.ratio * 100)}%`,
            );
        };
        worker.onerror = () =>
          reject(
            new Error(
              "音声の準備に失敗しました。ブラウザーを更新して再度お試しください。",
            ),
          );
        worker.postMessage(files);
      });
    } finally {
      worker.terminate();
    }
  }
  const metadata = Object.fromEntries(
    ["title", "date", "participants", "template"].map((k) => [k, data.get(k)]),
  );
  if (attachments.length) progress("添付資料の内容を確認しています…");
  const attachmentPlan = await Promise.all(attachments.map(async ({ file, id }) => ({
    id,
    name: file.name,
    size: file.size,
    sha256: await attachmentDigest(await file.arrayBuffer()),
  })));
  const meeting = await api<Meeting>("/uploads", {
    method: "POST",
    body: JSON.stringify({
      metadata,
      sources: files.map((f) => ({ name: f.name, size: f.size })),
      transcript: data.get("transcript") || "",
      attachments: attachmentPlan,
      parts: parts.map(({ blob, name, sourceIndex, partNumber, duration }) => ({
        name,
        size: blob.size,
        sourceIndex,
        partNumber,
        duration,
      })),
    }),
  });
  // Keep completed parts in a visible draft on transport failure. Never delete a
  // potentially committed/processing meeting after an uncertain response.
  try {
    const total = parts.reduce((n, p) => n + p.blob.size, 0);
    let sent = 0;
    for (const [index, part] of parts.entries()) {
      progress(
        `音声を送信中 ${index + 1}/${parts.length}（${Math.round((sent / total) * 100)}%）`,
      );
      await api(`/meetings/${meeting.id}/parts?index=${index}`, {
        method: "POST",
        body: part.blob,
      });
      sent += part.blob.size;
    }
    for (const [index, { file, id }] of attachments.entries()) {
      progress(
        `添付資料を保存中 ${index + 1}/${attachments.length}：${file.name}`,
      );
      const form = new FormData();
      form.set("id", id);
      form.set("attachment", file);
      await api(`/meetings/${meeting.id}/attachments`, {
        method: "POST",
        body: form,
      });
    }
    progress(
      files.length
        ? "送信完了。文字起こしを開始しています…"
        : "送信完了。会話の解析を開始しています…",
    );
    return await api<Meeting>(`/meetings/${meeting.id}/complete`, {
      method: "POST",
    });
  } catch (error) {
    throw new Error(
      `${(error as Error).message} 一覧に取り込み途中の会議が残る場合は、画面を更新し、会議を削除して再度取り込んでください。送信完了済みなら解析が進行します。`,
    );
  }
}
