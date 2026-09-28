# Q hub Friendly Chess Tournament

A low-maintenance tournament site for the Q hub coworking space (formerly Anahit) in Yerevan. People register from a QR flyer, the site draws two random groups, pairs players, emails them, lets them report results, and shows live group tables and a knockout bracket. The organizer presses one button to close registration and only gets involved in disputes.

| What | Where |
|---|---|
| Live site | https://qhub-chess.pages.dev (the old anahit-chess.pages.dev and chess.pouyakarimi.com redirect here) |
| Organizer page | https://qhub-chess.pages.dev/admin (needs the admin key) |
| Personal homepage | https://pouyakarimi.com |
| Source | https://github.com/PK0098/qhub-chess |
| Design mocks | Claude Design project "Chess Tournament" (files `Chess Tournament Registration.dc.html`, `Chess Tournament.dc.html`, `Chess Tournament Flyer.dc.html`, `Pouya Homepage.dc.html`) |
| Spec and plan | `docs/superpowers/specs/2026-09-21-anahit-chess-design.md`, `docs/superpowers/plans/2026-09-21-anahit-chess.md` |

## How the tournament works

1. **Registration.** Form on the landing page: name, company (or "Freelance"), email, optional photo (camera or file, shrunk to 240 px in the browser). Duplicate emails are refused. Player gets a welcome email with a personal link.
2. **Close.** Organizer presses "Close registration & create pairings" on `/admin` (needs 4+ players). Players are drawn at random into Group Petrosian (`grp` = `P`) and Group Aronian (`grp` = `A`), seed stored in settings, each group is a single round robin (3/1/0). Every player gets one pairing email with all group opponents, their emails, and a report link per game. When both groups are complete the site creates the semi-finals (P1 vs A2, A1 vs P2) and emails the four; when both semis are confirmed it creates the final and the third-place game. No draws from the semis on (replay until decided). Group ties: points, head-to-head, wins, then the stored lots order.
3. **Play.** Players arrange games themselves by replying to the pairing email. Either player reports won/lost/draw from their link. The opponent gets a confirm-or-dispute email. Silence for `CONFIRM_HOURS` (48) counts as confirmed. Disputes email the organizer and show on `/admin`, where any result can be set.
4. **Knockout rounds** advance automatically when a round is fully confirmed. The final sets a champion and switches the site to a "done" state.

Phase never changes by clock. The countdown is informational; the organizer decides when to close.

## Architecture

- **Frontend**: plain HTML/CSS/JS in `web/`, no build step. One page (`index.html`) switches sections by phase via `data-only="registration|play"` attributes. `game.html` is the player's page (report/confirm), `admin.html` the organizer page. Asset links carry `?v=` versions; `web/_headers` makes HTML no-cache.
- **API**: Cloudflare Pages Functions in `functions/api/**` (Workers runtime). Pure tournament logic in `functions/_lib/tournament.js` (group split, pairings, tiebreak table, semis/final, validation), email in `functions/_lib/mail.js`, auto-confirm and stage advancement in `functions/_lib/sweep.js`.
- **Database**: Cloudflare D1 (SQLite) `anahit-chess`, bound as `DB`. Schema in `schema.sql`: `settings`, `players`, `games`. Results are stored from p1's perspective: `1-0`, `0-1`, `1/2`.
- **Email**: Resend REST API. Sender `Q hub Chess <chess@pouyakarimi.com>`. Domain `pouyakarimi.com` verified in Resend (region eu-west-1). Cloudflare Email Routing forwards `chess@pouyakarimi.com` to the organizer's Gmail.
- **Homepage**: `homepage/` is a separate Cloudflare Worker with static assets, custom domains `pouyakarimi.com` and `www`.

### API

Public: `GET /api/state`, `GET /api/photo/:id`, `POST /api/register`, `GET /api/me?t=`, `POST /api/report`, `POST /api/confirm`.
Admin (`Authorization: Bearer <ADMIN_KEY>`): `GET /api/admin/overview`, `POST /api/admin/close`, `POST /api/admin/resolve`, `POST /api/admin/remove`, `POST /api/admin/test-email`.
Emails and tokens never leave the server in public responses.

### Configuration

`wrangler.toml` `[vars]`: `SITE_URL`, `MAIL_FROM`, `ADMIN_EMAIL`, `CONFIRM_HOURS`, `CLOSE_DATE`, `START_DATE`.
Secrets on the Pages project: `RESEND_API_KEY`, `ADMIN_KEY`. Set with `npx wrangler pages secret put NAME --project-name qhub-chess`.

## Working on another machine

Prerequisites: Node 20+, Git, and either the `gh` CLI or plain Git access to the repo.

```bash
git clone https://github.com/PK0098/qhub-chess.git
cd qhub-chess
npm install
npx wrangler login          # opens the browser; use the Cloudflare account that owns the project
npm test                    # 11 unit tests on the tournament logic
```

Local development needs a `.dev.vars` file (git-ignored) in the repo root:

```
ADMIN_KEY=anything-local
RESEND_API_KEY=re_dummy    # a fake key means no real emails are sent locally
```

Then:

```bash
npx wrangler d1 execute anahit-chess --local --file schema.sql   # once, creates the local DB
npx wrangler pages dev --port 8788                               # http://localhost:8788
```

Local end-to-end run with mock data (no real emails: without `RESEND_API_KEY` in `.dev.vars` every email is captured in the `outbox` table and shown on `/admin`):

1. `npm run seed` resets the local D1 with 12 players (tokens `tok-01`..`tok-12`, player pages at `/game?t=tok-05`).
2. `npx wrangler pages dev --port 8788`, open `http://localhost:8788/admin`.
3. "Announce format change" sends the one-off email to all 12; read them in the Outbox box.
4. "Close registration" draws the groups and sends the pairing emails; the site shows two tables.
5. Report and confirm from two player pages, or set results from the admin Games table. Semis, final, third place and the champion email follow automatically.

Existing databases need `migrations/0002-groups.sql` once (`npx wrangler d1 execute anahit-chess --remote --file migrations/0002-groups.sql`).

## Deploying

```bash
npx wrangler pages deploy --project-name qhub-chess --branch main   # tournament site + API
cd homepage && npx wrangler deploy                                      # personal homepage
```

Bump the `?v=` query on the `<script>`/`<link>` tags in `web/*.html` when you change JS or CSS, so browsers pick up the new files.

Schema changes go to production with `npx wrangler d1 execute anahit-chess --remote --file schema.sql`.

## Operations

- **Admin key**: one shared secret, not stored in the repo. It lives in the Cloudflare project secrets and in the organizer's password manager or environment variable. Rotate with `wrangler pages secret put ADMIN_KEY`.
- **Reset to a clean slate** (destroys all players and games):
  ```bash
  npx wrangler d1 execute anahit-chess --remote --command "DELETE FROM games; DELETE FROM players; DELETE FROM settings; INSERT INTO settings (key, value) VALUES ('phase','registration')"
  ```
- **Logs**: `npx wrangler pages deployment tail --project-name qhub-chess`.
- **Email deliverability**: the sending domain is new, so early emails may land in spam. Marking one "Not spam" in Gmail helps. DMARC is `p=none`.

## Cloudflare account layout

Account: personal Cloudflare account (Gmail login), ID `6f70f92c2dea901344b965d8ea458c63`.

- Pages project `qhub-chess` with D1 binding `DB` and the two secrets (live site).
- Pages project `anahit-chess` (old name) now only serves a `_redirects` file sending everything to qhub-chess.pages.dev; custom domain `chess.pouyakarimi.com` is still attached to it and redirects too.
- D1 database `anahit-chess`, ID `5595d5e9-9445-49a7-b4c5-c2bf8fc27639`.
- Worker `pouyakarimi` (homepage), custom domains `pouyakarimi.com`, `www.pouyakarimi.com`.
- Zone `pouyakarimi.com` (bought via Cloudflare Registrar): Resend DNS records (`resend._domainkey` TXT, `rsend` and `send` CNAMEs, `_dmarc` TXT), Email Routing MX/SPF/DKIM records, routing rule `chess@` to Gmail.

Gotchas seen so far: `wrangler pages project create` for new projects now delegates to Workers (use a Worker with `[assets]` instead, as `homepage/` does). In `wrangler.toml`, top-level keys like `routes` must come before any `[section]`. If wrangler complains about a project named "hess tourney", delete a stray `wrangler.jsonc`.

## Analytics

Cloudflare Web Analytics (cookie-free, no consent banner). `pouyakarimi.com` uses Cloudflare's automatic injection; `qhub-chess.pages.dev` has the beacon snippet at the bottom of `web/index.html` and `web/game.html` (not on `/admin`). Dashboard: Cloudflare, Analytics, Web analytics.

The flyer's QR code should point to `https://qhub-chess.pages.dev/flyer`. That path (`functions/flyer.js`) increments `settings.flyer_scans` in D1 and redirects to `/`. The count shows on the organizer page.

## Known gaps

- No accounts; personal links are the only identity. Anyone with a link can act as that player.
- Single elimination only, no double elimination or waitlist.
- Players cannot edit their card after registering; the organizer can remove them during registration.
- Replies from Gmail to forwarded `chess@` mail are sent from the Gmail address, not from `chess@`.
