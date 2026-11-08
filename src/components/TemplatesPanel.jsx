import { useState, useMemo } from "react";
import { Plus, X, LayoutGrid, Table2 } from "lucide-react";
import { WEEKDAYS_SHORT } from "../constants.js";
import { formatRange, toISO } from "../utils.js";

const APPLY_MODES = [
  { id: "auto", label: "Авто по размеру", hint: "Для короткого шаблона — только в пустые, для крупного — заменить всё." },
  { id: "overwrite", label: "Заменить всё", hint: "Данные недели/дня полностью заменяются шаблоном." },
  { id: "keepExisting", label: "Только в пустые", hint: "Шаблон дописывается только в пустые клетки - что уже заполнено, не трогается." },
  { id: "templateWins", label: "Наложить поверх", hint: "Шаблон заменяет только свои интервалы; остальное содержимое остаётся." },
  { id: "interactivePerCell", label: "Спросить по конфликтам", hint: "Перед применением отдельно спросить для каждого занятого интервала." },
];

export function TemplatesPanel({
  templates, markedWeeks, markedDays,
  onApplyWeekToMarked, onApplyWeekRange, onApplyDayToMarked, onDeleteTemplate, onOpenCreateModal,
  applyMode, onApplyModeChange, weekTileView, onToggleWeekTileView,
}) {
  const [targetMode, setTargetMode] = useState("marked");
  const [rangeStart, setRangeStart] = useState(() => toISO(new Date()));
  const [rangeEndMode, setRangeEndMode] = useState("count");
  const [rangeWeeks, setRangeWeeks] = useState(8);
  const [rangeEndDate, setRangeEndDate] = useState(() => toISO(new Date()));
  const [rangeFilter, setRangeFilter] = useState("all");
  const [cyclePeriod, setCyclePeriod] = useState(2);
  const [customRanges, setCustomRanges] = useState("");
  const [exceptions, setExceptions] = useState("");
  const weekTemplates = templates.filter((t) => t.type === "week");
  const dayTemplates = templates.filter((t) => t.type === "day");
  const markParts = [];
  if (markedWeeks.size) markParts.push(`${markedWeeks.size} нед.`);
  if (markedDays.size) markParts.push(`${markedDays.size} дн.`);

  return (
    <div className="templates-panel">
      <div className="dock-panel-title-row"><span>Шаблоны</span></div>
      <div className="templates-body">
        <div className="template-group-title">Режим применения</div>
        <div className="apply-mode-group">
          {APPLY_MODES.map((m) => (
            <button
              key={m.id}
              onClick={() => onApplyModeChange(m.id)}
              className={`apply-mode-btn ${applyMode === m.id ? "active" : ""}`}
              title={m.hint}
            >
              {m.label}
            </button>
          ))}
        </div>

        <button onClick={onToggleWeekTileView} className="btn btn-ghost btn-sm template-create-btn" title="Показывать недели маленькими плитками вместо полных таблиц - удобно быстро отмечать много недель">
          {weekTileView ? <Table2 size={13} /> : <LayoutGrid size={13} />} {weekTileView ? "Обычный вид недель" : "Недели плитками"}
        </button>

        <div className="template-mark-status">
          {markParts.length === 0
            ? "Отметьте недели или дни прямо в календаре - чекбоксы появились в заголовках, пока открыта эта панель."
            : `Отмечено: ${markParts.join(", ")}`}
        </div>
        <button onClick={onOpenCreateModal} className="btn btn-primary btn-sm template-create-btn"><Plus size={13} /> Создать шаблон из отмеченного</button>

        <div className="template-group-title">Шаблоны недели</div>
        <div className="segmented">
          <button onClick={() => setTargetMode("marked")} className={`segmented-option ${targetMode === "marked" ? "active" : ""}`}>Отмеченные недели</button>
          <button onClick={() => setTargetMode("range")} className={`segmented-option ${targetMode === "range" ? "active" : ""}`}>Диапазон</button>
        </div>
        {targetMode === "range" && (
          <div className="template-range-form">
            <label className="field-inline">Начало
              <input type="date" className="time-input" value={rangeStart} onChange={(e) => setRangeStart(e.target.value)} />
            </label>
            <div className="segmented">
              <button onClick={() => setRangeEndMode("count")} className={`segmented-option ${rangeEndMode === "count" ? "active" : ""}`}>N недель</button>
              <button onClick={() => setRangeEndMode("date")} className={`segmented-option ${rangeEndMode === "date" ? "active" : ""}`}>До даты</button>
            </div>
            {rangeEndMode === "count"
              ? <label className="field-inline">Недель
                <input type="number" min={1} max={520} className="time-input" value={rangeWeeks} onChange={(e) => setRangeWeeks(e.target.value)} />
              </label>
              : <label className="field-inline">Конец
                <input type="date" className="time-input" value={rangeEndDate} onChange={(e) => setRangeEndDate(e.target.value)} />
              </label>}
            <label className="field-inline">Фильтр недель
              <select className="time-input" value={rangeFilter} onChange={(e) => setRangeFilter(e.target.value)}>
                <option value="all">Все</option>
                <option value="even">Чётные от начала</option>
                <option value="odd">Нечётные от начала</option>
                <option value="cycle">Цикл</option>
                <option value="custom">Список / диапазоны</option>
              </select>
            </label>
            {rangeFilter === "cycle" && <label className="field-inline">Период
              <input type="number" min={1} max={520} className="time-input" value={cyclePeriod} onChange={(e) => setCyclePeriod(e.target.value)} />
            </label>}
            {rangeFilter === "custom" && <input className="input-pill" value={customRanges} onChange={(e) => setCustomRanges(e.target.value)} placeholder="Номера от начала: 2-17,20" />}
            <label className="field-inline">Исключить даты
              <input className="input-pill" value={exceptions} onChange={(e) => setExceptions(e.target.value)} placeholder="YYYY-MM-DD, YYYY-MM-DD" />
            </label>
            <div className="hint-text">Штамповка — разовая копия. Исключения пропускают указанные дни, а фильтр считается от первой недели диапазона.</div>
          </div>
        )}
        {weekTemplates.length === 0 && <div className="hint-text">Пока нет сохранённых шаблонов недели.</div>}
        {weekTemplates.map((t) => (
          <div key={t.id} className="template-row">
            <span className="template-row-name">{t.name}</span>
            <button
              onClick={() => targetMode === "marked" ? onApplyWeekToMarked(t) : onApplyWeekRange(t, {
                startDate: rangeStart, endMode: rangeEndMode, weeksCount: rangeWeeks, endDate: rangeEndDate,
                filterType: rangeFilter, cyclePeriod, customRanges, exceptions,
              })}
              disabled={targetMode === "marked" && markedWeeks.size === 0}
              className="btn btn-ghost btn-sm"
              title={targetMode === "marked" ? (markedWeeks.size === 0 ? "Сначала отметьте неделю(-и) в календаре" : `Применить к ${markedWeeks.size} отмеченным неделям`) : "Рассчитать диапазон и применить"}
            >
              {targetMode === "marked" ? "Применить к отмеченным" : "Применить к диапазону"}
            </button>
            <button onClick={() => onDeleteTemplate(t.id)} className="icon-btn subtle icon-action-button" title="Удалить шаблон" aria-label="Удалить шаблон"><X size={16} /></button>
          </div>
        ))}

        <div className="template-group-title">Шаблоны дня</div>
        {dayTemplates.length === 0 && <div className="hint-text">Пока нет сохранённых шаблонов дня.</div>}
        {dayTemplates.map((t) => (
          <div key={t.id} className="template-row">
            <span className="template-row-name">{t.name}</span>
            <button
              onClick={() => onApplyDayToMarked(t)}
              disabled={markedDays.size === 0}
              className="btn btn-ghost btn-sm"
              title={markedDays.size === 0 ? "Сначала отметьте день(-и) в календаре" : `Применить к ${markedDays.size} отмеченным дням`}
            >
              Применить к отмеченным
            </button>
            <button onClick={() => onDeleteTemplate(t.id)} className="icon-btn subtle icon-action-button" title="Удалить шаблон" aria-label="Удалить шаблон"><X size={16} /></button>
          </div>
        ))}
      </div>
    </div>
  );
}

/* Отдельное окно создания шаблона - не встроено в сетку недели/дня,
   как раньше, а собственное всплывающее пространство. Источником может
   быть любая отмеченная в календаре неделя или день. */
export function TemplateEditorModal({ markedWeeks, markedDays, onSaveWeek, onSaveDay, onClose }) {
  const options = useMemo(() => [
    ...[...markedWeeks].map((iso) => ({ kind: "week", iso, label: `Неделя целиком: ${formatRange(new Date(iso + "T00:00:00"))}` })),
    ...[...markedDays].map((key) => {
      const [iso, d] = key.split("_");
      return { kind: "day", iso, d: Number(d), label: `День: ${WEEKDAYS_SHORT[Number(d)]}, ${formatRange(new Date(iso + "T00:00:00"))}` };
    }),
  ], [markedWeeks, markedDays]);

  const [selectedIdx, setSelectedIdx] = useState(0);
  const [name, setName] = useState(() => {
    const sel = options[0];
    if (!sel) return "";
    return sel.kind === "week" ? `Неделя ${formatRange(new Date(sel.iso + "T00:00:00"))}` : `${WEEKDAYS_SHORT[sel.d]} - шаблон`;
  });

  function pick(i) {
    setSelectedIdx(i);
    const sel = options[i];
    setName(sel.kind === "week" ? `Неделя ${formatRange(new Date(sel.iso + "T00:00:00"))}` : `${WEEKDAYS_SHORT[sel.d]} - шаблон`);
  }

  function handleSave() {
    const sel = options[selectedIdx];
    if (!sel || !name.trim()) return;
    if (sel.kind === "week") onSaveWeek(sel.iso, name.trim());
    else onSaveDay(sel.iso, sel.d, name.trim());
    onClose();
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <span>Создать шаблон</span>
          <button onClick={onClose} className="icon-btn subtle modal-close-button" title="Закрыть"><X size={18} /></button>
        </div>
        {options.length === 0 ? (
          <div className="hint-text pad-sm">Сначала отметьте неделю или день прямо в календаре - чекбоксы для этого появляются в заголовках недель и дней, пока открыта панель «Шаблоны».</div>
        ) : (
          <>
            <div className="modal-body">
              <div className="field-label">Источник</div>
              <div className="template-source-list">
                {options.map((opt, i) => (
                  <label key={i} className="template-source-option">
                    <input type="radio" name="tpl-source" checked={selectedIdx === i} onChange={() => pick(i)} />
                    {opt.label}
                  </label>
                ))}
              </div>
              <div className="field-label">Название</div>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} className="time-input modal-name-input" autoFocus />
            </div>
            <div className="modal-actions">
              <button onClick={onClose} className="btn btn-ghost btn-sm">Отмена</button>
              <button onClick={handleSave} disabled={!name.trim()} className="btn btn-primary btn-sm">Сохранить шаблон</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
