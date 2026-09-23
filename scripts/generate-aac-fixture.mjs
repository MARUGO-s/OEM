// Generate our own 100ms sine tone using macOS Core Audio (no recorded speech).
// The checked-in base64 fixture lets Node and Deno test without codec binaries.
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
const directory = await mkdtemp(join(tmpdir(), "kotonoha-aac-fixture-"));
try {
  const samples = 4410;
  const wav = Buffer.alloc(44 + samples * 2);
  wav.write("RIFF", 0);
  wav.writeUInt32LE(wav.length - 8, 4);
  wav.write("WAVEfmt ", 8);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(44100, 24);
  wav.writeUInt32LE(88200, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write("data", 36);
  wav.writeUInt32LE(samples * 2, 40);
  for (let i = 0; i < samples; i++)
    wav.writeInt16LE(
      Math.round(Math.sin((i * 2 * Math.PI * 440) / 44100) * 4000),
      44 + i * 2,
    );
  await writeFile(join(directory, "tone.wav"), wav);
  execFileSync("afconvert", [
    "-f",
    "adts",
    "-d",
    "aac ",
    "-b",
    "64000",
    join(directory, "tone.wav"),
    join(directory, "tone.aac"),
  ]);
  console.log((await readFile(join(directory, "tone.aac"))).toString("base64"));
} finally {
  await rm(directory, { recursive: true, force: true });
}
