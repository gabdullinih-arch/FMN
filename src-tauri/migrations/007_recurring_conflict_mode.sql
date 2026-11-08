ALTER TABLE recurring_rules
ADD COLUMN conflict_mode TEXT NOT NULL DEFAULT 'templateWins';
