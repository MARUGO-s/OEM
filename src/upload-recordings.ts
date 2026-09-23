import { api } from "./api";
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
  const worker = new Worker(new URL("./audio-worker.ts", import.meta.url), {
    type: "module",
  });
  let parts: Part[];
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
  const metadata = Object.fromEntries(
    ["title", "date", "participants", "template"].map((k) => [k, data.get(k)]),
  );
  const meeting = await api<Meeting>("/uploads", {
    method: "POST",
    body: JSON.stringify({
      metadata,
      sources: files.map((f) => ({ name: f.name, size: f.size })),
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
    progress("送信完了。文字起こしを開始しています…");
    return await api<Meeting>(`/meetings/${meeting.id}/complete`, {
      method: "POST",
    });
  } catch (error) {
    throw new Error(
      `${(error as Error).message} 一覧に取り込み途中の会議が残る場合は、画面を更新し、会議を削除して再度取り込んでください。送信完了済みなら文字起こしが進行します。`,
    );
  }
}
