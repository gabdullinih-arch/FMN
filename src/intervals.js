/* ------------------------------------------------------------------ */
/*  Новая модель данных клетки (Этап 2, миграция на Rust/SQLite).      */
/*                                                                      */
/*  Раньше (cellData.js): плоский словарь 5-минутных квантов на всю     */
/*  неделю + compactCells/expandCells для сжатия перед записью на диск. */
/*  Теперь: бэкенд (Rust) сам хранит и отдаёт уже сжатые "прогоны"       */
/*  (интервалы) - список НЕПЕРЕСЕКАЮЩИХСЯ {startMin, endMin, ...} на    */
/*  ОДИН день, отсортированный по startMin. Никакого сжатия/квантования */
/*  на фронтенде больше не нужно вообще - см. §8 PlanScript-spec.md,    */
/*  обновлённый на этом же этапе.                                       */
/*                                                                      */
/*  weekData теперь имеет форму { days: { "0": [...], ..., "6": [...] }}*/
/*  вместо { cells: {...} } - см. Planner.jsx: ensureLoadedData.        */
/* ------------------------------------------------------------------ */

export const EMPTY_CELL = { text: "", color: "", task: "", description: "", catId: null, subId: null, done: false, moved: false };

export function isEmptyContent(v) {
  return !v.text && !v.color && !v.task && !v.done && !v.moved;
}

/* Находит интервал, покрывающий точку rowStart (начало текущей строки
   сетки) - dayIntervals отсортирован по startMin, гарантия бэкенда. */
export function findIntervalAt(dayIntervals, rowStart) {
  if (!dayIntervals || dayIntervals.length === 0) return null;
  let low = 0;
  let high = dayIntervals.length;
  while (low < high) {
    const middle = low + Math.floor((high - low) / 2);
    if (dayIntervals[middle].startMin <= rowStart) low = middle + 1;
    else high = middle;
  }
  const candidate = dayIntervals[low - 1];
  return candidate && candidate.endMin > rowStart ? candidate : null;
}

/* Аналог старого readCellValue(cells, day, dayStart, rowIdx, cellMin) -
   но без пересчёта индексов, сразу по абсолютным минутам. */
export function readCellValue(dayIntervals, rowStart) {
  return findIntervalAt(dayIntervals, rowStart) || EMPTY_CELL;
}

export function isSameBrushRun(previous, current, rowStart) {
  return !!previous
    && previous.endMin >= rowStart
    && (previous.color || "") === (current.color || "")
    && (previous.catId || null) === (current.catId || null)
    && (previous.subId || null) === (current.subId || null);
}

export function brushHeaderKey(value) {
  return JSON.stringify([value.color || "", value.catId || null, value.subId || null]);
}

export function resolveBrushRunHeader(current, startsNewRun, headersByBrush) {
  if (current.text) return current.text;
  if (!startsNewRun || !current.color) return "";
  return headersByBrush.get(brushHeaderKey(current)) || "";
}

export function shouldHideRepeatedHeader(previous, current, rowStart, lastHeader) {
  return !!current.text
    && current.text === lastHeader
    && isSameBrushRun(previous, current, rowStart);
}

/* ------------------------------------------------------------------ */
/*  Оптимистичное локальное применение патча - ТОЧНАЯ копия того, что   */
/*  делает set_interval_tx в Rust (clip_range + merge_adjacent, см.      */
/*  lib.rs), только на клиенте и на массиве вместо SQL-таблицы. Нужна    */
/*  для мгновенного отклика при вводе - ждать round-trip до Rust на      */
/*  каждый символ означало бы вернуть ту самую задержку, которую Фаза 1  */
/*  специально убирала (memo/transition). После debounce-записи ответ   */
/*  бэкенда (авторитетный) заменяет локальный кэш этого дня целиком -    */
/*  см. Planner.jsx: reconcileDayFromBackend - так что даже если тут     */
/*  где-то накопится расхождение, оно самокорректируется за один цикл    */
/*  дебаунса, а не остаётся навсегда.                                    */
/* ------------------------------------------------------------------ */
export function applyPatchLocally(dayIntervals, startMin, endMin, patchFields) {
  const list = dayIntervals || [];
  const existing = findIntervalAt(list, startMin);
  const base = existing || { ...EMPTY_CELL, startMin, endMin };
  const merged = { ...base, ...patchFields, startMin, endMin };

  // 1) Вырезать/разбить всё, что перекрывается с [startMin, endMin).
  const next = [];
  for (const iv of list) {
    if (iv.endMin <= startMin || iv.startMin >= endMin) { next.push(iv); continue; }
    if (iv.startMin < startMin) next.push({ ...iv, endMin: startMin });
    if (iv.endMin > endMin) next.push({ ...iv, startMin: endMin });
  }

  // 2) Вставить новый ряд, если не пустой (пустой = delete, как и в Rust).
  if (!isEmptyContent(merged)) next.push(merged);

  next.sort((a, b) => a.startMin - b.startMin);

  // 3) Слияние с соседями идентичного содержимого (упрощённая RLE).
  return mergeAdjacentIdentical(next);
}

function contentEqual(a, b) {
  return a.text === b.text && a.color === b.color && a.task === b.task
    && a.description === b.description && a.catId === b.catId && a.subId === b.subId
    && !!a.done === !!b.done && !!a.moved === !!b.moved;
}

function mergeAdjacentIdentical(sortedList) {
  const out = [];
  for (const iv of sortedList) {
    const last = out[out.length - 1];
    if (last && last.endMin === iv.startMin && contentEqual(last, iv)) {
      out[out.length - 1] = { ...last, endMin: iv.endMin };
    } else {
      out.push(iv);
    }
  }
  return out;
}

/* Вырезает [startMin, endMin) без последующей вставки - локальный аналог
   ClearInterval, той же логикой (просто patch не добавляется). */
export function clearRangeLocally(dayIntervals, startMin, endMin) {
  const list = dayIntervals || [];
  const next = [];
  for (const iv of list) {
    if (iv.endMin <= startMin || iv.startMin >= endMin) { next.push(iv); continue; }
    if (iv.startMin < startMin) next.push({ ...iv, endMin: startMin });
    if (iv.endMin > endMin) next.push({ ...iv, startMin: endMin });
  }
  next.sort((a, b) => a.startMin - b.startMin);
  return next;
}

/* ------------------------------------------------------------------ */
/*  Агенда дня: события из списка интервалов одного дня.               */
/*  Раньше buildAgendaEvents обходила 5-минутные кванты и склеивала     */
/*  подряд идущие "активные" (цвет/текст/задача). Теперь интервалы уже  */
/*  готовые прогоны - склеиваем только СОПРИКАСАЮЩИЕСЯ активные (пара   */
/*  на 90 минут с текстом лишь на первых 30 = два интервала в БД, но    */
/*  ОДНА строка в агенде - поведение прежнее). Текст/задача - из        */
/*  первого непустого, done - если отмечен хоть один, цвет/категория -  */
/*  из первого (как и раньше брались с первого кванта).                 */
/* ------------------------------------------------------------------ */
export function buildAgendaEventsFromIntervals(dayIntervals) {
  const events = [];
  let cur = null;
  for (const v of dayIntervals || []) {
    const active = !!(v.color || v.text || v.task);
    if (!active) { if (cur) { events.push(cur); cur = null; } continue; }
    if (cur && cur.end === v.startMin) {
      cur.end = v.endMin;
      if (!cur.text && v.text) cur.text = v.text;
      if (!cur.task && v.task) cur.task = v.task;
      if (v.done) cur.done = true;
    } else {
      if (cur) events.push(cur);
      cur = { start: v.startMin, end: v.endMin, text: v.text || "", task: v.task || "", color: v.color || "", catId: v.catId || null, subId: v.subId || null, done: !!v.done };
    }
  }
  if (cur) events.push(cur);
  return events;
}

/* ------------------------------------------------------------------ */
/*  Шаблоны (Этап 2): конвертация между списком интервалов дня/недели   */
/*  и плоским TemplateInterval[] (та же форма, что ждёт Rust-команда    */
/*  applyWeekTemplate/applyDayTemplate - см. lib.rs: TemplateInterval). */
/* ------------------------------------------------------------------ */

// days: [ [...интервалы дня 0...], ..., [...дня 6...] ] -> плоский список
// { dayIdx, startMin, endMin, patch } - как для недельного шаблона.
export function daysToTemplateIntervals(days) {
  const out = [];
  (days || []).forEach((dayIntervals, dayIdx) => {
    (dayIntervals || []).forEach((v) => {
      out.push({
        dayIdx, startMin: v.startMin, endMin: v.endMin,
        patch: { text: v.text, color: v.color, task: v.task, description: v.description, catId: v.catId, subId: v.subId, done: v.done, moved: v.moved },
      });
    });
  });
  return out;
}

// Один день (список интервалов, БЕЗ dayIdx - для дневного шаблона).
export function dayToTemplateIntervals(dayIntervals) {
  return (dayIntervals || []).map((v) => ({
    dayIdx: 0, startMin: v.startMin, endMin: v.endMin,
    patch: { text: v.text, color: v.color, task: v.task, description: v.description, catId: v.catId, subId: v.subId, done: v.done, moved: v.moved },
  }));
}
