import { useRef, useState, useEffect, useMemo } from "react";
import { Trash2 } from "lucide-react";
import { MONTHS_NOM } from "../constants.js";
import { toISO, addDays } from "../utils.js";
import { useI18n, t } from "../i18n.js";

export function MonthTile({ name, monthIdx, year, weeksInMonth, weeksData, onOpen, selectionMode = false, selected = false, onToggle }) {
  const { language } = useI18n();
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || visible) return;
    const obs = new IntersectionObserver(([entry]) => { if (entry.isIntersecting) setVisible(true); }, { rootMargin: "400px 0px" });
    obs.observe(el);
    return () => obs.disconnect();
  }, [visible]);

  const stats = useMemo(() => {
    if (!visible) return null;
    // Этап 2: weekData теперь { days: [ [...интервалы...], ...] } - список
    // готовых интервалов на день, а не плоский квантовый словарь. "planned"
    // считаем по ДНЯМ (как и раньше - день считается один раз, сколько бы
    // интервалов с категорией на нём ни было), "done" - если хоть один
    // категоризированный интервал этого дня отмечен выполненным.
    let planned = 0, done = 0;
    weeksInMonth.forEach((monday) => {
      const iso = toISO(monday);
      const wk = weeksData[iso];
      if (!wk) return;
      wk.days.forEach((dayIntervals, d) => {
        const date = addDays(monday, d);
        if (date.getMonth() !== monthIdx || date.getFullYear() !== year) return;
        const categorized = dayIntervals.filter((v) => v.catId);
        if (categorized.length === 0) return;
        planned++;
        if (categorized.some((v) => v.done)) done++;
      });
    });
    return { planned, done };
  }, [visible, weeksData, weeksInMonth, monthIdx, year]);

  const now = new Date();
  const isCurrent = monthIdx === now.getMonth() && year === now.getFullYear();

  const statsLabel = stats && stats.planned > 0
    ? t(`${stats.done}/${stats.planned} выполнено`, language)
    : stats ? t("пусто", language) : "\u00a0";
  if (selectionMode) {
    return (
      <label ref={ref} className={`view-tile month-tile-select ${selected ? "view-tile-selected" : ""} ${isCurrent ? "view-tile-current" : ""}`}>
        <input type="checkbox" checked={selected} onChange={() => onToggle?.(monthIdx)} />
        <span className="month-tile-select-content">
          <span className="view-tile-name">{t(name, language)}</span>
          <span className={`view-tile-stats ${stats?.planned === 0 ? "view-tile-stats-empty" : ""}`}>{statsLabel}</span>
        </span>
      </label>
    );
  }
  return (
    <button ref={ref} type="button" onClick={onOpen} className={`view-tile ${isCurrent ? "view-tile-current" : ""}`}>
      <span className="view-tile-name">{t(name, language)}</span>
      {stats && stats.planned > 0 && <span className="view-tile-stats">{statsLabel}</span>}
      {stats && stats.planned === 0 && <span className="view-tile-stats view-tile-stats-empty">{statsLabel}</span>}
      {!stats && <span className="view-tile-stats view-tile-stats-empty">{statsLabel}</span>}
    </button>
  );
}

export function MonthsGrid({ year, yearList, weeksData, onOpenMonth, selectionMode = false, selectedMonths = [], onToggleMonth }) {
  return (
    <div className="tiles-grid">
      {MONTHS_NOM.map((name, monthIdx) => {
        const weeksInMonth = yearList.filter((m) => m.getMonth() === monthIdx);
        if (weeksInMonth.length === 0) return null;
        return (
          <MonthTile
            key={monthIdx}
            name={name}
            monthIdx={monthIdx}
            year={year}
            weeksInMonth={weeksInMonth}
            weeksData={weeksData}
            selectionMode={selectionMode}
            selected={selectedMonths.includes(monthIdx)}
            onToggle={onToggleMonth}
            onOpen={() => onOpenMonth(monthIdx)}
          />
        );
      })}
    </div>
  );
}

export function YearsGrid({ years, currentYear, onOpenYear, onCreateYear, onDeleteYear, protectedYear, selectionMode = false, selectedYears = [], onToggleYear }) {
  const { language } = useI18n();
  const selectedYearSet = new Set(selectedYears);
  return (
    <div className="tiles-grid">
      {years.map((y) => (
        <div key={y} className={`year-tile-wrap ${selectionMode ? "year-tile-wrap-selectable" : ""}`}>
          {selectionMode ? (
            <label className={`view-tile year-tile-select ${selectedYearSet.has(y) ? "view-tile-selected" : ""} ${y === currentYear ? "view-tile-current" : ""}`}>
              <input type="checkbox" checked={selectedYearSet.has(y)} onChange={() => onToggleYear?.(y)} />
              <span className="view-tile-name">{y}</span>
            </label>
          ) : (
            <button type="button" onClick={() => onOpenYear(y)} className={`view-tile ${y === currentYear ? "view-tile-current" : ""}`}>
              <span className="view-tile-name">{y}</span>
            </button>
          )}
          {!selectionMode && onDeleteYear && y !== protectedYear && <button type="button" className="year-tile-delete icon-btn subtle" onClick={(event) => { event.stopPropagation(); onDeleteYear(y); }} title={t("Удалить этот год", language)} aria-label={t("Удалить этот год", language)}><Trash2 size={13} /></button>}
        </div>
      ))}
      {!selectionMode && onCreateYear && (
        <button onClick={onCreateYear} className="view-tile view-tile-create" title="Завести новый год">
          <span className="view-tile-name">{t("+ Завести год", language)}</span>
        </button>
      )}
    </div>
  );
}
