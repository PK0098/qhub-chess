# Groups + Knockout Format Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the headcount-decided format with two random round-robin groups, crossover semis, a final and a third-place game, end to end from close to emails, testable locally with mock data and a captured outbox.

**Architecture:** Pure pairing/table logic lives in `functions/_lib/tournament.js` and is unit-tested. Side effects (DB writes, emails) live in `close.js` and `sweep.js`. The API returns ordered group tables so the frontend only renders. `sendMail` writes to an `outbox` table when no Resend key exists.

**Tech Stack:** Cloudflare Pages Functions, D1 (SQLite), plain HTML/JS, `node --test`.

**Spec:** `docs/superpowers/specs/2026-09-28-groups-format-design.md`

## Global Constraints

- Branch `groups-format`. Nothing deployed, nothing pushed, no email reaches real registrants.
- Round numbering: 1 group, 2 semis (slot 0 A1–B2, slot 1 B1–A2), 3 final (slot 0) and third place (slot 1).
- Tiebreak: points, head-to-head among tied, wins, then `lots` order.
- No `1/2` result for `round >= 2` anywhere (report, resolve, UI).
- `format` setting value is `groups`. `KNOCKOUT_FROM` removed everywhere.

---

### Task 1: Pure logic + tests

**Files:** Modify `functions/_lib/tournament.js`, rewrite `tests/tournament.test.js`.

**Produces:** `splitGroups(ids, seed) -> {lots, A, B}`, `groupPairings(A, B) -> games[{round:1, slot, p1, p2}]`, `groupTable(ids, games, lots) -> rows[{id, played, w, d, l, points, form}]`, `semiPairings(tableA, tableB) -> games[round 2]`, `finalPairings(semis) -> games[round 3] | null`, `winnerOf(game)`, `toP1Result`, `validateRegistration`. Removes `rrPairings`, `koBracket`, `koNextRound`, `standings`, `decideFormat`.

- [ ] Write tests: split sizes (ceil/floor) and determinism by seed; pairings count `k(k-1)/2` per group with no cross-group pairs and running slots; table: points first, head-to-head beats wins, three-way head-to-head mini table, wins, then lots; semis crossover; final/third from semis; null when a semi is unconfirmed.
- [ ] Run `npm test`, expect failures on missing exports.
- [ ] Implement with mulberry32 PRNG; run tests to green.
- [ ] Commit `Tournament logic: groups, tiebreak table, semis and final`.

### Task 2: Schema, migration, mail outbox, seed script

**Files:** Modify `schema.sql`, `functions/_lib/mail.js` (`sendMail`), `package.json`, `.claude/launch.json`. Create `migrations/0002-groups.sql`, `scripts/seed-local.sql`.

- [ ] `schema.sql`: add `grp TEXT` to players, add `outbox` table. Migration file with `ALTER TABLE players ADD COLUMN grp TEXT;` and the outbox `CREATE TABLE IF NOT EXISTS`.
- [ ] `sendMail(env, msg, db)`: if `!env.RESEND_API_KEY` and `db` given, insert into outbox and return `{ok:true, outbox:true}`. All call sites pass `db`.
- [ ] Seed: `DELETE FROM games; DELETE FROM players; DELETE FROM outbox; DELETE FROM settings; INSERT phase registration;` plus 12 players with tokens `tok-01..tok-12`.
- [ ] `npm run seed` = `wrangler d1 execute anahit-chess --local --file schema.sql && ... --file migrations/0002-groups.sql && ... --file scripts/seed-local.sql` (ALTER fails if column exists after schema.sql already has it; so schema.sql for fresh DB includes grp and the migration is only for existing DBs. The seed script runs schema.sql + seed only; migration is a manual remote step.)
- [ ] launch.json `api` config: `npx wrangler pages dev --port 8788`.
- [ ] Commit.

### Task 3: Server flow

**Files:** Modify `functions/api/admin/close.js`, `functions/_lib/sweep.js`, `functions/api/state.js`, `functions/api/me.js`, `functions/api/report.js`, `functions/api/admin/resolve.js`, `functions/api/admin/overview.js`, `functions/_lib/db.js`, `wrangler.toml`. Create `functions/api/admin/announce.js`.

- [ ] `db.js`: `listPlayers` selects `grp`; `publicPlayer` includes `grp`; `publicGame` unchanged.
- [ ] `close.js`: min 4; seed = random uint32; `splitGroups`; `UPDATE players SET grp`; insert round-1 games pending; settings `format=groups, seed, lots, phase=play`; `emailPairings(db, env, games, 'group')`.
- [ ] `sweep.js`: `advanceGroups` per spec steps 1–4; `emailPairings(db, env, games, stage)` where stage in `group|semi|final|third`; for round 3 pass per-game stage.
- [ ] `state.js`: add `groups: {A, B}` via `groupTable`; drop `knockoutFrom`.
- [ ] `me.js`: add `slot` to games.
- [ ] `report.js`, `resolve.js`: reject `1/2` when `round >= 2`.
- [ ] `announce.js`: admin; refuse if `announced_at` set unless `force`; send `templates.formatChange` to all; set `announced_at`; return `{sent}`.
- [ ] `overview.js`: add `outbox` (latest 50), drop `KNOCKOUT_FROM`. `wrangler.toml`: drop `KNOCKOUT_FROM`.
- [ ] `npm test`; commit.

### Task 4: Email templates

**Files:** Modify `functions/_lib/mail.js`.

- [ ] `welcome` format paragraph; `pairings(env, {player, stage, grp, games})` with subjects per stage; `formatChange(env, {player})`; drop `isNextRound`/`format` args and bye rows.
- [ ] Commit.

### Task 5: Frontend

**Files:** Modify `web/index.html`, `web/app.js`, `web/game.js`, `web/admin.html`, `web/admin.js`, `web/data.js`, `web/styles.css` (only if a class is needed), `README.md`.

- [ ] Registration copy and stat; play rules copy; two group tables; fixed bracket 2+2 with third-place card; hero label.
- [ ] `game.js` round labels and draw button only for round 1.
- [ ] Admin: format/groups in status, Announce button, resolve select without ½ for round ≥ 2, Outbox box with iframe preview.
- [ ] `data.js` mock in the new shape.
- [ ] README: format description, local E2E steps, remove KNOCKOUT_FROM.
- [ ] Commit.

### Task 6: Local E2E verification

- [ ] `npm run seed`; start `api` preview; admin: Announce → outbox shows 12 emails; Close → 12 pairing emails, group tables rendered; report+confirm via two player links; resolve remaining group games; semis created and emailed; resolve semis; final + third created; resolve final → champion email; resolve third → phase done.
- [ ] Screenshot the play page and admin outbox as proof. Commit any fixes.
