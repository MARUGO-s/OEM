import { useEffect, useState } from "react";
import { AlertCircle, Bot, Check, ExternalLink, LoaderCircle } from "lucide-react";
import { api } from "./api";
import type { BotPhase, BotStatusView, Meeting } from "./types";
import {
  BOT_PHASE_LABELS,
  botActive,
  botView,
} from "../supabase/functions/_shared/bot.mjs";

const STEPS: BotPhase[] = [
  "waiting",
  "joining",
  "recording",
  "uploading",
  "processing",
  "done",
];
const POLL_MS = 5000;

/** Meet bot progress for one meeting. Polls GET /meetings/:id/bot while the bot is active. */
export function BotStatus({
  meeting,
  onChange,
}: {
  meeting: Meeting;
  onChange: (m: Meeting) => void;
}) {
  const [view, setView] = useState<BotStatusView | null>(
    () => botView(meeting) as BotStatusView | null,
  );
  const [pollError, setPollError] = useState("");
  // The meeting list refresh also carries meeting.bot; prefer it when it is newer.
  useEffect(() => {
    setView(botView(meeting) as BotStatusView | null);
  }, [meeting]);
  const active = botActive(meeting);
  useEffect(() => {
    if (!active) return;
    let stop = false;
    let timer: ReturnType<typeof setTimeout>;
    let lastKey = `${meeting.status}:${meeting.bot?.state}:${meeting.bot?.updatedAt}`;
    async function poll() {
      try {
        const next = await api<BotStatusView>(`/meetings/${meeting.id}/bot`);
        if (stop) return;
        setView(next);
        setPollError("");
        const key = `${next.meetingStatus}:${next.state}:${next.updatedAt}`;
        if (key !== lastKey) {
          lastKey = key;
          const updated = await api<Meeting>(`/meetings/${meeting.id}`);
          if (!stop) onChange(updated);
        }
      } catch (e) {
        if (!stop) setPollError((e as Error).message);
      }
      if (!stop) timer = setTimeout(poll, POLL_MS);
    }
    timer = setTimeout(poll, POLL_MS);
    return () => {
      stop = true;
      clearTimeout(timer);
    };
  }, [active, meeting.id]);
  if (!view) return null;
  const current = view.phase === "error" ? -1 : STEPS.indexOf(view.phase);
  return (
    <div
      className={`bot-status ${view.phase === "error" ? "failed" : ""}`}
      role="status"
      aria-live="polite"
    >
      <div className="bot-status-head">
        <Bot size={20} />
        <strong>
          Bot：{BOT_PHASE_LABELS[view.phase as keyof typeof BOT_PHASE_LABELS]}
        </strong>
        {active && <LoaderCircle size={15} className="spin" />}
        <a href={view.meetUrl} target="_blank" rel="noreferrer noopener">
          {view.meetUrl.replace("https://", "")}
          <ExternalLink size={12} />
        </a>
      </div>
      <ol className="bot-steps">
        {STEPS.map((step, index) => (
          <li
            key={step}
            className={
              index < current || view.phase === "done"
                ? "done"
                : index === current
                  ? "current"
                  : ""
            }
          >
            {index < current || view.phase === "done" ? (
              <Check size={12} />
            ) : null}
            {BOT_PHASE_LABELS[step as keyof typeof BOT_PHASE_LABELS]}
          </li>
        ))}
      </ol>
      {view.phase === "error" ? (
        <p className="bot-status-error">
          <AlertCircle size={14} />
          {view.message || "Botでエラーが発生しました。"}
        </p>
      ) : (
        <p>
          {view.message ? `${view.message} ` : ""}
          {view.phase === "waiting"
            ? "Botが参加するまでお待ちください。Meetで参加リクエストが届いたら承認してください。"
            : view.phase === "joining"
              ? "BotがGoogle Meetに参加しています。"
              : view.phase === "recording"
                ? "音声のみを録音しています。会議が終わると自動で取り込みます。"
                : view.phase === "uploading"
                  ? "録音をアップロードしています。"
                  : view.phase === "processing"
                    ? "録音を受け取りました。文字起こしと議事録の作成を続けています。"
                    : "議事録が完成しました。"}
          {active && " この画面を開いている間、状況を自動で更新します。"}
        </p>
      )}
      {pollError && <p className="bot-status-error">{pollError}</p>}
    </div>
  );
}
