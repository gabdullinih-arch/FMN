use rusqlite::types::{Value as SqlValue, ValueRef};
use rusqlite::{Connection, OptionalExtension};
use serde_json::{json, Map, Number, Value};
use std::collections::BTreeMap;

const BACKUP_TABLES: &[&str] = &[
    "categories",
    "subcategories",
    "intervals",
    "all_day_events",
    "todos",
    "templates",
    "recurring_rules",
    "week_meta",
    "week_quantum",
    "week_day_bounds",
    "settings",
    "reflections",
    "created_years",
    "planscripts",
    "planscript_watchers",
    "watch_indicators",
    "watch_dependencies",
];

const DELETE_ORDER: &[&str] = &[
    "watch_indicators",
    "watch_dependencies",
    "planscript_watchers",
    "planscripts",
    "week_quantum",
    "week_day_bounds",
    "week_meta",
    "reflections",
    "created_years",
    "recurring_rules",
    "templates",
    "todos",
    "all_day_events",
    "intervals",
    "subcategories",
    "categories",
    "settings",
];

const INSERT_ORDER: &[&str] = &[
    "categories",
    "settings",
    "todos",
    "templates",
    "created_years",
    "reflections",
    "week_meta",
    "week_quantum",
    "week_day_bounds",
    "subcategories",
    "intervals",
    "all_day_events",
    "recurring_rules",
    "planscripts",
    "planscript_watchers",
    "watch_indicators",
    "watch_dependencies",
];

pub fn export_database_backup(conn: &Connection) -> rusqlite::Result<Value> {
    let schema_version: i32 =
        conn.pragma_query_value(None, "user_version", |row| row.get(0))?;
    let mut tables = Map::new();

    for table in BACKUP_TABLES {
        if !table_exists(conn, table)? {
            continue;
        }

        let mut statement = conn.prepare(&format!("SELECT * FROM \"{table}\""))?;
        let columns = statement
            .column_names()
            .iter()
            .map(|column| Value::String((*column).to_owned()))
            .collect::<Vec<_>>();
        let column_count = statement.column_count();
        let mut result_rows = Vec::new();
        let mut rows = statement.query([])?;
        while let Some(row) = rows.next()? {
            let mut values = Vec::with_capacity(column_count);
            for index in 0..column_count {
                values.push(sql_value_to_json(row.get_ref(index)?));
            }
            result_rows.push(Value::Array(values));
        }

        tables.insert(
            (*table).to_owned(),
            json!({ "columns": columns, "rows": result_rows }),
        );
    }

    let interval_sequence: Option<i64> = conn
        .query_row(
            "SELECT seq FROM sqlite_sequence WHERE name = 'intervals'",
            [],
            |row| row.get(0),
        )
        .optional()?;

    Ok(json!({
        "formatVersion": 1,
        "schemaVersion": schema_version,
        "tables": tables,
        "intervalSequence": interval_sequence,
    }))
}

pub fn import_database_backup(
    conn: &mut Connection,
    backup: &Value,
) -> rusqlite::Result<()> {
    if backup.get("formatVersion").is_none() {
        return import_legacy_backup(conn, backup);
    }

    if backup.get("formatVersion").and_then(Value::as_i64) != Some(1) {
        return Err(rusqlite::Error::InvalidParameterName(
            "Unsupported or missing backup formatVersion".to_owned(),
        ));
    }

    let backup_schema_version = backup
        .get("schemaVersion")
        .and_then(Value::as_i64)
        .ok_or_else(|| {
            rusqlite::Error::InvalidParameterName(
                "Backup is missing a valid schemaVersion".to_owned(),
            )
        })?;
    let current_schema_version: i32 =
        conn.pragma_query_value(None, "user_version", |row| row.get(0))?;
    if backup_schema_version > i64::from(current_schema_version) {
        return Err(rusqlite::Error::InvalidParameterName(
            "Backup was created by a newer database schema".to_owned(),
        ));
    }

    let backup_tables = backup
        .get("tables")
        .and_then(Value::as_object)
        .ok_or_else(|| {
            rusqlite::Error::InvalidParameterName("Backup is missing its tables object".to_owned())
        })?;
    for (name, value) in backup_tables {
        if !BACKUP_TABLES.contains(&name.as_str()) {
            return Err(rusqlite::Error::InvalidParameterName(format!(
                "Unsupported backup table: {name}"
            )));
        }
        if !value.get("columns").and_then(Value::as_array).is_some()
            || !value.get("rows").and_then(Value::as_array).is_some()
        {
            return Err(rusqlite::Error::InvalidParameterName(format!(
                "Invalid backup table data: {name}"
            )));
        }
    }
    let settings = backup_tables
        .get("settings")
        .and_then(|table| {
            let columns = table.get("columns")?.as_array()?;
            let rows = table.get("rows")?.as_array()?;
            let id_index = columns.iter().position(|column| column.as_str() == Some("id"))?;
            Some(rows.iter().any(|row| {
                row.as_array()
                    .and_then(|values| values.get(id_index))
                    .and_then(Value::as_i64)
                    == Some(1)
            }))
        })
        .unwrap_or(false);
    if !settings {
        return Err(rusqlite::Error::InvalidParameterName(
            "Backup must include the settings row with id=1".to_owned(),
        ));
    }

    let tx = conn.transaction()?;
    tx.execute_batch("PRAGMA defer_foreign_keys = ON;")?;

    for table in DELETE_ORDER {
        if table_exists(&tx, table)? {
            tx.execute(&format!("DELETE FROM \"{table}\""), [])?;
        }
    }

    for table in INSERT_ORDER {
        let Some(table_backup) = backup_tables.get(*table) else {
            continue;
        };
        if !table_exists(&tx, table)? {
            let rows = table_backup["rows"].as_array().expect("validated rows");
            if !rows.is_empty() {
                return Err(rusqlite::Error::InvalidParameterName(format!(
                    "Database does not support backup table: {table}"
                )));
            }
            continue;
        }

        let backup_columns = table_backup["columns"].as_array().expect("validated columns");
        let current_columns = table_columns(&tx, table)?;
        let columns = backup_columns
            .iter()
            .map(|column| {
                column.as_str().ok_or_else(|| {
                    rusqlite::Error::InvalidParameterName(format!(
                        "Invalid column name in backup table: {table}"
                    ))
                })
            })
            .collect::<rusqlite::Result<Vec<_>>>()?;

        for row in table_backup["rows"].as_array().expect("validated rows") {
            let values = row.as_array().ok_or_else(|| {
                rusqlite::Error::InvalidParameterName(format!(
                    "Invalid row in backup table: {table}"
                ))
            })?;
            if values.len() != columns.len() {
                return Err(rusqlite::Error::InvalidParameterName(format!(
                    "Column count mismatch in backup table: {table}"
                )));
            }

            let mut insert_columns = Vec::new();
            let mut insert_values = Vec::new();
            for (column, value) in columns.iter().zip(values) {
                if current_columns.iter().any(|current| current == column) {
                    insert_columns.push(*column);
                    insert_values.push(json_value_to_sql(value)?);
                }
            }
            if insert_columns.is_empty() {
                continue;
            }

            let quoted_columns = insert_columns
                .iter()
                .map(|column| format!("\"{column}\""))
                .collect::<Vec<_>>()
                .join(", ");
            let placeholders = (1..=insert_columns.len())
                .map(|index| format!("?{index}"))
                .collect::<Vec<_>>()
                .join(", ");
            tx.execute(
                &format!(
                    "INSERT INTO \"{table}\" ({quoted_columns}) VALUES ({placeholders})"
                ),
                rusqlite::params_from_iter(insert_values),
            )?;
        }
    }

    if table_exists(&tx, "intervals")? && table_exists(&tx, "intervals_fts")? {
        tx.execute(
            "INSERT INTO intervals_fts(intervals_fts) VALUES ('rebuild')",
            [],
        )?;
    }

    if table_exists(&tx, "intervals")? {
        tx.execute("DELETE FROM sqlite_sequence WHERE name = 'intervals'", [])?;
        if let Some(sequence) = backup.get("intervalSequence") {
            if !sequence.is_null() {
                let sequence = sequence.as_i64().ok_or_else(|| {
                    rusqlite::Error::InvalidParameterName(
                        "Invalid intervalSequence in backup".to_owned(),
                    )
                })?;
                tx.execute(
                    "INSERT INTO sqlite_sequence (name, seq) VALUES ('intervals', ?1)",
                    [sequence],
                )?;
            }
        }
    }

    tx.commit()
}

fn import_legacy_backup(conn: &mut Connection, backup: &Value) -> rusqlite::Result<()> {
    let object = backup.as_object().ok_or_else(|| {
        rusqlite::Error::InvalidParameterName("Legacy backup must be a JSON object".to_owned())
    })?;
    if !["settings", "categories", "templates", "weeks"]
        .iter()
        .any(|key| object.contains_key(*key))
    {
        return Err(rusqlite::Error::InvalidParameterName(
            "Unrecognized legacy backup format".to_owned(),
        ));
    }
    if object
        .get("settings")
        .is_some_and(|value| !value.is_object())
        || object
            .get("categories")
            .is_some_and(|value| !value.is_array())
        || object
            .get("templates")
            .is_some_and(|value| !value.is_array())
        || object
            .get("weeks")
            .is_some_and(|value| !value.is_object())
    {
        return Err(rusqlite::Error::InvalidParameterName(
            "Invalid legacy backup structure".to_owned(),
        ));
    }
    let mut legacy_data = BTreeMap::new();

    for key in ["settings", "categories", "templates"] {
        if let Some(value) = object.get(key) {
            legacy_data.insert(key.to_owned(), legacy_json_value(value)?);
        }
    }

    if let Some(year) = object.get("year").and_then(Value::as_i64) {
        legacy_data.insert("years".to_owned(), json!([year]).to_string());
    }
    if let Some(weeks) = object.get("weeks").and_then(Value::as_object) {
        for (monday, cells) in weeks {
            legacy_data.insert(
                format!("week:{monday}"),
                legacy_json_value(&json!({ "cells": cells }))?,
            );
        }
    }

    let mut migrated = crate::open_in_memory()?;
    crate::migrate_from_old_json(&mut migrated, &legacy_data)
        .map_err(|error| rusqlite::Error::InvalidParameterName(error.to_string()))?;
    let converted = export_database_backup(&migrated)?;
    import_database_backup(conn, &converted)
}

fn legacy_json_value(value: &Value) -> rusqlite::Result<String> {
    if let Some(raw) = value.as_str() {
        return Ok(raw.to_owned());
    }
    serde_json::to_string(value)
        .map_err(|error| rusqlite::Error::InvalidParameterName(error.to_string()))
}

pub fn export_all_reflections_markdown(
    conn: &Connection,
    language: &str,
) -> rusqlite::Result<String> {
    let title = if language == "en" {
        "Daily reflections"
    } else {
        "Рефлексии"
    };
    let mut statement =
        conn.prepare("SELECT date, text FROM reflections ORDER BY date")?;
    let rows = statement.query_map([], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
    })?;
    let mut markdown = format!("# {title}\n\n");
    for row in rows {
        let (date, text) = row?;
        markdown.push_str(&format!("## {date}\n\n{text}\n\n"));
    }
    Ok(markdown)
}

fn table_exists(conn: &Connection, table: &str) -> rusqlite::Result<bool> {
    conn.query_row(
        "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?1)",
        [table],
        |row| row.get(0),
    )
}

fn table_columns(conn: &Connection, table: &str) -> rusqlite::Result<Vec<String>> {
    let mut statement = conn.prepare(&format!("PRAGMA table_info(\"{table}\")"))?;
    let rows = statement.query_map([], |row| row.get(1))?;
    rows.collect()
}

fn sql_value_to_json(value: ValueRef<'_>) -> Value {
    match value {
        ValueRef::Null => Value::Null,
        ValueRef::Integer(value) => Value::Number(value.into()),
        ValueRef::Real(value) => Number::from_f64(value)
            .map(Value::Number)
            .unwrap_or(Value::Null),
        ValueRef::Text(value) => {
            Value::String(String::from_utf8_lossy(value).into_owned())
        }
        ValueRef::Blob(value) => Value::Array(
            value
                .iter()
                .map(|byte| Value::Number((*byte).into()))
                .collect(),
        ),
    }
}

fn json_value_to_sql(value: &Value) -> rusqlite::Result<SqlValue> {
    match value {
        Value::Null => Ok(SqlValue::Null),
        Value::Bool(value) => Ok(SqlValue::Integer(i64::from(*value))),
        Value::Number(value) => {
            if let Some(value) = value.as_i64() {
                Ok(SqlValue::Integer(value))
            } else if let Some(value) = value.as_f64() {
                Ok(SqlValue::Real(value))
            } else {
                Err(rusqlite::Error::InvalidParameterName(
                    "Unsupported numeric value in backup".to_owned(),
                ))
            }
        }
        Value::String(value) => Ok(SqlValue::Text(value.clone())),
        Value::Array(values) => values
            .iter()
            .map(|value| {
                value
                    .as_u64()
                    .filter(|value| *value <= u8::MAX as u64)
                    .map(|value| value as u8)
                    .ok_or_else(|| {
                        rusqlite::Error::InvalidParameterName(
                            "Invalid blob value in backup".to_owned(),
                        )
                    })
            })
            .collect::<rusqlite::Result<Vec<_>>>()
            .map(SqlValue::Blob),
        Value::Object(_) => Err(rusqlite::Error::InvalidParameterName(
            "Unsupported object value in backup".to_owned(),
        )),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::open_in_memory;

    #[test]
    fn backup_round_trip_preserves_rows_and_interval_sequence() -> rusqlite::Result<()> {
        let mut conn = open_in_memory()?;
        conn.execute(
            "INSERT INTO categories (id, name, color, sort_order) VALUES ('cat', 'Backup', '#123456', 4)",
            [],
        )?;
        conn.execute(
            "INSERT INTO intervals (id, date, start_min, end_min, text, color, task, description, cat_id, done, moved)
             VALUES (42, '2026-10-28', 600, 630, 'backup-token', '', 'task', 'details', 'cat', 1, 0)",
            [],
        )?;
        conn.execute(
            "UPDATE settings SET day_start = 420, theme = 'dark' WHERE id = 1",
            [],
        )?;
        conn.execute(
            "INSERT INTO week_day_bounds (monday_date, day_start, day_end) VALUES ('2026-10-26', 480, 1200)",
            [],
        )?;

        let backup = export_database_backup(&conn)?;
        conn.execute("DELETE FROM intervals", [])?;
        conn.execute("DELETE FROM categories", [])?;
        conn.execute("UPDATE settings SET day_start = 360, theme = 'calm' WHERE id = 1", [])?;
        import_database_backup(&mut conn, &backup)?;

        let category: String =
            conn.query_row("SELECT name FROM categories WHERE id = 'cat'", [], |row| row.get(0))?;
        let (start, text): (i64, String) = conn.query_row(
            "SELECT start_min, text FROM intervals WHERE id = 42",
            [],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )?;
        let settings = crate::get_settings(&conn)?;
        let week_bounds = crate::get_week_day_bounds(&conn, "2026-10-26")?;
        let fts_count: i64 = conn.query_row(
            "SELECT COUNT(*) FROM intervals_fts WHERE intervals_fts MATCH 'backup'",
            [],
            |row| row.get(0),
        )?;

        assert_eq!(category, "Backup");
        assert_eq!(start, 600);
        assert_eq!(text, "backup-token");
        assert_eq!(settings.day_start, 420);
        assert_eq!(settings.theme, "dark");
        assert_eq!(week_bounds, Some(crate::WeekDayBounds { day_start: Some(480), day_end: Some(1200) }));
        assert_eq!(fts_count, 1);
        conn.execute(
            "INSERT INTO intervals (date, start_min, end_min) VALUES ('2026-10-29', 600, 630)",
            [],
        )?;
        let next_interval_id: i64 = conn.query_row(
            "SELECT id FROM intervals WHERE date = '2026-10-29'",
            [],
            |row| row.get(0),
        )?;
        assert_eq!(next_interval_id, 43);
        Ok(())
    }

    #[test]
    fn invalid_backup_does_not_change_existing_data() -> rusqlite::Result<()> {
        let mut conn = open_in_memory()?;
        conn.execute(
            "INSERT INTO categories (id, name, color) VALUES ('keep', 'Keep', '#123456')",
            [],
        )?;
        let invalid = json!({
            "formatVersion": 1,
            "schemaVersion": 999,
            "tables": {},
        });

        assert!(import_database_backup(&mut conn, &invalid).is_err());
        let name: String =
            conn.query_row("SELECT name FROM categories WHERE id = 'keep'", [], |row| row.get(0))?;
        assert_eq!(name, "Keep");
        Ok(())
    }

    #[test]
    fn failed_restore_rolls_back_partial_deletes_and_inserts() -> rusqlite::Result<()> {
        let mut conn = open_in_memory()?;
        conn.execute(
            "INSERT INTO categories (id, name, color) VALUES ('keep', 'Keep', '#123456')",
            [],
        )?;
        let mut backup = export_database_backup(&conn)?;
        let category_table = backup
            .get_mut("tables")
            .and_then(Value::as_object_mut)
            .and_then(|tables| tables.get_mut("categories"))
            .expect("categories included in backup");
        let id_index = category_table["columns"]
            .as_array()
            .expect("columns")
            .iter()
            .position(|column| column.as_str() == Some("id"))
            .expect("id column");
        let rows = category_table["rows"]
            .as_array_mut()
            .expect("rows");
        let mut duplicate = rows[0].clone();
        duplicate.as_array_mut().expect("row")[id_index] = json!("different-id");
        rows.push(duplicate);

        assert!(import_database_backup(&mut conn, &backup).is_err());
        let (id, name): (String, String) = conn.query_row(
            "SELECT id, name FROM categories WHERE id = 'keep'",
            [],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )?;
        assert_eq!(id, "keep");
        assert_eq!(name, "Keep");
        Ok(())
    }

    #[test]
    fn imports_previous_frontend_backup_format() -> rusqlite::Result<()> {
        let mut conn = open_in_memory()?;
        conn.execute(
            "INSERT INTO categories (id, name, color) VALUES ('old-row', 'Old', '#123456')",
            [],
        )?;
        let legacy = json!({
            "exportedAt": "2026-10-28T00:00:00.000Z",
            "year": 2026,
            "settings": {
                "dayStart": 420,
                "dayEnd": 1440,
                "cellMin": 30,
                "zoom": 1.0,
                "theme": "dark",
                "notificationsEnabled": false,
                "notifyLeadMin": 10
            },
            "categories": [
                { "id": "new-row", "name": "New", "color": "#abcdef", "subs": [] }
            ],
            "templates": [],
            "weeks": {
                "2026-09-14": {
                    "0": [[540, 630, {
                        "text": "Run",
                        "color": "#2E7D74",
                        "task": "",
                        "done": true,
                        "moved": false
                    }]]
                }
            }
        });

        import_database_backup(&mut conn, &legacy)?;

        let category_ids: Vec<String> = {
            let mut statement = conn.prepare("SELECT id FROM categories ORDER BY id")?;
            let rows = statement
                .query_map([], |row| row.get(0))?
                .collect::<rusqlite::Result<Vec<_>>>()?;
            rows
        };
        assert_eq!(category_ids, vec!["new-row"]);
        assert_eq!(crate::get_settings(&conn)?.day_start, 420);
        assert_eq!(crate::list_created_years(&conn)?, vec![2026]);
        let (date, start, end, text): (String, i64, i64, String) = conn.query_row(
            "SELECT date, start_min, end_min, text FROM intervals",
            [],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
        )?;
        assert_eq!(date, "2026-09-14");
        assert_eq!((start, end, text.as_str()), (540, 630, "Run"));
        Ok(())
    }

    #[test]
    fn exports_every_reflection_without_trimming_its_text() -> rusqlite::Result<()> {
        let conn = open_in_memory()?;
        conn.execute(
            "INSERT INTO reflections (date, text, updated_at) VALUES
             ('2024-01-02', '  first note  ', 1),
             ('2026-10-28', 'second note', 2)",
            [],
        )?;

        let markdown = export_all_reflections_markdown(&conn, "en")?;
        assert!(markdown.starts_with("# Daily reflections\n\n"));
        assert!(markdown.contains("## 2024-01-02\n\n  first note  \n\n"));
        assert!(markdown.contains("## 2026-10-28\n\nsecond note\n\n"));
        Ok(())
    }
}
