import { json, bad, readJson, handle } from '../_lib/http.js';
import { getSetting, listGames, publicPlayer, nowIso } from '../_lib/db.js';
import { playerByToken } from '../_lib/players.js';
import { POLL_DAYS, validateVote, finalistIds, tallyVotes, pollClosed } from '../_lib/poll.js';
import { seriesOf } from '../_lib/tournament.js';

// Finals night poll. Only reachable with a personal token; names only, never emails.
async function payload(db, me, players) {
  const [games, closesAt, { results: rows }] = await Promise.all([
    listGames(db), getSetting(db, 'poll_closes_at'), db.prepare('SELECT player_id, day FROM poll_votes ORDER BY created_at, player_id').all(),
  ]);
  const finalists = finalistIds(games);
  // The semi series, so the page can name the final and bronze match once decided.
  const semis = [seriesOf(games, 2, 0), seriesOf(games, 2, 1)].filter(Boolean).map((s) => ({ a: s.a, b: s.b, winner: s.winner, loser: s.loser }));
  const { votes, allFinalists, total } = tallyVotes(rows, finalists);
  return json({
    player: publicPlayer(me), days: POLL_DAYS, closesAt, closed: pollClosed(closesAt),
    mine: rows.filter((r) => r.player_id === me.id).map((r) => r.day),
    finalists, semis, allFinalists, votes, total,
    players: players.map((p) => ({ ...publicPlayer(p), finalist: finalists.includes(p.id) })),
  });
}

export const onRequestGet = handle(async ({ request, env }) => {
  const t = new URL(request.url).searchParams.get('t');
  const { me, players } = await playerByToken(env.DB, t);
  return payload(env.DB, me, players);
});

// POST { t, days: [...] } replaces the player's votes.
export const onRequestPost = handle(async ({ request, env }) => {
  const db = env.DB;
  const body = await readJson(request);
  const { me, players } = await playerByToken(db, body.t);
  const days = validateVote(body.days);
  if (pollClosed(await getSetting(db, 'poll_closes_at'))) throw bad('The poll has closed', 409);
  const now = nowIso();
  await db.batch([
    db.prepare('DELETE FROM poll_votes WHERE player_id = ?').bind(me.id),
    ...days.map((d) => db.prepare('INSERT INTO poll_votes (player_id, day, created_at) VALUES (?, ?, ?)').bind(me.id, d, now)),
  ]);
  return payload(db, me, players);
});
