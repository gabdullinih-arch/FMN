import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import fs from "fs";
import { applyPatchLocally, clearRangeLocally } from "./intervals.mjs";

const bundleSrc = fs.readFileSync("./app/frontend/bundle.js", "utf-8");
const dom = new JSDOM(`<!DOCTYPE html><html><body><div id="root"></div></body></html>`, {
  runScripts: "outside-only", pretendToBeVisual: true, url: "http://localhost/",
});
const { window } = dom;

window.IntersectionObserver = class { constructor(cb){this.cb=cb;} observe(){} unobserve(){} disconnect(){} };
window.Element.prototype.scrollIntoView = function () {};
window.HTMLElement.prototype.getBoundingClientRect = function () { return {top:0,left:0,right:0,bottom:0,width:0,height:0}; };
window.matchMedia = window.matchMedia || (() => ({ matches:false, addListener(){}, removeListener(){} }));

// ---- Мок Rust-бэкенда - переиспользует ту же (уже протестированную)
// клиентскую логику clip/merge для set_interval, что и Planner.jsx сам
// использует для оптимистичного локального обновления. ----
const db = {
  intervalsByDate: {}, // date -> [...интервалы...]
  settings: { dayStart: 360, dayEnd: 1440, cellMin: 30, zoom: 1, theme: "calm", notificationsEnabled: false, notifyLeadMin: 10, lastAllDayNotifyDate: null },
  categories: [
    { id: "c1", name: "Спорт", color: "#2E7D74" },
    { id: "c2", name: "Работа", color: "#3B5AA6" },
  ],
  subcategories: [],
  templates: [], recurringRules: [], todos: [], allDayEvents: [], weekLabels: {}, weekQuantums: {}, weekDayBounds: {}, createdYears: [],
  planScriptWatchers: [], watchIndicators: [],
};

function mondayPlusDays(monday, dayIdx) {
  const d = new Date(monday + "T00:00:00");
  d.setDate(d.getDate() + dayIdx);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const futureTarget = new Date();
futureTarget.setDate(futureTarget.getDate() + 140);
const futureTargetDate = `${futureTarget.getFullYear()}-${String(futureTarget.getMonth() + 1).padStart(2, "0")}-${String(futureTarget.getDate()).padStart(2, "0")}`;
const futureTargetMonday = new Date(futureTarget);
futureTargetMonday.setDate(futureTargetMonday.getDate() - ((futureTargetMonday.getDay() + 6) % 7));
const futureMondayIso = `${futureTargetMonday.getFullYear()}-${String(futureTargetMonday.getMonth() + 1).padStart(2, "0")}-${String(futureTargetMonday.getDate()).padStart(2, "0")}`;
const futureOtherDate = mondayPlusDays(futureMondayIso, 2);
const futureWeekBefore = {
  [futureTargetDate]: [{ startMin: 840, endMin: 900, text: "Existing future item", task: "", description: "", color: "#2E7D74", catId: "c1", subId: null, done: false, moved: false }],
  [futureOtherDate]: [{ startMin: 600, endMin: 660, text: "Other day in future week", task: "", description: "", color: "#2E7D74", catId: "c1", subId: null, done: false, moved: false }],
};

let invokeLog = [];
window.__TAURI_INTERNALS__ = {
  metadata: { currentWindow: { label: "main" } },
  invoke: async (cmd, args) => {
    invokeLog.push(cmd);
    switch (cmd) {
      case "plugin:window|set_title": return null;
      case "cmd_get_week_intervals": {
        const week = [];
        for (let d = 0; d < 7; d++) {
          const date = mondayPlusDays(args.monday, d);
          week.push(db.intervalsByDate[date] || []);
        }
        return week;
      }
      case "cmd_get_week_data": {
        const days = [];
        for (let d = 0; d < 7; d++) days.push(db.intervalsByDate[mondayPlusDays(args.monday, d)] || []);
        return { days, cellMin: db.weekQuantums[args.monday] ?? null, ...(db.weekDayBounds[args.monday] || {}) };
      }
      case "cmd_get_day_intervals":
        return db.intervalsByDate[args.date] || [];
      case "cmd_set_interval": {
        const cur = db.intervalsByDate[args.date] || [];
        db.intervalsByDate[args.date] = applyPatchLocally(cur, args.startMin, args.endMin, args.patch);
        return null;
      }
      case "cmd_restore_week": {
        for (let d = 0; d < 7; d++) {
          const date = mondayPlusDays(args.monday, d);
          const restored = (args.days[d] || []).slice();
          if (restored.length) db.intervalsByDate[date] = restored;
          else delete db.intervalsByDate[date];
        }
        return null;
      }
      case "cmd_restore_weeks": {
        for (const snapshot of args.snapshots) {
          for (let d = 0; d < 7; d++) {
            const date = mondayPlusDays(snapshot.monday, d);
            const restored = (snapshot.days[d] || []).slice();
            if (restored.length) db.intervalsByDate[date] = restored;
            else delete db.intervalsByDate[date];
          }
        }
        return null;
      }
      case "cmd_clear_interval": {
        const cur = db.intervalsByDate[args.date] || [];
        const updated = clearRangeLocally(cur, args.startMin, args.endMin);
        if (updated.length) db.intervalsByDate[args.date] = updated;
        else delete db.intervalsByDate[args.date];
        return null;
      }
      case "cmd_apply_planscript_operations":
        for (const operation of args.operations) {
          if (operation.type === "SetInterval") {
            const cur = db.intervalsByDate[operation.date] || [];
            db.intervalsByDate[operation.date] = applyPatchLocally(cur, operation.startMin, operation.endMin, operation.patch);
          } else if (operation.type === "ClearInterval") {
            const cur = db.intervalsByDate[operation.date] || [];
            const updated = clearRangeLocally(cur, operation.startMin, operation.endMin);
            if (updated.length) db.intervalsByDate[operation.date] = updated;
            else delete db.intervalsByDate[operation.date];
          } else if (operation.type === "RestoreWeek") {
            for (let day = 0; day < 7; day++) {
              const date = mondayPlusDays(operation.monday, day);
              const rows = (operation.days[day] || []).slice();
              if (rows.length) db.intervalsByDate[date] = rows;
              else delete db.intervalsByDate[date];
            }
          } else if (operation.type === "AddCreatedYear") {
            if (!db.createdYears.includes(operation.year)) db.createdYears.push(operation.year);
          } else {
            throw new Error(`мок PlanScript не реализует операцию: ${operation.type}`);
          }
        }
        return null;
      case "cmd_get_settings": return db.settings;
      case "cmd_update_settings": Object.assign(db.settings, args.patch); return null;
      case "cmd_get_week_quantum": return db.weekQuantums[args.monday] ?? null;
      case "cmd_get_week_day_bounds": return db.weekDayBounds[args.monday] ?? null;
      case "cmd_set_week_day_bounds":
        if (args.dayStart == null && args.dayEnd == null) delete db.weekDayBounds[args.monday];
        else db.weekDayBounds[args.monday] = { dayStart: args.dayStart, dayEnd: args.dayEnd };
        return null;
      case "cmd_set_week_quantum":
        if (args.cellMin == null) delete db.weekQuantums[args.monday];
        else db.weekQuantums[args.monday] = args.cellMin;
        return null;
      case "cmd_list_categories": return db.categories;
      case "cmd_list_subcategories": return db.subcategories;
      case "cmd_list_templates": return db.templates;
      case "cmd_list_planscripts": return [];
      case "cmd_list_planscript_watchers": return db.planScriptWatchers;
      case "cmd_save_planscript_watcher": {
        const index = db.planScriptWatchers.findIndex((watcher) => watcher.id === args.watcher.id);
        if (index < 0) db.planScriptWatchers.push(args.watcher);
        else db.planScriptWatchers[index] = args.watcher;
        db.watchIndicators = db.watchIndicators.filter((item) => item.watcherId !== args.watcher.id);
        return null;
      }
      case "cmd_delete_planscript_watcher":
        db.planScriptWatchers = db.planScriptWatchers.filter((watcher) => watcher.id !== args.id);
        db.watchIndicators = db.watchIndicators.filter((item) => item.watcherId !== args.id);
        return null;
      case "cmd_save_watch_result": {
        db.watchIndicators = db.watchIndicators.filter((item) => !(item.watcherId === args.watcherId && item.scope === args.scope && item.ownerKey === args.ownerKey));
        if (args.indicator) db.watchIndicators.push({ watcherId: args.watcherId, scope: args.scope, ownerKey: args.ownerKey, ...args.indicator });
        return null;
      }
      case "cmd_list_watch_indicators":
        return db.watchIndicators.filter((item) => item.scope === args.scope && item.ownerKey >= args.from && item.ownerKey <= args.to);
      case "cmd_add_template": db.templates.push({ id: args.id, name: args.name, kind: args.kind, data: args.data }); return null;
      case "cmd_delete_template": db.templates = db.templates.filter((t) => t.id !== args.id); return null;
      case "cmd_apply_week_template": {
        for (const monday of args.targetMondays) {
          for (let d = 0; d < 7; d++) {
            const date = mondayPlusDays(monday, d);
            if (args.mode === "overwrite" && !(args.exceptions || []).includes(date)) db.intervalsByDate[date] = [];
          }
          for (const item of args.template) {
            const date = mondayPlusDays(monday, item.dayIdx);
            if ((args.exceptions || []).includes(date)) continue;
            const cur = db.intervalsByDate[date] || [];
            if (args.mode === "interactivePerCell") {
              const conflict = cur.some((interval) => interval.startMin < item.endMin && interval.endMin > item.startMin);
              const decision = (args.decisions || []).find((d) => d.date === date && d.startMin === item.startMin && d.endMin === item.endMin);
              if (conflict && !decision?.overwrite) continue;
            }
            db.intervalsByDate[date] = applyPatchLocally(cur, item.startMin, item.endMin, item.patch);
          }
        }
        return null;
      }
      case "cmd_apply_day_template": {
        for (const date of args.targetDates) {
          if (args.mode === "overwrite") db.intervalsByDate[date] = [];
          for (const item of args.template) {
            const cur = db.intervalsByDate[date] || [];
            if (args.mode === "interactivePerCell") {
              const conflict = cur.some((interval) => interval.startMin < item.endMin && interval.endMin > item.startMin);
              const decision = (args.decisions || []).find((d) => d.date === date && d.startMin === item.startMin && d.endMin === item.endMin);
              if (conflict && !decision?.overwrite) continue;
            }
            db.intervalsByDate[date] = applyPatchLocally(cur, item.startMin, item.endMin, item.patch);
          }
        }
        return null;
      }
      case "cmd_list_recurring_rules": return db.recurringRules;
      case "cmd_add_recurring_rule": db.recurringRules.push({ ...args.rule }); return null;
      case "cmd_delete_recurring_rule": db.recurringRules = db.recurringRules.filter((r) => r.id !== args.id); return null;
      case "cmd_apply_recurring_rule": {
        // Паттерн-матчинг сам по себе уже проверен 12 Rust-тестами -
        // здесь для смоук-теста достаточно упрощённой версии ("all"/"even").
        const r = args.rule;
        let applied = 0;
        for (let idx = 0; idx < r.weeksCount; idx++) {
          const weekNum = idx + 1;
          const matches = r.patternType === "all" ? true : r.patternType === "even" ? weekNum % 2 === 0 : r.patternType === "odd" ? weekNum % 2 !== 0 : true;
          if (!matches) continue;
          const monday = mondayPlusDays(r.anchorMonday, idx * 7);
          const date = mondayPlusDays(monday, r.dayIdx);
          const cur = db.intervalsByDate[date] || [];
          db.intervalsByDate[date] = applyPatchLocally(cur, r.startMin, r.startMin + r.durationMin, r.patch);
          applied++;
        }
        return applied;
      }
      case "cmd_list_todos": return db.todos;
      case "cmd_add_todo": db.todos.push({ id: args.id, text: args.text, done: false, createdAt: args.createdAt, sortOrder: args.sortOrder }); return null;
      case "cmd_toggle_todo": { const t = db.todos.find((x) => x.id === args.id); if (t) t.done = !t.done; return null; }
      case "cmd_delete_todo": db.todos = db.todos.filter((x) => x.id !== args.id); return null;
      case "cmd_reorder_todos":
        args.ids.forEach((id, sortOrder) => { const todo = db.todos.find((item) => item.id === id); if (todo) todo.sortOrder = sortOrder; });
        db.todos.sort((a, b) => a.sortOrder - b.sortOrder);
        return null;
      case "cmd_restore_todo_drop": {
        for (let d = 0; d < 7; d++) {
          const date = mondayPlusDays(args.monday, d);
          const restored = (args.days[d] || []).slice();
          if (restored.length) db.intervalsByDate[date] = restored;
          else delete db.intervalsByDate[date];
        }
        db.todos = [...db.todos.filter((todo) => todo.id !== args.todo.id), args.todo].sort((a, b) => a.sortOrder - b.sortOrder);
        return null;
      }
      case "cmd_list_all_all_day_events": return db.allDayEvents;
      case "cmd_set_all_day":
        db.allDayEvents.push({ id: args.id, text: args.text, catId: args.catId, color: args.color, startDate: args.startDate, endDate: args.endDate });
        return null;
      case "cmd_clear_all_day": db.allDayEvents = db.allDayEvents.filter((e) => e.id !== args.id); return null;
      case "cmd_get_week_labels": return Object.entries(db.weekLabels);
      case "cmd_tracker_stats_by_month": {
        const byCat = {};
        for (const [date, list] of Object.entries(db.intervalsByDate)) {
          if (!date.startsWith(String(args.year))) continue;
          const month = Number(date.slice(5, 7)) - 1;
          const seen = new Set();
          for (const v of list) {
            if (!v.catId) continue;
            const unitKey = v.catId + "|" + (v.subId || "");
            if (seen.has(unitKey)) continue; // одна единица на (дату,категорию,подкатегорию)
            seen.add(unitKey);
            byCat[v.catId] = byCat[v.catId] || { catId: v.catId, planned: Array(12).fill(0), moved: Array(12).fill(0), done: Array(12).fill(0) };
            byCat[v.catId].planned[month]++;
            if (list.some((x) => x.catId === v.catId && (x.subId || "") === (v.subId || "") && x.moved)) byCat[v.catId].moved[month]++;
            if (list.some((x) => x.catId === v.catId && (x.subId || "") === (v.subId || "") && x.done)) byCat[v.catId].done[month]++;
          }
        }
        return Object.values(byCat);
      }
      case "cmd_minutes_by_category": {
        const byCat = {};
        for (const [date, list] of Object.entries(db.intervalsByDate)) {
          if (date < args.dateFrom || date > args.dateTo) continue;
          for (const v of list) {
            if (!v.catId) continue;
            byCat[v.catId] = (byCat[v.catId] || 0) + (v.endMin - v.startMin);
          }
        }
        return Object.entries(byCat);
      }
      case "cmd_tracker_stats_range": {
        const byCat = {};
        for (const [date, list] of Object.entries(db.intervalsByDate)) {
          if (date < args.dateFrom || date > args.dateTo) continue;
          const seen = new Set();
          for (const v of list) {
            if (!v.catId) continue;
            const unitKey = v.catId + "|" + (v.subId || "");
            if (seen.has(unitKey)) continue;
            seen.add(unitKey);
            byCat[v.catId] = byCat[v.catId] || { catId: v.catId, planned: 0, moved: 0, done: 0 };
            byCat[v.catId].planned++;
          }
        }
        return Object.values(byCat);
      }
      case "cmd_set_week_label": if (args.label) db.weekLabels[args.monday] = args.label; else delete db.weekLabels[args.monday]; return null;
      case "cmd_list_created_years": return db.createdYears;
      case "cmd_add_created_year": db.createdYears.push(args.year); return null;
      default:
        throw new Error(`мок не реализует команду: ${cmd}`);
    }
  },
};

const errors = [];
window.onerror = (m,src,l,c,e) => errors.push(e ? e.stack : m);
window.addEventListener("unhandledrejection", e => errors.push(e.reason && e.reason.stack ? e.reason.stack : String(e.reason)));
const origErr = window.console.error;
window.console.error = (...a) => errors.push(a.map(String).join(" "));
window.eval(bundleSrc);

async function wait(ms){return new Promise(r=>setTimeout(r,ms));}
async function settle(rounds, msEach) { for (let i=0;i<rounds;i++) await wait(msEach); }

(async () => {
  await settle(12, 200);

  console.log("=== вызовы invoke() при старте ===");
  console.log([...new Set(invokeLog)].sort());

  console.log("\n=== рендер ===");
  const root = window.document.getElementById("root");
  console.log("root заполнен?", root.innerHTML.length > 1000, "| week-card:", window.document.querySelectorAll(".week-card").length);
  const weekQuantumSelect = window.document.querySelector(".week-quantum-select");
  if (weekQuantumSelect) {
    const selectSetter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, "value").set;
    selectSetter.call(weekQuantumSelect, "15");
    weekQuantumSelect.dispatchEvent(new window.Event("change", { bubbles: true }));
    await settle(2, 60);
    assert.ok(Object.values(db.weekQuantums).includes(15), "индивидуальный квант недели должен сохраняться");
    selectSetter.call(weekQuantumSelect, "");
    weekQuantumSelect.dispatchEvent(new window.Event("change", { bubbles: true }));
    await settle(2, 60);
  }

  console.log("\n=== пишем текст в клетку - весь путь целиком ===");
  const input = window.document.querySelector("[data-cell-input]");
  console.log("нашли input?", !!input, input && input.getAttribute("data-cell-input"));
  if (!input) {
    console.error("ошибки рендера:", errors);
    throw new Error("не удалось отрендерить редактор недельной клетки");
  }

  const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
  invokeLog = [];
  nativeSetter.call(input, "Проверка миграции");
  input.dispatchEvent(new window.Event("input", { bubbles: true }));

  await wait(50);
  console.log("сразу после ввода (до дебаунса) - значение в DOM:", input.value, "| invoke() успел вызваться?", invokeLog.length > 0);

  await settle(6, 150); // > 400мс дебаунса
  console.log("после дебаунса - вызовы invoke():", invokeLog);
  console.log("в БД мока для этой даты:", JSON.stringify(db.intervalsByDate[Object.keys(db.intervalsByDate)[0]]));

  console.log("\n=== todos: добавить -> отметить -> удалить ===");
const todoBtn = [...window.document.querySelectorAll("button")].find(b => b.title && b.title.includes("Дела без времени"));
todoBtn.click();
await settle(2, 50);
const todoInput = window.document.querySelector(".todo-panel .input-pill");
console.log("панель Todo открылась, инпут есть?", !!todoInput);

const nativeSetter2 = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
nativeSetter2.call(todoInput, "Купить подарок");
todoInput.dispatchEvent(new window.Event("input", { bubbles: true }));
todoInput.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
await settle(3, 50);
console.log("db.todos после добавления:", JSON.stringify(db.todos));

const checkBtn = window.document.querySelector(".todo-check");
checkBtn && checkBtn.click();
await settle(3, 50);
console.log("db.todos после отметки done:", JSON.stringify(db.todos));

const delBtn = window.document.querySelector(".todo-row .icon-btn.subtle.tiny");
delBtn && delBtn.click();
await settle(3, 50);
console.log("db.todos после удаления:", JSON.stringify(db.todos));

console.log("\n=== todo -> клетка -> undo возвращает дело и позицию ===");
nativeSetter2.call(todoInput, "Вернуть после undo");
todoInput.dispatchEvent(new window.Event("input", { bubbles: true }));
todoInput.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
await settle(3, 80);
const todoRow = [...window.document.querySelectorAll(".todo-row-draggable")].find((row) => row.textContent.includes("Вернуть после undo"));
const todoId = todoRow?.querySelector(".todo-check") ? db.todos.find((item) => item.text === "Вернуть после undo")?.id : null;
const dropCell = window.document.querySelector(".cell");
if (todoId && dropCell) {
  window.document.elementFromPoint = () => dropCell;
  todoRow.dispatchEvent(new window.MouseEvent("pointerdown", {
    bubbles: true, cancelable: true, button: 0, clientX: 10, clientY: 10,
  }));
  window.dispatchEvent(new window.MouseEvent("pointermove", {
    bubbles: true, cancelable: true, clientX: 30, clientY: 30,
  }));
  window.dispatchEvent(new window.MouseEvent("pointerup", {
    bubbles: true, cancelable: true, button: 0, clientX: 30, clientY: 30,
  }));
  await settle(5, 120);
  const droppedDate = Object.entries(db.intervalsByDate).find(([, list]) => list.some((item) => item.text === "Вернуть после undo"))?.[0];
  console.log("назначено в клетку?", Boolean(droppedDate));
  assert.ok(droppedDate, "Todo должен появиться в календаре после перетаскивания");
  const undoAfterDrop = [...window.document.querySelectorAll("button")].find((button) => button.title?.includes("Отменить последнее действие"));
  undoAfterDrop?.click();
  await settle(5, 120);
  const todoRestored = db.todos.some((item) => item.id === todoId && item.text === "Вернуть после undo");
  const cellCleared = !(db.intervalsByDate[droppedDate] || []).some((item) => item.text === "Вернуть после undo");
  console.log("дело вернулось в список?", todoRestored);
  console.log("клетка очищена после undo?", cellCleared);
  assert.ok(todoRestored, "Undo должен вернуть Todo в список");
  assert.ok(cellCleared, "Undo должен очистить назначенную клетку");
  const restoredTodoRow = [...window.document.querySelectorAll(".todo-row-draggable")].find((row) => row.textContent.includes("Вернуть после undo"));
  const scheduleButton = restoredTodoRow?.querySelector(".todo-schedule-btn");
  assert.ok(scheduleButton, "у дела должна быть доступна альтернатива drag-and-drop через выбор клетки");
  scheduleButton.click();
  await settle(2, 60);
  const clickTargetCell = window.document.querySelectorAll(".cell")[1];
  clickTargetCell.dispatchEvent(new window.Event("pointerdown", { bubbles: true, cancelable: true }));
  await settle(5, 120);
  const scheduledByClick = Object.entries(db.intervalsByDate).find(([, list]) => list.some((item) => item.text === "Вернуть после undo"))?.[0];
  assert.ok(scheduledByClick, "выбор дела и клик по клетке должны назначать дело без drag");
  assert.ok(!db.todos.some((item) => item.id === todoId), "после назначения кликом дело должно исчезнуть из списка");
} else {
  console.log("Не удалось подготовить сценарий перетаскивания todo");
}

console.log("\n=== all-day событие: добавить -> удалить ===");
const agendaBtn = [...window.document.querySelectorAll("button")].find(b => b.title && b.title.includes("Агенда дня"));
agendaBtn.click();
await settle(2, 50);
const addAllDayBtn = [...window.document.querySelectorAll("button")].find(b => b.title && b.title.includes("Добавить событие на весь день"));
console.log("кнопка + для all-day найдена?", !!addAllDayBtn);
addAllDayBtn.click();
await settle(2, 50);

const titleInput = window.document.querySelector(".agenda-allday-form .input-pill");
const nativeSetter3 = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
nativeSetter3.call(titleInput, "Отпуск");
titleInput.dispatchEvent(new window.Event("input", { bubbles: true }));
const submitBtn = [...window.document.querySelectorAll(".agenda-allday-form button")].find(b => b.textContent.includes("Добавить"));
submitBtn.click();
await settle(3, 50);
console.log("db.allDayEvents после добавления:", JSON.stringify(db.allDayEvents));

const delBtn2 = window.document.querySelector(".agenda-allday-row .icon-btn.subtle.tiny");
delBtn2 && delBtn2.click();
await settle(3, 50);
console.log("db.allDayEvents после удаления:", JSON.stringify(db.allDayEvents));

console.log("\n=== шаблон недели: сохранить -> применить к другой неделе ===");
const tplBtn = [...window.document.querySelectorAll("button")].find(b => b.title && b.title.includes("Шаблоны ("));
tplBtn.click();
await settle(2, 50);

// отмечаем текущую (первую видимую) неделю чекбоксом
const weekCheckbox = window.document.querySelector(".mark-checkbox input[type=checkbox]");
console.log("чекбокс отметки недели найден?", !!weekCheckbox);
weekCheckbox.click();
await settle(2, 50);

const createBtn = [...window.document.querySelectorAll("button")].find(b => b.textContent.includes("Создать шаблон из отмеченного"));
createBtn.click();
await settle(2, 50);
const nameInput = window.document.querySelector(".modal-name-input");
console.log("модалка создания шаблона открылась?", !!nameInput);
const saveBtn = [...window.document.querySelectorAll(".modal-card button")].find(b => b.textContent.includes("Сохранить шаблон"));
saveBtn.click();
await settle(3, 100);
console.log("db.templates:", db.templates.map(t => ({ name: t.name, kind: t.kind, intervalsInData: JSON.parse(t.data).length })));

// отмечаем СЛЕДУЮЩУЮ неделю и применяем к ней шаблон
const checkboxes = [...window.document.querySelectorAll(".mark-checkbox input[type=checkbox]")];
if (checkboxes[1]) checkboxes[1].click();
await settle(2, 50);
const applyBtn = [...window.document.querySelectorAll(".template-row button")].find(b => b.textContent.includes("Применить"));
console.log("кнопка применения к отмеченным найдена?", !!applyBtn);
const origConfirm = window.confirm;
window.confirm = () => true;
applyBtn && applyBtn.click();
await settle(4, 150);
window.confirm = origConfirm;
const dates = Object.keys(db.intervalsByDate);
console.log("дат в мок-БД после применения:", dates.length, "- непустых дней:", dates.filter(d => db.intervalsByDate[d].length > 0).length);

console.log("\n=== шаблон: диапазон с Undo одной операцией ===");
const rangeToggle = [...window.document.querySelectorAll(".templates-panel button")].find((button) => button.textContent.trim() === "Диапазон");
assert.ok(rangeToggle, "переключатель диапазона должен отображаться");
rangeToggle?.click();
await settle(2, 50);
invokeLog = [];
const rangeApplyBtn = [...window.document.querySelectorAll(".template-row button")].find((button) => button.textContent.includes("Применить к диапазону"));
assert.ok(rangeApplyBtn, "кнопка применения шаблона к диапазону должна отображаться");
window.confirm = () => true;
rangeApplyBtn?.click();
await settle(5, 120);
window.confirm = origConfirm;
console.log("range apply backend calls:", invokeLog, "| toast:", window.document.querySelector(".toast")?.textContent, "| errors:", errors);
assert.ok(invokeLog.includes("cmd_apply_week_template"), "штамповка диапазона должна вызвать bulk-команду");
const undoTemplateBtn = [...window.document.querySelectorAll("button")].find((button) => button.title?.includes("Отменить последнее действие"));
invokeLog = [];
undoTemplateBtn?.click();
await settle(5, 100);
assert.ok(invokeLog.includes("cmd_restore_weeks"), "штамповка диапазона должна отменяться одной batch restore-командой");

console.log("\n=== повторяющееся событие: создать -> размечает несколько недель ===");
const recurringToolButton = [...window.document.querySelectorAll(".dock-rail-btn")].find((button) => button.title.includes("Повторяющиеся события"));
assert.ok(recurringToolButton, "для повторяющихся событий должна быть отдельная кнопка инструмента");
recurringToolButton.click();
await settle(2, 50);
const recNameInput = window.document.querySelector(".recurring-form .input-pill");
console.log("форма повтора открыта?", !!recNameInput);
assert.ok(recNameInput, "отдельная панель повторов должна открывать форму");
const nativeSetter4 = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
nativeSetter4.call(recNameInput, "Тренировка");
recNameInput.dispatchEvent(new window.Event("input", { bubbles: true }));
const recSubmitBtn = [...window.document.querySelectorAll(".recurring-form button")].find(b => b.textContent.includes("Создать и разметить"));
invokeLog = [];
window.confirm = () => false;
recSubmitBtn.click();
await settle(2, 80);
assert.equal(db.recurringRules.length, 0, "отмена подтверждения не должна сохранять правило");
assert.ok(!invokeLog.includes("cmd_add_recurring_rule"), "при отмене подтверждения правило не записывается");
window.confirm = () => true;
recSubmitBtn.click();
await settle(5, 150);
window.confirm = origConfirm;
console.log("db.recurringRules:", db.recurringRules.map(r => r.name));
assert.equal(db.recurringRules.length, 1, "после подтверждения правило должно быть сохранено");
assert.equal(db.recurringRules[0].conflictMode, "keepExisting", "выбранный режим конфликтов должен сохраняться в правиле");
assert.ok(invokeLog.includes("cmd_apply_recurring_rule"), "подтверждённое правило должно вызвать bulk-команду");
const nonEmptyDates = Object.keys(db.intervalsByDate).filter(d => db.intervalsByDate[d].some(v => v.text === "Тренировка"));
console.log("дней с 'Тренировка' в мок-БД:", nonEmptyDates.length, "(по умолчанию weeksCount=17, значит и должно быть 17)");
assert.equal(nonEmptyDates.length, 17, "одно правило должно создать 17 повторов по умолчанию");

console.log("\n=== настройки: смена шага клетки -> уходит на бэкенд ===");
const settingsBtn = [...window.document.querySelectorAll("button")].find(b => b.title && b.title.includes("Настройки сетки"));
settingsBtn.click();
await settle(2, 50);
const cellMinSelect = [...window.document.querySelectorAll(".dock-settings-panel select")].find(s => [...s.options].some(o => o.value === "60") && [...s.options].some(o => o.value === "5"));
const nativeSelSetter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, "value").set;
nativeSelSetter.call(cellMinSelect, "10");
cellMinSelect.dispatchEvent(new window.Event("change", { bubbles: true }));
await settle(5, 150);
console.log("db.settings.cellMin:", db.settings.cellMin, "(ожидаем 10)");

console.log("\n=== заливка клетки категорией (paint) ===");
const catBtn = [...window.document.querySelectorAll("button")].find(b => b.title && b.title.includes("Категории ("));
catBtn.click();
await settle(2, 50);
const chip = window.document.querySelector(".chip");
console.log("чип категории найден?", !!chip, chip && chip.textContent);
chip.click();
await settle(2, 50);

const cell = window.document.querySelector(".cell");
console.log("клетка найдена?", !!cell);
cell.dispatchEvent(new window.Event("pointerdown", { bubbles: true }));
await settle(5, 150);
const paintedDate = Object.keys(db.intervalsByDate).find((d) => (db.intervalsByDate[d] || []).some((v) => v.color));
console.log("закрашенный интервал появился в мок-БД?", !!paintedDate, paintedDate && JSON.stringify(db.intervalsByDate[paintedDate]));
const workChip = [...window.document.querySelectorAll(".chip")].find((item) => item.textContent.includes("Работа"));
workChip.click();
await settle(2, 50);
cell.dispatchEvent(new window.Event("pointerdown", { bubbles: true }));
await settle(5, 150);
const [paintedWeekIso, paintedDayIdx] = cell.querySelector("[data-cell-input]").dataset.cellInput.split("_");
const paintedCellDate = mondayPlusDays(paintedWeekIso, Number(paintedDayIdx));
const changedCategory = (db.intervalsByDate[paintedCellDate] || []).find((item) => item.color);
assert.equal(changedCategory?.catId, "c2", "перекраска заголовка должна менять ID категории");
assert.equal(changedCategory?.text, "Работа", "перекраска заголовка должна менять текст на название новой категории");

console.log("\n=== повторный клик той же краской - должен стереть (toggle) ===");
cell.dispatchEvent(new window.Event("pointerdown", { bubbles: true }));
await settle(5, 150);
console.log("после повторного клика:", JSON.stringify(db.intervalsByDate[paintedDate]));

console.log("\n=== undo: закрасить вторую клетку -> отменить ===");
const cell2 = window.document.querySelectorAll(".cell")[5]; // другая клетка, чтобы не путать со сценарием paint выше
const beforeDate = Object.keys(db.intervalsByDate).find((d) => (db.intervalsByDate[d] || []).length > 0);
const beforeSnapshot = JSON.parse(JSON.stringify(db.intervalsByDate));
cell2.dispatchEvent(new window.Event("pointerdown", { bubbles: true }));
await settle(5, 150);
const afterPaintSnapshot = JSON.parse(JSON.stringify(db.intervalsByDate));
console.log("состояние поменялось после закраски?", JSON.stringify(beforeSnapshot) !== JSON.stringify(afterPaintSnapshot));

const undoBtn = [...window.document.querySelectorAll("button")].find(b => b.title && b.title.includes("Отменить последнее действие"));
console.log("кнопка Undo найдена и активна?", !!undoBtn);
undoBtn.click();
await settle(5, 150);
const normalizeIntervals = (source) => Object.entries(source)
  .filter(([, rows]) => rows.length > 0)
  .sort(([dateA], [dateB]) => dateA.localeCompare(dateB))
  .map(([date, rows]) => [date, [...rows].sort((a, b) => a.startMin - b.startMin)]);
const undoMatches = JSON.stringify(normalizeIntervals(db.intervalsByDate)) === JSON.stringify(normalizeIntervals(beforeSnapshot));
console.log("состояние после undo совпадает с ДО закраски?", undoMatches);
assert.ok(undoMatches, "Undo должен атомарно восстановить снимок недели");

console.log("\n=== трекер: вкладка Год -> Обновить -> SQL-агрегат ===");
const trackerBtn = [...window.document.querySelectorAll("button")].find(b => b.title && b.title.includes("Трекер выполнения"));
trackerBtn.click();
await settle(2, 50);
const yearTab = [...window.document.querySelectorAll(".segmented-option")].find(b => b.textContent === "Год");
yearTab && yearTab.click();
await settle(2, 50);
const refreshBtn = [...window.document.querySelectorAll(".tracker-panel button")].find(b => b.textContent.includes("Обновить"));
console.log("кнопка 'Обновить' (Год) найдена?", !!refreshBtn);
refreshBtn.click();
await settle(5, 150);
const statsRows = window.document.querySelectorAll(".tracker-table tbody tr");
console.log("строк в таблице трекера после обновления:", statsRows.length, "(= число категорий)");

console.log("\n=== счётчик по отмеченным неделям ===");
const intervalTab = [...window.document.querySelectorAll(".segmented-option")].find(b => b.textContent === "Интервал");
intervalTab && intervalTab.click();
await settle(2, 50);
// отмечаем week-card чекбоксы прямо на сетке (есть, пока открыта панель "Шаблоны" ИЛИ вкладка "Интервал" трекера - markingMode)
const wkChecks = [...window.document.querySelectorAll(".mark-checkbox input[type=checkbox]")];
console.log("чекбоксов отметки недель доступно:", wkChecks.length);
if (wkChecks[0]) wkChecks[0].click();
await settle(2, 50);
const counterBtn = [...window.document.querySelectorAll(".counter-panel button")].find(b => b.textContent.includes("Посчитать"));
counterBtn && counterBtn.click();
await settle(5, 150);
console.log("кнопка 'Посчитать' найдена и нажата?", !!counterBtn);
const counterRows = window.document.querySelectorAll(".counter-table tbody tr");
console.log("строк в результате счётчика:", counterRows.length);

console.log("\n=== выделение -> копировать -> вставить в другое место ===");
const selectBtn = [...window.document.querySelectorAll("button")].find(b => b.title === "Клавиша 4");
selectBtn.click();
await settle(2, 50);

// сначала что-то закрасим, чтобы было что копировать - откроем категории и кликнем клетку
const catBtn2 = [...window.document.querySelectorAll("button")].find(b => b.title && b.title.includes("Категории ("));
catBtn2.click();
await settle(1, 50);
const chip2 = window.document.querySelector(".chip");
chip2.click();
await settle(1, 50);
const paintBtn = [...window.document.querySelectorAll("button")].find(b => b.title === "Клавиша 1" || (b.textContent||"").includes("Заливка"));
paintBtn && paintBtn.click();
await settle(1, 50);
const cells = [...window.document.querySelectorAll(".cell")];
cells[20].dispatchEvent(new window.Event("pointerdown", { bubbles: true }));
await settle(3, 100);
console.log("клетка для копирования закрашена?", Object.values(db.intervalsByDate).some(list => list.length > 0));

selectBtn.click();
await settle(2, 50);
cells[20].dispatchEvent(new window.Event("pointerdown", { bubbles: true }));
await settle(2, 50);

const copyBtn = [...window.document.querySelectorAll("button")].find(b => b.title === "Alt+K" || true); // откроем через Command Palette вместо хоткея
window.dispatchEvent(new window.KeyboardEvent("keydown", { key: "k", code: "KeyK", ctrlKey: true, bubbles: true }));
await settle(2, 50);
const paletteInput = window.document.querySelector(".command-palette-input");
console.log("палитра команд открылась?", !!paletteInput);
if (paletteInput) {
  const nativeSetter5 = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
  nativeSetter5.call(paletteInput, "Копировать");
  paletteInput.dispatchEvent(new window.Event("input", { bubbles: true }));
  await settle(2, 50);
  const copyItem = window.document.querySelector(".command-palette-item");
  console.log("нашли пункт 'Копировать выделение'?", copyItem && copyItem.textContent);
  copyItem && copyItem.click();
}
await settle(2, 50);
console.log("clipboardCount после копирования:", (window.document.querySelector(".tool-dock, body")||{}).outerHTML ? "см. ниже по состоянию intervalsByDate" : "");

// теперь выделим ДРУГУЮ клетку и вставим
cells[40].dispatchEvent(new window.Event("pointerdown", { bubbles: true }));
await settle(2, 50);
window.dispatchEvent(new window.KeyboardEvent("keydown", { key: "k", code: "KeyK", ctrlKey: true, bubbles: true }));
await settle(2, 50);
const paletteInput2 = window.document.querySelector(".command-palette-input");
if (paletteInput2) {
  const nativeSetter6 = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
  nativeSetter6.call(paletteInput2, "Вставить");
  paletteInput2.dispatchEvent(new window.Event("input", { bubbles: true }));
  await settle(2, 50);
  const pasteItem = window.document.querySelector(".command-palette-item");
  console.log("нашли пункт 'Вставить выделение'?", pasteItem && pasteItem.textContent);
  pasteItem && pasteItem.click();
}
await settle(5, 150);
const paintedCount = Object.values(db.intervalsByDate).reduce((s, list) => s + list.filter(v => v.color).length, 0);
console.log("закрашенных интервалов в мок-БД после вставки:", paintedCount, "(ожидаем >= 2 - источник и вставленная копия)");

console.log("\n=== перенос выделения стрелками + Enter ===");
const dateBeforeMove = Object.keys(db.intervalsByDate).find((d) => (db.intervalsByDate[d]||[]).some(v => v.color));
const beforeMove = JSON.parse(JSON.stringify(db.intervalsByDate[dateBeforeMove]));
console.log("ячейка-источник до переноса:", JSON.stringify(beforeMove));

if (window.document.activeElement && window.document.activeElement.blur) window.document.activeElement.blur();
window.document.body.focus && window.document.body.focus();
selectBtn.click();
await settle(2, 100);
console.log("режим select активен?", selectBtn.className.includes("active"));
const freshCells = [...window.document.querySelectorAll(".cell")]; // переспрашиваем - старые ссылки могли отсоединиться после ререндеров
freshCells[20].dispatchEvent(new window.Event("pointerdown", { bubbles: true }));
await settle(2, 100);
console.log("выделена клетка? (ищем .cell-selected)", !!window.document.querySelector(".cell-selected"));
console.log("document.activeElement:", window.document.activeElement.tagName, window.document.activeElement.className);
window.dispatchEvent(new window.KeyboardEvent("keydown", { key: "ArrowDown", code: "ArrowDown", shiftKey: true, bubbles: true }));
await settle(1, 100);
window.dispatchEvent(new window.KeyboardEvent("keydown", { key: "ArrowDown", code: "ArrowDown", shiftKey: true, bubbles: true }));
await settle(2, 100);
console.log("historyCount вырос (snapshot случился при commit) заранее быть не должно; проверим после Enter");
window.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Enter", code: "Enter", bubbles: true }));
await settle(5, 150);

console.log("ячейка-источник ПОСЛЕ переноса (должна опустеть):", JSON.stringify(db.intervalsByDate[dateBeforeMove]));
const anyMovedFlag = Object.values(db.intervalsByDate).some((list) => list.some((v) => v.moved));
console.log("хоть где-то выставлен moved:true?", anyMovedFlag);

console.log("\n=== PlanScript: динамическая дата -> предпросмотр -> применение -> undo ===");
Object.assign(db.intervalsByDate, structuredClone(futureWeekBefore));
const scriptButton = window.document.querySelector('button[title="PlanScript (X)"]');
assert.ok(scriptButton, "кнопка PlanScript должна отображаться");
scriptButton.click();
await settle(3, 100);
const scriptEditor = window.document.querySelector('textarea[aria-label="Код PlanScript"]');
assert.ok(scriptEditor, "редактор PlanScript должен открыться");
const scriptCode =
  "target = days(date_add(today(), 140), count=1)[0]\n" +
  "if target.time(14:00..15:00).is_empty:\n" +
  "    target.time(12:00..12:30).category('Спорт').text('WRONG: missing context')\n" +
  "else:\n" +
  "    target.time(12:00..12:30).category('Спорт').text('PlanScript E2E')\n";
const nativeTextareaSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value").set;
nativeTextareaSetter.call(scriptEditor, scriptCode);
scriptEditor.dispatchEvent(new window.Event("input", { bubbles: true }));
const previewButton = [...window.document.querySelectorAll(".planscript-actions button")].find((button) => button.textContent.includes("Предпросмотр"));
assert.ok(previewButton, "кнопка предпросмотра PlanScript должна отображаться");
console.log("button before preview:", { disabled: previewButton.disabled, text: previewButton.textContent, code: scriptEditor.value.length });
invokeLog = [];
previewButton.click();
await settle(20, 100);
console.log("PlanScript preview state:", { disabled: previewButton.disabled, calls: invokeLog.slice(-12), error: window.document.querySelector(".planscript-error")?.textContent });
assert.ok(
  window.document.querySelector(".planscript-preview"),
  `предпросмотр должен завершиться; ошибка: ${window.document.querySelector(".planscript-error")?.textContent || "нет"}; editor=${scriptEditor.value}; disabled=${previewButton.disabled}`,
);
assert.ok(window.document.querySelector(".planscript-preview").textContent.includes("Операций: 1"), "предпросмотр должен содержать одну операцию");
const applyScriptButton = [...window.document.querySelectorAll(".planscript-preview .planscript-actions button")].find((button) => button.textContent.includes("Применить"));
assert.ok(applyScriptButton, "кнопка применения должна отображаться");
invokeLog = [];
applyScriptButton.click();
await settle(10, 100);
assert.ok(invokeLog.includes("cmd_apply_planscript_operations"), "применение должно вызвать Rust-команду PlanScript");
assert.ok(db.intervalsByDate[futureTargetDate].some((row) => row.text === "PlanScript E2E"), "PlanScript должен увидеть существующий интервал в динамически загруженном дне и применить правильную ветку");
assert.ok(db.intervalsByDate[futureTargetDate].some((row) => row.text === "Existing future item"), "применение не должно затереть существующую запись в тот же день");
assert.ok(db.intervalsByDate[futureOtherDate].some((row) => row.text === "Other day in future week"), "применение не должно терять остальные дни недели");
const undoScriptButton = [...window.document.querySelectorAll("button")].find((button) => button.title?.includes("Отменить последнее действие"));
assert.ok(undoScriptButton, "после применения PlanScript должна быть доступна отмена");
undoScriptButton.click();
await settle(8, 100);
assert.deepEqual(db.intervalsByDate[futureTargetDate], futureWeekBefore[futureTargetDate], "Undo должен восстановить существующую запись динамически загруженной недели");
assert.deepEqual(db.intervalsByDate[futureOtherDate], futureWeekBefore[futureOtherDate], "Undo должен сохранить данные остальных дней недели");

console.log("=== необработанные ошибки за весь прогон ===");
console.log(errors.length === 0 ? "ни одной" : errors);
assert.equal(errors.length, 0, "прогон не должен оставлять необработанные ошибки браузера");
process.exit(0);
})();
