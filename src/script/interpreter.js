import { parse } from "./parser.js";
import { applyPatchLocally, clearRangeLocally } from "../intervals.js";
import { t } from "../i18n.js";

const WEEKDAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const MAX_OPERATIONS = 200_000;
const MAX_STEPS = 1_000_000;

export class ScriptRuntimeError extends Error {
  constructor(message) {
    super(t(message));
    this.name = "ScriptRuntimeError";
  }
}

const asDate = (value) => {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) throw new ScriptRuntimeError("Ожидалась корректная дата");
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
};
const iso = (value) => {
  const d = asDate(value);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const dateFromDMY = (value) => {
  const [day, month, year] = value.split(".").map(Number);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    throw new ScriptRuntimeError(`Некорректная дата «${value}»`);
  }
  return date;
};
const toMin = (value) => {
  if (value?.kind === "Time") value = value.minutes;
  if (!Number.isInteger(value) || value < 0 || value > 1440 || value % 5 !== 0) {
    throw new ScriptRuntimeError(`Время должно быть кратно 5 минутам: ${value} мин`);
  }
  return value;
};
const durationMinutes = (value) => value?.kind === "Duration" ? value.minutes : Number(value);
const makeDuration = (minutes) => {
  if (!Number.isFinite(minutes) || minutes < 0) throw new ScriptRuntimeError("Длительность должна быть неотрицательным числом минут");
  return { kind: "Duration", minutes };
};
const fmtWeekday = (date) => WEEKDAYS[(date.getDay() + 6) % 7];
const mondayOf = (date) => {
  const d = asDate(date);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
};
const addDays = (date, count) => {
  const d = asDate(date);
  d.setDate(d.getDate() + count);
  return d;
};
const countOf = (value, name) => {
  if (!Number.isInteger(value) || value < 0) throw new ScriptRuntimeError(`${name} должно быть неотрицательным целым числом`);
  return value;
};

function isRange(value) { return value?.kind === "Range"; }
function isCategory(value) { return value?.kind === "Category"; }
function isSubcategory(value) { return value?.kind === "Subcategory"; }
function isDay(value) { return value?.kind === "Day"; }
function isWeek(value) { return value?.kind === "Week"; }
function isSelection(value) { return value?.kind === "Selection"; }

export function runPlanScript(source, context = {}) {
  const ast = parse(source);
  const strict = !/^\s*#\s*strict:\s*off\b/i.test(String(source).split(/\r?\n/, 1)[0] || "");
  const categories = context.categories || [];
  const state = {
    operations: [],
    log: [],
    steps: 0,
    strict,
    context,
    intervals: new Map(),
    allDayEvents: [...(context.allDayEvents || [])],
    todos: [...(context.todos || [])],
    changedYears: new Set(),
    startedAt: Date.now(),
    functionDepth: 0,
    readOnly: context.readOnly === true,
    watchMode: Boolean(context.watchTarget),
    watchTarget: context.watchTarget || null,
    indicator: null,
    dependencies: new Set(),
    unloadedDates: new Set(),
    watchers: [],
    lastExpression: null,
  };
  for (const [date, intervals] of Object.entries(context.daysByDate || {})) {
    state.intervals.set(date, intervals);
  }

  const fail = (message) => { throw new ScriptRuntimeError(message); };
  const dayIntervals = (date) => {
    const key = typeof date === "string" ? date : iso(date);
    if (state.watchMode) {
      if (!state.intervals.has(key)) fail(`Данные дня ${key} не были загружены для пересчёта наблюдателя`);
      state.dependencies.add(key);
      if (state.dependencies.size > 60) fail("Наблюдатель читает слишком широкий диапазон — ограничение 60 дней");
    } else if (!state.intervals.has(key)) {
      state.unloadedDates.add(key);
    }
    return state.intervals.get(key) || [];
  };
  const intervalAt = (date, minute) => dayIntervals(date).find((row) => row.startMin <= minute && minute < row.endMin) || null;
  const operation = (op) => {
    if (state.watchMode) fail("Наблюдатель может изменять только собственный indicator");
    if (state.readOnly) fail("В терминале доступно только чтение: эта команда меняет данные");
    if (state.operations.length >= MAX_OPERATIONS) fail(`Превышен лимит PlanScript: не более ${MAX_OPERATIONS} операций`);
    state.operations.push(op);
    const key = op.date;
    if (op.type === "SetInterval") {
      state.intervals.set(key, applyPatchLocally(dayIntervals(op.date), op.startMin, op.endMin, op.patch));
    } else if (op.type === "ClearInterval") {
      state.intervals.set(key, clearRangeLocally(dayIntervals(op.date), op.startMin, op.endMin));
    } else if (op.type === "SetAllDay") {
      state.allDayEvents.push(op.event);
    } else if (op.type === "ClearAllDay") {
      state.allDayEvents = state.allDayEvents.filter((event) => event.id !== op.id);
    } else if (op.type === "AddTodo") {
      state.todos.push(op.todo);
    }
    const dates = op.date ? [op.date] : op.event ? [op.event.startDate, op.event.endDate] : [];
    dates.forEach((value) => {
      if (!state.intervals.has(value)) state.unloadedDates.add(value);
      const year = Number(value.slice(0, 4));
      if (!(context.createdYears || []).includes(year)) {
        state.changedYears.add(year);
        if (state.changedYears.size > 3) fail("Один запуск PlanScript может автоматически завести не более трёх новых лет");
      }
    });
    return op;
  };

  const env = new Map();
  const define = (name, value) => env.set(name, value);
  const resolveCategory = (name, create = false, color = "#3B5AA6") => {
    const category = categories.find((item) => item.name.trim() === String(name).trim());
    if (category) return { kind: "Category", value: category };
    if (!create) {
      const names = categories.map((item) => item.name).slice(0, 5);
      fail(`Не найдена категория «${name}»${names.length ? `. Доступны: ${names.join(", ")}` : ""}`);
    }
    const value = { id: `script-${Math.random().toString(36).slice(2, 10)}`, name: String(name).trim(), color, subs: [] };
    operation({ type: "AddCategory", category: value });
    categories.push(value);
    return { kind: "Category", value };
  };
  const resolveSubcategory = (category, name, create = false) => {
    const owner = isCategory(category) ? category.value : category;
    if (!owner) fail("Для подкатегории сначала выберите категорию");
    const sub = (owner.subs || []).find((item) => item.name.trim() === String(name).trim());
    if (sub) return { kind: "Subcategory", value: sub, category: owner };
    if (!create) fail(`Не найдена подкатегория «${name}» в категории «${owner.name}»`);
    const value = { id: `script-sub-${Math.random().toString(36).slice(2, 10)}`, name: String(name).trim(), description: "" };
    owner.subs = [...(owner.subs || []), value];
    operation({ type: "AddSubcategory", categoryId: owner.id, subcategory: value });
    return { kind: "Subcategory", value, category: owner };
  };

  function makeDay(date, week = null) {
    const normalized = asDate(date);
    return { kind: "Day", date: normalized, week };
  }
  function makeWeek(start, index) {
    const monday = mondayOf(start);
    const week = { kind: "Week", start: monday, end: addDays(monday, 6), index, isoNumber: weekIsoNumber(monday), order: context.weekLabels?.[iso(monday)] ?? null };
    week.days = WEEKDAYS.map((_, dayIndex) => makeDay(addDays(monday, dayIndex), week));
    WEEKDAYS.forEach((name, dayIndex) => { week[name] = week.days[dayIndex]; });
    week.day = (weekday) => {
      const dayName = weekday?.kind === "Weekday" ? weekday.value : weekday;
      const idx = WEEKDAYS.indexOf(dayName);
      if (idx < 0) fail(`Неизвестный день недели «${dayName}»`);
      return week.days[idx];
    };
    Object.defineProperty(week, "colored_hours", { get: () => week.days.reduce((total, d) => total + coloredMinutes(d.date) / 60, 0) });
    return week;
  }
  function weekIsoNumber(date) {
    const d = mondayOf(date);
    const jan4 = new Date(d.getFullYear(), 0, 4);
    const first = mondayOf(jan4);
    return Math.floor((d - first) / 604800000) + 1;
  }
  function makeSelection(day, startMin, endMin) {
    const selection = { kind: "Selection", day, startMin: toMin(startMin), endMin: toMin(endMin), patch: {}, cleared: false, operation: null };
    if (selection.endMin <= selection.startMin) fail("Конец временного диапазона должен быть позже начала");
    return selection;
  }
  function selectionRows(selection) {
    const rows = dayIntervals(selection.day.date);
    return rows.filter((row) => row.startMin < selection.endMin && row.endMin > selection.startMin);
  }
  function selectionValue(selection, property) {
    const rows = selectionRows(selection);
    if (!rows.length) return property === "is_empty" ? true : property === "done" ? false : property === "category" || property === "subcategory" ? null : "";
    if (property === "is_empty") return rows.length === 0;
    const field = ({ category: "catId", subcategory: "subId" })[property] || property;
    const values = rows.map((row) => row[field] ?? (field === "done" || field === "moved" ? false : ""));
    if (values.every((value) => value === values[0])) {
      if (property === "category") return categories.find((cat) => cat.id === values[0]) ? { kind: "Category", value: categories.find((cat) => cat.id === values[0]) } : null;
      if (property === "subcategory") {
        const owner = categories.find((cat) => (cat.subs || []).some((sub) => sub.id === values[0]));
        const sub = owner?.subs.find((item) => item.id === values[0]);
        return sub ? { kind: "Subcategory", value: sub, category: owner } : null;
      }
      return values[0];
    }
    return { kind: "Mixed" };
  }
  function emitSelection(selection) {
    const date = iso(selection.day.date);
    const startMin = selection.startMin;
    const endMin = selection.endMin;
    if (strict && (startMin < context.settings?.dayStart || endMin > context.settings?.dayEnd)) {
      fail(`Время ${startMin}-${endMin} выходит за рабочее окно ${context.settings?.dayStart ?? 0}-${context.settings?.dayEnd ?? 1440}`);
    }
    const start = Math.max(startMin, context.settings?.dayStart ?? 0);
    const end = Math.min(endMin, context.settings?.dayEnd ?? 1440);
    if (end <= start) {
      state.log.push(`Пропущен диапазон вне рабочего времени: ${date}`);
      return;
    }
    if (selection.operation) {
      if (selection.cleared) {
        selection.operation.type = "ClearInterval";
        delete selection.operation.patch;
        state.intervals.set(date, clearRangeLocally(dayIntervals(date), start, end));
      } else {
        selection.operation.type = "SetInterval";
        selection.operation.patch = { ...selection.operation.patch, ...selection.patch };
        state.intervals.set(date, applyPatchLocally(dayIntervals(date), start, end, selection.patch));
      }
      return;
    }
    selection.operation = selection.cleared
      ? operation({ type: "ClearInterval", date, startMin: start, endMin: end })
      : operation({ type: "SetInterval", date, startMin: start, endMin: end, patch: { ...selection.patch } });
  }
  const coloredMinutes = (date) => dayIntervals(date).reduce((sum, row) => sum + Math.max(0, row.endMin - row.startMin), 0);

  function makeRange(start, end) { return { kind: "Range", start, end }; }
  function datesInRange(range) {
    const start = asDate(range.start);
    const end = asDate(range.end);
    if (start > end) fail("Начало диапазона позже конца");
    const result = [];
    for (let d = start; d <= end; d = addDays(d, 1)) {
      result.push(new Date(d));
      if (result.length > 36_600) fail("Диапазон дат превышает 100 лет");
    }
    return result;
  }
  function sequenceDates(start, count, step = 1, units = "day") {
    countOf(count, "count");
    if (count > 36_600) fail("Последовательность превышает лимит 36 600 дат");
    if (!Number.isInteger(step) || step < 1) fail("step должен быть положительным целым числом");
    return Array.from({ length: count }, (_, i) => units === "week" ? addDays(mondayOf(start), i * step * 7) : addDays(start, i * step));
  }
  function flattenDays(value) {
    if (isDay(value)) return [value];
    if (Array.isArray(value)) return value.flatMap(flattenDays);
    if (isWeek(value)) return value.days;
    return [];
  }

  const builtins = {
    today: () => asDate(new Date()),
    now: () => new Date(),
    time: (value) => parseTime(value),
    date: (value) => dateFromDMY(value),
    range: (start, end, options = {}) => makeRange(start, end),
    weeks: (start, options = {}) => {
      const end = options.end;
      const count = options.count;
      const step = options.step ?? 1;
      const dates = isRange(start) ? datesInRange(start) : end !== undefined ? datesInRange(makeRange(start, end)) : sequenceDates(start, count ?? 1, step, "week");
      const starts = [...new Set(dates.map((date) => iso(mondayOf(date))))].sort();
      return starts.map((value, index) => makeWeek(new Date(`${value}T00:00:00`), index + 1));
    },
    days: (start, options = {}) => {
      const end = options.end;
      const dates = isRange(start) ? datesInRange(start) : end !== undefined ? datesInRange(makeRange(start, end)) : sequenceDates(start, options.count ?? 1);
      return dates.map((date) => makeDay(date));
    },
    nth_weekday: (year, month, n, weekday) => nthWeekday(year, month, n, weekday),
    last_weekday: (year, month, weekday) => lastWeekday(year, month, weekday),
    category: (name, options = {}) => resolveCategory(name, options.new === true, options.color),
    subcategory: (name) => {
      const found = categories.flatMap((cat) => (cat.subs || []).filter((sub) => sub.name.trim() === String(name).trim()).map((sub) => ({ cat, sub })));
      if (found.length !== 1) fail(found.length ? `Подкатегория «${name}» неоднозначна: ${found.map((item) => item.cat.name).join(", ")}` : `Не найдена подкатегория «${name}»`);
      return { kind: "Subcategory", value: found[0].sub, category: found[0].cat };
    },
    category_exists: (name) => categories.some((cat) => cat.name.trim() === String(name).trim()),
    subcategory_exists: (category, name) => {
      const owner = isCategory(category) ? category.value : category;
      return Boolean(owner?.subs?.some((sub) => sub.name.trim() === String(name).trim()));
    },
    date_add: (date, count) => addDays(date, count),
    weeks_match: (index, spec) => matchesWeek(index, String(spec)),
    len: (value) => value?.length ?? 0,
    str: (value) => display(value),
    int: (value) => {
      const result = Number(value);
      if (!Number.isInteger(result)) fail("int() ожидал целое число");
      return result;
    },
    round: (value) => Math.round(Number(value)),
    min: (list) => {
      if (!Array.isArray(list) || !list.length || list.some((value) => typeof value !== "number")) fail("min() ожидает непустой список чисел");
      return Math.min(...list);
    },
    max: (list) => {
      if (!Array.isArray(list) || !list.length || list.some((value) => typeof value !== "number")) fail("max() ожидает непустой список чисел");
      return Math.max(...list);
    },
    minutes: (value) => makeDuration(Number(value)),
    hours: (value) => makeDuration(Number(value) * 60),
    log: (...values) => { state.log.push(values.map(display).join(" ")); },
    enumerate: (list) => list.map((value, index) => [index, value]),
    zip: (...lists) => Array.from({ length: Math.min(...lists.map((list) => list.length)) }, (_, i) => lists.map((list) => list[i])),
    sum: (values) => {
      if (!Array.isArray(values) || values.some((value) => typeof value !== "number")) fail("sum() ожидает список чисел");
      return values.reduce((total, value) => total + value, 0);
    },
    todo: (text) => {
      const sortOrder = state.todos.reduce((max, item) => Math.max(max, item.sortOrder ?? -1), -1) + 1;
      return operation({ type: "AddTodo", todo: { id: `script-${Math.random().toString(36).slice(2, 10)}`, text: String(text), createdAt: Date.now(), done: false, sortOrder } });
    },
    find: (range, options = {}) => findSelections(range, options),
    recur: (options = {}) => materializeRecurring(options),
    template: (name) => {
      const item = (context.templates || []).find((template) => template.name === name);
      if (!item) fail(`Не найден шаблон «${name}»`);
      return { kind: "Template", value: item };
    },
    stats: { kind: "Stats", hours: (name, range) => {
      const category = isCategory(name) ? name.value : categories.find((cat) => cat.name === name);
      if (!category) return 0;
      const days = flattenDays(range);
      const dates = days.length ? days.map((day) => day.date) : range?.kind === "Range" ? datesInRange(range) : [];
      return dates.reduce((sum, date) => sum + dayIntervals(date).filter((row) => row.catId === category.id).reduce((minutes, row) => minutes + row.endMin - row.startMin, 0), 0) / 60;
    } },
    mixed: { kind: "Mixed" },
  };
  if (state.readOnly) {
    builtins.count_cells = (range, filters = {}) => findSelections(range, filters)
      .reduce((count, selection) => count + (selection.endMin - selection.startMin) / 5, 0);
    builtins.dump = (range) => {
      const days = flattenDays(range);
      if (!days.length && isDay(range)) days.push(range);
      if (!days.length) fail("dump() ожидает день или неделю");
      return days.flatMap((day) => dayIntervals(day.date).map((row) => ({ date: iso(day.date), ...row })));
    };
    builtins.table = (rows) => {
      if (!Array.isArray(rows)) fail("table() ожидает список");
      return { kind: "Table", rows };
    };
  }
  for (const [name, value] of Object.entries(builtins)) define(name, value);
  for (const weekday of WEEKDAYS) define(weekday, { kind: "Weekday", value: weekday });
  for (const cat of categories) {
    const sanitized = cat.name.replace(/[^\p{L}\p{N}_]/gu, "_").replace(/^(\d)/, "_$1");
    if (isAvailableIdentifier(sanitized, categories) && !KEYWORD_NAMES.has(sanitized) && !env.has(sanitized)) define(sanitized, { kind: "Category", value: cat });
  }

  function findSelections(range, filters = {}) {
    const scopes = [];
    if (isSelection(range)) scopes.push(range);
    else if (isDay(range)) scopes.push(makeSelection(range, context.settings?.dayStart ?? 0, context.settings?.dayEnd ?? 1440));
    else if (isWeek(range)) range.days.forEach((day) => scopes.push(makeSelection(day, context.settings?.dayStart ?? 0, context.settings?.dayEnd ?? 1440)));
    else if (isRange(range)) datesInRange(range).forEach((date) => scopes.push(makeSelection(makeDay(date), context.settings?.dayStart ?? 0, context.settings?.dayEnd ?? 1440)));
    else if (Array.isArray(range)) range.forEach((item) => {
      if (isSelection(item)) scopes.push(item);
      else if (isDay(item)) scopes.push(makeSelection(item, context.settings?.dayStart ?? 0, context.settings?.dayEnd ?? 1440));
      else if (isWeek(item)) item.days.forEach((day) => scopes.push(makeSelection(day, context.settings?.dayStart ?? 0, context.settings?.dayEnd ?? 1440)));
    });
    else fail("find() ожидает дату, день, неделю, диапазон или список");

    const matches = [];
    const wantedCategory = isCategory(filters.category) ? filters.category.value.id
      : typeof filters.category === "string" ? categories.find((cat) => cat.name === filters.category)?.id : undefined;
    const wantedSub = isSubcategory(filters.subcategory) ? filters.subcategory.value.id
      : typeof filters.subcategory === "string" ? categories.flatMap((cat) => cat.subs || []).find((sub) => sub.name === filters.subcategory)?.id : undefined;
    for (const scope of scopes) {
      const date = iso(scope.day.date);
      if (filters.empty === true) {
        let cursor = scope.startMin;
        const rows = dayIntervals(scope.day.date).filter((row) => row.startMin < scope.endMin && row.endMin > scope.startMin).sort((a, b) => a.startMin - b.startMin);
        for (const row of rows) {
          const end = Math.min(row.startMin, scope.endMin);
          if (end > cursor) matches.push(makeSelection(scope.day, cursor, end));
          cursor = Math.max(cursor, row.endMin);
        }
        if (cursor < scope.endMin) matches.push(makeSelection(scope.day, cursor, scope.endMin));
        continue;
      }
      for (const row of dayIntervals(scope.day.date)) {
        const startMin = Math.max(scope.startMin, row.startMin);
        const endMin = Math.min(scope.endMin, row.endMin);
        if (endMin <= startMin) continue;
        if (wantedCategory !== undefined && row.catId !== wantedCategory) continue;
        if (filters.category != null && wantedCategory === undefined) continue;
        if (wantedSub !== undefined && row.subId !== wantedSub) continue;
        if (filters.subcategory != null && wantedSub === undefined) continue;
        if (filters.done != null && row.done !== filters.done) continue;
        const query = filters.text_contains;
        if (query != null && !`${row.text || ""}\n${row.task || ""}\n${row.description || ""}`.toLocaleLowerCase().includes(String(query).toLocaleLowerCase())) continue;
        const selection = makeSelection(scope.day, startMin, endMin);
        selection.foundRow = row;
        matches.push(selection);
      }
    }
    return matches.sort((a, b) => iso(a.day.date).localeCompare(iso(b.day.date)) || a.startMin - b.startMin);
  }

  function materializeRecurring(options) {
    const targetWeeks = isWeek(options.weeks) ? [options.weeks] : Array.isArray(options.weeks) ? options.weeks.filter(isWeek) : fail("recur() требует weeks=weeks(...)");
    const weekday = options.weekday?.kind === "Weekday" ? options.weekday.value : options.weekday;
    const weekDayIndex = WEEKDAYS.indexOf(weekday);
    if (weekDayIndex < 0) fail("recur() требует weekday от mon до sun");
    const timeRange = options.time;
    if (!isRange(timeRange)) fail("recur() требует time=начало..конец");
    const pattern = String(options.pattern ?? "all");
    const cat = options.category == null ? null : isCategory(options.category) ? options.category.value : categories.find((item) => item.name === options.category);
    if (options.category != null && !cat) fail(`Не найдена категория «${options.category}»`);
    const sub = options.subcategory == null ? null : isSubcategory(options.subcategory) ? options.subcategory.value : null;
    const text = options.text == null ? cat?.name || "" : String(options.text);
    for (const [index, week] of targetWeeks.entries()) {
      const weekNumber = index + 1;
      if (!matchesWeek(weekNumber, pattern)) continue;
      const selection = makeSelection(week.days[weekDayIndex], timeRange.start, timeRange.end);
      selection.patch = { text, color: cat?.color || options.color || "#3B5AA6", catId: cat?.id ?? null, subId: sub?.id ?? null };
      emitSelection(selection);
    }
    return null;
  }

  function execute(statements, scope = env) {
    for (const statement of statements) {
      if (++state.steps > MAX_STEPS) fail("Превышен лимит вычислений PlanScript");
      switch (statement.type) {
        case "Assign": {
          const value = evaluate(statement.value, scope);
          if (Array.isArray(statement.target)) {
            if (!Array.isArray(value) || value.length !== statement.target.length) fail("Распаковка списка: число переменных и элементов не совпадает");
            statement.target.forEach((target, index) => {
              if (categories.some((cat) => cat.name.replace(/[^\p{L}\p{N}_]/gu, "_").replace(/^(\d)/, "_$1") === target.name)) {
                fail(`Нельзя переопределить «${target.name}» — это категория`);
              }
              scope.set(target.name, value[index]);
            });
            break;
          }
          if (statement.target.type === "Name") {
            if ([...categories].some((cat) => cat.name.replace(/[^\p{L}\p{N}_]/gu, "_").replace(/^(\d)/, "_$1") === statement.target.name)) {
              fail(`Нельзя переопределить «${statement.target.name}» — это категория`);
            }
            if (statement.operator === "=") scope.set(statement.target.name, value);
            else {
              const current = lookup(scope, statement.target.name);
              scope.set(statement.target.name, binary(statement.operator[0], current, value));
            }
          } else {
            const list = evaluate(statement.target.object, scope);
            const index = evaluate(statement.target.index, scope);
            if (!Array.isArray(list) || !Number.isInteger(index) || index < 0 || index >= list.length) fail("Индекс присваивания вне списка");
            list[index] = statement.operator === "=" ? value : binary(statement.operator[0], list[index], value);
          }
          break;
        }
        case "ExpressionStatement": state.lastExpression = evaluate(statement.expression, scope); break;
        case "Assert": if (requireBool(evaluate(statement.test, scope)) !== true) fail(String(evaluate(statement.message, scope))); break;
        case "If": {
          let selected = false;
          for (const branch of statement.branches) {
            if (requireBool(evaluate(branch.test, scope))) { execute(branch.body, new Map(scope)); selected = true; break; }
          }
          if (!selected && statement.alternate) execute(statement.alternate, new Map(scope));
          break;
        }
        case "For": {
          const iterable = evaluate(statement.iterable, scope);
          if (!Array.isArray(iterable)) fail("Значение после «in» должно быть списком");
          for (const item of iterable) {
            const child = new Map(scope);
            if (statement.targets.length === 1) child.set(statement.targets[0], item);
            else {
              if (!Array.isArray(item) || item.length !== statement.targets.length) fail("Распаковка цикла: количество элементов не совпадает");
              statement.targets.forEach((name, index) => child.set(name, item[index]));
            }
            try { execute(statement.body, child); }
            catch (error) {
              if (error?.control === "continue") continue;
              if (error?.control === "break") break;
              throw error;
            }
          }
          break;
        }
        case "Break": throw Object.assign(new Error(), { control: "break" });
        case "Continue": throw Object.assign(new Error(), { control: "continue" });
        case "Function": scope.set(statement.name, { kind: "UserFunction", params: statement.params, body: statement.body, closure: new Map(scope) }); break;
        case "Watch": state.watchers.push(statement); break;
        case "Return": throw Object.assign(new Error(), { control: "return", value: statement.value ? evaluate(statement.value, scope) : null });
        default: fail(`Неизвестная инструкция ${statement.type}`);
      }
    }
  }

  function evaluate(node, scope) {
    if (++state.steps > MAX_STEPS) fail("Превышен лимит вычислений PlanScript");
    if (state.steps % 1000 === 0 && Date.now() - state.startedAt > 3000) fail("Превышено время выполнения PlanScript (3 секунды)");
    switch (node.type) {
      case "Literal": {
        const value = node.value;
        if (value?.kind === "Date") return dateFromDMY(value.value);
        if (value?.kind === "Time") return parseTime(value.value);
        if (value?.kind === "Duration") return parseDuration(value.value);
        return value;
      }
      case "TemplateString": return interpolate(node.value, scope);
      case "Name": return lookup(scope, node.name);
      case "List": return node.items.map((item) => evaluate(item, scope));
      case "ListComprehension": {
        const values = evaluate(node.iterable, scope);
        if (!Array.isArray(values)) fail("После «in» во включении списка должен быть список");
        const result = [];
        for (const value of values) {
          const local = new Map(scope);
          local.set(node.target, value);
          if (!node.condition || requireBool(evaluate(node.condition, local))) result.push(evaluate(node.expression, local));
          if (result.length > 200_000) fail("Включение списка превышает лимит 200 000 элементов");
        }
        return result;
      }
      case "Range": return makeRange(evaluate(node.start, scope), evaluate(node.end, scope));
      case "Unary": {
        const value = evaluate(node.value, scope);
        if (node.operator === "not") return !requireBool(value);
        if (typeof value !== "number") fail("Унарный «-» применяется только к числу");
        return -value;
      }
      case "Binary": {
        const left = evaluate(node.left, scope);
        if (node.operator === "and") return requireBool(left) && requireBool(evaluate(node.right, scope));
        if (node.operator === "or") return requireBool(left) || requireBool(evaluate(node.right, scope));
        return binary(node.operator, left, evaluate(node.right, scope));
      }
      case "Member": return getMember(evaluate(node.object, scope), node.property);
      case "Index": {
        const object = evaluate(node.object, scope);
        const index = evaluate(node.index, scope);
        if (!Array.isArray(object) || !Number.isInteger(index) || index < 0 || index >= object.length) fail("Индекс списка вне границ");
        return object[index];
      }
      case "Call": {
        const args = node.args.map((arg) => ({ name: arg.name, value: evaluate(arg.value, scope) }));
        const receiver = node.callee.type === "Member" ? evaluate(node.callee.object, scope) : null;
        const fn = node.callee.type === "Member" ? getMethod(receiver, node.callee.property) : evaluate(node.callee, scope);
        return call(fn, receiver, args, scope);
      }
      default: fail(`Неизвестное выражение ${node.type}`);
    }
  }

  function interpolate(template, scope) {
    let output = "";
    let cursor = 0;
    while (cursor < template.length) {
      const start = template.indexOf("${", cursor);
      if (start < 0) {
        output += template.slice(cursor);
        break;
      }
      output += template.slice(cursor, start);
      let depth = 1;
      let quote = null;
      let escaped = false;
      let end = start + 2;
      for (; end < template.length; end++) {
        const char = template[end];
        if (escaped) { escaped = false; continue; }
        if (char === "\\") { escaped = true; continue; }
        if (quote) {
          if (char === quote) quote = null;
          continue;
        }
        if (char === "'" || char === '"') { quote = char; continue; }
        if (char === "{") depth++;
        if (char === "}" && --depth === 0) break;
      }
      if (depth !== 0 || quote) fail("Не закрыто выражение интерполяции «${...}»");
      const expressionSource = template.slice(start + 2, end);
      const parsed = parse(`${expressionSource}\n`);
      if (parsed.body.length !== 1 || parsed.body[0].type !== "ExpressionStatement") fail("В интерполяции ожидалось выражение");
      output += display(evaluate(parsed.body[0].expression, scope));
      cursor = end + 1;
    }
    return output;
  }

  function getMember(object, property) {
    if (object == null) fail(`Нельзя прочитать «${property}» у none`);
    if (object?.kind === "IndicatorHandle") fail("Наблюдатели не могут читать indicator");
    if (object instanceof Date) {
      if (property === "weekday") return { kind: "Weekday", value: fmtWeekday(object) };
      return fail(`Неизвестное свойство даты «${property}»`);
    }
    if (object?.kind === "Week") {
      if (["start", "end", "index", "isoNumber", "order", "days", "colored_hours"].includes(property)) return object[property];
      if (WEEKDAYS.includes(property)) return object[property];
    }
    if (object?.kind === "Day") {
      if (property === "date" || property === "week" || property === "weekday") return property === "weekday" ? { kind: "Weekday", value: fmtWeekday(object.date) } : object[property];
      if (property === "is_weekend") return ["sat", "sun"].includes(fmtWeekday(object.date));
      if (property === "is_empty") return dayIntervals(object.date).length === 0;
      if (property === "colored_hours") return coloredMinutes(object.date) / 60;
      if (property === "indicator") return { kind: "IndicatorHandle", scope: "day", key: iso(object.date) };
      if (property === "all_day") return { kind: "AllDayHandle", days: [object] };
    }
    if (object?.kind === "Week" && property === "indicator") return { kind: "IndicatorHandle", scope: "week", key: iso(object.start) };
    if (object?.kind === "Selection") {
      if (property === "day") return object.day;
      if (property === "start") return { kind: "Time", minutes: object.startMin };
      if (property === "end") return { kind: "Time", minutes: object.endMin };
      if (["is_empty", "category", "subcategory", "color", "text", "task", "done"].includes(property)) return selectionValue(object, property);
    }
    if (object?.kind === "Category") {
      if (property === "name" || property === "color") return object.value[property];
      if (property === "subs") return (object.value.subs || []).map((sub) => ({ kind: "Subcategory", value: sub, category: object.value }));
    }
    if (object?.kind === "Subcategory") return object.value[property];
    if (object?.kind === "Duration") {
      if (property === "minutes") return object.minutes;
      if (property === "hours") return object.minutes / 60;
      if (property === "days") return object.minutes / 1440;
    }
    if (object?.kind === "Time" && property === "minutes") return object.minutes;
    if (object?.kind === "Range" && property === "all_day") return { kind: "AllDayHandle", days: datesInRange(object).map((date) => makeDay(date)) };
    if (Array.isArray(object) && property === "length") return object.length;
    if (typeof object === "string" && property === "length") return [...object].length;
    if (object?.kind === "Stats") return object[property];
    if (object && Object.hasOwn(object, property)) return object[property];
    if (typeof object === "string" && property === "contains") return (value) => object.includes(String(value));
    return getMethod(object, property, true);
  }

  function getMethod(object, property, asProperty = false) {
    if (object?.kind === "IndicatorHandle" && state.watchMode) {
      if (property === "set") return (values = {}) => {
        const target = state.watchTarget;
        const key = target.scope === "day" ? target.date : target.monday;
        if (object.scope !== target.scope || object.key !== key) fail("Наблюдатель может писать только в собственный indicator");
        if (Object.keys(values).some((field) => !["text", "color"].includes(field))) fail("indicator.set() принимает только text и color");
        const text = values.text == null ? "" : String(values.text);
        const color = values.color == null ? "" : String(values.color);
        if (color && !/^#[\da-f]{6}$/i.test(color)) fail("Цвет indicator должен быть в формате #RRGGBB");
        if (!text && !color) fail("indicator.set() требует text или color");
        state.indicator = { text, color };
        return null;
      };
      if (property === "clear") return () => {
        const target = state.watchTarget;
        const key = target.scope === "day" ? target.date : target.monday;
        if (object.scope !== target.scope || object.key !== key) fail("Наблюдатель может писать только в собственный indicator");
        state.indicator = null;
        return null;
      };
    }
    if (isDay(object)) {
      if (property === "time") return (...args) => {
        const [start, end] = readRangeArgs(args);
        return makeSelection(object, start, end);
      };
      if (property === "free_slots") return (minDuration = null) => {
        const settings = context.settings || { dayStart: 0, dayEnd: 1440 };
        const intervals = dayIntervals(object.date);
        const slots = [];
        let cursor = settings.dayStart;
        for (const row of intervals) {
          if (row.startMin > cursor) slots.push({ kind: "Range", start: cursor, end: row.startMin, day: object });
          cursor = Math.max(cursor, row.endMin);
        }
        if (cursor < settings.dayEnd) slots.push({ kind: "Range", start: cursor, end: settings.dayEnd, day: object });
        return slots.filter((slot) => minDuration == null || slot.end - slot.start >= durationMinutes(minDuration));
      };
    }
    if (object?.kind === "Week" && property === "day") return object.day;
    if (isSelection(object)) {
      if (["category", "subcategory", "color", "text", "task", "done"].includes(property)) {
        return (value) => {
          if (property === "category") {
            if (value == null) { object.patch.catId = null; object.patch.subId = null; object.patch.color = ""; }
            else {
              const cat = isCategory(value) ? value.value : categories.find((item) => item.name === value);
              if (!cat) fail(`Не найдена категория «${value}»`);
              object.patch.catId = cat.id;
              object.patch.color = cat.color;
              object.patch.subId = null;
            }
          } else if (property === "subcategory") {
            if (value == null) object.patch.subId = null;
            else {
              const sub = isSubcategory(value) ? value : resolveSubcategory({ kind: "Category", value: categories.find((cat) => cat.id === object.patch.catId) }, value);
              if (sub.category.id !== object.patch.catId) fail(`Подкатегория «${sub.value.name}» не принадлежит выбранной категории`);
              object.patch.subId = sub.value.id;
              object.patch.text = `${sub.category.name} - ${sub.value.name}`;
            }
          } else if (property === "color" && isCategory(value)) object.patch.color = value.value.color;
          else object.patch[property] = property === "done" ? requireBool(value) : String(value ?? "");
          object.cleared = false;
          emitSelection(object);
          return object;
        };
      }
      if (property === "clear") return () => { object.cleared = true; emitSelection(object); return object; };
      if (property === "set") return (values = {}) => {
        const patch = {};
        if ("text" in values) patch.text = values.text ?? "";
        if ("task" in values) patch.task = values.task ?? "";
        if ("color" in values) patch.color = values.color ?? "";
        if ("done" in values) patch.done = values.done;
        if ("category" in values) {
          const cat = values.category == null ? null : isCategory(values.category) ? values.category.value : categories.find((item) => item.name === values.category);
          patch.catId = cat?.id ?? null;
          if (cat && !("color" in values)) patch.color = cat.color;
        }
        if ("subcategory" in values) {
          const sub = values.subcategory == null ? null : isSubcategory(values.subcategory) ? values.subcategory.value : null;
          patch.subId = sub?.id ?? null;
        }
        object.patch = { ...object.patch, ...patch };
        emitSelection(object);
        return object;
      };
      if (property === "move_to") return (target) => {
        if (!isSelection(target)) fail("move_to ожидает Selection");
        if (target === object) return object;
        const row = intervalAt(object.day.date, object.startMin);
        if (!row) return object;
        const fields = ["text", "color", "task", "description", "catId", "subId", "done", "moved"];
        target.patch = Object.fromEntries(fields.map((key) => [key, row[key]]));
        emitSelection(target);
        object.cleared = true;
        emitSelection(object);
        return target;
      };
    }
    if (object?.kind === "Category" && property === "subcategory") return (name, options = {}) => resolveSubcategory(object, name, options.new === true);
    if (object?.kind === "AllDayHandle") {
      if (property === "set") return (text, options = {}) => {
        const dates = object.days.map((day) => day.date).sort((a, b) => a - b);
        const event = { id: `script-${Math.random().toString(36).slice(2, 10)}`, text: String(text), startDate: iso(dates[0]), endDate: iso(dates.at(-1)), catId: null, color: null, createdAt: Date.now(), ...options };
        operation({ type: "SetAllDay", event });
      };
      if (property === "clear") return () => {
        const matching = state.allDayEvents.filter((event) => object.days.some((day) => iso(day.date) >= event.startDate && iso(day.date) <= event.endDate));
        matching.forEach((event) => operation({ type: "ClearAllDay", id: event.id }));
      };
    }
    if (object?.kind === "Template" && property === "apply_to") return (targets, options = {}) => {
      const targetWeeks = isWeek(targets) ? [targets] : Array.isArray(targets) ? targets.filter(isWeek) : [];
      if (object.value.type !== "week" || !targetWeeks.length) fail("Этот шаблон можно применить только к неделям");
      const data = typeof object.value.data === "string" ? JSON.parse(object.value.data) : object.value.data;
      const intervals = Array.isArray(data) ? data : data?.intervals || [];
      for (const week of targetWeeks) {
        for (const item of intervals) {
          const dayIndex = Number(item.dayIdx);
          const startMin = Number(item.startMin);
          const endMin = Number(item.endMin);
          const targetDay = week.days[dayIndex];
          if (!targetDay) continue;
          const existing = dayIntervals(targetDay.date);
          if (options.mode === "fill_empty" && existing.some((row) => row.startMin < endMin && row.endMin > startMin)) continue;
          const selection = makeSelection(targetDay, startMin, endMin);
          selection.patch = item.patch || {};
          emitSelection(selection);
        }
      }
    };
    if (Array.isArray(object)) {
      if (property === "all_day") return { kind: "AllDayHandle", days: object.flatMap((item) => flattenDays(item)) };
      if (property === "index_of") return (value) => object.indexOf(value);
      if (property === "append") return (value) => {
        if (state.watchMode) fail("Наблюдатель может изменять только собственный indicator");
        if (state.readOnly) fail("В терминале доступно только чтение: append меняет список");
        object.push(value);
        return null;
      };
    }
    if (typeof object === "string" && property === "contains") return (value) => object.includes(String(value));
    if (typeof object === "function" || object?.kind === "UserFunction") return object;
    if (asProperty) fail(`Неизвестное свойство «${property}»`);
    return null;
  }

  function call(fn, receiver, args, scope) {
    if (typeof fn !== "function" && fn?.kind !== "UserFunction") fail("Это значение нельзя вызвать как функцию");
    const positional = args.filter((arg) => arg.name == null).map((arg) => arg.value);
    const namedArgs = args.filter((arg) => arg.name != null);
    const named = Object.fromEntries(namedArgs.map((arg) => [arg.name, arg.value]));
    if (namedArgs.length !== Object.keys(named).length) fail("Аргумент передан по имени несколько раз");
    if (fn?.kind === "UserFunction") {
      if (positional.length > fn.params.length) fail(`Функция ожидает не более ${fn.params.length} аргумент(а)`);
      const bindings = new Map(fn.params.slice(0, positional.length).map((name, index) => [name, positional[index]]));
      for (const [name, value] of Object.entries(named)) {
        if (!fn.params.includes(name)) fail(`У функции нет параметра «${name}»`);
        if (bindings.has(name)) fail(`Параметр «${name}» передан и позиционно, и по имени`);
        bindings.set(name, value);
      }
      const missing = fn.params.filter((name) => !bindings.has(name));
      if (missing.length) fail(`Не переданы параметры функции: ${missing.join(", ")}`);
      if (state.functionDepth >= 500) fail("Превышена максимальная глубина вызовов функций PlanScript (500)");
      const local = new Map(fn.closure);
      bindings.forEach((value, name) => local.set(name, value));
      state.functionDepth++;
      try {
        try { execute(fn.body, local); } catch (error) {
          if (error?.control === "return") return error.value;
          throw error;
        }
      } finally { state.functionDepth--; }
      return null;
    }
    return fn.apply(receiver, Object.keys(named).length ? [...positional, named] : positional);
  }

  function readRangeArgs(args) {
    if (args.length === 1 && isRange(args[0])) return [args[0].start, args[0].end];
    if (args.length !== 2) fail("Ожидалось начало и конец диапазона");
    return args;
  }
  function lookup(scope, name) {
    if (scope.has(name)) return scope.get(name);
    if (env.has(name)) return env.get(name);
    fail(`Неизвестное имя «${name}»`);
  }
  function requireBool(value) {
    if (typeof value !== "boolean") fail("В условии допустимо только true или false");
    return value;
  }
  function binary(operator, left, right) {
    if ((left?.kind === "Mixed" || right?.kind === "Mixed") && !["==", "!="].includes(operator)) fail("Неоднородное значение mixed допускает только == и !=");
    if (operator === "==") return equal(left, right);
    if (operator === "!=") return !equal(left, right);
    if (operator === "in" || operator === "not in") {
      const found = right instanceof Date && isRange(left)
        ? left.start <= right && right <= left.end
        : Array.isArray(right) ? right.some((value) => equal(left, value))
          : typeof right === "string" ? right.includes(String(left)) : false;
      return operator === "in" ? found : !found;
    }
    if (left?.kind === "Duration" && right?.kind === "Duration" && ["+", "-"].includes(operator)) {
      const minutes = operator === "+" ? left.minutes + right.minutes : left.minutes - right.minutes;
      if (minutes < 0) fail("Длительность не может быть отрицательной");
      return makeDuration(minutes);
    }
    if (left?.kind === "Duration" && typeof right === "number" && ["*", "/", "%"].includes(operator)) {
      if ((operator === "/" || operator === "%") && right === 0) fail("Деление на ноль");
      const minutes = operator === "*" ? left.minutes * right
        : operator === "/" ? left.minutes / right
          : left.minutes % right;
      if (!Number.isFinite(minutes) || minutes < 0) fail("Некорректная длительность");
      return makeDuration(minutes);
    }
    if (left?.kind === "Time" && right?.kind === "Duration" && ["+", "-"].includes(operator)) {
      const minutes = operator === "+" ? left.minutes + right.minutes : left.minutes - right.minutes;
      if (minutes < 0 || minutes > 1440) fail("Время выходит за границы суток");
      return { kind: "Time", minutes: toMin(minutes) };
    }
    if (typeof left === "number" && right?.kind === "Duration" && ["+", "-"].includes(operator)) {
      const minutes = operator === "+" ? left + right.minutes : left - right.minutes;
      if (minutes < 0 || minutes > 1440) fail("Время выходит за границы суток");
      return { kind: "Time", minutes: toMin(minutes) };
    }
    if (left instanceof Date && right?.kind === "Duration" && operator === "+") {
      if (right.minutes % 1440 !== 0) fail("К дате можно прибавить только целое число дней");
      return addDays(left, right.minutes / 1440);
    }
    if (left?.kind === "Time" && right?.kind === "Time" && operator === "-") {
      if (left.minutes < right.minutes) fail("Время начала должно быть позже времени конца для вычитания");
      return { kind: "Duration", minutes: left.minutes - right.minutes };
    }
    if (operator === "+" && isRange(left) && isRange(right)) return { kind: "SelectionGroup", items: [left, right] };
    if (operator === "+" && (left instanceof Date || right instanceof Date)) {
      const date = left instanceof Date ? left : right;
      const amount = left instanceof Date ? right : left;
      return addDays(date, Number(amount));
    }
    if (operator === "-" && left instanceof Date && right instanceof Date)     return makeDuration(Math.floor((left - right) / 86400000) * 1440);
    if (operator === "+" && typeof left === "number" && typeof right === "number") return left + right;
    if (operator === "-" && typeof left === "number" && typeof right === "number") return left - right;
    if (operator === "*" && typeof left === "number" && typeof right === "number") return left * right;
    if (operator === "/" && typeof left === "number" && typeof right === "number") {
      if (right === 0) fail("Деление на ноль");
      return left / right;
    }
    if (operator === "%" && typeof left === "number" && typeof right === "number") return left % right;
    if (["<", "<=", ">", ">="].includes(operator)) {
      const comparable = (value) => value instanceof Date ? value.getTime()
        : value?.kind === "Time" ? value.minutes
          : value?.kind === "Duration" ? value.minutes : value;
      const a = comparable(left);
      const b = comparable(right);
      return operator === "<" ? a < b : operator === "<=" ? a <= b : operator === ">" ? a > b : a >= b;
    }
    fail(`Оператор «${operator}» нельзя применить к этим значениям`);
  }

  try {
    if (state.watchMode) {
      const { scope: targetScope, date, monday } = state.watchTarget;
      const watches = ast.body.filter((statement) => statement.type === "Watch");
      if (watches.length !== ast.body.length || watches.length === 0) fail("В режиме наблюдателя ожидаются только блоки watch");
      const selected = watches.find((statement) => statement.scope === targetScope);
      if (selected) {
        const weekMonday = monday || iso(mondayOf(new Date(`${date}T00:00:00`)));
        const currentWeek = makeWeek(new Date(`${weekMonday}T00:00:00`), 1);
        const local = new Map(env);
        if (targetScope === "day") local.set("day", makeDay(new Date(`${date}T00:00:00`), currentWeek));
        else local.set("week", currentWeek);
        execute(selected.body, local);
      }
    } else {
      execute(ast.body);
    }
  } catch (error) {
    if (error?.control) fail(`${error.control} допустим только внутри соответствующего блока`);
    throw error;
  }
  return {
    operations: state.operations,
    result: state.lastExpression,
    log: state.log,
    changedYears: [...state.changedYears].sort(),
    daysByDate: Object.fromEntries(state.intervals),
    allDayEvents: state.allDayEvents,
    todos: state.todos,
    watchers: state.watchers.map(({ scope, body }) => ({ scope, body })),
    indicator: state.indicator,
    dependencies: [...state.dependencies].sort(),
    unloadedDates: [...state.unloadedDates].sort(),
  };
}

export function runPlanWatch(source, context, target) {
  if (!target || !["day", "week"].includes(target.scope)) throw new ScriptRuntimeError("Наблюдателю нужна цель day или week");
  if (target.scope === "day" && !target.date) throw new ScriptRuntimeError("Для дневного наблюдателя нужна дата");
  if (target.scope === "week" && !target.monday) throw new ScriptRuntimeError("Для недельного наблюдателя нужен понедельник");
  return runPlanScript(source, { ...context, watchTarget: target });
}

const KEYWORD_NAMES = new Set(["for", "in", "if", "elif", "else", "and", "or", "not", "true", "false", "none", "def", "return", "break", "continue", "assert", "watch", "every"]);
function isAvailableIdentifier(identifier, categories) {
  const names = categories.map((cat) => cat.name.replace(/[^\p{L}\p{N}_]/gu, "_").replace(/^(\d)/, "_$1"));
  return names.filter((name) => name === identifier).length === 1;
}
function parseTime(value) {
  if (typeof value === "number") return { kind: "Time", minutes: toMin(value) };
  const match = String(value).match(/^(\d{1,2}):(\d{2})$/);
  if (!match) throw new ScriptRuntimeError(`Некорректное время «${value}»`);
  const hour = Number(match[1]), minute = Number(match[2]);
  if (hour > 24 || minute > 59 || (hour === 24 && minute !== 0)) throw new ScriptRuntimeError(`Некорректное время «${value}»`);
  return { kind: "Time", minutes: toMin(hour * 60 + minute) };
}
function parseDuration(value) {
  const match = String(value).match(/^(\d+)(h(?:(\d+)m?)?|m)$/);
  if (!match) throw new ScriptRuntimeError(`Некорректная длительность «${value}»`);
  return makeDuration(Number(match[1]) * (match[2] === "m" ? 1 : 60) + Number(match[3] || 0));
}
function nthWeekday(year, month, n, weekday) {
  const idx = WEEKDAYS.indexOf(weekday?.kind === "Weekday" ? weekday.value : weekday);
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12 || !Number.isInteger(n) || n < 1 || n > 5 || idx < 0) {
    throw new ScriptRuntimeError("nth_weekday() ожидает год, месяц 1-12, номер 1-5 и день недели");
  }
  const first = new Date(year, month - 1, 1);
  const offset = (idx - ((first.getDay() + 6) % 7) + 7) % 7;
  const date = new Date(year, month - 1, 1 + offset + (n - 1) * 7);
  if (date.getMonth() !== month - 1) throw new ScriptRuntimeError("В этом месяце нет такого дня недели");
  return date;
}
function lastWeekday(year, month, weekday) {
  const idx = WEEKDAYS.indexOf(weekday?.kind === "Weekday" ? weekday.value : weekday);
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12 || idx < 0) {
    throw new ScriptRuntimeError("last_weekday() ожидает год, месяц 1-12 и день недели");
  }
  const last = new Date(year, month, 0);
  last.setDate(last.getDate() - (((last.getDay() + 6) % 7 - idx + 7) % 7));
  return last;
}
function matchesWeek(index, spec) {
  if (spec === "all") return true;
  if (spec === "even") return index % 2 === 0;
  if (spec === "odd") return index % 2 === 1;
  return spec.split(",").some((part) => {
    const [start, end = start] = part.trim().split("-").map(Number);
    return index >= start && index <= end;
  });
}
function equal(left, right) {
  if (left instanceof Date && right instanceof Date) return iso(left) === iso(right);
  if (left?.kind === "Time" && right?.kind === "Time") return left.minutes === right.minutes;
  if (left?.kind === "Duration" && right?.kind === "Duration") return left.minutes === right.minutes;
  if (left?.kind === "Category" && right?.kind === "Category") return left.value.id === right.value.id;
  if (left?.kind === "Subcategory" && right?.kind === "Subcategory") return left.value.id === right.value.id;
  if (left?.kind === "Weekday" && right?.kind === "Weekday") return left.value === right.value;
  if (left?.kind === "Mixed" || right?.kind === "Mixed") return left?.kind === right?.kind;
  return left === right;
}
function display(value) {
  if (value instanceof Date) return iso(value);
  if (value?.kind === "Time") return `${String(Math.floor(value.minutes / 60)).padStart(2, "0")}:${String(value.minutes % 60).padStart(2, "0")}`;
  if (value?.kind === "Duration") {
    const hours = Math.floor(value.minutes / 60);
    const minutes = value.minutes % 60;
    return `${hours ? `${hours}h` : ""}${minutes ? `${minutes}m` : ""}` || "0m";
  }
  if (value?.kind === "Category" || value?.kind === "Subcategory") return value.value.name;
  if (value?.kind === "Weekday") return value.value;
  if (value?.kind === "Week") return t(`Неделя ${iso(value.start)} — ${iso(value.end)}`);
  if (value?.kind === "Day") return t(`День ${iso(value.date)}`);
  if (value?.kind === "Selection") return `${iso(value.day.date)} ${value.startMin}-${value.endMin}`;
  return String(value);
}

export function formatPlanScriptValue(value, depth = 0) {
  if (value == null || typeof value !== "object") return display(value);
  if (value instanceof Date || ["Category", "Subcategory", "Weekday", "Week", "Day", "Selection"].includes(value.kind)) {
    return display(value);
  }
  if (depth >= 4) return Array.isArray(value) ? "[…]" : "{…}";
  if (Array.isArray(value)) {
    return value.length
      ? value.map((item) => `${"  ".repeat(depth)}${formatPlanScriptValue(item, depth + 1)}`).join("\n")
      : "[]";
  }
  if (value.kind === "Table") return formatPlanScriptValue(value.rows, depth);
  return `{ ${Object.entries(value).map(([key, item]) => `${key}: ${formatPlanScriptValue(item, depth + 1)}`).join(", ")} }`;
}
