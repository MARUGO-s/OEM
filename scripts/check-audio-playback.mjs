// macOS-only smoke check, using independent Core Audio decoding.
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";
import { aacFixture } from "../tests/fixtures/aac.mjs";
import { prepareAudio } from "../supabase/functions/_shared/audio.mjs";
const directory = await mkdtemp(join(tmpdir(), "kotonoha-audio-check-"));
const first = join(directory, "01-前半.aac");
const second = join(directory, "02-後半.m4a");
await writeFile(first, aacFixture);
const result = await prepareAudio(new File([aacFixture], "tone.aac"));
await writeFile(second, new Uint8Array(await result.blob.arrayBuffer()));
for (const [index, file] of [first, second].entries()) {
  execFileSync("afconvert", [
    "-f",
    "WAVE",
    "-d",
    "LEI16",
    file,
    join(directory, `${index}.wav`),
  ]);
}
function pcm(wav) {
  for (let offset = 12; offset + 8 <= wav.length;) {
    const size = wav.readUInt32LE(offset + 4);
    if (wav.toString("ascii", offset, offset + 4) === "data")
      return wav.subarray(offset + 8, offset + 8 + size);
    offset += 8 + size + (size % 2);
  }
  throw new Error("Missing PCM data");
}
const before = pcm(await readFile(join(directory, "0.wav")));
const after = pcm(await readFile(join(directory, "1.wav")));
// Core Audio removes its implicit 2112-sample AAC priming for MP4, not raw ADTS.
// Compare decoded audible samples separately from that container-specific padding.
assert.equal(before.length - after.length, 2112 * 2);
assert.ok(
  before.subarray(2112 * 2).equals(after),
  "decoded audible samples must match",
);
console.log(
  JSON.stringify({ audiblePcmIdentical: true, directory, first, second }),
);
