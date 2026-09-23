import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Clock3,
  MapPin,
  Users,
  Search,
  List,
  Grid2X2,
  Pencil,
  FileText,
  AlertCircle,
  Check,
  Save,
  LoaderCircle,
  RotateCcw,
  Trash2,
} from "lucide-react";
import {
  allCalendarEvents,
  hiddenCalendarEvents,
  meetingEvents,
  monthDays,
  occursOn,
  overlapsMonth,
  shortDate,
  tokyoToday,
  addDays,
  validDate,
  CalendarEditSchema,
} from "../supabase/functions/_shared/calendar.mjs";
import { api } from "./api";
import { Modal } from "./Modal";
import "./calendar.css";
import type { Meeting, CalendarEntry, CalendarEdit } from "./types";

const statusText = {
  confirmed: "確定",
  tentative: "予定案",
  needs_confirmation: "要確認",
};
const kindText = { event: "予定", deadline: "期限" };
const timeText = (e: CalendarEntry) =>
  e.startTime
    ? `${e.startTime}${e.endTime ? `–${e.endTime}` : ""}`
    : "時刻未指定";
const sortEvents = (a: CalendarEntry, b: CalendarEntry) =>
  (a.date || "9999").localeCompare(b.date || "9999") ||
  (a.startTime || "99").localeCompare(b.startTime || "99") ||
  a.title.localeCompare(b.title, "ja");
const selectionKey = (entry: CalendarEntry) => `${entry.meetingId}:${entry.id}`;
type HiddenEntry = {
  id: string;
  meetingId: string;
  meetingTitle: string;
  title: string;
  hiddenAt: string;
};
export function Calendar({
  meetings,
  selectedDate,
  onSelectDate,
  onOpenMeeting,
  onNew,
  onChange,
  onEditingChange,
  notify,
}: {
  meetings: Meeting[];
  selectedDate: string;
  onSelectDate: (date: string) => void;
  onOpenMeeting: (id: string) => void;
  onNew: () => void;
  onChange: (m: Meeting) => void;
  onEditingChange: (v: boolean) => void;
  notify: (s: string) => void;
}) {
  const [view, setView] = useState<"month" | "list">(() =>
    window.matchMedia("(max-width:700px)").matches ? "list" : "month",
  );
  const [query, setQuery] = useState(""),
    [kind, setKind] = useState("all"),
    [status, setStatus] = useState("all"),
    [editing, setEditing] = useState<CalendarEntry | null>(null);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [deletePending, setDeletePending] = useState<CalendarEntry[] | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteProgress, setDeleteProgress] = useState(0);
  const [deleteError, setDeleteError] = useState("");
  const [showHidden, setShowHidden] = useState(false);
  const [restoreBusy, setRestoreBusy] = useState("");
  useEffect(() => {
    if (!deletePending) return;
    onEditingChange(true);
    return () => onEditingChange(false);
  }, [deletePending, onEditingChange]);
  const today = tokyoToday(),
    month = selectedDate.slice(0, 7);
  const all = useMemo(
    () => allCalendarEvents(meetings) as CalendarEntry[],
    [meetings],
  );
  const hidden = useMemo(
    () => hiddenCalendarEvents(meetings) as HiddenEntry[],
    [meetings],
  );
  const events = useMemo(
    () =>
      all
        .filter(
          (e) =>
            (kind === "all" || e.kind === kind) &&
            (status === "all" || e.status === status) &&
            `${e.title} ${e.owner} ${e.location} ${e.meetingTitle} ${e.dateText}`
              .toLowerCase()
              .includes(query.toLowerCase()),
        )
        .sort(sortEvents),
    [all, kind, status, query],
  );
  const inMonth = events.filter((e) => overlapsMonth(e, month)),
    undated = events.filter((e) => !e.date),
    dayEvents = events.filter((e) => occursOn(e, selectedDate));
  const visibleEvents = (view === "list" ? inMonth : dayEvents)
    .concat(undated)
    .filter((entry) => {
      const meeting = meetings.find((m) => m.id === entry.meetingId);
      return meeting && !["uploading", "transcribing", "analyzing"].includes(meeting.status);
    });
  const selectedEntries = all.filter((entry) => selectedKeys.has(selectionKey(entry)));
  const allVisibleSelected = visibleEvents.length > 0 &&
    visibleEvents.every((entry) => selectedKeys.has(selectionKey(entry)));
  const cells = monthDays(month);
  function canChange(entry: CalendarEntry) {
    const meeting = meetings.find((m) => m.id === entry.meetingId);
    return Boolean(meeting && !["uploading", "transcribing", "analyzing"].includes(meeting.status));
  }
  const selectableUndated = undated.filter(canChange);
  function toggleSelected(entry: CalendarEntry) {
    const key = selectionKey(entry);
    setSelectedKeys((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }
  function requestDelete(entries: CalendarEntry[]) {
    if (!entries.length) return;
    setDeleteError("");
    setDeleteProgress(0);
    setDeletePending(entries);
  }
  async function deleteEvents() {
    if (!deletePending?.length) return;
    setDeleteBusy(true);
    setDeleteError("");
    const failures: CalendarEntry[] = [];
    let firstError = "";
    let succeeded = 0;
    for (const [index, entry] of deletePending.entries()) {
      try {
        const updated = await api<Meeting>(
          `/meetings/${entry.meetingId}/calendar/${entry.id}/hide`,
          { method: "POST" },
        );
        onChange(updated);
        setSelectedKeys((current) => {
          const next = new Set(current);
          next.delete(selectionKey(entry));
          return next;
        });
        succeeded++;
      } catch (error) {
        failures.push(entry);
        firstError ||= (error as Error).message;
      }
      setDeleteProgress(index + 1);
    }
    if (succeeded) notify(`${succeeded}件の予定をカレンダーから削除しました。`);
    if (failures.length) {
      setDeletePending(failures);
      setDeleteError(`${failures.length}件を削除できませんでした。${firstError}`);
      setDeleteProgress(0);
    } else {
      setDeletePending(null);
      setSelectedKeys(new Set());
    }
    setDeleteBusy(false);
  }
  async function restoreEvent(entry: HiddenEntry) {
    const key = `${entry.meetingId}:${entry.id}`;
    setRestoreBusy(key);
    try {
      const updated = await api<Meeting>(
        `/meetings/${entry.meetingId}/calendar/${entry.id}/restore`,
        { method: "POST" },
      );
      onChange(updated);
      notify("予定をカレンダーに戻しました。");
    } catch (error) {
      notify((error as Error).message);
    } finally {
      setRestoreBusy("");
    }
  }
  function shiftMonth(offset: number) {
    const date = new Date(month + "-01T12:00:00Z");
    date.setUTCMonth(date.getUTCMonth() + offset);
    const next = date.toISOString().slice(0, 10);
    if (validDate(next)) onSelectDate(next);
  }
  function editEvent(e: CalendarEntry) {
    const m = meetings.find((m) => m.id === e.meetingId);
    if (m && ["uploading", "transcribing", "analyzing"].includes(m.status)) {
      notify("解析が終わってから予定を編集してください。");
      return;
    }
    setEditing(e);
  }
  const entryCard = (e: CalendarEntry) => (
    <article className={`cal-entry ${e.status} ${selectedKeys.has(selectionKey(e)) ? "selected-for-delete" : ""}`} key={e.meetingId + e.id}>
      <div className="cal-entry-labels">
        {selectionMode && (
          <label className="cal-select-entry">
            <input
              type="checkbox"
              checked={selectedKeys.has(selectionKey(e))}
              disabled={!canChange(e)}
              onChange={() => toggleSelected(e)}
              aria-label={`${e.title}を一括削除の対象に選択`}
            />
            選択
          </label>
        )}
        <span className={`cal-status ${e.status}`}>{statusText[e.status]}</span>
        <span>{kindText[e.kind]}</span>
        {e.manual && (
          <span className="cal-manual">
            <Pencil size={11} />
            手動変更
          </span>
        )}
      </div>
      <h3>{e.title}</h3>
      <div className="cal-entry-meta">
        <span>
          <CalendarDays size={14} />
          {e.date
            ? `${shortDate(e.date)}${e.endDate && e.endDate !== e.date ? ` ～ ${shortDate(e.endDate)}` : ""}`
            : "日付要確認"}
        </span>
        <span>
          <Clock3 size={14} />
          {timeText(e)}
        </span>
      </div>
      <div className="cal-entry-meta">
        <span>
          <MapPin size={14} />
          {e.location || "場所未指定"}
        </span>
        <span>
          <Users size={14} />
          {e.owner || "担当未指定"}
        </span>
      </div>
      <p className="cal-origin-date">元の日付表現：{e.dateText || "未記載"}</p>
      <details className="cal-evidence">
        <summary>会議・資料の根拠を確認</summary>
        <p>{e.evidence || "根拠の記載なし"}</p>
        <small>
          {e.source === "document"
            ? `資料：${e.sourceName}`
            : `会議日：${e.meetingDate}`}
        </small>
      </details>
      {e.notes.map((note) => (
        <p className="cal-warning" key={note}>
          <AlertCircle size={13} />
          {note}
        </p>
      ))}
      <div className="cal-entry-actions">
        <button
          className="text-button purple"
          onClick={() => onOpenMeeting(e.meetingId)}
        >
          <FileText size={14} />
          <span>{e.meetingTitle}</span>
          <ArrowRight size={13} />
        </button>
        <div className="cal-entry-manage">
          <button className="button secondary small" onClick={() => editEvent(e)}>
            <Pencil size={13} />
            予定を編集
          </button>
          <button
            className="button danger small"
            disabled={!canChange(e)}
            onClick={() => requestDelete([e])}
            aria-label={`${e.title}を削除`}
          >
            <Trash2 size={13} /> 削除
          </button>
        </div>
      </div>
    </article>
  );
  return (
    <div className="calendar-page">
      <div className="page-heading">
        <div>
          <div className="eyebrow">MEETING CALENDAR</div>
          <h1>決まったことを、予定に。</h1>
          <p>会議で決まった日程と期限を、ひとつのカレンダーに。</p>
        </div>
        <button className="button secondary" onClick={onNew}>
          会議を取り込む
          <ArrowRight size={15} />
        </button>
      </div>
      <div className="cal-summary">
        <div>
          <span>この月の予定・期限</span>
          <strong>
            {all.filter((e) => overlapsMonth(e, month)).length}
            <small>件</small>
          </strong>
        </div>
        <div>
          <span>今日から7日間</span>
          <strong>
            {
              all.filter(
                (e) =>
                  e.date &&
                  e.date <= addDays(today, 6) &&
                  (e.endDate || e.date) >= today,
              ).length
            }
            <small>件</small>
          </strong>
        </div>
        <div className="cal-review-count">
          <span>日付・内容の確認が必要</span>
          <strong>
            {all.filter((e) => e.status === "needs_confirmation").length}
            <small>件</small>
          </strong>
        </div>
      </div>
      <div className="cal-controls">
        <div className="cal-month-nav">
          <button
            className="icon-button"
            aria-label="前の月"
            onClick={() => shiftMonth(-1)}
            disabled={month === "1900-01"}
          >
            <ArrowLeft size={18} />
          </button>
          <label className="cal-month-label">
            <span>
              {Number(month.slice(0, 4))}年 {Number(month.slice(5))}月
            </span>
            <input
              type="month"
              aria-label="表示する年月"
              min="1900-01"
              max="2199-12"
              value={month}
              onInput={(e) => {
                if (validDate(e.currentTarget.value + "-01"))
                  onSelectDate(e.currentTarget.value + "-01");
              }}
            />
          </label>
          <button
            className="icon-button"
            aria-label="次の月"
            onClick={() => shiftMonth(1)}
            disabled={month === "2199-12"}
          >
            <ArrowRight size={18} />
          </button>
          <button
            className="button secondary small"
            onClick={() => onSelectDate(today)}
          >
            今日
          </button>
        </div>
        <div
          className="cal-view-toggle"
          role="group"
          aria-label="カレンダー表示"
        >
          <button
            className={view === "month" ? "active" : ""}
            aria-pressed={view === "month"}
            onClick={() => setView("month")}
          >
            <Grid2X2 size={15} />
            月間
          </button>
          <button
            className={view === "list" ? "active" : ""}
            aria-pressed={view === "list"}
            onClick={() => setView("list")}
          >
            <List size={16} />
            予定一覧
          </button>
        </div>
      </div>
      <div className="cal-filters">
        <label className="search-box">
          <Search size={16} />
          <input
            aria-label="予定を検索"
            placeholder="予定・会議・場所・担当で検索"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <select
          aria-label="予定の種類"
          value={kind}
          onChange={(e) => setKind(e.target.value)}
        >
          <option value="all">すべての種類</option>
          <option value="event">予定</option>
          <option value="deadline">期限</option>
        </select>
        <select
          aria-label="予定の状態"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="all">すべての状態</option>
          <option value="confirmed">確定</option>
          <option value="tentative">予定案</option>
          <option value="needs_confirmation">要確認</option>
        </select>
      </div>
      <div className="cal-delete-toolbar">
        <button
          className="button secondary small"
          aria-pressed={selectionMode}
          onClick={() => {
            setSelectionMode((current) => !current);
            setSelectedKeys(new Set());
          }}
        >
          {selectionMode ? "選択を終了" : "選択して一括削除"}
        </button>
        {selectionMode && (
          <>
            <span>{selectedEntries.length}件を選択中</span>
            <button
              className="text-button"
              disabled={!visibleEvents.length}
              onClick={() => setSelectedKeys((current) => {
                const next = new Set(current);
                for (const entry of visibleEvents) {
                  if (allVisibleSelected) next.delete(selectionKey(entry));
                  else next.add(selectionKey(entry));
                }
                return next;
              })}
            >
              {allVisibleSelected ? "表示中の選択を解除" : "表示中を全選択"}
            </button>
            <button
              className="button danger small"
              disabled={!selectedEntries.length}
              onClick={() => requestDelete(selectedEntries)}
            >
              <Trash2 size={14} /> 選択した{selectedEntries.length}件を削除
            </button>
          </>
        )}
      </div>
      <div className="cal-legend">
        <span>
          <i className="confirmed" />
          確定
        </span>
        <span>
          <i className="tentative" />
          予定案・資料のみ
        </span>
        <span>
          <i className="needs_confirmation" />
          要確認
        </span>
        <span className="cal-timezone">
          日本時間（JST）・日付範囲は終了日を含む
        </span>
      </div>
      {view === "month" ? (
        <div className="cal-layout">
          <div className="cal-board-scroll">
            <div
              className="cal-board"
              role="grid"
              aria-label={`${month}の予定`}
            >
              <div className="cal-weekdays" role="row">
                {["月", "火", "水", "木", "金", "土", "日"].map((d) => (
                  <div role="columnheader" key={d}>
                    {d}
                  </div>
                ))}
              </div>
              {Array.from({ length: 6 }, (_, week) => (
                <div role="row" className="cal-week" key={week}>
                  {cells.slice(week * 7, week * 7 + 7).map((date) => {
                    const items = events.filter((e) => occursOn(e, date));
                    return (
                      <div
                        role="gridcell"
                        aria-selected={date === selectedDate}
                        className={`cal-day ${date.slice(0, 7) !== month ? "outside" : ""} ${date === selectedDate ? "selected" : ""} ${date === today ? "today" : ""}`}
                        key={date}
                      >
                        <button
                          id={`cal-${date}`}
                          className="cal-day-button"
                          aria-label={`${date} ${items.length}件の予定`}
                          aria-current={date === today ? "date" : undefined}
                          onClick={() => onSelectDate(date)}
                          onKeyDown={(e) => {
                            const delta: { [key: string]: number } = {
                              ArrowLeft: -1,
                              ArrowRight: 1,
                              ArrowUp: -7,
                              ArrowDown: 7,
                            };
                            if (e.key in delta) {
                              e.preventDefault();
                              const target = addDays(date, delta[e.key]);
                              if (validDate(target)) {
                                onSelectDate(target);
                                requestAnimationFrame(() =>
                                  document
                                    .getElementById(`cal-${target}`)
                                    ?.focus(),
                                );
                              }
                            }
                          }}
                        >
                          <span>{Number(date.slice(-2))}</span>
                          {items.length > 0 && <small>{items.length}</small>}
                        </button>
                        <div className="cal-day-items">
                          {items.slice(0, 3).map((item) => (
                            <button
                              key={item.meetingId + item.id}
                              className={`cal-chip ${item.status}`}
                              title={`${item.title} · ${timeText(item)} · ${statusText[item.status]}`}
                              onClick={() => onSelectDate(date)}
                            >
                              <span>
                                {item.startTime ||
                                  (item.kind === "deadline" ? "期限" : "予定")}
                              </span>
                              {item.title}
                            </button>
                          ))}
                          {items.length > 3 && (
                            <button
                              className="cal-more"
                              onClick={() => onSelectDate(date)}
                            >
                              ほか{items.length - 3}件
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
          <aside className="cal-day-panel">
            <div className="cal-panel-heading">
              <span>SELECTED DAY</span>
              <h2>
                {shortDate(selectedDate)}
                <small>{dayEvents.length}件</small>
              </h2>
            </div>
            {dayEvents.length ? (
              dayEvents.map(entryCard)
            ) : (
              <div className="cal-empty">
                <CalendarDays size={28} />
                <h3>この日の予定はありません</h3>
                <p>日付を選ぶと予定・場所・担当と元の会議を確認できます。</p>
              </div>
            )}
          </aside>
        </div>
      ) : (
        <div className="cal-agenda" aria-label="この月の予定一覧">
          {inMonth.length ? (
            inMonth.map(entryCard)
          ) : (
            <div className="cal-empty">
              <CalendarDays size={28} />
              <h3>この月に該当する予定はありません</h3>
              <p>
                年月や絞り込みを変更してください。日付未定の予定は下に表示します。
              </p>
            </div>
          )}
        </div>
      )}
      {!!undated.length && (
        <section className="cal-undated">
          <div className="section-heading">
            <h2>
              <AlertCircle size={19} />
              日付を確認する予定<span>{undated.length}</span>
            </h2>
            {selectionMode && (
              <button
                className="button secondary small"
                disabled={!selectableUndated.length}
                onClick={() => setSelectedKeys((current) => {
                  const next = new Set(current);
                  const allSelected = selectableUndated.every((entry) => next.has(selectionKey(entry)));
                  for (const entry of selectableUndated) {
                    if (allSelected) next.delete(selectionKey(entry));
                    else next.add(selectionKey(entry));
                  }
                  return next;
                })}
              >
                {selectableUndated.every((entry) => selectedKeys.has(selectionKey(entry)))
                  ? "日付未定の選択を解除"
                  : `この${selectableUndated.length}件を選択`}
              </button>
            )}
          </div>
          <p>
            「来週まで」など、特定の日を決められない予定です。「予定を編集」から日付を設定できます。
          </p>
          <div className="cal-undated-grid">{undated.map(entryCard)}</div>
        </section>
      )}
      {!!hidden.length && (
        <section className="cal-hidden">
          <button
            className="text-button"
            aria-expanded={showHidden}
            onClick={() => setShowHidden((current) => !current)}
          >
            <RotateCcw size={15} /> 削除済みの予定 {hidden.length}件
          </button>
          {showHidden && (
            <ul>
              {hidden.map((entry) => (
                <li key={`${entry.meetingId}:${entry.id}`}>
                  <span><strong>{entry.title}</strong><small>{entry.meetingTitle}</small></span>
                  <button
                    className="button secondary small"
                    disabled={Boolean(restoreBusy)}
                    onClick={() => void restoreEvent(entry)}
                  >
                    {restoreBusy === `${entry.meetingId}:${entry.id}`
                      ? <LoaderCircle size={14} className="spin" />
                      : <RotateCcw size={14} />}
                    元に戻す
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
      {!all.length && (
        <div className="notice">
          予定はまだありません。日程や期限を話した会議を取り込むと、ここに表示されます。サンプル会議は共有カレンダーに含めません。
        </div>
      )}
      <p className="cal-footnote">
        確定・予定案の判定もAIによるものです。元の発言と照合してください。以前の議事録から拾った日付は要確認として表示します。予定の編集・削除は全員に共有され、元の会議録は変更しません。削除した予定は「削除済みの予定」から戻せます。同じ予定の非表示は再生成後も保持しますが、AIが別の内容として抽出した予定は新しい候補として現れる場合があります。
      </p>
      {deletePending && (
        <Modal
          title={deletePending.length === 1 ? "この予定を削除しますか？" : `${deletePending.length}件の予定を削除しますか？`}
          onClose={() => setDeletePending(null)}
          locked={deleteBusy}
        >
          <p className="confirm-copy">
            選んだ予定をカレンダーから除外します。元の会議録・文字起こし・資料は残り、後から「削除済みの予定」で戻せます。AIの再解析は行いません。
          </p>
          <ul className="cal-delete-preview">
            {deletePending.slice(0, 5).map((entry) => (
              <li key={selectionKey(entry)}>{entry.title}</li>
            ))}
            {deletePending.length > 5 && <li>ほか{deletePending.length - 5}件</li>}
          </ul>
          {deleteError && <p className="error-message" role="alert">{deleteError}</p>}
          {deleteBusy && <p role="status">処理中… {deleteProgress}/{deletePending.length}件</p>}
          <div className="modal-footer">
            <button className="button secondary" disabled={deleteBusy} onClick={() => setDeletePending(null)}>キャンセル</button>
            <button className="button danger" disabled={deleteBusy} onClick={() => void deleteEvents()}>
              {deleteBusy && <LoaderCircle size={15} className="spin" />}
              {deletePending.length === 1 ? "この予定を削除" : `${deletePending.length}件を削除`}
            </button>
          </div>
        </Modal>
      )}
      {editing && (
        <CalendarEditor
          entry={editing}
          onClose={() => setEditing(null)}
          onSaved={(m) => {
            onChange(m);
            setEditing(null);
          }}
          onEditingChange={onEditingChange}
          notify={notify}
        />
      )}
    </div>
  );
}

function CalendarEditor({
  entry,
  onClose,
  onSaved,
  onEditingChange,
  notify,
}: {
  entry: CalendarEntry;
  onClose: () => void;
  onSaved: (m: Meeting) => void;
  onEditingChange: (v: boolean) => void;
  notify: (s: string) => void;
}) {
  const initial: CalendarEdit = {
    title: entry.title,
    kind: entry.kind,
    date: entry.date,
    endDate: entry.endDate,
    startTime: entry.startTime,
    endTime: entry.endTime,
    status: entry.status,
    location: entry.location,
    owner: entry.owner,
  };
  const [value, setValue] = useState(initial),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [resetConfirm, setResetConfirm] = useState(false);
  const dirty = JSON.stringify(value) !== JSON.stringify(initial);
  useEffect(() => {
    onEditingChange(true);
    return () => onEditingChange(false);
  }, [onEditingChange]);
  useEffect(() => {
    if (!dirty && !busy) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, busy]);
  function close() {
    if (!dirty || window.confirm("保存していない予定の変更を破棄しますか？"))
      onClose();
  }
  async function save(reset = false) {
    setError("");
    try {
      if (!reset) CalendarEditSchema.parse(value);
      setBusy(true);
      const m = await api<Meeting>(
        `/meetings/${entry.meetingId}/calendar/${entry.id}`,
        {
          method: reset ? "DELETE" : "PATCH",
          ...(reset ? {} : { body: JSON.stringify(value) }),
        },
      );
      onSaved(m);
      notify(
        reset
          ? "手動変更を解除しました。"
          : "予定を保存しました。全員のカレンダーに反映されます。",
      );
    } catch (e) {
      setError(
        (e as { issues?: { message: string }[] }).issues?.[0]?.message ||
          (e as Error).message,
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title="予定を編集"
      subtitle="日付・時間・場所・担当を変更できます。変更は全員に共有されます。"
      onClose={close}
      locked={busy}
    >
      <form
        className="cal-editor"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <fieldset disabled={busy}>
          <label className="field">
            予定名
            <input
              required
              maxLength={300}
              value={value.title}
              onChange={(e) => setValue({ ...value, title: e.target.value })}
            />
          </label>
          <div className="form-grid">
            <label className="field">
              種類
              <select
                value={value.kind}
                onChange={(e) =>
                  setValue({
                    ...value,
                    kind: e.target.value as CalendarEdit["kind"],
                  })
                }
              >
                <option value="event">予定</option>
                <option value="deadline">期限</option>
              </select>
            </label>
            <label className="field">
              状態
              <select
                value={value.status}
                onChange={(e) =>
                  setValue({
                    ...value,
                    status: e.target.value as CalendarEdit["status"],
                  })
                }
              >
                <option value="confirmed">確定</option>
                <option value="tentative">予定案</option>
                <option value="needs_confirmation">要確認</option>
              </select>
            </label>
            <label className="field">
              開始日
              <input
                type="date"
                min="1900-01-01"
                max="2199-12-31"
                value={value.date || ""}
                onInput={(e) => {
                  const date = e.currentTarget.value || null;
                  setValue((previous) => ({
                    ...previous,
                    date,
                    ...(!date
                      ? {
                          status: "needs_confirmation",
                          endDate: null,
                          startTime: null,
                          endTime: null,
                        }
                      : {}),
                  }));
                }}
              />
            </label>
            <label className="field">
              終了日（単日は空欄）
              <input
                type="date"
                min={value.date || "1900-01-01"}
                max="2199-12-31"
                value={value.endDate || ""}
                onInput={(e) => {
                  const endDate = e.currentTarget.value || null;
                  setValue((previous) => ({ ...previous, endDate }));
                }}
              />
            </label>
            <label className="field">
              開始時刻（任意）
              <input
                type="time"
                value={value.startTime || ""}
                onInput={(e) => {
                  const startTime = e.currentTarget.value || null;
                  setValue((previous) => ({ ...previous, startTime }));
                }}
              />
            </label>
            <label className="field">
              終了時刻（任意）
              <input
                type="time"
                value={value.endTime || ""}
                onInput={(e) => {
                  const endTime = e.currentTarget.value || null;
                  setValue((previous) => ({ ...previous, endTime }));
                }}
              />
            </label>
            <label className="field">
              場所
              <input
                maxLength={300}
                placeholder="例：本社会議室・オンライン"
                value={value.location}
                onChange={(e) =>
                  setValue({ ...value, location: e.target.value })
                }
              />
            </label>
            <label className="field">
              担当者
              <input
                maxLength={200}
                placeholder="例：佐藤"
                value={value.owner}
                onChange={(e) => setValue({ ...value, owner: e.target.value })}
              />
            </label>
          </div>
        </fieldset>
        <div className="cal-editor-source">
          <strong>元の記録</strong>
          <p>
            {entry.original.dateText || "日付の記載なし"} ／ {entry.evidence}
          </p>
          <small>
            本文は書き換えません。再解析しても手動変更は保持します。同じ予定を同時に編集した場合は最後の保存が優先されます。
          </small>
        </div>
        {error && (
          <p className="error-message" role="alert">
            {error}
          </p>
        )}
        {entry.manual &&
          (resetConfirm ? (
            <div className="notice">
              この予定の手動変更を取り消します。元の抽出結果がなくなっている場合は、この手動予定がカレンダーから消えます。
              <button
                type="button"
                className="text-button"
                disabled={busy}
                onClick={() => setResetConfirm(false)}
              >
                やめる
              </button>
              <button
                type="button"
                className="text-button"
                disabled={busy}
                onClick={() => void save(true)}
              >
                手動変更を取り消す
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="text-button"
              disabled={busy}
              onClick={() => setResetConfirm(true)}
            >
              元の抽出結果に戻す
            </button>
          ))}
        <div className="modal-actions">
          <button
            type="button"
            className="button secondary"
            disabled={busy}
            onClick={close}
          >
            キャンセル
          </button>
          <button className="button primary" disabled={busy}>
            {busy ? (
              <LoaderCircle size={16} className="spin" />
            ) : (
              <Save size={16} />
            )}
            予定を保存
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function MeetingSchedule({
  meeting,
  onOpen,
  disabled = false,
}: {
  meeting: Meeting;
  onOpen: (date?: string) => void;
  disabled?: boolean;
}) {
  const events = meetingEvents(meeting) as CalendarEntry[];
  return (
    <section className="meeting-schedule">
      <div>
        <CalendarDays size={20} />
        <div>
          <h3>
            この会議の予定・期限 <span>{events.length}件</span>
          </h3>
          <p>
            {events.length
              ? "日付・時間・場所をカレンダーで確認・変更できます。"
              : "日程や期限が抽出されると、カレンダーに表示されます。"}
          </p>
        </div>
      </div>
      <button
        className="button secondary small"
        disabled={disabled}
        onClick={() => onOpen(events.find((e) => e.date)?.date || undefined)}
      >
        カレンダーで確認
        <ArrowRight size={14} />
      </button>
    </section>
  );
}
