import assert from "node:assert/strict";
import { parse } from "../src/script/parser.js";
import { runPlanScript, runPlanWatch, ScriptRuntimeError } from "../src/script/interpreter.js";

const category = { id: "work", name: "Работа", color: "#123456", subs: [] };
const context = () => ({
  categories: [structuredClone(category)],
  settings: { dayStart: 360, dayEnd: 1440, cellMin: 30 },
  createdYears: [2026],
  daysByDate: {},
});

let passed = 0;
const test = (name, fn) => {
  fn();
  passed++;
  console.log(`  ok - ${name}`);
};

test("parses indented loops, conditions, dates, and named arguments", () => {
  const tree = parse("for неделя in weeks(01.09.2026, count=2):\n    if неделя.index % 2 == 0:\n        log(неделя.start)\n");
  assert.equal(tree.body[0].type, "For");
  assert.equal(tree.body[0].body[0].type, "If");
});

test("supports fluent multiline selection setters", () => {
  const result = runPlanScript(
    "days(01.09.2026)[0].time(12:00..13:00)\n" +
    "    .category('Работа')\n" +
    "    .text('Фокус')\n",
    context(),
  );
  assert.equal(result.operations.length, 1);
  assert.equal(result.operations[0].patch.text, "Фокус");
});

test("plans one interval on each matching week", () => {
  const result = runPlanScript(
    "for week in weeks(01.09.2026, count=4):\n    if week.index % 2 == 0:\n        week.mon.time(12:00..13:00).category('Работа').text('Фокус')\n",
    context(),
  );
  assert.deepEqual(result.operations.map(({ date, startMin, endMin }) => [date, startMin, endMin]), [
    ["2026-09-07", 720, 780],
    ["2026-09-21", 720, 780],
  ]);
  assert.equal(result.daysByDate["2026-09-07"][0].text, "Фокус");
});

test("plans all-day events and recurring intervals", () => {
  const result = runPlanScript(
    "days(01.11.2026..03.11.2026).all_day.set('Отпуск')\n" +
    "recur(weekday=mon, time=12:00..13:00, category='Работа', weeks=weeks(01.09.2026..30.09.2026), pattern='even')\n",
    context(),
  );
  assert.equal(result.operations[0].type, "SetAllDay");
  assert.equal(result.operations[0].event.startDate, "2026-11-01");
  assert.deepEqual(result.operations.slice(1).map((operation) => operation.date), ["2026-09-07", "2026-09-21"]);
});

test("subsequent reads see operations generated during the same run", () => {
  const result = runPlanScript(
    "day = days(01.09.2026)[0]\n" +
    "day.time(12:00..13:00).text('Занято')\n" +
    "if day.time(12:00..13:00).is_empty:\n" +
    "    day.time(12:00..13:00).text('Ошибочно')\n",
    context(),
  );
  assert.equal(result.operations.length, 1);
  assert.equal(result.daysByDate["2026-09-01"][0].text, "Занято");
});

test("rejects non-boolean conditions", () => {
  assert.throws(() => runPlanScript("if 1:\n    log('x')\n", context()), ScriptRuntimeError);
});

test("rejects out-of-window time in strict mode", () => {
  assert.throws(
    () => runPlanScript("days(01.09.2026)[0].time(05:00..06:00).text('Рано')\n", context()),
    /выходит за рабочее окно/,
  );
});

test("strict off clips intervals to the configured work window", () => {
  const result = runPlanScript(
    "# strict: off\ndays(01.09.2026)[0].time(05:00..07:00).text('Рано')\n",
    context(),
  );
  assert.deepEqual(
    result.operations.map(({ startMin, endMin }) => [startMin, endMin]),
    [[360, 420]],
  );
});

test("interpolates expressions in strings at runtime", () => {
  const result = runPlanScript(
    "week = weeks(01.09.2026)[0]\n" +
    "log(\"Неделя ${week.index}: ${week.mon.date.weekday}\")\n",
    context(),
  );
  assert.deepEqual(result.log, ["Неделя 1: mon"]);
});

test("read-only terminal counts and dumps existing intervals", () => {
  const ctx = context();
  ctx.readOnly = true;
  ctx.daysByDate["2026-09-01"] = [{
    startMin: 720, endMin: 750, text: "Фокус", task: "", description: "",
    color: "#123456", catId: "work", subId: null, done: false, moved: false,
  }];
  const result = runPlanScript(
    "day = days(01.09.2026)[0]\n" +
    "log(count_cells(day))\n" +
    "dump(day)\n",
    ctx,
  );
  assert.equal(result.log[0], "6");
  assert.deepEqual(result.result, [{
    date: "2026-09-01",
    ...ctx.daysByDate["2026-09-01"][0],
  }]);
});

test("read-only terminal rejects any data mutation", () => {
  assert.throws(
    () => runPlanScript("days(01.09.2026)[0].time(12:00..13:00).text('No')\n", {
      ...context(),
      readOnly: true,
    }),
    /доступно только чтение/,
  );
});

test("supports multiple assignment and indexing", () => {
  const result = runPlanScript("first, second = [11, 12]\n[first, second][1]\n", context());
  assert.equal(result.result, 12);
});

test("supports named arguments in user-defined functions", () => {
  const result = runPlanScript(
    "def combine(left, right):\n" +
    "    return left * 10 + right\n" +
    "combine(right=3, left=2)\n",
    context(),
  );
  assert.equal(result.result, 23);
  assert.throws(
    () => runPlanScript(
      "def combine(left, right):\n" +
      "    return left + right\n" +
      "combine(1, left=2, right=3)\n",
      context(),
    ),
    /передан и позиционно, и по имени/,
  );
});

test("find returns ordered interval selections and can rewrite them", () => {
  const ctx = context();
  ctx.daysByDate["2026-09-01"] = [
    { startMin: 540, endMin: 600, text: "Лекция", task: "", description: "", color: "#123456", catId: "work", subId: null, done: false, moved: false },
    { startMin: 630, endMin: 660, text: "Другое", task: "", description: "", color: "#123456", catId: "work", subId: null, done: true, moved: false },
  ];
  const result = runPlanScript(
    "found = find(days(01.09.2026), category='Работа', done=false)\n" +
    "for item in found:\n" +
    "    item.text('Обновлено')\n" +
    "len(found)\n",
    ctx,
  );
  assert.equal(result.result, 1);
  assert.equal(result.operations.length, 1);
  assert.equal(result.daysByDate["2026-09-01"][0].text, "Обновлено");
});

test("applies a week template only to empty target cells when requested", () => {
  const ctx = context();
  ctx.templates = [{
    name: "Одна задача",
    type: "week",
    data: [{ dayIdx: 0, startMin: 720, endMin: 780, patch: { text: "Шаблон", color: "#123456" } }],
  }];
  ctx.daysByDate["2026-09-07"] = [{
    startMin: 720, endMin: 750, text: "Уже занято", task: "", description: "",
    color: "#123456", catId: null, subId: null, done: false, moved: false,
  }];
  const result = runPlanScript(
    "template('Одна задача').apply_to(weeks(07.09.2026), mode='fill_empty')\n",
    ctx,
  );
  assert.equal(result.operations.length, 0);
});

test("creates categories and subcategories once and uses them in a selection", () => {
  const result = runPlanScript(
    "cat = category('Новая', new=true, color=#654321)\n" +
    "sub = cat.subcategory('Подзадача', new=true)\n" +
    "days(01.09.2026)[0].time(12:00..13:00).category(cat).subcategory(sub)\n",
    context(),
  );
  assert.deepEqual(result.operations.map((operation) => operation.type), ["AddCategory", "AddSubcategory", "SetInterval"]);
  assert.equal(result.operations[2].patch.catId, result.operations[0].category.id);
  assert.equal(result.operations[2].patch.subId, result.operations[1].subcategory.id);
});

test("recur creates matching weekday events from its start week", () => {
  const result = runPlanScript(
    "recur(weekday=mon, time=12:00..13:00, category='Работа', weeks=weeks(01.09.2026, count=4), pattern='even')\n",
    context(),
  );
  assert.deepEqual(result.operations.map((operation) => operation.date), ["2026-09-07", "2026-09-21"]);
});

test("supports duration arithmetic and duration unit properties", () => {
  const result = runPlanScript(
    "day = days(01.09.2026)[0]\n" +
    "duration = 3h30m\n" +
    "day.time(12:00..12:00 + 1h30m).text(\"${duration.minutes} / ${duration.hours} / ${duration.days}\")\n",
    context(),
  );
  assert.equal(result.operations[0].endMin, 810);
  assert.equal(result.operations[0].patch.text, "210 / 3.5 / 0.14583333333333334");
});

test("supports filtered list comprehensions and sum", () => {
  const result = runPlanScript("[value * 2 for value in [1, 2, 3] if value > 1]\n", context());
  assert.deepEqual(result.result, [4, 6]);
  assert.equal(runPlanScript("sum([1, 2, 3])\n", context()).result, 6);
});

test("evaluates day watchers and records their data dependencies", () => {
  const ctx = context();
  ctx.daysByDate["2026-08-31"] = [];
  ctx.daysByDate["2026-09-01"] = [{
    startMin: 540, endMin: 600, text: "Фокус", task: "", description: "",
    color: "#123456", catId: "work", subId: null, done: false, moved: false,
  }];
  const code = "watch every day:\n" +
    "    recent = days(date_add(day.date, -1)..day.date)\n" +
    "    if sum([item.colored_hours for item in recent]) > 0:\n" +
    "        day.indicator.set(color=#FF0000, text='Занято')\n" +
    "    else:\n" +
    "        day.indicator.clear()\n";
  const result = runPlanWatch(code, ctx, { scope: "day", date: "2026-09-01" });
  assert.deepEqual(result.indicator, { color: "#FF0000", text: "Занято" });
  assert.deepEqual(result.dependencies, ["2026-08-31", "2026-09-01"]);
  assert.throws(
    () => runPlanWatch("watch every day:\n    day.time(12:00..13:00).text('No')\n", ctx, {
      scope: "day", date: "2026-09-01",
    }),
    /только собственный indicator/,
  );
  const wideContext = context();
  const wideRange = "watch every day:\n" +
    "    span = days(01.09.2026..31.10.2026)\n" +
    "    total = sum([item.colored_hours for item in span])\n" +
    "    day.indicator.set(text='x')\n";
  for (let offset = -7; offset < 70; offset++) {
    const date = new Date(2026, 8, 1 + offset);
    const isoDate = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    wideContext.daysByDate[isoDate] = [];
  }
  assert.throws(
    () => runPlanWatch(wideRange, wideContext, { scope: "day", date: "2026-09-01" }),
    /ограничение 60 дней/,
  );
});

test("supports list append and index assignment", () => {
  const result = runPlanScript("values = [1]\nvalues.append(2)\nvalues[0] = 3\nvalues[1]\n", context());
  assert.equal(result.result, 2);
});

test("reports dates missing from the loaded context for dynamic date expressions", () => {
  const result = runPlanScript(
    "day = days(date_add(today(), 28), count=1)[0]\n" +
    "day.time(12:00..12:30).text('Future task')\n",
    context(),
  );
  assert.deepEqual(result.unloadedDates, [result.operations[0].date]);
});

console.log(`\n${passed} passed`);
