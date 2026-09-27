// Keep transcription, minutes and their tag suggestions in one analysis block.
// Historical tag requests used unrelated run IDs; infer only from an earlier
// minutes call for the same meeting, never from a title or a future analysis.
export function groupUsageEvents(events) {
  const groups = [];
  const byRun = new Map();
  const legacyOpen = new Map();
  const minutesByMeeting = new Map();
  const compare = (a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt) || a.id.localeCompare(b.id);
  const ordered = [...events].sort((a, b) =>
    compare(a, b));
  function runGroup(event, runId, prefix = "") {
    const key = `${prefix}${event.meetingId}:${runId}`;
    let group = byRun.get(key);
    if (!group) {
      group = { id: key, meetingId: event.meetingId, legacy: false, inferredTags: false, events: [] };
      groups.push(group);
      byRun.set(key, group);
    }
    return group;
  }
  for (const event of ordered.filter(event => event.operation !== "tags")) {
    let group;
    if (event.operation === "summary") {
      group = runGroup(event, event.runId || event.id, "summary:");
    } else if (event.runId) {
      group = runGroup(event, event.runId);
    } else {
      group = legacyOpen.get(event.meetingId);
      if (!group || (event.kind === "minutes" && group.events.some((item) => item.kind === "minutes"))) {
        group = { id: `legacy:${event.id}`, meetingId: event.meetingId, legacy: true, inferredTags: false, events: [] };
        groups.push(group);
        legacyOpen.set(event.meetingId, group);
      }
      if (event.kind === "minutes") legacyOpen.delete(event.meetingId);
    }
    group.events.push(event);
    if (event.kind === "minutes" && !event.operation) {
      const previous = minutesByMeeting.get(event.meetingId) || [];
      previous.push({ event, group });
      minutesByMeeting.set(event.meetingId, previous);
    }
  }
  for (const event of ordered.filter(event => event.operation === "tags")) {
    let group;
    if (event.parentRunId) {
      // A missing parent in this month must not attach to an unrelated run.
      group = runGroup(event, event.parentRunId);
    } else {
      group = event.runId && byRun.get(`${event.meetingId}:${event.runId}`);
      if (!group) {
        const prior = (minutesByMeeting.get(event.meetingId) || []).findLast(
          item => Date.parse(item.event.createdAt) <= Date.parse(event.createdAt));
        if (prior) {
          group = prior.group;
          group.inferredTags = true;
        } else {
          group = runGroup(event, event.runId || `tag:${event.id}`);
        }
      }
    }
    group.events.push(event);
  }
  for (const group of groups) group.events.sort(compare);
  return groups.map((group) => ({
    ...group,
    createdAt: group.events[group.events.length - 1].createdAt,
    totalUsd: group.events.reduce((sum, event) => sum + (event.costUsd || 0), 0),
    unpricedCount: group.events.filter((event) => event.costUsd === null).length,
    inputTokens: group.events.reduce((sum, event) => sum + (event.inputTokens || 0), 0),
    outputTokens: group.events.reduce((sum, event) => sum + (event.outputTokens || 0), 0),
    audioSeconds: group.events.reduce((sum, event) => sum + (event.audioSeconds || 0), 0),
  })).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}
