import { memo, useState } from "react";
import { Check, FileText, BookOpen } from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Cell (мемоизирован: не перерисовывается, если его данные не менялись) */
/* ------------------------------------------------------------------ */

export const Cell = memo(function Cell({
  iso, dayIdx, rowIdx, value, category, mode, selected, highlighted,
  onCellDown, onCellEnter, onCellText, onCellTask, onCellSubPick, onCellDone, onCellDescription,
  onHoverDescription, onLeaveDescription, onDropTodo, todoToScheduleId, onCancelTodoSchedule,
}) {
  const hasSubsToChoose = !!(category && category.subs && category.subs.length > 0);
  const showSplit = !!value.color;
  const needsSubPick = hasSubsToChoose && !value.subId;
  const showCheck = !!value.catId;
  const sub = category && value.subId ? category.subs.find((s) => s.id === value.subId) : null;
  const effectiveDesc = value.description || (sub && sub.description) || "";

  const [descOpen, setDescOpen] = useState(false);
  const [subDescOpen, setSubDescOpen] = useState(false);
  const stop = (e) => { e.stopPropagation(); };

  function handleEnter(e) {
    onCellEnter(iso, dayIdx, rowIdx);
    if (mode !== "paint" && effectiveDesc && onHoverDescription) {
      const rect = e.currentTarget.getBoundingClientRect();
      onHoverDescription({ x: rect.left + rect.width / 2, y: rect.top, text: effectiveDesc });
    }
  }
  function handleLeave() {
    if (onLeaveDescription) onLeaveDescription();
  }

  // Enter - выйти из поля (снять фокус); Shift+Enter - перейти в то же
  // поле у клетки строкой ниже (если такое есть в DOM - т.е. в пределах
  // той же недели). Работает одинаково для обычного текста и для "+ задача".
  function handleFieldKeyDown(e, fieldKind) {
    if (e.key !== "Enter") return;
    e.preventDefault();
    if (e.shiftKey) {
      const next = document.querySelector(`[data-cell-input="${iso}_${dayIdx}_${rowIdx + 1}_${fieldKind}"]`);
      if (next) next.focus();
      else e.target.blur();
    } else {
      e.target.blur();
    }
  }

  function handleCellPointerDown(event) {
    if (todoToScheduleId && onDropTodo) {
      event.preventDefault();
      event.stopPropagation();
      onDropTodo(iso, dayIdx, rowIdx, todoToScheduleId);
      onCancelTodoSchedule?.();
      return;
    }
    onCellDown(iso, dayIdx, rowIdx);
  }

  return (
    <div
      className={`cell ${selected ? "cell-selected" : ""} ${highlighted ? "cell-highlighted" : ""}`}
      data-todo-drop-target
      data-week-iso={iso}
      data-day-idx={dayIdx}
      data-row-idx={rowIdx}
      onPointerDown={handleCellPointerDown}
      onPointerEnter={handleEnter}
      onPointerLeave={handleLeave}
      style={{
        background: value.color ? `color-mix(in srgb, ${value.color} 22%, var(--surface))` : "transparent",
        cursor: mode === "select" ? "cell" : mode === "paint" || mode === "erase" ? "crosshair" : "text",
        touchAction: mode === "text" ? "auto" : "none",
        position: "relative",
      }}
    >
      {showCheck && (
        <div className="cell-corner-btns">
          <button
            type="button"
            className={`cell-done-check ${value.done ? "done" : ""}`}
            onPointerDown={stop}
            onClick={(e) => { stop(e); onCellDone(iso, dayIdx, rowIdx, !value.done); }}
            title={value.done ? "Отмечено как выполнено - нажмите, чтобы снять" : "Отметить как выполнено (для трекера)"}
          >
            {value.done ? <Check size={9} /> : null}
          </button>
          <button
            type="button"
            className={`cell-desc-btn ${value.description ? "has-desc" : ""}`}
            onPointerDown={stop}
            onClick={(e) => { stop(e); setDescOpen((v) => !v); }}
            title={value.description ? "Описание этого дела" : "Добавить описание к этому делу"}
          >
            <FileText size={9} />
          </button>
          {sub?.description && (
            <button
              type="button"
              className="cell-desc-btn has-desc"
              onPointerDown={stop}
              onClick={(e) => { stop(e); setSubDescOpen((open) => !open); }}
              title={`Описание подкатегории «${sub.name}»`}
              aria-label={`Описание подкатегории ${sub.name}`}
            >
              <BookOpen size={9} />
            </button>
          )}
        </div>
      )}
      {descOpen && (
        <div className="cell-desc-popover" onPointerDown={stop} onClick={stop}>
          <textarea
            autoFocus
            value={value.description || ""}
            onChange={(e) => onCellDescription(iso, dayIdx, rowIdx, e.target.value)}
            placeholder="описание этого дела..."
            rows={3}
          />
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setDescOpen(false)}>Готово</button>
        </div>
      )}
      {subDescOpen && (
        <div className="cell-desc-popover cell-sub-desc-popover" onPointerDown={stop} onClick={stop}>
          <strong data-no-translate>{sub.name}</strong>
          <div data-no-translate>{sub.description}</div>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSubDescOpen(false)}>Закрыть</button>
        </div>
      )}
      {showSplit ? (
        <div className="cell-split">
          {needsSubPick ? (
            <select
              className="cell-subselect"
              value=""
              onChange={(e) => e.target.value && onCellSubPick(iso, dayIdx, rowIdx, category, e.target.value)}
              title="Выбрать подкатегорию"
              style={{ pointerEvents: mode === "text" ? "auto" : "none" }}
            >
              <option value="" disabled data-no-translate>{value.text || category.name}</option>
              {category.subs.map((s) => <option key={s.id} value={s.id} data-no-translate>{s.name}</option>)}
            </select>
          ) : (
            <input
              list="planner-legend"
              value={value.text}
              onChange={(e) => onCellText(iso, dayIdx, rowIdx, e.target.value)}
              onKeyDown={(e) => handleFieldKeyDown(e, "main")}
              data-cell-input={`${iso}_${dayIdx}_${rowIdx}_main`}
              className="cell-input cell-input-top"
              style={{ pointerEvents: mode === "text" ? "auto" : "none" }}
            />
          )}
          <input
            value={value.task || ""}
            onChange={(e) => onCellTask(iso, dayIdx, rowIdx, e.target.value)}
            onKeyDown={(e) => handleFieldKeyDown(e, "task")}
            data-cell-input={`${iso}_${dayIdx}_${rowIdx}_task`}
            placeholder="+ задача"
            className="cell-input cell-input-task"
            style={{ pointerEvents: mode === "text" ? "auto" : "none" }}
          />
        </div>
      ) : (
        <input
          list="planner-legend"
          value={value.text}
          onChange={(e) => onCellText(iso, dayIdx, rowIdx, e.target.value)}
          onKeyDown={(e) => handleFieldKeyDown(e, "main")}
          data-cell-input={`${iso}_${dayIdx}_${rowIdx}_main`}
          className="cell-input"
          style={{ pointerEvents: mode === "text" ? "auto" : "none" }}
        />
      )}
    </div>
  );
});
