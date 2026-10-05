// Renders the progress-update email against the live public state. Sends nothing.
// Usage: node scripts/preview-progress.mjs [playerId]   -> email-previews/progress-<id>.html
import { writeFileSync, mkdirSync } from 'node:fs';
import { templates } from '../functions/_lib/mail.js';
import { progressStats, playerProgress } from '../functions/_lib/progress.js';

const SITE = 'https://qhub-chess.pages.dev';
const env = { SITE_URL: SITE, CONFIRM_HOURS: '48', START_DATE: '2026-10-01' };
const s = await (await fetch(`${SITE}/api/state`)).json();
const id = Number(process.argv[2] || 5); // default: Anna, a player on 0 games
const p = s.players.find((x) => x.id === id);
const stats = progressStats(env, s.players, s.games);
const pp = playerProgress(s.players, s.games, id);
const remaining = pp.remaining.map((o) => ({ ...o, email: 'their-email@example.com' }));
const out = templates.progress(env, { player: { ...p, token: 'PREVIEW-TOKEN' }, stats, ...pp, remaining });
mkdirSync('email-previews', { recursive: true });
writeFileSync(`email-previews/progress-${id}.html`, out.html);
console.log(out.subject, stats);
