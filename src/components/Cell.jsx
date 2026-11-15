import { memo, useEffect, useMemo, useState } from "react";
import { Check, FileText, BookOpen, Plus } from "lucide-react";
import { useI18n, t } from "../i18n.js";

/* ------------------------------------------------------------------ */
/*  Cell (мемоизирован: не перерисовывается, если его данные не менялись) */
/* ------------------------------------------------------------------ */

export const Cell = memo(function Cell({
  iso, dayIdx, rowIdx, value, category, mode, selected, highlighted, showDoneCheck,
  categoryOptions = [], searchCategoryOptions = categoryOptions, onCellDown, onCellEnter, onCellText, onCellTask, onCellSubPick, onCellCategoryPick, onCreateCategoryForCell, onCellDone, onCellDescription,
  onHoverDescription, onLeaveDescription, onDropTodo, todoToScheduleId, onCancelTodoSchedule,
}) {
  const { language } = useI18n();
  const hasSubsToChoose = !!(category && category.subs && category.subs.length > 0);
  const showSplit = !!value.color;
  const needsSubPick = hasSubsToChoose && !value.subId;
  const showCheck = showDoneCheck && !!value.catId;
  const sub = category && value.subId ? category.subs.find((s) => s.id === value.subId) : null;
  const effectiveDesc = value.description || (sub && sub.description) || "";

  const [descOpen, setDescOpen] = useState(false);
  const [subDescOpen, setSubDescOpen] = useState(false);
  const [categoryPickerOpen, setCategoryPickerOpen] = useState(false);
  const [activeCategoryIndex, setActiveCategoryIndex] = useState(-1);
  const stop = (e) => { e.stopPropagation(); };

  const categoryQuery = (value.text || "").trim().toLocaleLowerCase();
  const choosingSubcategory = !!(value.catId && needsSubPick);
  const subcategoryOptions = choosingSubcategory
    ? category.subs.map((subOption) => ({
      key: `${category.id}-${subOption.id}`,
      label: `${category.name} - ${subOption.name}`,
      category,
      sub: subOption,
    }))
    : [];
  const availableCategoryOptions = choosingSubcategory
    ? subcategoryOptions
    : categoryQuery ? searchCategoryOptions : categoryOptions;
  const filteredChoices = useMemo(() => {
    const query = choosingSubcategory ? "" : categoryQuery.trim();
    const items = query
      ? availableCategoryOptions.filter((choice) => choice.label.toLocaleLowerCase().includes(query))
      : availableCategoryOptions;
    return items.slice(0, 8);
  }, [availableCategoryOptions, categoryQuery, choosingSubcategory]);
  const exactCategoryChoice = useMemo(() => {
    const query = categoryQuery.trim();
    if (!query) return null;
    return availableCategoryOptions.find((choice) => choice.label.toLocaleLowerCase() === query) || null;
  }, [availableCategoryOptions, categoryQuery]);
  const visibleCategoryChoices = filteredChoices;
  const pickerId = `cell-category-options-${iso}-${dayIdx}-${rowIdx}`;
  const canCreateCategory = !choosingSubcategory && !!value.text?.trim() && !exactCategoryChoice;
  const categoryOptionCount = visibleCategoryChoices.length + (canCreateCategory ? 1 : 0);

  useEffect(() => {
    if (!categoryPickerOpen) {
      setActiveCategoryIndex(-1);
    }
  }, [categoryPickerOpen]);

  function renderCategoryPicker() {
    if (!categoryPickerOpen || mode !== "text") return null;
    return (
        <div className="cell-category-picker" id={pickerId} role="listbox" aria-label={t("Выберите категорию или создайте новую", language)} onPointerDown={(event) => event.stopPropagation()}>
        {visibleCategoryChoices.map((choice, index) => (
          <div key={choice.key} id={`${pickerId}-option-${index}`} role="option" aria-selected={activeCategoryIndex === index} className={`cell-category-option ${activeCategoryIndex === index ? "active" : ""}`} onPointerDown={(event) => { event.preventDefault(); event.stopPropagation(); }} onClick={() => { onCellCategoryPick?.(iso, dayIdx, rowIdx, choice.category, choice.sub); setCategoryPickerOpen(false); }}>
            <span className="cell-category-swatch" style={{ "--category-option-color": choice.category.color }} />
            <span>{choice.label}</span>
          </div>
        ))}
        {canCreateCategory && <div id={`${pickerId}-option-${visibleCategoryChoices.length}`} role="option" aria-selected={activeCategoryIndex === visibleCategoryChoices.length} className={`cell-category-create ${activeCategoryIndex === visibleCategoryChoices.length ? "active" : ""}`} onPointerDown={(event) => { event.preventDefault(); event.stopPropagation(); }} onClick={() => { onCreateCategoryForCell?.(iso, dayIdx, rowIdx, value.text); setCategoryPickerOpen(false); }}>
          <Plus size={13} /> {t("Создать категорию", language)} <strong>{value.text.trim()}</strong>
        </div>}
        {visibleCategoryChoices.length === 0 && !value.text?.trim() && <span className="cell-category-empty">{t(searchCategoryOptions.length ? "Добавьте категории в частые, нажав на звёздочку." : "Категорий пока нет", language)}</span>}
      </div>
    );
  }

  function renderCategoryInput(inputClassName) {
    return (
      <div className="cell-category-entry">
        <input
          value={value.text || ""}
          onChange={(event) => { setActiveCategoryIndex(-1); onCellText(iso, dayIdx, rowIdx, event.target.value); }}
          onFocus={() => { setActiveCategoryIndex(-1); setCategoryPickerOpen(true); }}
          onBlur={(event) => { if (!event.currentTarget.parentElement.contains(event.relatedTarget)) setCategoryPickerOpen(false); }}
          onKeyDown={(event) => {
            if (event.key === "Escape" && categoryPickerOpen) { event.preventDefault(); setCategoryPickerOpen(false); setActiveCategoryIndex(-1); return; }
            if (event.key === "ArrowDown" && categoryPickerOpen) {
              event.preventDefault();
              if (categoryOptionCount) setActiveCategoryIndex((index) => (index + 1) % categoryOptionCount);
              return;
            }
            if (event.key === "ArrowUp" && categoryPickerOpen) {
              event.preventDefault();
              if (categoryOptionCount) setActiveCategoryIndex((index) => (index <= 0 ? categoryOptionCount - 1 : index - 1));
              return;
            }
            if (event.key === "Enter" && categoryPickerOpen && activeCategoryIndex >= 0 && activeCategoryIndex < visibleCategoryChoices.length) {
              event.preventDefault();
              const choice = visibleCategoryChoices[activeCategoryIndex];
              onCellCategoryPick?.(iso, dayIdx, rowIdx, choice.category, choice.sub);
              setCategoryPickerOpen(false);
              return;
            }
            if (event.key === "Enter" && categoryPickerOpen && canCreateCategory && activeCategoryIndex === visibleCategoryChoices.length) {
              event.preventDefault();
              onCreateCategoryForCell?.(iso, dayIdx, rowIdx, value.text);
              setCategoryPickerOpen(false);
              return;
            }
            if (event.key === "Enter" && categoryPickerOpen && exactCategoryChoice) {
              event.preventDefault();
              onCellCategoryPick?.(iso, dayIdx, rowIdx, exactCategoryChoice.category, exactCategoryChoice.sub);
              setCategoryPickerOpen(false);
              return;
            }
            handleFieldKeyDown(event, "main");
          }}
          data-cell-input={`${iso}_${dayIdx}_${rowIdx}_main`}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={categoryPickerOpen}
          aria-controls={pickerId}
          aria-activedescendant={categoryPickerOpen && activeCategoryIndex >= 0 ? `${pickerId}-option-${activeCategoryIndex}` : undefined}
          className={inputClassName}
          aria-label={t("Дело или категория", language)}
          style={{ pointerEvents: mode === "text" ? "auto" : "none" }}
        />
        {renderCategoryPicker()}
      </div>
    );
  }

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
            title={value.done ? t("Всё дело отмечено выполненным — нажмите, чтобы снять отметку", language) : t("Отметить всё дело выполненным", language)}
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
            renderCategoryInput("cell-subselect")
          ) : (
            renderCategoryInput("cell-input cell-input-top")
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
        renderCategoryInput("cell-input")
      )}
    </div>
  );
});
