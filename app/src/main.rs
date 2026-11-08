#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use planner_storage::*;
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::{Manager, State};

struct DbState(Mutex<Connection>);

#[tauri::command]
fn cmd_export_backup(state: State<DbState>) -> Result<serde_json::Value, String> {
    let conn = state.0.lock().map_err(|error| error.to_string())?;
    planner_storage::backup::export_database_backup(&conn).map_err(|error| error.to_string())
}

#[tauri::command]
fn cmd_import_backup(
    state: State<DbState>,
    backup: serde_json::Value,
) -> Result<(), String> {
    let mut conn = state.0.lock().map_err(|error| error.to_string())?;
    planner_storage::backup::import_database_backup(&mut conn, &backup)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn cmd_export_all_reflections(
    state: State<DbState>,
    language: String,
) -> Result<String, String> {
    let conn = state.0.lock().map_err(|error| error.to_string())?;
    planner_storage::backup::export_all_reflections_markdown(&conn, &language)
        .map_err(|error| error.to_string())
}

fn db_path(app: &tauri::AppHandle) -> tauri::Result<std::path::PathBuf> {
    // %APPDATA%/<bundle-id>/planner.sqlite на Windows - path_resolver уже
    // учитывает платформу сам, дополнительно ничего указывать не нужно.
    let dir = app.path().app_data_dir()?;
    std::fs::create_dir_all(&dir)?;
    Ok(dir.join("planner.sqlite"))
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_notification::init())
        .setup(|app| {
            let path = db_path(&app.handle())?;
            let path_str = path.to_string_lossy().into_owned();
            let conn = open_and_init(&path_str)?;
            app.manage(DbState(Mutex::new(conn)));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            cmd_export_backup,
            cmd_import_backup,
            cmd_export_all_reflections,
            cmd_set_interval,
            cmd_clear_interval,
            cmd_get_day_intervals,
            cmd_get_week_intervals,
            cmd_get_week_data,
            cmd_find,
            cmd_stats_hours,
            cmd_free_slots,
            cmd_add_todo,
            cmd_list_todos,
            cmd_toggle_todo,
            cmd_delete_todo,
            cmd_restore_todo,
            cmd_reorder_todos,
            cmd_list_all_all_day_events,
            cmd_set_all_day,
            cmd_clear_all_day,
            cmd_get_all_day_in_range,
            cmd_add_category,
            cmd_rename_category,
            cmd_update_category_color,
            cmd_delete_category,
            cmd_add_subcategory,
            cmd_update_subcategory_description,
            cmd_delete_subcategory,
            cmd_list_categories,
            cmd_list_subcategories,
            cmd_set_reflection,
            cmd_get_reflection,
            cmd_export_reflections_markdown,
            cmd_apply_week_template,
            cmd_apply_day_template,
            cmd_apply_recurring_rule,
            cmd_get_settings,
            cmd_update_settings,
            cmd_get_week_quantum,
            cmd_set_week_quantum,
            cmd_get_week_day_bounds,
            cmd_set_week_day_bounds,
            cmd_list_created_years,
            cmd_add_created_year,
            cmd_set_week_label,
            cmd_get_week_labels,
            cmd_add_template,
            cmd_delete_template,
            cmd_list_templates,
            cmd_save_planscript,
            cmd_delete_planscript,
            cmd_list_planscripts,
            cmd_mark_planscript_run,
            cmd_apply_planscript_operations,
            cmd_save_planscript_watcher,
            cmd_delete_planscript_watcher,
            cmd_list_planscript_watchers,
            cmd_save_watch_result,
            cmd_list_watch_indicators,
            cmd_list_affected_watch_instances,
            cmd_add_recurring_rule,
            cmd_delete_recurring_rule,
            cmd_list_recurring_rules,
            cmd_restore_week,
            cmd_restore_weeks,
            cmd_restore_todo_drop,
            cmd_tracker_stats_by_month,
            cmd_tracker_stats_range,
            cmd_minutes_by_category,
        ])
        .run(tauri::generate_context!())
        .expect("ошибка при запуске Tauri");
}

// ============================================================================
// Обёртки-команды - тонкий слой сериализации serde <-> planner_storage.
// Все возвращают Result<T, String>, потому что #[tauri::command] требует
// ошибку, реализующую Serialize - проще всего просто .to_string() у
// rusqlite::Error, чем заводить отдельный тип ошибки только для этого.
// ============================================================================

#[derive(Deserialize)]
struct PatchDto {
    text: Option<Option<String>>,
    color: Option<Option<String>>,
    task: Option<Option<String>>,
    description: Option<Option<String>>,
    #[serde(rename = "catId")]
    cat_id: Option<Option<String>>,
    #[serde(rename = "subId")]
    sub_id: Option<Option<String>>,
    done: Option<Option<bool>>,
    moved: Option<Option<bool>>,
}

/// PatchDto (с Option<Option<T>> - различает "поле не пришло" и "поле explicit null")
/// -> IntervalPatch. Это ровно та тройная семантика из §4.4/§8 спеки.
fn patch_from_dto(dto: PatchDto) -> IntervalPatch {
    let mut p = IntervalPatch::new();
    macro_rules! set_field {
        ($opt:expr, $key:literal, $variant:ident) => {
            if let Some(inner) = $opt {
                p.0.insert($key.into(), match inner {
                    Some(v) => serde_json::Value::$variant(v.into()),
                    None => serde_json::Value::Null,
                });
            }
        };
    }
    set_field!(dto.text, "text", String);
    set_field!(dto.color, "color", String);
    set_field!(dto.task, "task", String);
    set_field!(dto.description, "description", String);
    set_field!(dto.cat_id, "catId", String);
    set_field!(dto.sub_id, "subId", String);
    if let Some(inner) = dto.done { p.0.insert("done".into(), inner.map(serde_json::Value::Bool).unwrap_or(serde_json::Value::Null)); }
    if let Some(inner) = dto.moved { p.0.insert("moved".into(), inner.map(serde_json::Value::Bool).unwrap_or(serde_json::Value::Null)); }
    p
}

#[derive(Serialize, Deserialize)]
struct IntervalDto {
    #[serde(rename = "startMin")] start_min: i64,
    #[serde(rename = "endMin")] end_min: i64,
    text: String, color: String, task: String, description: String,
    #[serde(rename = "catId")] cat_id: Option<String>,
    #[serde(rename = "subId")] sub_id: Option<String>,
    done: bool, moved: bool,
}
impl From<IntervalRow> for IntervalDto {
    fn from(r: IntervalRow) -> Self {
        IntervalDto {
            start_min: r.start_min, end_min: r.end_min, text: r.text, color: r.color,
            task: r.task, description: r.description, cat_id: r.cat_id, sub_id: r.sub_id,
            done: r.done, moved: r.moved,
        }
    }
}
impl From<IntervalDto> for IntervalRow {
    fn from(d: IntervalDto) -> Self {
        IntervalRow {
            start_min: d.start_min, end_min: d.end_min, text: d.text, color: d.color,
            task: d.task, description: d.description, cat_id: d.cat_id, sub_id: d.sub_id,
            done: d.done, moved: d.moved,
        }
    }
}

#[tauri::command]
fn cmd_set_interval(state: State<DbState>, date: String, start_min: i64, end_min: i64, patch: PatchDto) -> Result<(), String> {
    let mut conn = state.0.lock().unwrap();
    set_interval(&mut conn, &date, start_min, end_min, &patch_from_dto(patch)).map_err(|e| e.to_string())
}

#[tauri::command]
fn cmd_clear_interval(state: State<DbState>, date: String, start_min: i64, end_min: i64) -> Result<(), String> {
    let mut conn = state.0.lock().unwrap();
    clear_interval(&mut conn, &date, start_min, end_min).map_err(|e| e.to_string())
}

#[tauri::command]
fn cmd_get_day_intervals(state: State<DbState>, date: String) -> Result<Vec<IntervalDto>, String> {
    let conn = state.0.lock().unwrap();
    get_day_intervals(&conn, &date).map(|v| v.into_iter().map(Into::into).collect()).map_err(|e| e.to_string())
}

#[tauri::command]
fn cmd_get_week_intervals(state: State<DbState>, monday: String) -> Result<Vec<Vec<IntervalDto>>, String> {
    let conn = state.0.lock().unwrap();
    get_week_intervals(&conn, &monday)
        .map(|week| week.into_iter().map(|day| day.into_iter().map(Into::into).collect()).collect())
        .map_err(|e| e.to_string())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct WeekDataDto {
    days: Vec<Vec<IntervalDto>>,
    cell_min: Option<i64>,
    day_start: Option<i64>,
    day_end: Option<i64>,
}

#[tauri::command]
fn cmd_get_week_data(state: State<DbState>, monday: String) -> Result<WeekDataDto, String> {
    let conn = state.0.lock().unwrap();
    let days = get_week_intervals(&conn, &monday)
        .map(|week| week.into_iter().map(|day| day.into_iter().map(Into::into).collect()).collect())
        .map_err(|error| error.to_string())?;
    let bounds = get_week_day_bounds(&conn, &monday).map_err(|error| error.to_string())?;
    let cell_min = get_week_quantum(&conn, &monday).map_err(|error| error.to_string())?;
    Ok(WeekDataDto {
        days,
        cell_min,
        day_start: bounds.as_ref().and_then(|value| value.day_start),
        day_end: bounds.and_then(|value| value.day_end),
    })
}

#[derive(Deserialize)]
struct FindFilterDto {
    #[serde(rename = "dateFrom")] date_from: String,
    #[serde(rename = "dateTo")] date_to: String,
    #[serde(rename = "catId")] cat_id: Option<String>,
    #[serde(rename = "subId")] sub_id: Option<String>,
    #[serde(rename = "textContains")] text_contains: Option<String>,
    done: Option<bool>,
}

#[tauri::command]
fn cmd_find(state: State<DbState>, filter: FindFilterDto) -> Result<Vec<(String, IntervalDto)>, String> {
    let conn = state.0.lock().unwrap();
    let f = FindFilter {
        date_from: &filter.date_from, date_to: &filter.date_to,
        cat_id: filter.cat_id.as_deref(), sub_id: filter.sub_id.as_deref(),
        text_contains: filter.text_contains.as_deref(), done: filter.done,
    };
    find(&conn, &f).map(|v| v.into_iter().map(|(d, r)| (d, r.into())).collect()).map_err(|e| e.to_string())
}

#[tauri::command]
fn cmd_stats_hours(state: State<DbState>, cat_id: String, date_from: String, date_to: String) -> Result<f64, String> {
    let conn = state.0.lock().unwrap();
    stats_hours(&conn, &cat_id, &date_from, &date_to).map_err(|e| e.to_string())
}

#[tauri::command]
fn cmd_free_slots(state: State<DbState>, date: String, day_start: i64, day_end: i64, min_duration: Option<i64>) -> Result<Vec<(i64, i64)>, String> {
    let conn = state.0.lock().unwrap();
    free_slots(&conn, &date, day_start, day_end, min_duration).map_err(|e| e.to_string())
}

#[tauri::command]
fn cmd_add_todo(state: State<DbState>, id: String, text: String, created_at: i64, sort_order: i64) -> Result<(), String> {
    let conn = state.0.lock().unwrap();
    add_todo_at_order(&conn, &id, &text, created_at, sort_order).map_err(|e| e.to_string())
}

#[derive(Serialize)]
struct TodoDto { id: String, text: String, done: bool, #[serde(rename="createdAt")] created_at: i64, #[serde(rename="sortOrder")] sort_order: i64 }
#[tauri::command]
fn cmd_list_todos(state: State<DbState>) -> Result<Vec<TodoDto>, String> {
    let conn = state.0.lock().unwrap();
    list_todos(&conn).map(|v| v.into_iter().map(|t| TodoDto { id: t.id, text: t.text, done: t.done, created_at: t.created_at, sort_order: t.sort_order }).collect()).map_err(|e| e.to_string())
}
#[tauri::command]
fn cmd_toggle_todo(state: State<DbState>, id: String) -> Result<(), String> {
    let conn = state.0.lock().unwrap();
    toggle_todo(&conn, &id).map_err(|e| e.to_string())
}
#[tauri::command]
fn cmd_delete_todo(state: State<DbState>, id: String) -> Result<(), String> {
    let conn = state.0.lock().unwrap();
    delete_todo(&conn, &id).map_err(|e| e.to_string())
}
#[tauri::command]
fn cmd_restore_todo(state: State<DbState>, id: String, text: String, done: bool, created_at: i64, sort_order: i64) -> Result<(), String> {
    let conn = state.0.lock().unwrap();
    restore_todo(&conn, &id, &text, done, created_at, sort_order).map_err(|e| e.to_string())
}
#[tauri::command]
fn cmd_reorder_todos(state: State<DbState>, ids: Vec<String>) -> Result<(), String> {
    let mut conn = state.0.lock().unwrap();
    reorder_todos(&mut conn, &ids).map_err(|e| e.to_string())
}

#[tauri::command]
fn cmd_list_all_all_day_events(state: State<DbState>) -> Result<Vec<AllDayDto>, String> {
    let conn = state.0.lock().unwrap();
    list_all_all_day_events(&conn)
        .map(|v| v.into_iter().map(|r| AllDayDto { id: r.id, text: r.text, cat_id: r.cat_id, color: r.color, start_date: r.start_date, end_date: r.end_date }).collect())
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn cmd_set_all_day(state: State<DbState>, id: String, text: String, cat_id: Option<String>, color: Option<String>, start_date: String, end_date: String, created_at: i64) -> Result<(), String> {
    let conn = state.0.lock().unwrap();
    set_all_day(&conn, &id, &text, cat_id.as_deref(), color.as_deref(), &start_date, &end_date, created_at).map_err(|e| e.to_string())
}

#[tauri::command]
fn cmd_clear_all_day(state: State<DbState>, id: String) -> Result<(), String> {
    let conn = state.0.lock().unwrap();
    clear_all_day(&conn, &id).map_err(|e| e.to_string())
}

#[derive(Serialize)]
struct AllDayDto { id: String, text: String, #[serde(rename="catId")] cat_id: Option<String>, color: Option<String>, #[serde(rename="startDate")] start_date: String, #[serde(rename="endDate")] end_date: String }

#[tauri::command]
fn cmd_get_all_day_in_range(state: State<DbState>, from: String, to: String) -> Result<Vec<AllDayDto>, String> {
    let conn = state.0.lock().unwrap();
    get_all_day_in_range(&conn, &from, &to)
        .map(|v| v.into_iter().map(|r| AllDayDto { id: r.id, text: r.text, cat_id: r.cat_id, color: r.color, start_date: r.start_date, end_date: r.end_date }).collect())
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn cmd_add_category(state: State<DbState>, id: String, name: String, color: String, sort_order: i64) -> Result<(), String> {
    let conn = state.0.lock().unwrap();
    add_category(&conn, &id, &name, &color, sort_order).map_err(|e| e.to_string())
}
#[tauri::command]
fn cmd_rename_category(state: State<DbState>, id: String, name: String) -> Result<(), String> {
    let conn = state.0.lock().unwrap();
    rename_category(&conn, &id, &name).map_err(|e| e.to_string())
}
#[tauri::command]
fn cmd_update_category_color(state: State<DbState>, id: String, color: String) -> Result<(), String> {
    let conn = state.0.lock().unwrap();
    update_category_color(&conn, &id, &color).map_err(|e| e.to_string())
}
#[tauri::command]
fn cmd_delete_category(state: State<DbState>, id: String) -> Result<(), String> {
    let conn = state.0.lock().unwrap();
    delete_category(&conn, &id).map_err(|e| e.to_string())
}
#[tauri::command]
fn cmd_add_subcategory(state: State<DbState>, id: String, category_id: String, name: String, sort_order: i64) -> Result<(), String> {
    let conn = state.0.lock().unwrap();
    add_subcategory(&conn, &id, &category_id, &name, sort_order).map_err(|e| e.to_string())
}
#[tauri::command]
fn cmd_update_subcategory_description(state: State<DbState>, id: String, description: String) -> Result<(), String> {
    let conn = state.0.lock().unwrap();
    update_subcategory_description(&conn, &id, &description).map_err(|e| e.to_string())
}
#[tauri::command]
fn cmd_delete_subcategory(state: State<DbState>, id: String) -> Result<(), String> {
    let conn = state.0.lock().unwrap();
    delete_subcategory(&conn, &id).map_err(|e| e.to_string())
}

#[derive(Serialize)]
struct CategoryDto { id: String, name: String, color: String }
#[tauri::command]
fn cmd_list_categories(state: State<DbState>) -> Result<Vec<CategoryDto>, String> {
    let conn = state.0.lock().unwrap();
    list_categories(&conn).map(|v| v.into_iter().map(|c| CategoryDto { id: c.id, name: c.name, color: c.color }).collect()).map_err(|e| e.to_string())
}
#[derive(Serialize)]
struct SubcategoryDto { id: String, #[serde(rename="categoryId")] category_id: String, name: String, description: String }
#[tauri::command]
fn cmd_list_subcategories(state: State<DbState>) -> Result<Vec<SubcategoryDto>, String> {
    let conn = state.0.lock().unwrap();
    list_subcategories(&conn).map(|v| v.into_iter().map(|s| SubcategoryDto { id: s.id, category_id: s.category_id, name: s.name, description: s.description }).collect()).map_err(|e| e.to_string())
}

#[tauri::command]
fn cmd_set_reflection(state: State<DbState>, date: String, text: String, updated_at: i64) -> Result<(), String> {
    let conn = state.0.lock().unwrap();
    set_reflection(&conn, &date, &text, updated_at).map_err(|e| e.to_string())
}
#[tauri::command]
fn cmd_get_reflection(state: State<DbState>, date: String) -> Result<Option<String>, String> {
    let conn = state.0.lock().unwrap();
    get_reflection(&conn, &date).map_err(|e| e.to_string())
}
#[tauri::command]
fn cmd_export_reflections_markdown(state: State<DbState>, year: i64) -> Result<String, String> {
    let conn = state.0.lock().unwrap();
    export_reflections_markdown(&conn, year).map_err(|e| e.to_string())
}

#[derive(Deserialize)]
struct TemplateIntervalDto { #[serde(rename="dayIdx")] day_idx: i64, #[serde(rename="startMin")] start_min: i64, #[serde(rename="endMin")] end_min: i64, patch: PatchDto }
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
enum ApplyModeDto { Overwrite, KeepExisting, TemplateWins, InteractivePerCell }
impl From<ApplyModeDto> for ApplyMode {
    fn from(d: ApplyModeDto) -> Self {
        match d {
            ApplyModeDto::Overwrite => ApplyMode::Overwrite,
            ApplyModeDto::KeepExisting => ApplyMode::KeepExisting,
            ApplyModeDto::TemplateWins => ApplyMode::TemplateWins,
            ApplyModeDto::InteractivePerCell => ApplyMode::InteractivePerCell,
        }
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct TemplateConflictDecisionDto { date: String, start_min: i64, end_min: i64, overwrite: bool }
impl From<TemplateConflictDecisionDto> for TemplateConflictDecision {
    fn from(value: TemplateConflictDecisionDto) -> Self {
        Self { date: value.date, start_min: value.start_min, end_min: value.end_min, overwrite: value.overwrite }
    }
}

#[tauri::command]
fn cmd_apply_week_template(state: State<DbState>, template: Vec<TemplateIntervalDto>, target_mondays: Vec<String>, mode: ApplyModeDto, day_start: i64, day_end: i64, exceptions: Option<Vec<String>>, decisions: Option<Vec<TemplateConflictDecisionDto>>) -> Result<(), String> {
    let mut conn = state.0.lock().unwrap();
    let items: Vec<TemplateInterval> = template.into_iter().map(|t| TemplateInterval { day_idx: t.day_idx, start_min: t.start_min, end_min: t.end_min, patch: patch_from_dto(t.patch) }).collect();
    let conflict_decisions: Vec<TemplateConflictDecision> = decisions.unwrap_or_default().into_iter().map(Into::into).collect();
    apply_week_template_with_options(&mut conn, &items, &target_mondays, mode.into(), day_start, day_end, exceptions.as_deref().unwrap_or(&[]), &conflict_decisions).map_err(|e| e.to_string())
}

#[tauri::command]
fn cmd_apply_day_template(state: State<DbState>, template: Vec<TemplateIntervalDto>, target_dates: Vec<String>, mode: ApplyModeDto, day_start: i64, day_end: i64, decisions: Option<Vec<TemplateConflictDecisionDto>>) -> Result<(), String> {
    let mut conn = state.0.lock().unwrap();
    let items: Vec<TemplateInterval> = template.into_iter().map(|t| TemplateInterval { day_idx: t.day_idx, start_min: t.start_min, end_min: t.end_min, patch: patch_from_dto(t.patch) }).collect();
    let conflict_decisions: Vec<TemplateConflictDecision> = decisions.unwrap_or_default().into_iter().map(Into::into).collect();
    apply_day_template_with_options(&mut conn, &items, &target_dates, mode.into(), day_start, day_end, &conflict_decisions).map_err(|e| e.to_string())
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RecurringRuleDto {
    day_idx: i64, start_min: i64, duration_min: i64, patch: PatchDto,
    pattern_type: String, custom_ranges: String, anchor_monday: String, weeks_count: i64,
    conflict_mode: ApplyModeDto,
    #[serde(default)]
    decisions: Vec<TemplateConflictDecisionDto>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SettingsDto {
    day_start: i64, day_end: i64, cell_min: i64, zoom: f64, theme: String,
    notifications_enabled: bool, notify_lead_min: i64, last_all_day_notify_date: Option<String>,
}
#[tauri::command]
fn cmd_get_settings(state: State<DbState>) -> Result<SettingsDto, String> {
    let conn = state.0.lock().unwrap();
    get_settings(&conn).map(|s| SettingsDto {
        day_start: s.day_start, day_end: s.day_end, cell_min: s.cell_min, zoom: s.zoom, theme: s.theme,
        notifications_enabled: s.notifications_enabled, notify_lead_min: s.notify_lead_min,
        last_all_day_notify_date: s.last_all_day_notify_date,
    }).map_err(|e| e.to_string())
}

#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct SettingsPatchDto {
    day_start: Option<i64>, day_end: Option<i64>, cell_min: Option<i64>, zoom: Option<f64>, theme: Option<String>,
    notifications_enabled: Option<bool>, notify_lead_min: Option<i64>, last_all_day_notify_date: Option<String>,
}
#[tauri::command]
fn cmd_update_settings(state: State<DbState>, patch: SettingsPatchDto) -> Result<(), String> {
    let conn = state.0.lock().unwrap();
    update_settings(&conn, &SettingsPatch {
        day_start: patch.day_start, day_end: patch.day_end, cell_min: patch.cell_min, zoom: patch.zoom,
        theme: patch.theme, notifications_enabled: patch.notifications_enabled,
        notify_lead_min: patch.notify_lead_min, last_all_day_notify_date: patch.last_all_day_notify_date,
    }).map_err(|e| e.to_string())
}

#[tauri::command]
fn cmd_get_week_quantum(state: State<DbState>, monday: String) -> Result<Option<i64>, String> {
    let conn = state.0.lock().unwrap();
    get_week_quantum(&conn, &monday).map_err(|e| e.to_string())
}

#[tauri::command]
fn cmd_set_week_quantum(state: State<DbState>, monday: String, cell_min: Option<i64>) -> Result<(), String> {
    let conn = state.0.lock().unwrap();
    set_week_quantum(&conn, &monday, cell_min).map_err(|e| e.to_string())
}

#[tauri::command]
fn cmd_get_week_day_bounds(state: State<DbState>, monday: String) -> Result<Option<WeekDayBounds>, String> {
    let conn = state.0.lock().unwrap();
    get_week_day_bounds(&conn, &monday).map_err(|e| e.to_string())
}

#[tauri::command]
fn cmd_set_week_day_bounds(
    state: State<DbState>,
    monday: String,
    day_start: Option<i64>,
    day_end: Option<i64>,
) -> Result<(), String> {
    let conn = state.0.lock().unwrap();
    set_week_day_bounds(&conn, &monday, day_start, day_end).map_err(|e| e.to_string())
}

#[tauri::command]
fn cmd_list_created_years(state: State<DbState>) -> Result<Vec<i64>, String> {
    let conn = state.0.lock().unwrap();
    list_created_years(&conn).map_err(|e| e.to_string())
}
#[tauri::command]
fn cmd_add_created_year(state: State<DbState>, year: i64) -> Result<(), String> {
    let conn = state.0.lock().unwrap();
    add_created_year(&conn, year).map_err(|e| e.to_string())
}

#[tauri::command]
fn cmd_set_week_label(state: State<DbState>, monday: String, label: String) -> Result<(), String> {
    let conn = state.0.lock().unwrap();
    set_week_label(&conn, &monday, &label).map_err(|e| e.to_string())
}
#[tauri::command]
fn cmd_get_week_labels(state: State<DbState>, from: String, to: String) -> Result<Vec<(String, String)>, String> {
    let conn = state.0.lock().unwrap();
    get_week_labels(&conn, &from, &to).map_err(|e| e.to_string())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct TrackerMonthStatsDto { cat_id: String, planned: [i64; 12], moved: [i64; 12], done: [i64; 12] }
#[tauri::command]
fn cmd_tracker_stats_by_month(state: State<DbState>, year: i64) -> Result<Vec<TrackerMonthStatsDto>, String> {
    let conn = state.0.lock().unwrap();
    tracker_stats_by_month(&conn, year)
        .map(|v| v.into_iter().map(|s| TrackerMonthStatsDto { cat_id: s.cat_id, planned: s.planned, moved: s.moved, done: s.done }).collect())
        .map_err(|e| e.to_string())
}

#[derive(Serialize)]
struct TrackerRangeStatsDto { #[serde(rename="catId")] cat_id: String, planned: i64, moved: i64, done: i64 }
#[tauri::command]
fn cmd_tracker_stats_range(state: State<DbState>, date_from: String, date_to: String) -> Result<Vec<TrackerRangeStatsDto>, String> {
    let conn = state.0.lock().unwrap();
    tracker_stats_range(&conn, &date_from, &date_to)
        .map(|v| v.into_iter().map(|s| TrackerRangeStatsDto { cat_id: s.cat_id, planned: s.planned, moved: s.moved, done: s.done }).collect())
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn cmd_minutes_by_category(state: State<DbState>, date_from: String, date_to: String) -> Result<Vec<(String, i64)>, String> {
    let conn = state.0.lock().unwrap();
    minutes_by_category(&conn, &date_from, &date_to).map_err(|e| e.to_string())
}

#[tauri::command]
fn cmd_restore_week(state: State<DbState>, monday: String, days: Vec<Vec<IntervalDto>>) -> Result<(), String> {
    // Снимок - те же ПОЛНЫЕ интервалы, что отдаёт cmd_get_week_intervals
    // (не патчи - значит никакого мержа тут не нужно, точная замена).
    let mut conn = state.0.lock().unwrap();
    let mut arr: [Vec<IntervalRow>; 7] = Default::default();
    for (day_idx, day) in days.into_iter().enumerate() {
        if day_idx >= 7 { break; }
        arr[day_idx] = day.into_iter().map(IntervalRow::from).collect();
    }
    restore_week(&mut conn, &monday, &arr).map_err(|e| e.to_string())
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RestoreWeekSnapshotDto { monday: String, days: Vec<Vec<IntervalDto>> }

#[tauri::command]
fn cmd_restore_weeks(state: State<DbState>, snapshots: Vec<RestoreWeekSnapshotDto>) -> Result<(), String> {
    let mut conn = state.0.lock().unwrap();
    let weeks: Vec<(String, [Vec<IntervalRow>; 7])> = snapshots.into_iter().map(|snapshot| {
        let mut days: [Vec<IntervalRow>; 7] = Default::default();
        for (index, day) in snapshot.days.into_iter().enumerate().take(7) {
            days[index] = day.into_iter().map(IntervalRow::from).collect();
        }
        (snapshot.monday, days)
    }).collect();
    restore_weeks(&mut conn, &weeks).map_err(|e| e.to_string())
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct TodoRestoreDto { id: String, text: String, done: bool, created_at: i64, sort_order: i64 }

#[tauri::command]
fn cmd_restore_todo_drop(state: State<DbState>, monday: String, days: Vec<Vec<IntervalDto>>, todo: TodoRestoreDto) -> Result<(), String> {
    let mut conn = state.0.lock().unwrap();
    let mut arr: [Vec<IntervalRow>; 7] = Default::default();
    for (day_idx, day) in days.into_iter().enumerate() {
        if day_idx >= 7 { break; }
        arr[day_idx] = day.into_iter().map(IntervalRow::from).collect();
    }
    let todo = TodoRow { id: todo.id, text: todo.text, done: todo.done, created_at: todo.created_at, sort_order: todo.sort_order };
    restore_todo_drop(&mut conn, &monday, &arr, &todo).map_err(|e| e.to_string())
}

#[tauri::command]
fn cmd_add_template(state: State<DbState>, id: String, name: String, kind: String, data: String, created_at: i64) -> Result<(), String> {
    let conn = state.0.lock().unwrap();
    add_template(&conn, &id, &name, &kind, &data, created_at).map_err(|e| e.to_string())
}
#[tauri::command]
fn cmd_delete_template(state: State<DbState>, id: String) -> Result<(), String> {
    let conn = state.0.lock().unwrap();
    delete_template(&conn, &id).map_err(|e| e.to_string())
}
#[derive(Serialize)]
struct TemplateDto { id: String, name: String, #[serde(rename="type")] kind: String, data: String }
#[tauri::command]
fn cmd_list_templates(state: State<DbState>) -> Result<Vec<TemplateDto>, String> {
    let conn = state.0.lock().unwrap();
    list_templates(&conn).map(|v| v.into_iter().map(|t| TemplateDto { id: t.id, name: t.name, kind: t.kind, data: t.data }).collect()).map_err(|e| e.to_string())
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct PlanScriptDto {
    id: String,
    name: String,
    code: String,
    version: i64,
    created_at: i64,
    updated_at: i64,
    last_run_at: Option<i64>,
}

#[tauri::command]
fn cmd_save_planscript(state: State<DbState>, script: PlanScriptDto) -> Result<(), String> {
    let conn = state.0.lock().unwrap();
    save_planscript(&conn, &PlanScriptRow {
        id: script.id,
        name: script.name,
        code: script.code,
        version: script.version,
        created_at: script.created_at,
        updated_at: script.updated_at,
        last_run_at: script.last_run_at,
    }).map_err(|e| e.to_string())
}

#[tauri::command]
fn cmd_delete_planscript(state: State<DbState>, id: String) -> Result<(), String> {
    let conn = state.0.lock().unwrap();
    delete_planscript(&conn, &id).map_err(|e| e.to_string())
}

#[tauri::command]
fn cmd_list_planscripts(state: State<DbState>) -> Result<Vec<PlanScriptDto>, String> {
    let conn = state.0.lock().unwrap();
    list_planscripts(&conn).map(|scripts| scripts.into_iter().map(|script| PlanScriptDto {
        id: script.id,
        name: script.name,
        code: script.code,
        version: script.version,
        created_at: script.created_at,
        updated_at: script.updated_at,
        last_run_at: script.last_run_at,
    }).collect()).map_err(|e| e.to_string())
}

#[tauri::command]
fn cmd_mark_planscript_run(state: State<DbState>, id: String, ran_at: i64) -> Result<(), String> {
    let conn = state.0.lock().unwrap();
    mark_planscript_run(&conn, &id, ran_at).map_err(|e| e.to_string())
}

#[tauri::command]
fn cmd_apply_planscript_operations(state: State<DbState>, operations: Vec<serde_json::Value>) -> Result<(), String> {
    let mut conn = state.0.lock().unwrap();
    apply_planscript_operations(&mut conn, &operations)
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct PlanScriptWatcherDto {
    id: String,
    name: String,
    scope: String,
    code: String,
    enabled: bool,
    version: i64,
    created_at: i64,
    updated_at: i64,
}

#[tauri::command]
fn cmd_save_planscript_watcher(state: State<DbState>, watcher: PlanScriptWatcherDto) -> Result<(), String> {
    let conn = state.0.lock().unwrap();
    save_planscript_watcher(&conn, &PlanScriptWatcherRow {
        id: watcher.id, name: watcher.name, scope: watcher.scope, code: watcher.code,
        enabled: watcher.enabled, version: watcher.version, created_at: watcher.created_at, updated_at: watcher.updated_at,
    }).map_err(|error| error.to_string())
}

#[tauri::command]
fn cmd_delete_planscript_watcher(state: State<DbState>, id: String) -> Result<(), String> {
    let conn = state.0.lock().unwrap();
    delete_planscript_watcher(&conn, &id).map_err(|error| error.to_string())
}

#[tauri::command]
fn cmd_list_planscript_watchers(state: State<DbState>) -> Result<Vec<PlanScriptWatcherDto>, String> {
    let conn = state.0.lock().unwrap();
    list_planscript_watchers(&conn).map(|watchers| watchers.into_iter().map(|watcher| PlanScriptWatcherDto {
        id: watcher.id, name: watcher.name, scope: watcher.scope, code: watcher.code, enabled: watcher.enabled,
        version: watcher.version, created_at: watcher.created_at, updated_at: watcher.updated_at,
    }).collect()).map_err(|error| error.to_string())
}

#[tauri::command]
fn cmd_save_watch_result(
    state: State<DbState>,
    watcher_id: String,
    scope: String,
    owner_key: String,
    indicator: Option<serde_json::Value>,
    dependencies: Vec<String>,
) -> Result<(), String> {
    let mut conn = state.0.lock().unwrap();
    save_watch_result(&mut conn, &watcher_id, &scope, &owner_key, indicator.as_ref(), &dependencies)
}

#[tauri::command]
fn cmd_list_watch_indicators(state: State<DbState>, scope: String, from: String, to: String) -> Result<Vec<WatchIndicatorRow>, String> {
    let conn = state.0.lock().unwrap();
    list_watch_indicators(&conn, &scope, &from, &to).map_err(|error| error.to_string())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct WatchAffectedDto { scope: String, owner_key: String }

#[tauri::command]
fn cmd_list_affected_watch_instances(state: State<DbState>, date: String) -> Result<Vec<WatchAffectedDto>, String> {
    let conn = state.0.lock().unwrap();
    list_affected_watch_instances(&conn, &date)
        .map(|instances| instances.into_iter().map(|(scope, owner_key)| WatchAffectedDto { scope, owner_key }).collect())
        .map_err(|error| error.to_string())
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RecurringRuleRowDto {
    id: String, name: String, day_idx: i64, start_min: i64, duration_min: i64,
    cat_id: Option<String>, sub_id: Option<String>, color: Option<String>, task: Option<String>,
    pattern_type: String, custom_ranges: String, anchor_monday: String, weeks_count: i64,
    conflict_mode: String,
}
#[tauri::command]
fn cmd_add_recurring_rule(state: State<DbState>, rule: RecurringRuleRowDto, created_at: i64) -> Result<(), String> {
    let conn = state.0.lock().unwrap();
    let r = RecurringRuleRow {
        id: rule.id, name: rule.name, day_idx: rule.day_idx, start_min: rule.start_min, duration_min: rule.duration_min,
        cat_id: rule.cat_id, sub_id: rule.sub_id, color: rule.color, task: rule.task,
        pattern_type: rule.pattern_type, custom_ranges: rule.custom_ranges, anchor_monday: rule.anchor_monday, weeks_count: rule.weeks_count,
        conflict_mode: rule.conflict_mode,
    };
    add_recurring_rule(&conn, &r, created_at).map_err(|e| e.to_string())
}
#[tauri::command]
fn cmd_delete_recurring_rule(state: State<DbState>, id: String) -> Result<(), String> {
    let conn = state.0.lock().unwrap();
    delete_recurring_rule(&conn, &id).map_err(|e| e.to_string())
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RecurringRuleDto2 {
    id: String, name: String, day_idx: i64, start_min: i64, duration_min: i64,
    cat_id: Option<String>, sub_id: Option<String>, color: Option<String>, task: Option<String>,
    pattern_type: String, custom_ranges: String, anchor_monday: String, weeks_count: i64,
    conflict_mode: String,
}
#[tauri::command]
fn cmd_list_recurring_rules(state: State<DbState>) -> Result<Vec<RecurringRuleDto2>, String> {
    let conn = state.0.lock().unwrap();
    list_recurring_rules(&conn).map(|v| v.into_iter().map(|r| RecurringRuleDto2 {
        id: r.id, name: r.name, day_idx: r.day_idx, start_min: r.start_min, duration_min: r.duration_min,
        cat_id: r.cat_id, sub_id: r.sub_id, color: r.color, task: r.task,
        pattern_type: r.pattern_type, custom_ranges: r.custom_ranges, anchor_monday: r.anchor_monday, weeks_count: r.weeks_count,
        conflict_mode: r.conflict_mode,
    }).collect()).map_err(|e| e.to_string())
}

#[tauri::command]
fn cmd_apply_recurring_rule(state: State<DbState>, rule: RecurringRuleDto) -> Result<usize, String> {
    let mut conn = state.0.lock().unwrap();
    let spec = RecurringRuleSpec {
        day_idx: rule.day_idx, start_min: rule.start_min, duration_min: rule.duration_min,
        patch: patch_from_dto(rule.patch), pattern_type: rule.pattern_type,
        custom_ranges: rule.custom_ranges, anchor_monday: rule.anchor_monday, weeks_count: rule.weeks_count,
        conflict_mode: rule.conflict_mode.into(),
        decisions: rule.decisions.into_iter().map(Into::into).collect(),
    };
    apply_recurring_rule(&mut conn, &spec).map_err(|e| e.to_string())
}
