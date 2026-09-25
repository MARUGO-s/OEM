// Deterministic synthetic video containers; no user media. The video track holds
// placeholder packets because only the audio track is ever read.
import {
  AudioSample,
  AudioSampleSource,
  BufferTarget,
  EncodedAudioPacketSource,
  EncodedPacket,
  EncodedVideoPacketSource,
  MkvOutputFormat,
  MovOutputFormat,
  Mp4OutputFormat,
  MpegTsOutputFormat,
  Output,
} from "mediabunny";
import { registerAc3Encoder } from "@mediabunny/ac3";
import { validateAdts } from "../../supabase/functions/_shared/audio.mjs";
import { aacFixture } from "./aac.mjs";

registerAc3Encoder();

// Minimal valid baseline 320x240 SPS/PPS; MPEG-TS demuxing parses the SPS.
const sps = [0x67, 0x42, 0, 0x1e, 0xda, 0x05, 0x07, 0xe4];
const pps = [0x68, 0xce, 0x3c, 0x80];
const avcConfig = {
  codec: "avc1.42001e",
  codedWidth: 320,
  codedHeight: 240,
  description: new Uint8Array([
    1,
    0x42,
    0,
    0x1e,
    0xff,
    0xe1,
    0,
    sps.length,
    ...sps,
    1,
    0,
    pps.length,
    ...pps,
  ]),
};

async function container(format, addAudio, seconds, withVideo = true) {
  const target = new BufferTarget();
  const output = new Output({ format, target });
  const video = withVideo && new EncodedVideoPacketSource("avc");
  if (video) output.addVideoTrack(video, { frameRate: 1 });
  const finishAudio = addAudio && (await addAudio(output));
  await output.start();
  for (let s = 0; video && s < seconds; s++)
    await video.add(
      new EncodedPacket(
        new Uint8Array([0, 0, 0, 4, 0x65, 0x88, 0x84, s]),
        "key",
        s,
        1,
      ),
      s === 0 ? { decoderConfig: avcConfig } : undefined,
    );
  if (finishAudio) await finishAudio();
  await output.finalize();
  return new Uint8Array(target.buffer);
}

const sine =
  (codec, seconds, sampleRate = 48000, channels = 2) =>
  async (output) => {
    const source = new AudioSampleSource({ codec, bitrate: 192000 });
    output.addAudioTrack(source);
    return async () => {
      for (let s = 0; s < seconds; s++) {
        const data = new Float32Array(sampleRate * channels);
        for (let i = 0; i < sampleRate; i++)
          data.fill(
            0.5 *
              Math.sin((2 * Math.PI * 440 * (s * sampleRate + i)) / sampleRate),
            i * channels,
            (i + 1) * channels,
          );
        const sample = new AudioSample({
          data,
          format: "f32",
          numberOfChannels: channels,
          sampleRate,
          timestamp: s,
        });
        await source.add(sample);
        sample.close();
      }
    };
  };

const aacFrames = () => validateAdts(aacFixture);
const aac = async (output) => {
  const source = new EncodedAudioPacketSource("aac");
  output.addAudioTrack(source);
  return async () => {
    const { decoderConfig, packets } = aacFrames();
    let first = true;
    for (const packet of packets) {
      await source.add(packet, first ? { decoderConfig } : undefined);
      first = false;
    }
  };
};
const dts = async (output) => {
  const source = new EncodedAudioPacketSource("dts");
  output.addAudioTrack(source);
  return async () => {
    for (let i = 0; i < 10; i++)
      await source.add(
        new EncodedPacket(new Uint8Array(64).fill(i), "key", i * 0.1, 0.1),
        i === 0
          ? {
              decoderConfig: {
                codec: "dtsc",
                sampleRate: 48000,
                numberOfChannels: 2,
              },
            }
          : undefined,
      );
  };
};

// Camcorder AVCHD/BDAV files prefix each 188-byte TS packet with a 4-byte timecode.
function toM2ts(ts) {
  const out = new Uint8Array((ts.length / 188) * 192);
  for (let i = 0; i < ts.length / 188; i++)
    out.set(ts.subarray(i * 188, (i + 1) * 188), i * 192 + 4);
  return out;
}

const file = (bytes, name) => new File([bytes], name);
export const videoFixtures = {
  movPcmBigEndian: async (seconds = 3) =>
    file(
      await container(
        new MovOutputFormat(),
        sine("pcm-s16be", seconds),
        seconds,
      ),
      "camera.MOV",
    ),
  mkvAc3: async (seconds = 3) =>
    file(
      await container(new MkvOutputFormat(), sine("ac3", seconds), seconds),
      "dolby.mkv",
    ),
  m2tsAc3: async (seconds = 3) =>
    file(
      toM2ts(
        await container(
          new MpegTsOutputFormat(),
          sine("ac3", seconds),
          seconds,
        ),
      ),
      "00001.MTS",
    ),
  mp4Aac: async () =>
    file(await container(new Mp4OutputFormat(), aac, 1), "zoom.mp4"),
  tsAac: async () =>
    file(await container(new MpegTsOutputFormat(), aac, 1), "tv.ts"),
  mkvDts: async () =>
    file(await container(new MkvOutputFormat(), dts, 1), "dts.mkv"),
  movSilent: async () =>
    file(await container(new MovOutputFormat(), null, 2), "no-audio.mov"),
};
export { aacFrames };
