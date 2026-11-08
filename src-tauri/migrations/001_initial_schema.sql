-- ============================================================================
-- Схема хранения "Ежедневника" (Этап 2: миграция Python+JSON -> Rust+SQLite)
--
-- Спроектирована по двум источникам одновременно:
--   1. Текущая модель данных приложения (cellData.js, Planner.jsx) -
--      что реально хранится и как.
--   2. Требования будущего PlanScript (PlanScript-spec.md) к запросам:
--      find(range, category=, subcategory=, text_contains=, done=, empty=),
--      stats.hours(category, range), Day.free_slots(min_duration=) -
--      всё это должно ложиться на прямые SQL-запросы с индексами, а не на
--      построчное сканирование JSON-блоков в JS, как раньше.
--
-- Ключевое архитектурное решение: таблица `intervals` хранит РОВНО ТЕ ЖЕ
-- "прогоны" (runs), что раньше жили в JSON после compactCells() - один ряд
-- в БД на один непрерывный закрашенный блок. Это не новая модель данных,
-- а перекладка уже существующей RLE-компрессии в строки таблицы. Полностью
-- пустое время по-прежнему не хранится вообще (как раньше delete у ключа
-- в cellData.js) - в этом смысле поведение идентично.
-- ============================================================================

PRAGMA foreign_keys = ON;

-- ---------------------------------------------------------------------------
-- Категории и подкатегории (CategoryPanel.jsx, constants.js DEFAULT_CATEGORIES)
-- ---------------------------------------------------------------------------
CREATE TABLE categories (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL UNIQUE,
    color       TEXT NOT NULL,
    sort_order  INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE subcategories (
    id           TEXT PRIMARY KEY,
    category_id  TEXT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    name         TEXT NOT NULL,
    description  TEXT NOT NULL DEFAULT '',  -- see CategoryPanel.jsx sub.description
    sort_order   INTEGER NOT NULL DEFAULT 0,
    UNIQUE(category_id, name)
);

-- ---------------------------------------------------------------------------
-- Ядро: закрашенные интервалы времени (замена week:* блоков из cellData.js).
-- Один ряд = один непрерывный "прогон" одинаковой заливки (то, что раньше
-- получалось после compactCells()). Дата - абсолютная (не iso-понедельник +
-- day_idx), потому что PlanScript оперирует Day.date напрямую (см. §4.2), и
-- диапазонные запросы (find, stats.hours, free_slots) по абсолютной дате
-- пишутся как обычный BETWEEN, без пересчёта понедельник+смещение.
-- ---------------------------------------------------------------------------
CREATE TABLE intervals (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    date         TEXT NOT NULL,             -- ISO 'YYYY-MM-DD'
    start_min    INTEGER NOT NULL,          -- минут от полуночи, кратно 5 (BASE_UNIT)
    end_min      INTEGER NOT NULL,          -- исключительная граница (как end в compactCells)
    text         TEXT NOT NULL DEFAULT '',
    color        TEXT NOT NULL DEFAULT '',
    task         TEXT NOT NULL DEFAULT '',
    description  TEXT NOT NULL DEFAULT '',  -- Cell.jsx value.description (popover с описанием дела)
    cat_id       TEXT REFERENCES categories(id) ON DELETE SET NULL,
    sub_id       TEXT REFERENCES subcategories(id) ON DELETE SET NULL,
    done         INTEGER NOT NULL DEFAULT 0 CHECK (done IN (0,1)),
    moved        INTEGER NOT NULL DEFAULT 0 CHECK (moved IN (0,1)), -- см. cellData.js: перенос мышью, для трекера
    CHECK (end_min > start_min),
    CHECK (start_min % 5 = 0 AND end_min % 5 = 0)
);

-- Один и тот же диапазон времени в один день не может начинаться дважды -
-- защищает от дублей при повторном апсерте того же прогона.
CREATE UNIQUE INDEX idx_intervals_date_start ON intervals(date, start_min);
-- Главный путь чтения: "дай мне все интервалы этого дня" (рендер сетки).
CREATE INDEX idx_intervals_date ON intervals(date);
-- Для find(category=...) и stats.hours(category, range).
CREATE INDEX idx_intervals_cat_date ON intervals(cat_id, date);
-- Для find(text_contains=...) - см. также FTS5-таблицу ниже, этот индекс
-- нужен для простых точных/префиксных случаев без полнотекстового поиска.
CREATE INDEX idx_intervals_date_done ON intervals(date, done);

-- ---------------------------------------------------------------------------
-- Полнотекстовый поиск по тексту/задаче интервалов - find(text_contains=...)
-- через LIKE '%...%' на большом объёме лет неудобен (полное сканирование);
-- FTS5 с триггерами синхронизации даёт нормальный поиск по подстроке/слову.
-- ---------------------------------------------------------------------------
CREATE VIRTUAL TABLE intervals_fts USING fts5(
    text, task, description,
    content='intervals', content_rowid='id'
);

CREATE TRIGGER intervals_ai AFTER INSERT ON intervals BEGIN
    INSERT INTO intervals_fts(rowid, text, task, description)
    VALUES (new.id, new.text, new.task, new.description);
END;
CREATE TRIGGER intervals_ad AFTER DELETE ON intervals BEGIN
    INSERT INTO intervals_fts(intervals_fts, rowid, text, task, description)
    VALUES ('delete', old.id, old.text, old.task, old.description);
END;
CREATE TRIGGER intervals_au AFTER UPDATE ON intervals BEGIN
    INSERT INTO intervals_fts(intervals_fts, rowid, text, task, description)
    VALUES ('delete', old.id, old.text, old.task, old.description);
    INSERT INTO intervals_fts(rowid, text, task, description)
    VALUES (new.id, new.text, new.task, new.description);
END;

-- ---------------------------------------------------------------------------
-- "Весь день / несколько дней" (AllDayEvents.jsx)
-- ---------------------------------------------------------------------------
CREATE TABLE all_day_events (
    id          TEXT PRIMARY KEY,
    text        TEXT NOT NULL,
    cat_id      TEXT REFERENCES categories(id) ON DELETE SET NULL,
    color       TEXT,
    start_date  TEXT NOT NULL,
    end_date    TEXT NOT NULL,
    created_at  INTEGER NOT NULL
);
CREATE INDEX idx_allday_range ON all_day_events(start_date, end_date);

-- ---------------------------------------------------------------------------
-- Дела без времени (TodoPanel.jsx)
-- ---------------------------------------------------------------------------
CREATE TABLE todos (
    id          TEXT PRIMARY KEY,
    text        TEXT NOT NULL,
    done        INTEGER NOT NULL DEFAULT 0 CHECK (done IN (0,1)),
    created_at  INTEGER NOT NULL,
    sort_order  INTEGER NOT NULL DEFAULT 0
);

-- ---------------------------------------------------------------------------
-- Шаблоны (TemplatesPanel.jsx) - применяются ЦЕЛИКОМ через apply_to() в
-- PlanScript (§4.6), find()/stats() их не разбирают построчно - поэтому
-- содержимое остаётся JSON-блоком, реляционизировать нет смысла.
-- ---------------------------------------------------------------------------
CREATE TABLE templates (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    type        TEXT NOT NULL CHECK (type IN ('week','day')),
    data        TEXT NOT NULL,  -- JSON: содержимое клеток шаблона as-is
    created_at  INTEGER NOT NULL
);

-- ---------------------------------------------------------------------------
-- Повторяющиеся события (RecurringPanel.jsx) - сами правила; фактические
-- закрашенные клетки, которые они порождают, живут как обычные intervals.
-- ---------------------------------------------------------------------------
CREATE TABLE recurring_rules (
    id             TEXT PRIMARY KEY,
    name           TEXT NOT NULL,
    day_idx        INTEGER NOT NULL,       -- 0=Пн..6=Вс
    start_min      INTEGER NOT NULL,
    duration_min   INTEGER NOT NULL,
    cat_id         TEXT REFERENCES categories(id) ON DELETE SET NULL,
    sub_id         TEXT REFERENCES subcategories(id) ON DELETE SET NULL,
    color          TEXT,
    task           TEXT,
    pattern_type   TEXT NOT NULL,          -- 'all' | 'even' | 'odd' | 'custom'
    custom_ranges  TEXT,
    anchor_date    TEXT NOT NULL,          -- ISO понедельник-якорь
    weeks_count    INTEGER NOT NULL,
    created_at     INTEGER NOT NULL
);

-- ---------------------------------------------------------------------------
-- Метаданные недели, не привязанные к клеткам - сейчас только "номер недели
-- на плитке" (WeekTiles.jsx weekNumberLabels), см. PlanScript Week.order.
-- ---------------------------------------------------------------------------
CREATE TABLE week_meta (
    monday_date  TEXT PRIMARY KEY,
    order_label  TEXT
);

-- ---------------------------------------------------------------------------
-- Настройки - единственная строка (day_start/day_end/cell_min/zoom и т.п.)
-- ---------------------------------------------------------------------------
CREATE TABLE settings (
    id                     INTEGER PRIMARY KEY CHECK (id = 1),
    day_start              INTEGER NOT NULL DEFAULT 360,
    day_end                INTEGER NOT NULL DEFAULT 1440,
    cell_min               INTEGER NOT NULL DEFAULT 30,
    zoom                   REAL NOT NULL DEFAULT 1.0,
    theme                  TEXT NOT NULL DEFAULT 'calm',
    notifications_enabled  INTEGER NOT NULL DEFAULT 0 CHECK (notifications_enabled IN (0,1)),
    notify_lead_min        INTEGER NOT NULL DEFAULT 10
);

-- ---------------------------------------------------------------------------
-- Хранилище скриптов и наблюдателей добавлено отдельными миграциями
-- 004_planscript.sql и 005_watchers.sql; здесь сохраняется исходная схема.
-- ---------------------------------------------------------------------------
