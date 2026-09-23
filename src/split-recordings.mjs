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
