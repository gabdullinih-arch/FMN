CREATE TABLE week_quantum (
    monday_date TEXT PRIMARY KEY,
    cell_min INTEGER NOT NULL CHECK (cell_min IN (5, 10, 15, 30, 60))
);
