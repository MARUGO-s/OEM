import { createReadStream } from "node:fs";
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { MAX_TEXT_LENGTH } from "./domain.mjs";
import {
  schemaForMeeting,
  parseMinutes,
  summaryInput,
} from "../supabase/functions/_shared/summary.mjs";

export function createAI(apiKey, model, clientOptions = {}) {
  const client = new OpenAI({
    apiKey,
    timeout: 15 * 60_000,
    maxRetries: 1,
    ...clientOptions,
  });
  return {
    async transcribe(filePath) {
      const response = await client.audio.transcriptions.create({
        file: createReadStream(filePath),
        model: "gpt-4o-transcribe",
        response_format: "json",
        language: "ja",
      });
      const transcript = response.text;
      if (!transcript?.trim())
        throw Object.assign(new Error("empty audio"), { code: "EMPTY_AUDIO" });
      // GPT-4o Transcribe does not return speaker IDs or timestamps. Never invent them.
      return { transcript, segments: [], duration: null };
    },
    async summarize(meeting, files = []) {
      if (meeting.transcript.length > MAX_TEXT_LENGTH)
        throw Object.assign(new Error("too long"), { code: "TEXT_TOO_LONG" });
      const response = await client.responses.parse({
        model,
        store: false,
        reasoning: { effort: "medium" },
        max_output_tokens: 16000,
        input: summaryInput(meeting, files),
        text: {
          format: zodTextFormat(schemaForMeeting(meeting), "meeting_minutes"),
        },
      });
      if (response.status !== "completed" || !response.output_parsed)
        throw new Error("No complete structured output");
      return parseMinutes(meeting, response.output_parsed);
    },
  };
}
