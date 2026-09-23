export const GEMINI_SPACING_MS = 30_000;
export const GEMINI_MAX_RETRIES = 5;

// Persist only normalized timing and quota flags, never Google's error body.
export function geminiRateLimit(response, payload, now = Date.now()) {
  if (response.status !== 429) return {};
  const details = Array.isArray(payload?.error?.details)
    ? payload.error.details
    : [];
  const header = response.headers.get("retry-after");
  let retryAfterMs =
    header && /^\d+(\.\d+)?$/.test(header)
      ? Number(header) * 1000
      : header
        ? Math.max(0, Date.parse(header) - now)
        : 0;
  let quotaExhausted = false;
  for (const detail of details) {
    const type = typeof detail?.["@type"] === "string" ? detail["@type"] : "";
    if (type.endsWith("google.rpc.RetryInfo")) {
      const duration = /^(\d+(?:\.\d+)?)s$/.exec(detail.retryDelay || "");
      if (duration)
        retryAfterMs = Math.max(retryAfterMs || 0, Number(duration[1]) * 1000);
    }
    if (type.endsWith("google.rpc.QuotaFailure")) {
      for (const violation of Array.isArray(detail.violations)
        ? detail.violations
        : []) {
        if (!violation || typeof violation !== "object") continue;
        const quota = `${violation.quotaId || ""} ${violation.quotaMetric || ""}`;
        if (
          /per.?day|daily/i.test(quota) ||
          violation.quotaValue === "0" ||
          violation.quotaValue === 0
        )
          quotaExhausted = true;
      }
    }
  }
  return {
    retryAfterMs: Number.isFinite(retryAfterMs) ? Math.max(0, retryAfterMs) : 0,
    quotaExhausted,
  };
}

export function geminiRetryPlan(
  error,
  previousAttempts = 0,
  now = Date.now(),
  random = Math.random,
) {
  if (error?.provider !== "gemini" || error.status !== 429) return null;
  if (error.quotaExhausted) return { stop: "GEMINI_QUOTA_EXHAUSTED" };
  if (previousAttempts >= GEMINI_MAX_RETRIES)
    return { stop: "GEMINI_RETRIES_EXHAUSTED" };
  const delayMs = Math.max(
    60_000 * 2 ** previousAttempts + Math.floor(random() * 5000),
    error.retryAfterMs || 0,
  );
  // A very long provider cooldown requires a quota/billing check, not an early retry.
  if (delayMs > 24 * 60 * 60_000) return { stop: "GEMINI_QUOTA_EXHAUSTED" };
  return {
    attempt: previousAttempts + 1,
    delayMs,
    until: new Date(now + delayMs).toISOString(),
    reason: "rate_limit",
  };
}

export function geminiRetryError(code) {
  return Object.assign(new Error("Gemini retries stopped"), {
    code,
    provider: "gemini",
  });
}

// One shared queue for the local server; the cloud uses an atomic DB gate.
export function createLocalGeminiGate({
  now = Date.now,
  sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
} = {}) {
  let queue = Promise.resolve(),
    nextAt = 0,
    nextReason = "spacing";
  return async function acquire(onWait) {
    const previous = queue;
    let release;
    queue = new Promise((r) => {
      release = r;
    });
    await previous;
    try {
      if (nextAt > now()) {
        await onWait(new Date(nextAt).toISOString(), nextReason);
        await sleep(Math.max(0, nextAt - now()));
      }
    } catch (error) {
      release();
      throw error;
    }
    return (delayMs = GEMINI_SPACING_MS, reason = "spacing") => {
      nextAt = now() + Math.max(delayMs, GEMINI_SPACING_MS);
      nextReason = reason;
      release();
    };
  };
}
