-- Finals night poll (2026-11-06). Apply once to an existing database.
CREATE TABLE IF NOT EXISTS poll_votes (
  player_id INTEGER NOT NULL,
  day TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (player_id, day)
);
INSERT OR IGNORE INTO settings (key, value) VALUES ('poll_closes_at', '2026-11-08T20:00:00+04:00');
