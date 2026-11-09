/* ------------------------------------------------------------------ */
/*  Глобальные стили приложения (один общий CSS-in-JS блок)           */
/* ------------------------------------------------------------------ */

export const STYLE_SHEET = `
/* ------------------------------------------------------------------ */
/*  Три темы, один набор имён переменных - переключаются атрибутом     */
/*  data-theme="light"|"calm"|"dark" на .planner-root (см. §2, §5      */
/*  инструкции). Компоненты ссылаются только на var(--...), никогда   */
/*  на конкретные значения - поэтому новый компонент, написанный через */
/*  переменные, работает во всех трёх темах без единой правки.        */
/*                                                                      */
/*  Про шрифты: приложение работает полностью офлайн (pywebview без    */
/*  интернета), поэтому веб-шрифты (Fraunces/IBM Plex/Inter) не        */
/*  подгружаются с внешних серверов - они первые в списке, но          */
/*  реально используется системный шрифт Windows (Segoe UI/Consolas),  */
/*  который по пропорциям достаточно близок и не тянет за собой        */
/*  сетевую зависимость. Если когда-нибудь понадобится точное          */
/*  совпадение - шрифты можно вшить локальными файлами (@fontsource),  */
/*  сейчас сознательно не делалось ради простоты сборки.               */
/* ------------------------------------------------------------------ */
:root {
  --app-bg: #E7EBE4;
  scrollbar-color: #93A08F var(--app-bg);
}
:root[data-theme="calm"] {
  --app-bg: #FAFAFA;
  scrollbar-color: #A8A8B3 var(--app-bg);
}
:root[data-theme="dark"] {
  --app-bg: #15161A;
  scrollbar-color: #6E7175 #242629;
}
html, body, #root { width: 100%; min-height: 100%; margin: 0; }
html, body { background: var(--app-bg); }
body { min-height: 100vh; }
:root[data-theme="dark"] ::-webkit-scrollbar-track,
:root[data-theme="dark"] ::-webkit-scrollbar-corner { background: #242629; }
:root[data-theme="calm"] ::-webkit-scrollbar-track,
:root[data-theme="calm"] ::-webkit-scrollbar-corner { background: #F4F4F6; }
:root:not([data-theme="dark"]):not([data-theme="calm"]) ::-webkit-scrollbar-track,
:root:not([data-theme="dark"]):not([data-theme="calm"]) ::-webkit-scrollbar-corner { background: #E7EBE4; }
.planner-root {
  /* ---- light (по умолчанию, нынешний вид) ---- */
  --bg: #E7EBE4;
  --surface: #FFFFFF;
  --surface-2: #F1F3ED;
  --surface-3: #FFFFFF;
  --ink: #1E271F;
  --ink-soft: #576155;
  --ink-faint: #93A08F;
  --border: #D7DED2;
  --border-soft: #E6EADF;
  --accent: #A8552E;
  --accent-contrast: #FFFAF4;
  --accent-soft: rgba(168, 85, 46, 0.13);
  --focus: #3B5AA6;
  --focus-soft: rgba(59, 90, 166, 0.14);
  --danger: #A63B45;
  --danger-soft: rgba(166, 59, 69, 0.12);
  --good: #2E7D74;
  --warn: #B8834A;
  --radius: 10px;
  --radius-sm: 6px;
  --row-h: 24px;
  --shadow-sm: 0 1px 2px rgba(20, 28, 20, 0.06);
  --shadow-md: 0 10px 28px -14px rgba(20, 28, 20, 0.35);
  --shadow-lg: 0 24px 48px -20px rgba(20, 28, 20, 0.42);
  --font-display: 'Fraunces', Georgia, 'Times New Roman', serif;
  --font-body: 'IBM Plex Sans', 'Segoe UI', ui-sans-serif, system-ui, sans-serif;
  --font-mono: 'IBM Plex Mono', 'Cascadia Mono', Consolas, ui-monospace, monospace;

  font-family: var(--font-body);
  background: var(--bg);
  color: var(--ink);
  box-sizing: border-box;
  width: 100%;
  min-height: 100vh;
  padding: 0 20px 40px;
  position: relative;
}

.planner-root * { box-sizing: border-box; }

/* ---------- тема "Спокойно" - светлее, воздушнее, без засечек ---------- */
.planner-root[data-theme="calm"] {
  --bg: #FAFAFA;
  --surface: #FFFFFF;
  --surface-2: #F4F4F6;
  --surface-3: #FFFFFF;
  --ink: #1F1F27;
  --ink-soft: #6B6B76;
  --ink-faint: #A8A8B3;
  --border: #ECECEF;
  --border-soft: #F2F2F4;
  --accent: #5A5FCF;
  --accent-contrast: #FFFFFF;
  --accent-soft: rgba(90, 95, 207, 0.12);
  --focus: #5A5FCF;
  --focus-soft: rgba(90, 95, 207, 0.14);
  --danger: #C24545;
  --danger-soft: rgba(194, 69, 69, 0.12);
  --good: #2E9E6B;
  --warn: #B8834A;
  --radius: 14px;
  --radius-sm: 10px;
  --row-h: 34px;
  --shadow-sm: 0 1px 2px rgba(20, 20, 30, 0.04);
  --shadow-md: 0 8px 24px -16px rgba(20, 20, 30, 0.14);
  --shadow-lg: 0 24px 48px -20px rgba(20, 20, 30, 0.24);
  --font-display: 'Inter', 'Segoe UI', ui-sans-serif, system-ui, sans-serif;
  --font-body: 'Inter', 'Segoe UI', ui-sans-serif, system-ui, sans-serif;
}

/* ---------- тёмная тема - глубина через лестницу поверхностей, не через
   тень (на тёмном фоне тени почти не видны); акценты осветлены и
   обесцвечены, а не перенесены как есть - см. §6 инструкции ---------- */
.planner-root[data-theme="dark"] {
  --bg: #15161A;
  --surface: #1C1E22;
  --surface-2: #242629;
  --surface-3: #2C2F33;
  --ink: #EDEDEE;
  --ink-soft: #A7AAAD;
  --ink-faint: #6E7175;
  --border: rgba(255, 255, 255, 0.10);
  --border-soft: rgba(255, 255, 255, 0.06);
  --accent: #C98E72;
  --accent-contrast: #1D1712;
  --accent-soft: rgba(201, 142, 114, 0.18);
  --focus: #7E92C4;
  --focus-soft: rgba(126, 146, 196, 0.18);
  --danger: #C1757C;
  --danger-soft: rgba(193, 117, 124, 0.16);
  --good: #57B3A9;
  --warn: #C2A07D;
  --radius: 10px;
  --radius-sm: 6px;
  --row-h: 24px;
  --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.3);
  --shadow-md: 0 4px 12px -8px rgba(0, 0, 0, 0.4);
  --shadow-lg: 0 24px 48px -20px rgba(0, 0, 0, 0.6);
  --font-display: 'Fraunces', Georgia, 'Times New Roman', serif;
  --font-body: 'IBM Plex Sans', 'Segoe UI', ui-sans-serif, system-ui, sans-serif;
}
.planner-root[data-theme="dark"] input[type="color"] { background: transparent; }
.planner-root[data-theme="dark"] ::-webkit-scrollbar-thumb { background: var(--border); }
.planner-root[data-theme="dark"] ::-webkit-scrollbar-track,
.planner-root[data-theme="dark"] ::-webkit-scrollbar-corner { background: var(--surface-2); }
.planner-root[data-theme="dark"] { scrollbar-color: var(--ink-faint) var(--surface-2); }
.theme-toggle-btn { justify-content: flex-start; margin-top: 2px; }

.planner-root button, .planner-root input, .planner-root select {
  font-family: inherit;
  color: inherit;
}

.planner-root :focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
}

/* ---------- loading ---------- */
.loading-state {
  display: flex; align-items: center; justify-content: center;
  padding: 70px 0; color: var(--ink-soft); gap: 8px; font-size: 13.5px;
}
.startup-loading { max-width: 1080px; margin: 0 auto; padding: 38px 24px; }
.startup-loading-brand { display: flex; align-items: center; gap: 12px; margin-bottom: 20px; color: var(--ink); }
.startup-flower-spin { width: 38px; height: 38px; object-fit: contain; animation: startup-flower-spin 2.8s ease-in-out infinite; }
.startup-loading-copy { display: flex; flex-direction: column; gap: 3px; }
.startup-loading-copy strong { font-family: var(--font-display); font-size: 20px; font-weight: 500; }
.startup-loading-copy span { color: var(--ink-faint); font-size: 12px; }
.startup-skeleton-card { overflow: hidden; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); box-shadow: var(--shadow-sm); }
.startup-skeleton-title { display: flex; align-items: center; gap: 10px; height: 52px; padding: 0 14px; border-bottom: 1px solid var(--border); }
.startup-skeleton-title-mark { width: 18px; height: 18px; border-radius: 5px; }
.startup-skeleton-title-text { width: 118px; height: 12px; border-radius: 6px; }
.startup-skeleton-title-date { width: 154px; height: 10px; border-radius: 5px; }
.startup-skeleton-grid { overflow: hidden; }
.startup-skeleton-row { display: grid; grid-template-columns: 46px repeat(7, minmax(0, 1fr)); height: 28px; }
.startup-skeleton-row > span { position: relative; display: flex; align-items: center; justify-content: center; border-bottom: 1px solid var(--border-soft); border-left: 1px solid var(--border-soft); }
.startup-skeleton-row > span:first-child { border-left: 0; }
.startup-skeleton-days { height: 38px; background: var(--surface-2); }
.startup-skeleton-days > span { border-bottom-color: var(--border); }
.startup-skeleton-row i { display: block; width: 64%; height: 9px; border-radius: 5px; }
.startup-skeleton-row:not(.startup-skeleton-days) > span:first-child i { width: 55%; height: 7px; }
.startup-skeleton-shimmer { background: linear-gradient(100deg, var(--surface-2) 20%, var(--border-soft) 45%, var(--surface-2) 70%); background-size: 220% 100%; animation: startup-skeleton-shimmer 1.8s ease-in-out infinite; }
.week-lazy-wrapper { position: relative; }
.week-loading-card {
  position: absolute; inset: 0; overflow: hidden;
  background: var(--surface); border: 1px solid var(--border);
  border-radius: var(--radius); box-shadow: var(--shadow-sm);
}
.week-loading-brand { display: flex; align-items: center; gap: 9px; height: 48px; padding: 0 12px; border-bottom: 1px solid var(--border); }
.week-loading-flower { width: 22px; height: 22px; object-fit: contain; animation: startup-flower-spin 2.8s ease-in-out infinite; }
.week-loading-shimmer { display: block; border-radius: 6px; background: linear-gradient(100deg, var(--surface-2) 20%, var(--border-soft) 45%, var(--surface-2) 70%); background-size: 220% 100%; animation: startup-skeleton-shimmer 1.8s ease-in-out infinite; }
.week-loading-label { width: 100px; height: 10px; }
.week-loading-columns { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 8px; padding: 14px; }
.week-loading-columns span { height: 38px; opacity: 0.65; }
@keyframes startup-flower-spin { 0%, 15% { transform: rotate(0deg); } 75%, 100% { transform: rotate(360deg); } }
@keyframes startup-skeleton-shimmer { to { background-position: -220% 0; } }
@media (prefers-reduced-motion: reduce) {
  .startup-flower-spin, .startup-skeleton-shimmer { animation: none; }
}

/* ---------- toast ---------- */
.toast {
  position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%);
  background: var(--ink); color: var(--accent-contrast);
  padding: 9px 18px; border-radius: 999px; font-size: 12.5px;
  box-shadow: var(--shadow-md); z-index: 100;
  animation: toast-in 0.22s ease-out;
}
@keyframes toast-in { from { opacity: 0; transform: translate(-50%, 8px); } to { opacity: 1; transform: translate(-50%, 0); } }

.autoscroll-indicator {
  position: fixed; left: 50%; transform: translateX(-50%);
  background: var(--accent); color: var(--accent-contrast);
  padding: 6px 16px; border-radius: 999px; font-size: 11.5px; font-weight: 600;
  box-shadow: var(--shadow-md); z-index: 100; cursor: pointer;
  animation: toast-in 0.18s ease-out;
}
.autoscroll-indicator-up { top: 12px; }
.autoscroll-indicator-down { bottom: 12px; }
.autoscroll-indicator-snap { top: 12px; background: var(--focus); }

/* ---------- видимые "рельсы" у верхнего/нижнего края окна - чисто
   декоративная подсказка (клики/наведение их не видят). Настоящая цель -
   квадратик-стрелочка ниже: только его наведение/двойной клик запускают
   автопрокрутку - не вся кромка окна целиком (было неудобно: например,
   при переносе дела к крайнему дню недели случайно задевало). ---------- */
.scroll-rail {
  position: fixed; left: 0; right: 0; height: 14px; z-index: 40; pointer-events: none;
  opacity: 0.5;
}
.scroll-rail-top { top: 0; background: linear-gradient(to bottom, var(--border-soft), transparent); }
.scroll-rail-bottom { bottom: 0; background: linear-gradient(to top, var(--border-soft), transparent); }

.scroll-hover-square {
  position: fixed; left: 50%; transform: translateX(-50%); z-index: 41;
  width: 40px; height: 26px; border-radius: var(--radius-sm);
  background: var(--surface-3); border: 1px solid var(--border); box-shadow: var(--shadow-md);
  display: flex; align-items: center; justify-content: center; color: var(--ink-soft);
  cursor: pointer; padding: 0; animation: toast-in 0.15s ease-out;
  transition: color 0.15s ease, border-color 0.15s ease;
}
.scroll-hover-square:hover { color: var(--ink); border-color: var(--ink-faint); }
.scroll-hover-square-up { top: 4px; }
.scroll-hover-square-down { bottom: 4px; }

.space-scroll-lock, .space-scroll-lock * { cursor: ns-resize !important; }
.eyedropper-active .cell { cursor: crosshair !important; }

.notif-block { margin-top: 10px; padding-top: 8px; border-top: 1px solid var(--border-soft); display: flex; flex-direction: column; gap: 6px; }


/* ---------- header / sticky bar ---------- */
.planner-header {
  position: sticky; top: 0; z-index: 30;
  background: color-mix(in srgb, var(--bg) 92%, transparent);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  margin: 0 -20px; padding: 18px 20px 12px;
  box-shadow: 0 6px 16px -12px rgba(0, 0, 0, 0.28);
}

.titlebar { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
.titlebar-left { display: flex; align-items: center; gap: 9px; }
.select-wrap { position: relative; display: inline-flex; }
.year-select {
  font-family: var(--font-display); font-size: 17px; font-weight: 560;
  border: 1px solid var(--border); background: var(--surface);
  border-radius: var(--radius-sm); padding: 5px 8px; cursor: pointer;
}
.titlebar-actions { display: flex; align-items: center; justify-content: flex-end; gap: 8px; flex-wrap: wrap; }

/* ---------- buttons ---------- */
.btn {
  display: inline-flex; align-items: center; gap: 6px; position: relative;
  background: var(--surface); border: 1px solid var(--border);
  border-radius: var(--radius-sm); padding: 7px 13px;
  font-size: 12.5px; font-weight: 500; cursor: pointer;
  transition: background 0.15s ease, border-color 0.15s ease, transform 0.1s ease;
}
.btn:hover { border-color: var(--ink-faint); }
.btn:active { transform: translateY(1px); }
.btn:disabled { opacity: 0.45; cursor: default; transform: none; }
.btn-primary { background: var(--accent); border-color: var(--accent); color: var(--accent-contrast); font-weight: 600; }
.btn-primary:hover { background: color-mix(in srgb, var(--accent) 85%, black); border-color: color-mix(in srgb, var(--accent) 85%, black); }
.btn-ghost { background: var(--surface); }
.btn-danger { background: var(--danger); border-color: var(--danger); color: var(--accent-contrast); font-weight: 600; }
.btn-danger:hover { background: color-mix(in srgb, var(--danger) 86%, black); border-color: color-mix(in srgb, var(--danger) 86%, black); }
.btn-sm { padding: 5px 9px; font-size: 11.5px; }

.icon-btn {
  display: inline-flex; align-items: center; justify-content: center; position: relative;
  background: var(--surface); border: 1px solid var(--border);
  border-radius: var(--radius-sm); width: 30px; height: 30px;
  cursor: pointer; color: var(--ink); transition: border-color 0.15s ease, background 0.15s ease;
}
.icon-btn:hover { border-color: var(--ink-faint); }
.icon-btn-disabled { opacity: 0.4; cursor: default; }
.icon-btn-active { background: var(--ink); color: var(--accent-contrast); border-color: var(--ink); }
.icon-btn.tiny { width: 24px; height: 24px; border: none; background: none; color: var(--ink-faint); }
.icon-btn.subtle { border: none; background: none; color: var(--ink-faint); }
.icon-btn.subtle:hover { color: var(--danger); }
.icon-btn.icon-action-button {
  width: 32px; height: 32px; min-width: 32px; min-height: 32px;
  padding: 0; flex: 0 0 32px;
}
.icon-btn.icon-action-button svg { width: 16px; height: 16px; }
.modal-close-button, .dock-close-button {
  width: 36px; height: 36px; min-width: 36px; min-height: 36px;
  display: inline-flex; align-items: center; justify-content: center;
}
.modal-close-button { margin: -4px -6px -4px 4px; }
.dock-close-button { border-radius: var(--radius-sm); }

/* ---------- tracker panel ---------- */
.tracker-panel { margin-top: 12px; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 12px; }
.tracker-tabs { width: 100%; margin-bottom: 10px; }
.tracker-tabs .segmented-option { flex: 1; justify-content: center; }
.dashboard-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
.dashboard-body { display: flex; gap: 14px; align-items: flex-start; flex-wrap: wrap; }
.dashboard-list { flex: 1; min-width: 160px; display: flex; flex-direction: column; gap: 4px; }
.dashboard-row { display: flex; align-items: center; gap: 6px; font-size: 11.5px; cursor: pointer; }
.dashboard-row-off { opacity: 0.4; }
.dashboard-row-name { flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.dashboard-row-val { font-family: var(--font-mono); font-size: 10.5px; color: var(--ink-soft); white-space: nowrap; }
.dashboard-row-pct { font-family: var(--font-mono); font-size: 10px; color: var(--ink-faint); width: 30px; text-align: right; flex-shrink: 0; }
.dashboard-pie-wrap { display: flex; flex-direction: column; align-items: center; gap: 4px; flex-shrink: 0; }
.tracker-head { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; flex-wrap: wrap; }
.tracker-title { font-family: var(--font-display); font-size: 14px; }
.tracker-table-wrap { overflow-x: auto; }
.tracker-table { border-collapse: collapse; font-size: 11px; width: 100%; min-width: 620px; }
.tracker-table th, .tracker-table td { padding: 5px 7px; text-align: center; border-bottom: 1px solid var(--border-soft); }
.tracker-table th { color: var(--ink-faint); font-weight: 500; font-family: var(--font-mono); font-size: 10px; }
.tracker-cat-cell { display: flex; align-items: center; gap: 6px; text-align: left !important; font-weight: 600; white-space: nowrap; }
.tracker-dot { width: 9px; height: 9px; border-radius: 50%; flex-shrink: 0; }
.tracker-count { color: var(--ink-soft); position: relative; white-space: nowrap; }
.tracker-count-zero { color: var(--ink-faint); opacity: 0.4; }
.tracker-total { font-weight: 700; color: var(--ink); position: relative; white-space: nowrap; }
.tracker-moved-badge {
  display: inline-flex; align-items: center; justify-content: center;
  min-width: 13px; height: 13px; padding: 0 2px; margin-left: 3px;
  border-radius: 999px; background: var(--focus-soft); color: var(--focus);
  font-size: 8.5px; font-weight: 700; vertical-align: super;
}
.tracker-summary { display: flex; gap: 8px; margin-bottom: 10px; flex-wrap: wrap; }
.tracker-summary-card {
  display: flex; flex-direction: column; gap: 1px;
  background: var(--surface-2); border: 1px solid var(--border-soft);
  border-radius: var(--radius-sm); padding: 7px 12px; min-width: 92px;
}
.tracker-summary-num { font-family: var(--font-display); font-size: 19px; line-height: 1.1; }
.tracker-summary-label { font-size: 10.5px; color: var(--ink-faint); }

/* ---------- counter (интервал недель) panel ---------- */
.counter-actions { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
.counter-result { margin-top: 4px; }
.counter-range-modes { display: flex; flex-wrap: wrap; gap: 10px; margin: 8px 0; font-size: 11.5px; }
.counter-range-modes label, .counter-date-fields label { display: inline-flex; align-items: center; gap: 4px; }
.counter-date-fields { display: flex; gap: 8px; margin: 8px 0; }
.counter-date-fields input { min-width: 0; max-width: 145px; padding: 4px 6px; border: 1px solid var(--border); border-radius: var(--radius-sm); background: var(--surface); }
.counter-table { border-collapse: collapse; font-size: 11.5px; width: 100%; }
.counter-table th, .counter-table td { padding: 5px 7px; text-align: center; border-bottom: 1px solid var(--border-soft); }
.counter-table th { color: var(--ink-faint); font-weight: 500; font-family: var(--font-mono); font-size: 10px; }
.counter-num { font-weight: 600; }

/* ---------- templates panel ---------- */
.templates-body { display: flex; flex-direction: column; gap: 10px; }
.template-group-title { font-size: 11px; color: var(--ink-faint); text-transform: uppercase; letter-spacing: 0.02em; margin-top: 4px; }
.template-row { display: flex; align-items: center; gap: 8px; padding: 6px 0; border-bottom: 1px solid var(--border-soft); font-size: 12px; flex-wrap: wrap; }
.template-row-name { flex: 1; min-width: 100%; font-weight: 600; }
.template-mark-status {
  font-size: 11.5px; color: var(--ink-faint); background: var(--surface-2);
  border: 1px solid var(--border-soft); border-radius: var(--radius-sm); padding: 8px 10px; line-height: 1.4;
}
.template-range-form { display: flex; flex-direction: column; gap: 7px; padding: 9px; border: 1px solid var(--border); border-radius: 9px; background: var(--surface-2); }
.template-range-form .field-inline { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.template-range-form .input-pill, .template-range-form .time-input { max-width: 190px; }
.template-create-btn { align-self: flex-start; }

/* ---------- модальное окно (создание шаблона) ---------- */
.modal-backdrop {
  position: fixed; inset: 0; background: rgba(20, 22, 18, 0.42);
  display: flex; align-items: center; justify-content: center; z-index: 60; padding: 20px;
}
.modal-card {
  background: var(--surface-3); border-radius: var(--radius); box-shadow: var(--shadow-lg);
  width: 100%; max-width: 400px; max-height: 80vh; display: flex; flex-direction: column; overflow: hidden;
}
.modal-head {
  display: flex; align-items: center; justify-content: space-between;
  padding: 14px 16px; border-bottom: 1px solid var(--border); font-family: var(--font-display); font-size: 15px;
}
.modal-body { padding: 14px 16px; overflow-y: auto; display: flex; flex-direction: column; gap: 6px; }
.modal-actions { display: flex; justify-content: flex-end; gap: 8px; padding: 12px 16px; border-top: 1px solid var(--border); }
.field-label { font-size: 11px; color: var(--ink-faint); text-transform: uppercase; letter-spacing: 0.02em; margin-top: 6px; }
.clear-range-panel { display: flex; flex-direction: column; gap: 10px; }
.clear-range-panel > .dock-panel-title-row { align-items: center; }
.clear-range-mode-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 5px; }
.clear-range-mode-grid .segmented-option { justify-content: center; min-height: 32px; border: 1px solid var(--border); border-radius: var(--radius-sm); background: var(--surface); color: var(--ink-soft); font-size: 11.5px; cursor: pointer; }
.clear-range-mode-grid .segmented-option.active { background: var(--ink); border-color: var(--ink); color: var(--accent-contrast); }
.clear-range-period-fields { display: flex; gap: 10px; }
.clear-range-field { display: flex; flex: 1; min-width: 0; flex-direction: column; gap: 4px; }
.clear-range-custom-ranges { display: flex; flex-direction: column; gap: 8px; }
.clear-range-custom-row { display: flex; align-items: flex-end; gap: 6px; padding: 7px; border: 1px solid var(--border-soft); border-radius: var(--radius-sm); background: var(--surface); }
.clear-range-custom-row .time-input { width: 100%; min-width: 0; }
.clear-range-remove { flex: 0 0 28px; }
.clear-range-add { align-self: flex-start; }
.clear-range-summary { display: flex; align-items: flex-start; gap: 8px; padding: 9px; border: 1px solid var(--border); border-radius: var(--radius-sm); background: var(--surface); color: var(--ink); font-size: 12px; overflow-wrap: anywhere; }
.clear-range-summary svg { flex: 0 0 auto; color: var(--accent); }
.clear-range-warning { color: var(--ink-faint); font-size: 11px; line-height: 1.5; }
.clear-range-error { padding: 8px; border: 1px solid var(--danger); border-radius: var(--radius-sm); color: var(--danger); font-size: 11px; overflow-wrap: anywhere; }
.clear-range-apply { align-self: flex-start; }
.template-source-list { display: flex; flex-direction: column; gap: 4px; max-height: 180px; overflow-y: auto; margin-bottom: 4px; }
.template-source-option { display: flex; align-items: center; gap: 7px; font-size: 12.5px; cursor: pointer; padding: 3px 0; }
.modal-name-input { width: 100%; }

/* ---------- command palette (Ctrl+K) ---------- */
.command-palette { max-width: 460px; }
.command-palette-input-row { display: flex; align-items: center; gap: 8px; padding: 12px 14px; border-bottom: 1px solid var(--border); flex-shrink: 0; }
.command-palette-input { flex: 1; border: none; background: transparent; font-size: 14px; color: var(--ink); }
.command-palette-input:focus { outline: none; }
.command-palette-list { overflow-y: auto; max-height: 340px; padding: 6px; display: flex; flex-direction: column; gap: 1px; }
.command-palette-item {
  display: flex; align-items: center; justify-content: space-between; gap: 10px;
  padding: 8px 10px; border-radius: var(--radius-sm); border: none; background: transparent;
  font-size: 12.5px; color: var(--ink); text-align: left; cursor: pointer;
}
.command-palette-item.active { background: var(--accent-soft); }
.command-palette-hotkey {
  font-family: var(--font-mono); font-size: 10.5px; color: var(--ink-faint);
  background: var(--surface-2); border: 1px solid var(--border-soft); border-radius: 4px; padding: 1px 6px; flex-shrink: 0;
}

/* ---------- toolbar body ---------- */
.toolbar-body { margin-top: 14px; display: flex; flex-direction: column; gap: 12px; }
.mode-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }

.segmented { display: inline-flex; background: var(--surface-2); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 3px; gap: 2px; }
.segmented-option {
  display: flex; align-items: center; gap: 5px; position: relative;
  background: transparent; border: none; border-radius: 5px;
  padding: 6px 11px; font-size: 12px; font-weight: 500; color: var(--ink-soft);
  cursor: pointer; transition: background 0.15s ease, color 0.15s ease;
}
.segmented-option.active { background: var(--ink); color: var(--accent-contrast); }
.segmented-option:not(.active):hover { color: var(--ink); }

.manual-color { width: 30px; height: 30px; padding: 0; border: 1px solid var(--border); border-radius: var(--radius-sm); background: none; cursor: pointer; }
.active-paint-chip {
  display: inline-flex; align-items: center; gap: 6px; padding: 4px 6px 4px 8px;
  background: var(--surface-2); border: 1px solid var(--border); border-radius: var(--radius-sm); font-size: 12px;
}
.active-paint-swatch { width: 13px; height: 13px; border-radius: 50%; flex-shrink: 0; }
.active-paint-label { max-width: 160px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mode-hint { font-size: 11.5px; color: var(--ink-faint); }
.select-actions { display: flex; align-items: center; gap: 6px; }
.zoom-group { display: flex; align-items: center; gap: 4px; }
.zoom-label { font-family: var(--font-mono); font-size: 11px; color: var(--ink-faint); min-width: 34px; text-align: center; }

/* ---------- panels hosted inside the tool dock ---------- */
.dock-panel-title-row {
  display: flex; align-items: baseline; gap: 6px; flex-wrap: wrap;
  font-family: var(--font-display); font-size: 14px; padding: 2px 0 8px;
}
.category-toggle-active { font-family: var(--font-body); font-size: 11px; color: var(--ink-faint); font-weight: 400; }
.dock-category-body { display: flex; flex-direction: column; overflow: hidden; min-height: 0; }
.category-panel { display: flex; flex: 1 1 auto; flex-direction: column; min-height: 0; }
.category-body { flex: 1 1 auto; min-height: 0; max-height: none; overflow-y: auto; display: flex; flex-direction: column; gap: 9px; padding-right: 2px; }
.category-row { padding-bottom: 9px; border-bottom: 1px solid var(--border-soft); }
.category-row-main { display: flex; align-items: center; gap: 7px; }

.color-dot { width: 20px; height: 20px; padding: 0; border: none; background: none; cursor: pointer; border-radius: 50%; overflow: hidden; flex-shrink: 0; }
.color-dot::-webkit-color-swatch-wrapper { padding: 0; }
.color-dot::-webkit-color-swatch { border: 2px solid var(--surface); border-radius: 50%; }

.chip {
  border-radius: 6px; padding: 4px 11px; font-size: 12px; cursor: pointer;
  background: transparent; transition: background 0.15s ease;
  border: 1px solid var(--chip-color, var(--border));
  color: var(--ink);
}
.chip.chip-active { background: color-mix(in srgb, var(--chip-color, var(--ink)) 18%, transparent); font-weight: 600; }
.ml-auto { margin-left: auto; }

.subpick-panel { background: var(--surface-2); border: 1px solid var(--border-soft); border-radius: var(--radius-sm); padding: 8px 10px; display: flex; flex-direction: column; gap: 6px; }
.subpick-title { font-size: 10.5px; color: var(--ink-faint); }
.sub-list { display: flex; flex-direction: column; gap: 4px; }
.sub-item-row { display: flex; align-items: center; gap: 4px; }
.sub-chip {
  border-radius: 5px; padding: 3px 8px; font-size: 11px; cursor: pointer;
  background: transparent; border: 1px solid color-mix(in srgb, var(--chip-color, var(--border)) 60%, transparent);
  transition: background 0.15s ease;
}
.sub-chip.sub-chip-active { background: color-mix(in srgb, var(--chip-color, var(--ink)) 18%, transparent); font-weight: 600; }
.sub-desc-has { color: var(--accent); border-color: color-mix(in srgb, var(--accent) 50%, var(--border)); }
.sub-desc-textarea {
  width: 100%; font-size: 11.5px; font-family: inherit; color: var(--ink);
  border: 1px solid var(--border-soft); border-radius: var(--radius-sm); background: var(--surface);
  padding: 6px 8px; resize: vertical; margin-top: 3px; line-height: 1.4;
}

.input-inline { font-size: 11px; border: 1px solid var(--border-soft); border-radius: 5px; padding: 3px 7px; width: 118px; background: transparent; align-self: flex-start; }
.category-add-row { display: flex; flex: 0 0 auto; gap: 6px; margin-top: 2px; padding-top: 8px; align-items: center; }
.input-pill { flex: 1; font-size: 12px; border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 6px 10px; background: var(--surface); }

/* ---------- time settings ---------- */
.settings-row { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; font-size: 12px; color: var(--ink-soft); }
.settings-col { display: flex; flex-direction: column; gap: 10px; font-size: 12px; color: var(--ink-soft); }
.settings-icon { color: var(--ink-faint); }
.field-inline { display: flex; align-items: center; gap: 5px; }
.time-input { border: 1px solid var(--border); border-radius: 5px; padding: 4px 6px; font-size: 12px; background: var(--surface); font-family: var(--font-mono); }
.dock-io-row { display: flex; gap: 6px; flex-wrap: wrap; }

/* ---------- search / date jump / import-export ---------- */
.search-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.search-icon { color: var(--ink-faint); flex-shrink: 0; }
.search-input { flex: 0 1 260px; border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 7px 10px; font-size: 12.5px; background: var(--surface); }
.date-jump-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.spacer { flex: 1; }
.hint-text { font-size: 11.5px; color: var(--ink-faint); }
.pad-sm { padding: 4px 2px; }
.micro-hint { font-size: 10.5px; color: var(--ink-faint); opacity: 0.85; }

.search-results { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 6px; max-height: 190px; overflow-y: auto; }
.search-result-item {
  display: flex; justify-content: space-between; gap: 10px;
  padding: 6px 8px; font-size: 12px; cursor: pointer; border-radius: 5px;
  transition: background 0.15s ease;
}
.search-result-item:hover { background: var(--surface-2); }

/* ---------- agenda (день) ---------- */
.agenda-nav { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 8px; }
.agenda-nav-mid { display: flex; flex-direction: column; align-items: center; gap: 3px; flex: 1; text-align: center; }
.agenda-date-label { font-family: var(--font-display); font-size: 14.5px; text-transform: capitalize; }
.agenda-date-today { color: var(--accent); }
.agenda-today-btn { padding: 2px 9px; }
.agenda-date-pick { display: flex; align-items: center; gap: 6px; margin-bottom: 10px; }
.agenda-date-pick input { flex: 1; }
.agenda-list { display: flex; flex-direction: column; gap: 6px; max-height: 50vh; overflow-y: auto; }
.agenda-item-wrap { display: flex; flex-direction: column; gap: 4px; }
.agenda-item { display: flex; align-items: center; gap: 8px; }
.agenda-item-desc {
  margin-left: 54px; font-size: 11.5px; color: var(--ink-soft); line-height: 1.45;
  background: var(--surface-2); border: 1px solid var(--border-soft); border-radius: var(--radius-sm);
  padding: 7px 9px; white-space: pre-wrap;
}
.agenda-item-time {
  font-family: var(--font-mono); font-size: 10.5px; color: var(--ink-faint);
  display: flex; flex-direction: column; align-items: flex-end; line-height: 1.3; width: 46px; flex-shrink: 0;
}
.agenda-item-time-sep { display: none; }
.agenda-done-check {
  width: 17px; height: 17px; border-radius: 5px; border: 1.5px solid var(--border);
  background: var(--surface); cursor: pointer; display: flex; align-items: center; justify-content: center;
  flex-shrink: 0; padding: 0; color: #fff;
}
.agenda-done-check.done { background: var(--good); border-color: var(--good); }
.agenda-done-check-hidden { visibility: hidden; }
.agenda-item-body {
  flex: 1; display: flex; align-items: flex-start; gap: 8px; text-align: left;
  background: var(--surface); border: 1px solid var(--border-soft); border-radius: var(--radius-sm);
  padding: 7px 9px; cursor: pointer; transition: border-color 0.15s ease;
  min-width: 0;
}
.agenda-item-body:hover { border-color: var(--ink-faint); }
.agenda-item-dot { width: 9px; height: 9px; border-radius: 50%; margin-top: 3px; flex-shrink: 0; }
.agenda-item-text { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
.agenda-item-label { font-size: 12.5px; font-weight: 600; overflow-wrap: break-word; }
.agenda-item-task { font-size: 11px; color: var(--ink-soft); overflow-wrap: break-word; }

/* ---------- recurring events ---------- */
.recurring-list { display: flex; flex-direction: column; gap: 4px; margin-bottom: 10px; }
.recurring-row { display: flex; align-items: center; gap: 8px; padding: 6px 2px; border-bottom: 1px solid var(--border-soft); }
.recurring-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
.recurring-row-main { display: flex; flex-direction: column; gap: 1px; flex: 1; min-width: 0; }
.recurring-row-name { font-size: 12.5px; font-weight: 600; }
.recurring-form { display: flex; flex-direction: column; gap: 5px; margin-top: 4px; padding-top: 8px; border-top: 1px solid var(--border-soft); }
.recurring-form-row { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.recurring-duration { width: 64px; }
.recurring-form-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 6px; }

/* ---------- template apply-mode selector ---------- */
.apply-mode-group { display: flex; flex-direction: column; gap: 4px; margin-bottom: 8px; }
.apply-mode-btn {
  text-align: left; font-size: 11.5px; padding: 6px 9px; border-radius: var(--radius-sm);
  border: 1px solid var(--border); background: var(--surface); cursor: pointer; color: var(--ink-soft);
  transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease;
}
.apply-mode-btn:hover { border-color: var(--ink-faint); }
.apply-mode-btn.active { background: var(--ink); color: var(--accent-contrast); border-color: var(--ink); font-weight: 600; }

/* ---------- week tiles (fast marking view for templates) ---------- */
.week-tiles-grid { grid-template-columns: repeat(auto-fill, minmax(110px, 1fr)); }
.week-tile {
  display: flex; align-items: stretch; gap: 0;
  background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius);
  overflow: hidden; box-shadow: var(--shadow-sm);
}
.week-tile-marked { box-shadow: 0 0 0 2px var(--accent); }
.week-tile-selected { box-shadow: 0 0 0 2px var(--danger); }
.week-tile-current { border-color: var(--accent); }
.week-tile-main {
  flex: 1; display: flex; flex-direction: column; align-items: flex-start; gap: 2px;
  padding: 10px 10px; cursor: pointer; text-align: left; position: relative; min-width: 0;
}
.week-tile-check { position: absolute; top: 6px; right: 6px; color: var(--accent); }
.week-tile-number-input {
  font-family: var(--font-display); font-size: 20px; line-height: 1.1; width: 100%;
  border: none; background: transparent; color: var(--ink); padding: 0;
}
.week-tile-number-input:focus { outline: none; text-decoration: underline; text-decoration-color: var(--accent); }
.week-tile-number-input::placeholder { color: var(--ink-faint); }
.week-tile-range { font-size: 10px; color: var(--ink-faint); font-family: var(--font-mono); }
.week-tile-open {
  width: 24px; flex-shrink: 0; border: none; border-left: 1px solid var(--border-soft);
  background: var(--surface-2); color: var(--ink-faint); cursor: pointer;
  display: flex; align-items: center; justify-content: center; transition: color 0.15s ease;
}
.week-tile-open:hover { color: var(--ink); }

/* ---------- glossary / hotkeys panel ---------- */
.shortcut-list { display: flex; flex-direction: column; gap: 3px; margin-bottom: 4px; }
.shortcut-row { display: flex; align-items: baseline; gap: 8px; font-size: 12px; }
.shortcut-keys {
  font-family: var(--font-mono); font-size: 10.5px; color: var(--ink);
  background: var(--surface-2); border: 1px solid var(--border-soft); border-radius: 4px;
  padding: 1px 6px; white-space: nowrap; flex-shrink: 0; min-width: 64px; text-align: center;
}
.shortcut-desc { color: var(--ink-soft); }
.glossary-list { display: flex; flex-direction: column; gap: 8px; max-height: 44vh; overflow-y: auto; padding-right: 2px; }
.glossary-row { display: flex; flex-direction: column; gap: 1px; padding-bottom: 7px; border-bottom: 1px solid var(--border-soft); }
.glossary-term { font-size: 12.5px; font-weight: 600; }
.glossary-def { font-size: 11.5px; color: var(--ink-soft); line-height: 1.4; }

/* ---------- todo (дела без времени) ---------- */
.todo-add-row { display: flex; gap: 6px; margin-bottom: 8px; }
.todo-add-row .input-pill { flex: 1; }
.todo-list { display: flex; flex-direction: column; gap: 4px; }
.todo-row { display: flex; align-items: center; gap: 6px; padding: 4px 2px; }
.todo-row-draggable { cursor: grab; user-select: none; -webkit-user-select: none; touch-action: none; }
.todo-row-dragging { opacity: 0.45; }
.todo-row-dragging, .todo-row-dragging * { cursor: grabbing !important; }
.todo-schedule-btn { color: var(--accent) !important; }
.todo-schedule-btn.active { color: var(--good) !important; background: var(--accent-soft) !important; }
.todo-schedule-hint { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 6px 8px; margin-bottom: 6px; border: 1px solid var(--accent); border-radius: var(--radius-sm); font-size: 11px; }
.todo-schedule-cancel { flex-shrink: 0; color: var(--ink-soft) !important; }
.todo-drag-handle { color: var(--ink-faint); flex-shrink: 0; }
.cell.cell-todo-drop-target { box-shadow: inset 0 0 0 2px var(--good); background: var(--accent-soft); }
.todo-drag-ghost {
  position: fixed; z-index: 9999; pointer-events: none; transform: translate(10px, 10px);
  max-width: 240px; padding: 6px 10px; border: 1px solid var(--good);
  border-radius: var(--radius-sm); background: var(--surface-3); color: var(--ink);
  box-shadow: var(--shadow-md); font-size: 12px; opacity: 0.92;
}
.todo-row-done { opacity: 0.55; }
.todo-row-done .todo-text { text-decoration: line-through; }
.todo-check {
  width: 17px; height: 17px; border-radius: 5px; border: 1.5px solid var(--border);
  background: var(--surface); cursor: pointer; display: flex; align-items: center; justify-content: center;
  flex-shrink: 0; padding: 0; color: #fff;
}
.todo-check.done { background: var(--good); border-color: var(--good); }
.todo-check { width: 24px; height: 24px; min-width: 24px; min-height: 24px; }
.todo-check svg { width: 14px; height: 14px; }
.todo-priority-btn { flex: 0 0 32px; }
.todo-text { flex: 1; font-size: 12.5px; overflow-wrap: break-word; }

/* ---------- all-day / multi-day события (полоса над сеткой недели) ---------- */
.week-allday-row { display: flex; padding: 4px 0 0; }
.allday-gutter { width: 46px; flex-shrink: 0; }
.allday-track { flex: 1; display: grid; grid-template-columns: repeat(7, minmax(76px, 1fr)); gap: 2px; }
.allday-chip {
  border: 1px solid; border-radius: 4px; padding: 1px 7px; font-size: 10.5px;
  display: flex; align-items: center; gap: 5px; cursor: pointer; overflow: hidden;
  text-align: left; height: 18px;
}
.allday-chip-dot { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; }
.allday-chip-text { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

/* ---------- agenda: блок "весь день / несколько дней" ---------- */
.agenda-allday-block { margin-bottom: 10px; padding-bottom: 8px; border-bottom: 1px solid var(--border-soft); }
.agenda-allday-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px; }
.agenda-allday-list { display: flex; flex-direction: column; gap: 3px; }
.agenda-allday-row { display: flex; align-items: center; gap: 7px; font-size: 12px; }
.agenda-allday-text { flex: 1; overflow-wrap: break-word; }
.agenda-allday-form { display: flex; flex-direction: column; gap: 5px; margin-top: 4px; }
.agenda-copy-row { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }





/* ---------- weeks list ---------- */
/* Плитки-недели: сетка, которая сама решает, сколько недель влезает в
   ряд, исходя из --week-min-width (зависит от зума). Уменьшили зум -
   плитки уже - в ряд помещается больше недель, как в галерее. */
.weeks-list {
  margin-top: 18px;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(var(--week-min-width, 600px), 1fr));
  gap: 16px;
  align-items: start;
}
.weeks-list.week-fullscreen-active > :not(.week-fullscreen-wrapper) { display: none; }
.week-fullscreen-wrapper {
  position: fixed; inset: 0; z-index: 25; overflow: auto;
  padding: 150px 20px 12px; background: var(--bg);
}

.month-divider {
  grid-column: 1 / -1;
  font-family: var(--font-display); font-size: 15.5px; color: var(--ink-soft);
  text-transform: capitalize; padding: 10px 2px 0; margin-top: 6px;
  border-top: 1px solid var(--border-soft);
}
.month-divider:first-child { border-top: none; margin-top: 0; padding-top: 0; }

/* ---------- плитки месяцев / годов (крайний зум) ---------- */
.tiles-grid {
  margin-top: 18px; display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 12px;
}
.view-tile {
  display: flex; flex-direction: column; align-items: flex-start; gap: 6px;
  background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius);
  padding: 16px 14px; cursor: pointer; text-align: left; box-shadow: var(--shadow-sm);
  transition: border-color 0.15s ease, transform 0.1s ease;
}
.view-tile:hover { border-color: var(--ink-faint); }
.view-tile:active { transform: translateY(1px); }
.view-tile-current { border-color: var(--accent); box-shadow: 0 0 0 1px var(--accent); }
.view-tile-name { font-family: var(--font-display); font-size: 18px; text-transform: capitalize; }
.view-tile-stats { font-size: 11px; color: var(--ink-faint); font-family: var(--font-mono); }
.view-tile-stats-empty { opacity: 0.55; }

.week-lazy-wrapper { scroll-margin-top: 104px; }
.week-card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); overflow: hidden; box-shadow: var(--shadow-sm); }
.week-card-header { padding: 9px 13px; border-bottom: 1px solid var(--border); display: flex; align-items: baseline; gap: 9px; flex-wrap: wrap; }
.week-card-marked { box-shadow: 0 0 0 2px var(--accent); }
.week-card-fullscreen { height: 100%; display: flex; flex-direction: column; }
.week-card-fullscreen .week-grid-scroll { flex: 1 1 auto; min-height: 0; max-height: none !important; }
.week-fullscreen-btn { order: -1; }
.mark-checkbox { display: inline-flex; align-items: center; cursor: pointer; accent-color: var(--accent); }
.mark-checkbox input { cursor: pointer; width: 13px; height: 13px; }
.mark-checkbox.day-mark { display: block; margin: 0 auto 3px; }
.day-head-marked { background: var(--focus-soft); }
.week-label { font-family: var(--font-display); font-size: 14.5px; }
.week-range { font-size: 11.5px; color: var(--ink-faint); font-family: var(--font-mono); }
.week-time-controls {
  display: flex; align-items: center; flex-wrap: wrap; gap: 8px;
  padding: 6px 12px; border-bottom: 1px solid var(--border-soft);
  background: var(--surface-2);
}
.week-time-toggle {
  width: auto; min-width: 40px; padding: 0 7px; gap: 4px;
}
.week-time-toggle-open { transform: rotate(180deg); }
.week-time-control { display: inline-flex; align-items: center; gap: 5px; color: var(--ink-soft); font-size: 10.5px; }
.week-time-control .time-input { min-width: 84px; padding: 3px 5px; font-size: 11px; }
.week-quantum-select { min-width: 114px; }
.week-time-reset { margin-left: auto; }
.week-badge-current { display: inline-flex; align-items: center; gap: 5px; font-size: 10.5px; color: var(--accent); font-weight: 600; }
.watch-indicator { display: inline-block; flex: 0 0 auto; width: 7px; height: 7px; margin: 0 2px; border-radius: 50%; background: var(--watch-color); box-shadow: 0 0 0 2px color-mix(in srgb, var(--watch-color) 20%, transparent); vertical-align: middle; }
.seal-dot { width: 7px; height: 7px; border-radius: 50%; background: radial-gradient(circle at 32% 30%, var(--accent-contrast), var(--accent)); box-shadow: 0 0 0 3px var(--accent-soft); animation: pulse 2.4s ease-in-out infinite; }
@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.55; } }
.week-clear-btn { margin-left: auto; }

/* Один общий скролл-контейнер на всю карточку недели (и по горизонтали,
   и по вертикали) - раньше здесь было два вложенных overflow:auto блока
   (шапка отдельно, строки отдельно), из-за чего появлялась вторая, лишняя
   горизонтальная полоса прокрутки, и заголовки дней съезжали относительно
   столбцов при прокрутке. Теперь шапка "прилипает" сверху (position:
   sticky) внутри ЭТОГО ЖЕ контейнера - прокрутка всегда одна на оба
   направления, и заголовки гарантированно остаются над своими колонками. */
.week-grid-scroll { overflow: auto; position: relative; }
.week-grid-head { display: grid; border-bottom: 1px solid var(--border); position: sticky; top: 0; z-index: 4; background: var(--surface); }
.head-gutter { position: sticky; left: 0; background: var(--surface); z-index: 5; }
.day-head { position: relative; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px; text-align: center; padding: 4px 2px; border-left: 1px solid var(--border-soft); font-size: 11px; background: var(--surface); transition: background 0.3s ease, color 0.3s ease; }
.day-head-container { width: 100%; min-width: 0; }
.day-head-label { white-space: nowrap; line-height: 1.25; font-size: 10px; }
.day-head-reflection-trigger {
  display: inline-flex; align-items: center; justify-content: center; gap: 3px;
  width: 100%; min-width: 0; min-height: 24px; padding: 0 1px;
  border: 0; border-radius: var(--radius-sm); background: transparent;
  color: inherit; cursor: pointer; white-space: nowrap;
}
.day-head-reflection-trigger svg { flex: 0 0 14px; color: var(--ink-faint); }
.day-head-reflection-trigger:hover { background: var(--surface-2); color: var(--accent); }
.day-head-reflection-trigger:hover svg,
.day-head-reflection-trigger:focus-visible svg { color: var(--accent); }
.day-head-reflection-trigger:focus-visible { outline: 2px solid var(--focus); outline-offset: -1px; }
.day-head-today { color: var(--accent); font-weight: 600; }
.day-head-date { font-family: var(--font-mono); color: var(--ink-faint); }
.day-head-today .day-head-date { color: var(--accent); opacity: 0.75; }
.day-head-jumped { background: var(--focus-soft); color: var(--focus); font-weight: 700; }

.week-grid { display: grid; align-items: stretch; }
.row-time {
  font-size: var(--cell-fs, 10px); color: var(--ink-faint); text-align: right; padding: 2px 5px;
  font-family: var(--font-mono); border-bottom: 1px solid var(--border-soft);
  display: flex; align-items: center; justify-content: flex-end;
  position: sticky; left: 0; background: var(--surface); z-index: 2;
}

.cell {
  border-bottom: 1px solid var(--border-soft); border-left: 1px solid var(--border-soft);
  min-height: var(--cell-h, 24px); height: auto; transition: box-shadow 0.1s ease;
  position: relative;
}
.cell.cell-selected { box-shadow: inset 0 0 0 2px var(--ink); }
.cell.cell-highlighted { box-shadow: inset 0 0 0 2px var(--accent); }
.cell.cell-drag-over { box-shadow: inset 0 0 0 2px var(--good); background: var(--accent-soft); }
.cell-input {
  width: 100%; height: 100%; border: none; outline: none; background: transparent;
  font-size: var(--cell-fs, 11px); padding: 0 5px; color: var(--ink); font-family: inherit; min-height: var(--cell-h, 24px);
}
.cell-split { display: flex; flex-direction: column; height: 100%; min-height: var(--cell-h, 24px); }
.cell-input-top { flex: 1 1 auto; font-weight: 600; min-height: 22px; }
.cell-subselect {
  flex: 1 1 auto; border: none; background: transparent; font-size: 10.5px;
  padding: 0 18px 0 5px; cursor: pointer; color: var(--ink-soft); min-height: 22px;
  width: 100%; appearance: auto;
}
.cell-input-task {
  flex: 1 1 auto; font-size: 10px; color: var(--ink-soft);
  border-top: 1px dashed var(--border-soft); min-height: 18px;
}
.cell-corner-btns { position: absolute; top: 2px; right: 2px; z-index: 3; display: flex; gap: 2px; }
.cell-done-check {
  width: 24px; height: 24px; min-width: 24px; min-height: 24px;
  border-radius: 4px; border: 1.5px solid color-mix(in srgb, var(--border) 55%, transparent);
  background: color-mix(in srgb, var(--surface-2) 58%, transparent);
  cursor: pointer; display: flex; align-items: center; justify-content: center;
  padding: 0; color: var(--ink-soft); opacity: 0.8;
}
.cell-done-check.done { background: var(--good); border-color: var(--good); color: #fff; }
.cell-desc-btn {
  width: 24px; height: 24px; min-width: 24px; min-height: 24px; border-radius: 4px; border: 1.5px solid var(--border);
  background: color-mix(in srgb, var(--surface-2) 58%, transparent); color: var(--ink-soft);
  cursor: pointer; display: flex; align-items: center; justify-content: center; padding: 0;
  opacity: 0.8; transition: border-color 0.15s ease, color 0.15s ease, background 0.15s ease, opacity 0.15s ease;
}
.cell-done-check svg, .cell-desc-btn svg { width: 12px; height: 12px; }
.cell-done-check:hover, .cell-desc-btn:hover, .cell-desc-btn.has-desc { color: var(--accent); border-color: color-mix(in srgb, var(--accent) 50%, var(--border)); background: var(--surface); }
.cell-done-check:hover, .cell-desc-btn:hover { opacity: 1; }
.cell-desc-popover {
  position: absolute; top: 100%; left: 0; margin-top: 2px; width: max(100%, 160px); z-index: 20;
  background: var(--surface-3); border: 1px solid var(--border); border-radius: var(--radius-sm);
  box-shadow: var(--shadow-lg); padding: 6px; display: flex; flex-direction: column; gap: 5px;
}
.cell-desc-popover textarea {
  font-size: 11px; font-family: inherit; color: var(--ink); resize: vertical;
  border: 1px solid var(--border-soft); border-radius: 5px; padding: 5px 6px; background: var(--surface);
}
.cell-sub-desc-popover { font-size: 11px; line-height: 1.4; white-space: pre-wrap; }
.cell-sub-desc-popover strong { font-size: 11.5px; }
.hover-desc-tooltip {
  position: fixed; transform: translate(-50%, calc(-100% - 8px)); z-index: 90;
  max-width: 240px; background: var(--surface-3); color: var(--ink); border: 1px solid var(--border);
  border-radius: var(--radius-sm); box-shadow: var(--shadow-lg); padding: 8px 10px;
  font-size: 11.5px; line-height: 1.4; white-space: pre-wrap; pointer-events: none;
}

@media (prefers-reduced-motion: reduce) {
  .planner-root * { animation: none !important; transition: none !important; }
}

/* ---------- side tool dock (Photoshop-style: hidden, slides in from the
   right edge on hover; stays open once you pick a panel, until closed) ---------- */
.dock-hover-zone {
  position: fixed; top: 0; right: 0; width: 14px; height: 100vh; z-index: 39;
}
.tool-dock {
  position: fixed; top: 12vh; right: 0; height: 76vh; max-height: 640px;
  display: flex; align-items: flex-start; z-index: 40;
  transform: translateX(calc(100% - 8px));
  transition: transform 0.18s ease;
}
.tool-dock.tool-dock-visible { transform: translateX(0); }
.dock-rail {
  order: 2; display: flex; flex-direction: column; align-items: center; gap: 6px;
  background: var(--surface); border: 1px solid var(--border); border-right: none;
  border-radius: var(--radius) 0 0 var(--radius); padding: 10px 7px; box-shadow: var(--shadow-md);
  height: 100%;
}
.dock-rail-btn {
  display: flex; align-items: center; justify-content: center; position: relative;
  width: 32px; height: 32px; border-radius: var(--radius-sm);
  background: none; border: 1px solid transparent; color: var(--ink-soft); cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease, border-color 0.15s ease;
}
.dock-rail-btn:hover { border-color: var(--border); color: var(--ink); }
.dock-rail-btn.active { background: var(--ink); color: var(--accent-contrast); }
.dock-rail-peek { margin-top: auto; color: var(--ink-faint); opacity: 0.6; padding-top: 6px; }

/* ---------- KeyTips (Alt) - подсказки-бейджи с буквой/цифрой хоткея ---------- */
.keytip-badge {
  position: absolute; top: -6px; left: -6px; z-index: 5;
  background: var(--accent); color: var(--accent-contrast);
  font-family: var(--font-mono); font-size: 9px; font-weight: 700; line-height: 1;
  min-width: 14px; height: 14px; padding: 0 3px; border-radius: 4px;
  display: flex; align-items: center; justify-content: center; white-space: nowrap;
  box-shadow: var(--shadow-sm); pointer-events: none;
  animation: toast-in 0.1s ease-out;
}
.dock-flyout {
  order: 1; width: 360px; max-width: 82vw; height: 100%;
  background: var(--surface-3); border: 1px solid var(--border); border-right: none;
  box-shadow: var(--shadow-lg); display: flex; flex-direction: column; overflow: hidden;
}
.dock-flyout-head {
  display: flex; align-items: center; justify-content: space-between;
  padding: 8px 10px; border-bottom: 1px solid var(--border-soft); flex-shrink: 0;
}
.dock-flyout-body { padding: 10px 12px 14px; overflow-y: auto; flex: 1 1 auto; }
.planscript-panel { display: flex; flex-direction: column; gap: 8px; min-width: 0; }
.planscript-library { display: flex; flex-wrap: wrap; gap: 5px; max-height: 100px; overflow-y: auto; padding: 1px 2px 3px 1px; }
.planscript-mode-tabs { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 5px; margin: 0 0 4px; }
.planscript-mode-tabs button {
  min-width: 0; min-height: 32px; border: 1px solid var(--border); border-radius: var(--radius-sm);
  padding: 5px 4px; background: var(--surface-2); color: var(--ink-soft);
  font-size: 10.5px; line-height: 1.2; cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease, border-color 0.15s ease;
}
.planscript-mode-tabs button:hover { border-color: var(--ink-faint); color: var(--ink); }
.planscript-mode-tabs button.active { background: var(--accent-soft); color: var(--accent); border-color: var(--accent); font-weight: 600; }
.planscript-watchers { display: flex; flex-direction: column; gap: 7px; }
.planscript-watcher-item { display: flex; align-items: center; gap: 5px; border: 1px solid var(--border); border-radius: 999px; padding: 2px 6px; background: var(--surface); }
.planscript-watcher-item.active { border-color: var(--accent); background: var(--accent-soft); }
.planscript-watcher-item > button { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; border: 0; padding: 3px 2px; background: transparent; color: var(--ink-soft); font-size: 11px; cursor: pointer; text-align: left; }
.planscript-watcher-item > button:hover { color: var(--ink); }
.planscript-watcher-item label { display: flex; align-items: center; }
.planscript-watcher-item input { width: 12px; height: 12px; accent-color: var(--accent); }
.planscript-terminal { display: flex; flex-direction: column; align-items: stretch; gap: 8px; }
.planscript-library-item {
  max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  border: 1px solid var(--border); background: var(--surface); color: var(--ink-soft);
  border-radius: var(--radius-sm); padding: 5px 8px; cursor: pointer; font-size: 11px;
}
.planscript-library-item.active { border-color: var(--accent); color: var(--ink); background: var(--accent-soft); }
.planscript-library-item:hover { border-color: var(--ink-faint); color: var(--ink); }
.planscript-editor {
  display: block; width: 100%; min-width: 0; min-height: 190px; max-height: 42vh; resize: vertical; box-sizing: border-box;
  padding: 10px; border: 1px solid var(--border); border-radius: var(--radius-sm);
  background: var(--surface); color: var(--ink); font: 12px/1.5 var(--font-mono);
  tab-size: 4; outline: none;
}
.planscript-editor:focus { border-color: var(--accent); box-shadow: 0 0 0 2px var(--accent-soft); }
.planscript-actions { display: flex; align-items: center; gap: 6px; }
.planscript-actions > .btn-primary { margin-left: auto; }
.planscript-error { padding: 8px; border: 1px solid var(--danger); border-radius: 6px; color: var(--danger); font-size: 11px; }
.planscript-preview { display: flex; flex-direction: column; gap: 8px; padding: 9px; border: 1px solid var(--accent); border-radius: 8px; background: var(--surface); }
.planscript-preview-head, .planscript-preview-stats { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.planscript-preview-stats { font-size: 11px; color: var(--ink-soft); }
.planscript-log { margin: 0; white-space: pre-wrap; font: 11px/1.45 var(--font-mono); color: var(--ink-soft); max-height: 110px; overflow: auto; }

@media (max-width: 640px) {
  .clear-range-period-fields { flex-direction: column; }
  .clear-range-custom-row { flex-wrap: wrap; }
  .clear-range-custom-row .clear-range-field { flex-basis: calc(50% - 12px); }
  .titlebar-actions { width: 100%; justify-content: flex-start; }
  .planner-root { padding: 0 12px 32px; }
  .planner-header { margin: 0 -12px; padding: 14px 12px 10px; }
  .year-select { font-size: 15px; }
  .weeks-list { grid-template-columns: 1fr; }
  .dock-flyout { width: min(88vw, 360px); }
  .tool-dock { top: auto; bottom: 0; height: 80vh; }
}
`;

export function GlobalStyles() { return <style>{STYLE_SHEET}</style>; }
