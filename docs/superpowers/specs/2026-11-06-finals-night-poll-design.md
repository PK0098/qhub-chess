# Finals night poll — Design Spec

Date: 2026-11-06. Owner: Pouya. Status: decisions taken in chat.

## Goal

Both semi-finals are played (one leg still waits for a confirm click). The Final and the 3rd-place match are to be played on **one evening in the week of Monday 9 to Friday 13 November**, as a small gathering: doors at 20:00, both matches first (about an hour), then a 1-minute bullet round robin for everyone who comes, extra boards for casual games, bring your own drinks and snacks.

Every registered player gets an email with a personal link to a poll page where they tick **up to two** days that work for them. The chosen day must work for all four finalists; the other votes are preference. The tally is live on the page.

## Non-goals

Choosing the day automatically (Pouya reads the tally and announces). Time-of-day options (fixed 20:00). Organising the bullet tournament on the site. Linking the poll from the public site. Anything after the poll closes other than showing the final tally.

## Rules

- **Finalists** = the four players in the round-2 (semi-final) games. Both winners play the Final, both losers the 3rd-place match, so the unconfirmed leg does not matter.
- **Days**: `2026-11-09` to `2026-11-13`, fixed list in code.
- **Vote**: a player saves a set of 0–2 days. Saving replaces their previous set. Any change is allowed until the poll closes.
- **Close**: `settings.poll_closes_at` (ISO). Default written by the migration: `2026-11-08T20:00:00+04:00` (Sunday 20:00 Yerevan). After it, POST returns 409 and the page is read-only.
- **Visibility**: every voter's name is visible per day; finalists are marked. Never emails or tokens.
- **Identity**: the player's existing `token` (same as the game page). No name picking.

## Data model

`migrations/0003-poll.sql` (also appended to `schema.sql`):

```sql
CREATE TABLE IF NOT EXISTS poll_votes (
  player_id INTEGER NOT NULL,
  day TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (player_id, day)
);
INSERT OR IGNORE INTO settings (key, value) VALUES ('poll_closes_at', '2026-11-08T20:00:00+04:00');
```

## API

`GET /api/poll?t=<token>` →
```json
{
  "player": { "id", "code", "name", "company", "hasPhoto" },
  "days": ["2026-11-09", "..."],
  "closesAt": "2026-11-08T20:00:00+04:00",
  "closed": false,
  "mine": ["2026-11-10"],
  "finalists": [ids],
  "players": [ { "id", "name", "code", "hasPhoto", "finalist": true } ],
  "votes": { "2026-11-09": [ids], ... },
  "total": 7
}
```
`total` = number of distinct players who voted. Unknown token → 404 (same as `/api/me`).

`POST /api/poll` body `{ t, days: [...] }`. Validates: known token, each day in the list, no duplicates, length ≤ 2. Closed → 409. Replaces the player's rows in one batch (delete + inserts). Returns the same payload as GET.

## Page `web/poll.html` + `web/poll.js`

Not linked from anywhere, `noindex`, listed in `web/_headers` as no-cache. Reads `?t=`. Same header/footer and tokens as `game.html`.

Content, top to bottom:
1. Title "Finals night." and a short description block of the evening (20:00, matches, bullet round robin, open boards, drinks and snacks).
2. "Which evenings work for you, {first name}? Pick up to two." Five day cards (Mon 9 … Fri 13 Nov). Tapping toggles; a third pick is refused with an inline note. Each card shows its count and the initials of voters (avatar style from the site). A card where all four finalists voted carries a "Works for all finalists" badge.
3. A Save button (disabled until the selection differs from the saved one), with the existing loading/error pattern from `game.js`. After the close time the cards are not tappable and the Save row is replaced by "The poll closed on Sunday 8 November."
4. Live tally: a bar per day, width proportional to votes, with the voter names listed. A toggle "Everyone / Finalists only": in finalists mode the bars count only the four finalists and each day lists which finalists ticked it. Finalists are marked with ♛ in both modes.
5. Footer line with the closing time.

The page refetches after every save; no polling timer (reload shows the latest).

## Email

New entry `finalsPoll` in `functions/_lib/broadcasts.js` and template `templates.finalsPoll` in `mail.js`: subject "Finals night: pick your evening ♛", the evening description, the four finalists and the two matches (Final: semi winners if decided, otherwise "winners of SF1 and SF2"; 3rd place likewise), the personal poll link as the button, the close time, and the usual tone. `prepare` refuses with 409 unless the semi-final games exist. Sent from the existing admin dropdown.

## Local testing

`npm run seed`, close registration from `/admin`, set group results from the admin Games table until the semis exist, then open `/poll?t=tok-05`, vote from two or three tokens, send the email from `/admin` and read it in the Outbox. The migration is applied locally with `npx wrangler d1 execute anahit-chess --local --file migrations/0003-poll.sql` and remotely with `--remote` before deploy.

## Tests

`tests/poll.test.js` on a pure helper `tallyVotes(rows, finalistIds, days)` in `functions/_lib/poll.js`: per-day ids, total distinct voters, and `allFinalists` flag per day. Validation of the POST body (`validateVote(days, allowed)`) tested for the 3-picks and unknown-day cases.

## Builder's calls

Left to the builder: exact copy of the description block, bar styling, how initials are stacked on a card, text version of the email.
