use planner_storage::*;

#[test]
fn week_quantum_overrides_global_only_for_selected_week() {
    let conn = open_in_memory().unwrap();
    assert_eq!(get_week_quantum(&conn, "2026-10-26").unwrap(), None);

    set_week_quantum(&conn, "2026-10-26", Some(15)).unwrap();
    assert_eq!(get_week_quantum(&conn, "2026-10-26").unwrap(), Some(15));
    assert_eq!(get_week_quantum(&conn, "2026-11-02").unwrap(), None);

    set_week_quantum(&conn, "2026-10-26", None).unwrap();
    assert_eq!(get_week_quantum(&conn, "2026-10-26").unwrap(), None);
    assert!(set_week_quantum(&conn, "2026-10-26", Some(7)).is_err());
}

#[test]
fn week_day_bounds_override_independently_and_reset() {
    let conn = open_in_memory().unwrap();
    assert_eq!(get_week_day_bounds(&conn, "2026-10-26").unwrap(), None);

    set_week_day_bounds(&conn, "2026-10-26", Some(420), None).unwrap();
    assert_eq!(
        get_week_day_bounds(&conn, "2026-10-26").unwrap(),
        Some(WeekDayBounds { day_start: Some(420), day_end: None }),
    );
    set_week_day_bounds(&conn, "2026-10-26", Some(420), Some(1260)).unwrap();
    assert_eq!(
        get_week_day_bounds(&conn, "2026-10-26").unwrap(),
        Some(WeekDayBounds { day_start: Some(420), day_end: Some(1260) }),
    );
    assert_eq!(get_week_day_bounds(&conn, "2026-11-02").unwrap(), None);
    assert!(set_week_day_bounds(&conn, "2026-10-26", Some(1260), Some(420)).is_err());
    assert!(set_week_day_bounds(&conn, "2026-10-26", Some(421), None).is_err());

    set_week_day_bounds(&conn, "2026-10-26", None, None).unwrap();
    assert_eq!(get_week_day_bounds(&conn, "2026-10-26").unwrap(), None);
}

#[test]
fn global_hours_cannot_break_a_week_specific_range() {
    let conn = open_in_memory().unwrap();
    set_week_day_bounds(&conn, "2026-10-26", Some(480), None).unwrap();
    assert!(update_settings(&conn, &SettingsPatch { day_end: Some(420), ..Default::default() }).is_err());
    assert!(update_settings(&conn, &SettingsPatch { day_end: Some(1080), ..Default::default() }).is_ok());
}

#[test]
fn all_day_set_and_clear() {
    let conn = open_in_memory().unwrap();
    set_all_day(&conn, "e1", "Отпуск", None, Some("#8A8272"), "2026-07-10", "2026-07-20", 1000).unwrap();
    let got = get_all_day_in_range(&conn, "2026-07-01", "2026-07-31").unwrap();
    assert_eq!(got.len(), 1);
    assert_eq!(got[0].text, "Отпуск");

    clear_all_day(&conn, "e1").unwrap();
    let got2 = get_all_day_in_range(&conn, "2026-07-01", "2026-07-31").unwrap();
    assert!(got2.is_empty());
}

#[test]
fn all_day_swaps_reversed_dates() {
    let conn = open_in_memory().unwrap();
    // Начало позже конца - должно автоматически поменяться местами, как
    // делал addAllDayEvent() в Planner.jsx.
    set_all_day(&conn, "e1", "X", None, None, "2026-07-20", "2026-07-10", 1000).unwrap();
    let got = get_all_day_in_range(&conn, "2026-07-01", "2026-07-31").unwrap();
    assert_eq!(got[0].start_date, "2026-07-10");
    assert_eq!(got[0].end_date, "2026-07-20");
}

#[test]
fn all_day_range_overlap_query() {
    let conn = open_in_memory().unwrap();
    set_all_day(&conn, "e1", "Раньше", None, None, "2026-01-01", "2026-01-05", 1).unwrap();
    set_all_day(&conn, "e2", "Пересекает", None, None, "2026-01-04", "2026-01-10", 2).unwrap();
    set_all_day(&conn, "e3", "Позже", None, None, "2026-02-01", "2026-02-05", 3).unwrap();

    let got = get_all_day_in_range(&conn, "2026-01-06", "2026-01-20").unwrap();
    assert_eq!(got.len(), 1);
    assert_eq!(got[0].text, "Пересекает");
}

#[test]
fn category_crud_and_delete_keeps_intervals_but_nulls_cat_id() {
    let mut conn = open_in_memory().unwrap();
    add_category(&conn, "c1", "Спорт", "#2E7D74", 0).unwrap();
    set_interval(&mut conn, "2026-09-14", 540, 600, &IntervalPatch::new().text("Бег").cat_id(Some("c1"))).unwrap();

    delete_category(&conn, "c1").unwrap();

    let cats = list_categories(&conn).unwrap();
    assert!(cats.is_empty(), "категория должна быть удалена");

    let got = get_day_intervals(&conn, "2026-09-14").unwrap();
    assert_eq!(got.len(), 1, "интервал должен остаться (как и в старом removeCat())");
    assert_eq!(got[0].text, "Бег");
    assert_eq!(got[0].cat_id, None, "cat_id должен обнулиться через ON DELETE SET NULL");
}

#[test]
fn subcategory_crud() {
    let conn = open_in_memory().unwrap();
    add_category(&conn, "c1", "Учёба", "#1F4741", 0).unwrap();
    add_subcategory(&conn, "s1", "c1", "Матан", 0).unwrap();
    update_subcategory_description(&conn, "s1", "Интегралы и пределы").unwrap();

    let subs = list_subcategories(&conn).unwrap();
    assert_eq!(subs.len(), 1);
    assert_eq!(subs[0].description, "Интегралы и пределы");

    delete_subcategory(&conn, "s1").unwrap();
    assert!(list_subcategories(&conn).unwrap().is_empty());
}

#[test]
fn template_crud() {
    let conn = open_in_memory().unwrap();
    add_template(&conn, "t1", "Рабочая неделя", "week", "{}", 1000).unwrap();
    add_template(&conn, "t2", "Выходной", "day", "{}", 2000).unwrap();
    let list = list_templates(&conn).unwrap();
    assert_eq!(list.len(), 2);
    assert_eq!(list[0].name, "Рабочая неделя");
    delete_template(&conn, "t1").unwrap();
    assert_eq!(list_templates(&conn).unwrap().len(), 1);
}

#[test]
fn planscript_crud_and_last_run_timestamp() {
    let conn = open_in_memory().unwrap();
    let script = PlanScriptRow {
        id: "script-1".into(),
        name: "Расписание".into(),
        code: "log('проверка')".into(),
        version: 1,
        created_at: 10,
        updated_at: 20,
        last_run_at: None,
    };
    save_planscript(&conn, &script).unwrap();
    let loaded = list_planscripts(&conn).unwrap();
    assert_eq!(loaded, vec![script.clone()]);

    mark_planscript_run(&conn, "script-1", 30).unwrap();
    assert_eq!(list_planscripts(&conn).unwrap()[0].last_run_at, Some(30));

    let mut changed = script;
    changed.name = "Обновлённое расписание".into();
    changed.code = "log('новый код')".into();
    changed.updated_at = 40;
    save_planscript(&conn, &changed).unwrap();
    let loaded = list_planscripts(&conn).unwrap();
    assert_eq!(loaded[0].name, changed.name);
    assert_eq!(loaded[0].code, changed.code);
    assert_eq!(loaded[0].created_at, 10, "сохранение версии не меняет дату создания");
    assert_eq!(loaded[0].last_run_at, Some(30), "обновление кода сохраняет дату последнего запуска");

    delete_planscript(&conn, "script-1").unwrap();
    assert!(list_planscripts(&conn).unwrap().is_empty());
}

#[test]
fn planscript_watchers_persist_results_and_dependencies() {
    let mut conn = open_in_memory().unwrap();
    let watcher = PlanScriptWatcherRow {
        id: "watch-1".into(),
        name: "Перегрузка".into(),
        scope: "day".into(),
        code: "watch every day:\n    day.indicator.clear()".into(),
        enabled: true,
        version: 1,
        created_at: 10,
        updated_at: 20,
    };
    save_planscript_watcher(&conn, &watcher).unwrap();
    assert_eq!(list_planscript_watchers(&conn).unwrap(), vec![watcher.clone()]);

    save_watch_result(
        &mut conn,
        "watch-1",
        "day",
        "2026-09-01",
        Some(&serde_json::json!({"text":"Перегруз","color":"#FF0000"})),
        &["2026-08-31".into(), "2026-09-01".into()],
    ).unwrap();
    assert!(list_affected_watch_instances(&conn, "2026-08-31").unwrap().contains(&("day".into(), "2026-09-01".into())));
    let indicators = list_watch_indicators(&conn, "day", "2026-09-01", "2026-09-01").unwrap();
    assert_eq!(indicators.len(), 1);
    assert_eq!(indicators[0].text, "Перегруз");

    save_watch_result(&mut conn, "watch-1", "day", "2026-09-01", None, &[]).unwrap();
    assert!(list_watch_indicators(&conn, "day", "2026-09-01", "2026-09-01").unwrap().is_empty());
    delete_planscript_watcher(&conn, "watch-1").unwrap();
    assert!(list_planscript_watchers(&conn).unwrap().is_empty());
}

#[test]
fn planscript_operation_batch_is_atomic() {
    let mut conn = open_in_memory().unwrap();
    add_category(&conn, "c1", "Работа", "#123456", 0).unwrap();
    let result = apply_planscript_operations(
        &mut conn,
        &[
            serde_json::json!({
                "type": "SetInterval",
                "date": "2026-09-01",
                "startMin": 720,
                "endMin": 780,
                "patch": {"text": "Фокус", "catId": "c1"}
            }),
            serde_json::json!({
                "type": "SetInterval",
                "date": "2026-09-01",
                "startMin": 781,
                "endMin": 800,
                "patch": {"text": "Некорректный диапазон"}
            }),
        ],
    );
    assert!(result.is_err());
    assert!(get_day_intervals(&conn, "2026-09-01").unwrap().is_empty(), "первая операция должна откатиться вместе с пачкой");
}

#[test]
fn recurring_rule_crud() {
    let conn = open_in_memory().unwrap();
    add_category(&conn, "c1", "Спорт", "#2E7D74", 0).unwrap();
    let r = RecurringRuleRow {
        id: "r1".into(), name: "Тренировка".into(), day_idx: 1, start_min: 510, duration_min: 90,
        cat_id: Some("c1".into()), sub_id: None, color: Some("#2E7D74".into()), task: None,
        pattern_type: "all".into(), custom_ranges: "".into(), anchor_monday: "2026-09-14".into(), weeks_count: 17,
        conflict_mode: "keepExisting".into(),
    };
    add_recurring_rule(&conn, &r, 1000).unwrap();
    let list = list_recurring_rules(&conn).unwrap();
    assert_eq!(list.len(), 1);
    assert_eq!(list[0].name, "Тренировка");
    assert_eq!(list[0].weeks_count, 17);
    assert_eq!(list[0].conflict_mode, "keepExisting");
    delete_recurring_rule(&conn, "r1").unwrap();
    assert!(list_recurring_rules(&conn).unwrap().is_empty());
}

#[test]
fn tracker_stats_counts_distinct_cat_date_subcategory_units() {
    let mut conn = open_in_memory().unwrap();
    add_category(&conn, "c5", "Учёба ЭБ", "#1F4741", 0).unwrap();
    add_subcategory(&conn, "s1", "c5", "Управление персоналом", 0).unwrap();
    add_subcategory(&conn, "s2", "c5", "Налоговое планирование", 1).unwrap();

    // Два РАЗНЫХ занятия в один день - должны считаться как 2 единицы,
    // не схлопнуться в одну (это и был старый баг без subId в ключе).
    set_interval(&mut conn, "2026-03-10", 540, 600,
        &IntervalPatch::new().text("Пара 1").color("#1F4741").cat_id(Some("c5")).done(true)).unwrap();
    // subId нужно выставить отдельно - IntervalPatch::cat_id есть, добавим sub через builder-паттерн напрямую
    {
        let mut p = IntervalPatch::new();
        p.0.insert("subId".into(), serde_json::json!("s2"));
        p.0.insert("catId".into(), serde_json::json!("c5"));
        p.0.insert("color".into(), serde_json::json!("#1F4741"));
        p.0.insert("text".into(), serde_json::json!("Пара 2"));
        set_interval(&mut conn, "2026-03-10", 660, 720, &p).unwrap();
    }

    let stats = tracker_stats_by_month(&conn, 2026).unwrap();
    let c5 = stats.iter().find(|s| s.cat_id == "c5").unwrap();
    assert_eq!(c5.planned[2], 2, "март (индекс 2) - две разные подкатегории в один день = 2 единицы");
    assert_eq!(c5.done[2], 1, "done=true только у первой пары");
}

#[test]
fn tracker_stats_90min_pair_stored_as_two_rows_counts_once() {
    // 90-минутная пара с текстом только на первых 30 минутах хранится как
    // ДВА ряда (разное содержимое - text отличается), но это ОДНА единица
    // "занято", а не две - 5-минутных квантов внутри вообще больше нет,
    // но проверим именно сценарий "несколько рядов, одна дата+категория".
    let mut conn = open_in_memory().unwrap();
    add_category(&conn, "c1", "Спорт", "#2E7D74", 0).unwrap();
    set_interval(&mut conn, "2026-05-01", 540, 570, &IntervalPatch::new().text("Бег").cat_id(Some("c1"))).unwrap();
    set_interval(&mut conn, "2026-05-01", 570, 630, &IntervalPatch::new().color("#2E7D74").cat_id(Some("c1"))).unwrap(); // без текста - второй ряд, та же пара

    let stats = tracker_stats_by_month(&conn, 2026).unwrap();
    let c1 = stats.iter().find(|s| s.cat_id == "c1").unwrap();
    assert_eq!(c1.planned[4], 1, "май (индекс 4) - два ряда одного дня/категории/БЕЗ подкатегории = одна единица");
}

#[test]
fn tracker_stats_filters_by_year_and_ignores_uncategorized() {
    let mut conn = open_in_memory().unwrap();
    add_category(&conn, "c1", "Спорт", "#2E7D74", 0).unwrap();
    set_interval(&mut conn, "2025-12-31", 540, 600, &IntervalPatch::new().color("#2E7D74").cat_id(Some("c1"))).unwrap();
    set_interval(&mut conn, "2026-01-01", 540, 600, &IntervalPatch::new().color("#2E7D74").cat_id(Some("c1"))).unwrap();
    set_interval(&mut conn, "2026-01-02", 540, 600, &IntervalPatch::new().text("без категории")).unwrap();

    let stats = tracker_stats_by_month(&conn, 2026).unwrap();
    assert_eq!(stats.len(), 1, "только c1 должна попасть (без категории не считается, 2025 год не считается)");
    assert_eq!(stats[0].planned[0], 1);
}

#[test]
fn minutes_by_category_sums_per_category_in_range() {
    let mut conn = open_in_memory().unwrap();
    add_category(&conn, "c1", "Спорт", "#2E7D74", 0).unwrap();
    add_category(&conn, "c2", "Работа", "#8A5C3E", 0).unwrap();
    set_interval(&mut conn, "2026-09-14", 540, 630, &IntervalPatch::new().color("#2E7D74").cat_id(Some("c1"))).unwrap(); // 90 мин
    set_interval(&mut conn, "2026-09-15", 600, 660, &IntervalPatch::new().color("#2E7D74").cat_id(Some("c1"))).unwrap(); // 60 мин, та же категория
    set_interval(&mut conn, "2026-09-14", 700, 730, &IntervalPatch::new().color("#8A5C3E").cat_id(Some("c2"))).unwrap(); // 30 мин
    set_interval(&mut conn, "2026-09-21", 540, 600, &IntervalPatch::new().color("#2E7D74").cat_id(Some("c1"))).unwrap(); // вне диапазона

    let mut result = minutes_by_category(&conn, "2026-09-14", "2026-09-20").unwrap();
    result.sort();
    assert_eq!(result, vec![("c1".to_string(), 150), ("c2".to_string(), 30)]);
}

#[test]
fn tracker_stats_range_sums_without_month_split() {
    let mut conn = open_in_memory().unwrap();
    add_category(&conn, "c1", "Спорт", "#2E7D74", 0).unwrap();
    // Диапазон, пересекающий границу месяца/года - именно то, чего не
    // может tracker_stats_by_month (он всегда в пределах одного года).
    set_interval(&mut conn, "2025-12-30", 540, 600, &IntervalPatch::new().color("#2E7D74").cat_id(Some("c1"))).unwrap();
    set_interval(&mut conn, "2026-01-02", 540, 600, &IntervalPatch::new().color("#2E7D74").cat_id(Some("c1")).done(true)).unwrap();
    set_interval(&mut conn, "2026-02-01", 540, 600, &IntervalPatch::new().color("#2E7D74").cat_id(Some("c1"))).unwrap(); // вне диапазона

    let stats = tracker_stats_range(&conn, "2025-12-29", "2026-01-04").unwrap();
    assert_eq!(stats.len(), 1);
    assert_eq!(stats[0].planned, 2, "обе записи внутри диапазона, третья (февраль) - вне");
    assert_eq!(stats[0].done, 1);
}

#[test]
fn reflection_set_get_and_empty_deletes() {
    let conn = open_in_memory().unwrap();
    set_reflection(&conn, "2026-09-14", "Хороший был день.", 1000).unwrap();
    assert_eq!(get_reflection(&conn, "2026-09-14").unwrap(), Some("Хороший был день.".to_string()));

    // перезапись тем же ключом (ON CONFLICT UPDATE)
    set_reflection(&conn, "2026-09-14", "Отредактировал.", 2000).unwrap();
    assert_eq!(get_reflection(&conn, "2026-09-14").unwrap(), Some("Отредактировал.".to_string()));

    // пустой текст - должен удалить запись, а не оставить пустую строку
    set_reflection(&conn, "2026-09-14", "   ", 3000).unwrap();
    assert_eq!(get_reflection(&conn, "2026-09-14").unwrap(), None);
}

#[test]
fn reflection_export_markdown_for_year() {
    let conn = open_in_memory().unwrap();
    set_reflection(&conn, "2026-01-05", "Первая запись года.", 1).unwrap();
    set_reflection(&conn, "2026-06-20", "Середина года.", 2).unwrap();
    set_reflection(&conn, "2025-12-31", "Прошлый год - не должно попасть.", 3).unwrap();
    set_reflection(&conn, "2027-01-01", "Следующий год - тоже не должно.", 4).unwrap();

    let md = export_reflections_markdown(&conn, 2026).unwrap();
    assert!(md.contains("# Рефлексии за 2026 год"));
    assert!(md.contains("## 2026-01-05"));
    assert!(md.contains("Первая запись года."));
    assert!(md.contains("## 2026-06-20"));
    assert!(md.contains("Середина года."));
    assert!(!md.contains("Прошлый год"));
    assert!(!md.contains("Следующий год"));

    // порядок - по дате
    let pos_jan = md.find("2026-01-05").unwrap();
    let pos_jun = md.find("2026-06-20").unwrap();
    assert!(pos_jan < pos_jun, "записи должны идти в хронологическом порядке");
}

#[test]
fn reflection_export_empty_year_gives_header_only() {
    let conn = open_in_memory().unwrap();
    let md = export_reflections_markdown(&conn, 2099).unwrap();
    assert_eq!(md, "# Рефлексии за 2099 год\n\n");
}

#[test]
fn todo_priority_is_persisted_and_reordered_atomically() {
    let mut conn = open_in_memory().unwrap();
    add_todo(&conn, "t1", "Первое", 10).unwrap();
    add_todo(&conn, "t2", "Второе", 20).unwrap();
    add_todo(&conn, "t3", "Третье", 30).unwrap();

    reorder_todos(&mut conn, &["t3".into(), "t1".into(), "t2".into()]).unwrap();
    let todos = list_todos(&conn).unwrap();
    assert_eq!(todos.iter().map(|todo| todo.id.as_str()).collect::<Vec<_>>(), ["t3", "t1", "t2"]);
    assert_eq!(todos.iter().map(|todo| todo.sort_order).collect::<Vec<_>>(), [0, 1, 2]);

    assert!(reorder_todos(&mut conn, &["t1".into(), "missing".into(), "t3".into()]).is_err());
    let after_failed_reorder = list_todos(&conn).unwrap();
    assert_eq!(after_failed_reorder.iter().map(|todo| todo.id.as_str()).collect::<Vec<_>>(), ["t3", "t1", "t2"]);
}

#[test]
fn undoing_todo_drop_restores_week_and_todo_together() {
    let mut conn = open_in_memory().unwrap();
    let original = IntervalRow {
        start_min: 540,
        end_min: 570,
        text: "Запланировано".into(),
        color: "#123456".into(),
        task: String::new(),
        description: String::new(),
        cat_id: None,
        sub_id: None,
        done: false,
        moved: false,
    };
    let days = [vec![original], vec![], vec![], vec![], vec![], vec![], vec![]];
    set_interval(&mut conn, "2026-09-14", 540, 570, &IntervalPatch::new().text("Перемещено")).unwrap();
    add_todo(&conn, "t1", "Дело", 100).unwrap();
    delete_todo(&conn, "t1").unwrap();

    restore_todo_drop(
        &mut conn,
        "2026-09-14",
        &days,
        &TodoRow { id: "t1".into(), text: "Дело".into(), done: false, created_at: 100, sort_order: 0 },
    ).unwrap();

    assert_eq!(get_day_intervals(&conn, "2026-09-14").unwrap()[0].text, "Запланировано");
    let todos = list_todos(&conn).unwrap();
    assert_eq!(todos.len(), 1);
    assert_eq!(todos[0].text, "Дело");
    assert_eq!(todos[0].sort_order, 0);
}
