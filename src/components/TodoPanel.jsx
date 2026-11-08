import { useEffect, useRef, useState } from "react";
import { Plus, X, Check, GripVertical, ChevronUp, ChevronDown, MousePointerClick } from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Дела без привязки к конкретной клетке сетки - "когда-нибудь на     */
/*  этой неделе", "купить подарок" и т.п. Отдельное хранилище          */
/*  ("todos"), никак не связанное с cells недель. Незавершённые дела    */
/*  можно перетащить прямо на клетку недели - см. draggable ниже и      */
/*  onDropTodo в Cell.jsx - тогда дело получает конкретное время и      */
/*  само исчезает из этого списка (см. Planner.jsx: handleDropTodo).    */
/* ------------------------------------------------------------------ */

export function TodoPanel({ todos, onAdd, onToggle, onDelete, onMove, onSchedule, todoToScheduleId, onStartSchedule }) {
  const [text, setText] = useState("");
  const [draggingTodo, setDraggingTodo] = useState(null);
  const pointerDragRef = useRef(null);
  const highlightedCellRef = useRef(null);
  const pending = todos.filter((t) => !t.done);
  const done = todos.filter((t) => t.done);

  function submit() {
    const v = text.trim();
    if (!v) return;
    onAdd(v);
    setText("");
  }

  useEffect(() => {
    function clearPointerDrag() {
      pointerDragRef.current = null;
      if (highlightedCellRef.current) {
        highlightedCellRef.current.classList.remove("cell-todo-drop-target");
        highlightedCellRef.current = null;
      }
      setDraggingTodo(null);
    }

    function onPointerMove(event) {
      const drag = pointerDragRef.current;
      if (!drag || (drag.pointerId != null && event.pointerId !== drag.pointerId)) return;
      if (!drag.started) {
        const distance = Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY);
        if (distance < 7) return;
        drag.started = true;
      }

      setDraggingTodo({ id: drag.todo.id, text: drag.todo.text, x: event.clientX, y: event.clientY });
      const target = document.elementFromPoint(event.clientX, event.clientY)?.closest("[data-todo-drop-target]");
      if (target !== highlightedCellRef.current) {
        highlightedCellRef.current?.classList.remove("cell-todo-drop-target");
        highlightedCellRef.current = target || null;
        highlightedCellRef.current?.classList.add("cell-todo-drop-target");
      }
      event.preventDefault();
    }

    function onPointerUp(event) {
      const drag = pointerDragRef.current;
      if (!drag || (drag.pointerId != null && event.pointerId !== drag.pointerId)) return;
      if (drag.started) {
        const target = document.elementFromPoint(event.clientX, event.clientY)?.closest("[data-todo-drop-target]");
        if (target) {
          onSchedule(target.dataset.weekIso, Number(target.dataset.dayIdx), Number(target.dataset.rowIdx), drag.todo.id);
        }
        event.preventDefault();
      }
      clearPointerDrag();
    }

    function onPointerCancel() {
      clearPointerDrag();
    }

    window.addEventListener("pointermove", onPointerMove, { passive: false });
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerCancel);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerCancel);
      clearPointerDrag();
    };
  }, [onSchedule]);

  return (
    <div className="todo-panel">
      <div className="dock-panel-title-row"><span>Дела без времени</span></div>
      <div className="hint-text pad-sm" style={{ marginBottom: 6 }}>
        Для того, что не привязано к конкретному часу - «купить подарок», «позвонить в поликлинику». Можно перетащить прямо на клетку недели, чтобы назначить время.
      </div>

      <div className="todo-add-row">
        <input
          className="input-pill"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="новое дело"
        />
        <button onClick={submit} className="btn btn-ghost"><Plus size={13} /></button>
      </div>

      {todos.length === 0 && <div className="hint-text pad-sm">Пока пусто.</div>}

      {todoToScheduleId && (
        <div className="todo-schedule-hint" role="status">
          <span>Кликните по клетке недели, чтобы назначить время.</span>
          <button type="button" className="icon-btn subtle icon-action-button todo-schedule-cancel" onClick={() => onStartSchedule(null)} title="Отменить выбор клетки" aria-label="Отменить выбор клетки"><X size={16} /></button>
        </div>
      )}

      {pending.length > 0 && (
        <div className="todo-list">
          {pending.map((t, index) => (
            <div
              key={t.id}
              className={`todo-row todo-row-draggable ${draggingTodo?.id === t.id ? "todo-row-dragging" : ""}`}
              onPointerDown={(event) => {
                if (event.button !== 0 || event.target.closest("button,input,textarea,select")) return;
                event.preventDefault();
                pointerDragRef.current = {
                  todo: t,
                  pointerId: event.pointerId,
                  startX: event.clientX,
                  startY: event.clientY,
                  started: false,
                };
              }}
              title="Можно перетащить на клетку недели, чтобы назначить время"
            >
              <span className="todo-drag-handle" aria-hidden="true"><GripVertical size={11} /></span>
              <button type="button" className={`icon-btn subtle icon-action-button todo-schedule-btn ${todoToScheduleId === t.id ? "active" : ""}`} onClick={() => onStartSchedule(t.id)} title="Выбрать клетку недели, чтобы назначить время" aria-label="Назначить время" aria-pressed={todoToScheduleId === t.id}><MousePointerClick size={16} /></button>
              <button className="todo-check" onClick={() => onToggle(t.id)} title="Отметить сделанным"><Check size={11} /></button>
              <span className="todo-text" data-no-translate>{t.text}</span>
              <button type="button" className="icon-btn subtle todo-priority-btn" onClick={() => onMove(t.id, -1)} disabled={index === 0} title="Повысить приоритет" aria-label="Повысить приоритет"><ChevronUp size={16} /></button>
              <button type="button" className="icon-btn subtle todo-priority-btn" onClick={() => onMove(t.id, 1)} disabled={index === pending.length - 1} title="Понизить приоритет" aria-label="Понизить приоритет"><ChevronDown size={16} /></button>
              <button className="icon-btn subtle icon-action-button" onClick={() => onDelete(t.id)} title="Удалить дело" aria-label="Удалить дело"><X size={16} /></button>
            </div>
          ))}
        </div>
      )}
      {draggingTodo && (
        <div className="todo-drag-ghost" style={{ left: draggingTodo.x, top: draggingTodo.y }}>
          {draggingTodo.text}
        </div>
      )}

      {done.length > 0 && (
        <>
          <div className="template-group-title" style={{ marginTop: 10 }}>Сделано</div>
          <div className="todo-list">
            {done.map((t) => (
              <div key={t.id} className="todo-row todo-row-done">
                <button className="todo-check done" onClick={() => onToggle(t.id)} title="Вернуть в дела"><Check size={11} /></button>
                <span className="todo-text" data-no-translate>{t.text}</span>
                <button className="icon-btn subtle icon-action-button" onClick={() => onDelete(t.id)} title="Удалить дело" aria-label="Удалить дело"><X size={16} /></button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
