// New events carry a run ID. Old events are grouped only until the first
// minutes call for the same meeting, so a later regeneration is separate.
export function groupUsageEvents(events) {
  const groups = [];
  const byRun = new Map();
  const legacyOpen = new Map();
  const ordered = [...events].sort((a, b) =>
    a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  for (const event of ordered) {
    let group;
    if (event.runId) {
      const key = `${event.meetingId}:${event.runId}`;
      group = byRun.get(key);
      if (!group) {
        group = { id: key, meetingId: event.meetingId, legacy: false, events: [] };
        groups.push(group);
        byRun.set(key, group);
      }
    } else {
      group = legacyOpen.get(event.meetingId);
      if (!group || (event.kind === "minutes" && group.events.some((item) => item.kind === "minutes"))) {
        group = { id: `legacy:${event.id}`, meetingId: event.meetingId, legacy: true, events: [] };
        groups.push(group);
        legacyOpen.set(event.meetingId, group);
      }
      if (event.kind === "minutes") legacyOpen.delete(event.meetingId);
    }
    group.events.push(event);
  }
  return groups.map((group) => ({
    ...group,
    createdAt: group.events[group.events.length - 1].createdAt,
    totalUsd: group.events.reduce((sum, event) => sum + (event.costUsd || 0), 0),
    unpricedCount: group.events.filter((event) => event.costUsd === null).length,
    inputTokens: group.events.reduce((sum, event) => sum + (event.inputTokens || 0), 0),
    outputTokens: group.events.reduce((sum, event) => sum + (event.outputTokens || 0), 0),
    audioSeconds: group.events.reduce((sum, event) => sum + (event.audioSeconds || 0), 0),
  })).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
