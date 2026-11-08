export const WEEKDAYS_SHORT = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
export const MONTHS_GEN = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];
export const MONTHS_NOM = ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"];
export const MONTHS_SHORT = ["Янв", "Фев", "Мар", "Апр", "Май", "Июн", "Июл", "Авг", "Сен", "Окт", "Ноя", "Дек"];
export const DEFAULT_COLORS = ["#3B5AA6", "#2E7D74", "#946BA6", "#B8834A", "#A63B45", "#5B7A5A", "#8A5C3E", "#5C6B60"];
export const ZOOM_LEVELS = [0.75, 0.9, 1, 1.15, 1.35];
export const VIEW_ZOOM_STEPS = ["years", "months", "weekTiles", ...ZOOM_LEVELS];

export const BASE_UNIT = 5;

export const DEFAULT_CATEGORIES = [
  { id: "c1", name: "Спорт", color: "#2E7D74", subs: [] },
  { id: "c2", name: "Диплом", color: "#B8834A", subs: [] },
  { id: "c3", name: "Гитара", color: "#946BA6", subs: [] },
  { id: "c4", name: "Английский", color: "#3B5AA6", subs: [] },
  { id: "c5", name: "Учеба ЭБ", color: "#1F4741", subs: [{ id: "s1", name: "Управление персоналом" }, { id: "s2", name: "Налоговое планирование" }] },
  { id: "c6", name: "School21", color: "#A63B45", subs: [] },
  { id: "c7", name: "Отдых", color: "#8A8272", subs: [] },
  { id: "c8", name: "Работа", color: "#8A5C3E", subs: [] },
];
