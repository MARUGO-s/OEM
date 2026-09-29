// Server-side progression driver ("tick") helpers shared by the Edge Function and tests.
// A scheduled job (pg_cron + pg_net) calls POST /internal/tick so chunked transcription,
// Gemini backoff resume and background minutes collection continue with no client open.
export const TICK_HEADER = "x-kotonoha-tick";
export const MIN_TICK_SECRET_LENGTH = 32;
// One tick claims at most this many meetings. Each reconcile starts at most one audio part
// (still bounded by the workspace-wide limit of 2 leased jobs) or one Responses API lookup,
// so a tick fits well inside the Edge Function wall-clock limit.
export const MAX_TICK_MEETINGS = 10;

async function digest(value) {
  return new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
  );
}

/** Constant-time comparison of the provided header against the configured secret. */
export async function verifyTickSecret(provided, expected) {
  if (typeof expected !== "string" || expected.length < MIN_TICK_SECRET_LENGTH)
    return false;
  if (typeof provided !== "string" || !provided) return false;
  // Hash both sides so the comparison length never depends on the input.
  const [a, b] = await Promise.all([digest(provided), digest(expected)]);
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a[i] ^ b[i];
  return difference === 0;
}

const WORKING = new Set(["transcribing", "analyzing"]);
/** Working meetings a tick should reconcile, oldest update first, bounded per invocation. */
export function tickCandidates(records, limit = MAX_TICK_MEETINGS) {
  return records
    .filter((record) => WORKING.has(record.document?.status))
    .sort((a, b) =>
      String(a.updatedAt || "").localeCompare(String(b.updatedAt || "")),
    )
    .slice(0, limit);
}
