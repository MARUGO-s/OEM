// Deterministic synthetic PCM; no user audio or speech.
export function waveFile(size = 100_000_000) {
  const bytes = new Uint8Array(size),
    d = new DataView(bytes.buffer);
  const text = (at, s) => bytes.set(new TextEncoder().encode(s), at);
  text(0, "RIFF");
  d.setUint32(4, size - 8, true);
  text(8, "WAVEfmt ");
  d.setUint32(16, 16, true);
  d.setUint16(20, 1, true);
  d.setUint16(22, 2, true);
  d.setUint32(24, 44100, true);
  d.setUint32(28, 176400, true);
  d.setUint16(32, 4, true);
  d.setUint16(34, 16, true);
  text(36, "data");
  d.setUint32(40, size - 44, true);
  for (let i = 44; i < size; i++) bytes[i] = i % 251;
  return new File([bytes], "100MB.wav", { type: "audio/wav" });
}
