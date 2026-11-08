import { toISO, addDays } from "../utils.js";

function diffDays(aIso, bIso) {
  const a = new Date(aIso + "T00:00:00");
  const b = new Date(bIso + "T00:00:00");
  return Math.round((a.getTime() - b.getTime()) / 86400000);
}

// Подбираем события, которые пересекают эту неделю (monday..monday+6),
// считаем, на какие столбцы (0..6) внутри недели попадает полоска, и
// раскладываем по "дорожкам" (lane), чтобы пересекающиеся по датам
// события не накладывались друг на друга - простой greedy-алгоритм,
// как в большинстве календарей.
export function computeWeekLanes(events, monday) {
  const mondayIso = toISO(monday);
  const sundayIso = toISO(addDays(monday, 6));
  const overlapping = events
    .filter((ev) => ev.startIso <= sundayIso && ev.endIso >= mondayIso)
    .map((ev) => ({
      ...ev,
      spanStart: Math.max(0, diffDays(ev.startIso, mondayIso)),
      spanEnd: Math.min(6, diffDays(ev.endIso, mondayIso)),
    }))
    .sort((a, b) => a.spanStart - b.spanStart || (b.spanEnd - b.spanStart) - (a.spanEnd - a.spanStart));

  const laneEnds = [];
  overlapping.forEach((ev) => {
    let laneIdx = laneEnds.findIndex((end) => end < ev.spanStart);
    if (laneIdx === -1) { laneIdx = laneEnds.length; laneEnds.push(ev.spanEnd); }
    else laneEnds[laneIdx] = ev.spanEnd;
    ev.lane = laneIdx;
  });
  return { events: overlapping, laneCount: laneEnds.length };
}

export function AllDayRow({ monday, allDayEvents, categories, onDelete }) {
  if (!allDayEvents || allDayEvents.length === 0) return null;
  const { events, laneCount } = computeWeekLanes(allDayEvents, monday);
  if (events.length === 0) return null;
  return (
    <div className="week-allday-row">
      <div className="allday-gutter" />
      <div className="allday-track" style={{ gridAutoRows: 20, minHeight: laneCount * 22 }}>
        {events.map((ev) => {
          const cat = ev.catId ? categories.find((c) => c.id === ev.catId) : null;
          const color = ev.color || (cat ? cat.color : "#8A8272");
          return (
            <button
              key={ev.id}
              className="allday-chip"
              style={{
                gridColumn: `${ev.spanStart + 1} / ${ev.spanEnd + 2}`,
                gridRow: ev.lane + 1,
                background: `color-mix(in srgb, ${color} 22%, var(--surface))`,
                borderColor: color,
              }}
              onClick={() => onDelete(ev.id)}
              title="Клик - удалить событие"
            >
              <span className="allday-chip-dot" style={{ background: color }} />
              <span className="allday-chip-text" data-no-translate>{ev.text}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
