import { memo, useRef, useEffect, useState, useMemo, Fragment } from "react";
import { Eraser, NotebookPen, Expand, Minimize2, SlidersHorizontal, ChevronDown, Plus, Check, X, Minus } from "lucide-react";
import { WEEKDAYS_SHORT } from "../constants.js";
import { pad, toISO, addDays, getMonday, formatRange, minToTime } from "../utils.js";
import { useI18n, t } from "../i18n.js";
import { readCellValue, EMPTY_CELL, isSameBrushRun, resolveBrushRunHeader, shouldHideRepeatedHeader } from "../intervals.js";
import { Cell } from "./Cell.jsx";
import { AllDayRow } from "./AllDayEvents.jsx";
import forgetMeNotIcon from "../../app/app-icon.png";

export const WeekGrid = memo(function WeekGrid({
  label, monday, weekData, settings, mode, isCurrentWeek, gridRef, iso,
  fullscreen, onToggleFullscreen,
  categories, favoriteCategoryIds = [], onDeleteCustomTime,
  onCellDown, onCellEnter, onCellText, onCellTask, onCellSubPick, onCellCategoryPick, onCreateCategoryForCell, onCellDone, onCellDescription,
  onHoverDescription, onLeaveDescription, onDropTodo, todoToScheduleId, onCancelTodoSchedule,
  watchIndicators = { week: [], days: [] },
  selection, highlight, dayHighlight, onClearWeek,
  markingMode, weekMarked, markedDays, onToggleWeekMark, onToggleDayMark,
  allDayEvents, onDeleteAllDay, onHoverWeek, onOpenReflection,
  onWeekQuantumChange, onWeekDayBoundsChange, onResetWeekDayBounds,
  onAddCustomTime, onUpdateCustomTime,
  showTimeControls, onToggleTimeControls,
}) {
  const rows = [];
  for (let m = settings.dayStart; m < settings.dayEnd; m += settings.cellMin) rows.push(m);
  for (const m of settings.customTimes || []) if (m > settings.dayStart && m < settings.dayEnd && !rows.includes(m)) rows.push(m);
  rows.sort((a, b) => a - b);
  const BODY_CAP = 460;
  const HEAD_H = 33; // приблизительная высота строки заголовков дней - для расчёта общей высоты единого скролл-контейнера
  // Этап 2: weekData теперь { days: [ [...интервалы дня 0...], ..., [...6...] ] } -
  // список уже готовых, непересекающихся "прогонов" от Rust, а не плоский
  // квантовый словарь. Никакого cellData.js/compactCells/expandCells больше нет.
  const days = weekData.days || [[], [], [], [], [], [], []];
  const { language } = useI18n();
  const [customTimeEditor, setCustomTimeEditor] = useState(null);
  const [customTimeSaving, setCustomTimeSaving] = useState(false);
  const [recentlyAddedTime, setRecentlyAddedTime] = useState(null);
  const addedTimeTimerRef = useRef(null);
  const timeColumnWidth = "80px";
  const colTemplate = `${timeColumnWidth} repeat(7, minmax(76px, 1fr))`;
  const categoriesById = useMemo(() => new Map(categories.map((category) => [category.id, category])), [categories]);
  const favoriteSet = useMemo(() => new Set(favoriteCategoryIds), [favoriteCategoryIds]);
  const allCategoryOptions = useMemo(() => [...categories]
    .sort((left, right) => left.name.localeCompare(right.name, undefined, { sensitivity: "base" }))
    .flatMap((category) => [
      { key: category.id, label: category.name, category, sub: null },
      ...(category.subs || []).map((sub) => ({ key: `${category.id}-${sub.id}`, label: `${category.name} - ${sub.name}`, category, sub })),
    ]), [categories]);
  const categoryOptions = useMemo(() => allCategoryOptions.filter((choice) => !choice.sub && favoriteSet.has(choice.category.id)), [allCategoryOptions, favoriteSet]);
  const gridStyle = {
    gridTemplateColumns: colTemplate,
    userSelect: mode === "select" || mode === "paint" ? "none" : "auto",
    "--cell-h": `calc(var(--row-h, 24px) * ${(settings.zoom || 1)})`,
    "--cell-fs": `${(11 * (settings.zoom || 1)).toFixed(1)}px`,
    "--time-gutter-width": timeColumnWidth,
  };

  function isSelected(d, r) {
    return selection && selection.iso === iso && d >= selection.dMin && d <= selection.dMax && r >= selection.rMin && r <= selection.rMax;
  }
  function isHighlighted(d, r) {
    return highlight && highlight.iso === iso && highlight.d === d && highlight.r === r;
  }
  function isDayHighlighted(d) {
    return dayHighlight && dayHighlight.iso === iso && dayHighlight.d === d;
  }

  const lastRunByCol = new Array(7).fill(null);
  const lastHeaderByCol = new Array(7).fill(null);
  useEffect(() => () => {
    if (addedTimeTimerRef.current) clearTimeout(addedTimeTimerRef.current);
  }, []);
  function openAddCustomTime(afterMin) {
    setCustomTimeEditor({ afterMin, editingMin: null, value: "", error: "" });
  }

  function openEditCustomTime(minute) {
    const rowIndex = rows.indexOf(minute);
    const afterMin = rows[rowIndex - 1] ?? settings.dayStart;
    setCustomTimeEditor({ afterMin, editingMin: minute, value: minToTime(minute), error: "" });
  }

  function customTimeLimits(afterMin, editingMin) {
    const starts = rows.filter((value) => value !== editingMin);
    const index = starts.indexOf(afterMin);
    const nextBoundary = index >= 0 ? starts[index + 1] ?? settings.dayEnd : settings.dayEnd;
    const minMinute = Math.floor(afterMin / 5) * 5 + 5;
    const maxMinute = Math.floor((nextBoundary - 1) / 5) * 5;
    const options = [];
    for (let minute = minMinute; minute <= maxMinute; minute += 5) options.push(minute);
    if (editingMin != null && editingMin > afterMin && editingMin < nextBoundary && !options.includes(editingMin)) options.push(editingMin);
    options.sort((a, b) => a - b);
    return { min: minToTime(minMinute), max: minToTime(maxMinute), options };
  }

  function hasCustomTimeSlot(afterMin, nextBoundary) {
    const firstAllowed = Math.floor(afterMin / 5) * 5 + 5;
    const lastAllowed = Math.floor((nextBoundary - 1) / 5) * 5;
    return firstAllowed <= lastAllowed;
  }

  async function submitCustomTime(event) {
    event.preventDefault();
    if (!customTimeEditor || customTimeSaving) return;
    setCustomTimeSaving(true);
    let result;
    try {
      result = customTimeEditor.editingMin == null
        ? await onAddCustomTime?.(iso, customTimeEditor.afterMin, customTimeEditor.value)
        : await onUpdateCustomTime?.(iso, customTimeEditor.editingMin, customTimeEditor.afterMin, customTimeEditor.value);
    } catch (error) {
      console.error("Could not save custom time row", error);
      result = { ok: false, error: "Не удалось сохранить строку времени." };
    } finally {
      setCustomTimeSaving(false);
    }
    if (result?.ok) {
      if (customTimeEditor.editingMin == null) {
        setRecentlyAddedTime(customTimeEditor.value);
        if (addedTimeTimerRef.current) clearTimeout(addedTimeTimerRef.current);
        addedTimeTimerRef.current = setTimeout(() => {
          setRecentlyAddedTime(null);
          addedTimeTimerRef.current = null;
        }, 1300);
      }
      setCustomTimeEditor(null);
    }
    else setCustomTimeEditor((current) => current ? { ...current, error: t(result?.error || "Не удалось сохранить строку времени.", language) } : current);
  }

  const customTimeEditorLimits = customTimeEditor
    ? customTimeLimits(customTimeEditor.afterMin, customTimeEditor.editingMin)
    : null;
  const customTimeRangeTitle = customTimeEditorLimits?.options.length
    ? `${minToTime(customTimeEditorLimits.options[0])}–${minToTime(customTimeEditorLimits.options[customTimeEditorLimits.options.length - 1])}${customTimeEditorLimits.options.some((minute) => minute % 5 !== 0) ? "" : ` · 5 ${t("мин", language)}`}`
    : t("Нет свободного шага в 5 минут между строками", language);

  return (
    <div
      ref={gridRef}
      className={`week-card ${markingMode && weekMarked ? "week-card-marked" : ""} ${fullscreen ? "week-card-fullscreen" : ""}`}
      style={{ "--time-gutter-width": timeColumnWidth }}
      onMouseEnter={() => onHoverWeek && onHoverWeek(iso)}
      onDoubleClick={(event) => {
        if (event.target.closest("button,input,textarea,select")) return;
        onToggleFullscreen?.();
      }}
    >
      <div className="week-card-header">
        <button
          type="button"
          className="icon-btn subtle week-fullscreen-btn"
          onClick={onToggleFullscreen}
          title={fullscreen ? "Выйти из полноэкранного режима недели" : "Развернуть неделю"}
          aria-label={fullscreen ? "Свернуть неделю" : "Развернуть неделю"}
        >
          {fullscreen ? <Minimize2 size={13} /> : <Expand size={13} />}
        </button>
        {markingMode && (
          <label className="mark-checkbox" title="Отметить всю неделю для шаблона">
            <input type="checkbox" checked={weekMarked} onChange={() => onToggleWeekMark(iso)} />
          </label>
        )}
        <span className="week-label">{label}</span>
        <span className="week-range">{formatRange(monday)}</span>
        {watchIndicators.week?.map((indicator) => (
          <span key={indicator.watcherId} className="watch-indicator" style={{ "--watch-color": indicator.color || "var(--accent)" }} title={indicator.text || "Индикатор недели"} aria-label={indicator.text || "Индикатор недели"} />
        ))}
        {isCurrentWeek && <span className="week-badge-current"><span className="seal-dot" />сейчас</span>}
        <button
          type="button"
          className="icon-btn subtle week-time-toggle"
          onClick={onToggleTimeControls}
          title={showTimeControls ? "Скрыть настройки времени недели" : "Показать настройки времени недели"}
          aria-label={showTimeControls ? "Скрыть настройки времени недели" : "Показать настройки времени недели"}
          aria-expanded={showTimeControls}
        >
          <SlidersHorizontal size={15} />
          <ChevronDown className={showTimeControls ? "week-time-toggle-open" : ""} size={13} />
        </button>
        <button
          onClick={() => onClearWeek(iso)}
          className="icon-btn subtle week-clear-btn"
          title="Очистить эту неделю (все клетки станут пустыми, можно вернуть через Undo)"
        >
          <Eraser size={13} />
        </button>
      </div>
      {showTimeControls && <div className="week-time-controls">
        <label className="week-time-control">
          <span>Шаг сетки</span>
          <select
            className="time-input week-quantum-select"
            value={weekData.cellMin ?? ""}
            onChange={(event) => onWeekQuantumChange?.(iso, event.target.value)}
            title="Шаг сетки только для этой недели"
            aria-label={`Шаг сетки недели ${label}`}
          >
            <option value="">Общий: {settings.cellMin} мин</option>
            {[5, 10, 15, 30, 60].map((step) => <option key={step} value={step}>{step} мин</option>)}
          </select>
        </label>
        <label className="week-time-control">
          <span>Начало</span>
          <input
            className="time-input"
            type="time"
            step="300"
            value={minToTime(settings.dayStart)}
            onChange={(event) => onWeekDayBoundsChange?.(iso, "dayStart", event.target.value)}
            aria-label={`Начало дня недели ${label}`}
          />
        </label>
        <label className="week-time-control">
          <span>Конец</span>
          <input
            className="time-input"
            type="time"
            step="300"
            value={minToTime(settings.dayEnd === 1440 ? 0 : settings.dayEnd)}
            onChange={(event) => onWeekDayBoundsChange?.(iso, "dayEnd", event.target.value)}
            aria-label={`Конец дня недели ${label}`}
          />
        </label>
        {(weekData.dayStart != null || weekData.dayEnd != null) && (
          <button
            type="button"
            className="btn btn-ghost btn-sm week-time-reset"
            onClick={() => onResetWeekDayBounds?.(iso)}
            title="Использовать общие часы приложения"
          >
            Общие часы
          </button>
        )}
      </div>}
      <AllDayRow monday={monday} allDayEvents={allDayEvents} categories={categories} onDelete={onDeleteAllDay} />
      <div className="week-grid-scroll" style={{ maxHeight: HEAD_H + BODY_CAP }}>
        <div className="week-grid-head" style={{ gridTemplateColumns: colTemplate }}>
          <div className="head-gutter" />
          {WEEKDAYS_SHORT.map((wd, i) => {
            const d = addDays(monday, i);
            const isToday = toISO(d) === toISO(new Date());
            const dayMarked = markingMode && markedDays.has(`${iso}_${i}`);
            const dayIso = toISO(d);
            return (
              <div key={i} className={`day-head ${isToday ? "day-head-today" : ""} ${isDayHighlighted(i) ? "day-head-jumped" : ""} ${dayMarked ? "day-head-marked" : ""}`}>
                {markingMode && (
                  <label className="mark-checkbox day-mark" title="Отметить этот день для шаблона">
                    <input type="checkbox" checked={dayMarked} onChange={() => onToggleDayMark(iso, i)} />
                  </label>
                )}
                {(watchIndicators.days?.[i] || []).map((indicator) => (
                  <span key={indicator.watcherId} className="watch-indicator" style={{ "--watch-color": indicator.color || "var(--accent)" }} title={indicator.text || "Индикатор дня"} aria-label={indicator.text || "Индикатор дня"} />
                ))}
                <div className="day-head-container">
                  {onOpenReflection ? (
                    <button
                      type="button"
                      className="day-head-reflection-trigger"
                      onClick={(e) => { e.stopPropagation(); onOpenReflection(dayIso); }}
                      title="Рефлексия дня - заметки, не привязанные к конкретному времени"
                      aria-label={`Открыть рефлексию за ${dayIso}`}
                    >
                      <span className="day-head-label">{wd} <span className="day-head-date">{pad(d.getDate())}.{pad(d.getMonth() + 1)}</span></span>
                      <NotebookPen size={14} />
                    </button>
                  ) : (
                    <span className="day-head-label">{wd} <span className="day-head-date">{pad(d.getDate())}.{pad(d.getMonth() + 1)}</span></span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <div className="week-grid" style={gridStyle}>
          {rows.map((m, rowIdx) => (
            <Fragment key={m}>
              <div className={`row-time ${customTimeEditor?.afterMin === m ? "row-time-editing row-time-editor-open" : ""} ${recentlyAddedTime === minToTime(m) ? "row-time-added" : ""}`} onDoubleClick={(event) => { event.stopPropagation(); if (customTimeEditor?.afterMin === m) return; if ((settings.customTimes || []).includes(m)) openEditCustomTime(m); else openAddCustomTime(m); }} title={t("Дважды нажмите, чтобы добавить или изменить строку времени", language)}>
                <span>{minToTime(m)}</span>
                <span className="row-time-actions">
                  {(settings.customTimes || []).includes(m) && <button
                    type="button"
                    className="row-time-delete"
                    onDoubleClick={(event) => event.stopPropagation()}
                    onClick={(event) => { event.stopPropagation(); onDeleteCustomTime?.(iso, m); }}
                    title={t("Удалить строку времени и все записи в ней", language)}
                    aria-label={t("Удалить строку времени", language)}
                  >
                    <Minus size={11} />
                  </button>}
                  <button type="button" className="row-time-add" disabled={!hasCustomTimeSlot(m, rows[rowIdx + 1] ?? settings.dayEnd)} onDoubleClick={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); openAddCustomTime(m); }} title={hasCustomTimeSlot(m, rows[rowIdx + 1] ?? settings.dayEnd) ? `${t("Добавить строку после этого времени", language)} ${minToTime(m)}` : t("Нет свободного шага в 5 минут между строками", language)} aria-label={hasCustomTimeSlot(m, rows[rowIdx + 1] ?? settings.dayEnd) ? `${t("Добавить строку после этого времени", language)} ${minToTime(m)}` : t("Нет свободного шага в 5 минут между строками", language)}><Plus size={11} /></button>
                </span>
                {customTimeEditor?.afterMin === m && (
                  <form className="custom-time-editor-form" onSubmit={submitCustomTime} onDoubleClick={(event) => event.stopPropagation()}>
                    <select className="time-input custom-time-editor-input" autoFocus required value={customTimeEditor.value} onChange={(event) => setCustomTimeEditor((current) => ({ ...current, value: event.target.value, error: "" }))} onInvalid={(event) => { event.preventDefault(); setCustomTimeEditor((current) => current ? { ...current, error: t("Выберите время с шагом 5 минут в доступном диапазоне.", language) } : current); }} onKeyDown={(event) => { if (event.key === "Escape" && !customTimeSaving) setCustomTimeEditor(null); }} aria-invalid={!!customTimeEditor.error} aria-describedby={customTimeEditor.error ? `custom-time-editor-error-${iso}` : undefined} aria-label={t("Время новой строки", language)} title={customTimeRangeTitle}>
                      <option value="">—:—</option>
                      {customTimeEditorLimits.options.map((minute) => <option key={minute} value={minToTime(minute)}>{minToTime(minute)}</option>)}
                    </select>
                    <button type="submit" className="icon-btn tiny custom-time-save" disabled={customTimeSaving} title={t("Сохранить", language)} aria-label={t("Сохранить", language)}>{customTimeSaving ? <span className="mini-spinner" /> : <Check size={14} />}</button>
                    <button type="button" className="icon-btn tiny" onClick={() => setCustomTimeEditor(null)} disabled={customTimeSaving} title={t("Отмена", language)} aria-label={t("Отмена", language)}><X size={14} /></button>
                    {customTimeEditor.error && <span id={`custom-time-editor-error-${iso}`} className="custom-time-editor-error" role="alert">{customTimeEditor.error}</span>}
                  </form>
                )}
              </div>
              {WEEKDAYS_SHORT.map((_, dayIdx) => {
                const rowStart = m;
                const raw = readCellValue(days[dayIdx], rowStart);
                const category = raw.catId ? categoriesById.get(raw.catId) || null : null;
                const subcategory = category?.subs?.find((item) => item.id === raw.subId);
                const brushLabel = category ? subcategory ? `${category.name} - ${subcategory.name}` : category.name : null;
                const previousRun = lastRunByCol[dayIdx];
                const sameVisibleCategoryRun = !!brushLabel
                  && !!previousRun
                  && previousRun.endMin >= rowStart
                  && (previousRun.color || "") === (raw.color || "")
                  && raw.text === brushLabel
                  && lastHeaderByCol[dayIdx] === brushLabel;
                const sameBrushRun = isSameBrushRun(previousRun, raw, rowStart, brushLabel) || sameVisibleCategoryRun;
                const startsNewRun = raw !== EMPTY_CELL && !sameBrushRun;
                const runHeader = resolveBrushRunHeader(raw, startsNewRun);
                const displayRaw = raw === EMPTY_CELL ? raw : { ...raw, text: runHeader };
                const isContinuation = raw !== EMPTY_CELL
                  && shouldHideRepeatedHeader(lastRunByCol[dayIdx], displayRaw, rowStart, lastHeaderByCol[dayIdx]);
                const c = isContinuation && displayRaw.text ? { ...displayRaw, text: "" } : displayRaw;
                if (raw === EMPTY_CELL || !sameBrushRun) {
                  lastHeaderByCol[dayIdx] = null;
                }
                if (displayRaw.text && !isContinuation) lastHeaderByCol[dayIdx] = displayRaw.text;
                lastRunByCol[dayIdx] = raw;
                return (
                  <Cell
                    key={`${dayIdx}-${m}`}
                    iso={iso}
                    dayIdx={dayIdx}
                    rowIdx={rowIdx}
                    value={c}
                    category={category}
                    categoryOptions={categoryOptions}
                    searchCategoryOptions={allCategoryOptions}
                    mode={mode}
                    selected={isSelected(dayIdx, rowIdx)}
                    highlighted={isHighlighted(dayIdx, rowIdx)}
                    showDoneCheck={!!(c.catId && c.text)}
                    onCellDown={onCellDown}
                    onCellEnter={onCellEnter}
                    onCellText={onCellText}
                    onCellTask={onCellTask}
                    onCellSubPick={onCellSubPick}
                    onCellCategoryPick={onCellCategoryPick}
                    onCreateCategoryForCell={onCreateCategoryForCell}
                    onCellDone={onCellDone}
                    onCellDescription={onCellDescription}
                    onHoverDescription={onHoverDescription}
                    onLeaveDescription={onLeaveDescription}
                    onDropTodo={onDropTodo}
                    todoToScheduleId={todoToScheduleId}
                    onCancelTodoSchedule={onCancelTodoSchedule}
                  />
                );
              })}
            </Fragment>
          ))}
        </div>
      </div>
    </div>
  );
});

export function LazyWeek({
  monday, settings, mode, iso, weekData, categories,
  fullscreen = false, onToggleFullscreen,
  onCellDown, onCellEnter, onCellText, onCellTask, onCellSubPick, onCellCategoryPick, onCreateCategoryForCell, onCellDone, onCellDescription,
  onHoverDescription, onLeaveDescription, onDropTodo, todoToScheduleId, onCancelTodoSchedule,
  favoriteCategoryIds = [], onDeleteCustomTime,
  selection, highlight, dayHighlight, mounted, onVisible, onHidden, registerRef, onClearWeek,
  markingMode, weekMarked, markedDays, onToggleWeekMark, onToggleDayMark,
  allDayEvents, onDeleteAllDay, onHoverWeek, onOpenReflection,
  onWeekQuantumChange, onWeekDayBoundsChange, onResetWeekDayBounds,
  onAddCustomTime, onUpdateCustomTime,
  watchIndicators,
}) {
  const wrapperRef = useRef(null);
  const nearViewportRef = useRef(false);
  const [nearViewport, setNearViewport] = useState(false);
  const [showTimeControls, setShowTimeControls] = useState(false);
  const { language } = useI18n();

  useEffect(() => { registerRef(iso, wrapperRef.current); }, []);

  // Render the lightweight placeholder immediately, but defer the expensive
  // calendar grid until scrolling settles near this week.
  const mountTimerRef = useRef(null);
  useEffect(() => {
    const el = wrapperRef.current;
    if (!el || mounted) return;
    const obs = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        nearViewportRef.current = true;
        setNearViewport(true);
        if (!mountTimerRef.current) mountTimerRef.current = setTimeout(() => {
          mountTimerRef.current = null;
          onVisible(iso, () => nearViewportRef.current);
        }, 120);
      } else {
        nearViewportRef.current = false;
        setNearViewport(false);
        if (mountTimerRef.current) {
          clearTimeout(mountTimerRef.current);
          mountTimerRef.current = null;
        }
      }
    }, { rootMargin: "700px 0px" });
    obs.observe(el);
    return () => {
      obs.disconnect();
      if (mountTimerRef.current) { clearTimeout(mountTimerRef.current); mountTimerRef.current = null; }
    };
  }, [mounted, iso, onVisible]);

  // Размонтирование ("виртуализация") - широкий буфер (2500px), намного
  // больше буфера монтирования, чтобы граница появления и граница ухода
  // не совпадали (иначе - дребезг туда-сюда прямо на стыке). Плюс
  // небольшая задержка перед самим размонтированием - если пользователь
  // на секунду остановился прямо на границе и тут же поехал обратно,
  // неделю не выкинет и не придётся перерисовывать её заново.
  const hideTimerRef = useRef(null);
  useEffect(() => {
    const el = wrapperRef.current;
    if (!el || !mounted) return;
    const obs = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) {
        if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
        hideTimerRef.current = setTimeout(() => onHidden(iso), 500);
      } else if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current);
        hideTimerRef.current = null;
      }
    }, { rootMargin: "2500px 0px" });
    obs.observe(el);
    return () => {
      obs.disconnect();
      if (hideTimerRef.current) { clearTimeout(hideTimerRef.current); hideTimerRef.current = null; }
    };
  }, [mounted, iso, onHidden]);

  const customRows = (settings.customTimes || []).filter((minute) => minute > settings.dayStart && minute < settings.dayEnd).length;
  const approxHeight = 104 + Math.min((Math.ceil((settings.dayEnd - settings.dayStart) / settings.cellMin) + customRows) * 24, 460);

  const wrapperClass = `week-lazy-wrapper ${fullscreen ? "week-fullscreen-wrapper" : ""}`;
  if (!mounted || !weekData) return (
    <div ref={wrapperRef} data-week-iso={iso} className={`${wrapperClass} ${nearViewport ? "week-lazy-near" : ""}`} style={{ height: approxHeight, marginBottom: 16 }}>
      {nearViewport && (
        <div className="week-loading-card" role="status" aria-label={t("Загружается неделя", language)}>
          <div className="week-loading-brand">
            <img src={forgetMeNotIcon} className="week-loading-flower" alt="" />
            <span className="week-loading-shimmer week-loading-label" />
          </div>
          <div className="week-loading-columns" aria-hidden="true">
            {Array.from({ length: 7 }, (_, index) => <span className="week-loading-shimmer" key={index} />)}
          </div>
        </div>
      )}
    </div>
  );
  return (
    <div ref={wrapperRef} data-week-iso={iso} className={wrapperClass}>
      <WeekGrid
        label="Неделя"
        monday={monday}
        weekData={weekData}
        settings={settings}
        mode={mode}
        iso={iso}
        fullscreen={fullscreen}
        onToggleFullscreen={onToggleFullscreen}
        categories={categories}
        favoriteCategoryIds={favoriteCategoryIds}
        onDeleteCustomTime={onDeleteCustomTime}
        onCellDown={onCellDown}
        onCellEnter={onCellEnter}
        onCellText={onCellText}
        onCellTask={onCellTask}
        onCellSubPick={onCellSubPick}
        onCellCategoryPick={onCellCategoryPick}
        onCreateCategoryForCell={onCreateCategoryForCell}
        onCellDone={onCellDone}
        onCellDescription={onCellDescription}
        onHoverDescription={onHoverDescription}
        onLeaveDescription={onLeaveDescription}
        onDropTodo={onDropTodo}
        todoToScheduleId={todoToScheduleId}
        onCancelTodoSchedule={onCancelTodoSchedule}
        selection={selection}
        highlight={highlight}
        dayHighlight={dayHighlight}
        isCurrentWeek={iso === toISO(getMonday(new Date()))}
        onClearWeek={onClearWeek}
        markingMode={markingMode}
        weekMarked={weekMarked}
        markedDays={markedDays}
        onToggleWeekMark={onToggleWeekMark}
        onToggleDayMark={onToggleDayMark}
        allDayEvents={allDayEvents}
        onDeleteAllDay={onDeleteAllDay}
        onHoverWeek={onHoverWeek}
        onOpenReflection={onOpenReflection}
        onWeekQuantumChange={onWeekQuantumChange}
        onWeekDayBoundsChange={onWeekDayBoundsChange}
        onResetWeekDayBounds={onResetWeekDayBounds}
        onAddCustomTime={onAddCustomTime}
        onUpdateCustomTime={onUpdateCustomTime}
        showTimeControls={showTimeControls}
        onToggleTimeControls={() => setShowTimeControls((visible) => !visible)}
        watchIndicators={watchIndicators}
      />
    </div>
  );
}
