use planner_storage::*;

fn intervals_of(conn: &rusqlite::Connection, date: &str) -> Vec<(i64, i64, String, String)> {
    get_day_intervals(conn, date)
        .unwrap()
        .into_iter()
        .map(|r| (r.start_min, r.end_min, r.text, r.color))
        .collect()
}

#[test]
fn schema_applies_cleanly() {
    let conn = open_in_memory().expect("схема должна применяться без ошибок");
    let count: i64 = conn
        .query_row("SELECT count(*) FROM categories", [], |r| r.get(0))
        .unwrap();
    assert_eq!(count, 0);
}

#[test]
fn basic_set_and_read() {
    let mut conn = open_in_memory().unwrap();
    let patch = IntervalPatch::new().text("Тренировка").color("#2E7D74");
    set_interval(&mut conn, "2026-09-14", 540, 630, &patch).unwrap();

    let got = intervals_of(&conn, "2026-09-14");
    assert_eq!(got, vec![(540, 630, "Тренировка".to_string(), "#2E7D74".to_string())]);
}

#[test]
fn partial_patch_keeps_other_fields_like_old_setCellText() {
    // Воспроизводит поведение старого setCellText(): { ...existing, text } -
    // патч только с text не должен стирать уже стоящий color.
    let mut conn = open_in_memory().unwrap();
    set_interval(&mut conn, "2026-09-14", 540, 630, &IntervalPatch::new().color("#B8834A")).unwrap();
    set_interval(&mut conn, "2026-09-14", 540, 630, &IntervalPatch::new().text("Дедлайн")).unwrap();

    let got = get_day_intervals(&conn, "2026-09-14").unwrap();
    assert_eq!(got.len(), 1);
    assert_eq!(got[0].text, "Дедлайн");
    assert_eq!(got[0].color, "#B8834A", "цвет не должен был затереться патчем без поля color");
}

#[test]
fn explicit_null_clears_field() {
    // .set(category=none) должен явно обнулить catId, не тронув остальное.
    let mut conn = open_in_memory().unwrap();
    conn.execute("INSERT INTO categories (id,name,color,sort_order) VALUES ('c1','Спорт','#2E7D74',0)", []).unwrap();
    set_interval(&mut conn, "2026-09-14", 540, 630, &IntervalPatch::new().text("X").cat_id(Some("c1"))).unwrap();
    set_interval(&mut conn, "2026-09-14", 540, 630, &IntervalPatch::new().cat_id(None::<String>)).unwrap();

    let got = get_day_intervals(&conn, "2026-09-14").unwrap();
    assert_eq!(got[0].cat_id, None, "catId должен явно обнулиться");
    assert_eq!(got[0].text, "X", "text не должен был тронуться");
}

#[test]
fn overlap_splits_old_interval_into_surviving_edges() {
    // Старый 9:00-11:00, пишем новый 9:30-10:00 поверх - должно остаться
    // три ряда: 9:00-9:30 (старое), 9:30-10:00 (новое), 10:00-11:00 (старое).
    let mut conn = open_in_memory().unwrap();
    set_interval(&mut conn, "2026-09-14", 540, 660, &IntervalPatch::new().text("Старое").color("#3B5AA6")).unwrap();
    set_interval(&mut conn, "2026-09-14", 570, 600, &IntervalPatch::new().text("Новое").color("#A63B45")).unwrap();

    let mut got = intervals_of(&conn, "2026-09-14");
    got.sort_by_key(|r| r.0);
    assert_eq!(
        got,
        vec![
            (540, 570, "Старое".to_string(), "#3B5AA6".to_string()),
            (570, 600, "Новое".to_string(), "#A63B45".to_string()),
            (600, 660, "Старое".to_string(), "#3B5AA6".to_string()),
        ]
    );
}

#[test]
fn fully_covered_old_interval_disappears() {
    let mut conn = open_in_memory().unwrap();
    set_interval(&mut conn, "2026-09-14", 570, 600, &IntervalPatch::new().text("Маленькое")).unwrap();
    set_interval(&mut conn, "2026-09-14", 540, 660, &IntervalPatch::new().text("Большое")).unwrap();

    let got = intervals_of(&conn, "2026-09-14");
    assert_eq!(got, vec![(540, 660, "Большое".to_string(), String::new())]);
}

#[test]
fn adjacent_identical_content_merges_like_compactCells() {
    let mut conn = open_in_memory().unwrap();
    let patch = IntervalPatch::new().text("Блок").color("#2E7D74");
    set_interval(&mut conn, "2026-09-14", 540, 570, &patch).unwrap();
    set_interval(&mut conn, "2026-09-14", 570, 600, &patch).unwrap();

    let got = intervals_of(&conn, "2026-09-14");
    assert_eq!(got, vec![(540, 600, "Блок".to_string(), "#2E7D74".to_string())],
        "два соседних ряда с одинаковым содержимым должны были слиться в один");
}

#[test]
fn adjacent_different_content_does_not_merge() {
    let mut conn = open_in_memory().unwrap();
    set_interval(&mut conn, "2026-09-14", 540, 570, &IntervalPatch::new().text("A")).unwrap();
    set_interval(&mut conn, "2026-09-14", 570, 600, &IntervalPatch::new().text("B")).unwrap();

    let got = intervals_of(&conn, "2026-09-14");
    assert_eq!(got.len(), 2, "разное содержимое сливаться не должно");
}

#[test]
fn clear_interval_removes_without_reinserting() {
    let mut conn = open_in_memory().unwrap();
    set_interval(&mut conn, "2026-09-14", 540, 660, &IntervalPatch::new().text("X")).unwrap();
    clear_interval(&mut conn, "2026-09-14", 570, 600).unwrap();

    let mut got = intervals_of(&conn, "2026-09-14");
    got.sort_by_key(|r| r.0);
    assert_eq!(got, vec![
        (540, 570, "X".to_string(), String::new()),
        (600, 660, "X".to_string(), String::new()),
    ]);
}

#[test]
fn empty_patch_acts_as_clear_like_old_writeCellValue() {
    // В старой модели: если после патча текст/цвет/задача/done/moved пусты -
    // это эквивалент delete ключа, ряд не должен появиться в БД вовсе.
    let mut conn = open_in_memory().unwrap();
    set_interval(&mut conn, "2026-09-14", 540, 570, &IntervalPatch::new().text("")).unwrap();
    let got = intervals_of(&conn, "2026-09-14");
    assert!(got.is_empty(), "пустой патч не должен создавать ряд в БД");
}

#[test]
fn find_filters_by_category_and_range() {
    let mut conn = open_in_memory().unwrap();
    conn.execute("INSERT INTO categories (id,name,color,sort_order) VALUES ('c1','Спорт','#2E7D74',0)", []).unwrap();
    conn.execute("INSERT INTO categories (id,name,color,sort_order) VALUES ('c2','Работа','#8A5C3E',0)", []).unwrap();
    set_interval(&mut conn, "2026-09-14", 540, 600, &IntervalPatch::new().text("Бег").cat_id(Some("c1"))).unwrap();
    set_interval(&mut conn, "2026-09-15", 540, 600, &IntervalPatch::new().text("Отчёт").cat_id(Some("c2"))).unwrap();
    set_interval(&mut conn, "2026-09-20", 540, 600, &IntervalPatch::new().text("Бег2").cat_id(Some("c1"))).unwrap();

    let f = FindFilter { date_from: "2026-09-01", date_to: "2026-09-16", cat_id: Some("c1"), sub_id: None, text_contains: None, done: None };
    let results = find(&conn, &f).unwrap();
    assert_eq!(results.len(), 1, "должна найтись только 'Бег' (категория c1, внутри диапазона)");
    assert_eq!(results[0].1.text, "Бег");
}

#[test]
fn stats_hours_sums_correctly() {
    let mut conn = open_in_memory().unwrap();
    conn.execute("INSERT INTO categories (id,name,color,sort_order) VALUES ('c1','Спорт','#2E7D74',0)", []).unwrap();
    set_interval(&mut conn, "2026-09-14", 540, 630, &IntervalPatch::new().text("A").cat_id(Some("c1"))).unwrap(); // 90 мин
    set_interval(&mut conn, "2026-09-15", 600, 660, &IntervalPatch::new().text("B").cat_id(Some("c1"))).unwrap(); // 60 мин

    let hours = stats_hours(&conn, "c1", "2026-09-01", "2026-09-30").unwrap();
    assert!((hours - 2.5).abs() < 1e-9, "90+60 минут = 2.5 часа, получили {hours}");
}

#[test]
fn free_slots_finds_gaps() {
    let mut conn = open_in_memory().unwrap();
    set_interval(&mut conn, "2026-09-14", 540, 600, &IntervalPatch::new().text("A")).unwrap();
    set_interval(&mut conn, "2026-09-14", 660, 720, &IntervalPatch::new().text("B")).unwrap();

    let gaps = free_slots(&conn, "2026-09-14", 360, 1440, None).unwrap();
    assert_eq!(gaps[0], (360, 540));
    assert_eq!(gaps[1], (600, 660));
    assert_eq!(gaps[2], (720, 1440));
}

#[test]
fn free_slots_respects_min_duration() {
    let mut conn = open_in_memory().unwrap();
    set_interval(&mut conn, "2026-09-14", 540, 595, &IntervalPatch::new().text("A")).unwrap(); // оставляет дырку 595-600 в 5 минут
    set_interval(&mut conn, "2026-09-14", 600, 630, &IntervalPatch::new().text("B")).unwrap();

    let gaps = free_slots(&conn, "2026-09-14", 540, 630, Some(30)).unwrap();
    assert!(gaps.iter().all(|(a, b)| b - a >= 30), "короткие дырки (5 мин) должны быть отфильтрованы");
}

#[test]
fn full_migration_from_synthetic_old_data() {
    use std::collections::BTreeMap;
    let mut old: BTreeMap<String, String> = BTreeMap::new();
    old.insert("categories".into(), r##"[{"id":"c1","name":"Спорт","color":"#2E7D74","subs":[{"id":"s1","name":"Бег"}]}]"##.into());
    old.insert("todos".into(), r##"[{"id":"t1","text":"Купить подарок","done":false,"createdAt":1000}]"##.into());
    old.insert("settings".into(), r##"{"dayStart":360,"dayEnd":1440,"cellMin":30,"zoom":1,"theme":"calm","notificationsEnabled":false,"notifyLeadMin":10}"##.into());
    // неделя с понедельника 2026-09-14, день 0 (понедельник) - один прогон 9:00-10:30
    old.insert(
        "week:2026-09-14".into(),
        r##"{"cells":{"0":[[540,630,{"text":"Бег","color":"#2E7D74","task":"","catId":"c1","subId":"s1","done":true,"moved":false}]]}}"##.into(),
    );

    let mut conn = open_in_memory().unwrap();
    let report = migrate_from_old_json(&mut conn, &old).unwrap();

    assert_eq!(report.categories_migrated, 1);
    assert_eq!(report.todos_migrated, 1);
    assert_eq!(report.weeks_migrated, 1);
    assert_eq!(report.intervals_inserted, 1);

    let cat_name: String = conn.query_row("SELECT name FROM categories WHERE id='c1'", [], |r| r.get(0)).unwrap();
    assert_eq!(cat_name, "Спорт");

    let sub_name: String = conn.query_row("SELECT name FROM subcategories WHERE id='s1'", [], |r| r.get(0)).unwrap();
    assert_eq!(sub_name, "Бег");

    // день 0 от понедельника 2026-09-14 - это сам понедельник 2026-09-14
    let got = get_day_intervals(&conn, "2026-09-14").unwrap();
    assert_eq!(got.len(), 1);
    assert_eq!(got[0].text, "Бег");
    assert_eq!(got[0].cat_id, Some("c1".to_string()));
    assert!(got[0].done);

    let todo_text: String = conn.query_row("SELECT text FROM todos WHERE id='t1'", [], |r| r.get(0)).unwrap();
    assert_eq!(todo_text, "Купить подарок");
}

#[test]
fn migration_day_index_maps_to_correct_absolute_date() {
    // day_idx=2 (среда) от понедельника-якоря 2026-09-14 должен дать 2026-09-16.
    use std::collections::BTreeMap;
    let mut old: BTreeMap<String, String> = BTreeMap::new();
    old.insert(
        "week:2026-09-14".into(),
        r##"{"cells":{"2":[[600,660,{"text":"Среда","color":"","task":"","catId":null,"subId":null,"done":false,"moved":false}]]}}"##.into(),
    );
    let mut conn = open_in_memory().unwrap();
    migrate_from_old_json(&mut conn, &old).unwrap();

    let got = get_day_intervals(&conn, "2026-09-16").unwrap();
    assert_eq!(got.len(), 1);
    assert_eq!(got[0].text, "Среда");

    let wrong_day = get_day_intervals(&conn, "2026-09-14").unwrap();
    assert!(wrong_day.is_empty(), "в понедельник ничего не должно было попасть");
}
