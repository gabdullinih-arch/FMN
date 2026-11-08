/* ------------------------------------------------------------------ */
/*  Обёртки над Tauri-командами (Этап 2: Rust/SQLite вместо Python/    */
/*  data.json). Заменяет старый storage.js (generic loadKey/saveKey    */
/*  над window.storage) - теперь каждая операция типизирована и        */
/*  соответствует конкретной SQL-операции на бэкенде (см. lib.rs /      */
/*  app/src/main.rs). compactCells/expandCells больше не существуют -   */
/*  бэкенд сам хранит и отдаёт уже сжатые интервалы.                    */
/*                                                                      */
/*  Tauri по умолчанию ждёт camelCase-ключи в объекте аргументов,       */
/*  автоматически сопоставляя их с snake_case-параметрами Rust-команд.  */
/* ------------------------------------------------------------------ */
import { invoke } from "@tauri-apps/api/core";

export async function exportDatabaseBackup() {
  return invoke("cmd_export_backup");
}

export async function importDatabaseBackup(backup) {
  return invoke("cmd_import_backup", { backup });
}

export async function exportAllReflectionsMarkdown(language) {
  return invoke("cmd_export_all_reflections", { language });
}

/* ---------- Интервалы (SetInterval/ClearInterval/find/stats/free_slots) ---------- */

// Возвращает массив из 7 массивов интервалов (day_idx 0..6) - одним
// запросом на всю неделю, а не 7 отдельных (важно для виртуализации).
export async function fetchWeekIntervals(monday) {
  return invoke("cmd_get_week_intervals", { monday });
}

export async function fetchWeekData(monday) {
  return invoke("cmd_get_week_data", { monday });
}

export async function fetchDayIntervals(date) {
  return invoke("cmd_get_day_intervals", { date });
}

export async function writeInterval(date, startMin, endMin, patch) {
  return invoke("cmd_set_interval", { date, startMin, endMin, patch });
}

export async function clearIntervalRange(date, startMin, endMin) {
  return invoke("cmd_clear_interval", { date, startMin, endMin });
}

export async function fetchWeekQuantum(monday) {
  return invoke("cmd_get_week_quantum", { monday });
}

export async function saveWeekQuantum(monday, cellMin) {
  return invoke("cmd_set_week_quantum", { monday, cellMin });
}

export async function fetchWeekDayBounds(monday) {
  return invoke("cmd_get_week_day_bounds", { monday });
}

export async function saveWeekDayBounds(monday, dayStart, dayEnd) {
  return invoke("cmd_set_week_day_bounds", { monday, dayStart, dayEnd });
}

// Undo/redo: атомарная замена целой недели снимком (тот же формат, что
// отдаёт fetchWeekIntervals) - см. lib.rs: restore_week.
export async function restoreWeek(monday, days) {
  return invoke("cmd_restore_week", { monday, days });
}

export async function restoreWeeks(snapshots) {
  return invoke("cmd_restore_weeks", { snapshots });
}

export async function findIntervals(filter) {
  // filter: { dateFrom, dateTo, catId?, subId?, textContains?, done? }
  return invoke("cmd_find", { filter });
}

export async function statsHours(catId, dateFrom, dateTo) {
  return invoke("cmd_stats_hours", { catId, dateFrom, dateTo });
}

// Статистика трекера по месяцам года (TrackerPanel.jsx, вкладка "Год") -
// см. lib.rs: tracker_stats_by_month. Возвращает [{catId, planned[12],
// moved[12], done[12]}] - по одной записи на КАЖДУЮ категорию, у которой
// есть хоть один закрашенный интервал в этом году (категории без данных
// в ответе не будет - см. maybeRefreshTracker в Planner.jsx, он сам
// достраивает нулевые строки для категорий без данных).
export async function fetchTrackerStatsByMonth(year) {
  return invoke("cmd_tracker_stats_by_month", { year });
}

// То же, но без разбивки по месяцам, за произвольный диапазон дат
// (CounterPanel.jsx - "Счётчик" по отмеченным неделям).
export async function fetchTrackerStatsRange(dateFrom, dateTo) {
  return invoke("cmd_tracker_stats_range", { dateFrom, dateTo });
}

// Минуты по каждой категории за диапазон дат (TrackerPanel.jsx, вкладка
// "Неделя" - computeWeekStats). Возвращает [[catId, minutes], ...].
export async function fetchMinutesByCategory(dateFrom, dateTo) {
  return invoke("cmd_minutes_by_category", { dateFrom, dateTo });
}

export async function freeSlots(date, dayStart, dayEnd, minDuration) {
  return invoke("cmd_free_slots", { date, dayStart, dayEnd, minDuration: minDuration ?? null });
}

/* ---------- Категории/подкатегории ---------- */

export async function listCategories() {
  return invoke("cmd_list_categories");
}
export async function listSubcategories() {
  return invoke("cmd_list_subcategories");
}
export async function addCategory(id, name, color, sortOrder) {
  return invoke("cmd_add_category", { id, name, color, sortOrder });
}
export async function renameCategory(id, name) {
  return invoke("cmd_rename_category", { id, name });
}
export async function updateCategoryColor(id, color) {
  return invoke("cmd_update_category_color", { id, color });
}
export async function deleteCategory(id) {
  return invoke("cmd_delete_category", { id });
}
export async function addSubcategory(id, categoryId, name, sortOrder) {
  return invoke("cmd_add_subcategory", { id, categoryId, name, sortOrder });
}
export async function updateSubcategoryDescription(id, description) {
  return invoke("cmd_update_subcategory_description", { id, description });
}
export async function deleteSubcategory(id) {
  return invoke("cmd_delete_subcategory", { id });
}

/* ---------- Дела без времени ---------- */

export async function addTodo(id, text, createdAt, sortOrder) {
  return invoke("cmd_add_todo", { id, text, createdAt, sortOrder });
}
export async function listTodos() {
  return invoke("cmd_list_todos");
}
export async function toggleTodo(id) {
  return invoke("cmd_toggle_todo", { id });
}
export async function deleteTodo(id) {
  return invoke("cmd_delete_todo", { id });
}
export async function restoreTodo(todo) {
  return invoke("cmd_restore_todo", {
    id: todo.id,
    text: todo.text,
    done: todo.done,
    createdAt: todo.createdAt,
    sortOrder: todo.sortOrder,
  });
}
export async function reorderTodos(ids) {
  return invoke("cmd_reorder_todos", { ids });
}
export async function restoreTodoDrop(monday, days, todo) {
  return invoke("cmd_restore_todo_drop", { monday, days, todo });
}

/* ---------- Весь день / несколько дней ---------- */

export async function setAllDay(id, text, catId, color, startDate, endDate, createdAt) {
  return invoke("cmd_set_all_day", { id, text, catId: catId ?? null, color: color ?? null, startDate, endDate, createdAt });
}
export async function clearAllDay(id) {
  return invoke("cmd_clear_all_day", { id });
}
export async function fetchAllDayInRange(from, to) {
  return invoke("cmd_get_all_day_in_range", { from, to });
}
export async function listAllAllDayEvents() {
  return invoke("cmd_list_all_all_day_events");
}

/* ---------- Рефлексии ---------- */

export async function setReflection(date, text, updatedAt) {
  return invoke("cmd_set_reflection", { date, text, updatedAt });
}
export async function getReflection(date) {
  return invoke("cmd_get_reflection", { date });
}
export async function exportReflectionsMarkdown(year) {
  return invoke("cmd_export_reflections_markdown", { year });
}

/* ---------- Шаблоны (bulk apply) ---------- */

export async function applyWeekTemplate(template, targetMondays, mode, dayStart, dayEnd, exceptions = [], decisions = []) {
  return invoke("cmd_apply_week_template", { template, targetMondays, mode, dayStart, dayEnd, exceptions, decisions });
}
export async function applyDayTemplate(template, targetDates, mode, dayStart, dayEnd, decisions = []) {
  return invoke("cmd_apply_day_template", { template, targetDates, mode, dayStart, dayEnd, decisions });
}

/* ---------- Повторяющиеся события (bulk apply + CRUD самих правил) ---------- */

export async function applyRecurringRule(rule) {
  // rule: { dayIdx, startMin, durationMin, patch, patternType, customRanges, anchorMonday, weeksCount }
  return invoke("cmd_apply_recurring_rule", { rule });
}
export async function addRecurringRule(rule, createdAt) {
  return invoke("cmd_add_recurring_rule", { rule, createdAt });
}
export async function deleteRecurringRule(id) {
  return invoke("cmd_delete_recurring_rule", { id });
}
export async function listRecurringRules() {
  return invoke("cmd_list_recurring_rules");
}

/* ---------- Шаблоны - CRUD самих записей ---------- */

export async function addTemplate(id, name, kind, data, createdAt) {
  return invoke("cmd_add_template", { id, name, kind, data, createdAt });
}
export async function deleteTemplate(id) {
  return invoke("cmd_delete_template", { id });
}
export async function listTemplates() {
  return invoke("cmd_list_templates");
}

/* ---------- PlanScript ---------- */

export async function listPlanScripts() {
  return invoke("cmd_list_planscripts");
}
export async function savePlanScript(script) {
  return invoke("cmd_save_planscript", { script });
}
export async function deletePlanScript(id) {
  return invoke("cmd_delete_planscript", { id });
}
export async function markPlanScriptRun(id, ranAt) {
  return invoke("cmd_mark_planscript_run", { id, ranAt });
}
export async function applyPlanScriptOperations(operations) {
  return invoke("cmd_apply_planscript_operations", { operations });
}
export async function listPlanScriptWatchers() {
  return invoke("cmd_list_planscript_watchers");
}
export async function savePlanScriptWatcher(watcher) {
  return invoke("cmd_save_planscript_watcher", { watcher });
}
export async function deletePlanScriptWatcher(id) {
  return invoke("cmd_delete_planscript_watcher", { id });
}
export async function saveWatchResult(watcherId, scope, ownerKey, indicator, dependencies) {
  return invoke("cmd_save_watch_result", {
    watcherId, scope, ownerKey, indicator, dependencies,
  });
}
export async function listWatchIndicators(scope, from, to) {
  return invoke("cmd_list_watch_indicators", { scope, from, to });
}
export async function listAffectedWatchInstances(date) {
  return invoke("cmd_list_affected_watch_instances", { date });
}

/* ---------- Настройки ---------- */

export async function fetchSettings() {
  return invoke("cmd_get_settings");
}
export async function updateSettingsRemote(patch) {
  return invoke("cmd_update_settings", { patch });
}

/* ---------- Заведённые года ---------- */

export async function listCreatedYears() {
  return invoke("cmd_list_created_years");
}
export async function addCreatedYear(year) {
  return invoke("cmd_add_created_year", { year });
}

/* ---------- Подписи недель (WeekTiles.jsx) ---------- */

export async function setWeekLabel(monday, label) {
  return invoke("cmd_set_week_label", { monday, label });
}
export async function getWeekLabels(from, to) {
  return invoke("cmd_get_week_labels", { from, to });
}

/* ---------- Файловый экспорт - диалог "Сохранить как" + запись ----------
   В Tauri 2.x это не отдельная своя команда в lib.rs (как было
   save_text_file в app.pyw), а два официальных плагина: plugin-dialog
   (сам диалог выбора пути) и plugin-fs (запись байт на диск). Плюс их
   нужно зарегистрировать в app/src-tauri/Cargo.toml и app/src/main.rs
   (.plugin(tauri_plugin_dialog::init()).plugin(tauri_plugin_fs::init())),
   и добавить оба npm-пакета - см. app/README-app.md, пункт про плагины. */
import { save } from "@tauri-apps/plugin-dialog";
import { writeTextFile } from "@tauri-apps/plugin-fs";

export async function saveTextFile(defaultFilename, content) {
  const path = await save({
    defaultPath: defaultFilename,
    filters: [
      { name: "Markdown", extensions: ["md"] },
      { name: "Текстовый файл", extensions: ["txt"] },
    ],
  });
  if (!path) return false; // пользователь отменил диалог
  await writeTextFile(path, content);
  return true;
}

export async function saveJsonFile(defaultFilename, content) {
  const path = await save({
    defaultPath: defaultFilename,
    filters: [{ name: "JSON", extensions: ["json"] }],
  });
  if (!path) return false;
  await writeTextFile(path, content);
  return true;
}
