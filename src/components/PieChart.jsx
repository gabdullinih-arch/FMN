/* ------------------------------------------------------------------ */
/*  Простой SVG pie chart без внешних библиотек - ровно то, что нужно  */
/*  для недельного дашборда: несколько цветных секторов + подписи      */
/*  снаружи компонента (сам чарт только рисует круг).                  */
/* ------------------------------------------------------------------ */
export function PieChart({ data, size = 132 }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  const r = size / 2;
  const cx = r;
  const cy = r;

  if (total <= 0) {
    return (
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size}>
        <circle cx={cx} cy={cy} r={r - 1} fill="none" stroke="var(--border)" strokeWidth="1.5" strokeDasharray="3 4" />
      </svg>
    );
  }

  // Один единственный сектор на 100% - обычная arc-формула вырождается
  // (начало и конец дуги совпадают), поэтому рисуем целым кругом отдельно.
  if (data.filter((d) => d.value > 0).length === 1) {
    const only = data.find((d) => d.value > 0);
    return (
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size}>
        <circle cx={cx} cy={cy} r={r - 1} fill={only.color} />
      </svg>
    );
  }

  let angle = -90; // старт сверху, по часовой стрелке
  const toXY = (deg) => {
    const rad = (deg * Math.PI) / 180;
    return [cx + (r - 1) * Math.cos(rad), cy + (r - 1) * Math.sin(rad)];
  };
  const slices = data
    .filter((d) => d.value > 0)
    .map((d) => {
      const sweep = (d.value / total) * 360;
      const start = angle;
      angle += sweep;
      const end = angle;
      const [x1, y1] = toXY(start);
      const [x2, y2] = toXY(end);
      const largeArc = sweep > 180 ? 1 : 0;
      return { path: `M ${cx} ${cy} L ${x1} ${y1} A ${r - 1} ${r - 1} 0 ${largeArc} 1 ${x2} ${y2} Z`, color: d.color };
    });

  return (
    <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size}>
      {slices.map((s, i) => <path key={i} d={s.path} fill={s.color} stroke="var(--surface)" strokeWidth="1.5" />)}
    </svg>
  );
}
