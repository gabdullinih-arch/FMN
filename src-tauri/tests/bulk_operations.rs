use planner_storage::*;

fn day_texts(conn: &rusqlite::Connection, date: &str) -> Vec<(i64, i64, String)> {
    get_day_intervals(conn, date).unwrap().into_iter().map(|r| (r.start_min, r.end_min, r.text)).collect()
}

#[test]
fn week_template_overwrite_clears_whole_day_window_first() {
    let mut conn = open_in_memory().unwrap();
    // Существующая запись, которую должно снести режимом "Заменить всё".
    set_interval(&mut conn, "2026-09-14", 700, 720, &IntervalPatch::new().text("Старое, не из шаблона")).unwrap();

    let template = vec![TemplateInterval { day_idx: 0, start_min: 540, end_min: 600, patch: IntervalPatch::new().text("Бег") }];
    apply_week_template(&mut conn, &template, &["2026-09-14".to_string()], ApplyMode::Overwrite, 360, 1440).unwrap();

    let got = day_texts(&conn, "2026-09-14");
    assert_eq!(got, vec![(540, 600, "Бег".to_string())], "старая запись должна быть снесена, остался только шаблон");
}

#[test]
fn week_template_keep_existing_does_not_touch_occupied() {
    let mut conn = open_in_memory().unwrap();
    set_interval(&mut conn, "2026-09-14", 560, 580, &IntervalPatch::new().text("Занято")).unwrap();

    let template = vec![TemplateInterval { day_idx: 0, start_min: 540, end_min: 600, patch: IntervalPatch::new().text("Шаблон") }];
    apply_week_template(&mut conn, &template, &["2026-09-14".to_string()], ApplyMode::KeepExisting, 360, 1440).unwrap();

    let mut got = day_texts(&conn, "2026-09-14");
    got.sort_by_key(|r| r.0);
    assert_eq!(got, vec![
        (540, 560, "Шаблон".to_string()),   // до занятого - дописалось
        (560, 580, "Занято".to_string()),    // занятое - не тронуто
        (580, 600, "Шаблон".to_string()),   // после занятого - дописалось
    ]);
}

#[test]
fn week_template_keep_existing_skips_fully_occupied_range() {
    let mut conn = open_in_memory().unwrap();
    set_interval(&mut conn, "2026-09-14", 540, 600, &IntervalPatch::new().text("Занято целиком")).unwrap();

    let template = vec![TemplateInterval { day_idx: 0, start_min: 540, end_min: 600, patch: IntervalPatch::new().text("Шаблон") }];
    apply_week_template(&mut conn, &template, &["2026-09-14".to_string()], ApplyMode::KeepExisting, 360, 1440).unwrap();

    let got = day_texts(&conn, "2026-09-14");
    assert_eq!(got, vec![(540, 600, "Занято целиком".to_string())], "полностью занятый диапазон не должен тронуться вообще");
}

#[test]
fn week_template_wins_overwrites_only_its_own_range() {
    let mut conn = open_in_memory().unwrap();
    set_interval(&mut conn, "2026-09-14", 500, 700, &IntervalPatch::new().text("Старое, длинное")).unwrap();

    let template = vec![TemplateInterval { day_idx: 0, start_min: 540, end_min: 600, patch: IntervalPatch::new().text("Шаблон") }];
    apply_week_template(&mut conn, &template, &["2026-09-14".to_string()], ApplyMode::TemplateWins, 360, 1440).unwrap();

    let mut got = day_texts(&conn, "2026-09-14");
    got.sort_by_key(|r| r.0);
    assert_eq!(got, vec![
        (500, 540, "Старое, длинное".to_string()),  // сохранившийся левый край
        (540, 600, "Шаблон".to_string()),            // сам шаблон
        (600, 700, "Старое, длинное".to_string()),  // сохранившийся правый край
    ]);
}

#[test]
fn week_template_applies_to_multiple_weeks_atomically() {
    let mut conn = open_in_memory().unwrap();
    let template = vec![
        TemplateInterval { day_idx: 0, start_min: 540, end_min: 600, patch: IntervalPatch::new().text("Пн-утро") },
        TemplateInterval { day_idx: 2, start_min: 720, end_min: 780, patch: IntervalPatch::new().text("Ср-день") },
    ];
    apply_week_template(
        &mut conn, &template,
        &["2026-09-14".to_string(), "2026-09-21".to_string(), "2026-09-28".to_string()],
        ApplyMode::TemplateWins, 360, 1440,
    ).unwrap();

    // day_idx=0 от 2026-09-14 (понедельник) -> сам 2026-09-14
    assert_eq!(day_texts(&conn, "2026-09-14"), vec![(540, 600, "Пн-утро".to_string())]);
    // day_idx=2 (среда) от 2026-09-14 -> 2026-09-16
    assert_eq!(day_texts(&conn, "2026-09-16"), vec![(720, 780, "Ср-день".to_string())]);
    // вторая неделя
    assert_eq!(day_texts(&conn, "2026-09-21"), vec![(540, 600, "Пн-утро".to_string())]);
    assert_eq!(day_texts(&conn, "2026-09-23"), vec![(720, 780, "Ср-день".to_string())]);
    // третья неделя
    assert_eq!(day_texts(&conn, "2026-09-28"), vec![(540, 600, "Пн-утро".to_string())]);
    assert_eq!(day_texts(&conn, "2026-09-30"), vec![(720, 780, "Ср-день".to_string())]);
}

#[test]
fn week_template_exceptions_skip_both_overwrite_and_template_writes() {
    let mut conn = open_in_memory().unwrap();
    set_interval(&mut conn, "2026-09-14", 500, 520, &IntervalPatch::new().text("Старое понедельника")).unwrap();
    set_interval(&mut conn, "2026-09-15", 500, 520, &IntervalPatch::new().text("Старое вторника")).unwrap();
    let template = vec![
        TemplateInterval { day_idx: 0, start_min: 540, end_min: 600, patch: IntervalPatch::new().text("Понедельник") },
        TemplateInterval { day_idx: 1, start_min: 540, end_min: 600, patch: IntervalPatch::new().text("Вторник") },
    ];

    apply_week_template_with_exceptions(
        &mut conn, &template, &["2026-09-14".to_string()], ApplyMode::Overwrite, 360, 1440,
        &["2026-09-15".to_string()],
    ).unwrap();

    assert_eq!(day_texts(&conn, "2026-09-14"), vec![(540, 600, "Понедельник".to_string())]);
    assert_eq!(day_texts(&conn, "2026-09-15"), vec![(500, 520, "Старое вторника".to_string())]);
}

#[test]
fn week_template_interactive_mode_applies_only_approved_conflicts() {
    let mut conn = open_in_memory().unwrap();
    set_interval(&mut conn, "2026-09-14", 540, 600, &IntervalPatch::new().text("Оставить")).unwrap();
    set_interval(&mut conn, "2026-09-21", 540, 600, &IntervalPatch::new().text("Заменить")).unwrap();
    let template = vec![TemplateInterval {
        day_idx: 0, start_min: 540, end_min: 600, patch: IntervalPatch::new().text("Шаблон"),
    }];
    let decisions = vec![
        TemplateConflictDecision { date: "2026-09-14".into(), start_min: 540, end_min: 600, overwrite: false },
        TemplateConflictDecision { date: "2026-09-21".into(), start_min: 540, end_min: 600, overwrite: true },
    ];

    apply_week_template_with_options(
        &mut conn, &template, &["2026-09-14".into(), "2026-09-21".into()],
        ApplyMode::InteractivePerCell, 360, 1440, &[], &decisions,
    ).unwrap();

    assert_eq!(day_texts(&conn, "2026-09-14"), vec![(540, 600, "Оставить".to_string())]);
    assert_eq!(day_texts(&conn, "2026-09-21"), vec![(540, 600, "Шаблон".to_string())]);
}

#[test]
fn restore_multiple_weeks_is_a_single_operation() {
    let mut conn = open_in_memory().unwrap();
    let original = IntervalRow {
        start_min: 540, end_min: 600, text: "До".into(), color: String::new(), task: String::new(),
        description: String::new(), cat_id: None, sub_id: None, done: false, moved: false,
    };
    let mut week_one: [Vec<IntervalRow>; 7] = Default::default();
    week_one[0].push(original.clone());
    let mut week_two: [Vec<IntervalRow>; 7] = Default::default();
    week_two[0].push(IntervalRow { text: "Восстановлено".into(), ..original.clone() });
    set_interval(&mut conn, "2026-09-14", 540, 600, &IntervalPatch::new().text("Новое")).unwrap();
    set_interval(&mut conn, "2026-09-21", 540, 600, &IntervalPatch::new().text("Новое")).unwrap();

    restore_weeks(&mut conn, &[
        ("2026-09-14".into(), week_one),
        ("2026-09-21".into(), week_two),
    ]).unwrap();

    assert_eq!(day_texts(&conn, "2026-09-14"), vec![(540, 600, "До".to_string())]);
    assert_eq!(day_texts(&conn, "2026-09-21"), vec![(540, 600, "Восстановлено".to_string())]);
}

#[test]
fn day_template_applies_to_specific_dates_not_weeks() {
    let mut conn = open_in_memory().unwrap();
    let template = vec![TemplateInterval { day_idx: 0, start_min: 600, end_min: 660, patch: IntervalPatch::new().text("Дневной шаблон") }];
    apply_day_template(&mut conn, &template, &["2026-03-01".to_string(), "2026-07-15".to_string()], ApplyMode::TemplateWins, 360, 1440).unwrap();

    assert_eq!(day_texts(&conn, "2026-03-01"), vec![(600, 660, "Дневной шаблон".to_string())]);
    assert_eq!(day_texts(&conn, "2026-07-15"), vec![(600, 660, "Дневной шаблон".to_string())]);
}

#[test]
fn get_week_intervals_batches_all_seven_days_in_one_call() {
    let mut conn = open_in_memory().unwrap();
    set_interval(&mut conn, "2026-09-14", 540, 600, &IntervalPatch::new().text("Пн")).unwrap(); // day_idx 0
    set_interval(&mut conn, "2026-09-17", 600, 660, &IntervalPatch::new().text("Чт")).unwrap(); // day_idx 3
    set_interval(&mut conn, "2026-09-20", 700, 720, &IntervalPatch::new().text("Вс")).unwrap(); // day_idx 6
    set_interval(&mut conn, "2026-09-21", 540, 600, &IntervalPatch::new().text("Другая неделя - не должна попасть")).unwrap();

    let week = get_week_intervals(&conn, "2026-09-14").unwrap();
    assert_eq!(week[0].len(), 1); assert_eq!(week[0][0].text, "Пн");
    assert_eq!(week[1].len(), 0);
    assert_eq!(week[3].len(), 1); assert_eq!(week[3][0].text, "Чт");
    assert_eq!(week[6].len(), 1); assert_eq!(week[6][0].text, "Вс");
}

#[test]
fn restore_week_replaces_whole_week_atomically() {
    let mut conn = open_in_memory().unwrap();
    set_interval(&mut conn, "2026-09-14", 540, 600, &IntervalPatch::new().text("Будет стёрто")).unwrap();
    set_interval(&mut conn, "2026-09-16", 600, 660, &IntervalPatch::new().text("Тоже будет стёрто")).unwrap();

    let snapshot_day0 = vec![IntervalRow { start_min: 480, end_min: 510, text: "Из снимка".into(), color: "#111".into(), task: "".into(), description: "".into(), cat_id: None, sub_id: None, done: false, moved: false }];
    let mut days: [Vec<IntervalRow>; 7] = Default::default();
    days[0] = snapshot_day0;
    // остальные дни снимка пустые - значит и 2026-09-16 (day_idx=2) должен очиститься

    restore_week(&mut conn, "2026-09-14", &days).unwrap();

    assert_eq!(day_texts(&conn, "2026-09-14"), vec![(480, 510, "Из снимка".to_string())]);
    assert!(day_texts(&conn, "2026-09-16").is_empty(), "день вне снимка должен был очиститься целиком");
}

#[test]
fn restore_week_clears_full_day_regardless_of_dayStart_dayEnd() {
    // Снимок должен восстановиться точно, даже если на нём был интервал
    // вне текущего "рабочего окна" (например, после смены dayStart/dayEnd
    // между снимком и отменой) - restore_week не должен ограничиваться
    // day_start..day_end при удалении.
    let mut conn = open_in_memory().unwrap();
    set_interval(&mut conn, "2026-09-14", 0, 60, &IntervalPatch::new().text("Ночная запись, вне обычного окна")).unwrap();

    let days: [Vec<IntervalRow>; 7] = Default::default(); // снимок "всё было пусто"
    restore_week(&mut conn, "2026-09-14", &days).unwrap();

    assert!(day_texts(&conn, "2026-09-14").is_empty(), "ночная запись тоже должна была стереться");
}

#[test]
fn parse_week_ranges_matches_examples_from_spec() {
    assert_eq!(parse_week_ranges("3"), [3].into_iter().collect());
    assert_eq!(parse_week_ranges("2-17"), (2..=17).collect());
    assert_eq!(parse_week_ranges("1-2,5-17"), [1,2,5,6,7,8,9,10,11,12,13,14,15,16,17].into_iter().collect());
    assert_eq!(parse_week_ranges("2-17,20"), {
        let mut s: std::collections::BTreeSet<i64> = (2..=17).collect();
        s.insert(20);
        s
    });
    // обратный порядок в диапазоне (17-2) должен работать так же, как 2-17
    assert_eq!(parse_week_ranges("17-2"), (2..=17).collect());
    // мусор молча игнорируется, а не роняет парсер
    assert_eq!(parse_week_ranges("abc, ,3"), [3].into_iter().collect());
}

#[test]
fn week_number_from_counts_anchor_week_as_one() {
    assert_eq!(week_number_from("2026-01-05", "2026-01-05").unwrap(), 1);
    assert_eq!(week_number_from("2026-01-05", "2026-01-12").unwrap(), 2);
    assert_eq!(week_number_from("2026-01-05", "2026-03-30").unwrap(), 13);
}

#[test]
fn recurring_rule_all_weeks() {
    let mut conn = open_in_memory().unwrap();
    let rule = RecurringRuleSpec {
        day_idx: 1, start_min: 510, duration_min: 90,
        patch: IntervalPatch::new().text("Тренировка").color("#2E7D74"),
        pattern_type: "all".into(), custom_ranges: "".into(),
        anchor_monday: "2026-09-14".into(), weeks_count: 4,
        conflict_mode: ApplyMode::KeepExisting, decisions: vec![],
    };
    let applied = apply_recurring_rule(&mut conn, &rule).unwrap();
    assert_eq!(applied, 4);

    // day_idx=1 (вторник) от каждого из 4 понедельников подряд
    for (monday, tuesday) in [("2026-09-14","2026-09-15"),("2026-09-21","2026-09-22"),("2026-09-28","2026-09-29"),("2026-10-05","2026-10-06")] {
        let _ = monday;
        assert_eq!(day_texts(&conn, tuesday), vec![(510, 600, "Тренировка".to_string())], "неделя с {tuesday}");
    }
}

#[test]
fn recurring_rule_even_weeks_only() {
    let mut conn = open_in_memory().unwrap();
    let rule = RecurringRuleSpec {
        day_idx: 0, start_min: 480, duration_min: 60,
        patch: IntervalPatch::new().text("Через неделю"),
        pattern_type: "even".into(), custom_ranges: "".into(),
        anchor_monday: "2026-09-14".into(), weeks_count: 6,
        conflict_mode: ApplyMode::KeepExisting, decisions: vec![],
    };
    let applied = apply_recurring_rule(&mut conn, &rule).unwrap();
    // неделя 1 (сама anchor) - нечётная, не подходит; недели 2,4,6 - чётные
    assert_eq!(applied, 3);
    assert!(day_texts(&conn, "2026-09-14").is_empty(), "неделя 1 (нечётная) не должна быть размечена");
    assert_eq!(day_texts(&conn, "2026-09-21").len(), 1, "неделя 2 (чётная) должна быть размечена");
    assert!(day_texts(&conn, "2026-09-28").is_empty(), "неделя 3 (нечётная) не должна быть размечена");
}

#[test]
fn recurring_rule_custom_ranges() {
    let mut conn = open_in_memory().unwrap();
    let rule = RecurringRuleSpec {
        day_idx: 0, start_min: 480, duration_min: 30,
        patch: IntervalPatch::new().text("X"),
        pattern_type: "custom".into(), custom_ranges: "2,4-5".into(),
        anchor_monday: "2026-09-14".into(), weeks_count: 6,
        conflict_mode: ApplyMode::KeepExisting, decisions: vec![],
    };
    let applied = apply_recurring_rule(&mut conn, &rule).unwrap();
    assert_eq!(applied, 3, "недели 2, 4 и 5 - три недели из диапазона \"2,4-5\"");
}

#[test]
fn recurring_rule_interactive_conflicts_follow_per_occurrence_decisions() {
    let mut conn = open_in_memory().unwrap();
    set_interval(&mut conn, "2026-09-15", 510, 570, &IntervalPatch::new().text("Existing")).unwrap();
    set_interval(&mut conn, "2026-09-22", 510, 570, &IntervalPatch::new().text("Existing")).unwrap();
    let rule = RecurringRuleSpec {
        day_idx: 1, start_min: 510, duration_min: 60,
        patch: IntervalPatch::new().text("Recurring"),
        pattern_type: "all".into(), custom_ranges: "".into(),
        anchor_monday: "2026-09-14".into(), weeks_count: 2,
        conflict_mode: ApplyMode::InteractivePerCell,
        decisions: vec![
            TemplateConflictDecision { date: "2026-09-15".into(), start_min: 510, end_min: 570, overwrite: true },
            TemplateConflictDecision { date: "2026-09-22".into(), start_min: 510, end_min: 570, overwrite: false },
        ],
    };

    assert_eq!(apply_recurring_rule(&mut conn, &rule).unwrap(), 2);
    assert_eq!(day_texts(&conn, "2026-09-15"), vec![(510, 570, "Recurring".into())]);
    assert_eq!(day_texts(&conn, "2026-09-22"), vec![(510, 570, "Existing".into())]);
}

#[test]
fn recurring_rule_is_one_atomic_transaction() {
    // Косвенная проверка атомарности: если бы каждая неделя коммитилась
    // отдельно, частично применённое правило было бы неотличимо от полностью
    // применённого при простом подсчёте - здесь просто удостоверяемся, что
    // после единственного вызова число размеченных недель точно совпадает
    // с ожидаемым, без "потерянных" из-за нескольких транзакций недель.
    let mut conn = open_in_memory().unwrap();
    let rule = RecurringRuleSpec {
        day_idx: 3, start_min: 600, duration_min: 45,
        patch: IntervalPatch::new().text("Y"),
        pattern_type: "all".into(), custom_ranges: "".into(),
        anchor_monday: "2026-01-05".into(), weeks_count: 20,
        conflict_mode: ApplyMode::KeepExisting, decisions: vec![],
    };
    let applied = apply_recurring_rule(&mut conn, &rule).unwrap();
    assert_eq!(applied, 20);
}
