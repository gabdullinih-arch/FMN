import { useState, useMemo } from "react";
import { Plus, X, RefreshCw } from "lucide-react";
import { WEEKDAYS_SHORT, DEFAULT_COLORS } from "../constants.js";
import { toISO, getMonday, minToTime, weekNumberFrom, recurringWeekNumbers } from "../utils.js";
import { t } from "../i18n.js";

const PATTERNS = [
  { id: "all", label: "Каждую неделю" },
  { id: "even", label: "Через неделю (чётные от начальной)" },
  { id: "odd", label: "Через неделю (нечётные от начальной)" },
  { id: "custom", label: "Свои недели (например 2-17,20)" },
];
const CONFLICT_MODES = [
  { id: "keepExisting", label: "Оставлять занятое без изменений" },
  { id: "templateWins", label: "Заменять только время события" },
  { id: "interactivePerCell", label: "Спрашивать для каждого конфликта" },
];

function patternSummary(rule) {
  const p = PATTERNS.find((x) => x.id === rule.patternType);
  if (rule.patternType === "custom") return t(`недели: ${rule.customRanges || "-"}`);
  return p ? t(p.label.toLowerCase()) : rule.patternType;
}

export function RecurringPanel({ categories, rules, busy, onCreate, onDelete, onReapply }) {
  const [open, setOpen] = useState(rules.length === 0);
  const [name, setName] = useState("");
  const [dayIdx, setDayIdx] = useState(0);
  const [startTime, setStartTime] = useState("08:30");
  const [duration, setDuration] = useState(90);
  const [catId, setCatId] = useState("");
  const [subId, setSubId] = useState("");
  const [color, setColor] = useState(DEFAULT_COLORS[0]);
  const [task, setTask] = useState("");
  const [patternType, setPatternType] = useState("all");
  const [conflictMode, setConflictMode] = useState("keepExisting");
  const [customRanges, setCustomRanges] = useState("");
  const [anchorDate, setAnchorDate] = useState(() => toISO(getMonday(new Date())));
  const [weeksCount, setWeeksCount] = useState(17);
  const [endMode, setEndMode] = useState("count");
  const [endDate, setEndDate] = useState(() => toISO(getMonday(new Date())));

  const selectedCat = useMemo(() => categories.find((c) => c.id === catId) || null, [categories, catId]);
  const parseIsoDate = (value) => {
    const date = new Date(`${value}T00:00:00`);
    return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(date.getTime()) && toISO(date) === value
      ? date
      : null;
  };
  const anchor = parseIsoDate(anchorDate);
  const rangeEnd = endMode === "date" ? parseIsoDate(endDate) : null;
  const effectiveWeeksCount = !anchor || (endMode === "date" && !rangeEnd)
    ? NaN
    : endMode === "date"
      ? weekNumberFrom(getMonday(anchor), getMonday(rangeEnd))
      : Number(weeksCount);
  const validWeeksCount = Number.isInteger(effectiveWeeksCount) && effectiveWeeksCount >= 1 && effectiveWeeksCount <= 520;
  let scheduledWeeks = [];
  let patternError = "";
  if (validWeeksCount) {
    try {
      scheduledWeeks = recurringWeekNumbers(patternType, customRanges, effectiveWeeksCount);
    } catch (error) {
      patternError = error instanceof Error ? error.message : String(error);
    }
  }
  const startMin = /^\d{2}:\d{2}$/.test(startTime)
    ? Number(startTime.slice(0, 2)) * 60 + Number(startTime.slice(3, 5))
    : NaN;
  const startHour = Number(startTime.slice(0, 2));
  const startMinute = Number(startTime.slice(3, 5));
  const durationMin = Number(duration);
  const validEventTime = Number.isInteger(startMin) && startHour >= 0 && startHour <= 23
    && startMinute >= 0 && startMinute <= 59 && startMin < 1440 && startMin % 5 === 0
    && Number.isInteger(durationMin) && durationMin >= 5 && durationMin % 5 === 0 && startMin + durationMin <= 1440;
  const canSubmit = !!name.trim() && validWeeksCount && !patternError && scheduledWeeks.length > 0 && validEventTime && !busy;

  function resetForm() {
    setName(""); setTask(""); setCustomRanges("");
  }

  async function submit() {
    if (!canSubmit) return;
    const anchorMonday = getMonday(anchor);
    const firstOccurrence = toISO(new Date(anchorMonday.getFullYear(), anchorMonday.getMonth(), anchorMonday.getDate() + (scheduledWeeks[0] - 1) * 7 + dayIdx));
    const lastOccurrence = toISO(new Date(anchorMonday.getFullYear(), anchorMonday.getMonth(), anchorMonday.getDate() + (scheduledWeeks[scheduledWeeks.length - 1] - 1) * 7 + dayIdx));
    const summary = `Повторов: ${scheduledWeeks.length}. Первый: ${firstOccurrence}; последний: ${lastOccurrence}.`;
    if (!window.confirm(t(`Создать правило «${name.trim()}»? Будет размечено ${summary} Конфликты: ${CONFLICT_MODES.find((mode) => mode.id === conflictMode)?.label || CONFLICT_MODES[0].label}.`))) return;
    const rule = {
      id: Math.random().toString(36).slice(2, 10),
      name: name.trim(),
      dayIdx,
      startMin,
      durationMin,
      catId: catId || null,
      subId: catId && subId ? subId : null,
      color: selectedCat ? selectedCat.color : color,
      task: task.trim(),
      patternType,
      conflictMode,
      customRanges: patternType === "custom" ? customRanges.trim() : "",
      anchorIso: toISO(anchorMonday),
      weeksCount: effectiveWeeksCount,
      createdAt: Date.now(),
    };
    if (await onCreate(rule)) resetForm();
  }

  return (
    <div className="recurring-panel" aria-busy={busy}>
      <div className="dock-panel-title-row"><span>Повторяющиеся события</span></div>
      <div className="hint-text pad-sm">
        Заводит регулярное дело (пары, тренировки, созвоны) сразу на несколько недель вперёд, по шаблону недель.
        Первая клетка блока — заголовок, остальное просто закрашено, как при заливке.
      </div>

      {rules.length > 0 && (
        <div className="recurring-list">
          {rules.map((r) => (
            <div key={r.id} className="recurring-row">
              <span className="recurring-dot" style={{ background: r.color }} />
              <div className="recurring-row-main">
                <span className="recurring-row-name">{r.name}</span>
                <span className="hint-text">
                  {WEEKDAYS_SHORT[r.dayIdx]}, {minToTime(r.startMin)}-{minToTime(r.startMin + r.durationMin)} · {patternSummary(r)} · {CONFLICT_MODES.find((mode) => mode.id === r.conflictMode)?.label || CONFLICT_MODES[0].label}
                </span>
              </div>
              <button type="button" onClick={() => onReapply(r)} disabled={busy} className="icon-btn subtle tiny-wrap" title="Разметить недели заново (например, после смены цвета категории)" aria-label="Разметить ещё раз">
                <RefreshCw size={13} />
              </button>
              <button type="button" onClick={() => onDelete(r.id)} disabled={busy} className="icon-btn subtle icon-action-button" title="Удалить это правило (уже закрашенные клетки останутся - их можно стереть вручную)" aria-label="Удалить правило повтора">
                <X size={16} />
              </button>
            </div>
          ))}
        </div>
      )}

      {!open && (
        <button type="button" onClick={() => setOpen(true)} className="btn btn-primary btn-sm template-create-btn"><Plus size={13} /> Новое повторяющееся событие</button>
      )}

      {open && (
        <div className="recurring-form">
          <div className="field-label">Название</div>
          <input className="input-pill" value={name} onChange={(e) => setName(e.target.value)} placeholder="например, Тренировка" aria-label="Название события" />

          <div className="field-label">День и время</div>
          <div className="recurring-form-row">
            <select className="time-input" value={dayIdx} onChange={(e) => setDayIdx(Number(e.target.value))} aria-label="День недели">
              {WEEKDAYS_SHORT.map((wd, i) => <option key={i} value={i}>{wd}</option>)}
            </select>
            <input type="time" step={300} className="time-input" value={startTime} onChange={(e) => setStartTime(e.target.value)} aria-label="Время начала" />
            <input type="number" min={5} max={Number.isFinite(startMin) ? 1440 - startMin : 1440} step={5} className="time-input recurring-duration" value={duration} onChange={(e) => setDuration(e.target.value)} title="Длительность, мин" />
            <span className="hint-text">мин</span>
          </div>

          <div className="field-label">Категория (необязательно)</div>
          <div className="recurring-form-row">
            <select className="time-input" value={catId} onChange={(e) => { setCatId(e.target.value); setSubId(""); }} aria-label="Категория события">
              <option value="">без категории (свой цвет)</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            {selectedCat && selectedCat.subs.length > 0 && (
              <select className="time-input" value={subId} onChange={(e) => setSubId(e.target.value)} aria-label="Подкатегория события">
                <option value="">без подкатегории</option>
                {selectedCat.subs.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            )}
            {!selectedCat && (
              <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="color-dot" title="Цвет заливки" aria-label="Цвет заливки" />
            )}
          </div>

          <div className="field-label">Комментарий (необязательно)</div>
          <input className="input-pill" value={task} onChange={(e) => setTask(e.target.value)} placeholder="например, аудитория / адрес" aria-label="Комментарий к событию" />

          <div className="field-label">Повтор</div>
          <select className="time-input" style={{ width: "100%" }} value={patternType} onChange={(e) => setPatternType(e.target.value)} aria-label="Периодичность повтора">
            {PATTERNS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
          {patternType === "custom" && (
            <input className="input-pill" value={customRanges} onChange={(e) => setCustomRanges(e.target.value)} placeholder="2-17,20" aria-label="Номера недель повтора" />
          )}

          <div className="field-label">Конфликты с существующими событиями</div>
          <select className="time-input" style={{ width: "100%" }} value={conflictMode} onChange={(e) => setConflictMode(e.target.value)} aria-label="Обработка конфликтов">
            {CONFLICT_MODES.map((mode) => <option key={mode.id} value={mode.id}>{mode.label}</option>)}
          </select>

          <div className="field-label">С какой недели считать первой</div>
          <div className="recurring-form-row">
            <input type="date" className="time-input" value={anchorDate} onChange={(e) => setAnchorDate(e.target.value)} aria-label="Дата первой недели" />
          </div>
          <div className="segmented">
            <button type="button" onClick={() => setEndMode("count")} className={`segmented-option ${endMode === "count" ? "active" : ""}`}>Количество недель</button>
            <button type="button" onClick={() => setEndMode("date")} className={`segmented-option ${endMode === "date" ? "active" : ""}`}>До даты</button>
          </div>
          {endMode === "count" ? (
            <div className="recurring-form-row">
              <input type="number" min={1} max={520} className="time-input recurring-duration" value={weeksCount} onChange={(e) => setWeeksCount(e.target.value)} title="Сколько недель вперёд" />
              <span className="hint-text">недель (максимум 520)</span>
            </div>
          ) : (
            <div className="recurring-form-row">
              <input type="date" className="time-input" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
          )}
          {!validWeeksCount && <div className="hint-text" role="alert">Диапазон должен содержать от 1 до 520 недель.</div>}
          {patternError && <div className="hint-text" role="alert">{patternError}</div>}
          {validWeeksCount && !patternError && scheduledWeeks.length === 0 && <div className="hint-text" role="alert">В выбранном диапазоне нет недель, подходящих под повтор.</div>}
          {!validEventTime && <div className="hint-text" role="alert">Проверьте время начала и длительность: шаг должен быть 5 минут, событие должно закончиться до полуночи.</div>}
          {validWeeksCount && !patternError && scheduledWeeks.length > 0 && validEventTime && (
            <div className="template-mark-status" aria-live="polite">
              {t(`Повторов: ${scheduledWeeks.length}. День и время: ${t(WEEKDAYS_SHORT[dayIdx])}, ${startTime}-${minToTime(startMin + durationMin)}.`)}
              {" "}{t(`Период: ${toISO(anchor)} — ${toISO(new Date(getMonday(anchor).getFullYear(), getMonday(anchor).getMonth(), getMonday(anchor).getDate() + (effectiveWeeksCount - 1) * 7))}.`)}
            </div>
          )}

          <div className="recurring-form-actions">
            <button type="button" onClick={() => setOpen(false)} className="btn btn-ghost btn-sm">Отмена</button>
            <button type="button" onClick={submit} disabled={!canSubmit} className="btn btn-primary btn-sm">{busy ? "Обрабатываю..." : "Создать и разметить"}</button>
          </div>
        </div>
      )}
    </div>
  );
}
