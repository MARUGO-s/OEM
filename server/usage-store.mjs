import { mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { usageMonth } from "../supabase/functions/_shared/usage.mjs";

export class UsageStore {
  constructor(directory) {
    this.directory = directory;
    this.events = new Map();
  }
  async init() {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    for (const name of await readdir(this.directory)) {
      if (!/^[\da-f-]{36}\.json$/.test(name)) continue;
      const event = JSON.parse(await readFile(path.join(this.directory, name), "utf8"));
      this.events.set(event.id, event);
    }
  }
  async record(event) {
    if (this.events.has(event.id)) return;
    const destination = path.join(this.directory, `${event.id}.json`);
    const temp = `${destination}.${randomUUID()}.tmp`;
    await writeFile(temp, JSON.stringify(event), { mode: 0o600 });
    await rename(temp, destination);
    this.events.set(event.id, event);
  }
  month(month, page) {
    return usageMonth([...this.events.values()], month, page);
  }
}
