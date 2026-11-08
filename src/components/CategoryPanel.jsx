import { useState, useEffect } from "react";
import { X, Plus, FileText } from "lucide-react";
import { DEFAULT_COLORS } from "../constants.js";
import { uid } from "../utils.js";

export function CategoryPanel({ categories, setCategories, active, setActive, onPickCategory }) {
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState(DEFAULT_COLORS[0]);
  const [subInput, setSubInput] = useState("");
  const [openSubDescId, setOpenSubDescId] = useState(null);

  useEffect(() => {
    setNewColor(DEFAULT_COLORS[categories.length % DEFAULT_COLORS.length]);
  }, [categories.length]);



  function addCategory() {
    if (!newName.trim()) return;
    setCategories([...categories, { id: uid(), name: newName.trim(), color: newColor, subs: [] }]);
    setNewName("");
  }
  function updateCat(id, patch) { setCategories(categories.map((c) => (c.id === id ? { ...c, ...patch } : c))); }
  function removeCat(id, name) {
    if (!window.confirm(`Удалить категорию «${name}»? Записи в клетках останутся, из списка исчезнет только категория.`)) return;
    setCategories(categories.filter((c) => c.id !== id));
    if (active?.catId === id) setActive(null);
  }
  function addSub(catId) {
    const name = subInput.trim();
    if (!name) return;
    setCategories(categories.map((c) => (c.id === catId ? { ...c, subs: [...c.subs, { id: uid(), name }] } : c)));
    setSubInput("");
  }
  function removeSub(catId, subId) { setCategories(categories.map((c) => (c.id === catId ? { ...c, subs: c.subs.filter((s) => s.id !== subId) } : c))); }
  // Описание программы внутри подкатегории (например "день рук" -> текст
  // с упражнениями) - читаемый текст, который потом виден и в агенде дня.
  function updateSub(catId, subId, patch) {
    setCategories(categories.map((c) => (c.id === catId ? { ...c, subs: c.subs.map((s) => (s.id === subId ? { ...s, ...patch } : s)) } : c)));
  }

  // Шаг 1: выбор категории. Всегда сразу ставит цвет ЭТОЙ категории активным
  // для заливки и переключает режим на «Заливка».
  function pickCategory(cat) {
    const same = active && active.catId === cat.id && !active.subId;
    if (same) { setActive(null); return; }
    setActive({ catId: cat.id, subId: null, label: cat.name, color: cat.color });
    onPickCategory && onPickCategory();
  }
  // Шаг 2 (только если у выбранной категории есть подкатегории): уточняем.
  function pickSub(cat, sub) {
    const same = active && active.subId === sub.id;
    if (same) {
      setActive({ catId: cat.id, subId: null, label: cat.name, color: cat.color });
    } else {
      setActive({ catId: cat.id, subId: sub.id, label: `${cat.name} - ${sub.name}`, color: cat.color });
      onPickCategory && onPickCategory();
    }
  }

  return (
    <div className="category-panel">
      <div className="dock-panel-title-row">
        <span>Категории</span>
        {active && <span className="category-toggle-active">&middot; активна: <span data-no-translate>{active.label}</span></span>}
      </div>
      <div className="category-body">
        {categories.length === 0 && <div className="hint-text">Категорий пока нет - добавьте первую ниже.</div>}
        {categories.map((cat) => {
            const isActiveCat = active?.catId === cat.id;
            return (
              <div key={cat.id} className="category-row">
                <div className="category-row-main">
                  <input type="color" className="color-dot" value={cat.color} onChange={(e) => updateCat(cat.id, { color: e.target.value })} title="Изменить цвет категории" />
                  <button
                    onClick={() => pickCategory(cat)}
                    title="Выбрать эту категорию для заливки"
                    className={`chip ${isActiveCat ? "chip-active" : ""}`}
                    style={{ "--chip-color": cat.color }}
                  >
                    <span data-no-translate>{cat.name}{cat.subs.length > 0 ? ` (${cat.subs.length})` : ""}</span>
                  </button>
                  <button onClick={() => removeCat(cat.id, cat.name)} title="Удалить категорию" aria-label="Удалить категорию" className="icon-btn subtle icon-action-button ml-auto"><X size={16} /></button>
                </div>

                {/* Подкатегории - сразу под своей категорией, а не в общем хвосте списка */}
                {isActiveCat && (
                  <div className="subpick-panel" style={{ "--chip-color": cat.color }}>
                    <span className="subpick-title">Подкатегория для «{cat.name}» (необязательно):</span>
                    <div className="sub-list">
                      {cat.subs.map((sub) => {
                        const descOpen = openSubDescId === sub.id;
                        return (
                          <div key={sub.id} className="sub-item">
                            <div className="sub-item-row">
                              <button
                                onClick={() => pickSub(cat, sub)}
                                title="Выбрать эту подкатегорию для заливки"
                                className={`sub-chip ${active?.subId === sub.id ? "sub-chip-active" : ""}`}
                                style={{ "--chip-color": cat.color }}
                              >
                                <span data-no-translate>{sub.name}</span>
                              </button>
                              <button
                                onClick={() => setOpenSubDescId(descOpen ? null : sub.id)}
                                className={`icon-btn tiny ${sub.description ? "sub-desc-has" : ""}`}
                                title={sub.description ? "Описание (видно и в агенде дня)" : "Добавить описание - видно и в агенде дня"}
                              >
                                <FileText size={11} />
                              </button>
                              <button onClick={() => removeSub(cat.id, sub.id)} title="Удалить подкатегорию" aria-label="Удалить подкатегорию" className="icon-btn subtle icon-action-button"><X size={16} /></button>
                            </div>
                            {descOpen && (
                              <textarea
                                className="sub-desc-textarea"
                                value={sub.description || ""}
                                onChange={(e) => updateSub(cat.id, sub.id, { description: e.target.value })}
                                placeholder="описание программы - что входит, на что обратить внимание при выполнении..."
                                rows={3}
                                autoFocus
                              />
                            )}
                          </div>
                        );
                      })}
                      <input
                        className="input-inline"
                        value={subInput}
                        onChange={(e) => setSubInput(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && addSub(cat.id)}
                        placeholder="+ подкатегория"
                      />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
      </div>
      <div className="category-add-row">
        <input type="color" value={newColor} onChange={(e) => setNewColor(e.target.value)} className="color-dot" title="Цвет новой категории" />
        <input className="input-pill" value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addCategory()} placeholder="новая категория" />
        <button onClick={addCategory} className="btn btn-ghost"><Plus size={13} /></button>
      </div>
    </div>
  );
}
