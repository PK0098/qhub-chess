-- Wipe the local database so schema.sql recreates it from scratch.
DROP TABLE IF EXISTS games;
DROP TABLE IF EXISTS players;
DROP TABLE IF EXISTS outbox;
DROP TABLE IF EXISTS settings;
