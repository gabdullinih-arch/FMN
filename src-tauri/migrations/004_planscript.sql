CREATE TABLE planscripts (
    id           TEXT PRIMARY KEY,
    name         TEXT NOT NULL,
    code         TEXT NOT NULL,
    version      INTEGER NOT NULL DEFAULT 1,
    created_at   INTEGER NOT NULL,
    updated_at   INTEGER NOT NULL,
    last_run_at  INTEGER
);

CREATE INDEX idx_planscripts_updated ON planscripts(updated_at);
