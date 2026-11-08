//! Слой хранения Незабудки (Forget-me-not, FMN) поверх SQLite.
//!
//! Реализует операции планировщика напрямую в SQLite и используется
//! приложением Tauri как самостоятельная storage-библиотека.

use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::BTreeMap;

pub mod backup;

pub const SCHEMA_SQL: &str = include_str!("../migrations/001_initial_schema.sql");
pub const SCHEMA_SQL_002: &str = include_str!("../migrations/002_reflections_and_more.sql");
pub const SCHEMA_SQL_003: &str = include_str!("../migrations/003_years_and_notify_date.sql");
pub const SCHEMA_SQL_004: &str = include_str!("../migrations/004_planscript.sql");
pub const SCHEMA_SQL_005: &str = include_str!("../migrations/005_watchers.sql");
pub const SCHEMA_SQL_006: &str = include_str!("../migrations/006_week_quantum.sql");
pub const SCHEMA_SQL_007: &str = include_str!("../migrations/007_recurring_conflict_mode.sql");
pub const SCHEMA_SQL_008: &str = include_str!("../migrations/008_week_day_bounds.sql");

fn init_schema_if_needed(conn: &Connection) -> rusqlite::Result<()> {
    let mut version: i32 = conn.pragma_query_value(None, "user_version", |row| row.get(0))?;
    if version < 1 {
        let schema_exists = table_exists(conn, "categories")?;
        if !schema_exists {
            conn.execute_batch(SCHEMA_SQL)?;
        }
        conn.pragma_update(None, "user_version", 1)?;
        version = 1;
    }

    if version < 2 {
        if !table_exists(conn, "reflections")? {
            conn.execute_batch(SCHEMA_SQL_002)?;
        }
        conn.pragma_update(None, "user_version", 2)?;
        version = 2;
    }

    if version < 3 {
        let has_created_years = table_exists(conn, "created_years")?;
        let has_notify_date: bool = conn.query_row(
            "SELECT EXISTS(SELECT 1 FROM pragma_table_info('settings') WHERE name = 'last_all_day_notify_date')",
            [],
            |row| row.get(0),
        )?;
        match (has_created_years, has_notify_date) {
            (false, false) => conn.execute_batch(SCHEMA_SQL_003)?,
            (false, true) => conn.execute_batch("CREATE TABLE created_years (year INTEGER PRIMARY KEY);")?,
            (true, false) => conn.execute_batch(
                "ALTER TABLE settings ADD COLUMN last_all_day_notify_date TEXT;",
            )?,
            (true, true) => {}
        }
        conn.pragma_update(None, "user_version", 3)?;
        version = 3;
    }

    if version < 4 {
        if !table_exists(conn, "planscripts")? {
            conn.execute_batch(SCHEMA_SQL_004)?;
        }
        conn.pragma_update(None, "user_version", 4)?;
        version = 4;
    }

    if version < 5 {
        if !table_exists(conn, "planscript_watchers")? {
            conn.execute_batch(SCHEMA_SQL_005)?;
        }
        version = 5;
    }

    if version < 6 {
        if !table_exists(conn, "week_quantum")? {
            conn.execute_batch(SCHEMA_SQL_006)?;
        }
        conn.pragma_update(None, "user_version", 6)?;
        version = 6;
    }

    if version < 7 {
        let has_conflict_mode: bool = conn.query_row(
            "SELECT EXISTS(SELECT 1 FROM pragma_table_info('recurring_rules') WHERE name = 'conflict_mode')",
            [],
            |row| row.get(0),
        )?;
        if !has_conflict_mode {
            conn.execute_batch(SCHEMA_SQL_007)?;
        }
        conn.pragma_update(None, "user_version", 7)?;
        version = 7;
    }

    if version < 8 {
        if !table_exists(conn, "week_day_bounds")? {
            conn.execute_batch(SCHEMA_SQL_008)?;
        }
        conn.pragma_update(None, "user_version", 8)?;
    }

    conn.execute(
        "INSERT OR IGNORE INTO settings (id) VALUES (1)",
        [],
    )?;
    Ok(())
}

fn table_exists(conn: &Connection, name: &str) -> rusqlite::Result<bool> {
    conn.query_row(
        "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?1)",
        [name],
        |row| row.get(0),
    )
}

pub fn open_and_init(path: &str) -> rusqlite::Result<Connection> {
    let conn = Connection::open(path)?;
    init_schema_if_needed(&conn)?;
    Ok(conn)
}

/// В памяти (для тестов) - та же схема на `:memory:`.
pub fn open_in_memory() -> rusqlite::Result<Connection> {
    let conn = Connection::open_in_memory()?;
    init_schema_if_needed(&conn)?;
    Ok(conn)
}

#[cfg(test)]
mod schema_initialization_tests {
    use super::*;

    #[test]
    fn completes_migrations_for_existing_schema_without_reapplying_it() -> rusqlite::Result<()> {
        let conn = Connection::open_in_memory()?;
        conn.execute_batch(SCHEMA_SQL)?;
        conn.execute(
            "INSERT INTO categories (id, name, color) VALUES ('existing', 'Existing', '#000000')",
            [],
        )?;

        init_schema_if_needed(&conn)?;

        let version: i32 = conn.pragma_query_value(None, "user_version", |row| row.get(0))?;
        let category_count: i64 = conn.query_row(
            "SELECT COUNT(*) FROM categories WHERE id = 'existing'",
            [],
            |row| row.get(0),
        )?;
        let has_reflections = table_exists(&conn, "reflections")?;
        let has_created_years = table_exists(&conn, "created_years")?;
        let has_notify_date: bool = conn.query_row(
            "SELECT EXISTS(SELECT 1 FROM pragma_table_info('settings') WHERE name = 'last_all_day_notify_date')",
            [],
            |row| row.get(0),
        )?;
        let has_recurring_conflict_mode: bool = conn.query_row(
            "SELECT EXISTS(SELECT 1 FROM pragma_table_info('recurring_rules') WHERE name = 'conflict_mode')",
            [],
            |row| row.get(0),
        )?;
        assert_eq!(version, 8);
        assert_eq!(category_count, 1);
        assert!(has_reflections);
        assert!(has_created_years);
        assert!(has_notify_date);
        assert!(has_recurring_conflict_mode);
        assert!(table_exists(&conn, "planscript_watchers")?);
        assert!(table_exists(&conn, "week_quantum")?);
        assert!(table_exists(&conn, "week_day_bounds")?);
        Ok(())
    }

    #[test]
    fn initializes_default_settings_row() -> rusqlite::Result<()> {
        let conn = open_in_memory()?;
        let settings = get_settings(&conn)?;

        assert_eq!(settings.day_start, 360);
        assert_eq!(settings.day_end, 1440);
        assert_eq!(settings.cell_min, 30);
        assert_eq!(settings.theme, "calm");
        Ok(())
    }

    #[test]
    fn preserves_existing_settings_row() -> rusqlite::Result<()> {
        let conn = open_in_memory()?;
        conn.execute(
            "UPDATE settings SET day_start = 420, theme = 'dark' WHERE id = 1",
            [],
        )?;

        init_schema_if_needed(&conn)?;
        let settings = get_settings(&conn)?;

        assert_eq!(settings.day_start, 420);
        assert_eq!(settings.theme, "dark");
        Ok(())
    }
}

// ============================================================================
// Ряд интервала - как он лежит в таблице `intervals`.
// ============================================================================
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct IntervalRow {
    pub start_min: i64,
    pub end_min: i64,
    pub text: String,
    pub color: String,
    pub task: String,
    pub description: String,
    pub cat_id: Option<String>,
    pub sub_id: Option<String>,
    pub done: bool,
    pub moved: bool,
}

impl IntervalRow {
    pub fn is_empty_content(&self) -> bool {
        self.text.is_empty()
            && self.color.is_empty()
            && self.task.is_empty()
            && !self.done
            && !self.moved
            // description и catId/subId намеренно не входят в критерий пустоты -
            // это зеркалирует writeCellValue() в старом cellData.js, где
            // "непусто" определялось ровно по text/color/task/done/moved.
    }

    fn content_equal(&self, other: &IntervalRow) -> bool {
        self.text == other.text
            && self.color == other.color
            && self.task == other.task
            && self.description == other.description
            && self.cat_id == other.cat_id
            && self.sub_id == other.sub_id
            && self.done == other.done
            && self.moved == other.moved
    }
}

/// Патч для SetInterval - трёхзначная семантика на каждое поле, как того
/// требует §4.4 (`.set(**kwargs)`): поле не упомянуто -> оставить как было;
/// поле = null -> явно очистить; поле = значение -> установить.
/// Реализовано через serde_json::Map, а не типизированную структуру с
/// Option<Option<T>> на каждое поле - тот же смысл, компактнее в API.
#[derive(Debug, Clone, Default)]
pub struct IntervalPatch(pub serde_json::Map<String, Value>);

impl IntervalPatch {
    pub fn new() -> Self {
        IntervalPatch(serde_json::Map::new())
    }
    pub fn text(mut self, v: impl Into<String>) -> Self {
        self.0.insert("text".into(), Value::String(v.into()));
        self
    }
    pub fn color(mut self, v: impl Into<String>) -> Self {
        self.0.insert("color".into(), Value::String(v.into()));
        self
    }
    pub fn task(mut self, v: impl Into<String>) -> Self {
        self.0.insert("task".into(), Value::String(v.into()));
        self
    }
    pub fn cat_id(mut self, v: Option<impl Into<String>>) -> Self {
        self.0.insert(
            "catId".into(),
            v.map(|s| Value::String(s.into())).unwrap_or(Value::Null),
        );
        self
    }
    pub fn done(mut self, v: bool) -> Self {
        self.0.insert("done".into(), Value::Bool(v));
        self
    }

    fn has(&self, key: &str) -> bool {
        self.0.contains_key(key)
    }
    fn get_str(&self, key: &str) -> Option<Option<String>> {
        self.0.get(key).map(|v| match v {
            Value::Null => None,
            Value::String(s) => Some(s.clone()),
            _ => None,
        })
    }
    fn get_bool(&self, key: &str) -> Option<Option<bool>> {
        self.0.get(key).map(|v| match v {
            Value::Null => None,
            Value::Bool(b) => Some(*b),
            _ => None,
        })
    }

    /// Применяет патч поверх существующего содержимого (или "пустой" болванки,
    /// если на этой позиции раньше ничего не было) - реализует "поле не
    /// упомянуто -> оставить как было".
    fn merge_onto(&self, existing: &IntervalRow) -> IntervalRow {
        let mut r = existing.clone();
        if self.has("text") {
            r.text = self.get_str("text").unwrap().unwrap_or_default();
        }
        if self.has("color") {
            r.color = self.get_str("color").unwrap().unwrap_or_default();
        }
        if self.has("task") {
            r.task = self.get_str("task").unwrap().unwrap_or_default();
        }
        if self.has("description") {
            r.description = self.get_str("description").unwrap().unwrap_or_default();
        }
        if self.has("catId") {
            r.cat_id = self.get_str("catId").unwrap();
        }
        if self.has("subId") {
            r.sub_id = self.get_str("subId").unwrap();
        }
        if self.has("done") {
            r.done = self.get_bool("done").unwrap().unwrap_or(false);
        }
        if self.has("moved") {
            r.moved = self.get_bool("moved").unwrap().unwrap_or(false);
        }
        r
    }
}

fn empty_row(start_min: i64, end_min: i64) -> IntervalRow {
    IntervalRow {
        start_min,
        end_min,
        text: String::new(),
        color: String::new(),
        task: String::new(),
        description: String::new(),
        cat_id: None,
        sub_id: None,
        done: false,
        moved: false,
    }
}

/// Читает все ряды дня, отсортированные по start_min - основа и для
/// рендера сетки, и для free_slots(), и для точечного мерджа в set_interval.
pub fn get_day_intervals(conn: &Connection, date: &str) -> rusqlite::Result<Vec<IntervalRow>> {
    let mut stmt = conn.prepare(
        "SELECT start_min, end_min, text, color, task, description, cat_id, sub_id, done, moved
         FROM intervals WHERE date = ?1 ORDER BY start_min",
    )?;
    let rows = stmt.query_map(params![date], |row| {
        Ok(IntervalRow {
            start_min: row.get(0)?,
            end_min: row.get(1)?,
            text: row.get(2)?,
            color: row.get(3)?,
            task: row.get(4)?,
            description: row.get(5)?,
            cat_id: row.get(6)?,
            sub_id: row.get(7)?,
            done: row.get::<_, i64>(8)? != 0,
            moved: row.get::<_, i64>(9)? != 0,
        })
    })?;
    rows.collect()
}

/// SetInterval(date, start_min, end_min, patch) - см. §8 spec. Ядро логики,
/// принимает уже открытую транзакцию - не открывает и не коммитит её само,
/// чтобы bulk-операции (apply_week_template, apply_recurring_rule и т.п.)
/// могли вызывать это много раз подряд внутри ОДНОЙ транзакции, а не
/// открывать N транзакций на N вызовов (см. обсуждение с пользователем -
/// атомарность и один SQLite-write-lock на всю пачку, а не на каждую клетку).
pub fn set_interval_tx(
    tx: &rusqlite::Transaction,
    date: &str,
    start_min: i64,
    end_min: i64,
    patch: &IntervalPatch,
) -> rusqlite::Result<()> {
    assert!(start_min < end_min, "start_min должен быть меньше end_min");
    assert!(start_min % 5 == 0 && end_min % 5 == 0, "границы должны быть кратны 5 минутам");

    // 1) Найти существующее содержимое РОВНО в точке start_min (для мерджа
    //    полей patch поверх него - как readCellValue() в старой модели),
    //    иначе патч применяется поверх "пустой" болванки.
    let existing_at_start: Option<IntervalRow> = tx
        .query_row(
            "SELECT start_min, end_min, text, color, task, description, cat_id, sub_id, done, moved
             FROM intervals WHERE date = ?1 AND start_min <= ?2 AND end_min > ?2",
            params![date, start_min],
            |row| {
                Ok(IntervalRow {
                    start_min: row.get(0)?,
                    end_min: row.get(1)?,
                    text: row.get(2)?,
                    color: row.get(3)?,
                    task: row.get(4)?,
                    description: row.get(5)?,
                    cat_id: row.get(6)?,
                    sub_id: row.get(7)?,
                    done: row.get::<_, i64>(8)? != 0,
                    moved: row.get::<_, i64>(9)? != 0,
                })
            },
        )
        .optional()?;

    let base = existing_at_start.unwrap_or_else(|| empty_row(start_min, end_min));
    let mut new_row = patch.merge_onto(&base);
    new_row.start_min = start_min;
    new_row.end_min = end_min;

    // 2) Вырезать/разбить все ряды, перекрывающиеся с [start_min, end_min).
    clip_range(tx, date, start_min, end_min)?;

    // 3) Вставить новый ряд, если содержимое не пустое (пустое = как
    //    delete в writeCellValue() старой модели - см. is_empty_content).
    if !new_row.is_empty_content() {
        tx.execute(
            "INSERT INTO intervals (date, start_min, end_min, text, color, task, description, cat_id, sub_id, done, moved)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
            params![
                date, new_row.start_min, new_row.end_min, new_row.text, new_row.color,
                new_row.task, new_row.description, new_row.cat_id, new_row.sub_id,
                new_row.done as i64, new_row.moved as i64
            ],
        )?;
    }

    // 4) Слияние с соседями идентичного содержимого (RLE, как compactCells).
    if !new_row.is_empty_content() {
        merge_adjacent(tx, date, new_row.start_min, new_row.end_min, &new_row)?;
    }

    Ok(())
}

/// Тонкая обёртка для одиночного вызова (правка одной клетки пользователем) -
/// открывает свою транзакцию на один SetInterval и сразу коммитит. Для пачки
/// вызовов (шаблоны, повторы) используйте set_interval_tx с общей транзакцией.
pub fn set_interval(conn: &mut Connection, date: &str, start_min: i64, end_min: i64, patch: &IntervalPatch) -> rusqlite::Result<()> {
    let tx = conn.transaction()?;
    set_interval_tx(&tx, date, start_min, end_min, patch)?;
    tx.commit()
}

/// ClearInterval(date, start_min, end_min) - то же вырезание/разбиение,
/// без последующей вставки. Транзакционное ядро + тонкая обёртка - см.
/// комментарий у set_interval_tx/set_interval выше, тот же принцип.
pub fn clear_interval_tx(tx: &rusqlite::Transaction, date: &str, start_min: i64, end_min: i64) -> rusqlite::Result<()> {
    clip_range(tx, date, start_min, end_min)
}

pub fn clear_interval(conn: &mut Connection, date: &str, start_min: i64, end_min: i64) -> rusqlite::Result<()> {
    let tx = conn.transaction()?;
    clear_interval_tx(&tx, date, start_min, end_min)?;
    tx.commit()
}

/// Вырезает диапазон [start_min, end_min) из существующих рядов этого дня:
/// полностью перекрытые ряды удаляются, частично перекрытые обрезаются или
/// разбиваются на сохранившиеся края (см. §8 про частичное перекрытие).
fn clip_range(tx: &rusqlite::Transaction, date: &str, start_min: i64, end_min: i64) -> rusqlite::Result<()> {
    let overlapping = get_day_intervals(tx, date)?
        .into_iter()
        .filter(|r| r.start_min < end_min && r.end_min > start_min)
        .collect::<Vec<_>>();

    for old in overlapping {
        // Удаляем старый ряд целиком (диапазон адресуется по (date, start_min),
        // так что удаляем по точному старому start_min).
        tx.execute(
            "DELETE FROM intervals WHERE date = ?1 AND start_min = ?2",
            params![date, old.start_min],
        )?;

        // Левый сохранившийся край.
        if old.start_min < start_min {
            let mut left = old.clone();
            left.end_min = start_min;
            insert_row(tx, date, &left)?;
        }
        // Правый сохранившийся край.
        if old.end_min > end_min {
            let mut right = old.clone();
            right.start_min = end_min;
            insert_row(tx, date, &right)?;
        }
    }
    Ok(())
}

fn insert_row(tx: &rusqlite::Transaction, date: &str, row: &IntervalRow) -> rusqlite::Result<()> {
    tx.execute(
        "INSERT INTO intervals (date, start_min, end_min, text, color, task, description, cat_id, sub_id, done, moved)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
        params![
            date, row.start_min, row.end_min, row.text, row.color, row.task,
            row.description, row.cat_id, row.sub_id, row.done as i64, row.moved as i64
        ],
    )?;
    Ok(())
}

/// Сливает новый ряд с непосредственно примыкающими рядами идентичного
/// содержимого слева/справа - RLE-компрессия, как раньше делал compactCells
/// в JS, только теперь на уровне строк таблицы.
fn merge_adjacent(tx: &rusqlite::Transaction, date: &str, start_min: i64, end_min: i64, content: &IntervalRow) -> rusqlite::Result<()> {
    let mut final_start = start_min;
    let mut final_end = end_min;

    if let Some(left) = get_day_intervals(tx, date)?.into_iter().find(|r| r.end_min == final_start) {
        if left.content_equal(content) {
            tx.execute("DELETE FROM intervals WHERE date = ?1 AND start_min = ?2", params![date, left.start_min])?;
            final_start = left.start_min;
        }
    }
    if let Some(right) = get_day_intervals(tx, date)?.into_iter().find(|r| r.start_min == final_end) {
        if right.content_equal(content) {
            tx.execute("DELETE FROM intervals WHERE date = ?1 AND start_min = ?2", params![date, right.start_min])?;
            final_end = right.end_min;
        }
    }

    if final_start != start_min || final_end != end_min {
        tx.execute("DELETE FROM intervals WHERE date = ?1 AND start_min = ?2", params![date, start_min])?;
        insert_row(tx, date, &IntervalRow { start_min: final_start, end_min: final_end, ..content.clone() })?;
    }
    Ok(())
}

/// Пишет patch только в те под-диапазоны [start_min, end_min), которые
/// СЕЙЧАС пусты (нет ни одного ряда) - существующее содержимое не трогает
/// вообще. Реализует режим "Только в пустые" у шаблонов (TemplatesPanel.jsx:
/// keepExisting - "что уже заполнено, не трогается").
fn fill_empty_gaps_tx(tx: &rusqlite::Transaction, date: &str, start_min: i64, end_min: i64, patch: &IntervalPatch) -> rusqlite::Result<()> {
    let occupied = get_day_intervals(tx, date)?
        .into_iter()
        .filter(|r| r.start_min < end_min && r.end_min > start_min)
        .collect::<Vec<_>>();

    let mut cursor = start_min;
    let mut bounds: Vec<(i64, i64)> = occupied.iter().map(|r| (r.start_min.max(start_min), r.end_min.min(end_min))).collect();
    bounds.sort();
    for (occ_start, occ_end) in bounds {
        if occ_start > cursor {
            set_interval_tx(tx, date, cursor, occ_start, patch)?;
        }
        cursor = cursor.max(occ_end);
    }
    if cursor < end_min {
        set_interval_tx(tx, date, cursor, end_min, patch)?;
    }
    Ok(())
}

/// Все интервалы недели ОДНИМ запросом (не 7 отдельных cmd_get_day_intervals -
/// на этом фронтенд экономит 6 IPC round-trip'ов на каждую смонтированную
/// неделю, что особенно важно с учётом всей работы по виртуализации из Фазы 1).
/// Возвращает 7 списков, индекс = day_idx (0=Пн..6=Вс).
pub fn get_week_intervals(conn: &Connection, monday: &str) -> rusqlite::Result<[Vec<IntervalRow>; 7]> {
    use chrono::NaiveDate;
    let monday_date = NaiveDate::parse_from_str(monday, "%Y-%m-%d").expect("некорректная дата monday");
    let sunday_date = monday_date + chrono::Duration::days(6);
    let from = monday_date.format("%Y-%m-%d").to_string();
    let to = sunday_date.format("%Y-%m-%d").to_string();

    let mut stmt = conn.prepare(
        "SELECT date, start_min, end_min, text, color, task, description, cat_id, sub_id, done, moved
         FROM intervals WHERE date BETWEEN ?1 AND ?2 ORDER BY date, start_min",
    )?;
    let mut result: [Vec<IntervalRow>; 7] = Default::default();
    let rows = stmt.query_map(params![from, to], |row| {
        Ok((
            row.get::<_, String>(0)?,
            IntervalRow {
                start_min: row.get(1)?, end_min: row.get(2)?, text: row.get(3)?, color: row.get(4)?,
                task: row.get(5)?, description: row.get(6)?, cat_id: row.get(7)?, sub_id: row.get(8)?,
                done: row.get::<_, i64>(9)? != 0, moved: row.get::<_, i64>(10)? != 0,
            },
        ))
    })?;
    for r in rows {
        let (date, interval) = r?;
        let d = NaiveDate::parse_from_str(&date, "%Y-%m-%d").unwrap();
        let day_idx = (d - monday_date).num_days() as usize;
        if day_idx < 7 { result[day_idx].push(interval); }
    }
    Ok(result)
}

/// Restore(monday, days) - undo/redo. Снимок (days: [Vec<IntervalRow>;7],
/// тот же формат, что отдаёт get_week_intervals) ЦЕЛИКОМ заменяет неделю
/// одной транзакцией: стираем ВСЕ 7 дней полностью (0..1440, не только
/// текущий day_start..day_end - снимок должен восстановиться точно таким,
/// каким был, даже если настройки окна дня поменялись между снимком и
/// отменой), затем вставляем интервалы снимка как есть - без повторного
/// прогона clip/merge (снимок уже был в корректном, слитом состоянии на
/// момент создания).
pub fn restore_week(conn: &mut Connection, monday: &str, days: &[Vec<IntervalRow>; 7]) -> rusqlite::Result<()> {
    let tx = conn.transaction()?;
    restore_week_in_tx(&tx, monday, days)?;
    tx.commit()
}

pub fn restore_weeks(conn: &mut Connection, weeks: &[(String, [Vec<IntervalRow>; 7])]) -> rusqlite::Result<()> {
    let tx = conn.transaction()?;
    for (monday, days) in weeks {
        restore_week_in_tx(&tx, monday, days)?;
    }
    tx.commit()
}

fn restore_week_in_tx(tx: &rusqlite::Transaction<'_>, monday: &str, days: &[Vec<IntervalRow>; 7]) -> rusqlite::Result<()> {
    for (day_idx, day_intervals) in days.iter().enumerate() {
        let date = monday_plus_days(monday, day_idx as i64);
        tx.execute("DELETE FROM intervals WHERE date = ?1", params![date])?;
        for v in day_intervals {
            tx.execute(
                "INSERT INTO intervals (date, start_min, end_min, text, color, task, description, cat_id, sub_id, done, moved)
                 VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11)",
                params![date, v.start_min, v.end_min, v.text, v.color, v.task, v.description, v.cat_id, v.sub_id, v.done as i64, v.moved as i64],
            )?;
        }
    }
    Ok(())
}

/// Статистика трекера по месяцам года (TrackerPanel.jsx, вкладка "Год").
/// Считает УНИКАЛЬНЫЕ (категория, дата, подкатегория) единицы - как и
/// раньше в JS (см. комментарий про subId в старом refreshTracker): если
/// у "Учёбы ЭБ" в один день закрашено несколько разных подкатегорий, это
/// несколько единиц, а не одна. moved/done считаются по той же единице:
/// "хоть один ряд этого дня с этой под/категорией отмечен moved/done" -
/// не сумма рядов (90-минутная пара не должна считаться дважды только
/// потому что хранится как два ряда в intervals).
pub struct TrackerMonthStats {
    pub cat_id: String,
    pub planned: [i64; 12],
    pub moved: [i64; 12],
    pub done: [i64; 12],
}

pub fn tracker_stats_by_month(conn: &Connection, year: i64) -> rusqlite::Result<Vec<TrackerMonthStats>> {
    use std::collections::HashMap;
    let from = format!("{year:04}-01-01");
    let to = format!("{year:04}-12-31");

    let mut stmt = conn.prepare(
        "SELECT cat_id, date, MAX(moved) as any_moved, MAX(done) as any_done
         FROM intervals
         WHERE cat_id IS NOT NULL AND date BETWEEN ?1 AND ?2
         GROUP BY cat_id, date, sub_id",
    )?;
    let rows = stmt.query_map(params![from, to], |row| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, i64>(2)? != 0,
            row.get::<_, i64>(3)? != 0,
        ))
    })?;

    let mut by_cat: HashMap<String, TrackerMonthStats> = HashMap::new();
    for r in rows {
        let (cat_id, date, moved, done) = r?;
        let month = date[5..7].parse::<usize>().unwrap_or(1) - 1; // "YYYY-MM-DD" -> 0..11
        let entry = by_cat.entry(cat_id.clone()).or_insert_with(|| TrackerMonthStats {
            cat_id: cat_id.clone(), planned: [0; 12], moved: [0; 12], done: [0; 12],
        });
        entry.planned[month] += 1;
        if moved { entry.moved[month] += 1; }
        if done { entry.done[month] += 1; }
    }
    Ok(by_cat.into_values().collect())
}

/// То же, что tracker_stats_by_month, но без разбивки по месяцам - просто
/// суммарно по категории за произвольный диапазон дат (CounterPanel.jsx -
/// "Счётчик" по отмеченным неделям, не обязательно в пределах одного года
/// и не обязательно выровненным по месяцам).
pub struct TrackerRangeStats { pub cat_id: String, pub planned: i64, pub moved: i64, pub done: i64 }

pub fn tracker_stats_range(conn: &Connection, date_from: &str, date_to: &str) -> rusqlite::Result<Vec<TrackerRangeStats>> {
    use std::collections::HashMap;
    let mut stmt = conn.prepare(
        "SELECT cat_id, date, MAX(moved) as any_moved, MAX(done) as any_done
         FROM intervals
         WHERE cat_id IS NOT NULL AND date BETWEEN ?1 AND ?2
         GROUP BY cat_id, date, sub_id",
    )?;
    let rows = stmt.query_map(params![date_from, date_to], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, i64>(2)? != 0, row.get::<_, i64>(3)? != 0))
    })?;
    let mut by_cat: HashMap<String, TrackerRangeStats> = HashMap::new();
    for r in rows {
        let (cat_id, moved, done) = r?;
        let entry = by_cat.entry(cat_id.clone()).or_insert_with(|| TrackerRangeStats { cat_id: cat_id.clone(), planned: 0, moved: 0, done: 0 });
        entry.planned += 1;
        if moved { entry.moved += 1; }
        if done { entry.done += 1; }
    }
    Ok(by_cat.into_values().collect())
}

pub fn add_todo(conn: &Connection, id: &str, text: &str, created_at: i64) -> rusqlite::Result<()> {
    let sort_order: i64 = conn.query_row("SELECT COALESCE(MAX(sort_order) + 1, 0) FROM todos", [], |row| row.get(0))?;
    add_todo_at_order(conn, id, text, created_at, sort_order)
}

pub fn add_todo_at_order(conn: &Connection, id: &str, text: &str, created_at: i64, sort_order: i64) -> rusqlite::Result<()> {
    conn.execute(
        "INSERT INTO todos (id, text, done, created_at, sort_order) VALUES (?1, ?2, 0, ?3, ?4)",
        params![id, text, created_at, sort_order],
    )?;
    Ok(())
}

pub fn restore_todo(conn: &Connection, id: &str, text: &str, done: bool, created_at: i64, sort_order: i64) -> rusqlite::Result<()> {
    conn.execute(
        "INSERT INTO todos (id, text, done, created_at, sort_order) VALUES (?1, ?2, ?3, ?4, ?5)
         ON CONFLICT(id) DO UPDATE SET text=excluded.text, done=excluded.done,
         created_at=excluded.created_at, sort_order=excluded.sort_order",
        params![id, text, done as i64, created_at, sort_order],
    )?;
    Ok(())
}

pub fn reorder_todos(conn: &mut Connection, ids: &[String]) -> rusqlite::Result<()> {
    let tx = conn.transaction()?;
    let mut stmt = tx.prepare("UPDATE todos SET sort_order = ?1 WHERE id = ?2")?;
    for (sort_order, id) in ids.iter().enumerate() {
        if stmt.execute(params![sort_order as i64, id])? != 1 {
            return Err(rusqlite::Error::QueryReturnedNoRows);
        }
    }
    drop(stmt);
    let count: i64 = tx.query_row("SELECT COUNT(*) FROM todos", [], |row| row.get(0))?;
    if count != ids.len() as i64 {
        return Err(rusqlite::Error::InvalidQuery);
    }
    tx.commit()
}

pub struct TodoRow { pub id: String, pub text: String, pub done: bool, pub created_at: i64, pub sort_order: i64 }

pub fn restore_todo_drop(conn: &mut Connection, monday: &str, days: &[Vec<IntervalRow>; 7], todo: &TodoRow) -> rusqlite::Result<()> {
    let tx = conn.transaction()?;
    restore_week_in_tx(&tx, monday, days)?;
    tx.execute(
        "INSERT INTO todos (id, text, done, created_at, sort_order) VALUES (?1, ?2, ?3, ?4, ?5)
         ON CONFLICT(id) DO UPDATE SET text=excluded.text, done=excluded.done,
         created_at=excluded.created_at, sort_order=excluded.sort_order",
        params![todo.id, todo.text, todo.done as i64, todo.created_at, todo.sort_order],
    )?;
    tx.commit()
}

pub fn list_todos(conn: &Connection) -> rusqlite::Result<Vec<TodoRow>> {
    let mut stmt = conn.prepare("SELECT id, text, done, created_at, sort_order FROM todos ORDER BY sort_order, created_at, id")?;
    let rows = stmt.query_map([], |row| Ok(TodoRow { id: row.get(0)?, text: row.get(1)?, done: row.get::<_,i64>(2)? != 0, created_at: row.get(3)?, sort_order: row.get(4)? }))?;
    rows.collect()
}
pub fn toggle_todo(conn: &Connection, id: &str) -> rusqlite::Result<()> {
    conn.execute("UPDATE todos SET done = 1 - done WHERE id = ?1", params![id])?;
    Ok(())
}
pub fn delete_todo(conn: &Connection, id: &str) -> rusqlite::Result<()> {
    conn.execute("DELETE FROM todos WHERE id = ?1", params![id])?;
    Ok(())
}

/// find(range, category=, subcategory=, text_contains=, done=, empty=) - §4.9.
/// `empty` здесь не поддержан буквально (пустые диапазоны в БД не хранятся -
/// искать "пустые клетки" нужно постобработкой free_slots, а не find()).
pub struct FindFilter<'a> {
    pub date_from: &'a str,
    pub date_to: &'a str,
    pub cat_id: Option<&'a str>,
    pub sub_id: Option<&'a str>,
    pub text_contains: Option<&'a str>,
    pub done: Option<bool>,
}

pub fn find(conn: &Connection, f: &FindFilter) -> rusqlite::Result<Vec<(String, IntervalRow)>> {
    let mut sql = String::from(
        "SELECT date, start_min, end_min, text, color, task, description, cat_id, sub_id, done, moved
         FROM intervals WHERE date BETWEEN ?1 AND ?2",
    );
    let mut idx = 3;
    if f.cat_id.is_some() { sql += &format!(" AND cat_id = ?{idx}"); idx += 1; }
    if f.sub_id.is_some() { sql += &format!(" AND sub_id = ?{idx}"); idx += 1; }
    if f.done.is_some() { sql += &format!(" AND done = ?{idx}"); idx += 1; }
    if f.text_contains.is_some() {
        sql += " AND id IN (SELECT rowid FROM intervals_fts WHERE intervals_fts MATCH ?".to_owned().as_str();
        sql += &idx.to_string();
        sql += ")";
    }
    sql += " ORDER BY date, start_min";

    let mut stmt = conn.prepare(&sql)?;
    let mut bind_idx = 3;
    let mut binds: Vec<Box<dyn rusqlite::ToSql>> = vec![Box::new(f.date_from.to_string()), Box::new(f.date_to.to_string())];
    if let Some(c) = f.cat_id { binds.push(Box::new(c.to_string())); bind_idx += 1; }
    if let Some(s) = f.sub_id { binds.push(Box::new(s.to_string())); bind_idx += 1; }
    if let Some(d) = f.done { binds.push(Box::new(d as i64)); bind_idx += 1; }
    if let Some(t) = f.text_contains { binds.push(Box::new(t.to_string())); }
    let _ = bind_idx;

    let params_refs: Vec<&dyn rusqlite::ToSql> = binds.iter().map(|b| b.as_ref()).collect();

    let rows = stmt.query_map(params_refs.as_slice(), |row| {
        Ok((
            row.get::<_, String>(0)?,
            IntervalRow {
                start_min: row.get(1)?,
                end_min: row.get(2)?,
                text: row.get(3)?,
                color: row.get(4)?,
                task: row.get(5)?,
                description: row.get(6)?,
                cat_id: row.get(7)?,
                sub_id: row.get(8)?,
                done: row.get::<_, i64>(9)? != 0,
                moved: row.get::<_, i64>(10)? != 0,
            },
        ))
    })?;
    rows.collect()
}

/// Минуты по КАЖДОЙ категории за диапазон дат одним запросом - TrackerPanel
/// вкладка "Неделя" (computeWeekStats): раньше считала BASE_UNIT * число
/// квантов на JS-стороне, теперь просто SUM(end_min-start_min) GROUP BY
/// cat_id - то же самое число минут, без похода за каждой категорией отдельно.
pub fn minutes_by_category(conn: &Connection, date_from: &str, date_to: &str) -> rusqlite::Result<Vec<(String, i64)>> {
    let mut stmt = conn.prepare(
        "SELECT cat_id, SUM(end_min - start_min) FROM intervals
         WHERE cat_id IS NOT NULL AND date BETWEEN ?1 AND ?2 GROUP BY cat_id",
    )?;
    let rows = stmt.query_map(params![date_from, date_to], |row| Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?)))?;
    rows.collect()
}

/// stats.hours(category, range) - §4.8.
pub fn stats_hours(conn: &Connection, cat_id: &str, date_from: &str, date_to: &str) -> rusqlite::Result<f64> {
    let total_min: i64 = conn.query_row(
        "SELECT COALESCE(SUM(end_min - start_min), 0) FROM intervals
         WHERE cat_id = ?1 AND date BETWEEN ?2 AND ?3",
        params![cat_id, date_from, date_to],
        |row| row.get(0),
    )?;
    Ok(total_min as f64 / 60.0)
}

/// Day.free_slots(min_duration) - §4.2. Постобработка отсортированных рядов
/// одного дня, не SQL (см. обоснование в §8 обновлённой спеки).
pub fn free_slots(conn: &Connection, date: &str, day_start: i64, day_end: i64, min_duration: Option<i64>) -> rusqlite::Result<Vec<(i64, i64)>> {
    let rows = get_day_intervals(conn, date)?;
    let mut gaps = Vec::new();
    let mut cursor = day_start;
    for r in &rows {
        if r.start_min > cursor {
            gaps.push((cursor, r.start_min));
        }
        cursor = cursor.max(r.end_min);
    }
    if cursor < day_end {
        gaps.push((cursor, day_end));
    }
    if let Some(min_dur) = min_duration {
        gaps.retain(|(a, b)| b - a >= min_dur);
    }
    Ok(gaps)
}

// ============================================================================
// Настройки - единственная строка (day_start/day_end/cell_min/zoom/theme/
// notifications/leadMin/lastAllDayNotifyDate).
// ============================================================================
#[derive(Debug, Clone)]
pub struct SettingsRow {
    pub day_start: i64, pub day_end: i64, pub cell_min: i64, pub zoom: f64,
    pub theme: String, pub notifications_enabled: bool, pub notify_lead_min: i64,
    pub last_all_day_notify_date: Option<String>,
}

pub fn get_settings(conn: &Connection) -> rusqlite::Result<SettingsRow> {
    conn.query_row(
        "SELECT day_start, day_end, cell_min, zoom, theme, notifications_enabled, notify_lead_min, last_all_day_notify_date FROM settings WHERE id=1",
        [],
        |row| Ok(SettingsRow {
            day_start: row.get(0)?, day_end: row.get(1)?, cell_min: row.get(2)?, zoom: row.get(3)?,
            theme: row.get(4)?, notifications_enabled: row.get::<_, i64>(5)? != 0, notify_lead_min: row.get(6)?,
            last_all_day_notify_date: row.get(7)?,
        }),
    )
}

/// Частичное обновление настроек - None по каждому полю значит "не менять".
/// В отличие от IntervalPatch, тут не нужна тройная семантика (explicit
/// null не имеет смысла для настроек - у них всегда есть разумное значение).
#[derive(Debug, Clone, Default)]
pub struct SettingsPatch {
    pub day_start: Option<i64>, pub day_end: Option<i64>, pub cell_min: Option<i64>, pub zoom: Option<f64>,
    pub theme: Option<String>, pub notifications_enabled: Option<bool>, pub notify_lead_min: Option<i64>,
    pub last_all_day_notify_date: Option<String>,
}

pub fn update_settings(conn: &Connection, patch: &SettingsPatch) -> rusqlite::Result<()> {
    let cur = get_settings(conn)?;
    let day_start = patch.day_start.unwrap_or(cur.day_start);
    let day_end = patch.day_end.unwrap_or(cur.day_end);
    if !(0..=1435).contains(&day_start) || day_start % 5 != 0
        || !(5..=1440).contains(&day_end) || day_end % 5 != 0
        || day_start >= day_end
    {
        return Err(rusqlite::Error::InvalidParameterName("day bounds must be valid 5-minute boundaries with start earlier than end".into()));
    }
    let invalid_week_exists: bool = conn.query_row(
        "SELECT EXISTS(
            SELECT 1 FROM week_day_bounds
            WHERE COALESCE(day_start, ?1) >= COALESCE(day_end, ?2)
        )",
        params![day_start, day_end],
        |row| row.get(0),
    )?;
    if invalid_week_exists {
        return Err(rusqlite::Error::InvalidParameterName("global hours conflict with a week-specific day range".into()));
    }
    conn.execute(
        "UPDATE settings SET day_start=?1, day_end=?2, cell_min=?3, zoom=?4, theme=?5, notifications_enabled=?6, notify_lead_min=?7, last_all_day_notify_date=?8 WHERE id=1",
        params![
            day_start,
            day_end,
            patch.cell_min.unwrap_or(cur.cell_min),
            patch.zoom.unwrap_or(cur.zoom),
            patch.theme.clone().unwrap_or(cur.theme),
            patch.notifications_enabled.unwrap_or(cur.notifications_enabled) as i64,
            patch.notify_lead_min.unwrap_or(cur.notify_lead_min),
            patch.last_all_day_notify_date.clone().or(cur.last_all_day_notify_date),
        ],
    )?;
    Ok(())
}

pub fn get_week_quantum(conn: &Connection, monday: &str) -> rusqlite::Result<Option<i64>> {
    conn.query_row(
        "SELECT cell_min FROM week_quantum WHERE monday_date=?1",
        [monday],
        |row| row.get(0),
    ).optional()
}

pub fn set_week_quantum(conn: &Connection, monday: &str, cell_min: Option<i64>) -> rusqlite::Result<()> {
    match cell_min {
        Some(value) => {
            if ![5, 10, 15, 30, 60].contains(&value) {
                return Err(rusqlite::Error::InvalidParameterName("cell_min must be one of 5, 10, 15, 30, 60".into()));
            }
            conn.execute(
                "INSERT INTO week_quantum (monday_date, cell_min) VALUES (?1, ?2)
                 ON CONFLICT(monday_date) DO UPDATE SET cell_min=excluded.cell_min",
                params![monday, value],
            )?;
        }
        None => {
            conn.execute("DELETE FROM week_quantum WHERE monday_date=?1", [monday])?;
        }
    }
    Ok(())
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct WeekDayBounds {
    pub day_start: Option<i64>,
    pub day_end: Option<i64>,
}

pub fn get_week_day_bounds(conn: &Connection, monday: &str) -> rusqlite::Result<Option<WeekDayBounds>> {
    conn.query_row(
        "SELECT day_start, day_end FROM week_day_bounds WHERE monday_date=?1",
        [monday],
        |row| Ok(WeekDayBounds { day_start: row.get(0)?, day_end: row.get(1)? }),
    ).optional()
}

pub fn set_week_day_bounds(
    conn: &Connection,
    monday: &str,
    day_start: Option<i64>,
    day_end: Option<i64>,
) -> rusqlite::Result<()> {
    if day_start.is_none() && day_end.is_none() {
        conn.execute("DELETE FROM week_day_bounds WHERE monday_date=?1", [monday])?;
        return Ok(());
    }
    if day_start.is_some_and(|value| !(0..=1435).contains(&value) || value % 5 != 0) {
        return Err(rusqlite::Error::InvalidParameterName("day_start must be a 5-minute boundary between 00:00 and 23:55".into()));
    }
    if day_end.is_some_and(|value| !(5..=1440).contains(&value) || value % 5 != 0) {
        return Err(rusqlite::Error::InvalidParameterName("day_end must be a 5-minute boundary between 00:05 and 24:00".into()));
    }
    let global = get_settings(conn)?;
    if day_start.unwrap_or(global.day_start) >= day_end.unwrap_or(global.day_end) {
        return Err(rusqlite::Error::InvalidParameterName("week day start must be earlier than week day end".into()));
    }
    conn.execute(
        "INSERT INTO week_day_bounds (monday_date, day_start, day_end) VALUES (?1, ?2, ?3)
         ON CONFLICT(monday_date) DO UPDATE SET day_start=excluded.day_start, day_end=excluded.day_end",
        params![monday, day_start, day_end],
    )?;
    Ok(())
}

// ============================================================================
// Заведённые года (createdYears) - чисто навигационный список, см. §7.6
// PlanScript-spec.md. sort_order не нужен - года сортируются по значению.
// ============================================================================
pub fn list_created_years(conn: &Connection) -> rusqlite::Result<Vec<i64>> {
    let mut stmt = conn.prepare("SELECT year FROM created_years ORDER BY year")?;
    let rows = stmt.query_map([], |row| row.get::<_, i64>(0))?;
    rows.collect()
}

pub fn add_created_year(conn: &Connection, year: i64) -> rusqlite::Result<()> {
    conn.execute("INSERT OR IGNORE INTO created_years (year) VALUES (?1)", params![year])?;
    Ok(())
}
pub fn delete_created_year(conn: &Connection, year: i64) -> rusqlite::Result<()> {
    conn.execute("DELETE FROM created_years WHERE year = ?1", params![year])?;
    Ok(())
}

// ============================================================================
// Подписи недель (weekNumbers/WeekTiles.jsx) - см. week_meta в 001.
// ============================================================================
pub fn set_week_label(conn: &Connection, monday: &str, label: &str) -> rusqlite::Result<()> {
    if label.trim().is_empty() {
        conn.execute("DELETE FROM week_meta WHERE monday_date = ?1", params![monday])?;
    } else {
        conn.execute(
            "INSERT INTO week_meta (monday_date, order_label) VALUES (?1, ?2)
             ON CONFLICT(monday_date) DO UPDATE SET order_label = excluded.order_label",
            params![monday, label],
        )?;
    }
    Ok(())
}

pub fn get_week_labels(conn: &Connection, from_monday: &str, to_monday: &str) -> rusqlite::Result<Vec<(String, String)>> {
    let mut stmt = conn.prepare("SELECT monday_date, order_label FROM week_meta WHERE monday_date BETWEEN ?1 AND ?2")?;
    let rows = stmt.query_map(params![from_monday, to_monday], |row| Ok((row.get(0)?, row.get(1)?)))?;
    rows.collect()
}

// ============================================================================
// Весь день / несколько дней (AllDayEvents.jsx) - SetAllDay/ClearAllDay из §8.
// ============================================================================
pub fn set_all_day(
    conn: &Connection, id: &str, text: &str, cat_id: Option<&str>, color: Option<&str>,
    start_date: &str, end_date: &str, created_at: i64,
) -> rusqlite::Result<()> {
    let (s, e) = if start_date <= end_date { (start_date, end_date) } else { (end_date, start_date) };
    conn.execute(
        "INSERT INTO all_day_events (id, text, cat_id, color, start_date, end_date, created_at)
         VALUES (?1,?2,?3,?4,?5,?6,?7)",
        params![id, text, cat_id, color, s, e, created_at],
    )?;
    Ok(())
}

pub fn clear_all_day(conn: &Connection, id: &str) -> rusqlite::Result<()> {
    conn.execute("DELETE FROM all_day_events WHERE id = ?1", params![id])?;
    Ok(())
}

pub struct AllDayEventRow {
    pub id: String, pub text: String, pub cat_id: Option<String>, pub color: Option<String>,
    pub start_date: String, pub end_date: String,
}

/// Все all-day события без ограничения по диапазону - для разового
/// стартового чтения в React state (см. Planner.jsx: старое поведение
/// loadKey("allDayEvents") грузило весь список целиком, без диапазона;
/// get_all_day_in_range ниже - для точечного рендера одной недели).
pub fn list_all_all_day_events(conn: &Connection) -> rusqlite::Result<Vec<AllDayEventRow>> {
    let mut stmt = conn.prepare("SELECT id, text, cat_id, color, start_date, end_date FROM all_day_events ORDER BY start_date")?;
    let rows = stmt.query_map([], |row| {
        Ok(AllDayEventRow { id: row.get(0)?, text: row.get(1)?, cat_id: row.get(2)?, color: row.get(3)?, start_date: row.get(4)?, end_date: row.get(5)? })
    })?;
    rows.collect()
}

/// Все all-day события, пересекающие диапазон [from, to] (для рендера недели).
pub fn get_all_day_in_range(conn: &Connection, from: &str, to: &str) -> rusqlite::Result<Vec<AllDayEventRow>> {
    let mut stmt = conn.prepare(
        "SELECT id, text, cat_id, color, start_date, end_date FROM all_day_events
         WHERE start_date <= ?2 AND end_date >= ?1 ORDER BY start_date",
    )?;
    let rows = stmt.query_map(params![from, to], |row| {
        Ok(AllDayEventRow {
            id: row.get(0)?, text: row.get(1)?, cat_id: row.get(2)?, color: row.get(3)?,
            start_date: row.get(4)?, end_date: row.get(5)?,
        })
    })?;
    rows.collect()
}

// ============================================================================
// Категории и подкатегории - CRUD (CategoryPanel.jsx).
// ============================================================================
pub fn add_category(conn: &Connection, id: &str, name: &str, color: &str, sort_order: i64) -> rusqlite::Result<()> {
    conn.execute(
        "INSERT INTO categories (id, name, color, sort_order) VALUES (?1,?2,?3,?4)",
        params![id, name, color, sort_order],
    )?;
    Ok(())
}

pub fn update_category_color(conn: &Connection, id: &str, color: &str) -> rusqlite::Result<()> {
    conn.execute("UPDATE categories SET color = ?1 WHERE id = ?2", params![color, id])?;
    Ok(())
}

pub fn rename_category(conn: &Connection, id: &str, name: &str) -> rusqlite::Result<()> {
    conn.execute("UPDATE categories SET name = ?1 WHERE id = ?2", params![name, id])?;
    Ok(())
}

/// Удаление категории - записи в intervals НЕ удаляются (cat_id очищается
/// через ON DELETE SET NULL в схеме), это то же поведение, что было в
/// removeCat() в CategoryPanel.jsx ("Записи в клетках останутся").
pub fn delete_category(conn: &Connection, id: &str) -> rusqlite::Result<()> {
    conn.execute("DELETE FROM categories WHERE id = ?1", params![id])?;
    Ok(())
}

pub fn add_subcategory(conn: &Connection, id: &str, category_id: &str, name: &str, sort_order: i64) -> rusqlite::Result<()> {
    conn.execute(
        "INSERT INTO subcategories (id, category_id, name, description, sort_order) VALUES (?1,?2,?3,'',?4)",
        params![id, category_id, name, sort_order],
    )?;
    Ok(())
}

pub fn update_subcategory_description(conn: &Connection, id: &str, description: &str) -> rusqlite::Result<()> {
    conn.execute("UPDATE subcategories SET description = ?1 WHERE id = ?2", params![description, id])?;
    Ok(())
}

pub fn delete_subcategory(conn: &Connection, id: &str) -> rusqlite::Result<()> {
    conn.execute("DELETE FROM subcategories WHERE id = ?1", params![id])?;
    Ok(())
}

pub struct CategoryRow { pub id: String, pub name: String, pub color: String }
pub struct SubcategoryRow { pub id: String, pub category_id: String, pub name: String, pub description: String }

pub fn list_categories(conn: &Connection) -> rusqlite::Result<Vec<CategoryRow>> {
    let mut stmt = conn.prepare("SELECT id, name, color FROM categories ORDER BY sort_order")?;
    let rows = stmt.query_map([], |row| Ok(CategoryRow { id: row.get(0)?, name: row.get(1)?, color: row.get(2)? }))?;
    rows.collect()
}

pub fn list_subcategories(conn: &Connection) -> rusqlite::Result<Vec<SubcategoryRow>> {
    let mut stmt = conn.prepare("SELECT id, category_id, name, description FROM subcategories ORDER BY sort_order")?;
    let rows = stmt.query_map([], |row| {
        Ok(SubcategoryRow { id: row.get(0)?, category_id: row.get(1)?, name: row.get(2)?, description: row.get(3)? })
    })?;
    rows.collect()
}

// ============================================================================
// Шаблоны - CRUD самих записей (bulk-применение см. apply_week_template/
// apply_day_template выше; это отдельно - просто список/добавление/удаление).
// ============================================================================
pub struct TemplateRow { pub id: String, pub name: String, pub kind: String, pub data: String }

pub fn add_template(conn: &Connection, id: &str, name: &str, kind: &str, data: &str, created_at: i64) -> rusqlite::Result<()> {
    conn.execute(
        "INSERT INTO templates (id, name, type, data, created_at) VALUES (?1,?2,?3,?4,?5)",
        params![id, name, kind, data, created_at],
    )?;
    Ok(())
}
pub fn delete_template(conn: &Connection, id: &str) -> rusqlite::Result<()> {
    conn.execute("DELETE FROM templates WHERE id = ?1", params![id])?;
    Ok(())
}
pub fn list_templates(conn: &Connection) -> rusqlite::Result<Vec<TemplateRow>> {
    let mut stmt = conn.prepare("SELECT id, name, type, data FROM templates ORDER BY created_at")?;
    let rows = stmt.query_map([], |row| Ok(TemplateRow { id: row.get(0)?, name: row.get(1)?, kind: row.get(2)?, data: row.get(3)? }))?;
    rows.collect()
}

// ============================================================================
// PlanScript - сохранённые пользовательские скрипты.
// ============================================================================
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct PlanScriptRow {
    pub id: String,
    pub name: String,
    pub code: String,
    pub version: i64,
    pub created_at: i64,
    pub updated_at: i64,
    pub last_run_at: Option<i64>,
}

pub fn save_planscript(conn: &Connection, script: &PlanScriptRow) -> rusqlite::Result<()> {
    conn.execute(
        "INSERT INTO planscripts (id, name, code, version, created_at, updated_at, last_run_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
         ON CONFLICT(id) DO UPDATE SET
           name = excluded.name,
           code = excluded.code,
           version = excluded.version,
           updated_at = excluded.updated_at",
        params![
            script.id,
            script.name,
            script.code,
            script.version,
            script.created_at,
            script.updated_at,
            script.last_run_at
        ],
    )?;
    Ok(())
}

pub fn delete_planscript(conn: &Connection, id: &str) -> rusqlite::Result<()> {
    conn.execute("DELETE FROM planscripts WHERE id = ?1", params![id])?;
    Ok(())
}

pub fn list_planscripts(conn: &Connection) -> rusqlite::Result<Vec<PlanScriptRow>> {
    let mut stmt = conn.prepare(
        "SELECT id, name, code, version, created_at, updated_at, last_run_at
         FROM planscripts ORDER BY updated_at DESC, created_at DESC",
    )?;
    let rows = stmt.query_map([], |row| {
        Ok(PlanScriptRow {
            id: row.get(0)?,
            name: row.get(1)?,
            code: row.get(2)?,
            version: row.get(3)?,
            created_at: row.get(4)?,
            updated_at: row.get(5)?,
            last_run_at: row.get(6)?,
        })
    })?;
    rows.collect()
}

pub fn mark_planscript_run(conn: &Connection, id: &str, ran_at: i64) -> rusqlite::Result<()> {
    conn.execute("UPDATE planscripts SET last_run_at = ?2 WHERE id = ?1", params![id, ran_at])?;
    Ok(())
}

pub fn apply_planscript_operations(conn: &mut Connection, operations: &[Value]) -> Result<(), String> {
    let tx = conn.transaction().map_err(|error| error.to_string())?;
    for (index, operation) in operations.iter().enumerate() {
        let invalid = |message: &str| format!("Операция PlanScript #{}: {}", index + 1, message);
        let kind = operation.get("type").and_then(Value::as_str).ok_or_else(|| invalid("не указан type"))?;
        match kind {
            "SetInterval" => {
                let date = operation.get("date").and_then(Value::as_str).ok_or_else(|| invalid("не указана date"))?;
                let start = operation.get("startMin").and_then(Value::as_i64).ok_or_else(|| invalid("не указан startMin"))?;
                let end = operation.get("endMin").and_then(Value::as_i64).ok_or_else(|| invalid("не указан endMin"))?;
                if start < 0 || start >= end || end > 1440 || start % 5 != 0 || end % 5 != 0 {
                    return Err(invalid("границы времени должны быть корректными, внутри суток и кратны 5 минутам"));
                }
                let patch = operation.get("patch").and_then(Value::as_object).cloned().ok_or_else(|| invalid("patch должен быть объектом"))?;
                set_interval_tx(&tx, date, start, end, &IntervalPatch(patch)).map_err(|error| invalid(&error.to_string()))?;
            }
            "ClearInterval" => {
                let date = operation.get("date").and_then(Value::as_str).ok_or_else(|| invalid("не указана date"))?;
                let start = operation.get("startMin").and_then(Value::as_i64).ok_or_else(|| invalid("не указан startMin"))?;
                let end = operation.get("endMin").and_then(Value::as_i64).ok_or_else(|| invalid("не указан endMin"))?;
                if start < 0 || start >= end || end > 1440 || start % 5 != 0 || end % 5 != 0 {
                    return Err(invalid("границы времени должны быть корректными, внутри суток и кратны 5 минутам"));
                }
                clear_interval_tx(&tx, date, start, end).map_err(|error| invalid(&error.to_string()))?;
            }
            "AddCategory" => {
                let category = operation.get("category").ok_or_else(|| invalid("не указана category"))?;
                let id = category.get("id").and_then(Value::as_str).ok_or_else(|| invalid("category.id не задан"))?;
                let name = category.get("name").and_then(Value::as_str).ok_or_else(|| invalid("category.name не задан"))?;
                let color = category.get("color").and_then(Value::as_str).unwrap_or("#3B5AA6");
                add_category(&tx, id, name, color, 0).map_err(|error| invalid(&error.to_string()))?;
            }
            "AddSubcategory" => {
                let sub = operation.get("subcategory").ok_or_else(|| invalid("не указана subcategory"))?;
                let id = sub.get("id").and_then(Value::as_str).ok_or_else(|| invalid("subcategory.id не задан"))?;
                let name = sub.get("name").and_then(Value::as_str).ok_or_else(|| invalid("subcategory.name не задан"))?;
                let category_id = operation.get("categoryId").and_then(Value::as_str).ok_or_else(|| invalid("не указан categoryId"))?;
                add_subcategory(&tx, id, category_id, name, 0).map_err(|error| invalid(&error.to_string()))?;
            }
            "AddTodo" => {
                let todo = operation.get("todo").ok_or_else(|| invalid("не указан todo"))?;
                let id = todo.get("id").and_then(Value::as_str).ok_or_else(|| invalid("todo.id не задан"))?;
                let text = todo.get("text").and_then(Value::as_str).ok_or_else(|| invalid("todo.text не задан"))?;
                let created_at = todo.get("createdAt").and_then(Value::as_i64).unwrap_or(0);
                add_todo(&tx, id, text, created_at).map_err(|error| invalid(&error.to_string()))?;
            }
            "SetAllDay" => {
                let event = operation.get("event").ok_or_else(|| invalid("не указан event"))?;
                let id = event.get("id").and_then(Value::as_str).ok_or_else(|| invalid("event.id не задан"))?;
                let text = event.get("text").and_then(Value::as_str).ok_or_else(|| invalid("event.text не задан"))?;
                let start = event.get("startDate").and_then(Value::as_str).ok_or_else(|| invalid("event.startDate не задан"))?;
                let end = event.get("endDate").and_then(Value::as_str).ok_or_else(|| invalid("event.endDate не задан"))?;
                let cat_id = event.get("catId").and_then(Value::as_str);
                let color = event.get("color").and_then(Value::as_str);
                let created_at = event.get("createdAt").and_then(Value::as_i64).unwrap_or(0);
                set_all_day(&tx, id, text, cat_id, color, start, end, created_at).map_err(|error| invalid(&error.to_string()))?;
            }
            "ClearAllDay" => {
                let id = operation.get("id").and_then(Value::as_str).ok_or_else(|| invalid("не указан id"))?;
                clear_all_day(&tx, id).map_err(|error| invalid(&error.to_string()))?;
            }
            "DeleteTodo" => {
                let id = operation.get("id").and_then(Value::as_str).ok_or_else(|| invalid("не указан id"))?;
                delete_todo(&tx, id).map_err(|error| invalid(&error.to_string()))?;
            }
            "DeleteCategory" => {
                let id = operation.get("id").and_then(Value::as_str).ok_or_else(|| invalid("не указан id"))?;
                delete_category(&tx, id).map_err(|error| invalid(&error.to_string()))?;
            }
            "DeleteSubcategory" => {
                let id = operation.get("id").and_then(Value::as_str).ok_or_else(|| invalid("не указан id"))?;
                delete_subcategory(&tx, id).map_err(|error| invalid(&error.to_string()))?;
            }
            "AddCreatedYear" => {
                let year = operation.get("year").and_then(Value::as_i64).ok_or_else(|| invalid("не указан year"))?;
                add_created_year(&tx, year).map_err(|error| invalid(&error.to_string()))?;
            }
            "DeleteCreatedYear" => {
                let year = operation.get("year").and_then(Value::as_i64).ok_or_else(|| invalid("не указан year"))?;
                delete_created_year(&tx, year).map_err(|error| invalid(&error.to_string()))?;
            }
            "RestoreWeek" => {
                let monday = operation.get("monday").and_then(Value::as_str).ok_or_else(|| invalid("не указан monday"))?;
                let days = operation.get("days").and_then(Value::as_array).ok_or_else(|| invalid("days должен быть массивом"))?;
                if days.len() != 7 { return Err(invalid("для RestoreWeek нужны ровно 7 дней")); }
                for (day_idx, day) in days.iter().enumerate() {
                    let date = monday_plus_days(monday, day_idx as i64);
                    tx.execute("DELETE FROM intervals WHERE date = ?1", params![date])
                        .map_err(|error| invalid(&error.to_string()))?;
                    let rows = day.as_array().ok_or_else(|| invalid("каждый день должен быть массивом интервалов"))?;
                    for row in rows {
                        let start = row.get("startMin").and_then(Value::as_i64).ok_or_else(|| invalid("интервал.startMin не задан"))?;
                        let end = row.get("endMin").and_then(Value::as_i64).ok_or_else(|| invalid("интервал.endMin не задан"))?;
                        let text = row.get("text").and_then(Value::as_str).unwrap_or("");
                        let color = row.get("color").and_then(Value::as_str).unwrap_or("");
                        let task = row.get("task").and_then(Value::as_str).unwrap_or("");
                        let description = row.get("description").and_then(Value::as_str).unwrap_or("");
                        let cat_id = row.get("catId").and_then(Value::as_str);
                        let sub_id = row.get("subId").and_then(Value::as_str);
                        let done = row.get("done").and_then(Value::as_bool).unwrap_or(false);
                        let moved = row.get("moved").and_then(Value::as_bool).unwrap_or(false);
                        tx.execute(
                            "INSERT INTO intervals (date, start_min, end_min, text, color, task, description, cat_id, sub_id, done, moved)
                             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11)",
                            params![date, start, end, text, color, task, description, cat_id, sub_id, done as i64, moved as i64],
                        ).map_err(|error| invalid(&error.to_string()))?;
                    }
                }
            }
            _ => return Err(invalid(&format!("неизвестный тип «{}»", kind))),
        }
    }
    tx.commit().map_err(|error| error.to_string())
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct PlanScriptWatcherRow {
    pub id: String,
    pub name: String,
    pub scope: String,
    pub code: String,
    pub enabled: bool,
    pub version: i64,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct WatchIndicatorRow {
    pub watcher_id: String,
    pub scope: String,
    pub owner_key: String,
    pub text: String,
    pub color: String,
}

pub fn save_planscript_watcher(conn: &Connection, watcher: &PlanScriptWatcherRow) -> rusqlite::Result<()> {
    let tx = conn.unchecked_transaction()?;
    tx.execute(
        "INSERT INTO planscript_watchers (id,name,scope,code,enabled,version,created_at,updated_at)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8)
         ON CONFLICT(id) DO UPDATE SET name=excluded.name,scope=excluded.scope,code=excluded.code,
           enabled=excluded.enabled,version=excluded.version,updated_at=excluded.updated_at",
        params![
            watcher.id, watcher.name, watcher.scope, watcher.code,
            watcher.enabled as i64, watcher.version, watcher.created_at, watcher.updated_at
        ],
    )?;
    tx.execute("DELETE FROM watch_indicators WHERE watcher_id=?1", [&watcher.id])?;
    tx.execute("DELETE FROM watch_dependencies WHERE watcher_id=?1", [&watcher.id])?;
    tx.commit()?;
    Ok(())
}

pub fn list_planscript_watchers(conn: &Connection) -> rusqlite::Result<Vec<PlanScriptWatcherRow>> {
    let mut stmt = conn.prepare(
        "SELECT id,name,scope,code,enabled,version,created_at,updated_at
         FROM planscript_watchers ORDER BY updated_at DESC,created_at DESC",
    )?;
    let rows = stmt.query_map([], |row| Ok(PlanScriptWatcherRow {
        id: row.get(0)?, name: row.get(1)?, scope: row.get(2)?, code: row.get(3)?, 
        enabled: row.get::<_, i64>(4)? != 0, version: row.get(5)?, created_at: row.get(6)?, updated_at: row.get(7)?,
    }))?;
    rows.collect()
}

pub fn delete_planscript_watcher(conn: &Connection, id: &str) -> rusqlite::Result<()> {
    conn.execute("DELETE FROM planscript_watchers WHERE id=?1", [id])?;
    Ok(())
}

pub fn list_watch_indicators(conn: &Connection, scope: &str, from: &str, to: &str) -> rusqlite::Result<Vec<WatchIndicatorRow>> {
    let mut stmt = conn.prepare(
        "SELECT watcher_id,scope,owner_key,text,color FROM watch_indicators
         WHERE scope=?1 AND owner_key BETWEEN ?2 AND ?3 ORDER BY owner_key,watcher_id",
    )?;
    let rows = stmt.query_map(params![scope, from, to], |row| Ok(WatchIndicatorRow {
        watcher_id: row.get(0)?, scope: row.get(1)?, owner_key: row.get(2)?, text: row.get(3)?, color: row.get(4)?,
    }))?;
    rows.collect()
}

pub fn list_affected_watch_instances(conn: &Connection, date: &str) -> rusqlite::Result<Vec<(String, String)>> {
    let mut stmt = conn.prepare(
        "SELECT DISTINCT d.scope,d.owner_key
         FROM watch_dependencies d
         JOIN planscript_watchers w ON w.id=d.watcher_id
         WHERE d.dependency_date=?1 AND w.enabled=1",
    )?;
    let rows = stmt.query_map([date], |row| Ok((row.get(0)?, row.get(1)?)))?;
    rows.collect()
}

pub fn save_watch_result(
    conn: &mut Connection,
    watcher_id: &str,
    scope: &str,
    owner_key: &str,
    indicator: Option<&Value>,
    dependencies: &[String],
) -> Result<(), String> {
    let tx = conn.transaction().map_err(|error| error.to_string())?;
    tx.execute(
        "DELETE FROM watch_dependencies WHERE watcher_id=?1 AND scope=?2 AND owner_key=?3",
        params![watcher_id, scope, owner_key],
    ).map_err(|error| error.to_string())?;
    {
        let mut stmt = tx.prepare(
            "INSERT INTO watch_dependencies (watcher_id,scope,owner_key,dependency_date) VALUES (?1,?2,?3,?4)",
        ).map_err(|error| error.to_string())?;
        for date in dependencies {
            stmt.execute(params![watcher_id, scope, owner_key, date]).map_err(|error| error.to_string())?;
        }
    }
    if let Some(value) = indicator {
        let text = value.get("text").and_then(Value::as_str).unwrap_or("");
        let color = value.get("color").and_then(Value::as_str).unwrap_or("");
        tx.execute(
            "INSERT INTO watch_indicators (watcher_id,scope,owner_key,text,color) VALUES (?1,?2,?3,?4,?5)
             ON CONFLICT(watcher_id,scope,owner_key) DO UPDATE SET text=excluded.text,color=excluded.color",
            params![watcher_id, scope, owner_key, text, color],
        ).map_err(|error| error.to_string())?;
    } else {
        tx.execute(
            "DELETE FROM watch_indicators WHERE watcher_id=?1 AND scope=?2 AND owner_key=?3",
            params![watcher_id, scope, owner_key],
        ).map_err(|error| error.to_string())?;
    }
    tx.commit().map_err(|error| error.to_string())
}

// ============================================================================
// Повторяющиеся события - CRUD самих правил (bulk-применение см.
// apply_recurring_rule выше).
// ============================================================================
pub struct RecurringRuleRow {
    pub id: String, pub name: String, pub day_idx: i64, pub start_min: i64, pub duration_min: i64,
    pub cat_id: Option<String>, pub sub_id: Option<String>, pub color: Option<String>, pub task: Option<String>,
    pub pattern_type: String, pub custom_ranges: String, pub anchor_monday: String, pub weeks_count: i64,
    pub conflict_mode: String,
}

pub fn add_recurring_rule(conn: &Connection, r: &RecurringRuleRow, created_at: i64) -> rusqlite::Result<()> {
    conn.execute(
        "INSERT INTO recurring_rules (id, name, day_idx, start_min, duration_min, cat_id, sub_id, color, task, pattern_type, custom_ranges, anchor_date, weeks_count, created_at, conflict_mode)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15)",
        params![r.id, r.name, r.day_idx, r.start_min, r.duration_min, r.cat_id, r.sub_id, r.color, r.task, r.pattern_type, r.custom_ranges, r.anchor_monday, r.weeks_count, created_at, r.conflict_mode],
    )?;
    Ok(())
}
pub fn delete_recurring_rule(conn: &Connection, id: &str) -> rusqlite::Result<()> {
    conn.execute("DELETE FROM recurring_rules WHERE id = ?1", params![id])?;
    Ok(())
}
pub fn list_recurring_rules(conn: &Connection) -> rusqlite::Result<Vec<RecurringRuleRow>> {
    let mut stmt = conn.prepare(
        "SELECT id, name, day_idx, start_min, duration_min, cat_id, sub_id, color, task, pattern_type, custom_ranges, anchor_date, weeks_count, conflict_mode FROM recurring_rules ORDER BY created_at",
    )?;
    let rows = stmt.query_map([], |row| Ok(RecurringRuleRow {
        id: row.get(0)?, name: row.get(1)?, day_idx: row.get(2)?, start_min: row.get(3)?, duration_min: row.get(4)?,
        cat_id: row.get(5)?, sub_id: row.get(6)?, color: row.get(7)?, task: row.get(8)?,
        pattern_type: row.get(9)?, custom_ranges: row.get(10)?, anchor_monday: row.get(11)?, weeks_count: row.get(12)?,
        conflict_mode: row.get(13)?,
    }))?;
    rows.collect()
}

// ============================================================================
// Дневные рефлексии - блокнотик на день (не на клетку) + выгрузка за год.
// ============================================================================
pub fn set_reflection(conn: &Connection, date: &str, text: &str, updated_at: i64) -> rusqlite::Result<()> {
    if text.trim().is_empty() {
        // Пустая рефлексия - как и с интервалами (is_empty_content), не
        // держим пустой ряд в базе, удаляем, если он был.
        conn.execute("DELETE FROM reflections WHERE date = ?1", params![date])?;
    } else {
        conn.execute(
            "INSERT INTO reflections (date, text, updated_at) VALUES (?1, ?2, ?3)
             ON CONFLICT(date) DO UPDATE SET text = excluded.text, updated_at = excluded.updated_at",
            params![date, text, updated_at],
        )?;
    }
    Ok(())
}

pub fn get_reflection(conn: &Connection, date: &str) -> rusqlite::Result<Option<String>> {
    conn.query_row("SELECT text FROM reflections WHERE date = ?1", params![date], |row| row.get(0))
        .optional()
}

pub struct ReflectionRow { pub date: String, pub text: String }

/// Все рефлексии в диапазоне [from, to], отсортированы по дате - основа
/// для выгрузки "рефлексия за год одним документом".
pub fn list_reflections(conn: &Connection, from: &str, to: &str) -> rusqlite::Result<Vec<ReflectionRow>> {
    let mut stmt = conn.prepare("SELECT date, text FROM reflections WHERE date BETWEEN ?1 AND ?2 ORDER BY date")?;
    let rows = stmt.query_map(params![from, to], |row| Ok(ReflectionRow { date: row.get(0)?, text: row.get(1)? }))?;
    rows.collect()
}

/// Собирает все рефлексии года в один Markdown-документ - по одному
/// заголовку "## YYYY-MM-DD" на день, текст под ним как есть.
pub fn export_reflections_markdown(conn: &Connection, year: i64) -> rusqlite::Result<String> {
    let from = format!("{year:04}-01-01");
    let to = format!("{year:04}-12-31");
    let rows = list_reflections(conn, &from, &to)?;
    let mut out = format!("# Рефлексии за {year} год\n\n");
    for r in &rows {
        out.push_str(&format!("## {}\n\n{}\n\n", r.date, r.text.trim()));
    }
    Ok(out)
}

// ============================================================================
// Шаблоны недели/дня - массовое применение к нескольким целям ОДНОЙ
// транзакцией (TemplatesPanel.jsx). day_idx имеет смысл только для недельных
// шаблонов (0=Пн..6=Вс) - для дневных шаблонов игнорируется.
// ============================================================================
pub struct TemplateInterval {
    pub day_idx: i64,
    pub start_min: i64,
    pub end_min: i64,
    pub patch: IntervalPatch,
}

#[derive(Clone, Copy, PartialEq, Debug)]
pub enum ApplyMode {
    /// "Заменить всё" - весь диапазон дня (day_start..day_end) сначала
    /// очищается, потом пишется шаблон.
    Overwrite,
    /// "Только в пустые" - шаблон дописывается только туда, где сейчас
    /// вообще ничего нет; занятое не трогается.
    KeepExisting,
    /// "Шаблон поверх" - каждый интервал шаблона перезаписывает ровно свой
    /// диапазон (как обычный SetInterval); всё, что вне интервалов шаблона,
    /// не трогается вообще.
    TemplateWins,
    /// Ask the caller to choose for each overlapping template interval.
    InteractivePerCell,
}

/// Применяет недельный шаблон к списку недель (даты понедельников) одной
/// транзакцией - либо применилось всё, либо (при ошибке) ничего.
pub fn apply_week_template(
    conn: &mut Connection,
    template: &[TemplateInterval],
    target_mondays: &[String],
    mode: ApplyMode,
    day_start: i64,
    day_end: i64,
) -> rusqlite::Result<()> {
    apply_week_template_with_exceptions(conn, template, target_mondays, mode, day_start, day_end, &[])
}

pub fn apply_week_template_with_exceptions(
    conn: &mut Connection,
    template: &[TemplateInterval],
    target_mondays: &[String],
    mode: ApplyMode,
    day_start: i64,
    day_end: i64,
    exceptions: &[String],
) -> rusqlite::Result<()> {
    apply_week_template_with_options(conn, template, target_mondays, mode, day_start, day_end, exceptions, &[])
}

pub struct TemplateConflictDecision {
    pub date: String,
    pub start_min: i64,
    pub end_min: i64,
    pub overwrite: bool,
}

pub fn apply_week_template_with_options(
    conn: &mut Connection,
    template: &[TemplateInterval],
    target_mondays: &[String],
    mode: ApplyMode,
    day_start: i64,
    day_end: i64,
    exceptions: &[String],
    decisions: &[TemplateConflictDecision],
) -> rusqlite::Result<()> {
    let tx = conn.transaction()?;
    for monday in target_mondays {
        if mode == ApplyMode::Overwrite {
            for day_idx in 0..7 {
                let date = monday_plus_days(monday, day_idx);
                if exceptions.iter().any(|exception| exception == &date) { continue; }
                clear_interval_tx(&tx, &date, day_start, day_end)?;
            }
        }
        for item in template {
            let date = monday_plus_days(monday, item.day_idx);
            if exceptions.iter().any(|exception| exception == &date) { continue; }
            match mode {
                ApplyMode::KeepExisting => fill_empty_gaps_tx(&tx, &date, item.start_min, item.end_min, &item.patch)?,
                ApplyMode::Overwrite | ApplyMode::TemplateWins => set_interval_tx(&tx, &date, item.start_min, item.end_min, &item.patch)?,
                ApplyMode::InteractivePerCell => {
                    let has_conflict = get_day_intervals(&tx, &date)?.iter()
                        .any(|interval| interval.start_min < item.end_min && interval.end_min > item.start_min);
                    let overwrite = decisions.iter().find(|decision|
                        decision.date == date && decision.start_min == item.start_min && decision.end_min == item.end_min
                    ).map(|decision| decision.overwrite);
                    if !has_conflict || overwrite == Some(true) {
                        set_interval_tx(&tx, &date, item.start_min, item.end_min, &item.patch)?;
                    }
                }
            }
        }
    }
    tx.commit()
}

/// То же самое для дневного шаблона - применяется к конкретным датам
/// (не к неделям), day_idx у TemplateInterval игнорируется.
pub fn apply_day_template(
    conn: &mut Connection,
    template: &[TemplateInterval],
    target_dates: &[String],
    mode: ApplyMode,
    day_start: i64,
    day_end: i64,
) -> rusqlite::Result<()> {
    apply_day_template_with_options(conn, template, target_dates, mode, day_start, day_end, &[])
}

pub fn apply_day_template_with_options(
    conn: &mut Connection,
    template: &[TemplateInterval],
    target_dates: &[String],
    mode: ApplyMode,
    day_start: i64,
    day_end: i64,
    decisions: &[TemplateConflictDecision],
) -> rusqlite::Result<()> {
    let tx = conn.transaction()?;
    for date in target_dates {
        if mode == ApplyMode::Overwrite {
            clear_interval_tx(&tx, date, day_start, day_end)?;
        }
        for item in template {
            match mode {
                ApplyMode::KeepExisting => fill_empty_gaps_tx(&tx, date, item.start_min, item.end_min, &item.patch)?,
                ApplyMode::Overwrite | ApplyMode::TemplateWins => set_interval_tx(&tx, date, item.start_min, item.end_min, &item.patch)?,
                ApplyMode::InteractivePerCell => {
                    let has_conflict = get_day_intervals(&tx, date)?.iter()
                        .any(|interval| interval.start_min < item.end_min && interval.end_min > item.start_min);
                    let overwrite = decisions.iter().find(|decision|
                        decision.date == *date && decision.start_min == item.start_min && decision.end_min == item.end_min
                    ).map(|decision| decision.overwrite);
                    if !has_conflict || overwrite == Some(true) {
                        set_interval_tx(&tx, date, item.start_min, item.end_min, &item.patch)?;
                    }
                }
            }
        }
    }
    tx.commit()
}

// ============================================================================
// Повторяющиеся события (RecurringPanel.jsx) - разметка сразу на много
// недель вперёд по шаблону недель (все/чётные/нечётные/свои диапазоны),
// одной транзакцией. Портированы parseWeekRanges/weekNumberFrom из utils.js.
// ============================================================================

/// Разбор строки вида "2-17" / "1-2,5-17" / "3" в множество номеров недель -
/// см. utils.js: parseWeekRanges (конструктор повторов, "свои недели").
pub fn parse_week_ranges(spec: &str) -> std::collections::BTreeSet<i64> {
    let mut weeks = std::collections::BTreeSet::new();
    for part in spec.split(',') {
        let p = part.trim();
        if p.is_empty() { continue; }
        if let Some((a_str, b_str)) = p.split_once('-') {
            if let (Ok(a), Ok(b)) = (a_str.trim().parse::<i64>(), b_str.trim().parse::<i64>()) {
                let (lo, hi) = if a <= b { (a, b) } else { (b, a) };
                for w in lo..=hi { weeks.insert(w); }
            }
        } else if let Ok(n) = p.parse::<i64>() {
            weeks.insert(n);
        }
    }
    weeks
}

/// Номер недели относительно понедельника-якоря, считая саму эту неделю
/// первой (1) - см. utils.js: weekNumberFrom.
pub fn week_number_from(anchor_monday: &str, target_monday: &str) -> rusqlite::Result<i64> {
    use chrono::NaiveDate;
    let a = NaiveDate::parse_from_str(anchor_monday, "%Y-%m-%d").expect("некорректная дата anchor_monday");
    let t = NaiveDate::parse_from_str(target_monday, "%Y-%m-%d").expect("некорректная дата target_monday");
    let days = (t - a).num_days();
    Ok((days as f64 / 7.0).round() as i64 + 1)
}

pub struct RecurringRuleSpec {
    pub day_idx: i64,
    pub start_min: i64,
    pub duration_min: i64,
    pub patch: IntervalPatch,     // должен уже включать text=название правила - см. заголовок блока в комментарии ниже
    pub pattern_type: String,      // "all" | "even" | "odd" | "custom"
    pub custom_ranges: String,
    pub anchor_monday: String,
    pub weeks_count: i64,
    pub conflict_mode: ApplyMode,
    pub decisions: Vec<TemplateConflictDecision>,
}

/// В НОВОЙ (реляционной) модели "первая клетка блока - заголовок, остальное
/// просто закрашено" из старого комментария RecurringPanel.jsx больше не
/// требует отдельной логики: это был приём отображения для старой поквантовой
/// модели (WeekGrid.jsx подавлял повтор текста на клетках-продолжениях), а
/// теперь одно повторение = один ряд в intervals с одним start_min/end_min -
/// подавлять повтор не для чего, весь блок и так один ряд с одним текстом.
///
/// Возвращает число недель, подошедших под шаблон повторения.
pub fn apply_recurring_rule(conn: &mut Connection, rule: &RecurringRuleSpec) -> rusqlite::Result<usize> {
    let tx = conn.transaction()?;
    let mut applied = 0usize;

    for offset in 0..rule.weeks_count {
        use chrono::NaiveDate;
        let anchor = NaiveDate::parse_from_str(&rule.anchor_monday, "%Y-%m-%d").expect("некорректная anchor_monday");
        let target_monday_date = anchor + chrono::Duration::weeks(offset);
        let target_monday = target_monday_date.format("%Y-%m-%d").to_string();

        let week_num = week_number_from(&rule.anchor_monday, &target_monday)?;
        let matches = match rule.pattern_type.as_str() {
            "all" => true,
            "even" => week_num % 2 == 0,
            "odd" => week_num % 2 != 0,
            "custom" => parse_week_ranges(&rule.custom_ranges).contains(&week_num),
            _ => false,
        };
        if !matches { continue; }

        let date = monday_plus_days(&target_monday, rule.day_idx);
        let end_min = rule.start_min + rule.duration_min;
        match rule.conflict_mode {
            ApplyMode::KeepExisting => fill_empty_gaps_tx(&tx, &date, rule.start_min, end_min, &rule.patch)?,
            ApplyMode::Overwrite | ApplyMode::TemplateWins => set_interval_tx(&tx, &date, rule.start_min, end_min, &rule.patch)?,
            ApplyMode::InteractivePerCell => {
                let has_conflict = get_day_intervals(&tx, &date)?.iter()
                    .any(|interval| interval.start_min < end_min && interval.end_min > rule.start_min);
                let overwrite = rule.decisions.iter().find(|decision|
                    decision.date == date && decision.start_min == rule.start_min && decision.end_min == end_min
                ).map(|decision| decision.overwrite);
                if !has_conflict || overwrite == Some(true) {
                    set_interval_tx(&tx, &date, rule.start_min, end_min, &rule.patch)?;
                }
            }
        }
        applied += 1;
    }

    tx.commit()?;
    Ok(applied)
}

// ============================================================================
// Миграция старого data.json (Python/pywebview) в новую схему.
// Формат старого файла (см. app.pyw/storage.js): {"key": "<JSON-строка>", ...}
// - двойное кодирование, значения САМИ являются JSON-строками.
// ============================================================================
#[derive(Debug, Deserialize)]
struct OldCellValue {
    #[serde(default)]
    text: String,
    #[serde(default)]
    color: String,
    #[serde(default)]
    task: String,
    #[serde(default)]
    description: String,
    #[serde(rename = "catId", default)]
    cat_id: Option<String>,
    #[serde(rename = "subId", default)]
    sub_id: Option<String>,
    #[serde(default)]
    done: bool,
    #[serde(default)]
    moved: bool,
}

#[derive(Debug, Deserialize)]
struct OldWeekData {
    cells: BTreeMap<String, Value>, // day_idx (as string) -> либо runs [[start,end,val]], либо плоский словарь (старее формата)
}

fn monday_plus_days(monday_iso: &str, day_idx: i64) -> String {
    use chrono::NaiveDate;
    let d = NaiveDate::parse_from_str(monday_iso, "%Y-%m-%d").expect("некорректная дата в ключе week:*");
    let d2 = d + chrono::Duration::days(day_idx);
    d2.format("%Y-%m-%d").to_string()
}

pub struct MigrationReport {
    pub weeks_migrated: usize,
    pub intervals_inserted: usize,
    pub categories_migrated: usize,
    pub todos_migrated: usize,
}

pub fn migrate_from_old_json(conn: &mut Connection, old_data: &BTreeMap<String, String>) -> anyhow::Result<MigrationReport> {
    let tx = conn.transaction()?;
    let mut report = MigrationReport { weeks_migrated: 0, intervals_inserted: 0, categories_migrated: 0, todos_migrated: 0 };

    // --- categories ---
    if let Some(raw) = old_data.get("categories") {
        #[derive(Deserialize)]
        struct OldSub { id: String, name: String, #[serde(default)] description: String }
        #[derive(Deserialize)]
        struct OldCat { id: String, name: String, color: String, #[serde(default)] subs: Vec<OldSub> }
        let cats: Vec<OldCat> = serde_json::from_str(raw)?;
        for (i, c) in cats.iter().enumerate() {
            tx.execute(
                "INSERT INTO categories (id, name, color, sort_order) VALUES (?1,?2,?3,?4)",
                params![c.id, c.name, c.color, i as i64],
            )?;
            for (j, s) in c.subs.iter().enumerate() {
                tx.execute(
                    "INSERT INTO subcategories (id, category_id, name, description, sort_order) VALUES (?1,?2,?3,?4,?5)",
                    params![s.id, c.id, s.name, s.description, j as i64],
                )?;
            }
            report.categories_migrated += 1;
        }
    }

    // --- todos ---
    if let Some(raw) = old_data.get("todos") {
        #[derive(Deserialize)]
        struct OldTodo { id: String, text: String, #[serde(default)] done: bool, #[serde(rename = "createdAt", default)] created_at: i64 }
        let todos: Vec<OldTodo> = serde_json::from_str(raw)?;
        for (i, t) in todos.iter().enumerate() {
            tx.execute(
                "INSERT INTO todos (id, text, done, created_at, sort_order) VALUES (?1,?2,?3,?4,?5)",
                params![t.id, t.text, t.done as i64, t.created_at, i as i64],
            )?;
            report.todos_migrated += 1;
        }
    }

    // --- settings ---
    if let Some(raw) = old_data.get("settings") {
        #[derive(Deserialize, Default)]
        struct OldSettings {
            #[serde(rename = "dayStart", default = "default_day_start")] day_start: i64,
            #[serde(rename = "dayEnd", default = "default_day_end")] day_end: i64,
            #[serde(rename = "cellMin", default = "default_cell_min")] cell_min: i64,
            #[serde(default = "default_zoom")] zoom: f64,
            #[serde(default = "default_theme")] theme: String,
            #[serde(rename = "notificationsEnabled", default)] notifications_enabled: bool,
            #[serde(rename = "notifyLeadMin", default = "default_lead")] notify_lead_min: i64,
        }
        fn default_day_start() -> i64 { 360 }
        fn default_day_end() -> i64 { 1440 }
        fn default_cell_min() -> i64 { 30 }
        fn default_zoom() -> f64 { 1.0 }
        fn default_theme() -> String { "calm".into() }
        fn default_lead() -> i64 { 10 }
        let s: OldSettings = serde_json::from_str(raw).unwrap_or_default();
        let last_notify: Option<String> = old_data.get("lastAllDayNotifyDate").and_then(|r| serde_json::from_str(r).ok());
        tx.execute(
            "INSERT INTO settings (id, day_start, day_end, cell_min, zoom, theme, notifications_enabled, notify_lead_min, last_all_day_notify_date)
             VALUES (1, ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
             ON CONFLICT(id) DO UPDATE SET
                day_start = excluded.day_start,
                day_end = excluded.day_end,
                cell_min = excluded.cell_min,
                zoom = excluded.zoom,
                theme = excluded.theme,
                notifications_enabled = excluded.notifications_enabled,
                notify_lead_min = excluded.notify_lead_min,
                last_all_day_notify_date = excluded.last_all_day_notify_date",
            params![s.day_start, s.day_end, s.cell_min, s.zoom, s.theme, s.notifications_enabled as i64, s.notify_lead_min, last_notify],
        )?;
    }

    // --- years (createdYears) ---
    if let Some(raw) = old_data.get("years") {
        let years: Vec<i64> = serde_json::from_str(raw)?;
        for y in years { add_created_year(&tx, y)?; }
    }

    // --- weekNumbers (weekNumberLabels) ---
    if let Some(raw) = old_data.get("weekNumbers") {
        let labels: std::collections::BTreeMap<String, String> = serde_json::from_str(raw)?;
        for (monday, label) in labels {
            if label.trim().is_empty() { continue; }
            tx.execute(
                "INSERT INTO week_meta (monday_date, order_label) VALUES (?1, ?2)",
                params![monday, label],
            )?;
        }
    }

    // --- weeks: week:YYYY-MM-DD -> intervals ---
    for (key, raw) in old_data.iter() {
        let Some(monday_iso) = key.strip_prefix("week:") else { continue };
        let week: OldWeekData = serde_json::from_str(raw)?;
        for (day_idx_str, day_value) in week.cells.iter() {
            let day_idx: i64 = day_idx_str.parse().unwrap_or(0);
            let date = monday_plus_days(monday_iso, day_idx);

            // Компактный формат (уже после compactCells): массив [start,end,val].
            if let Value::Array(runs) = day_value {
                for run in runs {
                    let Value::Array(triple) = run else { continue };
                    if triple.len() != 3 { continue }
                    let start = triple[0].as_i64().unwrap_or(0);
                    let end = triple[1].as_i64().unwrap_or(0);
                    let v: OldCellValue = serde_json::from_value(triple[2].clone())?;
                    let is_empty = v.text.is_empty() && v.color.is_empty() && v.task.is_empty() && !v.done && !v.moved;
                    if is_empty { continue }
                    tx.execute(
                        "INSERT OR IGNORE INTO intervals (date, start_min, end_min, text, color, task, description, cat_id, sub_id, done, moved)
                         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11)",
                        params![date, start, end, v.text, v.color, v.task, v.description, v.cat_id, v.sub_id, v.done as i64, v.moved as i64],
                    )?;
                    report.intervals_inserted += 1;
                }
            }
        }
        report.weeks_migrated += 1;
    }

    tx.commit()?;
    Ok(report)
}
