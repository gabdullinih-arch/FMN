BEGIN IMMEDIATE;

CREATE TABLE intervals_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    start_min INTEGER NOT NULL,
    end_min INTEGER NOT NULL,
    text TEXT NOT NULL DEFAULT '',
    color TEXT NOT NULL DEFAULT '',
    task TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    cat_id TEXT REFERENCES categories(id) ON DELETE SET NULL,
    sub_id TEXT REFERENCES subcategories(id) ON DELETE SET NULL,
    done INTEGER NOT NULL DEFAULT 0 CHECK (done IN (0,1)),
    moved INTEGER NOT NULL DEFAULT 0 CHECK (moved IN (0,1)),
    CHECK (end_min > start_min)
);

INSERT INTO intervals_new
    (id, date, start_min, end_min, text, color, task, description, cat_id, sub_id, done, moved)
SELECT id, date, start_min, end_min, text, color, task, description, cat_id, sub_id, done, moved
FROM intervals;

DROP TRIGGER IF EXISTS intervals_ai;
DROP TRIGGER IF EXISTS intervals_ad;
DROP TRIGGER IF EXISTS intervals_au;
DROP TABLE intervals;
ALTER TABLE intervals_new RENAME TO intervals;

CREATE UNIQUE INDEX idx_intervals_date_start ON intervals(date, start_min);
CREATE INDEX idx_intervals_date ON intervals(date);
CREATE INDEX idx_intervals_cat_date ON intervals(cat_id, date);
CREATE INDEX idx_intervals_date_done ON intervals(date, done);

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
INSERT INTO intervals_fts(intervals_fts) VALUES ('rebuild');

CREATE TABLE week_custom_times_new (
    monday_date TEXT NOT NULL,
    time_min INTEGER NOT NULL CHECK (time_min BETWEEN 0 AND 1439),
    PRIMARY KEY (monday_date, time_min)
);
INSERT INTO week_custom_times_new (monday_date, time_min)
SELECT monday_date, time_min FROM week_custom_times;
DROP TABLE week_custom_times;
ALTER TABLE week_custom_times_new RENAME TO week_custom_times;

COMMIT;
