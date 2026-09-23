import {
  mkdir,
  readFile,
  writeFile,
  rename,
  readdir,
  unlink,
} from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

export class MeetingStore {
  constructor(directory) {
    this.directory = directory;
    this.records = new Map();
  }
  async init() {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    for (const file of await readdir(this.directory)) {
      if (!/^[\da-f-]{36}\.json$/.test(file)) continue;
      const record = JSON.parse(
        await readFile(path.join(this.directory, file), "utf8"),
      );
      this.records.set(record.id, record);
      if (["transcribing", "analyzing"].includes(record.status)) {
        await this.save({
          ...record,
          status: "error",
          error:
            "処理中にアプリが再起動しました。再試行すると保存済みの内容から再開します。",
        });
      }
    }
  }
  get(id) {
    return this.records.get(id);
  }
  list() {
    return [...this.records.values()].sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt),
    );
  }
  async save(record) {
    const next = structuredClone(record);
    const destination = path.join(this.directory, `${next.id}.json`);
    const temp = `${destination}.${randomUUID()}.tmp`;
    await writeFile(temp, JSON.stringify(next, null, 2), { mode: 0o600 });
    await rename(temp, destination);
    this.records.set(next.id, next);
    return next;
  }
  async delete(id) {
    await unlink(path.join(this.directory, `${id}.json`));
    this.records.delete(id);
  }
}
