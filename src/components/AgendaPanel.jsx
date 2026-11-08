import { useState } from "react";
import { ChevronLeft, ChevronRight, CalendarDays, Check, Plus, X, Copy, FileText } from "lucide-react";
import { WEEKDAYS_SHORT, DEFAULT_COLORS } from "../constants.js";
import { pad, minToTime, toISO, addDays, formatDateLabel } from "../utils.js";

/* ------------------------------------------------------------------ */
/*  Agenda - список дел одного дня, а не сетка "весь день с 6 утра".   */
/*  events уже посчитаны в Planner.jsx (buildAgendaEvents) - здесь     */
/*  только отрисовка + переключение дня. Отдельно - события "весь     */
/*  день"/"несколько дней" (allDayEvents), которые вообще не привязаны */
/*  к клеткам сетки.                                                   */
/* ------------------------------------------------------------------ */

export function AgendaPanel({
  date, events, allDayEvents, categories,
  onPrevDay, onNextDay, onToday, onPickDate, onToggleDone, onJump,
  onCreateAllDay, onDeleteAllDay,
}) {
  const dayIdx = (date.getDay() + 6) % 7;
  const isToday = toISO(date) === toISO(new Date());
  const dateLabel = formatDateLabel(date, WEEKDAYS_SHORT[dayIdx]);

  const [formOpen, setFormOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [title, setTitle] = useState("");
  const [catId, setCatId] = useState("");
  const [color, setColor] = useState(DEFAULT_COLORS[0]);
  const [startIso, setStartIso] = useState(() => toISO(date));
  const [endIso, setEndIso] = useState(() => toISO(date));

  function openForm() {
    setStartIso(toISO(date));
    setEndIso(toISO(date));
    setTitle("");
    setCatId("");
    setFormOpen(true);
  }
  function submitAllDay() {
    if (!title.trim()) return;
    onCreateAllDay({ text: title.trim(), catId: catId || null, color, startIso, endIso });
    setFormOpen(false);
  }

  function catOf(ev) {
    if (!ev.catId) return null;
    return categories.find((c) => c.id === ev.catId) || null;
  }
  function subOf(ev, cat) {
    if (!cat || !ev.subId) return null;
    return cat.subs.find((s) => s.id === ev.subId) || null;
  }
  function descFor(ev) {
    const cat = catOf(ev);
    const sub = subOf(ev, cat);
    return (sub && sub.description) || "";
  }
  const [expandedDesc, setExpandedDesc] = useState(() => new Set());
  function toggleDesc(key) {
    setExpandedDesc((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }
  function labelFor(ev) {
    if (ev.text) return ev.text;
    const cat = catOf(ev);
    const sub = subOf(ev, cat);
    if (cat && sub) return `${cat.name} - ${sub.name}`;
    if (cat) return cat.name;
    return "Без названия";
  }

  async function copyAgenda() {
    const header = dateLabel.charAt(0).toUpperCase() + dateLabel.slice(1);
    const lines = events.map((ev, i) => {
      const time = `${minToTime(ev.start)}-${minToTime(ev.end)}`;
      const task = ev.task ? ` (${ev.task})` : "";
      return `${i + 1}. ${time} ${labelFor(ev)}${task}`;
    });
    const text = [header, ...(lines.length ? lines : ["(ничего не запланировано)"])].join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* буфер обмена недоступен - редкий случай, тихо пропускаем */ }
  }

  return (
    <div className="agenda-panel">
      <div className="dock-panel-title-row"><span>Агенда дня</span></div>

      <div className="agenda-nav">
        <button onClick={onPrevDay} className="icon-btn subtle tiny-wrap" title="Предыдущий день"><ChevronLeft size={15} /></button>
        <div className="agenda-nav-mid">
          <span className={`agenda-date-label ${isToday ? "agenda-date-today" : ""}`}>{dateLabel}</span>
          {!isToday && <button onClick={onToday} className="btn btn-ghost btn-sm agenda-today-btn">Сегодня</button>}
        </div>
        <button onClick={onNextDay} className="icon-btn subtle tiny-wrap" title="Следующий день"><ChevronRight size={15} /></button>
      </div>

      <label className="agenda-date-pick">
        <CalendarDays size={13} className="search-icon" />
        <input
          type="date"
          value={toISO(date)}
          onChange={(e) => e.target.value && onPickDate(new Date(e.target.value + "T00:00:00"))}
          className="time-input"
        />
      </label>

      <div className="agenda-allday-block">
        <div className="agenda-allday-head">
          <span className="hint-text">Весь день / несколько дней</span>
          {!formOpen && (
            <button onClick={openForm} className="icon-btn subtle tiny-wrap" title="Добавить событие на весь день или несколько дней"><Plus size={13} /></button>
          )}
        </div>

        {allDayEvents.length > 0 && (
          <div className="agenda-allday-list">
            {allDayEvents.map((ev) => {
              const cat = ev.catId ? categories.find((c) => c.id === ev.catId) : null;
              const color2 = ev.color || (cat ? cat.color : "#8A8272");
              const multi = ev.startIso !== ev.endIso;
              return (
                <div key={ev.id} className="agenda-allday-row">
                  <span className="agenda-item-dot" style={{ background: color2 }} />
                  <span className="agenda-allday-text">
                    <span data-no-translate>{ev.text}</span>
                    {multi && <span className="hint-text"> ({ev.startIso.slice(8)}.{ev.startIso.slice(5, 7)} - {ev.endIso.slice(8)}.{ev.endIso.slice(5, 7)})</span>}
                  </span>
                  <button className="icon-btn subtle icon-action-button" onClick={() => onDeleteAllDay(ev.id)} title="Удалить событие" aria-label="Удалить событие"><X size={16} /></button>
                </div>
              );
            })}
          </div>
        )}

        {formOpen && (
          <div className="agenda-allday-form">
            <input className="input-pill" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="например, отпуск / дедлайн" autoFocus />
            <div className="recurring-form-row">
              <select className="time-input" value={catId} onChange={(e) => setCatId(e.target.value)}>
                <option value="">без категории (свой цвет)</option>
                {categories.map((c) => <option key={c.id} value={c.id} data-no-translate>{c.name}</option>)}
              </select>
              {!catId && <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="color-dot" />}
            </div>
            <div className="recurring-form-row">
              <input type="date" className="time-input" value={startIso} onChange={(e) => setStartIso(e.target.value)} />
              <span className="hint-text">-</span>
              <input type="date" className="time-input" value={endIso} onChange={(e) => setEndIso(e.target.value)} />
            </div>
            <div className="recurring-form-actions">
              <button onClick={() => setFormOpen(false)} className="btn btn-ghost btn-sm">Отмена</button>
              <button onClick={submitAllDay} disabled={!title.trim()} className="btn btn-primary btn-sm">Добавить</button>
            </div>
          </div>
        )}

        {!formOpen && allDayEvents.length === 0 && (
          <div className="hint-text">Ничего нет.</div>
        )}
      </div>

      <div className="agenda-copy-row">
        <span className="hint-text">По времени</span>
        <button onClick={copyAgenda} className="btn btn-ghost btn-sm" title="Скопировать список дел этого дня (нумерованный, со временем)">
          {copied ? <Check size={13} /> : <Copy size={13} />} {copied ? "Скопировано" : "Копировать"}
        </button>
      </div>

      {events.length === 0 && (
        <div className="hint-text pad-sm">На это время ничего не запланировано.</div>
      )}

      {events.length > 0 && (
        <div className="agenda-list">
          {events.map((ev, i) => {
            const desc = descFor(ev);
            const descOpen = expandedDesc.has(i);
            return (
              <div key={i} className="agenda-item-wrap">
                <div className="agenda-item">
                  <div className="agenda-item-time">
                    <span>{minToTime(ev.start)}</span>
                    <span className="agenda-item-time-sep">-</span>
                    <span>{minToTime(ev.end)}</span>
                  </div>
                  <button
                    type="button"
                    className={`agenda-done-check ${ev.done ? "done" : ""} ${!ev.catId ? "agenda-done-check-hidden" : ""}`}
                    onClick={() => ev.catId && onToggleDone(ev)}
                    title={ev.catId ? (ev.done ? "Отмечено как выполнено" : "Отметить как выполнено") : ""}
                  >
                    {ev.done ? <Check size={11} /> : null}
                  </button>
                  <button className="agenda-item-body" onClick={() => onJump(ev)} title="Показать в сетке недели">
                    <span className="agenda-item-dot" style={{ background: ev.color || "var(--border)" }} />
                    <span className="agenda-item-text">
                      <span className="agenda-item-label" data-no-translate>{labelFor(ev)}</span>
                      {ev.task && <span className="agenda-item-task" data-no-translate>{ev.task}</span>}
                    </span>
                  </button>
                  {desc && (
                    <button onClick={() => toggleDesc(i)} className={`icon-btn subtle tiny-wrap ${descOpen ? "sub-desc-has" : ""}`} title="Описание программы">
                      <FileText size={12} />
                    </button>
                  )}
                </div>
                {desc && descOpen && <div className="agenda-item-desc" data-no-translate>{desc}</div>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
