const TARGET_LENGTH = 120;
const MAX_SENTENCES = 4;

// Display-only: groups an unbroken transcript into readable paragraphs at
// sentence ends. Existing line breaks are kept as paragraph boundaries.
export function transcriptParagraphs(text) {
  const paragraphs = [];
  for (const block of String(text || "").split(/\n+/)) {
    const sentences =
      block
        .trim()
        .match(/[^。！？!?]+(?:[。！？!?]+[」』）)]*|$)|[。！？!?]+/g)
        ?.map((s) => s.trim())
        .filter(Boolean) ?? [];
    const first = paragraphs.length;
    let current = "",
      count = 0;
    for (const sentence of sentences) {
      current +=
        (current && /^[\x21-\x7e]/.test(sentence) ? " " : "") + sentence;
      if (++count >= MAX_SENTENCES || current.length >= TARGET_LENGTH) {
        paragraphs.push(current);
        current = "";
        count = 0;
      }
    }
    // A short tail reads better attached to the paragraph before it.
    if (current) {
      if (
        paragraphs.length > first &&
        current.length < TARGET_LENGTH / 4 &&
        count < 2
      )
        paragraphs[paragraphs.length - 1] += current;
      else paragraphs.push(current);
    }
  }
  return paragraphs;
}

const TURN = /^(?:\[(\d{2,}):(\d{2})\]\s*)?(話者\d+)[：:]\s*(.*)$/;
const RECORDING = /^【録音 \d+】$/;

// Parses "[mm:ss] 話者1：..." lines written by speaker-aware transcription.
// Returns null for plain transcripts so they fall back to paragraphs.
export function speakerTurns(text) {
  const items = [];
  let found = false;
  for (const raw of String(text || "").split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const turn = TURN.exec(line);
    if (turn) {
      found = true;
      items.push({
        speaker: turn[3],
        start: turn[1] ? Number(turn[1]) * 60 + Number(turn[2]) : null,
        text: turn[4],
      });
    } else if (RECORDING.test(line)) items.push({ heading: line.slice(1, -1) });
    else if (items.at(-1)?.speaker) items.at(-1).text += `\n${line}`;
    else items.push({ speaker: null, start: null, text: line });
  }
  return found ? items : null;
}
