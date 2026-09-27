// Observe completion transitions, not every already-completed meeting on login.
export function createTagCompletionTracker() {
  const records = new Map();
  return {
    expect(id) {
      const previous = records.get(id);
      records.set(id, {
        status: "analyzing",
        generation: (previous?.generation || 0) + 1,
      });
    },
    observe(meetings) {
      const completed = [];
      const ids = new Set(meetings.map((m) => m.id));
      for (const id of records.keys()) if (!ids.has(id)) records.delete(id);
      for (const meeting of meetings) {
        const previous = records.get(meeting.id);
        const working = ["uploading", "transcribing", "analyzing"].includes(
          meeting.status,
        );
        const wasWorking =
          previous &&
          ["uploading", "transcribing", "analyzing"].includes(previous.status);
        const generation =
          (previous?.generation || 0) + (working && !wasWorking ? 1 : 0);
        records.set(meeting.id, { status: meeting.status, generation });
        if (
          wasWorking &&
          meeting.status === "done" &&
          !meeting.isDemo &&
          meeting.minutes
        ) {
          completed.push({
            id: meeting.id,
            key: `${meeting.id}:${generation}`,
          });
        }
      }
      return completed;
    },
    key(id) {
      return `${id}:${records.get(id)?.generation || 0}`;
    },
  };
}

/** Keep a single request (including failures) per completion until explicit retry. */
export function createTagSuggestionCache() {
  const requests = new Map();
  return (key, generate, retry = false) => {
    if (retry) requests.delete(key);
    if (!requests.has(key)) requests.set(key, Promise.resolve().then(generate));
    return requests.get(key);
  };
}
