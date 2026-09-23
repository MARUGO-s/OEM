// USD Standard API rates checked on 2026-09-24. Stored costs are snapshots;
// changing rates later must not rewrite past events.
export const USAGE_PRICING_DATE = "2026-09-24";
const TEXT_RATES = {
  "gpt-6-astra": { input: 10, cached: 1, write: 12.5, output: 50 },
  "gpt-6-sol": { input: 2, cached: 0.2, write: 2.5, output: 10 },
  "gpt-6-luna": { input: 0.1, cached: 0.01, write: 0.125, output: 0.5 },
};

const count = (value) =>
  Number.isFinite(value) && value >= 0 ? Math.floor(value) : null;
const firstCount = (...values) => {
  for (const value of values) {
    const result = count(value);
    if (result !== null) return result;
  }
  return null;
};
const seconds = (value) =>
  Number.isFinite(value) && value > 0 ? value : null;

export function transcriptionUsage(model, response, fallbackSeconds = null) {
  if (model === "gpt-transcribe") {
    const audioSeconds = seconds(response?.usage?.seconds) ||
      seconds(response?.usage?.duration) || seconds(fallbackSeconds);
    return {
      inputTokens: null,
      outputTokens: null,
      cachedInputTokens: null,
      reasoningTokens: null,
      audioSeconds,
      costUsd: audioSeconds === null ? null : audioSeconds / 60 * 0.0045,
      estimated: !seconds(response?.usage?.seconds) && !seconds(response?.usage?.duration),
    };
  }
  if (model !== "gemini-3.5-transcribe") throw new Error("Unsupported transcription model");
  const usage = response?.usage || response?.usage_metadata || {};
  const actualInput = firstCount(usage.total_input_tokens, usage.input_tokens,
    usage.prompt_token_count, usage.promptTokenCount);
  const actualOutput = firstCount(usage.total_output_tokens, usage.output_tokens,
    usage.candidates_token_count, usage.candidatesTokenCount);
  const thoughts = firstCount(usage.total_thought_tokens, usage.thoughts_tokens,
    usage.thoughts_token_count, usage.thoughtsTokenCount) || 0;
  const audioSeconds = seconds(fallbackSeconds);
  // Google's published per-minute figures assume 25 audio tokens/second
  // and 175 output tokens/minute. Use them only when usage is unavailable.
  const inputTokens = actualInput ?? (audioSeconds === null ? null : Math.round(audioSeconds * 25));
  const outputTokens = actualOutput ?? (audioSeconds === null ? null : Math.round(audioSeconds / 60 * 175));
  return {
    inputTokens,
    outputTokens: outputTokens === null ? null : outputTokens + thoughts,
    cachedInputTokens: null,
    reasoningTokens: thoughts || null,
    audioSeconds,
    costUsd: inputTokens === null || outputTokens === null
      ? null : (inputTokens * 2 + (outputTokens + thoughts) * 12) / 1_000_000,
    estimated: actualInput === null || actualOutput === null,
  };
}

export function summaryUsage(model, response) {
  const usage = response?.usage || {};
  const inputTokens = count(usage.input_tokens);
  const outputTokens = count(usage.output_tokens);
  const cachedInputTokens = count(usage.input_tokens_details?.cached_tokens) || 0;
  const cacheWriteTokens = count(usage.input_tokens_details?.cache_write_tokens) || 0;
  const reasoningTokens = count(usage.output_tokens_details?.reasoning_tokens);
  const rate = TEXT_RATES[model];
  if (!rate) throw new Error("Unsupported minutes model");
  const long = inputTokens !== null && inputTokens > 272_000;
  const costUsd = inputTokens === null || outputTokens === null ? null :
    (Math.max(0, inputTokens - cachedInputTokens - cacheWriteTokens) * rate.input * (long ? 2 : 1) +
      cachedInputTokens * rate.cached * (long ? 2 : 1) +
      cacheWriteTokens * rate.write * (long ? 2 : 1) +
      outputTokens * rate.output * (long ? 1.5 : 1)) / 1_000_000;
  return {
    inputTokens,
    outputTokens,
    cachedInputTokens: inputTokens === null ? null : cachedInputTokens,
    reasoningTokens,
    audioSeconds: null,
    costUsd,
    estimated: inputTokens !== null && outputTokens !== null &&
      !usage.input_tokens_details,
  };
}

export function usageEvent({ id, meetingId, meetingTitle, runId, kind, model, response, audioSeconds }) {
  const usage = kind === "transcription"
    ? transcriptionUsage(model, response, audioSeconds)
    : summaryUsage(model, response);
  return {
    id,
    meetingId,
    meetingTitle,
    runId: runId || null,
    kind,
    provider: model.startsWith("gemini") ? "Google" : "OpenAI",
    model,
    createdAt: new Date().toISOString(),
    pricingDate: USAGE_PRICING_DATE,
    ...usage,
  };
}

export function usageMonth(events, month, page = 0, pageSize = 100) {
  const date = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit",
  });
  const filtered = events.filter((event) =>
    date.format(new Date(event.createdAt)) === month);
  filtered.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return {
    month,
    totalUsd: filtered.reduce((sum, event) => sum + (event.costUsd || 0), 0),
    unpricedCount: filtered.filter((event) => event.costUsd === null).length,
    eventCount: filtered.length,
    events: filtered.slice(page * pageSize, (page + 1) * pageSize),
  };
}
