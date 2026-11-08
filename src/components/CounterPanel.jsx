import { useState } from "react";
import { RotateCcw } from "lucide-react";
import { formatRange } from "../utils.js";

/* ------------------------------------------------------------------ */
/*  Счётчик по произвольному интервалу недель - переиспользует тот же   */
/*  механизм отметки недель, что и панель «Шаблоны» (чекбоксы в         */
/*  заголовках недель): отметил одну неделю - начало, другую - конец,   */
/*  посчитать - взял мин/макс среди отмеченных как границы интервала.   */
/* ------------------------------------------------------------------ */

export function CounterPanel({ markedWeeks, loading, result, onCompute, onReset }) {
  const [rangeMode, setRangeMode] = useState("marked");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [rangeText, setRangeText] = useState("");
  const [rangeError, setRangeError] = useState("");
  const marked = [...markedWeeks].sort();
  const hasRange = rangeMode === "calendar" ? Boolean(dateFrom && dateTo) : rangeMode === "text" && Boolean(rangeText.trim());

  function parseManualRange() {
    const match = rangeText.trim().match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})\s*(?:-|–|—|\.\.)\s*(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
    if (!match) return null;
    const [, fromDay, fromMonth, fromYear, toDay, toMonth, toYear] = match;
    const asIso = (day, month, year) => {
      const date = new Date(Number(year), Number(month) - 1, Number(day));
      if (date.getFullYear() !== Number(year) || date.getMonth() !== Number(month) - 1 || date.getDate() !== Number(day)) return null;
      return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    };
    const from = asIso(fromDay, fromMonth, fromYear);
    const to = asIso(toDay, toMonth, toYear);
    return from && to ? { dateFrom: from, dateTo: to } : null;
  }

  function compute() {
    setRangeError("");
    if (rangeMode === "marked") onCompute();
    else if (rangeMode === "calendar") onCompute({ dateFrom, dateTo });
    else {
      const parsed = parseManualRange();
      if (!parsed) {
        setRangeError("Введите две корректные даты в формате ДД.ММ.ГГГГ - ДД.ММ.ГГГГ.");
        return;
      }
      onCompute(parsed);
    }
  }

  return (
    <div className="counter-panel">
      <div className="dock-panel-title-row"><span>Счётчик по неделям</span></div>
      <div className="hint-text pad-sm" style={{ marginBottom: 8 }}>
        Отметьте недели в календаре, выберите даты или введите диапазон вручную. Результат включает план, выполнено и перенос.
      </div>

      <div className="counter-range-modes">
        <label><input type="radio" name="counter-range-mode" checked={rangeMode === "marked"} onChange={() => setRangeMode("marked")} /> Недели</label>
        <label><input type="radio" name="counter-range-mode" checked={rangeMode === "calendar"} onChange={() => setRangeMode("calendar")} /> Календарь</label>
        <label><input type="radio" name="counter-range-mode" checked={rangeMode === "text"} onChange={() => setRangeMode("text")} /> Ввод дат</label>
      </div>
      {rangeMode === "calendar" && (
        <div className="counter-date-fields">
          <label>С <input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} /></label>
          <label>По <input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} /></label>
        </div>
      )}
      {rangeMode === "text" && (
        <input
          className="input-pill"
          value={rangeText}
          onChange={(event) => { setRangeText(event.target.value); setRangeError(""); }}
          placeholder="ДД.ММ.ГГГГ - ДД.ММ.ГГГГ"
          aria-label="Диапазон дат"
        />
      )}
      {rangeError && <div className="planscript-error" role="alert">{rangeError}</div>}
      {rangeMode === "marked" && marked.length === 0 && <div className="hint-text">Пока ничего не отмечено.</div>}
      {rangeMode === "marked" && marked.length > 0 && (
        <div className="hint-text" style={{ marginBottom: 8 }}>
          Отмечено недель: {marked.length}{marked.length >= 2 ? ` · интервал: ${formatRange(new Date(marked[0] + "T00:00:00"))} - ${formatRange(new Date(marked[marked.length - 1] + "T00:00:00"))}` : ""}
        </div>
      )}

      <div className="counter-actions">
        <button onClick={compute} disabled={(rangeMode === "marked" ? marked.length === 0 : !hasRange) || loading} className="btn btn-primary btn-sm">
          {loading ? "Считаю..." : "Посчитать"}
        </button>
        <button onClick={onReset} className="btn btn-ghost btn-sm" title="Снять отметки и очистить результат"><RotateCcw size={13} /></button>
      </div>

      {result && (
        <div className="counter-result">
          <div className="template-group-title">
            {formatRange(new Date(result.startIso + "T00:00:00"))} - {formatRange(new Date(result.endIso + "T00:00:00"))} · {result.weeks} нед.
          </div>
          {result.stats.length === 0 && <div className="hint-text">За этот интервал ничего не запланировано.</div>}
          {result.stats.length > 0 && (
            <table className="counter-table">
              <thead>
                <tr><th style={{ textAlign: "left" }}>Категория</th><th>План</th><th>Готово</th><th>Перенос</th></tr>
              </thead>
              <tbody>
                {result.stats.map(({ cat, planned, done, moved }) => (
                  <tr key={cat.id}>
                    <td className="tracker-cat-cell"><span className="tracker-dot" style={{ background: cat.color }} /><span data-no-translate>{cat.name}</span></td>
                    <td className="counter-num">{planned}</td>
                    <td className="counter-num">{done}</td>
                    <td className="counter-num">{moved || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
