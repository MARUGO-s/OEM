import {
  Input,
  BlobSource,
  ALL_FORMATS,
  ADTS,
  Output,
  BufferTarget,
  Mp4OutputFormat,
  Mp3OutputFormat,
  WavOutputFormat,
  OggOutputFormat,
  FlacOutputFormat,
  EncodedPacketSink,
  EncodedAudioPacketSource,
  Conversion,
  Quality,
  canEncodeAudio,
} from "mediabunny";
import { validateAdts } from "../supabase/functions/_shared/audio.mjs";

export const BATCH_LIMIT = 100_000_000;
export const PART_LIMIT = 24_000_000;
export const MAX_PARTS = 512;

// Packet copying (not PCM decoding) keeps memory bounded and preserves audio.
// Each result has its own container/header and zero-based playback timestamps.
export async function splitRecordings(
  files,
  progress = (_progress) => {},
  options = {},
) {
  if (
    !files.length ||
    files.length > 5 ||
    files.some((f) => !f.size) ||
    files.reduce((n, f) => n + f.size, 0) > BATCH_LIMIT
  )
    throw new Error("録音は最大5ファイル、合計100 MB以下で選んでください。");
  const byteLimit = options.byteLimit ?? 20_000_000;
  const durationLimit = options.durationLimit ?? 600;
  const parts = [];
  for (const [sourceIndex, file] of files.entries()) {
    const input = new Input({
      source: new BlobSource(file),
      formats: ALL_FORMATS,
    });
    let output;
    try {
      let codec, decoderConfig, packets;
      if ((await input.getFormat()) === ADTS) {
        codec = "aac";
        ({ decoderConfig, packets } = validateAdts(
          new Uint8Array(await file.arrayBuffer()),
        ));
      } else {
        const track = await input.getPrimaryAudioTrack();
        if (!track) throw new Error("音声トラックがありません。");
        codec = await track.getCodec();
        decoderConfig = await track.getDecoderConfig();
        packets = new EncodedPacketSink(track).packets();
      }
      const formatFor = () =>
        codec === "aac"
          ? new Mp4OutputFormat({ fastStart: false })
          : codec === "mp3"
            ? new Mp3OutputFormat()
            : codec === "flac"
              ? new FlacOutputFormat()
              : ["opus", "vorbis"].includes(codec)
                ? new OggOutputFormat()
                : new WavOutputFormat();
      if (!codec || !formatFor().getSupportedAudioCodecs().includes(codec))
        throw new Error(
          "この音声コーデックは分割できません。M4A・MP3・WAVで書き出してください。",
        );
      let target,
        source,
        start = 0,
        end = 0,
        bytes = 0,
        count = 0,
        partNumber = 0,
        consumed = 0;
      const finish = async () => {
        if (!count) return;
        await output.finalize();
        const format = formatFor();
        const extension = codec === "aac" ? ".m4a" : format.fileExtension;
        const type =
          codec === "aac"
            ? "audio/mp4"
            : codec === "opus" || codec === "vorbis"
              ? "audio/ogg"
              : format.mimeType;
        const blob = new Blob([target.buffer], { type });
        if (blob.size > PART_LIMIT)
          throw new Error(
            "分割後の音声が大きすぎます。別の音声形式で書き出してください。",
          );
        parts.push({
          blob,
          name: `recording-${sourceIndex + 1}-${++partNumber}${extension}`,
          fileName: file.name,
          sourceIndex,
          partNumber,
          duration: end - start,
        });
        if (
          parts.length > MAX_PARTS ||
          parts.reduce((n, p) => n + p.blob.size, 0) > 110_000_000
        )
          throw new Error(
            "分割後のデータ量が上限を超えます。録音を複数の会議に分けてください。",
          );
        count = 0;
        bytes = 0;
      };
      for await (const packet of packets) {
        if (
          count &&
          (bytes + packet.data.byteLength > byteLimit ||
            packet.timestamp - start >= durationLimit)
        )
          await finish();
        if (!count) {
          target = new BufferTarget();
          output = new Output({ format: formatFor(), target });
          source = new EncodedAudioPacketSource(codec);
          output.addAudioTrack(source);
          await output.start();
          start = packet.timestamp;
        }
        await source.add(
          packet.clone({ timestamp: packet.timestamp - start }),
          count === 0 ? { decoderConfig } : undefined,
        );
        bytes += packet.data.byteLength;
        consumed += packet.data.byteLength;
        end = Math.max(end, packet.timestamp + packet.duration);
        if (++count % 400 === 0)
          progress({ sourceIndex, ratio: Math.min(1, consumed / file.size) });
      }
      await finish();
      if (!partNumber) throw new Error("音声が空です。");
      progress({ sourceIndex, ratio: 1 });
    } catch (error) {
      if (output && output.state !== "finalized")
        await output.cancel().catch(() => {});
      throw new Error(
        `録音${sourceIndex + 1}「${file.name}」: ${error.message || "音声を読み込めませんでした。"}`,
      );
    } finally {
      input.dispose();
    }
  }
  return parts;
}

export const VIDEO_EXTENSIONS = [".mp4", ".m4v", ".mov", ".webm", ".mkv"];
// Mono 48 kbps keeps speech intelligible at roughly 22 MB per hour.
const COMPRESSED_BITRATE = 48_000;

function audioOutputFor(codec) {
  if (codec === "aac")
    return {
      format: new Mp4OutputFormat({ fastStart: false }),
      extension: ".m4a",
      type: "audio/mp4",
    };
  const format =
    codec === "mp3"
      ? new Mp3OutputFormat()
      : codec === "flac"
        ? new FlacOutputFormat()
        : ["opus", "vorbis"].includes(codec)
          ? new OggOutputFormat()
          : new WavOutputFormat();
  return {
    format,
    extension: format.fileExtension,
    type: ["opus", "vorbis"].includes(codec) ? "audio/ogg" : format.mimeType,
  };
}

async function convertAudio(file, { compress, onProgress }) {
  const input = new Input({
    source: new BlobSource(file),
    formats: ALL_FORMATS,
  });
  try {
    if (!compress && !(await input.getPrimaryVideoTrack())) return file;
    const track = await input.getPrimaryAudioTrack();
    if (!track) throw new Error(`「${file.name}」に音声が含まれていません。`);
    let audio;
    let codec = await track.getCodec();
    if (compress) {
      const quality = new Quality(COMPRESSED_BITRATE);
      const options = { numberOfChannels: 1, sampleRate: 48_000, quality };
      codec = (await canEncodeAudio("aac", options)) ? "aac" : "opus";
      if (!(await canEncodeAudio(codec, options)))
        throw new Error(
          "このブラウザでは音声を圧縮できません。Chrome・Edge・Safariの最新版をお使いください。",
        );
      audio = { ...options, codec, forceTranscode: true };
    }
    const { format, extension, type } = audioOutputFor(codec);
    const target = new BufferTarget();
    const conversion = await Conversion.init({
      input,
      output: new Output({ format, target }),
      video: { discard: true },
      audio,
      showWarnings: false,
    });
    if (!conversion.isValid)
      throw new Error(
        `「${file.name}」の音声を取り出せませんでした。音声ファイルに書き出してから選んでください。`,
      );
    if (onProgress) conversion.onProgress = onProgress;
    await conversion.execute();
    return new File(
      [target.buffer],
      file.name.replace(/\.[^.]+$/, "") + extension,
      { type },
    );
  } finally {
    input.dispose();
  }
}

// Video files are far larger than their audio, so keep only the audio track
// (copied without re-encoding) before the size limits are applied.
export function extractAudio(file, onProgress) {
  return convertAudio(file, { compress: false, onProgress });
}

// Re-encode to low-bitrate mono when a recording is too large to upload.
export function compressAudio(file, onProgress) {
  return convertAudio(file, { compress: true, onProgress });
}
