import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { once } from "node:events";
import { get as httpGet } from "node:http";
import { createApp } from "../server/app.mjs";
import { createDemo } from "../server/demo.mjs";
import { MeetingStore } from "../server/store.mjs";
import { createAI } from "../server/ai.mjs";
import { MAX_FILE_SIZE } from "../server/domain.mjs";
import { aacFixture } from "./fixtures/aac.mjs";
import { splitRecordings } from "../src/split-recordings.mjs";

const sampleMinutes = createDemo().minutes;
const key = "sk-test-only-not-a-real-api-key";

test("段階アップロードは全音声保存後だけ開始し、順序・欠損・二重完了を検証する", async (t) => {
  const calls = [];
  const { request, waitForJobs, store } = await setup(t, {
    apiKey: key,
    aiFactory: () => ({
      transcribe: async (file) => {
        calls.push(file);
        return { transcript: `会話${calls.length}` };
      },
      summarize: async () => sampleMinutes,
    }),
  });
  const file = new File([aacFixture, aacFixture], "前後.aac");
  const parts = await splitRecordings([file], () => {}, { durationLimit: 0.1 });
  const manifest = {
    metadata: { title: "分割統合", date: "2026-09-23" },
    sources: [{ name: file.name, size: file.size }],
    parts: parts.map(({ name, blob, sourceIndex, partNumber, duration }) => ({
      name,
      size: blob.size,
      sourceIndex,
      partNumber,
      duration,
    })),
  };
  const response = await request("/uploads", {
    method: "POST",
    body: JSON.stringify(manifest),
  });
  assert.equal(response.status, 201);
  const draft = await response.json();
  assert.equal(draft.uploadPlan, undefined);
  assert.equal(
    (await request(`/meetings/${draft.id}/complete`, { method: "POST" }))
      .status,
    409,
  );
  for (const [i, p] of parts.entries()) {
    assert.equal(
      (
        await request(`/meetings/${draft.id}/parts?index=${i}`, {
          method: "POST",
          body: p.blob,
          headers: { "Content-Type": p.blob.type },
        })
      ).status,
      200,
    );
  }
  assert.equal(calls.length, 0);
  assert.equal(
    (await request(`/meetings/${draft.id}/complete`, { method: "POST" }))
      .status,
    202,
  );
  await waitForJobs();
  assert.equal(store.get(draft.id).status, "done");
  assert.equal(calls.length, parts.length);
  assert.equal(
    (await request(`/meetings/${draft.id}/complete`, { method: "POST" }))
      .status,
    202,
  );
  assert.equal(calls.length, parts.length);
  assert.ok(store.get(draft.id).transcript.endsWith(`会話${parts.length}`));
});

async function setup(t, options = {}) {
  const dataDir = await mkdtemp(path.join(tmpdir(), "kotonoha-test-"));
  const context = await createApp({ dataDir, ...options });
  const server = context.app.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(async () => {
    await context.waitForJobs();
    await new Promise((resolve) => server.close(resolve));
    await rm(dataDir, { recursive: true, force: true });
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  async function request(route, options = {}) {
    return fetch(`${base}/api${route}`, {
      ...options,
      headers: {
        "X-Kotonoha": "1",
        ...(options.body instanceof FormData
          ? {}
          : { "Content-Type": "application/json" }),
        ...options.headers,
      },
    });
  }
  return { ...context, dataDir, request, base };
}
function payload({
  audio = false,
  transcript = "会議の公開日は10月15日に決定しました。",
  extension = "wav",
  size = 44,
} = {}) {
  const form = new FormData();
  form.set("title", "テスト会議");
  form.set("date", "2026-09-23");
  form.set("participants", "田中、佐藤");
  if (audio)
    form.set(
      "audio",
      new Blob([new Uint8Array(size)], { type: "audio/wav" }),
      `meeting.${extension}`,
    );
  else form.set("transcript", transcript);
  return form;
}

test("APIキー未設定では会議を送信せず、サンプルだけ利用できる", async (t) => {
  const { request, store } = await setup(t);
  const result = await request("/meetings", {
    method: "POST",
    body: payload(),
  });
  assert.equal(result.status, 428);
  assert.equal(store.list().length, 0);
  const demo = await (await request("/demo", { method: "POST" })).json();
  assert.equal(demo.isDemo, true);
  assert.equal(demo.status, "done");
  const second = await (await request("/demo", { method: "POST" })).json();
  assert.equal(second.id, demo.id);
});

test("キーを返却・永続化せず、Astra/Solモデル設定のみ再起動後も保持する", async (t) => {
  const { request, dataDir } = await setup(t);
  const response = await request("/settings", {
    method: "PUT",
    body: JSON.stringify({ apiKey: key, model: "gpt-6-sol" }),
  });
  assert.equal(response.status, 200);
  const config = await response.json();
  assert.equal(config.configured, true);
  assert.equal(config.model, "gpt-6-sol");
  assert.ok(!JSON.stringify(config).includes(key));
  assert.deepEqual(
    JSON.parse(await readFile(path.join(dataDir, "config.json"), "utf8")),
    { model: "gpt-6-sol" },
  );
  const invalid = await request("/settings", {
    method: "PUT",
    body: JSON.stringify({ model: "gpt-4.1-mini" }),
  });
  assert.equal(invalid.status, 400);
  const restarted = await createApp({ dataDir });
  assert.equal(restarted.store.list().length, 0);
});

test("録音を文字起こしして議事録まで作成し、音声を再生できる", async (t) => {
  const calls = [];
  const { request, waitForJobs } = await setup(t, {
    apiKey: key,
    aiFactory: (receivedKey, model) => {
      assert.equal(receivedKey, key);
      assert.equal(model, "gpt-6-astra");
      return {
        async transcribe(file) {
          calls.push("transcribe");
          assert.equal((await readFile(file)).length, 44);
          return {
            transcript: "公開日を10月15日に決定します。",
            segments: [],
            duration: null,
          };
        },
        async summarize(meeting) {
          calls.push("summarize");
          assert.equal(meeting.transcript, "公開日を10月15日に決定します。");
          return sampleMinutes;
        },
      };
    },
  });
  const created = await request("/meetings", {
    method: "POST",
    body: payload({ audio: true }),
  });
  assert.equal(created.status, 202);
  const accepted = await created.json();
  await waitForJobs();
  const meeting = await (await request(`/meetings/${accepted.id}`)).json();
  assert.deepEqual(calls, ["transcribe", "summarize"]);
  assert.equal(meeting.status, "done");
  assert.match(meeting.markdown, /## 決定事項/);
  assert.equal(meeting.hasAudio, true);
  assert.equal(meeting.transcriptionModel, "gpt-4o-transcribe");
  assert.equal(meeting.minutesModel, "gpt-6-astra");
  assert.equal(meeting.audioFile, undefined);
  const range = await request(`/meetings/${meeting.id}/audio`, {
    headers: { Range: "bytes=0-9" },
  });
  assert.equal(range.status, 206);
  assert.equal((await range.arrayBuffer()).byteLength, 10);
});

test("解析失敗後も文字起こしを保持し、Solへ変更して音声認識を繰り返さず再試行する", async (t) => {
  let transcriptions = 0;
  let attempts = 0;
  const models = [];
  const { request, waitForJobs } = await setup(t, {
    apiKey: key,
    aiFactory: (_key, model) => ({
      async transcribe() {
        transcriptions++;
        return { transcript: "認識済みの会話", segments: [], duration: null };
      },
      async summarize() {
        models.push(model);
        if (++attempts === 1)
          throw Object.assign(new Error("sensitive details"), { status: 429 });
        return sampleMinutes;
      },
    }),
  });
  const created = await (
    await request("/meetings", {
      method: "POST",
      body: payload({ audio: true }),
    })
  ).json();
  await waitForJobs();
  let meeting = await (await request(`/meetings/${created.id}`)).json();
  assert.equal(meeting.status, "error");
  assert.equal(meeting.transcript, "認識済みの会話");
  assert.ok(!meeting.error.includes("sensitive"));
  await request("/settings", {
    method: "PUT",
    body: JSON.stringify({ model: "gpt-6-sol" }),
  });
  const retry = await request(`/meetings/${created.id}/retry`, {
    method: "POST",
  });
  assert.equal(retry.status, 202);
  await waitForJobs();
  meeting = await (await request(`/meetings/${created.id}`)).json();
  assert.equal(meeting.status, "done");
  assert.equal(meeting.minutesModel, "gpt-6-sol");
  assert.equal(transcriptions, 1);
  assert.deepEqual(models, ["gpt-6-astra", "gpt-6-sol"]);
});

test("AACとWAVを順番どおりに1会議へ統合し、個別再生・一括ゴミ箱移動する", async (t) => {
  const calls = [];
  const { request, waitForJobs, dataDir } = await setup(t, {
    apiKey: key,
    aiFactory: () => ({
      async transcribe(file) {
        calls.push(path.extname(file));
        return {
          transcript: file.endsWith(".m4a") ? "前半の議論" : "後半の決定",
        };
      },
      async summarize(meeting) {
        assert.equal(
          meeting.transcript,
          "【録音 1】\n前半の議論\n\n【録音 2】\n後半の決定",
        );
        return sampleMinutes;
      },
    }),
  });
  const form = payload({ audio: true });
  form.delete("audio");
  form.append("audio", new File([aacFixture], "前半.AAC"));
  form.append("audio", new File([new Uint8Array(44)], "後半.wav"));
  const response = await request("/meetings", { method: "POST", body: form });
  assert.equal(response.status, 202);
  const created = await response.json();
  assert.equal(created.audioParts, undefined);
  assert.equal(created.fileName, "前半.AAC");
  await waitForJobs();
  const done = await (await request(`/meetings/${created.id}`)).json();
  assert.equal(done.status, "done");
  assert.deepEqual(
    done.recordings.map((part) => part.transcribed),
    [true, true],
  );
  assert.deepEqual(calls.sort(), [".m4a", ".wav"]);
  const first = await request(`/meetings/${created.id}/audio?part=0`);
  assert.match(first.headers.get("content-type"), /audio\/mp4/);
  assert.equal(
    Buffer.from(await first.arrayBuffer()).toString("ascii", 4, 8),
    "ftyp",
  );
  assert.equal(
    (
      await (
        await request(`/meetings/${created.id}/audio?part=1`)
      ).arrayBuffer()
    ).byteLength,
    44,
  );
  assert.equal(
    (await request(`/meetings/${created.id}/audio?part=2`)).status,
    404,
  );
  assert.equal(
    (await request(`/meetings/${created.id}/audio?part=-1`)).status,
    404,
  );
  await request(`/meetings/${created.id}`, { method: "DELETE" });
  assert.equal((await readdir(path.join(dataDir, "audio"))).length, 0);
  assert.equal(
    (await readdir(path.join(dataDir, "trash", created.id))).length,
    3,
  );
});

test("複数アップロードの途中でAACが不正なら音声も会議も残さない", async (t) => {
  const { request, dataDir, store } = await setup(t, { apiKey: key });
  const form = payload({ audio: true });
  form.append("audio", new File(["invalid AAC"], "broken.aac"));
  const result = await request("/meetings", { method: "POST", body: form });
  assert.equal(result.status, 400);
  assert.match((await result.json()).error, /AACを読み込めません/);
  assert.deepEqual(await readdir(path.join(dataDir, "audio")), []);
  assert.equal(store.list().length, 0);
});

test("テキスト取り込み、議事録編集、アクション完了、文字起こし修正を保存する", async (t) => {
  const { request, waitForJobs } = await setup(t, {
    apiKey: key,
    aiFactory: () => ({
      transcribe: () => assert.fail("text should not be transcribed"),
      summarize: async () => sampleMinutes,
    }),
  });
  const created = await (
    await request("/meetings", { method: "POST", body: payload() })
  ).json();
  await waitForJobs();
  const edited = await (
    await request(`/meetings/${created.id}`, {
      method: "PATCH",
      body: JSON.stringify({ markdown: "# 編集済み", completedActions: [0] }),
    })
  ).json();
  assert.equal(edited.markdown, "# 編集済み");
  assert.deepEqual(edited.completedActions, [0]);
  const corrected = await (
    await request(`/meetings/${created.id}`, {
      method: "PATCH",
      body: JSON.stringify({ transcript: "修正後の会話です。" }),
    })
  ).json();
  assert.equal(corrected.minutesStale, true);
  assert.equal(corrected.transcript, "修正後の会話です。");
  const badAction = await request(`/meetings/${created.id}`, {
    method: "PATCH",
    body: JSON.stringify({ completedActions: [100] }),
  });
  assert.equal(badAction.status, 400);
});

test("処理中の会議に二重の再試行・編集・削除を許可しない", async (t) => {
  let release;
  const pending = new Promise((resolve) => {
    release = resolve;
  });
  const { request, waitForJobs } = await setup(t, {
    apiKey: key,
    aiFactory: () => ({
      summarize: async () => {
        await pending;
        return sampleMinutes;
      },
    }),
  });
  const created = await (
    await request("/meetings", { method: "POST", body: payload() })
  ).json();
  try {
    assert.equal(
      (await request(`/meetings/${created.id}/retry`, { method: "POST" }))
        .status,
      409,
    );
    assert.equal(
      (await request(`/meetings/${created.id}`, { method: "DELETE" })).status,
      409,
    );
    assert.equal(
      (
        await request(`/meetings/${created.id}`, {
          method: "PATCH",
          body: JSON.stringify({ markdown: "invalid update" }),
        })
      ).status,
      409,
    );
  } finally {
    release();
    await waitForJobs();
  }
});

test("空入力・非対応拡張子・サイズ超過を拒否し、不要なアップロードを残さない", async (t) => {
  const { request, dataDir } = await setup(t, { apiKey: key });
  for (const body of [
    payload({ transcript: "   " }),
    payload({ audio: true, extension: "exe" }),
    payload({ audio: true, size: 0 }),
    payload({ audio: true, size: MAX_FILE_SIZE + 1 }),
  ]) {
    assert.equal(
      (await request("/meetings", { method: "POST", body })).status,
      400,
    );
  }
  const invalidDate = payload({ audio: true });
  invalidDate.set("date", "2026-02-31");
  assert.equal(
    (await request("/meetings", { method: "POST", body: invalidDate })).status,
    400,
  );
  assert.deepEqual(await readdir(path.join(dataDir, "audio")), []);
});

test("会議を削除するとデータと音声を復元可能なゴミ箱へ移動する", async (t) => {
  const { request, dataDir, waitForJobs } = await setup(t, {
    apiKey: key,
    aiFactory: () => ({
      transcribe: async () => ({
        transcript: "会話",
        segments: [],
        duration: null,
      }),
      summarize: async () => sampleMinutes,
    }),
  });
  const m = await (
    await request("/meetings", {
      method: "POST",
      body: payload({ audio: true }),
    })
  ).json();
  await waitForJobs();
  assert.equal(
    (await request(`/meetings/${m.id}`, { method: "DELETE" })).status,
    204,
  );
  assert.equal((await request(`/meetings/${m.id}`)).status, 404);
  const deleted = JSON.parse(
    await readFile(path.join(dataDir, "trash", m.id, "meeting.json"), "utf8"),
  );
  assert.equal(deleted.id, m.id);
  assert.equal(
    (await readFile(path.join(dataDir, "trash", m.id, deleted.audioFile)))
      .length,
    44,
  );
});

test("再起動で処理中の記録を再試行可能なエラーに変え、文字起こしを保全する", async (t) => {
  const { store, dataDir } = await setup(t);
  const m = {
    ...createDemo(),
    isDemo: false,
    status: "analyzing",
    transcript: "保存済みの会話",
  };
  await store.save(m);
  const reopened = new MeetingStore(path.join(dataDir, "meetings"));
  await reopened.init();
  assert.equal(reopened.get(m.id).status, "error");
  assert.equal(reopened.get(m.id).transcript, "保存済みの会話");
  assert.match(reopened.get(m.id).error, /再起動/);
});

test("外部サイトからの操作とDNS rebindingを拒否する", async (t) => {
  const { request, base } = await setup(t);
  assert.equal(
    (
      await request("/demo", {
        method: "POST",
        headers: { Origin: "https://attacker.example" },
      })
    ).status,
    403,
  );
  assert.equal(
    (await fetch(`${base}/api/demo`, { method: "POST" })).status,
    403,
  );
  const reboundStatus = await new Promise((resolve, reject) => {
    httpGet(
      `${base}/api/meetings`,
      { headers: { Host: "attacker.example" } },
      (response) => {
        response.resume();
        resolve(response.statusCode);
      },
    ).on("error", reject);
  });
  assert.equal(reboundStatus, 403);
  assert.equal(
    (
      await request("/settings", {
        headers: { Origin: "http://127.0.0.1:5188" },
      })
    ).status,
    200,
  );
});

test("実際のSDKリクエストはGPT-4o Transcribeと指定のAstra/Solを使用する", async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), "kotonoha-wire-test-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const file = path.join(directory, "meeting.wav");
  await writeFile(file, new Uint8Array(44));
  for (const model of ["gpt-6-astra", "gpt-6-sol"]) {
    const calls = [];
    const ai = createAI(key, model, {
      maxRetries: 0,
      fetch: async (url, init) => {
        if (String(url) === "data:,") return new Response(""); // SDK multipart capability check.
        calls.push(String(url));
        if (String(url).endsWith("/audio/transcriptions")) {
          const form = await new Response(init.body, {
            headers: init.headers,
          }).formData();
          assert.equal(form.get("model"), "gpt-4o-transcribe");
          assert.equal(form.get("response_format"), "json");
          assert.equal(form.get("chunking_strategy"), null);
          return Response.json({ text: "文字起こしの本文。" });
        }
        const body = JSON.parse(init.body);
        assert.equal(body.model, model);
        assert.equal(body.store, false);
        assert.equal(body.reasoning.effort, "medium");
        assert.equal(body.text.format.type, "json_schema");
        assert.match(body.input[1].content, /文字起こしの本文/);
        return Response.json({
          id: "resp_test",
          object: "response",
          status: "completed",
          output: [
            {
              type: "message",
              role: "assistant",
              id: "msg_test",
              status: "completed",
              content: [
                {
                  type: "output_text",
                  text: JSON.stringify(sampleMinutes),
                  annotations: [],
                },
              ],
            },
          ],
        });
      },
    });
    const transcript = await ai.transcribe(file).catch((error) => {
      throw error.cause || error;
    });
    assert.deepEqual(transcript.segments, []);
    assert.equal(transcript.duration, null);
    const result = await ai.summarize({
      ...createDemo(),
      transcript: transcript.transcript,
    });
    assert.deepEqual(result, sampleMinutes);
    assert.equal(calls.length, 2);
  }
});
