import { geminiRateLimit } from "./gemini-retry.mjs";
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
  let providerCode = "";
  let rateLimit = geminiRateLimit(response, null);
  try {
    const payload = await response.clone().json();
    rateLimit = geminiRateLimit(response, payload);
    providerCode = String(payload?.error?.status || "");
    if (
      payload?.error?.details?.some?.(
        (detail) => detail?.reason === "API_KEY_INVALID",
      )
    )
      providerCode = "API_KEY_INVALID";
  } catch {
    // Keep provider responses private; only expose a normalized status below.
  }
  throw Object.assign(new Error("Gemini request failed"), {
    status: providerCode === "API_KEY_INVALID" ? 401 : response.status,
    provider: "gemini",
    providerCode,
    ...rateLimit,
  });
}

const pause = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

const geminiError = (message, code) =>
  Object.assign(new Error(message), { code, provider: "gemini" });

async function geminiFetch(stage, url, init) {
  try {
    return await fetch(url, init);
  } catch (error) {
    throw Object.assign(error, {
      code: `GEMINI_${stage}_NETWORK`,
      provider: "gemini",
    });
  }
}

async function geminiJson(response, code) {
  try {
    return await response.json();
  } catch {
    throw geminiError("Invalid Gemini JSON response", code);
  }
}

async function activeFile(apiKey, initial) {
  let file = initial;
  for (
    let attempt = 0;
    file.state === "PROCESSING" && attempt < 15;
    attempt++
  ) {
    await pause(1000);
    file = await google(
      await geminiFetch(
        "FILE_STATUS",
        `https://generativelanguage.googleapis.com/v1beta/${file.name}?key=${encodeURIComponent(
          apiKey,
        )}`,
        { signal: AbortSignal.timeout(15_000) },
      ),
    ).then((response) => geminiJson(response, "GEMINI_FILE_STATUS_INVALID"));
  }
  if (file.state && file.state !== "ACTIVE") {
    throw geminiError("Gemini file is not ready", "GEMINI_FILE_NOT_READY");
  }
  return file;
}

function transcriptFromInteraction(interaction) {
  // REST responses contain model_output steps; candidates belongs to the
  // legacy generateContent API, not the Transcribe Interactions API.
  if (!interaction || typeof interaction !== "object") {
    throw geminiError(
      "Invalid Gemini interaction",
      "GEMINI_TRANSCRIPT_INVALID",
    );
  }
  if (interaction.status !== "completed") {
    // Keep only the status keyword (e.g. "incomplete" at max_tokens); provider
    // messages may quote the recording and stay private.
    throw Object.assign(
      geminiError(
        "Gemini transcription did not complete",
        "GEMINI_TRANSCRIPT_INCOMPLETE",
      ),
      {
        geminiStatus:
          typeof interaction.status === "string" &&
          /^[a-z_]{1,30}$/.test(interaction.status)
            ? interaction.status
            : "unknown",
      },
    );
  }
  let text;
  if (Array.isArray(interaction.steps)) {
    const parts = interaction.steps
      .filter((step) => step?.type === "model_output")
      .flatMap((step) => (Array.isArray(step.content) ? step.content : []))
      .filter((part) => part?.type === "text" && typeof part.text === "string");
    if (parts.length) text = parts.map((part) => part.text).join("");
  } else if (typeof interaction.output_text === "string") {
    text = interaction.output_text;
  }
  if (typeof text !== "string") {
    throw geminiError(
      "Missing Gemini transcript output",
      "GEMINI_TRANSCRIPT_INVALID",
    );
  }
  if (!text.trim()) {
    throw geminiError(
      "Gemini returned an empty transcript",
      "GEMINI_NO_TRANSCRIPT",
    );
  }
  return text.trim();
}

export async function transcribeWithGemini(apiKey, audio, fileName, onUsage = (_response) => {}) {
  const mimeType = mimeFor(fileName, audio.type);
  const start = await google(
    await geminiFetch(
      "UPLOAD_START",
      `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${encodeURIComponent(
        apiKey,
      )}`,
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
  if (!uploadUrl) {
    throw geminiError("Missing Gemini upload URL", "GEMINI_UPLOAD_URL_MISSING");
  }
  const uploaded = await google(
    await geminiFetch("UPLOAD_BODY", uploadUrl, {
      method: "POST",
      headers: {
        "X-Goog-Upload-Offset": "0",
        "X-Goog-Upload-Command": "upload, finalize",
        "Content-Type": mimeType,
      },
      body: audio,
      signal: AbortSignal.timeout(110_000),
    }),
  ).then((response) => geminiJson(response, "GEMINI_UPLOAD_RESULT_INVALID"));
  if (!uploaded.file?.uri || !uploaded.file?.name) {
    throw geminiError("Missing Gemini file", "GEMINI_UPLOAD_RESULT_MISSING");
  }
  try {
    const file = await activeFile(apiKey, uploaded.file);
    const generated = await google(
      await geminiFetch(
        "TRANSCRIBE",
        "https://generativelanguage.googleapis.com/v1beta/interactions",
        {
          method: "POST",
          headers: {
            "x-goog-api-key": apiKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: GEMINI_TRANSCRIPTION_MODEL,
            store: false,
            input: [
              {
                type: "audio",
                uri: file.uri,
                mime_type: mimeType,
              },
            ],
            generation_config: {
              transcription_config: { language_codes: ["ja-JP"] },
            },
          }),
          signal: AbortSignal.timeout(110_000),
        },
      ),
    ).then((response) => geminiJson(response, "GEMINI_TRANSCRIPT_INVALID"));
    await onUsage(generated);
    return transcriptFromInteraction(generated);
  } finally {
    await fetch(
      `https://generativelanguage.googleapis.com/v1beta/${uploaded.file.name}?key=${encodeURIComponent(
        apiKey,
      )}`,
      { method: "DELETE", signal: AbortSignal.timeout(15_000) },
    ).catch(() => {});
  }
}
