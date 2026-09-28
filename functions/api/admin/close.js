import { json, bad, handle, requireAdmin } from '../../_lib/http.js';
import { getSetting, setSetting, listPlayers, listGames } from '../../_lib/db.js';
import { splitGroups, groupPairings } from '../../_lib/tournament.js';
import { emailPairings } from '../../_lib/sweep.js';

export const onRequestPost = handle(async ({ request, env }) => {
  requireAdmin(request, env);
  const db = env.DB;
  if ((await getSetting(db, 'phase')) !== 'registration') throw bad('Registration is already closed', 409);
  const players = await listPlayers(db);
  if (players.length < 4) throw bad('Need at least 4 players for two groups', 400);

  const seed = crypto.getRandomValues(new Uint32Array(1))[0];
  const { lots, A, B } = splitGroups(players.map((p) => p.id), seed);
  const games = groupPairings(A, B);

  const setGrp = db.prepare('UPDATE players SET grp = ? WHERE id = ?');
  const ins = db.prepare('INSERT INTO games (round, slot, p1, p2, status) VALUES (?, ?, ?, ?, ?)');
  await db.batch([
    ...A.map((id) => setGrp.bind('A', id)),
    ...B.map((id) => setGrp.bind('B', id)),
    ...games.map((g) => ins.bind(g.round, g.slot, g.p1, g.p2, 'pending')),
  ]);
  await setSetting(db, 'format', 'groups');
  await setSetting(db, 'seed', seed);
  await setSetting(db, 'lots', JSON.stringify(lots));
  await setSetting(db, 'phase', 'play');

  const created = await listGames(db);
  await emailPairings(db, env, created, 'group');
  return json({ ok: true, format: 'groups', players: players.length, groups: { A: A.length, B: B.length }, games: created.length });
});
