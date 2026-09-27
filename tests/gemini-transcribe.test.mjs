import assert from "node:assert/strict";
import test from "node:test";
import {
  speakerTranscript,
  transcribeWithGemini,
} from "../supabase/functions/_shared/gemini-transcribe.mjs";
import { safeError } from "../supabase/functions/_shared/domain.mjs";

// REST shape from https://ai.google.dev/gemini-api/docs/transcribe#parsing-transcription-output
const completed = (content) => ({
  id: "interactions/test",
  status: "completed",
  steps: [{ type: "model_output", content }],
});
const part = (text) => ({ type: "text", text });
const key = "test-key-never-sent";
const fileUri = "https://generativelanguage.googleapis.com/v1beta/files/test";

function mockGoogle(t, result, { fileState = "ACTIVE", failure } = {}) {
  const calls = [];
  t.mock.method(globalThis, "fetch", async (url, init) => {
    const target = new URL(url);
    calls.push({ target, init });
    if (target.pathname === "/upload/v1beta/files") {
      assert.equal(target.searchParams.get("key"), key);
      return new Response(null, {
        headers: {
          "x-goog-upload-url":
            "https://generativelanguage.googleapis.com/upload/session/test",
        },
      });
    }
    if (target.pathname === "/upload/session/test") {
      assert.equal(init.body.size, 44);
      return Response.json({
        file: { name: "files/test", uri: fileUri, state: fileState },
      });
    }
    if (target.pathname === "/v1beta/interactions") {
      assert.equal(init.method, "POST");
      assert.equal(init.headers["x-goog-api-key"], key);
      const body = JSON.parse(init.body);
      assert.equal(body.model, "gemini-3.5-transcribe");
      assert.equal(
        body.store,
        false,
        "do not enable server-side conversation retention",
      );
      assert.deepEqual(body.input, [
        { type: "audio", uri: fileUri, mime_type: "audio/wav" },
      ]);
      assert.deepEqual(body.generation_config, {
        transcription_config: {
          language_codes: ["ja-JP"],
          mode: {
            type: "verbatim",
            diarization_mode: "speaker",
            timestamp_granularities: ["word"],
          },
        },
      });
      if (failure) throw failure;
      return Response.json(result);
    }
    if (target.pathname === "/v1beta/files/test" && init.method === "DELETE") {
      assert.equal(target.searchParams.get("key"), key);
      return Response.json({});
    }
    assert.fail(`Unexpected Gemini route: ${target.pathname}`);
  });
  return calls;
}

const transcribe = () =>
  transcribeWithGemini(key, new Blob([new Uint8Array(44)]), "meeting.wav");
const wasCleaned = (calls) => calls.at(-1)?.init.method === "DELETE";

test("Gemini RESTのmodel_outputを読み取り、thoughtや入力を混ぜず音声を後片付けする", async (t) => {
  const response = completed([part(" 会議は"), part("10月15日です。 ")]);
  response.steps.unshift({ type: "thought", content: [part("推論は非公開")] });
  response.steps.unshift({
    type: "user_input",
    content: [part("入力は転載しない")],
  });
  const calls = mockGoogle(t, response);
  assert.equal(await transcribe(), "会議は10月15日です。");
  assert.ok(wasCleaned(calls));
});

test("Geminiのoutput_text形式も取得する", async (t) => {
  const calls = mockGoogle(t, {
    status: "completed",
    output_text: " 会議内容。 ",
  });
  assert.equal(await transcribe(), "会議内容。");
  assert.ok(wasCleaned(calls));
});

for (const [name, response, code, geminiStatus] of [
  [
    "旧APIの応答",
    { candidates: [{ content: { parts: [part("本文")] } }] },
    "GEMINI_TRANSCRIPT_INCOMPLETE",
    "unknown",
  ],
  [
    "未完了の部分結果",
    { ...completed([part("途中")]), status: "in_progress" },
    "GEMINI_TRANSCRIPT_INCOMPLETE",
    "in_progress",
  ],
  [
    "出力上限で途中までの結果",
    { ...completed([part("途中まで")]), status: "incomplete" },
    "GEMINI_TRANSCRIPT_INCOMPLETE",
    "incomplete",
  ],
  [
    "失敗した応答",
    { status: "failed", error: { message: "private provider message" } },
    "GEMINI_TRANSCRIPT_INCOMPLETE",
    "failed",
  ],
  [
    "想定外の状態",
    { status: "Private Provider Message" },
    "GEMINI_TRANSCRIPT_INCOMPLETE",
    "unknown",
  ],
  [
    "出力がない応答",
    { status: "completed", steps: [] },
    "GEMINI_TRANSCRIPT_INVALID",
  ],
  [
    "不正な型の応答",
    completed([{ type: "text", text: {} }]),
    "GEMINI_TRANSCRIPT_INVALID",
  ],
  ["空の文字起こし", completed([part(" \n ")]), "GEMINI_NO_TRANSCRIPT"],
]) {
  test(`${name}を発話なしと誤判定せず、音声を後片付けする`, async (t) => {
    const calls = mockGoogle(t, response);
    await assert.rejects(transcribe(), (error) => {
      assert.equal(error.code, code);
      assert.equal(error.provider, "gemini");
      assert.equal(error.geminiStatus, geminiStatus);
      assert.doesNotMatch(
        safeError(error),
        /発話を検出できません|private provider message|Private Provider/i,
      );
      if (geminiStatus)
        assert.match(safeError(error), new RegExp(`状態：${geminiStatus}`));
      return true;
    });
    assert.ok(wasCleaned(calls));
  });
}

test("Gemini通信が失敗しても送信済みファイルを後片付けする", async (t) => {
  const calls = mockGoogle(t, null, { failure: new TypeError("fetch failed") });
  await assert.rejects(transcribe(), { code: "GEMINI_TRANSCRIBE_NETWORK" });
  assert.ok(wasCleaned(calls));
});

test("Geminiのファイル処理が失敗した場合も後片付けする", async (t) => {
  const calls = mockGoogle(t, null, { fileState: "FAILED" });
  await assert.rejects(transcribe(), { code: "GEMINI_FILE_NOT_READY" });
  assert.ok(
    !calls.some(({ target }) => target.pathname === "/v1beta/interactions"),
  );
  assert.ok(wasCleaned(calls));
});

const word = (text, speaker, start) => ({
  type: "word_info",
  text,
  speaker,
  start_offset: `${start}s`,
  end_offset: `${start + 0.4}s`,
});

test("話者つきの単語情報を発言ごとにまとめ、分割部分の開始時刻を足す", async (t) => {
  const response = completed([
    {
      type: "text",
      text: "では始めますはいお願いしますAI会議",
      annotations: [
        word("では", "spk_1", 0.1),
        word("始めます", "spk_1", 0.5),
        word("はい", "spk_2", 2.2),
        word("お願いします", "spk_2", 2.6),
        word("AI", "spk_1", 64.9),
        word("meeting", "spk_1", 65.3),
      ],
    },
  ]);
  mockGoogle(t, response);
  assert.equal(
    await transcribeWithGemini(
      key,
      new Blob([new Uint8Array(44)]),
      "meeting.wav",
      () => {},
      { offset: 600 },
    ),
    "[10:00] 話者1：では始めます\n\n[10:02] 話者2：はいお願いします\n\n[11:04] 話者1：AI meeting",
  );
});

test("前の部分の長さが不明なら時刻を省き、単語情報がなければ本文を使う", () => {
  const parts = [
    {
      type: "text",
      text: "こんにちは",
      annotations: [word("こんにちは", "spk_3", 1)],
    },
  ];
  assert.equal(speakerTranscript(parts, null), "話者3：こんにちは");
  assert.equal(speakerTranscript([{ type: "text", text: "本文" }]), null);
});
