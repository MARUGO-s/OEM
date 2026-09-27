/** @param {unknown} value */
export const validDuration = (value) =>
  typeof value === "number" && Number.isFinite(value) && value > 0;

/**
 * Resolve legacy records at read time; never expose private audio part metadata.
 * Do not present a partial upload or an incomplete set of durations as a total.
 * @param {{duration?: number | null, audioParts?: {duration?: number | null}[], uploadPlan?: unknown[]}} meeting
 * @returns {number | null}
 */
export function meetingDuration(meeting) {
  const parts = meeting.audioParts;
  if (
    parts?.length &&
    (!meeting.uploadPlan || meeting.uploadPlan.length === parts.length) &&
    parts.every((part) => validDuration(part.duration))
  ) {
    const total = parts.reduce((sum, part) => sum + Number(part.duration), 0);
    if (validDuration(total)) return total;
  }
  return validDuration(meeting.duration) ? Number(meeting.duration) : null;
}

/** @param {(number | null | undefined)[]} durations */
export function durationStats(durations) {
  const known = durations.filter(validDuration).map(Number);
  const total = known.length ? known.reduce((sum, seconds) => sum + seconds, 0) : null;
  return {
    total,
    average: total === null ? null : total / known.length,
    knownCount: known.length,
    unknownCount: durations.length - known.length,
  };
}

/** @param {number | null | undefined} seconds */
export function formatDuration(seconds) {
  if (!validDuration(seconds)) return "未取得";
  const rounded = Math.max(1, Math.round(Number(seconds)));
  const hours = Math.floor(rounded / 3600);
  const minutes = Math.floor((rounded % 3600) / 60);
  const rest = rounded % 60;
  return `${hours ? `${hours}時間` : ""}${hours || minutes ? `${minutes}分` : ""}${rest || (!hours && !minutes) ? `${rest}秒` : ""}`;
}
