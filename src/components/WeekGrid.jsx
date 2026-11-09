import { memo, useRef, useEffect, useState, useMemo, Fragment } from "react";
import { Eraser, NotebookPen, Expand, Minimize2, SlidersHorizontal, ChevronDown } from "lucide-react";
import { WEEKDAYS_SHORT } from "../constants.js";
import { pad, toISO, addDays, getMonday, formatRange, minToTime } from "../utils.js";
import { useI18n, t } from "../i18n.js";
import { readCellValue, EMPTY_CELL, isSameBrushRun, brushHeaderKey, resolveBrushRunHeader, shouldHideRepeatedHeader } from "../intervals.js";
import { Cell } from "./Cell.jsx";
import { AllDayRow } from "./AllDayEvents.jsx";
import forgetMeNotIcon from "../../app/app-icon.png";

export const WeekGrid = memo(function WeekGrid({
  label, monday, weekData, settings, mode, isCurrentWeek, gridRef, iso,
  fullscreen, onToggleFullscreen,
  categories, onCellDown, onCellEnter, onCellText, onCellTask, onCellSubPick, onCellDone, onCellDescription,
  onHoverDescription, onLeaveDescription, onDropTodo, todoToScheduleId, onCancelTodoSchedule,
  watchIndicators = { week: [], days: [] },
  selection, highlight, dayHighlight, onClearWeek,
  markingMode, weekMarked, markedDays, onToggleWeekMark, onToggleDayMark,
  allDayEvents, onDeleteAllDay, onHoverWeek, onOpenReflection,
  onWeekQuantumChange, onWeekDayBoundsChange, onResetWeekDayBounds,
  showTimeControls, onToggleTimeControls,
}) {
  const rows = [];
  for (let m = settings.dayStart; m < settings.dayEnd; m += settings.cellMin) rows.push(m);
  const BODY_CAP = 460;
  const HEAD_H = 33; // приблизительная высота строки заголовков дней - для расчёта общей высоты единого скролл-контейнера
  const colTemplate = `46px repeat(7, minmax(76px, 1fr))`;
  // Этап 2: weekData теперь { days: [ [...интервалы дня 0...], ..., [...6...] ] } -
  // список уже готовых, непересекающихся "прогонов" от Rust, а не плоский
  // квантовый словарь. Никакого cellData.js/compactCells/expandCells больше нет.
  const days = weekData.days || [[], [], [], [], [], [], []];
  const categoriesById = useMemo(() => new Map(categories.map((category) => [category.id, category])), [categories]);
  const gridStyle = {
    gridTemplateColumns: colTemplate,
    userSelect: mode === "select" || mode === "paint" ? "none" : "auto",
    "--cell-h": `calc(var(--row-h, 24px) * ${(settings.zoom || 1)})`,
    "--cell-fs": `${(11 * (settings.zoom || 1)).toFixed(1)}px`,
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
  const headersByBrushByCol = Array.from({ length: 7 }, () => new Map());

  return (
    <div
      ref={gridRef}
      className={`week-card ${markingMode && weekMarked ? "week-card-marked" : ""} ${fullscreen ? "week-card-fullscreen" : ""}`}
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
            <Fragment key={rowIdx}>
              <div className="row-time">{minToTime(m)}</div>
              {WEEKDAYS_SHORT.map((_, dayIdx) => {
                const rowStart = settings.dayStart + rowIdx * settings.cellMin;
                const raw = readCellValue(days[dayIdx], rowStart);
                const sameBrushRun = isSameBrushRun(lastRunByCol[dayIdx], raw, rowStart);
                const startsNewRun = raw !== EMPTY_CELL && !sameBrushRun;
                const runHeader = resolveBrushRunHeader(raw, startsNewRun, headersByBrushByCol[dayIdx]);
                const displayRaw = runHeader === raw.text ? raw : { ...raw, text: runHeader };
                const isContinuation = raw !== EMPTY_CELL
                  && shouldHideRepeatedHeader(lastRunByCol[dayIdx], displayRaw, rowStart, lastHeaderByCol[dayIdx]);
                const c = isContinuation && displayRaw.text ? { ...displayRaw, text: "" } : displayRaw;
                if (raw === EMPTY_CELL || !sameBrushRun) {
                  lastHeaderByCol[dayIdx] = null;
                }
                if (raw.text && raw.color) headersByBrushByCol[dayIdx].set(brushHeaderKey(raw), raw.text);
                if (displayRaw.text && !isContinuation) lastHeaderByCol[dayIdx] = displayRaw.text;
                lastRunByCol[dayIdx] = raw;
                const category = c.catId ? categoriesById.get(c.catId) || null : null;
                return (
                  <Cell
                    key={`${dayIdx}-${rowIdx}`}
                    iso={iso}
                    dayIdx={dayIdx}
                    rowIdx={rowIdx}
                    value={c}
                    category={category}
                    mode={mode}
                    selected={isSelected(dayIdx, rowIdx)}
                    highlighted={isHighlighted(dayIdx, rowIdx)}
                    onCellDown={onCellDown}
                    onCellEnter={onCellEnter}
                    onCellText={onCellText}
                    onCellTask={onCellTask}
                    onCellSubPick={onCellSubPick}
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
  onCellDown, onCellEnter, onCellText, onCellTask, onCellSubPick, onCellDone, onCellDescription,
  onHoverDescription, onLeaveDescription, onDropTodo, todoToScheduleId, onCancelTodoSchedule,
  selection, highlight, dayHighlight, mounted, onVisible, onHidden, registerRef, onClearWeek,
  markingMode, weekMarked, markedDays, onToggleWeekMark, onToggleDayMark,
  allDayEvents, onDeleteAllDay, onHoverWeek, onOpenReflection,
  onWeekQuantumChange, onWeekDayBoundsChange, onResetWeekDayBounds,
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

  const approxHeight = 104 + Math.min(Math.ceil((settings.dayEnd - settings.dayStart) / settings.cellMin) * 24, 460);

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
        onCellDown={onCellDown}
        onCellEnter={onCellEnter}
        onCellText={onCellText}
        onCellTask={onCellTask}
        onCellSubPick={onCellSubPick}
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
        showTimeControls={showTimeControls}
        onToggleTimeControls={() => setShowTimeControls((visible) => !visible)}
        watchIndicators={watchIndicators}
      />
    </div>
  );
}
