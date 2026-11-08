import { useRef, useState, useEffect, useMemo } from "react";
import { MONTHS_NOM } from "../constants.js";
import { toISO, addDays } from "../utils.js";
import { useI18n, t } from "../i18n.js";

export function MonthTile({ name, monthIdx, year, weeksInMonth, weeksData, onOpen }) {
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

  return (
    <button ref={ref} onClick={onOpen} className={`view-tile ${isCurrent ? "view-tile-current" : ""}`}>
      <span className="view-tile-name">{name}</span>
      {stats && stats.planned > 0 && <span className="view-tile-stats">{t(`${stats.done}/${stats.planned} выполнено`, language)}</span>}
      {stats && stats.planned === 0 && <span className="view-tile-stats view-tile-stats-empty">{t("пусто", language)}</span>}
      {!stats && <span className="view-tile-stats view-tile-stats-empty">&nbsp;</span>}
    </button>
  );
}

export function MonthsGrid({ year, yearList, weeksData, onOpenMonth }) {
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
            onOpen={() => onOpenMonth(monthIdx)}
          />
        );
      })}
    </div>
  );
}

export function YearsGrid({ years, currentYear, onOpenYear, onCreateYear }) {
  const { language } = useI18n();
  return (
    <div className="tiles-grid">
      {years.map((y) => (
        <button key={y} onClick={() => onOpenYear(y)} className={`view-tile ${y === currentYear ? "view-tile-current" : ""}`}>
          <span className="view-tile-name">{y}</span>
        </button>
      ))}
      {onCreateYear && (
        <button onClick={onCreateYear} className="view-tile view-tile-create" title="Завести новый год">
          <span className="view-tile-name">{t("+ Завести год", language)}</span>
        </button>
      )}
    </div>
  );
}
