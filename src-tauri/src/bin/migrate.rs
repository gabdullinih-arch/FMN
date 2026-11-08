use std::collections::BTreeMap;
use std::env;
use std::fs;

fn main() -> anyhow::Result<()> {
    let args: Vec<String> = env::args().collect();
    if args.len() != 3 {
        eprintln!("Использование: migrate <старый data.json> <новый planner.sqlite>");
        std::process::exit(1);
    }
    let old_path = &args[1];
    let new_path = &args[2];

    let raw = fs::read_to_string(old_path)?;
    let old_data: BTreeMap<String, String> = serde_json::from_str(&raw)?;

    if std::path::Path::new(new_path).exists() {
        fs::remove_file(new_path)?;
    }
    let mut conn = planner_storage::open_and_init(new_path)?;
    let report = planner_storage::migrate_from_old_json(&mut conn, &old_data)?;

    println!("Миграция завершена:");
    println!("  недель обработано:      {}", report.weeks_migrated);
    println!("  интервалов вставлено:   {}", report.intervals_inserted);
    println!("  категорий перенесено:   {}", report.categories_migrated);
    println!("  дел без времени:        {}", report.todos_migrated);
    Ok(())
}
