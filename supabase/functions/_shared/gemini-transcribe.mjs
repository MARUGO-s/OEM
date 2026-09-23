export const GEMINI_TRANSCRIPTION_MODEL = "gemini-3.5-transcribe";

function mimeFor(fileName, type) {
  const extension = fileName.toLowerCase().split(".").pop();
  return (
    {
      aac: "audio/aac",
      flac: "audio/flac",
      m4a: "audio/m4a",
      mp3: "audio/mpeg",
      ogg: "audio/ogg",
      opus: "audio/opus",
      wav: "audio/wav",
      webm: "audio/webm",
    }[extension] ||
    type ||
    "application/octet-stream"
  );
}

async function google(response) {
  if (response.ok) return response;
  throw Object.assign(new Error("Gemini request failed"), {
    status: response.status,
  });
}

const pause = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

async function activeFile(apiKey, initial) {
  let file = initial;
  for (
    let attempt = 0;
    file.state === "PROCESSING" && attempt < 15;
    attempt++
  ) {
    await pause(1000);
    file = await google(
      await fetch(
        `https://generativelanguage.googleapis.com/v1beta/${file.name}?key=${encodeURIComponent(apiKey)}`,
        { signal: AbortSignal.timeout(15_000) },
      ),
    ).then((response) => response.json());
  }
  if (file.state && file.state !== "ACTIVE")
    throw new Error("Gemini file is not ready");
  return file;
}

export async function transcribeWithGemini(apiKey, audio, fileName) {
  const mimeType = mimeFor(fileName, audio.type);
  const start = await google(
    await fetch(
      `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${encodeURIComponent(apiKey)}`,
      {
        method: "POST",
        headers: {
          "X-Goog-Upload-Protocol": "resumable",
          "X-Goog-Upload-Command": "start",
          "X-Goog-Upload-Header-Content-Length": String(audio.size),
          "X-Goog-Upload-Header-Content-Type": mimeType,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          file: { display_name: fileName.slice(0, 500) },
        }),
        signal: AbortSignal.timeout(30_000),
      },
    ),
  );
  const uploadUrl = start.headers.get("x-goog-upload-url");
  if (!uploadUrl) throw new Error("Missing Gemini upload URL");
  const uploaded = await google(
    await fetch(uploadUrl, {
      method: "POST",
      headers: {
        "Content-Length": String(audio.size),
        "X-Goog-Upload-Offset": "0",
        "X-Goog-Upload-Command": "upload, finalize",
        "Content-Type": mimeType,
      },
      body: audio,
      signal: AbortSignal.timeout(110_000),
    }),
  ).then((response) => response.json());
  if (!uploaded.file?.uri || !uploaded.file?.name)
    throw new Error("Missing Gemini file");
  const file = await activeFile(apiKey, uploaded.file);
  try {
    const generated = await google(
      await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_TRANSCRIPTION_MODEL}:generateContent`,
        {
          method: "POST",
          headers: {
            "x-goog-api-key": apiKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            contents: [
              {
                parts: [{ fileData: { fileUri: file.uri, mimeType } }],
              },
            ],
            generationConfig: {
              audioTranscriptionConfig: { languageCodes: ["ja-JP"] },
            },
          }),
          signal: AbortSignal.timeout(110_000),
        },
      ),
    ).then((response) => response.json());
    const transcript = (generated.candidates || [])
      .flatMap((candidate) => candidate.content?.parts || [])
      .map((part) => part.text || "")
      .join("")
      .trim();
    if (!transcript)
      throw Object.assign(new Error("empty audio"), { code: "EMPTY_AUDIO" });
    return transcript;
  } finally {
    await fetch(
      `https://generativelanguage.googleapis.com/v1beta/${file.name}?key=${encodeURIComponent(apiKey)}`,
      { method: "DELETE", signal: AbortSignal.timeout(15_000) },
    ).catch(() => {});
  }
}
