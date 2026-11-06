CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS players (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  company TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  photo TEXT,
  token TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  grp TEXT
);
CREATE TABLE IF NOT EXISTS games (
  id INTEGER PRIMARY KEY,
  round INTEGER NOT NULL,
  slot INTEGER NOT NULL,
  p1 INTEGER NOT NULL,
  p2 INTEGER,
  result TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  reported_by INTEGER,
  reported_at TEXT,
  confirmed_at TEXT
);
-- Dev-only: emails are captured here when RESEND_API_KEY is not set.
CREATE TABLE IF NOT EXISTS outbox (
  id INTEGER PRIMARY KEY,
  to_addr TEXT NOT NULL,
  subject TEXT NOT NULL,
  html TEXT NOT NULL,
  text TEXT,
  created_at TEXT NOT NULL
);
INSERT OR IGNORE INTO settings (key, value) VALUES ('phase', 'registration');
-- Finals night poll: up to two evenings per player.
CREATE TABLE IF NOT EXISTS poll_votes (
  player_id INTEGER NOT NULL,
  day TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (player_id, day)
);
INSERT OR IGNORE INTO settings (key, value) VALUES ('poll_closes_at', '2026-11-08T20:00:00+04:00');
