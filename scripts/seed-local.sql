-- Local mock data: 12 registered players with fixed tokens (open /game?t=tok-05).
DELETE FROM games; DELETE FROM outbox; DELETE FROM players; DELETE FROM settings;
INSERT INTO settings (key, value) VALUES ('phase', 'registration');
INSERT INTO players (name, company, email, photo, token, created_at) VALUES
  ('Ani Petrosyan', 'Q hub', 'ani@example.test', NULL, 'tok-01', '2026-09-22T09:00:00Z'),
  ('Davit Hakobyan', 'Freelance', 'davit@example.test', NULL, 'tok-02', '2026-09-22T09:10:00Z'),
  ('Narek Sargsyan', 'Q hub', 'narek@example.test', NULL, 'tok-03', '2026-09-22T09:20:00Z'),
  ('Lilit Avetisyan', 'Pharmabits', 'lilit@example.test', NULL, 'tok-04', '2026-09-22T09:30:00Z'),
  ('Tigran Grigoryan', 'Q hub', 'tigran@example.test', NULL, 'tok-05', '2026-09-22T09:40:00Z'),
  ('Mariam Karapetyan', 'Freelance', 'mariam@example.test', NULL, 'tok-06', '2026-09-22T09:50:00Z'),
  ('Hayk Mkrtchyan', 'Q hub', 'hayk@example.test', NULL, 'tok-07', '2026-09-23T09:00:00Z'),
  ('Sona Harutyunyan', 'Pharmabits', 'sona@example.test', NULL, 'tok-08', '2026-09-23T09:10:00Z'),
  ('Aram Vardanyan', 'Freelance', 'aram@example.test', NULL, 'tok-09', '2026-09-23T09:20:00Z'),
  ('Anahit Hovhannisyan', 'Q hub', 'anahit@example.test', NULL, 'tok-10', '2026-09-23T09:30:00Z'),
  ('Levon Galstyan', 'Q hub', 'levon@example.test', NULL, 'tok-11', '2026-09-23T09:40:00Z'),
  ('Nare Simonyan', 'Freelance', 'nare@example.test', NULL, 'tok-12', '2026-09-23T09:50:00Z');
