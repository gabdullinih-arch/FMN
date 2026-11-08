import { useState, useEffect, useRef } from "react";
import { Search } from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Командная палитра (Ctrl+K) - список ДЕЙСТВИЙ (не инструментов дока -  */
/*  для них есть KeyTips по Alt), с поиском и стрелками+Enter. Рядом с   */
/*  каждым действием - его собственная горячая клавиша, если она есть,   */
/*  так что палитра заодно и подсказывает хоткеи, даже если ей не       */
/*  пользоваться регулярно.                                             */
/* ------------------------------------------------------------------ */

export function CommandPalette({ commands, onClose }) {
  const [query, setQuery] = useState("");
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const q = query.trim().toLowerCase();
  const filtered = q
    ? commands.filter((c) => c.label.toLowerCase().includes(q) || (c.keywords || "").toLowerCase().includes(q))
    : commands;

  useEffect(() => { setActiveIdx(0); }, [query]);
  useEffect(() => {
    const el = listRef.current?.children[activeIdx];
    if (el) el.scrollIntoView({ block: "nearest" });
  }, [activeIdx]);

  function run(cmd) {
    onClose();
    // сначала закрыть палитру, действие - на следующем тике, чтобы
    // модалка не мешала фокусу/скроллу, которые может менять действие
    setTimeout(() => cmd.action(), 0);
  }

  function handleKeyDown(e) {
    if (e.key === "ArrowDown") { e.preventDefault(); setActiveIdx((i) => Math.min(i + 1, filtered.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActiveIdx((i) => Math.max(i - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); if (filtered[activeIdx]) run(filtered[activeIdx]); }
    else if (e.key === "Escape") { e.preventDefault(); onClose(); }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card command-palette" onClick={(e) => e.stopPropagation()}>
        <div className="command-palette-input-row">
          <Search size={14} className="search-icon" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Введите действие..."
            className="command-palette-input"
          />
        </div>
        <div className="command-palette-list" ref={listRef}>
          {filtered.length === 0 && <div className="hint-text pad-sm">Ничего не найдено</div>}
          {filtered.map((c, i) => (
            <button
              key={c.id}
              className={`command-palette-item ${i === activeIdx ? "active" : ""}`}
              onMouseEnter={() => setActiveIdx(i)}
              onClick={() => run(c)}
            >
              <span>{c.label}</span>
              {c.hotkey && <span className="command-palette-hotkey">{c.hotkey}</span>}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
