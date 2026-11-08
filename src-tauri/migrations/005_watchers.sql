CREATE TABLE planscript_watchers (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    scope       TEXT NOT NULL CHECK (scope IN ('day', 'week')),
    code        TEXT NOT NULL,
    enabled     INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0,1)),
    version     INTEGER NOT NULL DEFAULT 1,
    created_at  INTEGER NOT NULL,
    updated_at  INTEGER NOT NULL
);

CREATE TABLE watch_indicators (
    watcher_id  TEXT NOT NULL REFERENCES planscript_watchers(id) ON DELETE CASCADE,
    scope       TEXT NOT NULL CHECK (scope IN ('day', 'week')),
    owner_key   TEXT NOT NULL,
    text        TEXT NOT NULL DEFAULT '',
    color       TEXT NOT NULL DEFAULT '',
    PRIMARY KEY (watcher_id, scope, owner_key)
);

CREATE TABLE watch_dependencies (
    watcher_id  TEXT NOT NULL REFERENCES planscript_watchers(id) ON DELETE CASCADE,
    scope       TEXT NOT NULL CHECK (scope IN ('day', 'week')),
    owner_key   TEXT NOT NULL,
    dependency_date TEXT NOT NULL,
    PRIMARY KEY (watcher_id, scope, owner_key, dependency_date)
);

CREATE INDEX idx_watch_dependencies_date ON watch_dependencies(dependency_date);
CREATE INDEX idx_watch_indicators_owner ON watch_indicators(scope, owner_key);
