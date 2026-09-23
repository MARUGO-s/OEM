import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import {
  ArrowDownToLine,
  ArrowRight,
  AudioLines,
  BookOpen,
  CalendarDays,
  Check,
  CheckCheck,
  ChevronRight,
  CircleHelp,
  FileAudio,
  FileText,
  FolderOpen,
  LayoutGrid,
  ListTodo,
  LoaderCircle,
  Menu,
  MessageSquareText,
  Pencil,
  Plus,
  ReceiptText,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  UploadCloud,
  X,
} from "lucide-react";
import { api } from "./api";
import { isCloud, signOut } from "./cloud";
import {
  formatDate,
  isWorking,
  modelName,
  transcriptionModelName,
  today,
  type Meeting,
  type Settings,
} from "./types";
import { NewMeeting } from "./NewMeeting";
import { SettingsDialog } from "./SettingsDialog";
import { ActionList, MeetingDetail } from "./MeetingDetail";
import { Calendar } from "./Calendar";
import { UsagePage } from "./UsagePage";
import { Modal } from "./Modal";
import { tokyoToday } from "../supabase/functions/_shared/calendar.mjs";

type Page = "meetings" | "calendar" | "actions" | "usage" | "help";
export default function App() {
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [page, setPage] = useState<Page>("meetings");
  const [calendarDate, setCalendarDate] = useState(tokyoToday);
  const [selected, setSelected] = useState<string | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [demoLoading, setDemoLoading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [renameTarget, setRenameTarget] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [renameBusy, setRenameBusy] = useState(false);
  const [renameError, setRenameError] = useState("");
  const renameInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!renameTarget) return;
    const frame = requestAnimationFrame(() => renameInput.current?.select());
    return () => cancelAnimationFrame(frame);
  }, [renameTarget]);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const notify = useCallback((message: string) => {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 5000);
  }, []);
  useEffect(
    () => () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    },
    [],
  );
  const refresh = useCallback(async () => {
    try {
      const [records, config] = await Promise.all([
        api<Meeting[]>("/meetings"),
        api<Settings>("/settings"),
      ]);
      setMeetings(records);
      setSettings(config);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  const processing = meetings.some(isWorking);
  useEffect(() => {
    if ((!processing && !isCloud) || editing || renameTarget) return;
    let stop = false;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const records = await api<Meeting[]>("/meetings");
        const config = isCloud ? await api<Settings>("/settings") : null;
        if (!stop) {
          setMeetings(records);
          if (config) setSettings(config);
          setError("");
        }
      } catch (e) {
        if (!stop) setError((e as Error).message);
      }
      if (!stop) timer = setTimeout(poll, processing ? 2500 : 10000);
    }
    timer = setTimeout(poll, processing ? 2500 : 10000);
    return () => {
      stop = true;
      clearTimeout(timer);
    };
  }, [processing, editing, renameTarget]);
  function updateMeeting(next: Meeting) {
    setMeetings((prev) =>
      prev.some((m) => m.id === next.id)
        ? prev.map((m) => (m.id === next.id ? next : m))
        : [next, ...prev],
    );
  }
  function openRename(meeting: Meeting) {
    setRenameTarget(meeting.id);
    setRenameDraft(meeting.title);
    setRenameError("");
    setSidebarOpen(false);
  }
  async function saveRename(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const title = renameDraft.trim();
    if (!renameTarget || !title || title.length > 160) return;
    setRenameBusy(true);
    setRenameError("");
    try {
      const updated = await api<Meeting>(`/meetings/${renameTarget}`, {
        method: "PATCH",
        body: JSON.stringify({ title }),
      });
      updateMeeting(updated);
      setRenameTarget(null);
      notify("会議名を変更しました。共有画面にも反映されます。");
    } catch (e) {
      setRenameError((e as Error).message);
    } finally {
      setRenameBusy(false);
    }
  }
  function go(next: Page) {
    setPage(next);
    setSelected(null);
    setSidebarOpen(false);
    setSearch("");
  }
  function openMeeting(id: string) {
    setSelected(id);
    if (page !== "calendar") setPage("meetings");
    setSidebarOpen(false);
    window.scrollTo({ top: 0 });
  }
  async function demo() {
    setDemoLoading(true);
    try {
      const m = await api<Meeting>("/demo", { method: "POST" });
      updateMeeting(m);
      openMeeting(m.id);
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setDemoLoading(false);
    }
  }
  async function create(data: FormData, progress: (message: string) => void) {
    const m =
      data.getAll("audio").length || data.getAll("attachment").length
        ? await (
            await import("./upload-recordings")
          ).uploadRecordings(data, progress)
        : await api<Meeting>("/meetings", { method: "POST", body: data });
    updateMeeting(m);
    setNewOpen(false);
    openMeeting(m.id);
  }
  const realMeetings = meetings.filter((m) => !m.isDemo);
  const actionCount = realMeetings.reduce(
    (count, m) =>
      count + (m.minutes?.actions.length || 0) - m.completedActions.length,
    0,
  );
  const current = meetings.find((m) => m.id === selected);
  const filtered = meetings.filter(
    (m) =>
      (filter === "all" ||
        (filter === "done" ? m.status === "done" : isWorking(m))) &&
      `${m.title} ${m.participants} ${m.transcript} ${m.markdown}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const pageTitle =
    page === "calendar"
      ? "共有カレンダー"
      : page === "actions"
        ? "アクション"
        : page === "help"
          ? "使い方ガイド"
          : page === "usage"
            ? "API使用料"
          : "会議ワークスペース";
  return (
    <div className="app-shell">
      {sidebarOpen && (
        <button
          className="sidebar-backdrop"
          aria-label="メニューを閉じる"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      <aside inert={editing} className={`sidebar ${sidebarOpen ? "open" : ""}`}>
        <button
          className="brand"
          onClick={() => go("meetings")}
          aria-label="kotonoha ホーム"
        >
          <span className="brand-symbol">
            <AudioLines size={24} />
          </span>
          <span>
            kotonoha<small>会話を、次の一歩に。</small>
          </span>
        </button>
        <div className="workspace-switch">
          <span className="workspace-avatar">K</span>
          <span>
            {isCloud ? "共有ワークスペース" : "マイワークスペース"}
            <small>{isCloud ? "チーム共通" : "パーソナル"}</small>
          </span>
          <span className="local-pill">{isCloud ? "CLOUD" : "LOCAL"}</span>
        </div>
        <button
          className="button primary new-meeting-button"
          onClick={() => {
            setNewOpen(true);
            setSidebarOpen(false);
          }}
        >
          <Plus size={18} />
          新しい会議
        </button>
        <span className="nav-label">WORKSPACE</span>
        <nav>
          {(
            [
              { id: "meetings", Icon: LayoutGrid, label: "すべての会議" },
              { id: "calendar", Icon: CalendarDays, label: "カレンダー" },
              { id: "actions", Icon: ListTodo, label: "アクション" },
              { id: "usage", Icon: ReceiptText, label: "API使用料" },
              { id: "help", Icon: BookOpen, label: "使い方ガイド" },
            ] as const
          ).map(({ id, Icon, label }) => (
            <button
              key={id}
              className={page === id ? "active" : ""}
              onClick={() => go(id)}
            >
              <Icon size={18} />
              <span>{label}</span>
              {id === "meetings" && (
                <span className="nav-count">{realMeetings.length}</span>
              )}
              {id === "actions" && actionCount > 0 && (
                <span className="nav-count">{actionCount}</span>
              )}
            </button>
          ))}
          <button onClick={() => {
            setSettingsOpen(true);
            setSidebarOpen(false);
          }}>
            <Settings2 size={18} />
            <span>接続設定</span>
            <span className={`status-dot ${settings?.configured ? "" : "off"}`} />
          </button>
        </nav>
        <div className="sidebar-recents">
          <span className="nav-label">最近の会議</span>
          {meetings.slice(0, 5).map((m) => (
            <div key={m.id} className={`recent-row ${selected === m.id ? "selected" : ""}`}>
              <button className="recent-open" onClick={() => openMeeting(m.id)}>
                <FileText size={15} />
                <span>{m.title}</span>
                {isWorking(m) && <span className="status-dot pulse" />}
              </button>
              <button
                className="recent-rename"
                aria-label={`${m.title}の名前を変更`}
                title="名前を変更"
                disabled={isWorking(m)}
                onClick={() => openRename(m)}
              >
                <Pencil size={14} />
              </button>
            </div>
          ))}
          {!meetings.length && (
            <p>
              作成した会議が
              <br />
              ここに表示されます。
            </p>
          )}
        </div>
        <div className="sidebar-bottom">
          <div className="local-info">
            <ShieldCheck size={17} />
            <div>
              <strong>{isCloud ? "専用クラウドに保存" : "このPCに保存"}</strong>
              <small>
                {isCloud ? "全員で同じ記録を共有" : "会議の記録を、手元に。"}
              </small>
            </div>
          </div>
          {isCloud && (
            <button
              className="settings-link"
              onClick={async () => {
                try {
                  await signOut();
                } catch {
                  notify("ログアウトできませんでした。再度お試しください。");
                }
              }}
            >
              ログアウト
            </button>
          )}
          <div className="sidebar-foot">
            <span>kotonoha</span>
            <span>MEETING STUDIO</span>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar" inert={editing}>
          <div>
            <button
              className="icon-button mobile-menu"
              aria-label="メニューを開く"
              onClick={() => setSidebarOpen(true)}
            >
              <Menu size={21} />
            </button>
            <span>ワークスペース</span>
            <ChevronRight size={13} />
            <strong>{pageTitle}</strong>
          </div>
          <div>
            <span className="topbar-date">
              <CalendarDays size={14} />
              {new Intl.DateTimeFormat("ja-JP", {
                month: "long",
                day: "numeric",
                weekday: "short",
              }).format(new Date())}
            </span>
            <button
              className="icon-button"
              aria-label="使い方を開く"
              onClick={() => go("help")}
            >
              <CircleHelp size={19} />
            </button>
            <span className="profile-avatar">K</span>
          </div>
        </header>
        <main className={`main-content ${current ? "detail-view" : ""}`}>
          {error && (
            <div className="error-message app-error" role="alert">
              {error}
              <button className="text-button" onClick={refresh}>
                再接続
              </button>
            </div>
          )}
          {current ? (
            <MeetingDetail
              key={current.id}
              meeting={current}
              onBack={() => setSelected(null)}
              backLabel={
                page === "calendar" ? "カレンダーへ戻る" : "すべての会議"
              }
              onCalendar={(date) => {
                if (date) setCalendarDate(date);
                go("calendar");
              }}
              onRename={openRename}
              onChange={updateMeeting}
              onDelete={(id) => {
                setMeetings((prev) => prev.filter((m) => m.id !== id));
                setSelected(null);
              }}
              notify={notify}
              onEditingChange={setEditing}
            />
          ) : page === "meetings" ? (
            <>
              <div className="page-heading">
                <div>
                  <div className="eyebrow">YOUR MEETING, CLEARLY.</div>
                  <h1>会話を、次の一歩に。</h1>
                  <p>録音から議事録まで。会議のあとの仕事を、もっと軽く。</p>
                </div>
                <button
                  className="button secondary"
                  onClick={demo}
                  disabled={demoLoading}
                >
                  {demoLoading ? (
                    <LoaderCircle size={16} className="spin" />
                  ) : (
                    <Sparkles size={16} />
                  )}
                  サンプルを開く
                  <ArrowRight size={15} />
                </button>
              </div>
              <section className="hero-card">
                <div className="hero-content">
                  <div className="hero-tag">
                    <span className="status-dot" />
                    AI MEETING ASSISTANT
                  </div>
                  <h2>
                    話したことを、
                    <br />
                    使える記録に。
                  </h2>
                  <p>
                    録音ファイルをアップロードするだけ。
                    <br />
                    文字起こし、要点の整理、議事録の作成までをひとつに。
                  </p>
                  <button
                    className="button primary"
                    onClick={() => setNewOpen(true)}
                  >
                    <UploadCloud size={18} />
                    録音ファイルを取り込む
                    <ArrowRight size={17} />
                  </button>
                  <span className="hero-formats">
                    AAC・MP3・M4A など対応 · 複数録音を統合
                  </span>
                </div>
                <div className="hero-illustration" aria-hidden="true">
                  <div className="orbit orbit-one" />
                  <div className="orbit orbit-two" />
                  <div className="floating-audio">
                    <span className="audio-icon">
                      <AudioLines size={23} />
                    </span>
                    <div>
                      <b>定例ミーティング.m4a</b>
                      <div className="waveform">
                        {Array.from({ length: 30 }, (_, i) => (
                          <i
                            key={i}
                            style={{
                              height: `${[10, 17, 12, 24, 31, 20, 14, 27, 18, 35, 26, 16][i % 12]}px`,
                            }}
                          />
                        ))}
                      </div>
                    </div>
                    <span className="audio-check">
                      <Check size={13} />
                    </span>
                  </div>
                  <div className="transform-spark">
                    <Sparkles size={22} />
                  </div>
                  <div className="floating-document">
                    <div className="illustration-doc-title">
                      <span>
                        <FileText size={18} />
                      </span>
                      <b>ミーティングの議事録</b>
                      <span className="mini-badge">完成</span>
                    </div>
                    <div className="illustration-line w90" />
                    <div className="illustration-line w65" />
                    <div className="illustration-section">
                      <span>
                        <CheckCheck size={14} />
                        決まったこと
                      </span>
                      <div className="illustration-line w85" />
                      <div className="illustration-line w60" />
                    </div>
                    <div className="illustration-action">
                      <span>
                        <Check size={10} />
                      </span>
                      <div className="illustration-line w65" />
                      <span className="tiny-avatar">K</span>
                    </div>
                  </div>
                  <div className="floating-caption">
                    <Sparkles size={12} />
                    大切なことを、取りこぼさない。
                  </div>
                </div>
              </section>
              <div className="workflow-strip">
                {[
                  {
                    Icon: UploadCloud,
                    title: "録音を取り込む",
                    note: "会議の音声ファイルをアップロード",
                  },
                  {
                    Icon: MessageSquareText,
                    title: "AIが会話を読み解く",
                    note: "全文の文字起こしとポイントの整理",
                  },
                  {
                    Icon: FileText,
                    title: "議事録ができあがる",
                    note: "決定事項・担当・期限までひと目で",
                  },
                ].map(({ Icon, title, note }, i) => (
                  <div className="workflow-step" key={title}>
                    <span className={`step-icon step-${i}`}>
                      <Icon size={20} />
                    </span>
                    <div>
                      <span className="step-number">0{i + 1}</span>
                      <strong>{title}</strong>
                      <small>{note}</small>
                    </div>
                    {i < 2 && <ChevronRight size={16} className="step-arrow" />}
                  </div>
                ))}
              </div>
              <div className="stats-grid">
                <div className="stat-card">
                  <span className="stat-icon purple-bg">
                    <FolderOpen size={20} />
                  </span>
                  <div>
                    <span>保存した会議</span>
                    <strong>
                      {realMeetings.length}
                      <small>件</small>
                    </strong>
                  </div>
                  <span className="stat-note">すべての記録</span>
                </div>
                <div className="stat-card">
                  <span className="stat-icon mint-bg">
                    <CheckCheck size={20} />
                  </span>
                  <div>
                    <span>作成済みの議事録</span>
                    <strong>
                      {realMeetings.filter((m) => m.status === "done").length}
                      <small>件</small>
                    </strong>
                  </div>
                  <span className="stat-note">いつでも振り返る</span>
                </div>
                <div className="stat-card">
                  <span className="stat-icon peach-bg">
                    <ListTodo size={20} />
                  </span>
                  <div>
                    <span>未完了のアクション</span>
                    <strong>
                      {actionCount}
                      <small>件</small>
                    </strong>
                  </div>
                  <button
                    className="stat-link"
                    onClick={() => go("actions")}
                    aria-label="アクションを確認"
                  >
                    <ArrowRight size={17} />
                  </button>
                </div>
              </div>
              <section className="meetings-section">
                <div className="section-heading">
                  <h2>
                    会議ライブラリ<span>{meetings.length}</span>
                  </h2>
                  <label className="search-box">
                    <Search size={16} />
                    <input
                      aria-label="会議を検索"
                      placeholder="会議名や内容で検索…"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                    {search && (
                      <button
                        className="icon-button"
                        aria-label="検索をクリア"
                        onClick={() => setSearch("")}
                      >
                        <X size={13} />
                      </button>
                    )}
                  </label>
                </div>
                <div className="library-tabs">
                  {[
                    ["all", "すべて"],
                    ["done", "作成完了"],
                    ["processing", "処理中"],
                  ].map(([id, label]) => (
                    <button
                      key={id}
                      className={filter === id ? "active" : ""}
                      onClick={() => setFilter(id)}
                    >
                      {label}
                    </button>
                  ))}
                  <span>新しい順</span>
                </div>
                {loading ? (
                  <div className="empty-state">
                    <LoaderCircle className="spin" size={25} />
                    <p>会議を読み込んでいます…</p>
                  </div>
                ) : filtered.length ? (
                  <div className="meeting-list">
                    {filtered.map((m) => (
                      <button
                        className="meeting-row"
                        key={m.id}
                        onClick={() => openMeeting(m.id)}
                      >
                        <span
                          className={`meeting-file-icon ${m.isDemo ? "demo" : ""}`}
                        >
                          {m.source === "audio" ? (
                            <FileAudio size={23} />
                          ) : (
                            <FileText size={23} />
                          )}
                        </span>
                        <div className="meeting-row-info">
                          <strong>{m.title}</strong>
                          <span>
                            {formatDate(m.date)}
                            <i />
                            {m.participants || "参加者未記入"}
                            {m.isDemo && <em>サンプル</em>}
                          </span>
                        </div>
                        <span
                          className={`badge ${m.status === "done" ? "success" : m.status === "error" ? "failure" : "neutral"}`}
                        >
                          {m.status === "done" ? (
                            <Check size={12} />
                          ) : isWorking(m) ? (
                            <LoaderCircle className="spin" size={12} />
                          ) : null}
                          {m.status === "done"
                            ? "作成完了"
                            : m.status === "transcribing"
                              ? m.transcriptionWait
                                ? "自動再開待ち"
                                : "文字起こし中"
                              : m.status === "analyzing"
                                ? "解析中"
                                : m.status === "uploading"
                                  ? "取り込み途中"
                                  : "要確認"}
                        </span>
                        <ChevronRight size={17} />
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="empty-state">
                    <span className="empty-state-icon">
                      <FolderOpen size={30} />
                    </span>
                    <h3>
                      {search || filter !== "all"
                        ? "条件に一致する会議がありません"
                        : "最初の会議を、ここから。"}
                    </h3>
                    <p>
                      {search || filter !== "all"
                        ? "検索キーワードや絞り込みを変更してください。"
                        : "録音を取り込むと、会議の記録がここに集まります。"}
                    </p>
                    {!search && filter === "all" && (
                      <button
                        className="text-button purple"
                        onClick={demo}
                        disabled={demoLoading}
                      >
                        まずはサンプルを見てみる
                        <ArrowRight size={14} />
                      </button>
                    )}
                  </div>
                )}
              </section>
              <div className="page-footer">
                <span>
                  <ShieldCheck size={14} />
                  {isCloud
                    ? `記録は専用クラウドで共有。音声は${transcriptionModelName(settings?.transcriptionModel)}で文字起こし。`
                    : `記録はこのPCに保存。音声は${transcriptionModelName(settings?.transcriptionModel)}で文字起こし。`}
                </span>
                <button
                  className="text-button"
                  onClick={() => setSettingsOpen(true)}
                >
                  {settings?.configured
                    ? `${transcriptionModelName(settings.transcriptionModel)} → ${modelName(settings.model)}`
                    : "AIの接続設定をする"}
                  <ArrowRight size={13} />
                </button>
              </div>
            </>
          ) : page === "calendar" ? (
            <Calendar
              meetings={meetings}
              selectedDate={calendarDate}
              onSelectDate={setCalendarDate}
              onOpenMeeting={openMeeting}
              onNew={() => setNewOpen(true)}
              onChange={updateMeeting}
              onEditingChange={setEditing}
              notify={notify}
            />
          ) : page === "actions" ? (
            <>
              <div className="page-heading">
                <div>
                  <div className="eyebrow">FROM WORDS TO ACTION.</div>
                  <h1>次の一歩を、ひとつずつ。</h1>
                  <p>会議から生まれたアクションを、まとめて確認できます。</p>
                </div>
                <span className="badge neutral">
                  未完了 {actionCount} 件（サンプルを除く）
                </span>
              </div>
              {meetings.filter((m) => m.minutes?.actions.length).length ? (
                meetings
                  .filter((m) => m.minutes?.actions.length)
                  .map((m) => (
                    <section className="actions-group" key={m.id}>
                      <div className="section-heading">
                        <button
                          className="text-button"
                          onClick={() => openMeeting(m.id)}
                        >
                          <FileText size={17} />
                          {m.title}
                          <ArrowRight size={14} />
                        </button>
                        {m.isDemo && (
                          <span className="badge sample">サンプル</span>
                        )}
                      </div>
                      <ActionList
                        meeting={m}
                        onChange={updateMeeting}
                        notify={notify}
                      />
                    </section>
                  ))
              ) : (
                <div className="empty-state standalone">
                  <ListTodo size={36} />
                  <h3>まだアクションはありません</h3>
                  <p>
                    会議の解析が完了すると、担当者と期限をここで確認できます。
                  </p>
                  <button
                    className="button primary"
                    onClick={() => setNewOpen(true)}
                  >
                    <Plus size={16} />
                    会議を作成
                  </button>
                </div>
              )}
            </>
          ) : page === "usage" ? (
            <UsagePage meetings={meetings} />
          ) : (
            <Help
              onNew={() => setNewOpen(true)}
              onSettings={() => setSettingsOpen(true)}
            />
          )}
        </main>
      </div>
      {newOpen && (
        <NewMeeting
          settings={settings}
          onClose={() => setNewOpen(false)}
          onCreate={create}
          onSettings={() => setSettingsOpen(true)}
        />
      )}
      {settingsOpen && (
        <SettingsDialog
          settings={settings}
          onClose={() => setSettingsOpen(false)}
          onSave={(value) => {
            setSettings(value);
            setSettingsOpen(false);
            notify("AIの接続設定を保存しました");
          }}
        />
      )}
      {renameTarget && (
        <Modal
          title="会議名を変更"
          subtitle="一覧・会議詳細・書き出し時の名前に反映されます。"
          onClose={() => setRenameTarget(null)}
          locked={renameBusy}
        >
          <form onSubmit={saveRename}>
            <label className="field">
              会議名
              <input
                ref={renameInput}
                required
                maxLength={160}
                value={renameDraft}
                onChange={(event) => {
                  setRenameDraft(event.target.value);
                  setRenameError("");
                }}
              />
            </label>
            {renameError && <p className="error-message" role="alert">{renameError}</p>}
            <div className="modal-footer">
              <button type="button" className="button secondary" disabled={renameBusy} onClick={() => setRenameTarget(null)}>キャンセル</button>
              <button type="submit" className="button primary" disabled={renameBusy || !renameDraft.trim()}>保存する</button>
            </div>
          </form>
        </Modal>
      )}
      {toast && (
        <div className="toast" role="status">
          <Check size={17} />
          <span>{toast}</span>
          <button
            className="icon-button"
            aria-label="通知を閉じる"
            onClick={() => setToast("")}
          >
            <X size={15} />
          </button>
        </div>
      )}
    </div>
  );
}

function Help({
  onNew,
  onSettings,
}: {
  onNew: () => void;
  onSettings: () => void;
}) {
  return (
    <div className="help-page">
      <div className="page-heading">
        <div>
          <div className="eyebrow">A LITTLE GUIDE.</div>
          <h1>録音から、使える議事録へ。</h1>
          <p>準備は録音ファイルだけ。あとの整理はAIに任せましょう。</p>
        </div>
      </div>
      <div className="help-steps">
        {[
          {
            title: "AIの接続設定",
            text: "OpenAIのAPIキーを設定し、議事録に使うGPT-6 Astra・Sol・Lunaを選択します。文字起こしはGPT TranscribeまたはGemini 3.5 Transcribeから選べます。Geminiを使う場合はGemini APIキーも設定してください。",
            action: "接続設定を開く",
            run: onSettings,
          },
          {
            title: "録音済みファイルを取り込む",
            text: "AAC・MP3・M4A・WAV・MP4・WebM・OGG・FLACに対応。最大5ファイル・合計100 MB（100,000,000バイト）まで選び、上下ボタンで録音順に並べます。大きな録音はブラウザー内で自動分割し、順番に文字起こしして1つの議事録にまとめます。送信完了まで画面を開いたままにしてください。その後は、画面を閉じても完了分が保存され、次回開くと未処理分を再開します。録音は文字起こしタブで分割ごとに再生できます。文字起こしは合計10万文字までです。",
            action: "録音を取り込む",
            run: onNew,
          },
          {
            title: "文字起こしから議事録まで自動作成",
            text: `録音を全文テキストに変換した後、議題・決定事項・アクション・継続検討事項を整理します。Geminiは送信間隔を30秒以上空け、一時的な利用制限（429）では待ち時間を延ばして最大5回自動で再試行します。待機時間と完了数は会議の詳細に表示されます。日次上限などはGoogle AI Studioで利用枠をご確認ください。${isCloud ? "完了分と待機時刻は保存され、次回画面を開いた時に未処理分から再開します。" : "処理中はアプリのサーバーを起動したままにしてください。"}`,
          },
          {
            title: "API使用料を確認",
            text: "左メニューの「API使用料」で対象月のドル円レートを入力・保存すると、解析1回ごとの概算料金を円で確認できます。解析の内訳には文字起こし・議事録生成の日時、モデル、入力・出力トークン、音声時間を表示します。分割録音は同じ解析にまとめ、再生成は別の解析です。レートはこのブラウザーに月ごとに保存されます。旧履歴のまとめ方は推定で、料金は請求の確定額ではありません。",
          },
          {
            title: "会議資料を添えて、会話との関連性を解析",
            text: "新しい会議の「会議の添付資料」からExcel・Word・PDF・PowerPoint・CSV・TXTを追加できます。資料は録音とは別枠で最大5ファイル・各10 MB・合計25 MB。既存会議では「添付資料」に保存後、「議事録を再生成」を押してください。関連性・参照箇所・相違点は議事録の「添付資料との照合」に残します。資料だけの記載は会議の決定と区別します。Excel・CSVは各シート先頭1,000行まで。Word・Excel・PowerPoint内の図表が重要な場合はPDFも添付し、パスワードは解除してください。",
          },
          {
            title: "カレンダーで予定・期限を確認、手動で変更",
            text: "会話で決まった予定や期限を月間・一覧で確認できます。日本時間で表示し、予定案・資料のみの記載は確定と区別します。日付を特定できない「来週まで」などは日付要確認に置きます。以前の議事録の日付は要確認の候補として表示します。「予定を編集」で内容を変更できます。カードの「削除」で1件を除外し、「選択して一括削除」では複数件を選べます。日付未定欄の「このN件を選択」でまとめて選べます。削除済みの予定は下部から戻せます。元の会議録は消えず、変更は全員に共有されます。同じ予定の削除は再解析後も保持しますが、AIが別の内容として抽出した予定は新しい候補として現れる場合があります。外部カレンダーへの同期・通知はありません。",
          },
          {
            title: "内容を確認して、編集・書き出し",
            text: "会議名は詳細タイトル横の「名前を変更」、または左メニュー「最近の会議」の鉛筆ボタンから変更できます。議事録タブの「議事録を編集」から本文を自由に修正し、「保存」で全員に共有できます。本文・カレンダー・AI抽出の要点やアクションは別々に管理され、本文の修正は他の欄に自動反映しません。同じ本文を同時に編集した場合は最後の保存が優先されます。「文字起こし」で音声を再生しながら確認・修正し、議事録を再生成することもできます。再生成は編集済み本文を上書きするため確認してください。「書き出す」からMarkdown・テキスト・JSONを保存でき、印刷からPDFにもできます。",
          },
        ].map((step, i) => (
          <section key={step.title}>
            <span>{String(i + 1).padStart(2, "0")}</span>
            <div>
              <h2>{step.title}</h2>
              <p>{step.text}</p>
              {step.run && (
                <button className="text-button purple" onClick={step.run}>
                  {step.action}
                  <ArrowRight size={14} />
                </button>
              )}
            </div>
          </section>
        ))}
      </div>
      <section className="help-note">
        <ShieldCheck size={23} />
        <div>
          <h3>データの保存について</h3>
          <p>
            {isCloud
              ? "会議・音声・資料はSupabaseの会議録専用領域に非公開で保存し、ログインした全員で共有します。追加・編集・削除も共通です。他の人の変更は約10秒ごとに反映します（編集中を除く）。OpenAIとGeminiのAPIキーはワークスペース共通で別々に暗号化保存し、画面には再表示しません。Gemini文字起こしを選ぶと音声をGoogleへ送信し、文字起こし後に一時ファイルの削除を要求します。テキスト・全添付資料・議事録生成はOpenAIへ送信され、各APIの利用料がかかります。会議の削除・資料の関連付け解除後も資料は保持します。復元・完全消去は管理者にご依頼ください。"
              : "会議・音声・資料はアプリの .data フォルダに保存されます。Dropboxの設定によってはクラウドにも同期されます。Gemini文字起こしを選ぶと音声をGoogleへ送信し、テキスト・全添付資料・議事録生成はOpenAIへ送信します。各APIの利用料がかかります。関連付けを解除した資料も保持します。削除した会議は .data/trash に移動します。"}
          </p>
        </div>
      </section>
      <section className="help-note">
        <MessageSquareText size={23} />
        <div>
          <h3>解析結果について</h3>
          <p>
            GPT-4o
            Transcribeの文字起こしには話者名・発言時刻が含まれません。参加者名との対応は推測せず、会話にない担当者や期限は「未定」として扱います。決定事項や固有名詞は元の録音と照合してください。
          </p>
        </div>
      </section>
    </div>
  );
}
