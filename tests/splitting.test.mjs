import { test } from "node:test";
import assert from "node:assert/strict";
import { Input, ALL_FORMATS, BlobSource, EncodedPacketSink } from "mediabunny";
import { splitRecordings } from "../src/split-recordings.mjs";
import {
  validateAdts,
  transcribeRecordings,
} from "../supabase/functions/_shared/audio.mjs";
import { UploadSchema } from "../supabase/functions/_shared/upload.mjs";
import { aacFixture } from "./fixtures/aac.mjs";
import { createHash } from "node:crypto";
import { waveFile } from "./fixtures/wav.mjs";
test("100,000,000バイトの単一WAVを分割し、全PCMバイトを順序通り保持する", async () => {
  const file = waveFile();
  const parts = await splitRecordings([file]);
  assert.ok(parts.length >= 5);
  const actual = createHash("sha256");
  let size = 0,
    duration = 0;
  for (const part of parts) {
    assert.ok(part.blob.size <= 24_000_000);
    const input = new Input({
      formats: ALL_FORMATS,
      source: new BlobSource(part.blob),
    });
    try {
      const track = await input.getPrimaryAudioTrack();
      const sink = new EncodedPacketSink(track);
      let first = true;
      for await (const packet of sink.packets()) {
        if (first) assert.equal(packet.timestamp, 0);
        first = false;
        actual.update(packet.data);
        size += packet.data.length;
      }
      duration += await input.computeDuration();
    } finally {
      input.dispose();
    }
  }
  assert.equal(size, file.size - 44);
  assert.equal(
    actual.digest("hex"),
    createHash("sha256")
      .update(new Uint8Array(await file.slice(44).arrayBuffer()))
      .digest("hex"),
  );
  assert.ok(Math.abs(duration - (file.size - 44) / 176400) < 0.001);
});
test("AACはフレームの欠落・重複なしで時間境界分割し、録音の順序を保つ", async () => {
  const files = [
    new File([aacFixture, aacFixture], "first.aac"),
    new File([aacFixture], "second.aac"),
  ];
  const parts = await splitRecordings(files, () => {}, { durationLimit: 0.05 });
  assert.ok(parts.length > 2);
  for (let sourceIndex = 0; sourceIndex < files.length; sourceIndex++) {
    const expected = [
      ...validateAdts(new Uint8Array(await files[sourceIndex].arrayBuffer()))
        .packets,
    ].map((p) => p.data.slice(p.data[1] & 1 ? 7 : 9));
    const actual = [];
    for (const part of parts.filter((p) => p.sourceIndex === sourceIndex)) {
      const input = new Input({
        formats: ALL_FORMATS,
        source: new BlobSource(part.blob),
      });
      try {
        for await (const packet of new EncodedPacketSink(
          await input.getPrimaryAudioTrack(),
        ).packets())
          actual.push(packet.data);
      } finally {
        input.dispose();
      }
    }
    assert.deepEqual(actual, expected);
  }
  await assert.rejects(
    splitRecordings([new File([aacFixture.slice(0, -1)], "broken.aac")]),
    /録音1/,
  );
});
test("合計100 MBの境界、マニフェストの順序、件数、分割サイズを両側で検証する", async () => {
  const input = {
    metadata: { title: "test", date: "2026-09-23" },
    sources: [{ name: "a.wav", size: 100_000_000 }],
    parts: [
      {
        name: "recording-1-1.wav",
        size: 100,
        sourceIndex: 0,
        partNumber: 1,
        duration: 1,
      },
    ],
  };
  assert.ok(UploadSchema.safeParse(input).success);
  for (const mutation of [
    (v) => v.sources[0].size++,
    (v) => (v.parts[0].size = 24_000_001),
    (v) => (v.parts[0].sourceIndex = 1),
    (v) => (v.parts[0].partNumber = 2),
    (v) => v.sources.push(...Array(5).fill(v.sources[0])),
  ]) {
    const copy = structuredClone(input);
    mutation(copy);
    assert.equal(UploadSchema.safeParse(copy).success, false);
  }
  await assert.rejects(splitRecordings([{ size: 100_000_001 }]), /100 MB/);
  await assert.rejects(
    splitRecordings([{ size: 50_000_000 }, { size: 50_000_001 }]),
    /100 MB/,
  );
});
test("分割文字起こしは1回1本、保存済みをスキップし最終回だけ連結する", async () => {
  let parts = Array.from({ length: 8 }, (_, i) => ({
    fileName: `${i}.wav`,
    transcript: "",
  }));
  const calls = [];
  for (let i = 0; i < parts.length; i++) {
    const text = await transcribeRecordings(
      parts,
      async (_, index) => {
        calls.push(index);
        return `会話${index}`;
      },
      async (next) => {
        parts = next;
      },
      1,
    );
    if (i < 7) assert.equal(text, null);
    else assert.ok(text.endsWith("会話7"));
  }
  assert.deepEqual(calls, [0, 1, 2, 3, 4, 5, 6, 7]);
});
