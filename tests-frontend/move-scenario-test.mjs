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

const db = { intervalsByDate: {}, settings: { dayStart:360,dayEnd:1440,cellMin:30,zoom:1,theme:"calm",notificationsEnabled:false,notifyLeadMin:10 },
  categories: [{id:"c1",name:"Спорт",color:"#2E7D74"}], subcategories: [], templates: [], recurringRules: [], todos: [], allDayEvents: [], weekLabels: {}, createdYears: [] };
function mondayPlusDays(monday, d) {
  const dt = new Date(monday + "T00:00:00");
  dt.setDate(dt.getDate() + d);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

const errors = [];
window.onerror = (m,s,l,c,e) => errors.push(e?e.stack:m);
window.addEventListener("unhandledrejection", e => errors.push(e.reason?.stack || String(e.reason)));

window.__TAURI_INTERNALS__ = { invoke: async (cmd, args) => {
  switch (cmd) {
    case "cmd_get_week_intervals": { const w=[]; for(let d=0;d<7;d++){const date=mondayPlusDays(args.monday,d); w.push(db.intervalsByDate[date]||[]);} return w; }
    case "cmd_get_week_data": { const days=[]; for(let d=0;d<7;d++){const date=mondayPlusDays(args.monday,d); days.push(db.intervalsByDate[date]||[]);} return { days, cellMin: null, dayStart: null, dayEnd: null }; }
    case "cmd_get_day_intervals": return db.intervalsByDate[args.date] || [];
    case "cmd_set_interval": { const cur=db.intervalsByDate[args.date]||[]; db.intervalsByDate[args.date]=applyPatchLocally(cur,args.startMin,args.endMin,args.patch); return null; }
    case "cmd_clear_interval": { const cur=db.intervalsByDate[args.date]||[]; const updated=clearRangeLocally(cur,args.startMin,args.endMin); if(updated.length)db.intervalsByDate[args.date]=updated; else delete db.intervalsByDate[args.date]; return null; }
    case "cmd_restore_week": { for(let d=0;d<7;d++){const date=mondayPlusDays(args.monday,d); const restored=(args.days[d]||[]).slice(); if(restored.length)db.intervalsByDate[date]=restored; else delete db.intervalsByDate[date];} return null; }
    case "cmd_get_settings": return db.settings;
    case "cmd_list_categories": return db.categories;
    case "cmd_list_subcategories": return db.subcategories;
    case "cmd_list_templates": return db.templates;
    case "cmd_list_recurring_rules": return db.recurringRules;
    case "cmd_list_todos": return db.todos;
    case "cmd_list_all_all_day_events": return db.allDayEvents;
    case "cmd_get_week_labels": return Object.entries(db.weekLabels);
    case "cmd_list_created_years": return db.createdYears;
    case "cmd_add_created_year": db.createdYears.push(args.year); return null;
    default: return null;
  }
}};

window.eval(bundleSrc);
async function wait(ms){return new Promise(r=>setTimeout(r,ms));}
async function settle(n,ms){for(let i=0;i<n;i++)await wait(ms);}

(async () => {
  await settle(10, 200);

  // Закрашиваем конкретную, известную клетку: категория -> заливка -> первая клетка первой недели
  const catBtn = [...window.document.querySelectorAll("button")].find(b => b.title && b.title.includes("Категории ("));
  catBtn.click();
  await settle(2, 50);
  window.document.querySelector(".chip").click();
  await settle(2, 50);

  const firstCell = window.document.querySelector(".cell");
  firstCell.dispatchEvent(new window.Event("pointerdown", { bubbles: true }));
  await settle(5, 150);

  const paintedDate = Object.keys(db.intervalsByDate).find(d => (db.intervalsByDate[d]||[]).some(v => v.color));
  console.log("закрашенная дата:", paintedDate, JSON.stringify(db.intervalsByDate[paintedDate]));

  // Переключаемся в режим "Выбор", кликаем ТУ ЖЕ клетку (та же DOM-позиция = та же дата/строка)
  const selectBtn = [...window.document.querySelectorAll("button")].find(b => b.title === "Клавиша 4");
  selectBtn.click();
  await settle(2, 50);
  const sameFirstCell = window.document.querySelector(".cell"); // перезапросили - та же самая позиция в сетке
  sameFirstCell.dispatchEvent(new window.Event("pointerdown", { bubbles: true }));
  await settle(2, 100);
  console.log("выделена?", !!window.document.querySelector(".cell-selected"));

  window.dispatchEvent(new window.KeyboardEvent("keydown", { key: "ArrowDown", code: "ArrowDown", shiftKey: true, bubbles: true }));
  await settle(1, 100);
  window.dispatchEvent(new window.KeyboardEvent("keydown", { key: "ArrowDown", code: "ArrowDown", shiftKey: true, bubbles: true }));
  await settle(2, 100);
  window.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Enter", code: "Enter", bubbles: true }));
  await settle(6, 150);

  console.log("\\nисточник ПОСЛЕ переноса:", JSON.stringify(db.intervalsByDate[paintedDate]));
  const movedSomewhere = Object.entries(db.intervalsByDate).find(([d, list]) => d !== paintedDate && list.some(v => v.color));
  console.log("появилась закраска в новом месте?", movedSomewhere ? movedSomewhere[0] + " " + JSON.stringify(movedSomewhere[1]) : "НЕТ");

  console.log("\n=== перенос МЕЖДУ неделями (Shift+влево много раз - должен уйти на прошлую неделю) ===");
  const cellForWeekMove = window.document.querySelector(".cell-selected") || window.document.querySelector(".cell");
  cellForWeekMove.dispatchEvent(new window.Event("pointerdown", { bubbles: true }));
  await settle(2, 100);
  for (let i = 0; i < 8; i++) {
    window.dispatchEvent(new window.KeyboardEvent("keydown", { key: "ArrowLeft", code: "ArrowLeft", shiftKey: true, bubbles: true }));
    await settle(1, 50);
  }
  window.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Enter", code: "Enter", bubbles: true }));
  await settle(6, 150);

  const allPainted = Object.entries(db.intervalsByDate).filter(([d, list]) => list.some(v => v.color));
  console.log("даты с закраской после межнедельного переноса:", allPainted.map(([d]) => d));
  console.log("ровно одна (перенесли, не скопировали)?", allPainted.length === 1);

  console.log("\nошибок за прогон:", errors.length, errors[0] || "");
  process.exit(0);
})();
