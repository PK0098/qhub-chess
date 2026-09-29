import { groupTable, semiPairings, finalPairings, winnerOf } from './tournament.js';
import { getSetting, setSetting, listGames, listPlayers, nowIso } from './db.js';
import { sendMany, templates } from './mail.js';

// Auto-confirm stale reports, then create the next stage (semis, final +
// third place) when the previous one is complete, emailing the players
// involved. Safe to call on every request: every step checks the database
// before inserting.
export async function sweep(db, env) {
  const hours = Number(env.CONFIRM_HOURS || 48);
  const cutoff = new Date(Date.now() - hours * 3600 * 1000).toISOString();
  await db.prepare("UPDATE games SET status = 'confirmed', confirmed_at = ? WHERE status = 'reported' AND reported_at < ?")
    .bind(nowIso(), cutoff).run();

  const format = await getSetting(db, 'format');
  const phase = await getSetting(db, 'phase');
  if (format !== 'groups' || phase !== 'play') return { advanced: [] };
  return advanceGroups(db, env);
}

// Ordered tables for both groups, from the players' grp column.
export async function groupTables(db, players, games) {
  const lots = JSON.parse((await getSetting(db, 'lots')) || '[]');
  const ids = (g) => players.filter((p) => p.grp === g).map((p) => p.id);
  return { P: groupTable(ids('P'), games, lots), A: groupTable(ids('A'), games, lots) };
}

export async function advanceGroups(db, env) {
  const games = await listGames(db);
  const players = await listPlayers(db);
  const round = (r) => games.filter((g) => g.round === r);
  const allConfirmed = (list) => list.length > 0 && list.every((g) => g.status === 'confirmed');
  const ins = db.prepare('INSERT INTO games (round, slot, p1, p2, status) VALUES (?, ?, ?, ?, ?)');

  // 1. Group stage complete → semis.
  if (round(2).length === 0) {
    if (!allConfirmed(round(1))) return { advanced: [] };
    const tables = await groupTables(db, players, games);
    const semis = semiPairings(tables.P, tables.A);
    await db.batch(semis.map((g) => ins.bind(g.round, g.slot, g.p1, g.p2, 'pending')));
    const created = (await listGames(db)).filter((g) => g.round === 2);
    await emailPairings(db, env, created, 'semi');
    return { advanced: created };
  }

  // 2. Semis complete → final and third place.
  if (round(3).length === 0) {
    const next = finalPairings(round(2));
    if (!next) return { advanced: [] };
    await db.batch(next.map((g) => ins.bind(g.round, g.slot, g.p1, g.p2, 'pending')));
    const created = (await listGames(db)).filter((g) => g.round === 3);
    await emailPairings(db, env, created.filter((g) => g.slot === 0), 'final');
    await emailPairings(db, env, created.filter((g) => g.slot === 1), 'third');
    return { advanced: created };
  }

  // 3. Final decided → champion. 4. Both round-3 games decided → done.
  const final = round(3).find((g) => g.slot === 0);
  const champion = winnerOf(final);
  if (champion && !(await getSetting(db, 'champion'))) {
    await setSetting(db, 'champion', champion);
    const champ = players.find((p) => p.id === champion);
    const t = templates.champion(env, { champion: champ });
    await sendMany(env, players.map((p) => ({ to: p.email, ...t })));
  }
  if (allConfirmed(round(3))) await setSetting(db, 'phase', 'done');
  return { advanced: [] };
}

// One email per player listing their games in `games`.
// stage: 'group' | 'semi' | 'final' | 'third'.
export async function emailPairings(db, env, games, stage) {
  const players = await listPlayers(db);
  const byId = new Map(players.map((p) => [p.id, p]));
  const perPlayer = new Map();
  for (const g of games) {
    for (const [me, other] of [[g.p1, g.p2], [g.p2, g.p1]]) {
      const opp = byId.get(other);
      if (!perPlayer.has(me)) perPlayer.set(me, []);
      perPlayer.get(me).push({ id: g.id, opponent: { name: opp.name, company: opp.company, email: opp.email } });
    }
  }
  const items = [...perPlayer.entries()].map(([id, list]) => {
    const player = byId.get(id);
    return player ? { to: player.email, ...templates.pairings(env, { player, stage, games: list }) } : null;
  }).filter(Boolean);
  return sendMany(env, items);
}
