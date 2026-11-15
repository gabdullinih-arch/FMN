import assert from "node:assert/strict";
import { EMPTY_CELL, findIntervalAt, readCellValue, applyPatchLocally, clearRangeLocally, isEmptyContent, buildAgendaEventsFromIntervals, daysToTemplateIntervals, dayToTemplateIntervals, isSameBrushRun, resolveBrushRunHeader, shouldHideRepeatedHeader, findNextBrushHeaderCell } from "./intervals.mjs";

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log("  ok -", name); }
  catch (e) { failed++; console.log("  FAIL -", name, "\n    ", e.message); }
}

const iv = (s, e, o = {}) => ({ startMin: s, endMin: e, text: "", color: "", task: "", description: "", catId: null, subId: null, done: false, moved: false, ...o });

test("basic set and read", () => {
  const day = applyPatchLocally([], 540, 630, { text: "Тренировка", color: "#2E7D74" });
  assert.deepEqual(day, [{ text: "Тренировка", color: "#2E7D74", task: "", description: "", catId: null, subId: null, done: false, moved: false, startMin: 540, endMin: 630 }]);
});

test("partial patch keeps other fields (как partial_patch_keeps_other_fields в Rust)", () => {
  let day = applyPatchLocally([], 540, 630, { color: "#B8834A" });
  day = applyPatchLocally(day, 540, 630, { text: "Дедлайн" });
  assert.equal(day.length, 1);
  assert.equal(day[0].text, "Дедлайн");
  assert.equal(day[0].color, "#B8834A", "цвет не должен стереться патчем без поля color");
});

test("explicit null clears field", () => {
  let day = applyPatchLocally([], 540, 630, { text: "X", catId: "c1" });
  day = applyPatchLocally(day, 540, 630, { catId: null });
  assert.equal(day[0].catId, null);
  assert.equal(day[0].text, "X");
});

test("overlap splits old interval into surviving edges", () => {
  let day = applyPatchLocally([], 540, 660, { text: "Старое", color: "#3B5AA6" });
  day = applyPatchLocally(day, 570, 600, { text: "Новое", color: "#A63B45" });
  day.sort((a, b) => a.startMin - b.startMin);
  assert.deepEqual(day.map(r => [r.startMin, r.endMin, r.text]), [
    [540, 570, "Старое"], [570, 600, "Новое"], [600, 660, "Старое"],
  ]);
});

test("fully covered old interval disappears", () => {
  let day = applyPatchLocally([], 570, 600, { text: "Маленькое" });
  day = applyPatchLocally(day, 540, 660, { text: "Большое" });
  assert.deepEqual(day.map(r => [r.startMin, r.endMin, r.text]), [[540, 660, "Большое"]]);
});

test("adjacent identical content merges (RLE)", () => {
  let day = applyPatchLocally([], 540, 570, { text: "Блок", color: "#2E7D74" });
  day = applyPatchLocally(day, 570, 600, { text: "Блок", color: "#2E7D74" });
  assert.deepEqual(day.map(r => [r.startMin, r.endMin, r.text]), [[540, 600, "Блок"]]);
});

test("adjacent different content does not merge", () => {
  let day = applyPatchLocally([], 540, 570, { text: "A" });
  day = applyPatchLocally(day, 570, 600, { text: "B" });
  assert.equal(day.length, 2);
});

test("clear removes without reinserting", () => {
  let day = applyPatchLocally([], 540, 660, { text: "X" });
  day = clearRangeLocally(day, 570, 600);
  day.sort((a, b) => a.startMin - b.startMin);
  assert.deepEqual(day.map(r => [r.startMin, r.endMin, r.text]), [[540, 570, "X"], [600, 660, "X"]]);
});

test("empty patch acts as clear", () => {
  const day = applyPatchLocally([], 540, 570, { text: "" });
  assert.deepEqual(day, []);
});

test("findIntervalAt / readCellValue", () => {
  const day = [{ startMin: 540, endMin: 600, text: "Бег", color: "", task: "", description: "", catId: null, subId: null, done: false, moved: false }];
  assert.equal(findIntervalAt(day, 550).text, "Бег");
  assert.equal(findIntervalAt(day, 540).text, "Бег", "startMin включается");
  assert.equal(findIntervalAt(day, 600), null, "endMin не включается (полуоткрытый интервал)");
  assert.equal(findIntervalAt(day, 539), null, "значение до интервала не совпадает");
  assert.deepEqual(readCellValue(day, 700), EMPTY_CELL);
});

test("findIntervalAt находит интервал в большом отсортированном списке", () => {
  const day = Array.from({ length: 288 }, (_, index) => iv(index * 5, index * 5 + 5, { text: `Блок ${index}` }));
  assert.equal(findIntervalAt(day, 0).text, "Блок 0");
  assert.equal(findIntervalAt(day, 715).text, "Блок 143");
  assert.equal(findIntervalAt(day, 719).text, "Блок 143");
  assert.equal(findIntervalAt(day, 720).text, "Блок 144");
  assert.equal(findIntervalAt(day, 1440), null);
});

test("заголовок остаётся одним в непрерывном сегменте той же заливки", () => {
  const first = iv(540, 570, { text: "Работа", color: "#A8552E", catId: "work" });
  const continuation = iv(570, 600, { color: "#A8552E", catId: "work", task: "иная метаинформация" });
  const repeatedTitle = iv(600, 630, { text: "Работа", color: "#A8552E", catId: "work" });
  assert.equal(isSameBrushRun(first, continuation, 570), true);
  assert.equal(isSameBrushRun(continuation, repeatedTitle, 600, "Работа"), true);
  assert.equal(isSameBrushRun(first, repeatedTitle, 600), false, "разрыв между интервалами не считается непрерывным");
  assert.equal(isSameBrushRun(first, iv(570, 600, { color: "#2E7D74", catId: "work" }), 570), false);
  assert.equal(shouldHideRepeatedHeader(continuation, repeatedTitle, 600, "Работа"), true);
  assert.equal(shouldHideRepeatedHeader(continuation, iv(600, 630, { text: "Другое дело", color: "#A8552E", catId: "work" }), 600, "Работа"), false);
  assert.equal(shouldHideRepeatedHeader(first, repeatedTitle, 600, "Работа"), false);
});

test("название категории не дублируется после ячейки-продолжения той же кисти", () => {
  const continuation = iv(570, 600, { color: "#A8552E", catId: "work" });
  const repeatedCategoryTitle = iv(600, 630, { text: "Работа", color: "#A8552E", catId: "work" });
  const priorTitle = iv(570, 600, { text: "Старый заголовок", color: "#A8552E", catId: "work" });
  const distinctTitle = iv(600, 630, { text: "Встреча", color: "#A8552E", catId: "work" });

  assert.equal(isSameBrushRun(continuation, repeatedCategoryTitle, 600, "Работа"), true);
  assert.equal(isSameBrushRun(priorTitle, repeatedCategoryTitle, 600, "Работа"), true, "название той же категории не должно повторяться подряд из-за прошлого текста");
  assert.equal(resolveBrushRunHeader(repeatedCategoryTitle, false), "");
  assert.equal(shouldHideRepeatedHeader(continuation, repeatedCategoryTitle, 600, "Работа"), true);
  assert.equal(isSameBrushRun(continuation, distinctTitle, 600, "Работа"), false, "другое название не должно скрываться как продолжение категории");
});

test("после стирания клетки заголовок повторяется в новом фрагменте той же заливки", () => {
  const first = iv(540, 570, { text: "Работа", color: "#A8552E", catId: "work" });
  const continuation = iv(570, 600, { color: "#A8552E", catId: "work" });
  const afterGap = iv(630, 660, { color: "#A8552E", catId: "work" });
  const differentBrush = iv(630, 660, { color: "#2E7D74", catId: "other" });

  assert.equal(resolveBrushRunHeader(first, true), "Работа");
  assert.equal(resolveBrushRunHeader(continuation, false), "");
  assert.equal(resolveBrushRunHeader(EMPTY_CELL, false), "");
  assert.equal(resolveBrushRunHeader(afterGap, true), "", "a header must not cross an empty cell");
  assert.equal(resolveBrushRunHeader(differentBrush, true), "", "a header must not cross a color/category change");
});


test("agenda: заголовок на первых 30 мин + остаток без текста = ОДНА строка (как раньше)", () => {
  const ev = buildAgendaEventsFromIntervals([iv(540, 570, { text: "Пара", color: "#3B5AA6", catId: "c1" }), iv(570, 630, { color: "#3B5AA6", catId: "c1" })]);
  assert.equal(ev.length, 1);
  assert.deepEqual([ev[0].start, ev[0].end, ev[0].text], [540, 630, "Пара"]);
});

test("agenda: разрыв во времени разделяет события", () => {
  const ev = buildAgendaEventsFromIntervals([iv(540, 570, { text: "A" }), iv(600, 660, { text: "B" })]);
  assert.equal(ev.length, 2);
});

test("agenda: done, если отмечен хоть один кусок; текст/задача - из первого непустого", () => {
  const ev = buildAgendaEventsFromIntervals([iv(540, 570, { color: "#111" }), iv(570, 600, { text: "Позже", task: "T", color: "#111", done: true })]);
  assert.equal(ev.length, 1);
  assert.equal(ev[0].text, "Позже"); assert.equal(ev[0].task, "T"); assert.equal(ev[0].done, true);
});

test("agenda: интервал только с done/moved (без цвета/текста/задачи) - не событие", () => {
  assert.deepEqual(buildAgendaEventsFromIntervals([iv(540, 570, { done: true })]), []);
});

test("agenda: пусто / undefined", () => {
  assert.deepEqual(buildAgendaEventsFromIntervals([]), []);
  assert.deepEqual(buildAgendaEventsFromIntervals(undefined), []);
});


test("шаблон недели: конвертация days -> плоский TemplateInterval[]", () => {
  const days = [[iv(540, 600, { text: "Пн" })], [], [iv(720, 780, { text: "Ср", catId: "c1" })], [], [], [], []];
  const flat = daysToTemplateIntervals(days);
  assert.equal(flat.length, 2);
  assert.deepEqual([flat[0].dayIdx, flat[0].startMin, flat[0].endMin, flat[0].patch.text], [0, 540, 600, "Пн"]);
  assert.deepEqual([flat[1].dayIdx, flat[1].patch.catId], [2, "c1"]);
});

test("шаблон дня: dayIdx всегда 0", () => {
  const flat = dayToTemplateIntervals([iv(600, 660, { text: "X" })]);
  assert.equal(flat.length, 1);
  assert.equal(flat[0].dayIdx, 0);
});

test("шаблон: пустая неделя -> пустой список", () => {
  assert.deepEqual(daysToTemplateIntervals([[], [], [], [], [], [], []]), []);
  assert.deepEqual(daysToTemplateIntervals(undefined), []);
});

test("brush title moves to next cell when the first painted cell is erased", () => {
  const day = [
    iv(540, 570, { text: "Work", color: "#A8552E", catId: "work" }),
    iv(570, 600, { color: "#A8552E", catId: "work" }),
  ];
  assert.deepEqual(findNextBrushHeaderCell(day, 540, 570), { startMin: 570, text: "Work" });
  assert.equal(findNextBrushHeaderCell(day, 540, 600), null, "a longer interval keeps its title on the surviving remainder");
  assert.equal(findNextBrushHeaderCell([day[0], { ...day[1], color: "#2E7D74" }], 540, 570), null, "do not move a title across a color change");
});

test("erasing a middle cell carries the title to the detached continuation", () => {
  const day = [
    iv(540, 570, { text: "Work", color: "#A8552E", catId: "work" }),
    iv(570, 660, { color: "#A8552E", catId: "work" }),
  ];
  const carry = findNextBrushHeaderCell(day, 600, 630);
  assert.deepEqual(carry, { startMin: 630, text: "Work" });

  const split = clearRangeLocally(day, 600, 630);
  assert.equal(readCellValue(split, 630).text, "");
  const reheaded = applyPatchLocally(split, 630, 660, { text: carry.text });
  assert.equal(readCellValue(reheaded, 630).text, "Work");
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
