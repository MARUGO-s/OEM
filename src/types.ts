export interface Action {
  task: string;
  owner: string;
  due: string;
}
export interface Minutes {
  summary: string;
  topics: { title: string; points: string[] }[];
  decisions: string[];
  actions: Action[];
  openQuestions: string[];
}
export interface Meeting {
  id: string;
  title: string;
  date: string;
  participants: string;
  createdAt: string;
  status: "transcribing" | "analyzing" | "done" | "error";
  template: "standard" | "brief" | "detailed";
  source: "audio" | "text" | "demo";
  isDemo: boolean;
  hasAudio: boolean;
  fileName: string | null;
  recordings?: { fileName: string; transcribed: boolean }[];
  duration: number | null;
  transcript: string;
  markdown: string;
  minutes: Minutes | null;
  segments: {
    speaker: string;
    text: string;
    start: number | null;
    end: number | null;
  }[];
  completedActions: number[];
  speakerNames: Record<string, string>;
  error: string | null;
  minutesStale: boolean;
  minutesModel?: string;
  transcriptionModel?: string;
}
export interface Settings {
  configured: boolean;
  model: string;
  transcriptionModel: string;
  maxFileSize: number;
}
export const isWorking = (m: Meeting) =>
  ["transcribing", "analyzing"].includes(m.status);
export const modelName = (id?: string) =>
  id === "gpt-6-sol" ? "GPT-6 Sol" : "GPT-6 Astra";
export const today = () => new Intl.DateTimeFormat("sv-SE").format(new Date());
export const formatDate = (date: string) =>
  new Intl.DateTimeFormat("ja-JP", { month: "long", day: "numeric" }).format(
    new Date(`${date}T12:00:00`),
  );
export const clock = (value: number) =>
  `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(Math.floor(value % 60)).padStart(2, "0")}`;
