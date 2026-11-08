use planner_storage::*;

#[test]
fn settings_default_row_exists_after_schema_init() {
    let conn = open_in_memory().unwrap();
    let settings = get_settings(&conn).unwrap();
    assert_eq!(settings.day_start, 360);
    assert_eq!(settings.day_end, 1440);
    assert_eq!(settings.cell_min, 30);
    assert_eq!(settings.theme, "calm");
}

#[test]
fn settings_update_partial_keeps_other_fields() {
    let conn = open_in_memory().unwrap();
    conn.execute(
        "UPDATE settings SET day_start=360, day_end=1440, cell_min=30, zoom=1.0, theme='calm', notifications_enabled=0, notify_lead_min=10 WHERE id=1",
        [],
    ).unwrap();

    update_settings(&conn, &SettingsPatch { cell_min: Some(10), ..Default::default() }).unwrap();
    let s = get_settings(&conn).unwrap();
    assert_eq!(s.cell_min, 10, "изменённое поле применилось");
    assert_eq!(s.day_start, 360, "остальные поля не должны были тронуться");
    assert_eq!(s.theme, "calm");
}

#[test]
fn created_years_add_and_list_sorted_deduped() {
    let conn = open_in_memory().unwrap();
    add_created_year(&conn, 2027).unwrap();
    add_created_year(&conn, 2025).unwrap();
    add_created_year(&conn, 2027).unwrap(); // дубликат - должен молча проигнорироваться
    assert_eq!(list_created_years(&conn).unwrap(), vec![2025, 2027]);
}

#[test]
fn week_label_set_get_and_empty_deletes() {
    let conn = open_in_memory().unwrap();
    set_week_label(&conn, "2026-09-14", "17").unwrap();
    assert_eq!(get_week_labels(&conn, "2026-01-01", "2026-12-31").unwrap(), vec![("2026-09-14".to_string(), "17".to_string())]);

    set_week_label(&conn, "2026-09-14", "").unwrap();
    assert!(get_week_labels(&conn, "2026-01-01", "2026-12-31").unwrap().is_empty());
}

#[test]
fn migration_picks_up_years_notify_date_and_week_labels() {
    use std::collections::BTreeMap;
    let mut old: BTreeMap<String, String> = BTreeMap::new();
    old.insert("years".into(), "[2025,2026,2028]".into());
    old.insert("lastAllDayNotifyDate".into(), r#""2026-09-20""#.into());
    old.insert("weekNumbers".into(), r#"{"2026-09-14":"17","2026-09-21":"18"}"#.into());
    old.insert("settings".into(), r#"{"dayStart":360,"dayEnd":1440,"cellMin":30,"zoom":1,"theme":"calm","notificationsEnabled":false,"notifyLeadMin":10}"#.into());

    let mut conn = open_in_memory().unwrap();
    migrate_from_old_json(&mut conn, &old).unwrap();

    assert_eq!(list_created_years(&conn).unwrap(), vec![2025, 2026, 2028]);
    assert_eq!(get_settings(&conn).unwrap().last_all_day_notify_date, Some("2026-09-20".to_string()));

    let mut labels = get_week_labels(&conn, "2026-01-01", "2026-12-31").unwrap();
    labels.sort();
    assert_eq!(labels, vec![("2026-09-14".to_string(),"17".to_string()), ("2026-09-21".to_string(),"18".to_string())]);
}
