import { MONTHS_GEN, BASE_UNIT } from "./constants.js";
import { getLanguage, t } from "./i18n.js";

export function pad(n) { return String(n).padStart(2, "0"); }
export function toISO(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
export function getMonday(date) {
  const d = new Date(date);
  const day = d.getDay();
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day));
  d.setHours(0, 0, 0, 0);
  return d;
}
export function addDays(date, n) { const d = new Date(date); d.setDate(d.getDate() + n); return d; }
export function formatRange(monday) {
  const sunday = addDays(monday, 6);
  if (getLanguage() === "en") {
    const format = (date, includeDay = true) => new Intl.DateTimeFormat("en-US", {
      month: "short",
      ...(includeDay ? { day: "numeric" } : {}),
    }).format(date);
    if (monday.getMonth() === sunday.getMonth()) {
      return `${format(monday)}–${format(sunday).replace(/^[^ ]+ /, "")}`;
    }
    return `${format(monday)} – ${format(sunday)}`;
  }
  if (monday.getMonth() === sunday.getMonth()) return `${monday.getDate()}-${sunday.getDate()} ${MONTHS_GEN[monday.getMonth()]}`;
  return `${monday.getDate()} ${MONTHS_GEN[monday.getMonth()]} - ${sunday.getDate()} ${MONTHS_GEN[sunday.getMonth()]}`;
}

export function formatDateLabel(date, weekday) {
  if (getLanguage() === "en") {
    const day = new Intl.DateTimeFormat("en-US", { weekday: "short" }).format(date);
    return `${day}, ${new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(date)}`;
  }
  return `${weekday}, ${date.getDate()} ${MONTHS_GEN[date.getMonth()]}`;
}
export function minToTime(m) { return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`; }
export function timeToMin(t) { const [h, m] = t.split(":").map(Number); return h * 60 + m; }
export function uid() { return Math.random().toString(36).slice(2, 10); }
export function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
export function snap5(m) { return Math.round(m / BASE_UNIT) * BASE_UNIT; }

export function weeksOfYear(year) {
  const first = getMonday(new Date(year, 0, 1));
  const last = getMonday(new Date(year, 11, 31));
  const list = [];
  let cur = first;
  while (cur <= last) { list.push(cur); cur = addDays(cur, 7); }
  return list;
}

export function parseWeekRanges(spec) {
  const weeks = new Set();
  String(spec || "").split(",").forEach((part) => {
    const p = part.trim();
    if (!p) return;
    const m = p.match(/^(\d+)\s*-\s*(\d+)$/);
    if (m) {
      const a = Number(m[1]), b = Number(m[2]);
      for (let w = Math.min(a, b); w <= Math.max(a, b); w++) weeks.add(w);
    } else if (/^\d+$/.test(p)) {
      weeks.add(Number(p));
    }
  });
  return weeks;
}

export function weekNumberFrom(anchorMonday, targetMonday) {
  const ms = targetMonday.getTime() - anchorMonday.getTime();
  return Math.round(ms / (7 * 24 * 3600 * 1000)) + 1;
}

export function recurringWeekNumbers(patternType, customRanges, weeksCount) {
  const count = Number(weeksCount);
  if (!Number.isInteger(count) || count < 1 || count > 520) {
    throw new Error(t("Диапазон должен содержать от 1 до 520 недель"));
  }

  if (patternType === "all" || patternType === "even" || patternType === "odd") {
    return Array.from({ length: count }, (_, index) => index + 1).filter((week) =>
      patternType === "all" || (patternType === "even" ? week % 2 === 0 : week % 2 === 1)
    );
  }
  if (patternType !== "custom") {
    throw new Error(t("Неизвестный тип повтора"));
  }

  const selected = new Set();
  const parts = String(customRanges || "").split(",");
  for (const part of parts) {
    const match = part.trim().match(/^(\d+)\s*(?:-\s*(\d+)\s*)?$/);
    if (!match) throw new Error(t("Укажите недели в формате 2-17,20"));
    const start = Number(match[1]);
    const end = match[2] ? Number(match[2]) : start;
    if (start < 1 || end < 1 || start > count || end > count) {
      throw new Error(t("Недели повтора должны входить в выбранный диапазон"));
    }
    for (let week = Math.min(start, end); week <= Math.max(start, end); week++) selected.add(week);
  }
  if (selected.size === 0) throw new Error(t("Укажите недели в формате 2-17,20"));
  return [...selected].sort((a, b) => a - b);
}

export function expandWeekRange({ startDate, endMode, weeksCount, endDate, filterType = "all", cyclePeriod, customRanges }) {
  const parseIsoDate = (value, label) => {
    const date = new Date(`${value}T00:00:00`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value)) || Number.isNaN(date.getTime()) || toISO(date) !== value) {
      throw new Error(t(`Укажите корректную ${label}`));
    }
    return date;
  };
  const start = parseIsoDate(startDate, "дату начала диапазона");
  const firstMonday = getMonday(start);
  let count;
  if (endMode === "date") {
    const end = parseIsoDate(endDate, "конечную дату");
    const lastMonday = getMonday(end);
    count = Math.floor((lastMonday.getTime() - firstMonday.getTime()) / (7 * 24 * 60 * 60 * 1000)) + 1;
  } else {
    count = Number(weeksCount);
  }
  if (!Number.isInteger(count) || count < 1 || count > 520) {
    throw new Error(t("Диапазон должен содержать от 1 до 520 недель"));
  }

  const period = Number(cyclePeriod);
  if (filterType === "cycle" && (!Number.isInteger(period) || period < 1 || period > 520)) {
    throw new Error(t("Период цикла должен быть от 1 до 520 недель"));
  }
  if (filterType === "custom" && String(customRanges || "").split(",").some((part) => !/^\s*\d+\s*(?:-\s*\d+\s*)?$/.test(part))) {
    throw new Error(t("Укажите недели в формате 2-17,20"));
  }
  const custom = filterType === "custom" ? parseWeekRanges(customRanges) : null;
  if (custom && custom.size === 0) throw new Error(t("Укажите недели в формате 2-17,20"));

  const result = [];
  for (let index = 0; index < count; index++) {
    const weekNumber = index + 1;
    const included = filterType === "all"
      || (filterType === "even" && weekNumber % 2 === 0)
      || (filterType === "odd" && weekNumber % 2 === 1)
      || (filterType === "cycle" && index % period === 0)
      || (filterType === "custom" && custom.has(weekNumber));
    if (included) result.push(toISO(addDays(firstMonday, index * 7)));
  }
  return result;
}

export function parseDateQuery(str) {
  const s = str.trim();
  let m = s.match(/^(\d{1,2})[.\/](\d{1,2})(?:[.\/](\d{2,4}))?$/);
  if (m) {
    const day = Number(m[1]);
    const month = Number(m[2]) - 1;
    let yr = m[3] ? Number(m[3]) : new Date().getFullYear();
    if (yr < 100) yr += 2000;
    const d = new Date(yr, month, day);
    if (!isNaN(d.getTime()) && d.getMonth() === month && d.getDate() === day) return d;
    return null;
  }
  m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) {
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    if (!isNaN(d.getTime())) return d;
  }
  return null;
}
