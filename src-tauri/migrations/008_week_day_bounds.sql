CREATE TABLE week_day_bounds (
    monday_date TEXT PRIMARY KEY,
    day_start INTEGER CHECK (day_start IS NULL OR (day_start BETWEEN 0 AND 1435 AND day_start % 5 = 0)),
    day_end INTEGER CHECK (day_end IS NULL OR (day_end BETWEEN 5 AND 1440 AND day_end % 5 = 0))
);
