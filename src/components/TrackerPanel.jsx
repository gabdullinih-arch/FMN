import { useMemo } from "react";
import { MONTHS_SHORT } from "../constants.js";
import { PieChart } from "./PieChart.jsx";
import { CounterPanel } from "./CounterPanel.jsx";
import { t } from "../i18n.js";

function formatMinutes(min) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m} мин`;
  if (m === 0) return `${h} ч`;
  return `${h} ч ${m} мин`;
}

/* ------------------------------------------------------------------ */
/*  Трекер - три вкладки вместо одной длинной прокручиваемой панели:    */
/*  «Неделя» (часы по категориям + pie chart), «Интервал» (бывший       */
/*  отдельный инструмент «Счётчик» - произвольный диапазон недель) и    */
/*  «Год» (полная таблица план/сделано/перенесено по месяцам). Вкладка -*/
/*  состояние из Planner.jsx (tab/onTabChange), а не внутреннее - это   */
/*  нужно, чтобы Planner знал, когда включать отметку недель чекбоксами */
/*  (markingMode) для вкладки «Интервал», как у шаблонов.               */
/* ------------------------------------------------------------------ */

const TABS = [
  { id: "week", label: "Неделя" },
  { id: "interval", label: "Интервал" },
  { id: "year", label: "Год" },
];

export function TrackerPanel({
  tab, onTabChange,
  year, categories, loading, stats, onRefresh,
  weekLabel, weekStats, weekLoading, onRefreshWeek, selectedCats, onToggleSelectedCat,
  markedWeeks, counterLoading, counterResult, onComputeCounter, onResetCounter,
}) {
  const totals = useMemo(() => {
    if (!stats) return null;
    return stats.reduce(
      (acc, s) => ({
        planned: acc.planned + s.plannedTotal,
        moved: acc.moved + s.movedTotal,
        done: acc.done + s.doneTotal,
      }),
      { planned: 0, moved: 0, done: 0 }
    );
  }, [stats]);
  const donePct = totals && totals.planned > 0 ? Math.round((totals.done / totals.planned) * 100) : null;

  const weekTotalMin = useMemo(() => (weekStats || []).reduce((s, w) => s + w.minutes, 0), [weekStats]);
  const pieData = useMemo(
    () => (weekStats || [])
      .filter((w) => selectedCats.has(w.cat.id))
      .map((w) => ({ value: w.minutes, color: w.cat.color, label: w.cat.name })),
    [weekStats, selectedCats]
  );

  return (
    <div className="tracker-panel">
      <div className="segmented tracker-tabs">
        {TABS.map((tabItem) => (
          <button key={tabItem.id} onClick={() => onTabChange(tabItem.id)} className={`segmented-option ${tab === tabItem.id ? "active" : ""}`}>{t(tabItem.label)}</button>
        ))}
      </div>

      {tab === "week" && (
        <>
          <div className="dashboard-head">
            <span className="hint-text">{t(weekLabel)}</span>
            <button onClick={onRefreshWeek} className="btn btn-ghost btn-sm" disabled={weekLoading}>{weekLoading ? t("Считаю...") : t("Обновить")}</button>
          </div>

          {weekStats && weekStats.length === 0 && <div className="hint-text pad-sm">На этой неделе пока ничего не закрашено.</div>}

          {weekStats && weekStats.length > 0 && (
            <div className="dashboard-body">
              <div className="dashboard-list">
                {weekStats.map(({ cat, minutes }) => {
                  const pct = weekTotalMin > 0 ? Math.round((minutes / weekTotalMin) * 100) : 0;
                  const checked = selectedCats.has(cat.id);
                  return (
                    <label key={cat.id} className={`dashboard-row ${checked ? "" : "dashboard-row-off"}`}>
                      <input type="checkbox" checked={checked} onChange={() => onToggleSelectedCat(cat.id)} />
                      <span className="tracker-dot" style={{ background: cat.color }} />
                      <span className="dashboard-row-name" data-no-translate>{cat.name}</span>
                      <span className="dashboard-row-val">{formatMinutes(minutes)}</span>
                      <span className="dashboard-row-pct">{checked ? `${pct}%` : ""}</span>
                    </label>
                  );
                })}
              </div>
              <div className="dashboard-pie-wrap">
                <PieChart data={pieData} />
                <span className="hint-text">{formatMinutes(pieData.reduce((s, d) => s + d.value, 0))} из выбранных</span>
              </div>
            </div>
          )}

          {!weekStats && !weekLoading && <div className="hint-text pad-sm">{t("Нажмите «Обновить», чтобы посчитать часы за текущую неделю.")}</div>}
        </>
      )}

      {tab === "interval" && (
        <CounterPanel
          markedWeeks={markedWeeks}
          loading={counterLoading}
          result={counterResult}
          onCompute={onComputeCounter}
          onReset={onResetCounter}
        />
      )}

      {tab === "year" && (
        <>
          <div className="tracker-head">
            <span
              className="tracker-title"
              title="В каждой месячной клетке: сделано/запланировано. Кружок с числом рядом - сколько раз переносили клетки этой категории мышью."
            >
              {t(`Трекер по категориям - ${year}`)}
            </span>
            <button onClick={onRefresh} className="btn btn-ghost btn-sm" disabled={loading}>{loading ? t("Считаю...") : t("Обновить")}</button>
          </div>

          {totals && (
            <div className="tracker-summary">
              <div className="tracker-summary-card">
                <span className="tracker-summary-num">{totals.planned}</span>
                <span className="tracker-summary-label">{t("запланировано")}</span>
              </div>
              <div className="tracker-summary-card">
                <span className="tracker-summary-num">{totals.done}</span>
                <span className="tracker-summary-label">{t(donePct !== null ? `выполнено (${donePct}%)` : "выполнено")}</span>
              </div>
              <div className="tracker-summary-card">
                <span className="tracker-summary-num">{totals.moved}</span>
                <span className="tracker-summary-label">{t("перенесено")}</span>
              </div>
            </div>
          )}

          {stats && stats.length > 0 && (
            <div className="tracker-table-wrap">
              <table className="tracker-table">
                <thead>
                  <tr>
                    <th style={{ textAlign: "left" }}>Категория</th>
                    {MONTHS_SHORT.map((mo) => <th key={mo}>{mo}</th>)}
                    <th>Год</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.map(({ cat, plannedCounts, movedCounts, doneCounts, plannedTotal, movedTotal, doneTotal }) => (
                    <tr key={cat.id}>
                      <td className="tracker-cat-cell"><span className="tracker-dot" style={{ background: cat.color }} /><span data-no-translate>{cat.name}</span></td>
                      {plannedCounts.map((planned, i) => {
                        const done = doneCounts[i];
                        const moved = movedCounts[i];
                        if (!planned) return <td key={i} className="tracker-count-zero">-</td>;
                        return (
                          <td key={i} className="tracker-count">
                            <span title={`Сделано ${done} из ${planned} запланированных`}>{done}/{planned}</span>
                            {moved > 0 && <span className="tracker-moved-badge" title={`Перенесено: ${moved}`}>{moved}</span>}
                          </td>
                        );
                      })}
                      <td className="tracker-total">
                        {doneTotal}/{plannedTotal}
                        {movedTotal > 0 && <span className="tracker-moved-badge" title={`Перенесено за год: ${movedTotal}`}>{movedTotal}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {stats && stats.length === 0 && <div className="hint-text pad-sm">Добавьте категории, чтобы отслеживать по ним прогресс.</div>}
          {!stats && !loading && <div className="hint-text pad-sm">Нажмите «Обновить», чтобы посчитать статистику за {year} год.</div>}
        </>
      )}
    </div>
  );
}
