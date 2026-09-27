import { test } from "node:test";
import assert from "node:assert/strict";
import {
  speakerTurns,
  transcriptParagraphs,
} from "../src/transcript-paragraphs.mjs";

test("改行のない文字起こしを文末で段落に分け、本文を欠落させない", () => {
  const text =
    "何も見えないふりをしていた。悲しみが見えすぎたから。影も僕を見ていた。君のことは分かるから。失ったことで流れ着いた何よりも本当のこと。僕らはこうしてどこにも見せない愛で満たしてる本当。夜になって思い出した呪い背負った私たちは今なんて悲しみが積もった時も朝になって思い返した希望纏った私たちは今唯一無二の弱者強気でいいじゃん。忘れることで流れ着いた何よりも本当に大切なこと。";
  const paragraphs = transcriptParagraphs(text);
  assert.ok(paragraphs.length >= 2);
  assert.equal(paragraphs.join(""), text);
  for (const p of paragraphs) assert.match(p, /。$/);
});

test("既存の改行を段落の区切りとして保ち、短い末尾は前の段落につなげる", () => {
  assert.deepEqual(
    transcriptParagraphs(
      "はい。\n\nでは始めます。資料をご覧ください。以上です。",
    ),
    ["はい。", "では始めます。資料をご覧ください。以上です。"],
  );
  assert.deepEqual(transcriptParagraphs("一。二。三。四。五。"), [
    "一。二。三。四。五。",
  ]);
});

test("句点のない文や英語も扱い、空の入力では段落を返さない", () => {
  assert.deepEqual(transcriptParagraphs("句点のない発言"), ["句点のない発言"]);
  assert.deepEqual(transcriptParagraphs("Hello. How are you?"), [
    "Hello. How are you?",
  ]);
  assert.deepEqual(transcriptParagraphs(""), []);
  assert.deepEqual(transcriptParagraphs(undefined), []);
});

test("話者つきの文字起こしを発言ごとに読み取り、録音の見出しと続きの行を保つ", () => {
  assert.deepEqual(
    speakerTurns(
      "【録音 1】\n[00:03] 話者1：では始めます。\n\n[01:15] 話者2：資料です。\n補足です。\n\n【録音 2】\n話者1：続きです。",
    ),
    [
      { heading: "録音 1" },
      { speaker: "話者1", start: 3, text: "では始めます。" },
      { speaker: "話者2", start: 75, text: "資料です。\n補足です。" },
      { heading: "録音 2" },
      { speaker: "話者1", start: null, text: "続きです。" },
    ],
  );
  assert.equal(speakerTurns("話者のいない普通の文章です。"), null);
  assert.equal(speakerTurns(""), null);
});
