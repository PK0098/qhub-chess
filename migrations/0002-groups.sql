-- Groups + knockout format (2026-09-28). Apply once to an existing database.
ALTER TABLE players ADD COLUMN grp TEXT;
CREATE TABLE IF NOT EXISTS outbox (
  id INTEGER PRIMARY KEY,
  to_addr TEXT NOT NULL,
  subject TEXT NOT NULL,
  html TEXT NOT NULL,
  text TEXT,
  created_at TEXT NOT NULL
);
