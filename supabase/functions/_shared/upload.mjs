import { z } from "zod";
import { MetadataSchema, MAX_FILE_SIZE } from "./domain.mjs";
export const MAX_BATCH_SIZE = 100_000_000;
const SourceSchema = z
  .object({
    name: z.string().min(1).max(500),
    size: z.number().int().positive().max(MAX_BATCH_SIZE),
  })
  .strict();
const PartSchema = z
  .object({
    name: z.string().regex(/^recording-\d+-\d+\.(m4a|mp3|wav|ogg|flac)$/),
    size: z.number().int().positive().max(MAX_FILE_SIZE),
    sourceIndex: z.number().int().min(0).max(4),
    partNumber: z.number().int().positive(),
    duration: z.number().positive().max(610),
  })
  .strict();
export const UploadSchema = z
  .object({
    metadata: MetadataSchema,
    sources: z.array(SourceSchema).min(1).max(5),
    parts: z.array(PartSchema).min(1).max(512),
  })
  .strict()
  .superRefine((value, ctx) => {
    const bad = (message) => ctx.addIssue({ code: "custom", message });
    if (value.sources.reduce((n, s) => n + s.size, 0) > MAX_BATCH_SIZE)
      bad("録音は合計100 MBまでです。");
    if (value.parts.reduce((n, p) => n + p.size, 0) > 110_000_000)
      bad("分割後のデータ量が上限を超えています。");
    let index = 0;
    for (const [sourceIndex] of value.sources.entries()) {
      let number = 1;
      while (value.parts[index]?.sourceIndex === sourceIndex) {
        if (value.parts[index].partNumber !== number++)
          bad("録音の分割順序が不正です。");
        index++;
      }
      if (number === 1) bad("音声が不足しています。");
    }
    if (index !== value.parts.length) bad("録音の順序が不正です。");
  });
export function uploadDocument(input, id, model) {
  return {
    ...input.metadata,
    id,
    createdAt: new Date().toISOString(),
    status: "uploading",
    source: "audio",
    isDemo: false,
    fileName: input.sources[0].name,
    sources: input.sources,
    uploadPlan: input.parts,
    audioParts: [],
    chunked: true,
    duration: null,
    transcript: "",
    segments: [],
    minutes: null,
    markdown: "",
    speakerNames: {},
    completedActions: [],
    error: null,
    minutesStale: false,
    minutesModel: model,
    transcriptionModel: "gpt-4o-transcribe",
  };
}
export function uploadPart(document, index) {
  if (document.status !== "uploading")
    throw Object.assign(new Error("アップロードは終了しています。"), {
      status: 409,
    });
  const part = document.uploadPlan?.[index];
  if (
    !Number.isInteger(index) ||
    index < 0 ||
    !part ||
    index !== document.audioParts.length
  )
    throw Object.assign(
      new Error("録音を先頭から順番にアップロードしてください。"),
      { status: 409 },
    );
  return {
    ...part,
    fileName: `${document.sources[part.sourceIndex].name}（${part.partNumber}）`,
  };
}
