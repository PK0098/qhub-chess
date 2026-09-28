# Groups + knockout format — Design Spec

Date: 2026-09-28. Owner: Pouya. Status: decisions taken in chat (tiebreak order, no draws in knockout, third-place game, announcement via admin button). Supersedes the format section of `2026-09-21-anahit-chess-design.md`.

## Goal

Replace the headcount-decided format (round robin or knockout) with one fixed format, regardless of how many people register:

1. Players are split at random into **group A** and **group B**.
2. Each group is a single round robin (everyone in the group plays everyone once, 3/1/0 points).
3. The top two of each group go to the **semi-finals**: A1 vs B2 and B1 vs A2.
4. The two semi winners play the **final**; the two semi losers play the **third-place game**, in parallel.

Registration is already open with 12 people, so the change must be clean: nothing is deployed until Pouya says so, current registrants get a one-off announcement email, and everything is testable locally end to end with mock data, including every email.

## Non-goals

Keeping the old round robin / knockout code paths alongside (they are removed). Playoff games for ties. Multi-game semis or finals. Balancing groups by company.

## Rules (the truth the code implements)

- **Minimum players:** 4. Close is refused below that.
- **Group split:** shuffle all player ids with a seeded PRNG (mulberry32; the 32-bit seed is drawn once at close and stored in `settings.seed`). The first `ceil(n/2)` of the shuffled list are group A, the rest group B. The shuffled order is stored as `settings.lots` (JSON array of ids) and is also the drawing-of-lots order for tiebreaks.
- **Group games:** every pair inside a group, `round = 1`. Slots run 0.. across A then B. No byes exist in this format.
- **Group table order:** points (3/1/0) desc, then head-to-head points among exactly the tied players, then wins desc, then position in `lots` (earlier wins). This ordering is computed **only on the server** and returned by the API; the frontend never re-derives it, so what the page shows is what advances.
- **Semi-finals (`round = 2`):** created automatically once every round-1 game is confirmed. Slot 0: A1 (p1) vs B2 (p2). Slot 1: B1 vs A2.
- **Final and third place (`round = 3`):** created automatically once both semis are confirmed. Slot 0: winner of semi 0 vs winner of semi 1 (the final). Slot 1: the two losers (third place).
- **No draws from round 2 on.** The report page hides the draw button, the report and admin resolve endpoints reject `1/2` for `round >= 2`, and the emails say: a drawn game is replayed until someone wins, then report that result.
- **Champion:** when the final (round 3, slot 0) is confirmed, `settings.champion` is set and the champion email goes to everyone. When both round-3 games are confirmed, `settings.phase = 'done'`.
- Auto-confirm after `CONFIRM_HOURS` and the dispute flow are unchanged.

## Data model changes

`schema.sql` (fresh installs) and a new `migrations/0002-groups.sql` (applied to the existing local and, at deploy time, remote database):

```sql
ALTER TABLE players ADD COLUMN grp TEXT;              -- 'A' | 'B', null until close
CREATE TABLE IF NOT EXISTS outbox (                   -- dev-only mail capture, see Local testing
  id INTEGER PRIMARY KEY, to_addr TEXT NOT NULL, subject TEXT NOT NULL,
  html TEXT NOT NULL, text TEXT, created_at TEXT NOT NULL
);
```

Settings: `format` becomes `'groups'` at close. New keys `seed`, `lots`, `announced_at`. `KNOCKOUT_FROM` is removed from `wrangler.toml`, the state and overview responses, and the README.

## Pure logic (`functions/_lib/tournament.js`, unit-tested)

- `splitGroups(ids, seed)` → `{ lots, A, B }`. Deterministic for a given seed. Sizes `ceil(n/2)` / `floor(n/2)`.
- `groupPairings(A, B)` → round-1 games with running slots.
- `groupTable(playerIds, games, lots)` → ordered rows `{ id, played, w, d, l, points, form }` using the tiebreak order above. Replaces `standings()`.
- `semiPairings(tableA, tableB)` → the two round-2 games. `finalPairings(semis)` → the two round-3 games, or null if a semi is not yet decided.
- `winnerOf(game)` stays (bye branch removed). `rrPairings`, `koBracket`, `koNextRound`, `decideFormat` are deleted along with their tests.

## Server flow

- **`POST /api/admin/close`:** refuse below 4 players; draw seed; split; write `players.grp`; insert round-1 games; set `format = groups`, `seed`, `lots`, `phase = play`; email pairings.
- **`sweep()`** (already called on every state, me, confirm and resolve request): after auto-confirm, if `format = groups` and `phase = play`, run `advanceGroups()`:
  1. No round-2 games and all round-1 games confirmed → insert semis, email the four players (`stage: 'semi'`).
  2. Round 2 exists, no round 3, both semis confirmed → insert final and third place, email the four (`stage: 'final'` or `'third'`).
  3. Final confirmed and no `champion` yet → set champion, send champion email to everyone.
  4. Both round-3 games confirmed → `phase = done`.
  Each step is idempotent because it checks the database before inserting.
- **`GET /api/state`** adds `groups: { A: [rows], B: [rows] }` (rows as returned by `groupTable`, ids only, the frontend joins names) and `players[].grp`. `knockoutFrom` is removed.
- **`GET /api/me`** adds `grp` on the player and each game's `round` is already there; `canReport` unchanged.
- **`POST /api/report`** and **`POST /api/admin/resolve`:** reject `1/2` when `game.round >= 2` with the message "No draws in the knockout: play again until someone wins".
- **`POST /api/admin/announce`** (new): admin-only, sends the format-change email to every registered player, sets `settings.announced_at`. Returns the count sent. If `announced_at` is already set the endpoint refuses unless the body has `force: true`.
- **`GET /api/admin/overview`** adds `outbox` (latest 50 rows, newest first) and drops `KNOCKOUT_FROM`.

## Emails (`functions/_lib/mail.js`)

- **welcome:** format paragraph becomes: two random groups, everyone in your group once, top two into the semis, then a final. One pairing email once registration closes.
- **pairings (round 1):** title "Pairings are out. You're in group A." Intro explains the group stage and that the top two advance. Lists every group opponent with email and a report link. Same how-to and reporting paragraphs as today.
- **next round** (replaces `isNextRound` wording): `stage` is `semi`, `final` or `third`. Subjects: "Semi-final: your opponent", "The final: your opponent", "Third-place game: your opponent". Body names the stage, the opponent with email and report link, and the no-draw rule. The third-place email says they lost the semi but bronze is on the table.
- **formatChange** (new, one-off): subject "Format update: two groups, then a knockout". Body: thanks for registering; the format is now fixed regardless of headcount; the four-step summary; nothing to do now, pairings arrive after registration closes on `CLOSE_DATE`; link to the site. Plain, friendly, in the existing house style. Pouya edits the copy before pressing the button if he wants.
- **champion:** unchanged.

## Frontend (`web/`)

- **Registration page:** the "likely format" stat becomes `2` / "groups, then a final". Rule 1 becomes "Format: two groups, then a knockout" with two cards: "Group stage" (random groups, everyone in your group once, 3·1·0, top two advance) and "Semis & final" (A1 vs B2, B1 vs A2, winners play the final, losers play for third, no draws: replay).
- **Play page:** hero format label "2 groups + knockout". The standings section renders two tables (Group A, Group B) from `state.groups`, with the top two rows marked as advancing. The podium is removed. The bracket section always shows: a Semi-finals column with two cards and a Final column with the final card and a third-place card beneath it; cards are TBD until the games exist. Rule 1 in play phase reads "everyone in your group once".
- `web/app.js`: client-side `standings()` is deleted; `renderStandings` takes the server rows; `renderBracket` is rewritten for the fixed 2+2 layout (the generic power-of-two bracket goes).
- **`web/game.js`:** round label: 1 → "Group game", 2 → "Semi-final", 3 → slot 0 "Final" / slot 1 "Third place" (the API adds `slot` to `me` games). Draw button only for round 1.
- **`web/admin.js` / `admin.html`:** remove "Knockout from"; show Format and groups; "Announce format change" button with a sent-at label and confirm dialog; draw option in the resolve select only for round 1; an "Outbox" box that lists captured emails and previews one in an iframe (`srcdoc`), only rendered when the overview returns rows.
- **`web/data.js`:** mock state regenerated for the new shape (players with `grp`, round-1 games, `groups` tables, a few semi/final games) so the GitHub Pages preview still works.

## Local testing with mock data

- `.claude/launch.json` gets an `api` configuration: `npx wrangler pages dev --port 8788` (needs `.dev.vars` with `ADMIN_KEY`; no `RESEND_API_KEY`).
- **Mail capture:** when `RESEND_API_KEY` is absent, `sendMail` inserts the email into `outbox` instead of logging an error. Production has the key, so the table stays empty there. The admin page shows the outbox, so every email in the flow (welcome, announcement, pairings, reported, confirmed, semi, final, third, champion) can be read locally.
- `scripts/seed-local.sql`: resets the local database and inserts 12 mock players with fixed tokens `tok-01`..`tok-12`, so player pages open at `/game?t=tok-05`. `npm run seed` runs `wrangler d1 execute anahit-chess --local --file schema.sql` then the migration and seed.
- E2E script for Pouya (in README): seed, open admin, press Announce, press Close, open outbox, open two player links, report and confirm a game, resolve the rest from admin, watch semis appear, and so on to the champion email.

## Testing

- `tests/tournament.test.js`: group split sizes and determinism; pairing counts; table ordering for each tiebreak level (points, head-to-head between two and among three, wins, lots); semi pairing crossover; final/third pairing; null until semis decided.
- Manual local E2E as above before anything is deployed. The 12 real registrants must not receive anything during this work.

## Rollout (only when Pouya says go)

1. Apply `migrations/0002-groups.sql` to the remote D1.
2. Deploy with `npx wrangler pages deploy --project-name qhub-chess --branch main`.
3. Pouya presses "Announce format change" on `/admin` once.
