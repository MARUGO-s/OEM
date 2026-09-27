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
