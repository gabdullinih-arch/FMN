import { ArrowUpRight, Check } from "lucide-react";
import { toISO, getMonday, formatRange } from "../utils.js";
import { useI18n, t } from "../i18n.js";

/* ------------------------------------------------------------------ */
/*  Плитки недель - используются только пока открыта панель «Шаблоны»  */
/*  и включён режим «Недели плитками»: вместо прокрутки через полные   */
/*  таблицы недель показывается сетка маленьких квадратиков (по одному */
/*  на неделю) - так гораздо быстрее отмечать сразу много недель для    */
/*  применения шаблона. Название недели вписывается прямо в плитку и    */
/*  хранится отдельно (weekNumbers, iso -> подпись) - не привязан ни к  */
/*  каким клеткам сетки.                                                */
/* ------------------------------------------------------------------ */

export function WeekTiles({ yearList, weekNumberLabels, markedWeeks, onToggleMark, onSetWeekNumber, onOpenWeek, selectionMode = false, selectedWeekIsos = [], onToggleWeek }) {
  const { language } = useI18n();
  const todayIso = toISO(getMonday(new Date()));
  const selectedWeekSet = new Set(selectedWeekIsos);
  return (
    <div className="tiles-grid week-tiles-grid">
      {yearList.map((monday) => {
        const iso = toISO(monday);
        const marked = !selectionMode && markedWeeks.has(iso);
        const selected = selectionMode && selectedWeekSet.has(iso);
        const isCurrent = iso === todayIso;
        return (
          <div key={iso} data-week-iso={iso} className={`week-tile ${marked ? "week-tile-marked" : ""} ${selected ? "week-tile-selected" : ""} ${isCurrent ? "week-tile-current" : ""}`}>
            {selectionMode ? (
              <label className="week-tile-main week-tile-select-main">
                <input
                  className="week-tile-checkbox"
                  type="checkbox"
                  checked={selected}
                  onChange={() => onToggleWeek?.(iso)}
                  aria-label={`${t("Отметить/снять неделю для очистки", language)} ${t(formatRange(monday), language)}`}
                />
                <span className="week-tile-select-content">
                  <span className={`week-tile-name-display ${weekNumberLabels[iso] ? "" : "week-tile-name-empty"}`}>
                    {weekNumberLabels[iso] || t("Название недели", language)}
                  </span>
                  <span className="week-tile-range">{t(formatRange(monday), language)}</span>
                </span>
              </label>
            ) : (
              <div
                className="week-tile-main"
                role="button"
                tabIndex={0}
                onClick={() => onToggleMark(iso)}
                onKeyDown={(e) => e.key === "Enter" && onToggleMark(iso)}
                title={t("Отметить/снять отметку для применения шаблона", language)}
              >
                {(marked || selected) && <span className="week-tile-check"><Check size={11} /></span>}
                <input
                  className="week-tile-number-input"
                  value={weekNumberLabels[iso] || ""}
                  onChange={(e) => onSetWeekNumber(iso, e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                  onKeyDown={(e) => e.stopPropagation()}
                  placeholder={t("Название недели", language)}
                  title={t("Введите название недели (например, «Учебная неделя 1»)", language)}
                  aria-label={t("Название недели", language)}
                />
                <span className="week-tile-range">{t(formatRange(monday), language)}</span>
              </div>
            )}
            {!selectionMode && <button type="button" className="week-tile-open" onClick={() => onOpenWeek(iso)} title={t("Открыть эту неделю целиком", language)}><ArrowUpRight size={12} /></button>}
          </div>
        );
      })}
    </div>
  );
}
