import { z } from "zod";

export const MAX_FILE_SIZE = 24 * 1000 * 1000;
export const MAX_TEXT_LENGTH = 100_000;
export const audioExtensions = new Set([
  ".mp3",
  ".mp4",
  ".mpeg",
  ".mpga",
  ".m4a",
  ".aac",
  ".wav",
  ".webm",
  ".ogg",
  ".flac",
]);
const text = z.string();
export const MinutesSchema = z.object({
  summary: text,
  topics: z.array(z.object({ title: text, points: z.array(text) })),
  decisions: z.array(text),
  actions: z.array(z.object({ task: text, owner: text, due: text })),
  openQuestions: z.array(text),
});

export const MetadataSchema = z.object({
  title: z.string().trim().min(1, "会議名を入力してください。").max(160),
  date: z.iso.date(),
  participants: z.string().max(2000).default(""),
  template: z.enum(["standard", "brief", "detailed"]).default("standard"),
});

export const PatchSchema = z
  .object({
    title: z.string().trim().min(1).max(160).optional(),
    markdown: z.string().max(150_000).optional(),
    transcript: z.string().trim().min(1).max(MAX_TEXT_LENGTH).optional(),
    completedActions: z
      .array(z.number().int().nonnegative())
      .max(500)
      .optional(),
    speakerNames: z
      .record(z.string().max(100), z.string().trim().min(1).max(100))
      .optional(),
  })
  .strict();

export function timecode(seconds) {
  if (!Number.isFinite(seconds)) return "";
  const value = Math.max(0, Math.floor(seconds));
  const mins = Math.floor(value / 60);
  return `${String(mins).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
}

export function transcriptFromSegments(segments, names = {}) {
  return segments
    .map(
      (s) =>
        `${s.start === null ? "" : `[${timecode(s.start)}] `}${names[s.speaker] || s.speaker}：${s.text}`,
    )
    .join("\n\n");
}

export function minutesToMarkdown(meeting, minutes) {
  const lines = [
    `# ${meeting.title}`,
    "",
    `日時：${meeting.date}`,
    `参加者：${meeting.participants || "未記入"}`,
    "",
    "## サマリー",
    "",
    minutes.summary,
  ];
  for (const topic of minutes.topics)
    lines.push(
      "",
      `## ${topic.title}`,
      "",
      ...topic.points.map((p) => `- ${p}`),
    );
  lines.push(
    "",
    "## 決定事項",
    "",
    ...(minutes.decisions.length
      ? minutes.decisions.map((d) => `- ${d}`)
      : ["決定事項の記録はありません。"]),
  );
  lines.push(
    "",
    "## アクションアイテム",
    "",
    ...(minutes.actions.length
      ? minutes.actions.map(
          (a) =>
            `- [ ] ${a.task}（担当：${a.owner || "未定"} / 期限：${a.due || "未定"}）`,
        )
      : ["アクションの記録はありません。"]),
  );
  lines.push(
    "",
    "## 継続検討・確認事項",
    "",
    ...(minutes.openQuestions.length
      ? minutes.openQuestions.map((q) => `- ${q}`)
      : ["確認事項の記録はありません。"]),
  );
  return lines.join("\n");
}

export function safeError(error) {
  if (error.status === 401)
    return "APIキーを確認してください。接続設定から更新できます。";
  if (error.status === 429)
    return "AIの利用上限または混雑により処理できませんでした。利用枠を確認して再試行してください。";
  if (error.status === 413)
    return "音声が大きすぎます。24 MB以下のファイルを選択してください。";
  if (error.status === 400)
    return "AIへの入力が受け付けられませんでした。音声形式・長さ、モデルの利用条件を確認してください。";
  if (error.status === 404)
    return "AIモデルを利用できません。モデル設定とAPIの利用権限を確認してください。";
  if (error.name === "APIConnectionTimeoutError" || error.name === "AbortError")
    return "処理がタイムアウトしました。しばらくしてから再試行してください。";
  if (error.code === "EMPTY_AUDIO")
    return "音声から発話を検出できませんでした。録音内容をご確認ください。";
  if (error.code === "TEXT_TOO_LONG")
    return "文字起こしが10万文字を超えました。会議を分割して取り込んでください。";
  return "AI処理を完了できませんでした。保存済みの文字起こしは残っています。接続を確認して再試行してください。";
}
