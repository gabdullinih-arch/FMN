import { ArrowUpRight, Check } from "lucide-react";
import { toISO, getMonday, formatRange } from "../utils.js";
import { useI18n, t } from "../i18n.js";

/* ------------------------------------------------------------------ */
/*  Плитки недель - используются только пока открыта панель «Шаблоны»  */
/*  и включён режим «Недели плитками»: вместо прокрутки через полные   */
/*  таблицы недель показывается сетка маленьких квадратиков (по одному */
/*  на неделю) - так гораздо быстрее отмечать сразу много недель для    */
/*  применения шаблона. Номер недели впечатывается прямо в плитку и     */
/*  хранится отдельно (weekNumbers, iso -> подпись) - не привязан ни к  */
/*  каким клеткам сетки.                                                */
/* ------------------------------------------------------------------ */

export function WeekTiles({ yearList, weekNumberLabels, markedWeeks, onToggleMark, onSetWeekNumber, onOpenWeek }) {
  const { language } = useI18n();
  const todayIso = toISO(getMonday(new Date()));
  return (
    <div className="tiles-grid week-tiles-grid">
      {yearList.map((monday) => {
        const iso = toISO(monday);
        const marked = markedWeeks.has(iso);
        const isCurrent = iso === todayIso;
        return (
          <div key={iso} className={`week-tile ${marked ? "week-tile-marked" : ""} ${isCurrent ? "week-tile-current" : ""}`}>
            <div className="week-tile-main" role="button" tabIndex={0} onClick={() => onToggleMark(iso)} onKeyDown={(e) => e.key === "Enter" && onToggleMark(iso)} title="Отметить/снять отметку для применения шаблона">
              {marked && <span className="week-tile-check"><Check size={11} /></span>}
              <input
                className="week-tile-number-input"
                value={weekNumberLabels[iso] || ""}
                onChange={(e) => onSetWeekNumber(iso, e.target.value)}
                onClick={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
                onKeyDown={(e) => e.stopPropagation()}
                placeholder="№"
                title="Впишите номер этой недели (например, номер учебной недели) - хранится отдельно, никак не связано с клетками"
              />
              <span className="week-tile-range">{t(formatRange(monday), language)}</span>
            </div>
            <button className="week-tile-open" onClick={() => onOpenWeek(iso)} title="Открыть эту неделю целиком">
              <ArrowUpRight size={12} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
