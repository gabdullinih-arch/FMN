CREATE TABLE week_custom_times (
    monday_date TEXT NOT NULL,
    time_min INTEGER NOT NULL CHECK (time_min BETWEEN 0 AND 1439 AND time_min % 5 = 0),
    PRIMARY KEY (monday_date, time_min)
);
