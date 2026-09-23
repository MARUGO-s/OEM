import { test } from "node:test";
import assert from "node:assert/strict";
import { Input, MP4, BlobSource, EncodedPacketSink } from "mediabunny";
import {
  prepareAudio,
  validateRecordings,
  transcribeRecordings,
} from "../supabase/functions/_shared/audio.mjs";
import { aacFixture } from "./fixtures/aac.mjs";

test("AAC-LC ADTSを再圧縮なしでM4Aに変換し、全フレームを保持する", async () => {
  const result = await prepareAudio(
    new File([aacFixture], "録音.AAC", { type: "application/octet-stream" }),
  );
  assert.equal(result.extension, ".m4a");
  assert.equal(result.contentType, "audio/mp4");
  const input = new Input({
    formats: [MP4],
    source: new BlobSource(result.blob),
  });
  try {
    const track = await input.getPrimaryAudioTrack();
    assert.equal(await track.getSampleRate(), 44100);
    assert.equal(await track.getNumberOfChannels(), 1);
    let offset = 0;
    let count = 0;
    for await (const packet of new EncodedPacketSink(track).packets()) {
      const header = aacFixture[offset + 1] & 1 ? 7 : 9;
      const length =
        ((aacFixture[offset + 3] & 3) << 11) |
        (aacFixture[offset + 4] << 3) |
        (aacFixture[offset + 5] >> 5);
      assert.deepEqual(
        packet.data,
        aacFixture.slice(offset + header, offset + length),
      );
      offset += length;
      count++;
    }
    assert.equal(offset, aacFixture.length);
    assert.ok(count > 0);
    assert.ok(
      Math.abs((await input.computeDuration()) - (count * 1024) / 44100) <
        0.00001,
    );
    const remuxed = await prepareAudio(
      new File([result.blob], "mp4-contained.aac"),
    );
    assert.equal(remuxed.contentType, "audio/mp4");
  } finally {
    input.dispose();
  }
});

test("破損・末尾欠落・空AACを成功扱いにせず、ID3付きAACも読める", async () => {
  for (const bytes of [
    new Uint8Array(),
    new Uint8Array(50),
    aacFixture.slice(0, -1),
  ]) {
    await assert.rejects(
      prepareAudio(new File([bytes], "invalid.aac")),
      /AACを読み込めません/,
    );
  }
  const id3 = new Uint8Array([73, 68, 51, 4, 0, 0, 0, 0, 0, 0]);
  assert.equal(
    (await prepareAudio(new File([id3, aacFixture], "tagged.aac"))).extension,
    ".m4a",
  );
});

test("既存形式をそのまま渡し、5本・合計24 MB・空・形式を検証する", async () => {
  const file = new File(["wave"], "meeting.wav");
  assert.equal((await prepareAudio(file)).blob, file);
  validateRecordings([
    { name: "first.AAC", size: 12000000 },
    { name: "second.mp3", size: 12000000 },
  ]);
  assert.throws(
    () => validateRecordings(Array.from({ length: 6 }, () => file)),
    /5ファイル/,
  );
  assert.throws(
    () =>
      validateRecordings([
        { name: "a.wav", size: 12000001 },
        { name: "b.aac", size: 12000000 },
      ]),
    /合計24 MB/,
  );
  assert.throws(
    () => validateRecordings([{ name: "empty.aac", size: 0 }]),
    /空/,
  );
  assert.throws(
    () => validateRecordings([{ name: "bad.txt", size: 1 }]),
    /対応音声/,
  );
});

test("完了順でなく録音順に統合し、失敗分だけ再試行する", async () => {
  let saved;
  let finishFirst;
  const gate = new Promise((resolve) => {
    finishFirst = resolve;
  });
  await assert.rejects(
    transcribeRecordings(
      [
        { fileName: "first.aac" },
        { fileName: "second.wav" },
        { fileName: "third.mp3" },
      ],
      async (_, i) => {
        if (i === 0) {
          await gate;
          return "前半の提案";
        }
        if (i === 1) {
          finishFirst();
          throw new Error("network secret");
        }
        return "最後の決定";
      },
      async (parts) => {
        saved = parts;
      },
    ),
    (error) =>
      /録音2/.test(error.publicMessage) &&
      !error.publicMessage.includes("network secret"),
  );
  assert.equal(saved[0].transcript, "前半の提案");
  assert.equal(saved[2].transcript, "最後の決定");
  const calls = [];
  const text = await transcribeRecordings(
    saved,
    async (_, i) => {
      calls.push(i);
      return "中盤の議論";
    },
    async () => {},
  );
  assert.deepEqual(calls, [1]);
  assert.equal(
    text,
    "【録音 1】\n前半の提案\n\n【録音 2】\n中盤の議論\n\n【録音 3】\n最後の決定",
  );
});
